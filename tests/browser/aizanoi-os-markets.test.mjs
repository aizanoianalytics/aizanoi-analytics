import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4193';

const quality = { dailyClose:'complete', fourHour:'unavailable', ohlcv:'unavailable', history:'complete' };
function row(market) {
  return {
    market,
    ticker: market === 'us' ? 'AAPL' : 'BTC',
    name: market === 'us' ? 'Apple Inc.' : 'Bitcoin',
    exchange: market === 'us' ? 'NASDAQ' : 'Crypto · USD',
    slug: market === 'us' ? 'aapl' : 'btc',
    memberships: ['S&P 500'],
    latestPrice: 100,
    previousPrice: 99,
    price1w: 101,
    price1m: 102,
    price3m: 103,
    price6m: 104,
    price1y: 105,
    price2y: 106,
    price3y: 107,
    price2019: 108,
    return1d: 0.01,
    return1w: 0.02,
    return1m: 0.03,
    return3m: 0.04,
    return6m: 0.05,
    return1y: 0.06,
    return2y: 0.07,
    return3y: 0.08,
    returnSince2019: 0.09,
    dataQuality: quality,
  };
}

async function fixtures(page) {
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json: { schemaVersion: 3, completedAt: '2026-09-10T07:00:00Z', status: 'complete', counts: { us: 1, crypto: 1 } } }));
  await page.route('**/analytics/markets/data/health.json', route => route.fulfill({ json: { schemaVersion: 3, status: 'complete', counts: { us: 1, crypto: 1 }, failedSymbols: [], quality: { fourHourUnavailable: 0, limitedHistory: 0 } } }));
  for (const market of ['us', 'crypto']) {
    await page.route(`**/analytics/markets/data/summary/${market}/index.json`, route => route.fulfill({ json: { market, chunks: [{ path: '00.json', count: 1 }] } }));
    await page.route(`**/analytics/markets/data/summary/${market}/00.json`, route => route.fulfill({ json: { market, rows: [row(market)] } }));
    await page.route(`**/analytics/markets/data/pulse/${market}.json`, route => route.fulfill({ json: { market, instruments: 1, observed1d: 1, advancing: 1, declining: 0, advancingShare: 1, decliningShare: 0, medianReturn1d: 0.01, medianReturn1y: 0.06 } }));
  }
}

test('AizanoiOS Markets mounts shared full-product dashboard with simplified navigation', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await fixtures(page);
  try {
    await page.goto(`${base}/?markets-qa=${Date.now()}`, { waitUntil: 'networkidle' });
    const shortcut = page.locator('[data-app="markets"]:visible').first();
    await shortcut.waitFor({ state: 'visible', timeout: 15000 });
    await shortcut.click();
    await page.waitForSelector('[data-app-body] [data-raw-table] tbody tr[data-symbol]', { timeout: 15000 });
    assert.equal(await page.locator('[data-app-body] [data-breadth]').count(), 0);
    const navText = await page.locator('[data-app-body] .market-nav').innerText();
    assert.ok(!/signals/i.test(navText));
    assert.ok(!/explorer/i.test(navText));
    assert.ok(!/crypto risk/i.test(navText));
    assert.ok(!/data health/i.test(navText));
    await page.click('[data-app-body] [data-nav="picks"]');
    await page.waitForSelector('[data-app-body] .market-picks-card');
    assert.equal(await page.locator('[data-app-body] .market-picks-card').count(), 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
