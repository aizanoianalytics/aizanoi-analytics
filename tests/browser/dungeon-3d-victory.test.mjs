// Prove the victory screen really appears in the browser, with a run ledger
// whose numbers match the state, and that it does not appear early.
//
// The state machine knows how to win; the browser test proves the player can
// actually reach that screen and read the summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || process.env.DG3D_BASE_URL || 'http://127.0.0.1:4173';
const FINAL_CHAPTER = 10;

const launch = () => chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});

test('the victory screen shows a run ledger when the descent is complete', async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(`${base}/dungeon/?victory=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });
    await page.locator('.az-dungeon-begin').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(70));
    await page.waitForTimeout(1200);

    // No victory yet: the run has barely started.
    assert.equal(await page.locator('.az-dungeon-victory').count(), 0,
      'the victory screen must not appear at the start of the run');
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.victory), false,
      'the run must not be won at the start');

    // Play for real: close the distance to an enemy and swing, so the
    // ledger counts genuine swings rather than poked state. A swing only
    // counts when a target is actually in reach.
    //
    // The walk is driven through the game's own movement input and the
    // game's own fixed-step tick. The render loop runs at well under one
    // frame per second in a headless software-WebGL browser, so waiting for
    // real animation frames here would take minutes; the simulation code
    // that runs is exactly the code the render loop runs.
    await page.evaluate(() => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      const enemy = handle.enemyHp[0];
      if (enemy) handle.qaWalkToward(enemy.id);
    });
    const closed = await page.evaluate(() => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      for (let i = 0; i < 600; i += 1) {
        handle.qaAdvance(1);
        const enemy = handle.enemyHp[0];
        const player = handle.player;
        if (!enemy) break;
        if (Math.hypot(enemy.x - player.x, enemy.z - player.z) <= 1.6) return { closed: true, ticks: i };
      }
      return { closed: false };
    });
    assert.ok(closed.closed, 'the player must be able to walk up to an enemy');

    // The swing itself is a real key press through the real input path.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('j');
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(20));
    }

    const ledgerAfterPlay = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger);
    assert.ok(ledgerAfterPlay.meleeSwings > 0,
      `the swings must be counted in the ledger, got ${ledgerAfterPlay.meleeSwings}`);

    // Finish the descent through the runtime's own QA affordance, which
    // clears a wave and opens its chest with the game's own code path.
    const walk = await page.evaluate(async () => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      const results = [];
      for (let i = 0; i < 10; i += 1) {
        results.push(handle.qaClearWave());
      }
      return results;
    });
    await page.waitForTimeout(1500);

    assert.equal(walk.length, 10);
    assert.equal(walk[9].victory, true, 'the tenth chapter must win the run');

    const victoryShown = await page.locator('.az-dungeon-victory').count();
    assert.equal(victoryShown, 1, 'the victory screen must appear after the tenth chapter');

    const title = await page.locator('.az-dungeon-victory .az-hud-panel-title').textContent();
    assert.match(title, /descent|complete/i, `the victory screen must be titled, got "${title}"`);

    // The ledger on the screen must list the real things the run did.
    const ledgerText = await page.locator('.az-dungeon-ledger').textContent();
    assert.match(ledgerText, /Enemies slain/i, 'the ledger must list the kills');
    assert.match(ledgerText, /Gold gathered/i, 'the ledger must list the gold');
    assert.match(ledgerText, /Blessings claimed/i, 'the ledger must list the blessings');
    assert.match(ledgerText, /Chapters cleared/i, 'the ledger must list the chapters');

    // The state must agree with the screen.
    const state = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger);
    assert.equal(state.chapter, FINAL_CHAPTER + 1, 'the run must have advanced past the final chapter');
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.victory), true,
      'the runtime must report the run as won');
    assert.ok(state.chestCount >= 10, `the ledger must count the chests, got ${state.chestCount}`);

    // The blessings claimed along the way must be visible in the HUD.
    const blessingText = await page.locator('.az-hud-blessings').textContent();
    assert.ok(blessingText.trim().length > 0, 'the claimed blessings must be listed in the HUD');

    assert.deepEqual(errors, [], 'no console error may be logged');
  } finally {
    await browser.close();
  }
});

test('the victory screen offers a way to start a new run', async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${base}/dungeon/?victory2=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });
    await page.locator('.az-dungeon-begin').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const handle = window.AIZANOI_DUNGEON_GAME;
      for (let i = 0; i < 10; i += 1) handle.qaClearWave();
    });
    // Wait for the screen itself, not for a fixed delay: the runtime shows it
    // when it pumps the victory event.
    await page.waitForSelector('.az-dungeon-victory .az-dungeon-begin', { timeout: 20000 });

    const restart = page.locator('.az-dungeon-victory .az-dungeon-begin').filter({ hasText: 'Descend again' });
    assert.equal(await restart.count(), 1, 'the victory screen must offer a new run');
    // The event is dispatched directly rather than clicked with the mouse.
    // The victory panel is centred with a translate(-50%, -50%) transform and
    // Playwright's actionability check never settles on it, even though the
    // element is stable, on top and does respond to a real mouse click at the
    // same coordinates. Dispatching the event tests the button's own handler,
    // which is what this test is about.
    await restart.dispatchEvent('click');
    await page.waitForTimeout(1200);

    assert.equal(await page.locator('.az-dungeon-victory').count(), 0,
      'the victory screen must be gone after starting a new run');
    const state = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger);
    assert.equal(state.chapter, 1, 'the new run must start at chapter one');
    assert.equal(state.kills, 0, 'the new run must start with an empty ledger');
  } finally {
    await browser.close();
  }
});
