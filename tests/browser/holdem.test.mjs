import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function session(viewport, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', error => errors.push(error.message));

  try {
    await fn(page);
    assert.deepEqual(errors, [], 'No uncaught page errors');
  } finally {
    await context.close();
    await browser.close();
  }
}

async function open(page, seats) {
  const url = new URL('/arcade/holdem/', base);
  url.searchParams.set('seats', seats.join(','));
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const qa = window.__HOLDEM__ && window.__HOLDEM__();
    return qa && qa.bots === 3 && !document.getElementById('ph-start').disabled;
  });
}

async function start(page, speed) {
  await page.selectOption('#ph-speed', speed);
  await page.selectOption('#ph-hands', '100');
  await page.click('#ph-start');
}

async function waitForHuman(page) {
  await page.waitForFunction(() => window.__HOLDEM__().humanToAct, {
    timeout: 30000,
  });
}

async function assertPrivateCardsHidden(page) {
  const hidden = await page.evaluate(() => {
    const qa = window.__HOLDEM__();
    const humans = qa.seats
      .map((seat, index) => seat.kind === 'human' ? `s${index + 1}` : null)
      .filter(Boolean);

    return humans.every(id => {
      const hole = document.querySelector(`[data-seat-id="${id}"] .ph-hole`);
      return hole &&
        hole.dataset.revealed === 'false' &&
        hole.querySelectorAll('.ph-card:not(.ph-back)').length === 0;
    });
  });

  assert.equal(hidden, true, 'No human faces exist in the DOM before consent');
}

test('three bot seats finish an Instant tournament without page errors', {
  timeout: 300000,
}, async () => {
  await session({ width: 1280, height: 900 }, async page => {
    await open(page, ['sample-equity', 'sample-caller', 'sample-tight']);
    await start(page, '0');

    await page.waitForFunction(() => Boolean(window.__HOLDEM__().result), {
      timeout: 270000,
    });

    const qa = await page.evaluate(() => window.__HOLDEM__());
    assert.match(qa.result, /(?:wins the tournament|share first place) after \d+ hands/);
    assert.equal(qa.running, false);
    assert.ok(qa.hand >= 1 && qa.hand <= 100);
    assert.equal(qa.standings.reduce((sum, seat) => sum + seat.chips, 0), 30000);
    assert.doesNotMatch(await page.locator('#ph-log').innerText(), /bot error/i);
    assert.equal(await page.locator('#ph-result').isVisible(), true);
  });
});

test('one human can act at Fast speed and the hand advances', {
  timeout: 90000,
}, async () => {
  await session({ width: 1280, height: 900 }, async page => {
    await open(page, ['human', 'sample-caller', 'sample-tight']);
    await start(page, '200');
    await waitForHuman(page);

    const hand = await page.evaluate(() => window.__HOLDEM__().hand);
    assert.equal(await page.locator('#ph-pass').isVisible(), false);
    assert.equal(
      await page.locator('[data-seat-id="s1"] .ph-hole').getAttribute('data-revealed'),
      'true',
    );

    const fold = page.locator('#ph-fold');
    if (await fold.isEnabled()) await fold.click();
    else await page.locator('#ph-check').click();

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const qa = await page.evaluate(() => window.__HOLDEM__());
      if (qa.hand > hand || qa.result) break;
      if (qa.humanToAct && await page.locator('#ph-actions').isVisible()) {
        if (await fold.isEnabled()) await fold.click();
        else await page.locator('#ph-check').click();
      } else {
        await page.waitForTimeout(50);
      }
    }

    const after = await page.evaluate(() => window.__HOLDEM__());
    assert.ok(after.hand > hand, 'A later hand must begin');
  });
});

test('two humans must pass the device before every private reveal', {
  timeout: 90000,
}, async () => {
  await session({ width: 1280, height: 900 }, async page => {
    await open(page, ['human', 'human', 'sample-caller']);
    await start(page, '200');
    await waitForHuman(page);

    assert.equal(await page.locator('#ph-pass').isVisible(), true);
    assert.equal(await page.locator('#ph-actions').isVisible(), false);
    await assertPrivateCardsHidden(page);
    assert.match(await page.locator('#ph-pass-name').innerText(), /Pass the device to Player [12]/);

    const firstSeat = await page.locator('.ph-acting').getAttribute('data-seat-id');
    await page.click('#ph-show');
    assert.equal(await page.locator('#ph-pass').isVisible(), false);
    assert.equal(await page.locator('#ph-actions').isVisible(), true);
    assert.equal(
      await page.locator(`[data-seat-id="${firstSeat}"] .ph-hole`)
        .getAttribute('data-revealed'),
      'true',
    );
    assert.equal(
      await page.locator('#ph-table .ph-hole[data-revealed="true"]').count(),
      1,
    );

    await page.click('#ph-check');
    await page.waitForFunction(() => (
      window.__HOLDEM__().humanToAct &&
      !document.getElementById('ph-pass').hidden
    ), { timeout: 30000 });

    await assertPrivateCardsHidden(page);
    assert.equal(await page.locator('#ph-actions').isVisible(), false);

    await page.click('#ph-show');
    assert.equal(
      await page.locator('#ph-table .ph-hole[data-revealed="true"]').count(),
      1,
    );
  });
});

test('phone table is visible without horizontal overflow', {
  timeout: 60000,
}, async () => {
  await session({ width: 390, height: 844 }, async page => {
    await open(page, [
      'human', 'sample-equity', 'sample-tight',
      'sample-caller', 'sample-equity', 'sample-tight',
      'sample-caller', 'sample-tight', 'sample-caller',
    ]);

    await page.locator('#ph-table').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#ph-table').isVisible(), true);

    const layout = await page.evaluate(() => {
      const table = document.getElementById('ph-table').getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        scroll: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        left: table.left,
        right: table.right,
        width: table.width,
        height: table.height,
        seats: document.querySelectorAll('#ph-table .ph-seat').length,
      };
    });

    assert.ok(layout.scroll <= layout.viewport, 'Page must not overflow horizontally');
    assert.ok(layout.left >= 0 && layout.right <= layout.viewport);
    assert.ok(layout.width > 250 && layout.height > 400);
    assert.equal(layout.seats, 9);

    await start(page, '200');
    await waitForHuman(page);
    await page.locator('#ph-actions').scrollIntoViewIfNeeded();

    const actions = await page.locator('#ph-actions').boundingBox();
    assert.ok(actions && actions.width <= 390);
    assert.ok(actions.y + actions.height <= 845);

    const overflow = await page.evaluate(() => (
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
      document.documentElement.clientWidth
    ));
    assert.equal(overflow, false);
  });
});
