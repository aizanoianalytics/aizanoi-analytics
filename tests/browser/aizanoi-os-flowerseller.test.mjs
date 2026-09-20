import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function openFlowerseller(page) {
  await page.goto(`${base}/?flowerseller-qa=${Date.now()}`, { waitUntil:'networkidle' });
  const shortcut = page.locator('.az-desktop-shortcut[data-app="flowerseller"]:visible');
  const phoneShortcut = page.locator('.az-phone-app[data-app="flowerseller"]:visible');
  await (await shortcut.count() ? shortcut : phoneShortcut).click();
  await page.locator('.fs-app').waitFor({ state:'visible' });
}

test('Flowerseller desktop store, filters, detail, basket and README work', async () => {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1440, height:900 }, serviceWorkers:'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await openFlowerseller(page);
    assert.equal(await page.locator('.fs-product-card').count(), 6);
    await page.locator('[data-category="Minimal"]').click();
    assert.equal(await page.locator('.fs-product-card').count(), 1);
    await page.locator('[data-product="sessiz-bahce"]').click();
    await page.locator('.fs-detail').waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('[data-close-detail]'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.fs-detail').count(), 0);
    assert.equal(await page.locator('[data-product="sessiz-bahce"]').evaluate((node) => node === document.activeElement), true);
    await page.locator('[data-product="sessiz-bahce"]').click();
    await page.locator('.fs-detail [data-add="sessiz-bahce"]').click();
    assert.equal(await page.locator('.fs-basket b').innerText(), '1');
    await page.locator('[data-tab="readme"]').click();
    assert.equal(await page.locator('.fs-readme-grid article').count(), 12);
    assert.match(await page.locator('.fs-readme').innerText(), /idempotency/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Flowerseller stays usable at 320px with no horizontal overflow', async () => {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ ...devices['iPhone 13'], viewport:{ width:320, height:844 }, serviceWorkers:'block' });
  const page = await context.newPage();
  try {
    await openFlowerseller(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.equal(await page.locator('.fs-product-card').count(), 6);
    await page.locator('[data-tab="readme"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.ok(await page.locator('.fs-readme-grid article').first().isVisible());
  } finally { await browser.close(); }
});
