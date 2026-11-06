import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { solve } from '../fixtures/sudoku-solver.mjs';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
for (const width of [1440, 820, 390, 320]) test(`Sudoku launcher, difficulty and real input at ${width}px`, { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height: 950 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.clear(); window.addEventListener('securitypolicyviolation', e => { throw new Error(`CSP ${e.violatedDirective}`); }); });
  const activate = async locator => mobile ? locator.tap() : locator.click();
  try {
    await page.goto(`${base}/?sudoku-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    const launcher = page.locator('[data-open-app="games"]:visible, [data-app="games"]:visible, [data-app-id="games"]:visible').first();
    await activate(launcher);
    await activate(page.locator('[data-play-game="sudoku"]'));
    const cells = page.locator('[data-sudoku-cell]');
    await cells.first().waitFor(); assert.equal(await cells.count(), 81);
    const getBoard = () => cells.evaluateAll(els => els.map(el => Number(el.textContent)));
    for (const level of ['easy','medium','hard','expert']) {
      await page.getByLabel('Difficulty', { exact: true }).selectOption(level);
      await page.waitForFunction(l => document.querySelector('[data-sudoku-board]')?.dataset.level === l, level);
      const board = await getBoard(); assert.equal(solve(board).length, 1);
      await activate(page.getByRole('button', { name: 'New game', exact: true }));
      const fresh = await getBoard(); assert.notDeepEqual(fresh, board);
      const open = fresh.indexOf(0), fixed = fresh.findIndex(Boolean);
      await activate(cells.nth(fixed));
      await activate(page.getByRole('button', { name: 'Erase', exact: true }));
      assert.deepEqual(await getBoard(), fresh, 'fixed clues protected');
      await activate(cells.nth(open));
      const duplicate = fresh.find((v,i) => v && Math.floor(i/9) === Math.floor(open/9));
      assert.ok(duplicate);
      if (mobile) await activate(page.getByRole('button', { name: `Enter ${duplicate}`, exact: true }));
      else await page.keyboard.press(String(duplicate));
      assert.equal(await cells.nth(open).getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator('[data-sudoku-status]').textContent(), /conflict/i);
      await activate(page.getByRole('button', { name: 'Undo', exact: true }));
      assert.equal((await getBoard())[open], 0);
      await activate(cells.nth(open));
      if (!mobile) {
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => document.activeElement.dataset.sudokuCell), String(Math.floor(open/9)*9 + Math.min(8,open%9+1)));
        await activate(cells.nth(open));
        await page.keyboard.press('1'); await page.keyboard.press('Backspace');
        assert.equal((await getBoard())[open], 0);
      }
      // Solve only through trusted keyboard or touchscreen actions, never a production test hook.
      if (width === 1440 || (width === 390 && level === 'expert')) {
        const solution = solve(fresh)[0];
        for (let i = 0; i < 81; i++) if (!fresh[i]) {
          await activate(cells.nth(i));
          if (mobile) await activate(page.getByRole('button', { name: `Enter ${solution[i]}`, exact: true }));
          else await page.keyboard.press(String(solution[i]));
        }
        assert.match(await page.locator('[data-sudoku-status]').textContent(), /Puzzle solved/);
        assert.equal(await page.locator('[data-sudoku-board]').getAttribute('data-complete'), 'true');
        assert.deepEqual(await getBoard(), solution);
      }
    }
    const overflow = await page.locator('[data-sudoku-board]').evaluate(el => ({ w: el.getBoundingClientRect().width, vw: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.w <= width && overflow.scroll <= width, JSON.stringify(overflow));
    mkdirSync('artifacts/sudoku', { recursive: true });
    await page.screenshot({ path: `artifacts/sudoku/${width}.png`, fullPage: true });
    await activate(page.getByRole('button', { name: 'Back to Arcade', exact: true }));
    assert.equal(await cells.count(), 0);
    await page.locator('[data-play-game="sudoku"]').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
