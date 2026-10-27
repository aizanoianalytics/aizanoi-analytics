import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function withPage(options, body) {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      ...options,
    });

    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await body(page, errors);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function ready(page, query = '') {
  const response = await page.goto(
    `${base.replace(/\/$/, '')}/arcade/capture-flag/${query}`,
    { waitUntil: 'networkidle' },
  );

  assert.ok(response && response.ok(), 'The Capture the Flag page must load');

  await page.waitForFunction(() => {
    const state = window.__CAPTURE_FLAG__ && window.__CAPTURE_FLAG__();
    return state && state.bots === 3 && state.seats.length === 4;
  }, { timeout: 20000 });
}

test('all-bot 2v2 finishes at Instant speed without page errors', {
  timeout: 180000,
}, async () => {
  await withPage({ viewport: { width: 1440, height: 1000 } }, async (page, errors) => {
    await ready(
      page,
      '?west=sample-squad,sample-squad&east=sample-rusher,sample-rusher',
    );

    const initial = await page.evaluate(() => window.__CAPTURE_FLAG__());
    assert.ok(initial.seats.every(seat => seat.kind === 'bot'));

    await page.selectOption('#cf-speed', '0');
    await page.click('#cf-start');

    await page.waitForFunction(() => {
      const state = window.__CAPTURE_FLAG__();
      return !state.running && Boolean(state.result);
    }, { timeout: 150000 });

    const state = await page.evaluate(() => window.__CAPTURE_FLAG__());
    assert.ok(state.tick > 0 && state.tick <= 1200);
    assert.match(state.result, /^(?:West wins|East wins|Draw) \d+–\d+/);
    assert.equal(state.cards.length, 4);
    assert.equal(state.seats.length, 4);
    assert.ok(state.score.west >= 0);
    assert.ok(state.score.east >= 0);
    assert.deepEqual(errors, []);
  });
});

test('default human seat advances while KeyD is held at Normal speed', {
  timeout: 45000,
}, async () => {
  await withPage({ viewport: { width: 1280, height: 900 } }, async (page, errors) => {
    await ready(page);
    assert.equal(await page.locator('#cf-speed').inputValue(), '130');

    const initial = await page.evaluate(() => window.__CAPTURE_FLAG__());
    assert.equal(initial.seats.filter(seat => seat.kind === 'human').length, 1);
    assert.equal(initial.seats.find(seat => seat.kind === 'human').id, 'w1');

    await page.click('#cf-start');
    await page.waitForFunction(() => {
      const state = window.__CAPTURE_FLAG__();
      return state.running && state.tick > 0;
    }, { timeout: 15000 });

    const before = await page.evaluate(() => window.__CAPTURE_FLAG__().tick);
    await page.keyboard.down('KeyD');

    try {
      await page.waitForTimeout(2000);
    } finally {
      await page.keyboard.up('KeyD');
    }

    const state = await page.evaluate(() => window.__CAPTURE_FLAG__());
    assert.ok(state.tick > before);
    assert.equal(state.cards.length, 4);
    assert.ok(state.cards.some(card => card.includes('Player 1')));
    assert.equal(await page.locator('#cf-cards .cf-card[data-agent="w1"]').count(), 1);
    assert.deepEqual(errors, []);
  });
});

test('phone arena fits the viewport without horizontal overflow', {
  timeout: 45000,
}, async () => {
  await withPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  }, async (page, errors) => {
    await ready(page);
    await page.locator('#cf-canvas').scrollIntoViewIfNeeded();

    const layout = await page.evaluate(() => {
      const canvas = document.getElementById('cf-canvas');
      const rect = canvas.getBoundingClientRect();
      const pad = document.getElementById('cf-pad');

      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        padVisible: !pad.hidden,
        buttons: [...pad.querySelectorAll('button')].map(button => {
          const bounds = button.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        }),
      };
    });

    assert.ok(layout.width > 0);
    assert.ok(layout.height > 0);
    assert.ok(layout.left >= -1);
    assert.ok(layout.right <= layout.viewportWidth + 1);
    assert.ok(layout.top >= -1);
    assert.ok(layout.bottom <= layout.viewportHeight + 1);
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1);
    assert.ok(layout.bodyWidth <= layout.viewportWidth + 1);
    assert.ok(Math.abs(layout.width / layout.height - 33 / 21) < 0.02);
    assert.equal(layout.padVisible, true);
    assert.equal(layout.buttons.length, 4);
    assert.ok(layout.buttons.every(button => button.width >= 56 && button.height >= 56));
    assert.deepEqual(errors, []);
  });
});
