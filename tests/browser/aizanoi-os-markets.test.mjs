import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4193';
const summary = {
  markets: {
    us: [{ ticker:'AAPL', name:'Apple Inc.', slug:'aapl', latest:315.34, return1d:0.01, return30d:0.08, volatility20:0.22, volumeZ20:2.1, drawdown1y:-0.08, distanceFrom52wHigh:-0.04, aboveSma200:true }],
    crypto: [{ ticker:'BTC', name:'Bitcoin', slug:'btc', latest:77965.96, return1d:-0.02, return30d:0.12, volatility20:0.48, volumeZ20:3.4, drawdown1y:-0.17, distanceFrom52wHigh:-0.09, aboveSma200:true }],
  },
};
const history = { ticker:'BTC', name:'Bitcoin', yahooSymbol:'BTC-USD', exchange:'Crypto · USD', startDate:'2019-01-01', daily:Array.from({length:220},(_,i)=>({t:1546300800+i*86400,c:4000+i*20,v:1000+i})), fourHour:Array.from({length:20},(_,i)=>({t:1788700000+i*14400,c:76000+i*80,v:500+i})) };

test('Aizanoi Markets is a desktop app: shortcut, window, live table, crypto tab and detail', async () => {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1440, height:900 }, serviceWorkers:'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json:{ completedAt:'2026-09-10T07:00:00Z', counts:{ us:1, crypto:1 } } }));
  await page.route('**/analytics/markets/data/summary.json', route => route.fulfill({ json:summary }));
  await page.route('**/analytics/markets/data/history/crypto/btc.json', route => route.fulfill({ json:history }));
  try {
    await page.goto(`${base}/?markets-qa=${Date.now()}`, { waitUntil:'networkidle' });

    // The desktop home carries the app shortcut (icon + label).
    const shortcut = page.locator('[data-app="markets"]:visible').first();
    await shortcut.waitFor({ state:'visible', timeout:15000 });
    assert.equal(await shortcut.getAttribute('aria-label'), 'Open Aizanoi Markets');
    assert.match(await shortcut.innerText(), /Markets/);

    // Opening it mounts the market surface inside an OS window.
    await shortcut.click();
    await page.waitForSelector('[data-app-body] .az-markets-app [data-market-rows] [data-symbol="aapl"]', { timeout:15000 });
    const windowEl = page.locator('.az-window[data-app-id="markets"]');
    assert.equal(await windowEl.count(), 1, 'Markets opens as one AizanoiOS window');

    // Live data renders: pulse + signal + ranked row.
    assert.match(await page.locator('[data-market-freshness]').innerText(), /Sep|2026|Data/);
    assert.ok(await page.locator('[data-market-pulse] article').count() >= 4);
    assert.ok(await page.locator('[data-market-signals] .az-markets-signal').count() >= 1);

    // Crypto tab switch swaps the universe.
    await page.click('[data-market-tab="crypto"]');
    await page.waitForSelector('[data-market-rows] [data-symbol="btc"]');
    assert.equal(await page.locator('[data-market-tab="crypto"]').getAttribute('aria-selected'), 'true');

    // Detail view with sparkline and close.
    await page.click('[data-market-rows] [data-symbol="btc"]');
    await page.waitForSelector('[data-market-detail] .az-markets-detail svg polyline');
    await page.click('[data-market-close-detail]');
    assert.equal(await page.locator('[data-market-detail] .az-markets-detail').count(), 0);

    // Search narrows the table.
    await page.fill('[data-market-search]', 'apple');
    await page.click('[data-market-tab="us"]');
    await page.waitForSelector('[data-market-rows] [data-symbol="aapl"]');
    const rowCount = await page.locator('[data-market-rows] tr').count();
    assert.equal(rowCount, 1, `search should narrow to AAPL, got ${rowCount} rows`);

    // The full standalone page stays reachable.
    const openLink = page.locator('.az-markets-open');
    assert.match(await openLink.getAttribute('href'), /\/analytics\/markets\/\?market=us/);

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
});
