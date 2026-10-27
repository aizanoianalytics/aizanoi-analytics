import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
let browser;

before(async () => { browser = await chromium.launch(); });
after(async () => { if (browser) await browser.close(); });

async function open(viewport = { width: 1280, height: 1000 }, setup) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  if (setup) await setup(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(new URL('/arcade/chess/', base).href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() =>
      typeof window.__CHESS_ARENA__ === 'function' &&
      !document.getElementById('ch-start').disabled);
    return { context, page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function startHotseat(page) {
  await page.selectOption('#ch-white', 'human');
  await page.selectOption('#ch-black', 'human');
  await page.click('#ch-start');
  await page.waitForFunction(() => !document.getElementById('ch-human-move').disabled);
}

async function clickSquare(page, name) {
  const canvas = page.locator('#ch-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.click(
    box.x + (name.charCodeAt(0) - 97 + 0.5) * box.width / 8,
    box.y + (8 - Number(name[1]) + 0.5) * box.height / 8
  );
}

test('keyboard board and UCI input play hot-seat without pointer-only controls', async () => {
  const { context, page, errors } = await open();
  try {
    assert.equal(await page.locator('#ch-human-move').isDisabled(), true);
    await startHotseat(page);
    const board = page.locator('#ch-canvas');
    await board.focus();
    assert.match(await board.getAttribute('aria-description'), /e2, White pawn/);
    await board.press('Enter');
    await board.press('ArrowUp');
    await board.press('ArrowUp');
    await board.press('Enter');
    await page.waitForFunction(() => window.__CHESS_ARENA__().moves.length === 1);
    assert.equal((await page.evaluate(() => window.__CHESS_ARENA__())).moves[0], 'e4');

    await page.waitForFunction(() => !document.getElementById('ch-human-move').disabled);
    await page.fill('#ch-human-move', 'e7e4');
    await page.click('#ch-human-submit');
    assert.equal((await page.evaluate(() => window.__CHESS_ARENA__())).moves.length, 1);
    assert.match(await page.locator('#ch-ticker').textContent(), /Illegal move/);
    await page.fill('#ch-human-move', 'e7e5');
    await page.locator('#ch-human-move').press('Enter');
    await page.waitForFunction(() => window.__CHESS_ARENA__().moves.length === 2);
    assert.deepEqual((await page.evaluate(() => window.__CHESS_ARENA__())).moves, ['e4', 'e5']);

    await page.click('#ch-flip');
    await board.focus();
    await board.press('Home');
    assert.match(await board.getAttribute('aria-description'), /h[1-8],/);
    await board.press('Escape');
    assert.doesNotMatch(await board.getAttribute('aria-description'), /Selected/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Chess960 ordinary king step is not replaced by castling', async () => {
  // Test-only injection supplies a legal sparse starting position. No production
  // QA mutation hook or extra URL parameter is introduced.
  const setup = context => context.addInitScript(() => {
    let engine;
    Object.defineProperty(window, 'ChessEngine', {
      configurable: true,
      get() { return engine; },
      set(value) {
        const create = value.create;
        engine = {
          ...value,
          create(options = {}) {
            return create(options.variant === 'chess960'
              ? { ...options, fen: '4k3/8/8/8/8/8/8/5K1R w H - 0 1' }
              : options);
          }
        };
      }
    });
  });
  const { context, page, errors } = await open(undefined, setup);
  try {
    await page.selectOption('#ch-variant', 'chess960');
    await startHotseat(page);
    await clickSquare(page, 'f1');
    await clickSquare(page, 'g1');
    await page.waitForFunction(() => window.__CHESS_ARENA__().moves.length === 1);
    const ordinary = await page.evaluate(() => window.__CHESS_ARENA__());
    assert.equal(ordinary.moves[0], 'Kg1');
    assert.equal(ordinary.fen.split(' ')[0], '4k3/8/8/8/8/8/8/6KR');

    await page.click('#ch-resign');
    await page.waitForFunction(() => !window.__CHESS_ARENA__().running);
    await page.click('#ch-start');
    await page.waitForFunction(() => !document.getElementById('ch-human-move').disabled);
    await clickSquare(page, 'f1');
    await clickSquare(page, 'h1');
    await page.waitForFunction(() => window.__CHESS_ARENA__().moves.length === 1);
    const castled = await page.evaluate(() => window.__CHESS_ARENA__());
    assert.equal(castled.moves[0], 'O-O');
    assert.equal(castled.fen.split(' ')[0], '4k3/8/8/8/8/8/8/5RK1');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('promotion cancellation and explicit underpromotion remain available', async () => {
  const setup = context => context.addInitScript(() => {
    let engine;
    Object.defineProperty(window, 'ChessEngine', {
      configurable: true,
      get() { return engine; },
      set(value) {
        const create = value.create;
        engine = {
          ...value,
          create(options = {}) {
            return create({ ...options, fen: '7k/P7/8/8/8/8/8/7K w - - 0 1' });
          }
        };
      }
    });
  });
  const { context, page, errors } = await open(undefined, setup);
  try {
    await startHotseat(page);
    await clickSquare(page, 'a7');
    await clickSquare(page, 'a8');
    assert.equal(await page.locator('#ch-promo').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal((await page.evaluate(() => window.__CHESS_ARENA__())).moves.length, 0);
    await page.waitForFunction(() => !document.getElementById('ch-human-move').disabled);
    await page.fill('#ch-human-move', 'a7a8n');
    await page.click('#ch-human-submit');
    await page.waitForFunction(() => !window.__CHESS_ARENA__().running);
    const state = await page.evaluate(() => window.__CHESS_ARENA__());
    assert.deepEqual(state.moves, ['a8=N']);
    assert.match(state.result, /insufficient material/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('light shell, dark arena and phone input fit without horizontal overflow', async () => {
  const { context, page, errors } = await open({ width: 390, height: 844 });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const board = page.locator('#ch-canvas');
    await board.scrollIntoViewIfNeeded();
    const box = await board.boundingBox();
    assert.ok(box && box.width > 300);
    assert.ok(Math.abs(box.width - box.height) <= 1);
    const metrics = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const stage = getComputedStyle(document.querySelector('.ch-stage'));
      const brand = getComputedStyle(document.querySelector('.site-head .brand'));
      const input = document.getElementById('ch-human-move').getBoundingClientRect();
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        background: body.backgroundColor,
        stage: stage.backgroundColor,
        brand: brand.color,
        inputRight: input.right,
        inputLeft: input.left
      };
    });
    assert.equal(metrics.background, 'rgb(244, 247, 252)');
    assert.equal(metrics.brand, 'rgb(21, 36, 62)');
    assert.ok(metrics.documentWidth <= metrics.width);
    assert.ok(metrics.bodyWidth <= metrics.width);
    assert.ok(metrics.inputLeft >= 0 && metrics.inputRight <= metrics.width);
    assert.ok(box.x >= 0 && box.x + box.width <= metrics.width + 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
