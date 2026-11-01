// Dungeon UX/a11y contracts (audit A13-A21 plus the in-shell exit path):
//   * settings is a real modal: focus moves in, Tab is trapped, the background
//     is inert, Escape closes it and focus returns to the exact opener;
//   * native range/select keys are not swallowed by the game keydown handler;
//   * changing a segmented setting keeps focus on the same control;
//   * the blessing draft is a modal too and "Decide later" keeps it pending;
//   * the in-shell exit button is labelled, >=44px and closes the app without
//     leaving dungeon listeners, classes, styles or stylesheets behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'];

async function boot(browser, url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 }, serviceWorkers: 'block', ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}

test('settings and blessing draft are real modals with safe keyboard handling', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args });
  try {
    const { page, errors } = await boot(browser, `${base}/dungeon/?ux=${Date.now()}`);
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.frames > 0, null, { timeout: 60000 });
    const warning = page.locator('.az-play-anyway');
    if (await warning.isVisible()) await warning.click();

    // Exit control: labelled, visible, >=44px.
    const exit = page.locator('.az-dungeon-exit');
    assert.equal(await exit.getAttribute('aria-label'), 'Return to AizanoiOS');
    const box = await exit.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `exit target ${box.width}x${box.height}`);

    // Settings from the menu button: opener restored on close.
    const opener = page.locator('.az-dungeon-settings-open');
    await opener.focus();
    await opener.click();
    const panel = page.locator('.az-dungeon-settings');
    await panel.waitFor();
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.az-dungeon-settings')), true, 'focus moves into settings');
    assert.equal(await page.evaluate(() => document.querySelector('.az-dungeon-menu').inert), true, 'background is inert');
    assert.equal(await page.locator('.az-dungeon-settings-row input[aria-label="Music volume"]').count(), 0, 'no dead music slider');

    // Tab never leaves the panel.
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.az-dungeon-settings')), true, `Tab escaped on press ${i}`);
    }
    // Arrow keys reach a focused range input.
    const master = page.locator('input[aria-label="Master volume"]');
    await master.focus();
    const before = await master.inputValue();
    await page.keyboard.press('ArrowLeft');
    assert.notEqual(await master.inputValue(), before, 'ArrowLeft must move the slider');
    // Segmented setting keeps the focused control.
    const manual = page.locator('[data-setting="assistMode"] button[data-value="manual"]');
    await manual.focus();
    await page.keyboard.press('Enter');
    assert.equal(await manual.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.value), 'manual', 'focus stays on the pressed option');
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('az-dungeon-settings-open')), true, 'opener restored');
    assert.equal(await page.evaluate(() => document.querySelector('.az-dungeon-menu').inert), false);

    // Natural combat reaches the draft.
    await page.locator('.az-dungeon-begin').first().click();
    await page.keyboard.down('k');
    for (let i = 0; i < 90; i += 1) {
      await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(20));
      if (await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyCount === 0 && window.AIZANOI_DUNGEON_GAME.status.pendingSpawns === 0)) break;
    }
    await page.keyboard.up('k');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.qaAdvance(1));
    await page.locator('.az-dungeon-pick').waitFor({ timeout: 15000 });
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.az-dungeon-pick')), true, 'focus moves into the draft');
    const gold = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger.gold);
    const blessings = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.buffs.blessings.length);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.az-dungeon-pick').isVisible(), true, 'Escape cannot sell the blessing');
    await page.locator('.az-dungeon-pick-later').click();
    assert.equal(await page.locator('.az-dungeon-pick').isVisible(), false);
    assert.equal(await page.evaluate(() => document.querySelector('.az-dungeon-exit').inert), false, 'exit reachable while draft is set aside');
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.ledger.gold), gold);
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.buffs.blessings.length), blessings);
    await page.locator('.az-dungeon-pick-reopen').click();
    assert.equal(await page.locator('.az-dungeon-pick').isVisible(), true);
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.az-dungeon-pick')), true);
    await page.locator('.az-dungeon-pick-card').first().click();
    assert.equal(await page.locator('.az-dungeon-pick').count(), 0);
    assert.equal(await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.buffs.blessings.length), blessings + 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('closing the dungeon from the shell leaves no listeners, classes or styles behind', { timeout: 240000 }, async () => {
  const browser = await chromium.launch({ args });
  try {
    const { context, page, errors } = await boot(browser, `${base}/?dungeon-exit=${Date.now()}`);
    await context.addInitScript(() => {});
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const net = new Map();
      window.__dungeonListeners = net;
      for (const target of [window, document]) {
        const add = target.addEventListener.bind(target);
        const remove = target.removeEventListener.bind(target);
        const name = target === window ? 'window' : 'document';
        target.addEventListener = (type, fn, opts) => {
          if (String(new Error().stack).includes('apps/dungeon')) net.set(`${name}:${type}`, (net.get(`${name}:${type}`) || 0) + 1);
          return add(type, fn, opts);
        };
        target.removeEventListener = (type, fn, opts) => {
          if (String(new Error().stack).includes('apps/dungeon')) net.set(`${name}:${type}`, (net.get(`${name}:${type}`) || 0) - 1);
          return remove(type, fn, opts);
        };
      }
    });
    const snapshot = () => page.evaluate(() => ({
      htmlClass: document.documentElement.className,
      htmlStyle: document.documentElement.getAttribute('style'),
      bodyClass: document.body.className,
      bodyStyle: document.body.getAttribute('style'),
      htmlAttrs: document.documentElement.getAttributeNames().sort().join(','),
      bodyAttrs: document.body.getAttributeNames().sort().join(','),
      dungeonCss: !!document.getElementById('aizanoi-dungeon-css'),
      globalHandle: typeof window.AIZANOI_DUNGEON_GAME,
    }));
    const before = await snapshot();
    await page.evaluate(() => (window.AIZANOI_OS || window.AizanoiOS || window.__AIZANOI_OS__).openApp('dungeon'));
    await page.waitForSelector('.aizanoi-dungeon3d-app-root canvas', { timeout: 60000 });
    const exit = page.locator('.az-dungeon-exit');
    await exit.waitFor();
    const box = await exit.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `exit target ${box.width}x${box.height}`);
    assert.equal(await exit.getAttribute('aria-label'), 'Return to AizanoiOS');
    await exit.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.aizanoi-dungeon3d-app-root', { state: 'detached', timeout: 15000 });
    await page.waitForTimeout(300);
    const after = await snapshot();
    assert.deepEqual(after, before, 'document-level state is unchanged after closing');
    const leaked = await page.evaluate(() => [...window.__dungeonListeners].filter(([, n]) => n !== 0));
    assert.deepEqual(leaked, [], 'every dungeon listener on window/document is removed');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
