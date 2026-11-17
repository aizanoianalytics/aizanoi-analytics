import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Daire boots and the help key opens the note', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/arcade/daire/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 100000 });
    const state = await page.evaluate(() => ({ ready: window.__ready, fatal: window.__fatal, frames: window.__frames, zone: document.querySelector('#zone-name')?.textContent }));
    assert.equal(state.fatal, null, JSON.stringify(state));
    assert.equal(state.ready, true, JSON.stringify(state));
    assert.match(state.zone, /Koridor|Mutfak|Salon/);
    await page.keyboard.press('h');
    await page.locator('#help-modal:not([hidden])').waitFor({ timeout: 10000 });
    await page.keyboard.press('h');
    await page.locator('#help-modal').waitFor({ state: 'hidden', timeout: 10000 });
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
});

test('Ev is its own desktop window and closes the iframe', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-webgl'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`${base}/?app=daire`, { waitUntil: 'domcontentloaded' });
    const win = page.locator('.az-window[data-app-id="daire"]:visible');
    await win.waitFor({ timeout: 20000 });
    const frame = win.locator('iframe[title="Ev"]');
    await frame.waitFor();
    assert.equal(await frame.getAttribute('src'), '/arcade/daire/');
    await win.locator('[data-action="close"]').click();
    assert.equal(await page.locator('iframe[title="Ev"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});
