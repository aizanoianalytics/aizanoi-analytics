// Prove the restored 2D features actually work in the real game: the run
// persists between sessions, the menu offers Continue when a save exists,
// and the claimed blessings are visible in the HUD.
//
// A unit test on the state machine is not enough: the save has to survive a
// real page reload, and the HUD has to really show the blessings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || process.env.DG3D_BASE_URL || 'http://127.0.0.1:4173';
// The key the game itself writes, and the state module it validates against.
const SAVE_KEY = 'aizanoi.dungeon.run.v3';

const launch = () => chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});

test('a saved run survives a reload and the menu offers Continue', async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    let page = await context.newPage();
    const errors = [];
    const badResponses = [];
    page.on('response', (response) => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(`${base}/dungeon/?persist=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });

    // First visit: there is no save, so there is no Continue button.
    const continueCount = await page.locator('.az-dungeon-continue').count();
    assert.equal(continueCount, 0, 'a fresh browser must not offer Continue');

    // Write a save the way the game does, then reopen the page: the real
    // round trip through localStorage is what is being tested here. The
    // payload is built by the game's own serializer, so it passes the game's
    // own validator.
    //
    // The first page deliberately does NOT start the game: once the render
    // loop is running, the page stops responding to navigation promptly.
    await page.evaluate(async (key) => {
      // The state module is already loaded by the game itself, so it is taken
      // from the performance entries: no guessing and no failed request that
      // would show up as a console error.
      const entries = performance.getEntriesByType('resource').map((entry) => entry.name);
      const loaded = entries.find((name) => /\/apps\/dungeon\/src\/game\/index\.js$/.test(name));
      if (!loaded) throw new Error('the dungeon state module was not loaded by the page');
      const module = await import(loaded);
      const state = module.createGameState('aizo-awakens');
      state.chapter = 3;
      state.player.gold = 190;
      state.player.hp = 84;
      state.player.maxHp = 130;
      module.chooseBlessing(state, 'fury');
      window.localStorage.setItem(key, module.serializeRun(state));
    }, SAVE_KEY);

    // Reopen the page: the game must now offer Continue, and Continue must
    // restore the saved chapter and gold. The first page is closed first:
    // two live WebGL pages at once starve the software renderer, and the
    // second navigation never completes.
    await page.close();
    page = await context.newPage();
    await page.goto(`${base}/dungeon/?reloaded=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });
    await page.waitForTimeout(800);

    const continueButtons = await page.locator('.az-dungeon-continue').count();
    assert.equal(continueButtons, 1, 'a browser with a save must offer Continue');
    const label = await page.locator('.az-dungeon-continue').textContent();
    assert.match(label, /Chapter 3/, `the Continue button must name the chapter, got "${label}"`);

    await page.locator('.az-dungeon-continue').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    await page.waitForTimeout(800);

    const restored = await page.evaluate(() => ({
      chapter: window.AIZANOI_DUNGEON_GAME.chapter,
      hp: window.AIZANOI_DUNGEON_GAME.hp,
    }));
    assert.equal(restored.chapter, 3, 'the restored run must be on the saved chapter');
    assert.equal(restored.hp, 84, 'the restored run must have the saved health');

    // The blessing from the save must be visible in the HUD.
    const blessingText = await page.locator('.az-hud-blessings').textContent();
    assert.match(blessingText, /Fury/i, `the HUD must show the claimed blessing, got "${blessingText}"`);

    assert.deepEqual(badResponses, [], 'no request may fail');
    assert.deepEqual(errors, [], 'no console error may be logged');
  } finally {
    await browser.close();
  }
});

test('a fresh browser shows no Continue button and no blessing list', async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    const page = await context.newPage();
    await page.goto(`${base}/dungeon/?fresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });
    assert.equal(await page.locator('.az-dungeon-continue').count(), 0);

    await page.locator('.az-dungeon-begin').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 20000 });
    await page.waitForTimeout(800);
    // No blessing claimed yet, so the list must stay hidden.
    const visible = await page.locator('.az-hud-blessings').isVisible();
    assert.equal(visible, false, 'the blessing list must stay hidden before any blessing is claimed');
  } finally {
    await browser.close();
  }
});
