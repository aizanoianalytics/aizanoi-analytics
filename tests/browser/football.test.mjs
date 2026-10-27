import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function openPage(t, options = {}) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
    ...options
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/arcade/football/', base).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__FOOTBALL__ && window.__FOOTBALL__().bots === 3);
  return { page, errors };
}

test('bot-only 2v2 at Max completes one minute with a result and no page errors', {
  timeout: 120000
}, async t => {
  const { page, errors } = await openPage(t);
  await page.locator('#fb-red select').first().selectOption('sample-chaser');
  await page.locator('#fb-blue select').first().selectOption('sample-striker');
  await page.selectOption('#fb-size', '2');
  await page.selectOption('#fb-time', '60');
  await page.selectOption('#fb-limit', '0');
  await page.selectOption('#fb-speed', 'max');
  await page.click('#fb-start');
  await page.waitForFunction(() => window.__FOOTBALL__().running);
  await page.waitForFunction(() => {
    const state = window.__FOOTBALL__();
    return !state.running && Boolean(state.result);
  }, null, { timeout: 100000 });
  const state = await page.evaluate(() => window.__FOOTBALL__());
  assert.equal(state.seats.length, 4);
  assert.ok(state.seats.every(seat => seat.kind === 'bot'));
  assert.match(state.result, /^(?:Red wins|Blue wins|Draw) \d+–\d+$/);
  assert.equal(state.cards.length, 4);
  assert.equal(state.clock, '0:00');
  assert.deepEqual(errors, []);
});

test('human keyboard movement and kick work after the countdown at real time', {
  timeout: 30000
}, async t => {
  const { page, errors } = await openPage(t);
  await page.locator('#fb-red select').first().selectOption('p1');
  await page.locator('#fb-blue select').first().selectOption('sample-striker');
  await page.selectOption('#fb-time', '60');
  await page.selectOption('#fb-limit', '0');
  await page.click('#fb-start');
  await page.waitForFunction(() =>
    window.__FOOTBALL__().running &&
    document.getElementById('fb-countdown').hidden &&
    !document.getElementById('fb-pause').disabled);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const before = await page.evaluate(() => window.__FOOTBALL__());
  const playerBefore = before.cards.find(card => card.name === 'Player 1');
  assert.ok(playerBefore);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  try {
    await page.waitForTimeout(2000);
  } finally {
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyD');
  }
  const after = await page.evaluate(() => window.__FOOTBALL__());
  const playerAfter = after.cards.find(card => card.name === 'Player 1');
  assert.ok(after.timeLeft < before.timeLeft);
  assert.ok(
    playerAfter.touches > playerBefore.touches ||
    Math.abs(playerAfter.x - playerBefore.x) > 1 ||
    Math.abs(playerAfter.y - playerBefore.y) > 1,
    'Player 1 must move or touch the ball'
  );
  assert.deepEqual(errors, []);
});

test('phone layout fits the viewport and displays the pitch and touch controls', {
  timeout: 30000
}, async t => {
  const { page, errors } = await openPage(t, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await page.locator('#fb-canvas').scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => {
    const canvas = document.getElementById('fb-canvas').getBoundingClientRect();
    const stick = document.getElementById('fb-stick').getBoundingClientRect();
    const kick = document.getElementById('fb-kick').getBoundingClientRect();
    const visible = rectangle => rectangle.width > 0 && rectangle.height > 0 &&
      rectangle.left >= 0 && rectangle.right <= innerWidth &&
      rectangle.bottom > 0 && rectangle.top < innerHeight;
    return {
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth,
      canvas: visible(canvas),
      stick: visible(stick),
      kick: visible(kick),
      stickWidth: stick.width,
      kickWidth: kick.width,
      aspect: canvas.width / canvas.height,
      coarse: matchMedia('(pointer: coarse)').matches
    };
  });
  assert.equal(layout.overflow, false);
  assert.equal(layout.coarse, true);
  assert.equal(layout.canvas, true);
  assert.equal(layout.stick, true);
  assert.equal(layout.kick, true);
  assert.equal(layout.stickWidth, 140);
  assert.ok(layout.kickWidth >= 72);
  assert.ok(Math.abs(layout.aspect - 900 / 460) < 0.02);
  assert.deepEqual(errors, []);
});
