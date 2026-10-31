import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

function gameUrl(query = '') {
  return new URL(`/arcade/maze-chase/${query}`, base).href;
}

async function withPage(options, callback) {
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({
      serviceWorkers: 'block',
      ...options,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await callback(page, errors);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const state = window.__MAZE_CHASE__?.();
    return state && !document.getElementById('mc-start').disabled;
  }, null, { timeout: 20000 });
  await assertFullRoster(page, 'maze-chase');
}

test('all-bot Instant game finishes with a result', { timeout: 180000 }, async () => {
  await withPage({ viewport: { width: 1280, height: 1000 } }, async page => {
    await page.goto(gameUrl('?runners=sample-tactician&ghosts=sample-hunter,sample-wanderer'));
    await waitReady(page);

    const seats = await page.evaluate(() => window.__MAZE_CHASE__().seats);
    assert.deepEqual(seats, [
      { role: 'runner', kind: 'bot', id: 'sample-tactician' },
      { role: 'ghost', kind: 'bot', id: 'sample-hunter' },
      { role: 'ghost', kind: 'bot', id: 'sample-wanderer' },
    ]);

    await page.selectOption('#mc-speed', '0');
    await page.click('#mc-start');
    await page.waitForFunction(() => {
      const state = window.__MAZE_CHASE__();
      return !state.running && state.result !== null;
    }, null, { timeout: 150000 });

    const state = await page.evaluate(() => window.__MAZE_CHASE__());
    assert.match(state.result,
      /^(?:Runners win: every pellet eaten|Ghosts win: all runners caught|Ghosts win: time ran out)$/);
    assert.ok(state.tick > 0 && state.tick <= 1500);
    assert.ok(Number.isInteger(state.pellets) && state.pellets >= 0);
    assert.equal(state.cards.length, 3);
    assert.equal(await page.locator('#mc-result').isVisible(), true);
  });
});

test('human runner accepts keyboard play and ticks advance', { timeout: 40000 }, async () => {
  await withPage({ viewport: { width: 1280, height: 1000 } }, async page => {
    await page.goto(gameUrl());
    await waitReady(page);
    await page.selectOption('#mc-speed', '120');

    const initial = await page.evaluate(() => window.__MAZE_CHASE__());
    assert.equal(initial.seats.filter(seat => seat.role === 'runner').length, 1);
    assert.equal(initial.seats.filter(seat => seat.role === 'ghost').length, 4);
    assert.deepEqual(initial.seats[0], { role: 'runner', kind: 'human', id: 'p1' });

    await page.click('#mc-start');
    await page.waitForFunction(() => window.__MAZE_CHASE__().tick >= 1,
      null, { timeout: 15000 });

    const before = await page.evaluate(() => window.__MAZE_CHASE__().tick);
    const deadline = Date.now() + 3000;
    let left = true;
    while (Date.now() < deadline) {
      await page.keyboard.press(left ? 'KeyA' : 'KeyW');
      left = !left;
      await page.waitForTimeout(150);
    }

    const after = await page.evaluate(() => window.__MAZE_CHASE__());
    assert.ok(after.tick > before, `Tick advanced from ${before} to ${after.tick}`);
    assert.ok(after.cards.some(text => text.includes('RUNNER') && text.includes('Player 1')));
    assert.equal(await page.locator('#mc-cards .mc-card').count(), 5);
  });
});

test('phone layout fits the canvas, has no overflow and offers Player 1 touch controls',
  { timeout: 40000 }, async () => {
    await withPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }, async page => {
      await page.goto(gameUrl());
      await waitReady(page);
      await page.locator('#mc-runners select').first().selectOption('p1');

      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      assert.equal(coarse, true);
      assert.equal(await page.locator('#mc-pad').isVisible(), true);

      const buttons = page.locator('#mc-pad button');
      assert.equal(await buttons.count(), 4);
      for (let index = 0; index < 4; index++) {
        const bounds = await buttons.nth(index).boundingBox();
        assert.ok(bounds && bounds.width >= 56 && bounds.height >= 56);
      }

      await page.locator('#mc-canvas').scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const rect = document.getElementById('mc-canvas').getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });

      assert.ok(geometry.width > 0 && geometry.height > 0);
      assert.ok(geometry.left >= -1);
      assert.ok(geometry.right <= geometry.viewportWidth + 1);
      assert.ok(geometry.top >= -1);
      assert.ok(geometry.bottom <= geometry.viewportHeight + 1);
      assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1,
        `Horizontal overflow: ${geometry.scrollWidth} > ${geometry.clientWidth}`);

      await page.click('#mc-start');
      await page.waitForFunction(() => window.__MAZE_CHASE__().tick >= 1,
        null, { timeout: 15000 });
      assert.equal(await buttons.first().isEnabled(), true);
      await page.locator('#mc-pad [data-dir="left"]').tap();
      const tick = await page.evaluate(() => window.__MAZE_CHASE__().tick);
      await page.waitForFunction(previous => window.__MAZE_CHASE__().tick > previous,
        tick, { timeout: 10000 });
    });
  });
