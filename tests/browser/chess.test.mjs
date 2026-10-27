import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const arenaUrl = new URL('/arcade/chess/', base).href;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
});

async function openArena(viewport = { width: 1280, height: 1000 }) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(arenaUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      return typeof window.__CHESS_ARENA__ === 'function' &&
        !document.getElementById('ch-start').disabled;
    }, null, { timeout: 15000 });

    return { context, page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function clickSquare(page, name) {
  const canvas = page.locator('#ch-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box, 'canvas has a bounding box');

  const file = name.charCodeAt(0) - 97;
  const rank = Number(name[1]) - 1;

  await page.mouse.click(
    box.x + (file + 0.5) * box.width / 8,
    box.y + (7 - rank + 0.5) * box.height / 8
  );
}

test('roster loads and an Instant bot game finishes without page errors', {
  timeout: 180000
}, async () => {
  const { context, page, errors } = await openArena();

  try {
    const botCount = await page.evaluate(() => window.__CHESS_ARENA__().bots.length);
    assert.equal(await page.locator('#ch-list > li').count(), botCount);
    assert.equal(await page.title(), 'AI Chess Arena — Aizanoi Arcade');

    for (const id of ['ch-white', 'ch-black']) {
      const first = page.locator(`#${id} option`).first();
      assert.equal(await first.getAttribute('value'), 'human');
      assert.equal(await first.textContent(), 'Human (click to move)');
    }

    await page.selectOption('#ch-white', 'sample-greedy');
    await page.selectOption('#ch-black', 'sample-random');
    await page.selectOption('#ch-series', '1');
    await page.selectOption('#ch-speed', '0');
    await page.click('#ch-start');

    await page.waitForFunction(() => {
      const arena = window.__CHESS_ARENA__();
      return !arena.running && arena.result.length > 0;
    }, null, { timeout: 150000 });

    const state = await page.evaluate(() => window.__CHESS_ARENA__());
    assert.ok(state.moves.length > 0, 'the bots played actual moves');
    assert.match(state.result, /^(White wins|Black wins|Draw by)/);
    assert.equal(state.seats[0].id, 'sample-greedy');
    assert.equal(state.seats[1].id, 'sample-random');
    assert.equal(await page.locator('#ch-result').isVisible(), true);
    assert.match(await page.locator('#ch-score').textContent(), /Games 1\/1/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('a human can click e2-e4 and receive one bot reply', {
  timeout: 30000
}, async () => {
  const { context, page, errors } = await openArena();

  try {
    await page.selectOption('#ch-white', 'human');
    await page.selectOption('#ch-black', 'sample-random');
    await page.selectOption('#ch-speed', '0');
    await page.click('#ch-start');

    await page.waitForFunction(() => {
      return window.__CHESS_ARENA__().running &&
        document.getElementById('ch-ticker').textContent.includes('White to move');
    });

    await clickSquare(page, 'e2');
    await clickSquare(page, 'e4');

    await page.waitForFunction(() => {
      return window.__CHESS_ARENA__().moves.length === 2;
    }, null, { timeout: 10000 });

    const state = await page.evaluate(() => window.__CHESS_ARENA__());
    assert.equal(state.moves[0], 'e4');
    assert.equal(state.moves.length, 2);
    assert.equal(state.running, true);
    assert.equal(state.fen.split(' ')[1], 'w');
    assert.equal(await page.locator('#ch-resign').isEnabled(), true);
    assert.equal(await page.locator('#ch-moves > li').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('phone layout shows the full board without horizontal overflow', {
  timeout: 30000
}, async () => {
  const { context, page, errors } = await openArena({
    width: 390,
    height: 844
  });

  try {
    const canvas = page.locator('#ch-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box);

    const metrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth
    }));

    assert.ok(box.width > 300);
    assert.ok(Math.abs(box.width - box.height) <= 1);
    assert.ok(box.x >= 0);
    assert.ok(box.x + box.width <= metrics.viewportWidth + 1);
    assert.ok(box.y >= -1);
    assert.ok(box.y + box.height <= metrics.viewportHeight + 1);
    assert.ok(metrics.documentWidth <= metrics.viewportWidth);
    assert.ok(metrics.bodyWidth <= metrics.viewportWidth);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
