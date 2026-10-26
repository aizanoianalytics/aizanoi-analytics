import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

for (const [name, viewport, launcher] of [
  ['desktop', { width: 1440, height: 900 }, '.az-desktop-shortcut[data-app="snake-royale"]:visible'],
  ['tablet', { width: 834, height: 1112 }, '.az-tablet-app[data-app="snake-royale"]:visible'],
  ['phone', { width: 390, height: 844 }, '.az-phone-app[data-app="snake-royale"]:visible'],
]) {
  test(`Snake Royale opens as an in-shell ${name} app and releases workers on close`, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__snakeWorkers = [];
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); this.stopped = false; window.__snakeWorkers.push(this); }
        terminate() { this.stopped = true; return super.terminate(); }
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.route('**/?snake-test=*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'" } });
      });
      await page.goto(`${base}/?snake-test=${Date.now()}`, { waitUntil: 'domcontentloaded' });
      await page.locator(launcher).click({ timeout: 30000 });
      const win = page.locator('.az-window[data-app-id="snake-royale"]:visible');
      await page.waitForFunction(() => document.querySelectorAll('.az-window[data-app-id="snake-royale"] [name=a] option').length >= 20, null, { timeout: 30000 });
      assert.equal(await win.locator('iframe').count(), 0);
      assert.equal(await win.locator('.az-empty-state').count(), 0);
      assert.ok(await win.locator('[name=a] option').count() >= 20);
      const metrics = await win.evaluate(el => ({
        canvas: el.querySelector('canvas').getBoundingClientRect().width,
        content: el.querySelector('.sr-app').getBoundingClientRect().width,
        overflow: el.querySelector('.sr-app').scrollWidth - el.querySelector('.sr-app').clientWidth,
      }));
      assert.ok(metrics.canvas > 100 && metrics.content > 200, JSON.stringify(metrics));
      assert.ok(metrics.overflow <= 1, JSON.stringify(metrics));
      await win.locator('[name=speed]').selectOption('0');
      await win.getByRole('button', { name: 'Fight', exact: true }).click();
      await win.locator('[data-result]:visible').waitFor({ timeout: 90000 });
      assert.match(await win.locator('[data-result]').textContent(), /wins|Draw/);
      await win.getByRole('button', { name: 'Fight', exact: true }).click();
      await page.waitForFunction(() => window.__snakeWorkers.length >= 4);
      await win.locator('[data-action="close"]').click();
      assert.ok(await page.evaluate(() => window.__snakeWorkers.every(worker => worker.stopped)), 'all workers terminated');
      assert.equal(await page.locator('link[href="/js/v3/apps/snake-royale/src/app.css"]').count(), 0);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('unavailable fighter roster disables the game inside the shell', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.route('**/arcade/snake-royale/bots.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto(`${base}/?app=snake-royale`, { waitUntil: 'domcontentloaded' });
    const win = page.locator('.az-window[data-app-id="snake-royale"]:visible');
    await win.locator('[data-ticker]').getByText(/could not be loaded/i).waitFor({ timeout: 30000 });
    assert.equal(await win.getByRole('button', { name: 'Fight' }).isDisabled(), true);
    assert.equal(await win.getByRole('button', { name: 'Random pair' }).isDisabled(), true);
  } finally { await browser.close(); }
});
