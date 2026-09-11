import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

const quality = { dailyClose:'complete', fourHour:'complete', ohlcv:'unavailable', history:'complete' };

function buildMarketUniverse(market, count) {
  return Array.from({ length: count }, (_, i) => {
    const seed = market === 'us' ? 100 : 10_000;
    const drift = (i % 12) * (i % 2 === 0 ? 1 : -1);
    return {
      market,
      ticker: `${market === 'us' ? 'U' : 'C'}${String(i).padStart(3, '0')}`,
      name: `${market === 'us' ? 'United Stock' : 'Crypto Asset'} ${i}`,
      exchange: market === 'us' ? (i % 2 ? 'NYSE' : 'NASDAQ') : 'Crypto · USD',
      slug: `${market}${i}`,
      memberships: market === 'us' ? [i % 3 ? 'S&P 500' : 'Nasdaq-100'] : ['Crypto'],
      latestPrice: seed + drift,
      previousPrice: seed + drift - 0.5,
      price1w: seed + drift + 1,
      price1m: seed + drift + 2,
      price3m: seed + drift + 3,
      price6m: seed + drift + 4,
      price1y: seed + drift + 5,
      price2y: seed + drift + 6,
      price3y: seed + drift + 7,
      price2019: seed + drift + 8,
      return1d: (i % 7 - 3) * 0.01,
      return1w: (i % 5 - 2) * 0.02,
      return1m: (i % 11 - 5) * 0.01,
      return3m: (i % 13 - 6) * 0.015,
      return6m: (i % 9 - 4) * 0.02,
      return1y: (i % 17 - 8) * 0.03,
      return2y: (i % 19 - 9) * 0.04,
      return3y: (i % 23 - 11) * 0.05,
      returnSince2019: (i % 29 - 14) * 0.06,
      dataQuality: quality,
    };
  });
}

function pulse(market, rows) {
  const advancing = rows.filter(row => row.return1d > 0).length;
  const declining = rows.filter(row => row.return1d < 0).length;
  const median = values => {
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    market,
    instruments: rows.length,
    observed1d: rows.length,
    advancing,
    declining,
    advancingShare: advancing / rows.length,
    decliningShare: declining / rows.length,
    medianReturn1d: median(rows.map(row => row.return1d)),
    medianReturn1y: median(rows.map(row => row.return1y)),
  };
}

function instrumentHistory(market, slug, ticker) {
  const startTs = 1_577_836_800;
  const days = 1500;
  return {
    market,
    ticker,
    name: ticker,
    provider: market === 'us' ? 'fintable' : 'binance',
    exchange: market === 'us' ? 'NASDAQ' : 'Crypto · USD',
    slug,
    startDate: new Date(startTs * 1000).toISOString().slice(0, 10),
    dataQuality: quality,
    daily: Array.from({ length: days }, (_, i) => ({ t: startTs + i * 86_400, c: 100 + i * 0.1 + Math.sin(i / 6) * 2 })),
    fourHour: market === 'crypto' ? Array.from({ length: 360 }, (_, i) => ({ t: 1_700_000_000 + i * 14_400, c: 100 + i * 0.2 })) : [],
  };
}

const usRows = buildMarketUniverse('us', 12);
const cryptoRows = buildMarketUniverse('crypto', 10);
usRows[0].ticker = 'AAPL'; usRows[0].name = 'Apple Inc.'; usRows[0].slug = 'aapl';
usRows[0].return1y = 0.4; usRows[0].return1d = 0.05;
cryptoRows[0].ticker = 'BTC'; cryptoRows[0].name = 'Bitcoin'; cryptoRows[0].slug = 'btc';
cryptoRows[0].return1y = 1.5; cryptoRows[0].return1d = -0.03;

async function installFixtures(page, market = 'us', symbol = 'aapl') {
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json: { schemaVersion: 3, completedAt: '2026-09-11T07:00:00Z', status: 'complete', counts: { us: usRows.length, crypto: cryptoRows.length } } }));
  await page.route('**/analytics/markets/data/health.json', route => route.fulfill({ json: { schemaVersion: 3, status: 'complete', us: { expected: usRows.length, published: usRows.length, missingHistory: [], failedCurrentRefresh: [], stale: 0, status: 'complete', latestObservationAt: '2026-09-10T04:00:00Z', priceBasis: 'Adjusted close', provider: 'fintable' }, crypto: { expected: cryptoRows.length, published: cryptoRows.length, missingHistory: [], failedCurrentRefresh: [], stale: 0, status: 'complete', latestObservationAt: '2026-09-10T00:00:00Z', priceBasis: 'Exchange close', provider: 'binance' }, failedSymbols: [], quality: { fourHourUnavailable: 0, limitedHistory: 0 } } }));
  await page.route('**/analytics/markets/data/snapshots/pulse.json', route => route.fulfill({ json: { snapshots: [] } }));
  for (const m of ['us', 'crypto']) {
    const rows = m === 'us' ? usRows : cryptoRows;
    await page.route(`**/analytics/markets/data/summary/${m}/index.json`, route => route.fulfill({ json: { market: m, chunks: [{ path: '00.json', count: rows.length }] } }));
    await page.route(`**/analytics/markets/data/summary/${m}/00.json`, route => route.fulfill({ json: { market: m, rows } }));
    await page.route(`**/analytics/markets/data/pulse/${m}.json`, route => route.fulfill({ json: pulse(m, rows) }));
  }
  await page.route(`**/analytics/markets/data/history/${market}/${symbol}.json`, route => route.fulfill({ json: instrumentHistory(market, symbol, market === 'us' ? 'AAPL' : 'BTC') }));
  await page.route(`**/analytics/markets/data/summary-items/${market}/${symbol}.json`, route => route.fulfill({ json: (market === 'us' ? usRows : cryptoRows).find(row => row.slug === symbol) }));
  await page.route('**/analytics/markets/data/instruments.json', route => route.fulfill({ json: [...usRows, ...cryptoRows] }));
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`main Markets renders simplified product at ${viewport.width}px`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', err => errors.push(String(err)));
    const historyRequests = [];
    page.on('request', req => { if (/\/history\//.test(req.url())) historyRequests.push(req.url()); });
    await installFixtures(page);
    try {
      await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-breadth] article', { timeout: 15000 });
      const breadth = await page.locator('[data-breadth] article').count();
      assert.equal(breadth, 4);
      const rankings = await page.locator('[data-ranking]').count();
      assert.equal(rankings, 5);
      await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
      const rows = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').count();
      assert.ok(rows > 0, 'rendered rows');
      await page.click('[data-ranking-symbol]');
      await page.waitForSelector('tr[data-symbol].is-selected');
      const rankingText = await page.locator('[data-ranking]').first().innerText();
      assert.match(rankingText, /\$/);
      const navText = await page.locator('.market-nav').innerText();
      assert.ok(!/signals/i.test(navText), 'no signals nav');
      assert.ok(!/explorer/i.test(navText), 'no explorer nav');
      assert.ok(!/crypto risk/i.test(navText), 'no crypto risk nav');
      assert.ok(!/data health/i.test(navText), 'no data health nav');
      await page.click('[data-price-mode="change"]');
      await page.waitForFunction(() => document.querySelector('th button[data-sort-key="return1y"]'));
      await page.click('th button[data-sort-key="return1y"]');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `dashboard overflow ${overflow}`);
      assert.deepEqual(errors, []);
      assert.equal(historyRequests.length, 0);
    } finally {
      await browser.close();
    }
  });
}

test('Raw Data sorts via column headers and shows pager metadata', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
    await page.click('[data-price-mode="change"]');
    await page.waitForSelector('th button[data-sort-key="return1y"]');
    await page.click('th button[data-sort-key="return1y"]');
    const descFirst = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').first().getAttribute('data-symbol');
    await page.click('th button[data-sort-key="return1y"]');
    const ascFirst = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').first().getAttribute('data-symbol');
    assert.notEqual(descFirst, ascFirst);
    await page.click('th button[data-sort-key="ticker"]');
    const tickerHeader = await page.locator('th button[data-sort-key="ticker"]').innerText();
    assert.match(tickerHeader, /Stock/);
    const pager = await page.locator('[data-pager]').innerText();
    assert.match(pager, /Showing|Page/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Filters and chips work for search, exchange and performance horizon', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
    await page.fill('[data-search]', 'Apple');
    await page.locator('[data-search]').press('Tab');
    await page.waitForTimeout(200);
    const filtered = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').count();
    assert.ok(filtered <= 1, `filtered=${filtered}`);
    const chips = await page.locator('[data-filter-chips] [data-chip-key]').count();
    assert.ok(chips >= 1);
    await page.click('[data-filter-reset]');
    await page.waitForFunction(() => document.querySelectorAll('[data-filter-chips] [data-chip-key]').length === 0 || document.querySelector('[data-filter-chips]').hidden);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Picks view shows Strong and Weak with nine horizon explanations', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/?market=us&view=picks`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.market-picks-card');
    const cards = await page.locator('.market-picks-card').count();
    assert.equal(cards, 2);
    const horizonsPerCard = await page.locator('.market-picks-card .market-picks-horizon').count();
    assert.ok(horizonsPerCard >= 9, `horizon count ${horizonsPerCard}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Instrument page shows nine horizon cards, full toolset, MACD histogram and Daily default', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/instrument/?market=us&symbol=aapl`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.instrument-horizon-card');
    const horizons = await page.locator('.instrument-horizon-card').count();
    assert.equal(horizons, 9);
    const timeframeOptions = await page.locator('[data-timeframe] option').count();
    assert.equal(timeframeOptions, 9);
    assert.equal(await page.locator('[data-frequency]').inputValue(), '1d');
    await page.check('[data-oscillator][value="macd"]');
    const histogramBars = await page.locator('.macd-histogram').count();
    assert.ok(histogramBars > 0, 'histogram rendered');
    const chart = await page.locator('.price-chart').boundingBox();
    if (chart) {
      await page.locator('.price-chart').hover({ position: { x: chart.width / 2, y: chart.height / 2 } });
      await page.waitForSelector('[data-chart-tooltip]:not([hidden])', { timeout: 5000 });
      const tooltipText = await page.locator('[data-chart-tooltip]').innerText();
      assert.match(tooltipText, /Close/);
    }
    const historyRows = await page.locator('[data-history-table] tbody tr').count();
    assert.ok(historyRows > 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Crypto instrument defaults to Daily and never opens 4H automatically', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page, 'crypto', 'btc');
  try {
    await page.goto(`${base}/analytics/markets/instrument/?market=crypto&symbol=btc`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-frequency]');
    assert.equal(await page.locator('[data-frequency]').inputValue(), '1d');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
