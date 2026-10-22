// The dungeon is registered fullscreen, so it is mounted INSIDE the
// AizanoiOS shell document. Its stylesheet used to redefine the shell's
// global colour tokens (--az-ink, --az-focus, --az-panel, --az-surface-solid)
// on :root, which meant that while the dungeon was open:
//
//   * every focus ring in the shell turned from blue to the dungeon's gold,
//   * .az-paper-surface text flipped to near-black on a near-white paper,
//     which is an accessibility contrast failure,
//   * color-scheme: dark flipped every native control in the shell.
//
// The tokens are now scoped to the app root and the standalone body. This
// test opens the dungeon in the real shell and checks the shell's tokens are
// untouched while the game is live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || process.env.DG3D_BASE_URL || 'http://127.0.0.1:4173';

const readShellTokens = (page) => page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  return {
    ink: root.getPropertyValue('--az-ink').trim(),
    focus: root.getPropertyValue('--az-focus').trim(),
    surface: root.getPropertyValue('--az-surface-solid').trim(),
    panel: root.getPropertyValue('--az-panel').trim(),
    colourScheme: root.getPropertyValue('color-scheme').trim(),
    bodyColourScheme: body.colorScheme,
  };
});

test('opening the dungeon does not restyle the AizanoiOS shell', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  try {
    await page.goto(`${base}/?dungeon-tokens=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const before = await readShellTokens(page);
    assert.ok(before.ink.length > 0, 'the shell must define its own tokens');

    // Open the dungeon through the shell's own API, the way the launcher does.
    const opened = await page.evaluate(() => {
      const shell = window.AIZANOI_OS || window.AizanoiOS || window.__AIZANOI_OS__;
      if (!shell || typeof shell.openApp !== 'function') return false;
      shell.openApp('dungeon');
      return true;
    });
    assert.ok(opened, 'the shell must expose an app opener');

    // Wait for the dungeon to be really mounted and drawing.
    await page.waitForFunction(
      () => Boolean(document.querySelector('.aizanoi-dungeon3d-app-root canvas')),
      null,
      { timeout: 60000, polling: 250 },
    );

    const after = await readShellTokens(page);
    for (const token of ['ink', 'focus', 'surface', 'panel', 'colourScheme']) {
      assert.equal(after[token], before[token],
        `the dungeon must not change the shell's --${token} (${before[token]} -> ${after[token]})`);
    }
    assert.equal(after.bodyColourScheme, before.bodyColourScheme,
      'the dungeon must not change the shell colour scheme');
    assert.notEqual(after.ink, '#080909',
      'the dungeon ink must never leak onto the shell document');
    assert.notEqual(after.focus, '#ffe19a',
      'the dungeon focus colour must never leak onto the shell document');

    assert.deepEqual(errors, [], `the shell must not report errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
});
