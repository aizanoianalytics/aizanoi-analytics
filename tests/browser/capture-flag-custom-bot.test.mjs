import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertFullRoster } from './arcade-roster.mjs';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';

test('capture-flag: uploaded bot completes an Instant game against samples', {
  timeout: 120000,
}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const address = new URL('/arcade/capture-flag/', baseURL);
    address.searchParams.set('west', 'sample-squad,sample-squad');
    address.searchParams.set('east', 'sample-squad,sample-squad');
    await page.goto(address.href);

    await page.waitForFunction(() => {
      const start = document.getElementById('cf-start');
      return start && !start.disabled &&
        document.querySelectorAll('#cf-west .cf-seat select').length === 2 &&
        document.querySelectorAll('#cf-east .cf-seat select').length === 2;
    });
    await assertFullRoster(page, 'capture-flag');

    const code = 'module.exports = function move(state) { return "right"; };';
    const chooser = page.waitForEvent('filechooser');
    await page.selectOption('#cf-west .cf-seat select >> nth=0', 'custom');
    await chooser;
    await page.setInputFiles('#arena-custom-file', {
      name: 'custom-flag.js',
      mimeType: 'text/javascript',
      buffer: Buffer.from(code),
    });

    await page.waitForFunction(() => {
      const select = document.querySelector('#cf-west .cf-seat select');
      return select && !select.disabled && select.value === 'custom' &&
        select.selectedOptions[0].textContent === 'Your bot: custom-flag.js';
    });

    assert.equal(await page.locator('#arena-custom-file').getAttribute('hidden'), '');
    assert.equal(await page.locator('#cf-west .cf-seat select').first().inputValue(), 'custom');
    assert.match(await page.locator('#cf-cards').textContent(), /custom-flag\.js/);
    // Cards sort by engine ID, so the first card is e1, not the uploaded w1 seat.
    assert.match(await page.locator('#cf-cards .cf-card[data-agent="w1"] .cf-card-lab').textContent(), /^You$/);

    await page.selectOption('#cf-speed', '0');
    await page.selectOption('#cf-series', '1');
    await page.click('#cf-start');

    await page.waitForFunction(() => {
      const state = window.__CAPTURE_FLAG__ && window.__CAPTURE_FLAG__();
      return state && !state.running && Boolean(state.result);
    }, null, { timeout: 90000 });

    const state = await page.evaluate(() => window.__CAPTURE_FLAG__());
    assert.match(state.result, /^(?:West wins|East wins|Draw) \d+–\d+/);
    assert.ok(state.tick > 0 && state.tick <= 1200);
    assert.equal(state.seats.length, 4);
    assert.ok(state.seats.every(seat => seat.kind === 'bot'));
    assert.ok(state.cards.some(card => card.includes('custom-flag.js') && card.includes('You')));
    assert.equal(await page.locator('#cf-result').isVisible(), true);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
});
