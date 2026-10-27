import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

for (const [name, viewport, launcher] of [
  ['desktop', { width: 1440, height: 900 }, '.az-desktop-shortcut[data-app="snake-royale"]:visible'],
  ['tablet', { width: 834, height: 1112 }, '.az-tablet-app[data-app="snake-royale"]:visible'],
  ['phone', { width: 390, height: 844 }, '.az-phone-app[data-app="snake-royale"]:visible'],
  ['compact', { width: 320, height: 568 }, '.az-phone-app[data-app="snake-royale"]:visible'],
]) {
  test(`Snake Royale opens as an in-shell ${name} app and releases workers on close`, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      const nativeFill = CanvasRenderingContext2D.prototype.fillRect;
      window.__snakePaints = new WeakMap();
      CanvasRenderingContext2D.prototype.fillRect = function (...args) {
        window.__snakePaints.set(this.canvas, (window.__snakePaints.get(this.canvas) || 0) + 1);
        return nativeFill.apply(this, args);
      };
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
        canvasHeight: el.querySelector('canvas').getBoundingClientRect().height,
        content: el.querySelector('.sr-app').getBoundingClientRect().width,
        overflow: el.querySelector('.sr-app').scrollWidth - el.querySelector('.sr-app').clientWidth,
      }));
      assert.ok(Math.min(metrics.canvas, metrics.canvasHeight) >= 150 && metrics.content > 200, JSON.stringify(metrics));
      assert.ok(metrics.overflow <= 1, JSON.stringify(metrics));
      const geometry = await win.evaluate(el => {
        const bounds = el.querySelector('[data-app-body]').getBoundingClientRect();
        return ['canvas', '[data-cards]', '[data-ticker]'].map(selector => {
          const r = el.querySelector(selector).getBoundingClientRect();
          return { selector, top: r.top, bottom: r.bottom, limit: bounds.bottom, visible: r.top >= bounds.top && r.bottom <= bounds.bottom + 1 };
        });
      });
      assert.ok(geometry.every(item => item.visible), JSON.stringify(geometry));
      assert.match(await win.locator('[data-cards]').innerText(), /A ·/);
      assert.match(await win.locator('[data-cards]').innerText(), /B ·/);
      assert.equal(await win.locator('.sr-app-card[data-fighter=A]').count(), 1);
      assert.equal(await win.locator('.sr-app-card[data-fighter=B]').count(), 1);
      await win.locator('[name=speed]').selectOption('0');
      await win.getByRole('button', { name: 'Fight', exact: true }).click();
      await win.locator('[data-result]:visible').waitFor({ timeout: 90000 });
      assert.match(await win.locator('[data-result]').textContent(), /wins|Draw/);
      await win.locator('[name=b]').selectOption(await win.locator('[name=a]').inputValue());
      await win.getByRole('button', { name: 'Fight', exact: true }).click();
      assert.equal(await win.locator('[data-result]').isVisible(), false, 'invalid pair clears the previous winner');
      await win.locator('[data-ticker]').getByText('Pick two different fighters.').waitFor();
      await win.locator('[data-random]').click();
      await win.getByRole('button', { name: 'Fight', exact: true }).click();
      await page.waitForFunction(() => window.__snakeWorkers.length >= 4);
      await win.locator('canvas').evaluate(canvas => { window.__closedSnakeCanvas = canvas; });
      await win.locator('[data-action="close"]').click();
      const paintsAfterClose = await page.evaluate(() => window.__snakePaints.get(window.__closedSnakeCanvas));
      await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
      assert.equal(await page.evaluate(() => window.__snakePaints.get(window.__closedSnakeCanvas)), paintsAfterClose, 'closed arena must stop painting');
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
    assert.equal(await win.locator('[name=a]').isDisabled(), true);
    assert.equal(await win.locator('[name=b]').isDisabled(), true);
    await win.getByRole('button', { name: 'Retry' }).click();
    await win.locator('[data-ticker]').getByText(/could not be loaded/i).waitFor({ timeout: 30000 });
  } finally { await browser.close(); }
});
