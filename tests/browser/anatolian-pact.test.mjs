import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const bots = [
  'sample-schemer', 'sample-expander', 'sample-turtle',
  'sample-schemer', 'sample-expander', 'sample-turtle'
];

async function session(options, run) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    serviceWorkers: 'block',
    ...options
  });
  const page = await context.newPage();
  await context.route('**/arcade/anatolian-pact/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': 'default-src \'self\'; script-src \'self\'; style-src \'self\'; worker-src \'self\'; object-src \'none\''
      }
    });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await run(page, errors);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function open(page, seats, extra = '') {
  const query = new URLSearchParams({ powers: seats.join(','), years: '6' });
  await page.goto(`${base}/arcade/anatolian-pact/?${query}${extra}`);
  await page.waitForFunction(() => typeof window.__ANATOLIAN_PACT__ === 'function');
  await assertFullRoster(page, 'anatolian-pact');
  await page.locator('#ap-speed').selectOption('0');
}

async function qa(page) {
  return page.evaluate(() => window.__ANATOLIAN_PACT__());
}

test('six bots complete six years with no page errors', { timeout: 180000 }, async () => {
  await session({}, async page => {
    await open(page, bots);
    await page.locator('#ap-start').click();
    await page.waitForFunction(
      () => Boolean(window.__ANATOLIAN_PACT__?.().result),
      null,
      { timeout: 150000 }
    );
    const state = await qa(page);
    assert.equal(state.powers.length, 6);
    assert.ok(state.powers.every(p => p.kind === 'bot'));
    assert.ok(state.result.reason === 'majority' || state.result.reason === 'years');
    assert.ok(state.result.year <= 6);
    assert.equal(Object.keys(state.result.centres).length, 6);
    assert.ok(await page.locator('#ap-result').isVisible());
    assert.ok((await page.locator('#ap-result').textContent()).length > 0);
    await page.waitForFunction(() => !window.__ANATOLIAN_PACT__().running);
  });
});

test('one human can submit all holds and advance the season', { timeout: 60000 }, async () => {
  await session({}, async page => {
    await open(page, ['human', ...bots.slice(1)]);
    await page.locator('#ap-start').click();
    await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
    await page.waitForFunction(() =>
      window.__ANATOLIAN_PACT__().phase === 'negotiate-answer');
    await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
    await page.locator('#ap-submit-orders').waitFor({ state: 'visible' });
    const before = await qa(page);
    assert.equal(before.phase, 'orders');
    assert.equal(await page.locator('#ap-orders li').count(), 0);
    await page.locator('#ap-submit-orders').click();
    await page.waitForFunction(previous => {
      const state = window.__ANATOLIAN_PACT__();
      return state.year !== previous.year || state.season !== previous.season;
    }, before);
    assert.equal(await page.locator('#ap-pass').isVisible(), false);
  });
});

test('two humans must pass the device between private inputs', { timeout: 60000 }, async () => {
  await session({}, async page => {
    await open(page, ['human', 'human', ...bots.slice(2)]);
    await page.locator('#ap-start').click();
    await page.locator('#ap-pass').waitFor({ state: 'visible' });
    assert.match(
      await page.locator('#ap-pass-title').textContent(),
      /Pass the device to Phrygia/
    );
    assert.equal(await page.locator('#ap-negotiate').isVisible(), false);
    await page.locator('#ap-pass-confirm').click();
    await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
    await page.locator('#ap-pass').waitFor({ state: 'visible' });
    assert.match(
      await page.locator('#ap-pass-title').textContent(),
      /Pass the device to Lydia/
    );
    assert.equal(await page.locator('#ap-negotiate').isVisible(), false);
    assert.equal(await page.locator('#ap-neg-body').textContent(), '');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ap-pass').isVisible(), true);
    const state = await qa(page);
    assert.ok(!Object.hasOwn(state, 'orders'));
    assert.ok(!Object.hasOwn(state, 'proposals'));
  });
});

test('phone layout keeps the map visible without horizontal overflow', { timeout: 30000 }, async () => {
  await session({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  }, async page => {
    await open(page, bots);
    const canvas = page.locator('#ap-canvas');
    await canvas.scrollIntoViewIfNeeded();
    assert.equal(await canvas.isVisible(), true);
    const geometry = await page.evaluate(() => {
      const rect = document.getElementById('ap-canvas').getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height
      };
    });
    assert.ok(geometry.scroll <= geometry.viewport, JSON.stringify(geometry));
    assert.ok(geometry.left >= 0 && geometry.right <= 390);
    assert.ok(geometry.width > 200 && geometry.height > 100);
  });
});
