import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('AizanoiOS Dungeon opens from the desktop, clears the placeholder and renders a live canvas', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  try {
    await page.goto(`${base}/?dungeon-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    const shortcut = page.locator('.az-desktop-shortcut[data-app="dungeon"]');
    await shortcut.waitFor({ state: 'visible', timeout: 15000 });
    assert.equal((await shortcut.innerText()).trim(), 'Dungeon');
    assert.equal(await shortcut.getAttribute('aria-label'), 'Open Aizanoi Dungeon');
    await page.evaluate(() => window.AIZANOI_OS?.openApp?.('dungeon'));
    const window_ = page.locator('.az-window[data-app-id="dungeon"]');
    await window_.waitFor({ state: 'visible', timeout: 15000 });
    await window_.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 });
    const state = await window_.evaluate((node) => {
      const canvas = node.querySelector('canvas');
      const rect = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
      return {
        canvasCount: node.querySelectorAll('canvas').length,
        placeholders: node.querySelectorAll('.az-empty-state').length,
        loadErrors: node.querySelectorAll('.aizanoi-dungeon-error').length,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
      };
    });
    assert.ok(state.canvasCount >= 1, 'dungeon window must host the Phaser canvas');
    assert.equal(state.placeholders, 0, 'Opening placeholder must be cleared by mount');
    assert.equal(state.loadErrors, 0, 'no Phaser load error UI on the happy path');
    assert.ok(state.canvasWidth > 0 && state.canvasHeight > 0, `canvas must have size, got ${state.canvasWidth}x${state.canvasHeight}`);
    await page.evaluate(() => window.AIZANOI_OS?.closeApp?.('dungeon'));
    await page.waitForTimeout(400);
    assert.equal(await window_.locator('canvas').count(), 0, 'closing the window must tear down the game');
    assert.deepEqual(errors, [], `page errors: ${JSON.stringify(errors)}`);
  } finally {
    await browser.close();
  }
});
