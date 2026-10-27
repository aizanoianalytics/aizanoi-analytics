import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

async function session(viewport, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fn(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function open(page, seats) {
  const url = new URL('/arcade/holdem/', base);
  url.searchParams.set('seats', seats.join(','));
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__HOLDEM__ &&
    window.__HOLDEM__().bots === 3 &&
    !document.getElementById('ph-start').disabled);
}

test('nine-seat phone plates remain inside the table and do not overlap', {
  timeout: 60000
}, async () => {
  await session({ width: 390, height: 844 }, async page => {
    await open(page, Array(9).fill('human'));
    const layout = await page.evaluate(() => {
      const table = document.getElementById('ph-table').getBoundingClientRect();
      const seats = [...document.querySelectorAll('#ph-table .ph-seat')].map(node => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      return {
        table: { left: table.left, right: table.right, top: table.top, bottom: table.bottom },
        seats,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.equal(layout.overflow, false);
    assert.equal(layout.seats.length, 9);
    for (let i = 0; i < layout.seats.length; i++) {
      const a = layout.seats[i];
      assert.ok(a.left >= layout.table.left && a.right <= layout.table.right);
      assert.ok(a.top >= layout.table.top && a.bottom <= layout.table.bottom);
      for (let j = i + 1; j < layout.seats.length; j++) {
        const b = layout.seats[j];
        const intersectionWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const intersectionHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        assert.ok(intersectionWidth <= 0 || intersectionHeight <= 0,
          `Seat plates ${i + 1} and ${j + 1} overlap`);
      }
    }
  });
});

test('mobile human controls precede the sidebar and hot-seat background is inert', {
  timeout: 60000
}, async () => {
  await session({ width: 390, height: 844 }, async page => {
    await open(page, ['human', 'human', 'sample-caller']);
    const order = await page.evaluate(() => {
      const table = document.getElementById('ph-table');
      const actions = document.getElementById('ph-actions');
      const sidebar = document.querySelector('.ph-sidebar');
      return table.nextElementSibling === actions &&
        Boolean(actions.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(order, true);
    await page.selectOption('#ph-speed', '0');
    await page.click('#ph-start');
    await page.waitForFunction(() => window.__HOLDEM__().humanToAct &&
      !document.getElementById('ph-pass').hidden, null, { timeout: 30000 });
    assert.equal(await page.locator('#ph-table').evaluate(node => node.inert), true);
    assert.equal(await page.locator('#ph-form').evaluate(node => node.inert), true);
    assert.equal(await page.locator('#ph-pass').evaluate(node => node.inert), false);
    assert.equal(await page.locator('.ph-hole[data-revealed="true"]').count(), 0);
    await page.click('#ph-show');
    assert.equal(await page.locator('#ph-table').evaluate(node => node.inert), false);
    assert.equal(await page.locator('#ph-form').evaluate(node => node.inert), false);
    assert.equal(await page.locator('.ph-hole[data-revealed="true"]').count(), 1);
    assert.equal(await page.locator('#ph-check').evaluate(node => document.activeElement === node), true);
    await page.locator('#ph-actions').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#ph-actions').isVisible(), true);
  });
});

test('completed all-bot match retains a complete zero-error audit', {
  timeout: 300000
}, async () => {
  await session({ width: 1280, height: 900 }, async page => {
    await open(page, ['sample-equity', 'sample-caller', 'sample-tight']);
    await page.selectOption('#ph-speed', '0');
    await page.selectOption('#ph-hands', '100');
    await page.click('#ph-start');
    await page.waitForFunction(() => {
      const qa = window.__HOLDEM__();
      return qa.result && !qa.running;
    }, null, { timeout: 270000 });
    const qa = await page.evaluate(() => window.__HOLDEM__());
    assert.deepEqual(qa.errors, { s1: 0, s2: 0, s3: 0 });
    assert.equal(qa.standings.reduce((sum, seat) => sum + seat.chips, 0), 30000);
    assert.ok(qa.hand >= 1 && qa.hand <= 100);
  });
});

test('all-in control is disabled for a closed raise right', {
  timeout: 60000
}, async () => {
  await session({ width: 1280, height: 900 }, async page => {
    await open(page, ['human', 'human']);
    const result = await page.evaluate(async () => {
      // Load a fresh controller against an instrumented runner without
      // exposing or modifying production QA handles.
      const actualStart = HoldemRunner.start;
      HoldemRunner.start = () => {
        const game = PokerEngine.create([
          { id: 's1', name: 'Player 1' },
          { id: 's2', name: 'Player 2' }
        ]);
        game.startHand();
        const actualLegal = game.legalActions;
        game.legalActions = id => ({
          ...actualLegal(id),
          minRaiseTo: null,
          canAllIn: false
        });
        let stopped = false;
        let calls = 0;
        return {
          game,
          loaded: Promise.resolve(),
          errors: { s1: 0, s2: 0 },
          next() {
            if (calls++ === 0) return Promise.resolve({ type: 'hand', events: [] });
            return new Promise(() => {});
          },
          submitHuman() { return { ok: false, error: 'Test decision' }; },
          stop() { stopped = true; },
          get stopped() { return stopped; }
        };
      };
      document.getElementById('ph-start').click();
      await new Promise(resolve => setTimeout(resolve, 50));
      document.getElementById('ph-show').click();
      const disabled = document.getElementById('ph-allin').disabled;
      const raiseDisabled = document.getElementById('ph-raise').disabled;
      HoldemRunner.start = actualStart;
      return { disabled, raiseDisabled };
    });
    assert.deepEqual(result, { disabled: true, raiseDisabled: true });
  });
});
