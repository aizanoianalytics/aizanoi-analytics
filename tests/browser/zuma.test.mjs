import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
for (const width of [1440, 390]) test(`Marble Serpent launcher, real shots and controls at ${width}px`, { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height: 950 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.clear(); window.addEventListener('securitypolicyviolation', () => { throw new Error('CSP violation'); }); });
  const activate = async (locator) => (mobile ? locator.tap() : locator.click());
  try {
    await page.goto(`${base}/?zuma-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    const launcher = page.locator('[data-open-app="games"]:visible, [data-app="games"]:visible, [data-app-id="games"]:visible').first();
    await activate(launcher);
    await activate(page.locator('[data-play-game="zuma"]'));
    const canvas = page.locator('[data-zm-canvas]');
    await canvas.waitFor();
    await page.waitForTimeout(2500);

    // The canvas renders a living scene, not a blank rectangle.
    const variety = await canvas.evaluate((el) => {
      const probe = document.createElement('canvas');
      probe.width = 96; probe.height = 128;
      const pctx = probe.getContext('2d');
      pctx.drawImage(el, 0, 0, 96, 128);
      const pixels = pctx.getImageData(0, 0, 96, 128).data;
      const seen = new Set();
      for (let i = 0; i < pixels.length; i += 16) {
        seen.add(`${pixels[i] >> 5},${pixels[i + 1] >> 5},${pixels[i + 2] >> 5}`);
      }
      return seen.size;
    });
    assert.ok(variety > 12, `expected a rich rendered scene, saw ${variety} color buckets`);

    // Real trusted input fires orbs: click toward the open playfield.
    const shots = page.locator('[data-zm-shots]');
    const before = await shots.textContent();
    const box = await canvas.boundingBox();
    if (mobile) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2);
    await page.waitForFunction((prior) => document.querySelector('[data-zm-shots]').textContent !== prior, before, { timeout: 5000 });
    const afterFire = await shots.textContent();
    assert.notEqual(afterFire, before);

    // Pause freezes the scene label; keyboard Space fires another orb.
    await activate(page.getByRole('button', { name: 'Pause', exact: true }));
    assert.match(await canvas.evaluate((el) => { void el; return document.querySelector('[data-zm-status]').textContent; }), /Chamber|Sanctum|serpent/);
    await activate(page.getByRole('button', { name: 'Resume', exact: true }));
    await page.keyboard.press(' ');
    await page.waitForTimeout(400);
    assert.notEqual(await shots.textContent(), afterFire);

    // Capture the living cabinet mid-run: the coil must be on the track.
    mkdirSync('artifacts/zuma', { recursive: true });
    await page.screenshot({ path: `artifacts/zuma/${width}.png`, fullPage: true });

    // New run resets the orb counter and the status line reports the chamber.
    await activate(page.getByRole('button', { name: 'New run', exact: true }));
    assert.equal(await shots.textContent(), '0');
    assert.match(await page.locator('[data-zm-status]').textContent(), /Chamber 1/);

    // No horizontal overflow on desktop or phone widths.
    const overflow = await page.locator('[data-game="zuma"]').evaluate((el) => ({ w: el.getBoundingClientRect().width, vw: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.w <= width && overflow.scroll <= width, JSON.stringify(overflow));

    await activate(page.getByRole('button', { name: 'Back to Arcade', exact: true }));
    await page.locator('[data-play-game="zuma"]').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
