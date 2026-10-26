// Dungeon depth: natural boot -> trusted combat -> chest/shop -> portal/chapter,
// settings surface, daily seed, world-projected feedback. Real browser only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4181';
const evidence = process.env.DUNGEON_EVIDENCE_DIR;
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'];

async function capture(context, page, name) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${evidence}/${name}.png`, Buffer.from(data, 'base64'));
}

// Walk the player to a world coordinate with the game's own movement input.
async function walkTo(page, x, z, maxRounds = 40) {
  for (let i = 0; i < maxRounds; i += 1) {
    const done = await page.evaluate(([tx, tz]) => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      const step = handle.qaWalkTo(tx, tz);
      if (step.arrived) return true;
      for (let t = 0; t < 15; t += 1) handle.qaAdvance(1);
      const gap = Math.hypot(tx - handle.player.x, tz - handle.player.z);
      return gap <= 2.2;
    }, [x, z]);
    if (done) return true;
  }
  return false;
}

test('menu offers begin, daily, new seed, settings; depth survives a natural chapter', { timeout: 420000 }, async () => {
  const browser = await chromium.launch({ headless: true, args });
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  try {
    await page.goto(`${base}/dungeon/?depth=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.frames > 0, null, { timeout: 60000 });
    const anyway = page.locator('.az-play-anyway');
    if (await anyway.isVisible()) await anyway.click();

    // Menu surfaces: classic begin, daily seed, fresh seed, settings.
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });
    const menu = await page.evaluate(() => ({
      daily: document.querySelector('.az-dungeon-daily')?.textContent || null,
      dailySeed: window.AIZANOI_DUNGEON_GAME.dailySeed,
      settings: window.AIZANOI_DUNGEON_GAME.settings,
      newSeed: !!document.querySelector('.az-dungeon-new-seed'),
      settingsOpen: !!document.querySelector('.az-dungeon-settings-open'),
    }));
    assert.ok(menu.daily && menu.daily.includes('Daily descent'), 'menu must offer the daily descent');
    assert.ok(menu.daily.includes(menu.dailySeed), 'daily button must name its seed');
    assert.match(menu.dailySeed, /^aizo-daily-\d{4}-\d{2}-\d{2}$/, 'daily seed format');
    assert.equal(menu.newSeed, true, 'menu must offer a fresh-seed descent');
    assert.equal(menu.settingsOpen, true, 'menu must offer settings');
    assert.equal(typeof menu.settings.masterVolume, 'number', 'settings must carry volumes');

    // Settings surface: every comfort control present, changes persist.
    await page.locator('.az-dungeon-settings-open').click();
    await page.waitForSelector('.az-dungeon-settings', { timeout: 10000 });
    for (const label of ['Assist mode', 'Auto-fire reserve', 'Master volume', 'Screen shake', 'Render quality', 'Damage numbers', 'High contrast', 'Left-handed layout', 'Reduced motion']) {
      assert.ok(await page.locator('.az-dungeon-settings', { hasText: label }).count() > 0, `settings must expose ${label}`);
    }
    await page.locator('.az-dungeon-settings').getByLabel('High contrast').check();
    await page.locator('.az-dungeon-settings').getByText('Done').click();
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('aizanoi.dungeon.settings.v1') || '{}'));
    assert.equal(persisted.highContrast, true, 'settings must persist separately from the run');
    const contrastClass = await page.evaluate(() => document.querySelector('.aizanoi-dungeon3d-app-root')?.className || '');
    assert.match(contrastClass, /is-high-contrast/, 'high contrast must apply live');
    await capture(context, page, 'desktop-menu');

    // Daily descent starts the shared seed through the real menu path.
    await page.locator('.az-dungeon-daily').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    const runSeed = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.seed);
    assert.equal(runSeed, menu.dailySeed, 'daily descent must start the daily seed');

    // Pending spawns render world portal markers before materializing.
    const pending = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.status.pendingSpawns);
    assert.ok(pending > 0, 'a fresh wave must telegraph spawns');
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(5));
    const markers = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.spawnMarkers);
    assert.ok(markers > 0, `pending spawns must render portal markers, saw ${markers}`);
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(70));
    const live = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount);
    assert.ok(live > 0, 'telegraphed spawns must materialize');

    // Thin the wave to one chaser with trusted melee, keeping a live
    // attacker for the parry phase.
    for (let round = 0; round < 60; round += 1) {
      const remaining = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount + window.AIZANOI_DUNGEON_GAME.status.pendingSpawns);
      if (remaining <= 1) break;
      const target = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.find((e) => e.hp > 0)?.id);
      if (!target) { await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(30)); continue; }
      await page.evaluate((id) => window.AIZANOI_DUNGEON_GAME.qaWalkToward(id), target);
      await page.evaluate((id) => {
        const handle = window.AIZANOI_DUNGEON_GAME;
        for (let t = 0; t < 60; t += 1) {
          handle.qaAdvance(1);
          const foe = handle.enemyHp.find((e) => e.id === id);
          if (!foe) break;
          if (Math.hypot(foe.x - handle.player.x, foe.z - handle.player.z) <= 1.6) break;
        }
      }, target);
      await page.keyboard.press('j');
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(15));
      const hp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.hp);
      if (hp <= 0) break;
    }

    // Natural parry in manual mode: no auto-attack stun-lock, toe to toe
    // (inside chaser reach 1.4) so windups complete into the guard window.
    await page.keyboard.press('t');
    await page.keyboard.press('t');
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.assist.mode), 'manual', 'assist must switch to manual');
    let slowMoSeen = false;
    for (let i = 0; i < 10; i += 1) {
      await page.evaluate(() => {
        const handle = window.AIZANOI_DUNGEON_GAME;
        const foe = handle.enemyHp.find((e) => e.hp > 0);
        if (!foe) return;
        handle.qaWalkToward(foe.id);
        for (let t = 0; t < 60; t += 1) {
          handle.qaAdvance(1);
          const live = handle.enemyHp.find((e) => e.hp > 0);
          if (live && Math.hypot(live.x - handle.player.x, live.z - handle.player.z) <= 1.2) break;
        }
      });
      await page.keyboard.press('l');
      slowMoSeen = await page.evaluate(() => {
        const handle = window.AIZANOI_DUNGEON_GAME;
        for (let t = 0; t < 21; t += 1) {
          handle.qaAdvance(1);
          if (handle.slowMo) return true;
        }
        return false;
      });
      if (slowMoSeen) break;
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(30));
      const hp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.hp);
      if (hp <= 30) break;
    }
    assert.ok(slowMoSeen, 'a natural guard-parry must engage the slow-mo time scale');
    await page.keyboard.press('t');
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.assist.mode), 'assist', 'assist must switch back');

    // Natural first-wave clear with trusted melee: walk to each enemy, swing.
    let cleared = false;
    for (let round = 0; round < 60; round += 1) {
      const remaining = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount + window.AIZANOI_DUNGEON_GAME.status.pendingSpawns);
      if (remaining === 0) { cleared = true; break; }
      const target = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.find((e) => e.hp > 0)?.id);
      if (!target) { await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(30)); continue; }
      await page.evaluate((id) => window.AIZANOI_DUNGEON_GAME.qaWalkToward(id), target);
      await page.evaluate((id) => {
        const handle = window.AIZANOI_DUNGEON_GAME;
        for (let t = 0; t < 60; t += 1) {
          handle.qaAdvance(1);
          const foe = handle.enemyHp.find((e) => e.id === id);
          if (!foe) break;
          if (Math.hypot(foe.x - handle.player.x, foe.z - handle.player.z) <= 1.6) break;
        }
      }, target);
      await page.keyboard.press('j');
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(15));
      const hp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.hp);
      if (hp <= 0) break;
    }
    assert.ok(cleared, 'natural melee must clear the first wave');
    await capture(context, page, 'desktop-combat');

    // Walk to the reward chest and open it with a trusted Enter.
    const chest = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.objective);
    assert.ok(chest && chest.kind === 'chest', 'a cleared wave must leave an openable chest');
    assert.ok(await walkTo(page, chest.x, chest.z), 'the player must reach the chest on foot');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.az-dungeon-pick', { timeout: 20000 });

    // The reward draft opens with clickable cards AND the Ferryman shop.
    const pick = await page.evaluate(() => ({
      cards: document.querySelectorAll('.az-dungeon-pick-card').length,
      shop: document.querySelectorAll('.az-dungeon-shop-item').length,
      buys: document.querySelectorAll('.az-dungeon-shop-buy').length,
      gold: window.AIZANOI_DUNGEON_GAME.ledger.gold,
    }));
    assert.equal(pick.cards, 3, 'the draft must offer 3 blessings');
    assert.equal(pick.shop, 3, 'the draft must host the 3-item Ferryman shop');
    assert.equal(pick.buys, 3, 'every shop item must be purchasable');
    await capture(context, page, 'desktop-pick-shop');

    // Shop purchase through a trusted click: gold moves, the slot sells.
    const cheapest = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.az-dungeon-shop-buy')];
      let best = null;
      for (const b of buttons) {
        const match = (b.textContent || '').match(/(\d+)/);
        if (match && (!best || Number(match[1]) < best.price)) best = { price: Number(match[1]) };
      }
      return best;
    });
    if (cheapest && pick.gold >= cheapest.price) {
      const goldBefore = pick.gold;
      const buyButtons = page.locator('.az-dungeon-shop-buy');
      let bought = false;
      for (let i = 0; i < 3; i += 1) {
        const text = await buyButtons.nth(i).textContent();
        const match = (text || '').match(/(\d+)/);
        if (match && Number(match[1]) <= goldBefore) {
          await buyButtons.nth(i).click();
          bought = true;
          break;
        }
      }
      assert.ok(bought, 'an affordable toll must be clickable');
      const afterBuy = await page.evaluate(() => ({
        gold: window.AIZANOI_DUNGEON_GAME.ledger.gold,
        sold: [...document.querySelectorAll('.az-dungeon-shop-buy')].filter((b) => b.disabled || (b.textContent || '').includes('Paid')).length,
      }));
      assert.ok(afterBuy.gold < goldBefore, `gold must move on purchase (${goldBefore} -> ${afterBuy.gold})`);
      assert.ok(afterBuy.sold >= 1, 'the bought slot must read as sold');
    } else {
      await page.locator('.az-dungeon-shop-buy').first().click();
      const notice = await page.evaluate(() => document.querySelector('.az-hud-announcer')?.textContent || '');
      assert.match(notice, /gold|paid|toll/i, 'an unaffordable toll must say so');
    }

    // Choose a blessing with a trusted click, then take the portal on foot.
    await page.locator('.az-dungeon-pick-card').first().click();
    await page.waitForFunction(() => !document.querySelector('.az-dungeon-pick'), null, { timeout: 10000 });
    const buffs = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.buffs.blessings.length);
    assert.ok(buffs >= 1, 'the clicked blessing must apply');
    const portal = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.objective);
    assert.ok(portal && portal.kind === 'portal', 'a claimed reward must leave an exit portal');
    assert.ok(await walkTo(page, portal.x, portal.z), 'the player must reach the portal on foot');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(80));
    const chapter2 = await page.evaluate(() => ({
      chapter: window.AIZANOI_DUNGEON_GAME.chapter,
      state: window.AIZANOI_DUNGEON_GAME.state,
      arena: window.AIZANOI_DUNGEON_GAME.status.arena,
      built: window.AIZANOI_DUNGEON_GAME.arenaBuilt,
      notice: document.querySelector('.az-hud-announcer')?.textContent || '',
    }));
    assert.equal(chapter2.chapter, 2, 'the portal must naturally advance to chapter 2');
    assert.equal(chapter2.state, 'playing', 'chapter 2 must be live combat');
    assert.equal(chapter2.built, chapter2.arena, 'the room must rebuild to the chapter arena');
    assert.match(chapter2.notice, /chapter|arena|enemies/i, 'the transition must announce (wave-start, arena or spawn call)');
    await capture(context, page, 'desktop-chapter2');

    // Fresh-hit damage labels project to victims, never bare screen center.
    // The swing is issued first; labels are read in the same breath, so the
    // 650 ms lifetime cannot expire between the hit and the read.
    const labels = await page.evaluate(() => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      const target = handle.enemyHp.find((e) => e.hp > 0);
      if (target) handle.qaWalkToward(target.id);
      for (let round = 0; round < 6; round += 1) {
        for (let t = 0; t < 60; t += 1) {
          handle.qaAdvance(1);
          const foe = handle.enemyHp.find((e) => e.hp > 0);
          if (foe && Math.hypot(foe.x - handle.player.x, foe.z - handle.player.z) <= 1.6) break;
        }
        const foe = handle.enemyHp.find((e) => e.hp > 0);
        if (!foe) break;
        if (Math.hypot(foe.x - handle.player.x, foe.z - handle.player.z) <= 1.6) break;
        handle.qaWalkToward(foe.id);
      }
      return true;
    });
    void labels;
    await page.keyboard.press('j');
    const fresh = await page.evaluate(() => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      handle.qaAdvance(15);
      return [...document.querySelectorAll('.az-floating-damage')].map((el) => el.className);
    });
    assert.ok(fresh.length > 0, 'real combat must leave damage labels');
    assert.ok(fresh.every((name) => /az-dmg-x\d/.test(name) && /az-dmg-y\d/.test(name)),
      `every label must be world-projected, saw ${JSON.stringify(fresh.slice(0, 4))}`);

    assert.deepEqual(errors, [], `no console/page/asset errors, saw ${JSON.stringify(errors.slice(0, 5))}`);
  } finally {
    await browser.close();
  }
});

test('fixture-assisted arena walk rebuilds each chapter room', { timeout: 420000 }, async () => {
  // Chapters 2+ are reached through the labeled wave-clear fixture, then
  // every portal is walked and entered for real; combat in each room is
  // real. Seed aizo-awakens descends ring -> brazier court -> broken bridge.
  const browser = await chromium.launch({ headless: true, args });
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  try {
    await page.goto(`${base}/dungeon/?arenas=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.frames > 0, null, { timeout: 60000 });
    await page.locator('.az-dungeon-begin').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    const built = [];
    for (const want of [2, 3]) {
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(70));
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaClearWave());
      const portal = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.objective);
      assert.ok(portal && portal.kind === 'portal', `chapter ${want - 1} reward must leave a portal`);
      assert.ok(await walkTo(page, portal.x, portal.z), 'the player must reach the portal on foot');
      await page.keyboard.press('Enter');
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(80));
      const room = await page.evaluate(() => ({
        chapter: window.AIZANOI_DUNGEON_GAME.chapter,
        arena: window.AIZANOI_DUNGEON_GAME.status.arena,
        built: window.AIZANOI_DUNGEON_GAME.arenaBuilt,
      }));
      assert.equal(room.chapter, want, `must arrive at chapter ${want}`);
      assert.equal(room.built, room.arena, `chapter ${want} room must rebuild to ${room.arena}`);
      built.push(room.built);
      // Real combat in the new room: a trusted swing must land.
      const beforeHp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.map((e) => e.hp));
      await page.evaluate(() => {
        const handle = window.AIZANOI_DUNGEON_GAME;
        const target = handle.enemyHp.find((e) => e.hp > 0);
        if (target) handle.qaWalkToward(target.id);
        for (let round = 0; round < 6; round += 1) {
          for (let t = 0; t < 60; t += 1) {
            handle.qaAdvance(1);
            const foe = handle.enemyHp.find((e) => e.hp > 0);
            if (foe && Math.hypot(foe.x - handle.player.x, foe.z - handle.player.z) <= 1.6) break;
          }
          const foe = handle.enemyHp.find((e) => e.hp > 0);
          if (!foe) break;
          if (Math.hypot(foe.x - handle.player.x, foe.z - handle.player.z) > 1.6) handle.qaWalkToward(foe.id);
        }
      });
      await page.keyboard.press('j');
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(15));
      const afterHp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.map((e) => e.hp));
      assert.ok(afterHp.some((hp, i) => hp < beforeHp[i]), `chapter ${want} real combat must damage an enemy`);
      await capture(context, page, `desktop-arena-ch${want}`);
    }
    // Which arena each chapter draws depends on combat RNG (the live loop
    // also steps), so the test gates the rebuild wiring — room follows the
    // chapter arena every time — and records the observed sequence as
    // evidence. Distinct layouts per arena id are proven at unit level.
    console.log(`arena descent observed: column-ring -> ${built.join(' -> ')}`);
    assert.deepEqual(errors, [], `no console/page/asset errors, saw ${JSON.stringify(errors.slice(0, 5))}`);
  } finally {
    await browser.close();
  }
});

test('tablet and phone reach menu and live combat without errors', { timeout: 420000 }, async () => {
  const browser = await chromium.launch({ headless: true, args });
  try {
    for (const [name, viewport, touch] of [
      ['tablet', { width: 834, height: 1112 }, false],
      ['phone', { width: 390, height: 844 }, true],
    ]) {
      const context = await browser.newContext({
        viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      await page.goto(`${base}/dungeon/?device-${name}=${Date.now()}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.frames > 0, null, { timeout: 60000 });
      const anyway = page.locator('.az-play-anyway');
      if (await anyway.isVisible()) await anyway.click();
      await page.locator('.az-dungeon-begin').click();
      await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(70));
      const live = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount);
      assert.ok(live > 0, `${name} must spawn live combat`);
      // Touch movement ownership on coarse pointers.
      if (touch) {
        const pad = page.locator('.az-touch-joystick');
        assert.ok(await pad.isVisible(), 'phone must show the movement pad');
      }
      await capture(context, page, `${name}-combat`);
      assert.deepEqual(errors, [], `${name}: no console/page/asset errors, saw ${JSON.stringify(errors.slice(0, 5))}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
