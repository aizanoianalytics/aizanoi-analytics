import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Aizanoi TV explore actions stay fully inside the desktop window', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(`${base}/?app=videos`, { waitUntil: 'domcontentloaded' });
    const win = page.locator('.az-window[data-app-id="videos"]:visible');
    await win.locator('.az-tv-related').waitFor({ timeout: 30000 });
    const geometry = await win.evaluate(el => {
      const bounds = el.querySelector('[data-app-body]').getBoundingClientRect();
      const related = el.querySelector('.az-tv-related').getBoundingClientRect();
      return { top: related.top, bottom: related.bottom, limit: bounds.bottom, visible: related.bottom <= bounds.bottom + 1 };
    });
    assert.ok(geometry.visible, JSON.stringify(geometry));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
