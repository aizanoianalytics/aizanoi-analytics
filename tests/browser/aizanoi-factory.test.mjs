import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-src 'self'; worker-src 'self' blob:;";

test('Factory standalone boots, shows Free Tour / Battle Mode selector, renders frames and toggles help under production CSP', { timeout: 240000 }, async () => {
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

    // Mode selection modal should appear on launch
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('#mode-modal');
        if (!el || el.hidden) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 40 && rect.height > 40;
      }, null, { timeout: 20000 });
    } catch (error) {
      const state = await page.evaluate(() => {
        const el = document.querySelector('#mode-modal');
        const rect = el ? el.getBoundingClientRect() : null;
        return { hidden: el ? el.hidden : null, rect, fatal: window.__fatal, ready: window.__ready };
      }).catch(() => null);
      throw new Error(`Mode modal did not open: ${JSON.stringify(state)}`, { cause: error });
    }
    const tourHit = await page.evaluate(() => {
      const btn = document.querySelector('#btn-start-tour');
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, ok: !!(el && btn.contains(el)), hit: el && (el.id || el.className) };
    });
    assert.equal(tourHit.ok, true, JSON.stringify(tourHit));
    await page.mouse.click(tourHit.x, tourHit.y);
    await page.locator('#mode-modal').waitFor({ state: 'hidden', timeout: 10000 });

    const helpHit = await page.evaluate(() => {
      const btn = document.querySelector('#btn-help');
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, ok: !!(el && btn.contains(el)), hit: el && (el.id || el.className) };
    });
    assert.equal(helpHit.ok, true, JSON.stringify(helpHit));
    await page.mouse.click(helpHit.x, helpHit.y);
    await page.locator('#help-modal:not([hidden])').waitFor({ timeout: 10000 });
    const closeHit = await page.evaluate(() => {
      const btn = document.querySelector('#btn-help-close');
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, ok: !!(el && btn.contains(el)), hit: el && (el.id || el.className) };
    });
    assert.equal(closeHit.ok, true, JSON.stringify(closeHit));
    await page.mouse.click(closeHit.x, closeHit.y);
    await page.locator('#help-modal').waitFor({ state: 'hidden', timeout: 10000 });
    const qualityHit = await page.evaluate(() => {
      const btn = document.querySelector('#btn-quality');
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, ok: !!(el && btn.contains(el)), hit: el && (el.id || el.className) };
    });
    assert.equal(qualityHit.ok, true, JSON.stringify(qualityHit));
    assert.ok(await page.evaluate(() => document.querySelector('#zone-name')?.textContent.length > 0), 'HUD zone readout renders');

    // Switch to Battle Mode and verify Combat HUD activates
    const modeHit = await page.evaluate(() => {
      const btn = document.querySelector('#btn-game-mode');
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, ok: !!(el && btn.contains(el)), hit: el && (el.id || el.className) };
    });
    assert.equal(modeHit.ok, true, JSON.stringify(modeHit));
    await page.mouse.click(modeHit.x, modeHit.y);
    await page.locator('#mode-modal:not([hidden])').waitFor({ timeout: 10000 });
    const combatHit = await page.evaluate(() => {
      const btn = document.querySelector('#btn-start-combat');
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const el = document.elementFromPoint(x, y);
      return { x, y, ok: !!(el && btn.contains(el)), hit: el && (el.id || el.className) };
    });
    assert.equal(combatHit.ok, true, JSON.stringify(combatHit));
    await page.mouse.click(combatHit.x, combatHit.y);
    await page.locator('#combat-hud:not([hidden])').waitFor({ timeout: 10000 });
    const combatState = await page.evaluate(() => ({
      mode: window.__factory?.getMode(),
      bodyClass: document.body.classList.contains('mode-combat'),
      ammo: document.querySelector('#combat-ammo')?.textContent,
      hp: document.querySelector('#combat-hp')?.textContent,
    }));
    assert.equal(combatState.mode, 'combat');
    assert.equal(combatState.bodyClass, true);
    assert.ok(Number(combatState.ammo) > 0, JSON.stringify(combatState));
    assert.equal(combatState.hp, '100', JSON.stringify(combatState));

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
