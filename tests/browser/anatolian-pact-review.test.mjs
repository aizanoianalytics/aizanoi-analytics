import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function session(options, run) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', ...options });
  const page = await context.newPage();
  const errors = [], violations = [];
  await page.addInitScript(() => {
    window.__PACT_CSP_VIOLATIONS__ = [];
    document.addEventListener('securitypolicyviolation', event => {
      if (event.effectiveDirective.startsWith('style-src') ||
          event.effectiveDirective.startsWith('script-src') && event.blockedURI !== 'inline') {
        window.__PACT_CSP_VIOLATIONS__.push({
          directive: event.effectiveDirective,
          blocked: event.blockedURI
        });
      }
    });
  });
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/arcade/anatolian-pact/**', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; object-src 'none'"
      }
    });
  });
  try {
    await run(page);
    violations.push(...await page.evaluate(() => window.__PACT_CSP_VIOLATIONS__));
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function open(page, seats = Array(6).fill('human')) {
  const query = new URLSearchParams({ powers: seats.join(','), years: '6', speed: '0' });
  await page.goto(`${base}/arcade/anatolian-pact/?${query}`);
  await page.waitForFunction(() => typeof window.__ANATOLIAN_PACT__ === 'function');
  await assertFullRoster(page, 'anatolian-pact');
}

async function enterOrders(page) {
  await open(page, [
    'human', 'sample-turtle', 'sample-turtle',
    'sample-turtle', 'sample-turtle', 'sample-turtle'
  ]);
  await page.locator('#ap-start').click();
  await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
  await page.waitForFunction(() => window.__ANATOLIAN_PACT__().phase === 'negotiate-answer');
  await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
  await page.locator('#ap-submit-orders').waitFor({ state: 'visible' });
}

test('semantically invalid human proposal stays editable', { timeout: 60000 }, async () => {
  await session({}, async page => {
    await open(page);
    await page.locator('#ap-start').click();
    await page.locator('#ap-pass-confirm').click();
    await page.getByLabel('Deal type', { exact: true }).selectOption('support');
    await page.getByLabel('Partner', { exact: true }).selectOption('Cilicia');
    await page.locator('#ap-neg-body button').filter({ hasText: /^Add proposal$/ }).click();
    assert.equal(await page.locator('#ap-neg-body ol li').count(), 1);
    await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
    assert.equal(await page.locator('#ap-negotiate').isVisible(), true);
    assert.equal(await page.locator('#ap-pass').isVisible(), false);
    assert.match(await page.locator('#ap-ticker').textContent(), /Invalid proposal/);
    const state = await page.evaluate(() => window.__ANATOLIAN_PACT__());
    assert.equal(state.phase, 'negotiate-propose');
    assert.equal(state.waitingFor[0], 'Phrygia');
    await page.locator('#ap-neg-body ol button').filter({ hasText: /^Remove$/ }).click();
    await page.locator('#ap-negotiate button').filter({ hasText: /^Done$/ }).click();
    await page.locator('#ap-pass').waitFor({ state: 'visible' });
    assert.match(await page.locator('#ap-pass-title').textContent(), /Lydia/);
  });
});

test('keyboard order entry creates, removes and submits a real draft', { timeout: 60000 }, async () => {
  await session({}, async page => {
    await enterOrders(page);
    const unit = page.getByLabel('Your unit', { exact: true });
    await unit.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const action = page.getByLabel('Legal order', { exact: true });
    await action.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ap-orders li').count(), 1);
    assert.match(await page.locator('#ap-orders li').textContent(), /holds/);
    await page.locator('#ap-orders button').filter({ hasText: /^Remove$/ }).click();
    assert.equal(await page.locator('#ap-orders li').count(), 0);
    await unit.selectOption('M');
    await action.selectOption('0');
    assert.equal(await page.locator('#ap-orders li').count(), 1);
    await page.locator('#ap-submit-orders').click();
    await page.waitForFunction(() => window.__ANATOLIAN_PACT__().season === 'Autumn');
    assert.ok(await page.locator('#ap-log li').count() > 0);
  });
});

test('phone offers full-name controls and inspector without horizontal overflow', { timeout: 60000 }, async () => {
  await session({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce'
  }, async page => {
    await enterOrders(page);
    await page.getByLabel('Inspect province', { exact: true }).selectOption('M');
    assert.match(await page.locator('.ap-inspector p').textContent(), /Aizanoi/);
    assert.match(await page.locator('.ap-inspector p').textContent(), /Phrygia army/);
    assert.match(await page.locator('.ap-map-legend').textContent(), /province codes/);
    const unit = page.getByLabel('Your unit', { exact: true });
    await unit.selectOption('M');
    await page.getByLabel('Legal order', { exact: true }).selectOption('0');
    assert.match(await page.locator('#ap-orders li').textContent(), /Aizanoi holds/);
    const dimensions = await page.evaluate(() => {
      const rect = document.getElementById('ap-canvas').getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        width: rect.width,
        height: rect.height,
        directAspectRatio: document.getElementById('ap-canvas').style.aspectRatio
      };
    });
    assert.ok(dimensions.scroll <= dimensions.viewport, JSON.stringify(dimensions));
    assert.ok(dimensions.width > 200 && dimensions.width <= 390);
    assert.ok(dimensions.height > 100);
    assert.equal(dimensions.directAspectRatio, '');
  });
});
