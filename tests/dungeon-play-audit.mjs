// Section 16: play the actual game. Start a run through the real menu, enter
// GameScene, exercise combat and movement with real input, and traverse the
// chapter ladder through the game's own scene events -- recording the state the
// game reports, not what the source suggests should happen.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.AIZANOI_AUDIT_OUT || 'artifacts/audit/dungeon';
mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (area, detail) => {
  findings.push({ area, detail });
  console.log(`[${area}] ${detail}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/dungeon/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#game-container canvas') !== null, null, { timeout: 45000 });
await page.waitForFunction(() => Boolean(window.AIZANOI_DUNGEON_GAME), null, { timeout: 20000 })
  .catch(() => note('hook', 'AIZANOI_DUNGEON_GAME still absent'));

const sceneState = () => page.evaluate(() => {
  const game = window.AIZANOI_DUNGEON_GAME;
  if (!game) return { hasGame: false, marker: window.__AIZANOI_DUNGEON_SCENE ?? null };
  const active = game.scene.getScenes(true).map((s) => s.constructor?.name ?? 'anonymous');
  return { hasGame: true, active, marker: window.__AIZANOI_DUNGEON_SCENE ?? null };
});

note('boot', JSON.stringify(await sceneState()));

// The menu scene is keyboard/mouse driven. Find what it actually offers rather
// than guessing key names.
const menuProbe = await page.evaluate(() => {
  const game = window.AIZANOI_DUNGEON_GAME;
  const menu = game.scene.getScene('MenuScene');
  if (!menu) return { menu: false };
  const out = { menu: true, keys: [], buttons: [], texts: [] };
  for (const [key, action] of Object.entries(menu.input?.keyboard?.addKeys?.('up,down,left,right,space,enter,esc') ?? {})) out.keys.push(key);
  const walk = (obj, depth = 0) => {
    if (!obj || depth > 3) return;
    for (const child of obj.list ?? []) {
      if (child.type === 'Text') out.texts.push(String(child.text).slice(0, 60));
      else if (child.input) out.buttons.push(child.type);
      walk(child, depth + 1);
    }
  };
  walk(menu.children);
  return out;
});
note('menu', JSON.stringify(menuProbe));

// Drive the menu with real input and watch for the transition into play.
const canvas = await page.locator('#game-container canvas').boundingBox();
const cx = canvas.x + canvas.width / 2;
const cy = canvas.y + canvas.height / 2;
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter', 'Space']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
  const s = await sceneState();
  if (s.active?.some((n) => n === 'GameScene')) { note('transition', `entered GameScene via ${key}`); break; }
}
let afterMenu = await sceneState();
note('after-menu', JSON.stringify(afterMenu));
await page.screenshot({ path: `${OUT}/01-after-menu.png` });

// If the menu did not yield to play, try the click path the game actually uses.
if (!afterMenu.active?.some((n) => n === 'GameScene')) {
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(600);
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(600);
    afterMenu = await sceneState();
    if (afterMenu.active?.some((n) => n === 'GameScene')) break;
  }
  note('after-click', JSON.stringify(afterMenu));
}

if (afterMenu.active?.some((n) => n === 'GameScene')) {
  // Inside play: what does the game expose about the run itself?
  const runState = await page.evaluate(() => {
    const game = window.AIZANOI_DUNGEON_GAME;
    const scene = game.scene.getScene('GameScene');
    if (!scene) return { scene: false };
    const reg = scene.registry ?? game.registry;
    const data = reg.getAll ? reg.getAll() : {};
    return {
      scene: true,
      keys: Object.keys(scene).filter((k) => !k.startsWith('_')).slice(0, 40),
      children: scene.children?.list?.length ?? null,
      registry: Object.fromEntries(Object.entries(data).slice(0, 30)),
      systems: {
        hasProgression: Boolean(scene.progressionSystem ?? scene.progression),
        hasLevel: Boolean(scene.levelSystem ?? scene.level),
        hasCombat: Boolean(scene.combatSystem ?? scene.combat),
        hasPlayer: Boolean(scene.player)
      }
    };
  });
  note('run', JSON.stringify(runState));
  writeFileSync(`${OUT}/run-state.json`, JSON.stringify(runState, null, 2));

  // Real input: move and attack, and see whether anything in the game responds.
  const before = await page.evaluate(() => {
    const s = window.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const p = s.player;
    return p ? { x: p.x, y: p.y, hp: p.hp ?? p.health ?? null } : null;
  });
  for (const key of ['w', 'd']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.keyboard.up(key);
  }
  await page.keyboard.press('j');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const s = window.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const p = s.player;
    return p ? { x: p.x, y: p.y, hp: p.hp ?? p.health ?? null } : null;
  });
  note('input-response', `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  await page.screenshot({ path: `${OUT}/02-in-play.png` });

  // Chapter traversal through the game's own mechanism: GameScene restarts with
  // a new chapterIndex, which is how the real progression advances. Drive that
  // instead of reaching into internals.
  const chapters = [];
  for (let chapter = 0; chapter < 10; chapter++) {
    // eslint-disable-next-line no-await-in-loop
    const result = await page.evaluate((index) => new Promise((resolve) => {
      const game = window.AIZANOI_DUNGEON_GAME;
      const scene = game.scene.getScene('GameScene');
      if (!scene) { resolve({ chapter: index, status: 'no GameScene' }); return; }
      try {
        scene.scene.restart({ chapterIndex: index, isEndless: false, runState: scene.runState });
        // The restarted scene rebuilds its level asynchronously.
        setTimeout(() => {
          const live = game.scene.getScene('GameScene');
          resolve({
            chapter: index,
            status: 'restarted',
            levelName: live?.currentLevelConfig?.name ?? null,
            levelKey: live?.currentLevelConfig?.key ?? null,
            enemies: live?.currentLevelConfig?.enemies?.types ?? null,
            children: live?.children?.list?.length ?? null,
            playerHp: live?.player?.hp ?? null
          });
        }, 900);
      } catch (err) {
        resolve({ chapter: index, status: `threw: ${err.message}` });
      }
    }), chapter);
    chapters.push(result);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500);
  }
  note('chapters', JSON.stringify(chapters));
  writeFileSync(`${OUT}/chapters.json`, JSON.stringify(chapters, null, 2));
  await page.screenshot({ path: `${OUT}/03-chapter-9.png` });

} else {
  note('blocking', 'the menu never transitioned into GameScene, so no play audit is possible');
}

note('console-errors', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log(`\n=== ${findings.length} findings -> ${OUT}/findings.json ===`);
await browser.close();
