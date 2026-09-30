import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Aizanoi launches from AizanoiOS desktop shortcut and navigates to canonical runtime', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  try {
    await page.goto(`${base}/?aizanoi-launch-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    // Click the Aizanoi desktop shortcut
    const shortcut = page.locator('.az-desktop-shortcut[data-app="aizanoi"]:visible');
    await shortcut.waitFor({ state: 'visible', timeout: 15000 });
    await shortcut.click();
    // The module should navigate to the canonical runtime
    await page.waitForURL('**/worlds/aizanoi-225/**', { timeout: 30000 });
    // Verify no "Opening application…" placeholder remains
    const emptyState = await page.locator('.az-empty-state').count();
    assert.equal(emptyState, 0, 'no "Opening application…" placeholder may remain after navigation');
    // Verify the world runtime is actually loading
    await page.waitForSelector('#world-canvas, #aizanoi-canvas, canvas', { timeout: 30000 });
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});

test('Aizanoi launches from AizanoiOS launcher overlay and navigates to canonical runtime', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  try {
    await page.goto(`${base}/?aizanoi-launcher-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    // Open the launcher overlay
    const launcher = page.locator('[data-os-launcher]:visible');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await launcher.click();
    // Wait for the launcher to render
    await page.waitForSelector('.az-launchpad-overlay .az-launchpad-item:visible', { timeout: 15000 });
    // Click Aizanoi in the launcher
    const aizanoiItem = page.locator('.az-launchpad-item[data-app="aizanoi"]:visible');
    await aizanoiItem.waitFor({ state: 'visible', timeout: 15000 });
    await aizanoiItem.click();
    // The module should navigate to the canonical runtime
    await page.waitForURL('**/worlds/aizanoi-225/**', { timeout: 30000 });
    // Verify no "Opening application…" placeholder remains
    const emptyState = await page.locator('.az-empty-state').count();
    assert.equal(emptyState, 0, 'no "Opening application…" placeholder may remain after navigation');
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});

test('Aizanoi appears exactly once in the launcher overlay', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/?aizanoi-count-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    const launcher = page.locator('[data-os-launcher]:visible');
    await launcher.waitFor({ state: 'visible', timeout: 15000 });
    await launcher.click();
    await page.waitForSelector('.az-launchpad-overlay .az-launchpad-item:visible', { timeout: 15000 });
    const aizanoiCount = await page.locator('.az-launchpad-item[data-app="aizanoi"]:visible').count();
    assert.equal(aizanoiCount, 1, 'Aizanoi must appear exactly once in the launcher');
  } finally {
    await browser.close();
  }
});
