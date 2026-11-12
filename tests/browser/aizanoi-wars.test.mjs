import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-src 'self'; worker-src 'self' blob:";

test('Wars standalone boots and starts its real game under production CSP', { timeout: 135000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], violations = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', req => failed.push(`${req.url()}: ${req.failure()?.errorText}`));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => window.__violations = [...(window.__violations || []), `${e.violatedDirective}:${e.blockedURI}`]));
    await page.route('**/arcade/aizanoi-wars/**', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    });
    await page.goto(`${base}/arcade/aizanoi-wars/?q=low&noaudio=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    try {
      await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 100000 });
    } catch (error) {
      const state = await page.evaluate(() => ({ boot: document.querySelector('#boot-msg')?.textContent, fatal: window.__fatal, frames: window.__frames, errors: window.__errors?.slice(-5) })).catch(() => null);
      throw new Error(`Game boot did not finish: ${JSON.stringify({ state, errors, failed })}`, { cause: error });
    }
    const initial = await page.evaluate(() => ({ ready: window.__ready, fatal: window.__fatal, frames: window.__frames, state: window.__G?.game?.state, width: document.querySelector('#view')?.width, violations: window.__violations || [] }));
    assert.equal(initial.fatal, null, JSON.stringify(initial));
    assert.equal(initial.ready, true, JSON.stringify(initial));
    assert.ok(initial.frames >= 2 && initial.width > 0, JSON.stringify(initial));
    assert.equal(initial.state, 'title');
    // The first software-rendered frame may compile shaders after boot is ready.
    // Wait for the actual menu to be hit-testable, then use a trusted click.
    await page.locator('#boot').waitFor({ state: 'hidden', timeout: 30000 });
    await page.getByRole('button', { name: 'Deploy' }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__G?.game?.state === 'playing' || window.__fatal, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.__G?.game?.state), 'playing');
    assert.deepEqual(initial.violations, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    await context.close();
  } finally { await browser.close(); }
});

test('Wars is independently launchable in AizanoiOS and closes its iframe', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-webgl'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`${base}/?app=aizanoi-wars`, { waitUntil: 'domcontentloaded' });
    const win = page.locator('.az-window[data-app-id="aizanoi-wars"]:visible');
    await win.waitFor({ timeout: 20000 });
    const frame = win.locator('iframe[title="Aizanoi Wars game"]');
    await frame.waitFor();
    assert.equal(await frame.getAttribute('src'), '/arcade/aizanoi-wars/');
    assert.equal(await win.locator('.az-empty-state').count(), 0);
    await win.locator('[data-action="close"]').click();
    assert.equal(await page.locator('iframe[title="Aizanoi Wars game"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});
