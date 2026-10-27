import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function withPage(options, callback) {
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block', ...options });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await callback(page);
    assert.deepEqual(errors, []);
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

async function ready(page, query) {
  await page.goto(new URL(`/arcade/maze-chase/${query}`, base).href);
  await page.waitForFunction(() => {
    const state = window.__MAZE_CHASE__?.();
    return state?.bots === 3 && !document.getElementById('mc-start').disabled;
  }, null, { timeout: 20000 });
}

test('repeated entrants have distinct numbered cards and accessible arena markers',
  { timeout: 30000 }, async () => {
    await withPage({
      viewport: { width: 1280, height: 1000 },
      reducedMotion: 'reduce',
    }, async page => {
      await ready(page,
        '?runners=sample-hunter,sample-hunter&ghosts=sample-hunter,sample-hunter');
      const badges = await page.locator('#mc-cards .mc-badge').allTextContents();
      assert.deepEqual(badges, [
        'R1 · RUNNER', 'R2 · RUNNER', 'G1 · GHOST', 'G2 · GHOST'
      ]);
      assert.match(await page.locator('#mc-canvas').getAttribute('aria-label'),
        /Seat markers R1–R4 and G1–G6/);
      const geometry = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      assert.ok(geometry.scroll <= geometry.client + 1);
    });
  });

test('a lone Player 2 receives the mobile touch pad and can use it',
  { timeout: 40000 }, async () => {
    await withPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
    }, async page => {
      await ready(page, '?runners=p2&ghosts=sample-hunter');
      const pad = page.locator('#mc-pad');
      assert.equal(await pad.isVisible(), true);
      assert.equal(await pad.getAttribute('aria-label'), 'Player 2 direction controls');
      await page.click('#mc-start');
      await page.waitForFunction(() => window.__MAZE_CHASE__().tick >= 1,
        null, { timeout: 15000 });
      const left = pad.locator('[data-dir="left"]');
      assert.equal(await left.isEnabled(), true);
      await left.tap();
      const before = await page.evaluate(() => window.__MAZE_CHASE__().tick);
      await page.waitForFunction(tick => window.__MAZE_CHASE__().tick > tick,
        before, { timeout: 10000 });
      assert.ok((await page.locator('#mc-cards .mc-card').allTextContents())
        .some(text => text.includes('Player 2')));
    });
  });

test('fright telemetry labels simulation ticks and Normal-speed equivalence',
  { timeout: 30000 }, async () => {
    await withPage({ viewport: { width: 390, height: 844 } }, async page => {
      await ready(page, '?runners=sample-hunter&ghosts=sample-wanderer');
      // The HUD string is populated even while its zero-fright badge is hidden.
      assert.equal(await page.locator('#mc-fright').textContent(),
        'FRIGHT 0t · 0.0s @ Normal');
      assert.equal(await page.locator('#mc-tick').textContent(), 'TICK 0 / 1500');
      assert.equal(await page.locator('#mc-fright').isVisible(), false);
    });
  });
