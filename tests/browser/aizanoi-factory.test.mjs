import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-src 'self'; worker-src 'self' blob:;";

test('Factory standalone boots, renders frames and toggles help under production CSP', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', req => failed.push(`${req.url()}: ${req.failure()?.errorText}`));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__violations = [...(window.__violations || []), `${e.violatedDirective}:${e.blockedURI}`]));
    await page.route('**/arcade/factory/**', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    });
    await page.goto(`${base}/arcade/factory/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    try {
      await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 100000 });
    } catch (error) {
      const state = await page.evaluate(() => ({ boot: document.querySelector('#boot-msg')?.textContent, fatal: window.__fatal, frames: window.__frames })).catch(() => null);
      throw new Error(`Factory boot did not finish: ${JSON.stringify({ state, errors, failed })}`, { cause: error });
    }
    const initial = await page.evaluate(() => ({ ready: window.__ready, fatal: window.__fatal, frames: window.__frames, width: document.querySelector('#view')?.width, engine: typeof window.AZ_ENGINE, violations: window.__violations || [] }));
    assert.equal(initial.fatal, null, JSON.stringify(initial));
    assert.equal(initial.ready, true, JSON.stringify(initial));
    assert.ok(initial.frames >= 2 && initial.width > 0, JSON.stringify(initial));
    assert.equal(initial.engine, 'object', JSON.stringify(initial));
    await page.locator('#boot').waitFor({ state: 'hidden', timeout: 30000 });
    // Trusted interaction: the H control opens the controls modal and toggles it shut.
    await page.locator('#btn-help').click({ timeout: 10000 });
    await page.locator('#help-modal:not([hidden])').waitFor({ timeout: 10000 });
    await page.locator('#btn-help').click({ timeout: 10000 });
    await page.locator('#help-modal[hidden]').waitFor({ timeout: 10000 });
    assert.ok(await page.evaluate(() => document.querySelector('#zone-name')?.textContent.length > 0), 'HUD zone readout renders');
    assert.deepEqual(await page.evaluate(() => window.__violations || []), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    await context.close();
  } finally { await browser.close(); }
});

test('Factory is independently launchable in AizanoiOS and closes its iframe', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-webgl'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`${base}/?app=factory`, { waitUntil: 'domcontentloaded' });
    const win = page.locator('.az-window[data-app-id="factory"]:visible');
    await win.waitFor({ timeout: 20000 });
    const frame = win.locator('iframe[title="Aizanoi Factory 3D space"]');
    await frame.waitFor();
    assert.equal(await frame.getAttribute('src'), '/arcade/factory/');
    assert.equal(await win.locator('.az-empty-state').count(), 0);
    await win.locator('[data-action="close"]').click();
    assert.equal(await page.locator('iframe[title="Aizanoi Factory 3D space"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});
