import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

test('Player 2-only phone configuration has usable touch controls and arena text', {
  timeout: 45000,
}, async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(
        `${base.replace(/\/$/, '')}/arcade/capture-flag/` +
        '?west=p2,sample-squad&east=sample-rusher,sample-rusher',
        { waitUntil: 'networkidle' },
      );
      assert.ok(response && response.ok());
      await page.waitForFunction(() =>
        window.__CAPTURE_FLAG__ && window.__CAPTURE_FLAG__().seats.length === 4,
      );

      assert.equal(await page.locator('#cf-pad').isVisible(), true);
      assert.equal(await page.locator('#cf-touch-player').inputValue(), 'p2');
      assert.equal(await page.locator('#cf-touch-player option').count(), 1);
      assert.match(await page.locator('#cf-pad').getAttribute('aria-label'), /Player 2/);
      assert.match(await page.locator('#cf-canvas').getAttribute('aria-label'),
        /w1: Player 2, west/);
      assert.equal(await page.locator('#cf-canvas').getAttribute('aria-describedby'), 'cf-legend');

      await page.click('#cf-start');
      await page.waitForFunction(() => {
        const button = document.querySelector('#cf-pad [data-dir="right"]');
        return window.__CAPTURE_FLAG__().tick > 0 && !button.disabled;
      }, null, { timeout: 15000 });

      const before = await page.locator('#cf-canvas').getAttribute('aria-label');
      const match = before.match(/w1: Player 2, west, (\d+), (\d+)/);
      assert.ok(match, before);
      const initialX = Number(match[1]);

      // A keyboard/AT click must reach the same selected human as a touch tap.
      await page.locator('#cf-pad [data-dir="right"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(x => {
        const label = document.getElementById('cf-canvas').getAttribute('aria-label');
        const position = label.match(/w1: Player 2, west, (\d+), (\d+)/);
        return position && Number(position[1]) === x + 1;
      }, initialX, { timeout: 10000 });

      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        buttons: [...document.querySelectorAll('#cf-pad button')].map(button => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      }));
      assert.equal(layout.reduced, true);
      assert.ok(layout.documentWidth <= layout.width + 1);
      assert.equal(layout.buttons.length, 4);
      assert.ok(layout.buttons.every(b => b.width >= 56 && b.height >= 56));
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
