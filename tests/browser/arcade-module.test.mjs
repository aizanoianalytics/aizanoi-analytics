import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Arcade loads module-owned Blockfall assets and cleans the stage on close', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  const scriptRequests = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(new URL(request.url()).pathname);
  });

  try {
    await page.goto(`${base}/?arcade-module-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => window.AIZANOI_OS?.openApp?.('games'));
    await page.locator('[data-play-game="blockfall"]').waitFor({ state: 'visible' });
    await page.click('[data-play-game="blockfall"]');
    await page.locator('[data-bf-canvas]').waitFor({ state: 'visible' });

    const active = await page.evaluate(() => ({
      arcadeTitle: document.body.textContent.includes('Aizanoi Arcade'),
      canvas: Boolean(document.querySelector('[data-bf-canvas]')),
      stageClose: Boolean(document.querySelector('[data-close-game]')),
      factory: typeof window.AizanoiArcadeBlocks?.mount,
      scoreApi: typeof window.AizanoiGames?.save,
    }));
    assert.equal(active.arcadeTitle, true);
    assert.equal(active.canvas, true);
    assert.equal(active.stageClose, true);
    assert.equal(active.factory, 'function');
    assert.equal(active.scoreApi, 'function');
    assert.ok(scriptRequests.includes('/js/v3/apps/games/assets/game-utils.js'), `missing module utility request: ${JSON.stringify(scriptRequests)}`);
    assert.ok(scriptRequests.includes('/js/v3/apps/games/assets/blockfall.js'), `missing Blockfall module request: ${JSON.stringify(scriptRequests)}`);
    assert.equal(scriptRequests.some((path) => path.startsWith('/games/')), false, `legacy /games/ script requested: ${JSON.stringify(scriptRequests)}`);

    await page.click('[data-close-game]');
    await page.waitForTimeout(150);
    const closed = await page.evaluate(() => ({
      canvas: Boolean(document.querySelector('[data-bf-canvas]')),
      gameStageText: document.querySelector('[data-game-stage]')?.textContent?.trim() || '',
    }));
    assert.equal(closed.canvas, false);
    assert.equal(closed.gameStageText, '');
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});

test('Arcade close invalidates a pending game launch before the game script can resurrect the stage', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  const scriptRequests = [];
  let releaseUtils;
  let markUtilsRequested;
  const holdUtils = new Promise((resolve) => { releaseUtils = resolve; });
  const utilsRequested = new Promise((resolve) => { markUtilsRequested = resolve; });

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(new URL(request.url()).pathname);
  });
  await page.route('**/js/v3/apps/games/assets/game-utils.js', async (route) => {
    markUtilsRequested();
    await holdUtils;
    await route.continue();
  });

  try {
    await page.goto(`${base}/?arcade-race-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.AIZANOI_OS?.openApp?.('games'));
    await page.locator('[data-play-game="blockfall"]').waitFor({ state: 'visible' });
    await page.click('[data-play-game="blockfall"]');
    await utilsRequested;
    await page.locator('[data-close-game]').waitFor({ state: 'visible' });
    await page.click('[data-close-game]');

    // Only after the close has definitely invalidated this launch do we allow
    // the utility response to finish. A stale continuation must stop before it
    // can request or mount the game-specific Blockfall script.
    releaseUtils();
    await page.waitForTimeout(250);

    const state = await page.evaluate(() => ({
      canvas: Boolean(document.querySelector('[data-bf-canvas]')),
      stageText: document.querySelector('[data-game-stage]')?.textContent?.trim() || '',
    }));
    assert.equal(state.canvas, false);
    assert.equal(state.stageText, '');
    assert.ok(scriptRequests.includes('/js/v3/apps/games/assets/game-utils.js'));
    assert.equal(scriptRequests.includes('/js/v3/apps/games/assets/blockfall.js'), false, `stale game script loaded after close: ${JSON.stringify(scriptRequests)}`);
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    releaseUtils?.();
    await browser.close();
  }
});
