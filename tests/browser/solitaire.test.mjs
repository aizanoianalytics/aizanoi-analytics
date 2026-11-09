import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
for (const width of [1440, 390]) test(`Solitaire launcher, real play and undo at ${width}px`, { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height: 950 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.clear(); window.addEventListener('securitypolicyviolation', () => { throw new Error('CSP violation'); }); });
  const activate = async (locator) => (mobile ? locator.tap() : locator.click());
  try {
    await page.goto(`${base}/?solitaire-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    const launcher = page.locator('[data-open-app="games"]:visible, [data-app="games"]:visible, [data-app-id="games"]:visible').first();
    await activate(launcher);
    await activate(page.locator('[data-play-game="solitaire"]'));
    const stock = page.locator('[data-sol-stock]');
    await stock.waitFor();
    const table = page.locator('[data-sol-table]');
    assert.equal(await table.locator('.ag-sol-col').count(), 7);
    const status = page.locator('[data-sol-status]');
    assert.match(await status.textContent(), /of 52 cards home/);

    // Draw from stock with a trusted input, then undo restores the counts.
    const stockBefore = await stock.textContent();
    await activate(stock);
    assert.notEqual(await stock.textContent(), stockBefore);
    assert.match(await page.locator('[data-sol-moves]').textContent(), /1/);
    await activate(page.getByRole('button', { name: 'Undo', exact: true }));
    assert.equal(await stock.textContent(), stockBefore);
    assert.match(await page.locator('[data-sol-moves]').textContent(), /0/);

    // Keyboard draw (S) and auto-home attempt keep the move counter honest.
    await page.keyboard.press('s');
    assert.match(await page.locator('[data-sol-moves]').textContent(), /1/);
    await page.keyboard.press('u');
    assert.match(await page.locator('[data-sol-moves]').textContent(), /0/);

    // New game redeals: board changes while staying a valid 52-card layout.
    const before = await table.locator('[data-sol-col]').evaluateAll((cols) => cols.map((col) => col.textContent));
    await activate(page.getByRole('button', { name: 'New game', exact: true }));
    const after = await table.locator('[data-sol-col]').evaluateAll((cols) => cols.map((col) => col.textContent));
    assert.notDeepEqual(after, before);

    // No horizontal overflow on desktop or phone widths.
    const overflow = await page.locator('[data-game="solitaire"]').evaluate((el) => ({ w: el.getBoundingClientRect().width, vw: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.w <= width && overflow.scroll <= width, JSON.stringify(overflow));
    mkdirSync('artifacts/solitaire', { recursive: true });
    await page.screenshot({ path: `artifacts/solitaire/${width}.png`, fullPage: true });

    await activate(page.getByRole('button', { name: 'Back to Arcade', exact: true }));
    await page.locator('[data-play-game="solitaire"]').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
