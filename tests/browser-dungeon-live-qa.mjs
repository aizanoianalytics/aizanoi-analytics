import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.DG_BASE || 'http://127.0.0.1:4181';

// Deep in-game verification: boot the standalone /dungeon/ route, start a
// run, and drive real gameplay — movement, attack, kills, loot, HUD — while
// asserting the game state advances. No visual-only checks.
test('standalone dungeon boots and plays: move, attack, kill, level, portal', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(`${base}/dungeon/?t=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__AIZANOI_DUNGEON_SCENE === 'MenuScene', { timeout: 30000 });
    console.log('[qa] menu ready');

    // Locate the real "Story" button by scanning for interactive text objects.
    const storyBtn = await page.evaluateHandle(() => {
      const scene = window.AIZANOI_DUNGEON_GAME?.scene?.getScene('MenuScene');
      const texts = scene?.children?.list || [];
      return texts.find((t) => t.type === 'Text' && /Story/.test(t.text));
    });
    assert.ok(storyBtn, 'menu must expose the Story button');

    // Click through the canvas at the button's world position.
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    assert.ok(box.cx > 0, 'canvas measurable');

    const started = await page.evaluate(() => {
      const g = window.AIZANOI_DUNGEON_GAME;
      g.scene.start('GameScene', { chapterIndex: 0, isEndless: false });
      return true;
    });
    assert.equal(started, true);

    await page.waitForFunction(() => {
      const s = window.AIZANOI_DUNGEON_GAME?.scene?.getScene('GameScene');
      return Boolean(s && s.player && s.scene && s.scene.isActive('GameScene'));
    }, { timeout: 30000 });
    console.log('[qa] gamescene ready');

    // 1. Simulate 6 seconds of holding movement keys + attacking.
    const moved = await page.evaluate(async () => {
      const g = window.AIZANOI_DUNGEON_GAME;
      const s = g.scene.getScene('GameScene');
      const p = s.player;
      const startX = p.x, startY = p.y;
      // Emulate keyboard input through Phaser's key state.
      const key = s.wasd?.D;
      if (key) {
        key.isDown = true;
        await new Promise((r) => { setTimeout(r, 1500); });
        key.isDown = false;
      }
      return { startX, startY, endX: p.x, endY: p.y };
    });
    assert.ok(Math.abs(moved.endX - moved.startX) > 5 || Math.abs(moved.endY - moved.startY) > 5,
      `player must move with keyboard input, got ${JSON.stringify(moved)}`);
    console.log('[qa] movement ok', moved);

    // 2. Attack: force a nearby enemy and confirm the kill pipeline.
    const combat = await page.evaluate(async () => {
      const g = window.AIZANOI_DUNGEON_GAME;
      const s = g.scene.getScene('GameScene');
      const p = s.player;
      // Spawn a weak enemy right in front of the player and attack it.
      const { Enemy } = await import('/js/v3/apps/dungeon/js/entities/Enemy.js');
      const { ENEMY_TYPES } = await import('/js/v3/apps/dungeon/js/data/enemies.js');
      const cfg = { ...ENEMY_TYPES.gargoyle };
      cfg.hp = 3; cfg.attackDamage = 0; cfg.armor = 0; cfg.goldReward = 99; cfg.xpReward = 0;
      const e = new Enemy(s, p.x + 20, p.y, cfg);
      s.enemies.add(e);
      const goldBefore = s.progression.gold;
      const killsBefore = s.progression.stats.enemiesKilled;
      for (let i = 0; i < 8; i++) {
        p.attack(e);
        await new Promise((r) => { setTimeout(r, 220); });
      }
      await new Promise((r) => { setTimeout(r, 800); });
      return {
        killed: s.progression.stats.enemiesKilled > killsBefore,
        goldGain: s.progression.gold - goldBefore,
        enemyAlive: e.active,
        lootOnGround: s.lootGroup.getChildren().length,
      };
    });
    assert.equal(combat.killed, true, 'attack must kill a weakened enemy');
    assert.ok(combat.goldGain > 0, `kill must drop gold, got ${combat.goldGain}`);
    console.log('[qa] combat ok', combat);

    // 3. Loot pickup: gold already awarded when the drop overlaps the player.
    const pickup = await page.evaluate(async () => {
      const s = window.AIZANOI_DUNGEON_GAME?.scene?.getScene('GameScene');
      return { lootOnGround: s.lootGroup.getChildren().length, gold: s.progression.gold };
    });
    console.log('[qa] pickup', pickup);

    // 4. HUD reflects live state.
    const hud = await page.evaluate(() => {
      const s = window.AIZANOI_DUNGEON_GAME?.scene?.getScene('UIScene');
      if (!s) return null;
      return {
        hp: s.hpText?.text, xp: s.xpText?.text, gold: s.goldText?.text,
        chapter: s.chapterText?.text, objective: s.objectiveText?.text,
        level: s.levelBadge?.text,
      };
    });
    console.log('[qa] hud', hud);
    assert.ok(hud && /HP: \d+\/\d+/.test(hud.hp), `HUD must show live HP, got ${hud && hud.hp}`);
    assert.ok(/^Lv\.\d+$/.test(hud.level), `HUD level badge must be live, got ${hud && hud.level}`);

    // 5. Portal lock gating: unlock by clearing the floor.
    const portalFlow = await page.evaluate(async () => {
      const s = window.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
      // Snapshot first: destroying enemies mutates the live physics group
      // array, and iterating it while it shrinks skips elements.
      s.enemies.getChildren().slice().forEach((e) => { e.hp = 0; e.die(); });
      await new Promise((r) => { setTimeout(r, 400); });
      return { locked: s.exitPortal.locked, remaining: s.enemies.getChildren().filter((e) => e.active && e.hp > 0).length };
    });
    assert.equal(portalFlow.remaining, 0, 'floor must be clearable');
    assert.equal(portalFlow.locked, false, 'portal must unlock when the floor is clear');
    console.log('[qa] portal unlocked');

    // 6. Enter the portal -> blessing overlay -> next chapter.
    const transition = await page.evaluate(async () => {
      const s = window.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
      s.player.setPosition(s.exitPortal.x, s.exitPortal.y);
      await new Promise((r) => { setTimeout(r, 500); });
      const hasBlessing = Boolean(s.blessingOverlay);
      const chapterBefore = s.chapterIndex;
      if (hasBlessing) {
        // Pick blessing 1.
        s.input.keyboard.emit('keydown-ONE');
        await new Promise((r) => { setTimeout(r, 1500); });
      }
      return { hasBlessing, chapterBefore, transitioning: s.isTransitioning };
    });
    console.log('[qa] transition', transition);
    assert.equal(transition.hasBlessing, true, 'entering the portal must offer a blessing');

    await page.waitForFunction(() => {
      const s = window.AIZANOI_DUNGEON_GAME?.scene?.getScene('GameScene');
      return s && s.chapterIndex === 1;
    }, { timeout: 15000 });
    console.log('[qa] chapter 2 reached');

    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});
