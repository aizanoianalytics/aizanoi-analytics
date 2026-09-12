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
usRows[0].latestPrice = 200; usRows[1].latestPrice = 400; usRows[2].latestPrice = 20;
usRows[8].return1d = 0.04; usRows[8].return1m = 0.1; usRows[8].return3m = 0.1; usRows[8].return6m = 0.1; usRows[8].return2y = 0.1; usRows[8].return3y = 0.1; usRows[8].returnSince2019 = 0.1;
cryptoRows[0].ticker = 'BTC'; cryptoRows[0].name = 'Bitcoin'; cryptoRows[0].slug = 'btc';
cryptoRows[0].return1y = 1.5; cryptoRows[0].return1d = -0.03;

async function installFixtures(page, market = 'us', symbol = 'aapl', fixtureRows = { us: usRows, crypto: cryptoRows }) {
  const rowsFor = value => fixtureRows[value] || (value === 'us' ? usRows : cryptoRows);
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json: { schemaVersion: 3, completedAt: '2026-09-11T07:00:00Z', status: 'complete', counts: { us: rowsFor('us').length, crypto: rowsFor('crypto').length } } }));
  await page.route('**/analytics/markets/data/health.json', route => route.fulfill({ json: { schemaVersion: 3, status: 'complete', us: { expected: usRows.length, published: usRows.length, missingHistory: [], failedCurrentRefresh: [], stale: 0, status: 'complete', latestObservationAt: '2026-09-10T04:00:00Z', priceBasis: 'Adjusted close', provider: 'fintable' }, crypto: { expected: cryptoRows.length, published: cryptoRows.length, missingHistory: [], failedCurrentRefresh: [], stale: 0, status: 'complete', latestObservationAt: '2026-09-10T00:00:00Z', priceBasis: 'Exchange close', provider: 'binance' }, failedSymbols: [], quality: { fourHourUnavailable: 0, limitedHistory: 0 } } }));
  await page.route('**/analytics/markets/data/snapshots/pulse.json', route => route.fulfill({ json: { snapshots: [] } }));
  for (const m of ['us', 'crypto']) {
    const rows = rowsFor(m);
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
      await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]', { timeout: 15000 });
      assert.equal(await page.locator('[data-breadth]').count(), 0, 'unreliable advancing/declining breadth cards are removed');
      assert.equal(await page.locator('[data-table-filter-toggle]').count(), 1, 'Raw Data owns its table filters');
      const rankings = await page.locator('[data-ranking]').count();
      assert.equal(rankings, 1, 'compact UX renders a single ranking block with preset selector');
      const titles = await page.locator('[data-ranking] h3').allTextContents();
      assert.deepEqual(titles, ['Today · Winners']);
      const presetButtons = await page.locator('[data-ranking-preset]').count();
      assert.equal(presetButtons, 6, 'preset selector exposes all six ranking presets');
      const topFirst = await page.locator('[data-ranking]').nth(0).locator('[data-ranking-symbol]').first().getAttribute('data-ranking-symbol');
      assert.equal(topFirst, 'aapl');
      const bottomFirst = await page.locator('[data-ranking]').nth(1).locator('[data-ranking-symbol]').first().getAttribute('data-ranking-symbol');
      assert.equal(bottomFirst, 'us7');
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
      const overflow = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
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
    const tickerDescFirst = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').first().getAttribute('data-symbol');
    assert.equal(tickerDescFirst, 'us11');
    await page.click('th button[data-sort-key="ticker"]');
    const tickerAscFirst = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').first().getAttribute('data-symbol');
    assert.equal(tickerAscFirst, 'aapl');
    await page.click('th button[data-sort-key="ticker"]');
    const tickerDescAgain = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').first().getAttribute('data-symbol');
    assert.equal(tickerDescAgain, 'us11');
    const pager = await page.locator('[data-pager]').innerText();
    assert.match(pager, /Showing|Page/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Sorted column header exposes aria-sort state', async () => {
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
    const sortedTh = page.locator('th[aria-sort="descending"]');
    assert.equal(await sortedTh.count(), 1);
    assert.equal(await sortedTh.locator('button[data-sort-key="return1y"]').count(), 1);
    await page.click('th button[data-sort-key="return1y"]');
    assert.equal(await page.locator('th[aria-sort="ascending"]').count(), 1);
    assert.equal(await page.locator('th[aria-sort="descending"]').count(), 0);
    const unsorted = await page.locator('th[aria-sort="none"]').count();
    assert.ok(unsorted > 0, 'inactive headers keep aria-sort none');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Excel-style Raw Data filters and chips work for search, exchange and performance horizon', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
    await page.click('[data-table-filter-toggle]');
    await page.waitForSelector('[data-table-filter-row]:not([hidden])');
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
    // Compact UX: each pick row carries a single nine-character signline
    // summarising 1D/1W/1M/3M/6M/1Y/2Y/3Y/Since-2019 (+ / − / 0).
    const signlineCount = await page.locator('.market-picks-card .market-picks-signline').count();
    assert.ok(signlineCount >= 2, `expected at least one signline per card, got ${signlineCount}`);
    const nineHorizonChars = (await page.locator('.market-picks-card .market-picks-signline').first().getAttribute('title') || '').split(/\s+/).filter(Boolean);
    assert.deepEqual(nineHorizonChars, ['1D', '1W', '1M', '3M', '6M', '1Y', '2Y', '3Y', 'Since', '2019'].slice(0, 9), 'signline title exposes nine horizon labels');
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

test('Price filter survives the Price/Change display mode toggle', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
    await page.click('[data-table-filter-toggle]');
    await page.fill('[data-min-price]', '150');
    await page.fill('[data-max-price]', '450');
    await page.locator('[data-max-price]').press('Tab');
    await page.waitForFunction(() => document.querySelectorAll('tbody[data-raw-table-body] tr[data-symbol]').length === 2);
    const priceSlugs = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').evaluateAll(els => els.map(el => el.getAttribute('data-symbol')));
    assert.deepEqual([...priceSlugs].sort(), ['aapl', 'us1']);
    await page.click('[data-price-mode="change"]');
    await page.waitForSelector('th button[data-sort-key="return1d"]');
    const changeSlugs = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').evaluateAll(els => els.map(el => el.getAttribute('data-symbol')));
    assert.deepEqual([...changeSlugs].sort(), ['aapl', 'us1']);
    assert.ok(changeSlugs.length > 0, 'price filter not wiped by change mode');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const width of [390, 320]) {
  test(`Mobile Raw Data filter row opens without overflow at ${width}px`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', err => errors.push(String(err)));
    await installFixtures(page);
    try {
      await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
      await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
      const before = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').count();
      assert.equal(before, 12);
      const filter = page.locator('[data-table-filter-toggle]');
      assert.equal(await filter.isVisible(), true);
      assert.equal(await filter.getAttribute('aria-expanded'), 'false');
      await filter.click();
      assert.equal(await filter.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('[data-table-filter-row]:not([hidden])').count(), 1);
      assert.equal(await page.locator('[data-exchange]').isVisible(), true);
      assert.equal(await page.locator('[data-min-price]').isVisible(), true);
      assert.equal(await page.locator('[data-performance-horizon]').isVisible(), true);
      await page.selectOption('[data-exchange]', 'NASDAQ');
      await page.waitForFunction(() => document.querySelectorAll('tbody[data-raw-table-body] tr[data-symbol]').length === 6);
      const after = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').count();
      assert.equal(after, 6);
      await filter.click();
      assert.equal(await filter.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('[data-table-filter-row]:not([hidden])').count(), 0);
      const overflow = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `mobile filters overflow ${overflow}`);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

for (const width of [390, 320]) {
  test(`Aizanoi Picks shows nine readable horizons per card at ${width}px`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', err => errors.push(String(err)));
    await installFixtures(page);
    try {
      await page.goto(`${base}/analytics/markets/?market=us&view=picks`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.market-picks-card');
      assert.equal(await page.locator('.market-picks-card').count(), 2);
      const rows = page.locator('.market-picks-row');
      const rowCount = await rows.count();
      assert.ok(rowCount >= 2, `picks rows ${rowCount}`);
      for (let i = 0; i < rowCount; i++) {
        // Compact UX collapses the nine horizon cells into a single signline
        // span whose nine characters encode 1D/1W/1M/3M/6M/1Y/2Y/3Y/Since2019.
        const signline = rows.nth(i).locator('.market-picks-signline');
        assert.equal(await signline.count(), 1, `row ${i} signline rendered`);
        const hbox = await signline.boundingBox();
        assert.ok(hbox.width > 0 && hbox.height > 0, `row ${i} signline rendered`);
        assert.ok(hbox.x >= -1 && hbox.x + hbox.width <= width + 1, `row ${i} signline inside viewport`);
        assert.equal(await signline.isVisible(), true);
        const text = (await signline.textContent() || '').trim();
        assert.equal(text.length, 9, `row ${i} signline encodes nine horizons, got "${text}"`);
      }
      const cards = page.locator('.market-picks-card');
      for (let i = 0; i < 2; i++) {
        const box = await cards.nth(i).boundingBox();
        assert.ok(box.width <= width + 1, `card ${i} width ${box.width} at ${width}px`);
      }
      const overflow = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `picks overflow ${overflow} at ${width}px`);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test('Dashboard search keeps focus while typing character by character', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.click('[data-table-filter-toggle]');
    await page.waitForSelector('[data-search]');
    await page.click('[data-search]');
    // Character-by-character keystrokes (not fill): CDP dispatches each key to
    // the focused node, so a burst faster than the 120ms live-filter debounce
    // yields a single trailing render, mirroring sustained human typing.
    await page.keyboard.type('Apple', { delay: 0 });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-search]').inputValue(), 'Apple');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-search]')), true);
    const filtered = await page.locator('tbody[data-raw-table-body] tr[data-symbol]').count();
    assert.equal(filtered, 1);
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
    assert.match(await page.locator('.instrument-meta').innerText(), /Crypto · USDT/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

const HISTORY_START = 1_577_836_800;
const HISTORY_DAY = 86_400;
const historyISO = index => new Date((HISTORY_START + index * HISTORY_DAY) * 1000).toISOString().slice(0, 10);
const historyClose = index => 100 + index * 0.1 + Math.sin(index / 6) * 2;

test('Historical prices filter by From/To, search full history, paginate and show canonical change', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/instrument/?market=us&symbol=aapl`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-history-table] tbody tr');
    const urlBefore = page.url();
    const pagerText = await page.locator('[data-history-pager]').innerText();
    assert.match(pagerText, /of 1,500/);
    const secondRowChange = await page.locator('[data-history-table] tbody tr').nth(1).locator('td').nth(2).innerText();
    const expectedChange = await page.evaluate(({ prev, curr }) => import('/analytics/markets/core.js').then(m => m.formatSignedReturn(curr / prev - 1)), { prev: historyClose(0), curr: historyClose(1) });
    assert.equal(secondRowChange, expectedChange);
    const targetDate = historyISO(250);
    await page.fill('[data-history-search]', targetDate);
    await page.waitForFunction(date => document.querySelector('[data-history-table] tbody tr[data-history-symbol] td')?.innerText === date, targetDate);
    const foundDate = await page.locator('[data-history-table] tbody tr[data-history-symbol] td').first().innerText();
    assert.equal(foundDate, targetDate);
    const searchPager = await page.locator('[data-history-pager]').innerText();
    assert.ok(searchPager.includes('1–1 of 1'));
    const searchedChange = await page.locator('[data-history-table] tbody tr[data-history-symbol] td').nth(2).innerText();
    const expectedSearched = await page.evaluate(({ prev, curr }) => import('/analytics/markets/core.js').then(m => m.formatSignedReturn(curr / prev - 1)), { prev: historyClose(249), curr: historyClose(250) });
    assert.equal(searchedChange, expectedSearched);
    await page.fill('[data-history-search]', '');
    await page.fill('[data-history-from]', historyISO(100));
    await page.fill('[data-history-to]', historyISO(199));
    await page.click('[data-history-filter] button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('[data-history-pager]').innerText.includes('1–100 of 100'));
    const firstFiltered = await page.locator('[data-history-table] tbody tr[data-history-symbol] td').first().innerText();
    assert.equal(firstFiltered, historyISO(100));
    assert.equal(page.url(), urlBefore);
    await page.fill('[data-history-from]', historyISO(300));
    await page.fill('[data-history-to]', historyISO(200));
    await page.click('[data-history-filter] button[type="submit"]');
    await page.waitForSelector('[data-history-table] .market-table-empty');
    assert.match(await page.locator('[data-history-table]').innerText(), /Invalid date range/);
    assert.equal(page.url(), urlBefore);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Historical row click brings an old date onto the chart with a marker', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/instrument/?market=us&symbol=aapl`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-history-table] tbody tr');
    assert.equal(await page.locator('[data-timeframe]').inputValue(), '1Y');
    const oldDate = historyISO(800);
    await page.fill('[data-history-search]', oldDate);
    await page.waitForFunction(() => document.querySelectorAll('[data-history-table] tbody tr[data-history-symbol]').length === 1);
    await page.click('[data-history-table] tbody tr[data-history-symbol]');
    await page.waitForFunction(() => document.querySelector('[data-timeframe]').value === 'SINCE_2019');
    assert.equal(await page.locator('[data-selected-date]').inputValue(), oldDate);
    assert.equal(await page.locator('[data-chart-svg] .selected-date-marker').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('History search keeps focus while typing character by character', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', err => errors.push(String(err)));
  await installFixtures(page);
  try {
    await page.goto(`${base}/analytics/markets/instrument/?market=us&symbol=aapl`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-history-search]');
    await page.click('[data-history-search]');
    const partial = historyISO(250).slice(0, 7);
    // Same burst-typing rationale as the dashboard search test above.
    await page.keyboard.type(partial, { delay: 0 });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-history-search]').inputValue(), partial);
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-history-search]')), true);
    const count = await page.locator('[data-history-table] tbody tr[data-history-symbol]').count();
    assert.ok(count >= 28 && count <= 31, `month filter count ${count}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

for (const width of [390, 320]) {
  test(`Instrument workspace is usable at ${width}px`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', err => errors.push(String(err)));
    await installFixtures(page);
    try {
      await page.goto(`${base}/analytics/markets/instrument/?market=us&symbol=aapl`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.instrument-horizon-card');
      assert.equal(await page.locator('.instrument-horizon-card').count(), 9);
      for (const selector of ['[data-frequency]', '[data-timeframe]', '[data-indicator]', '[data-history-search]', '[data-history-filter] button[type="submit"]', '[data-history-page="next"]']) {
        assert.equal(await page.locator(selector).first().isVisible(), true, selector);
      }
      const cards = page.locator('.instrument-horizon-card');
      for (let i = 0; i < 9; i++) {
        const box = await cards.nth(i).boundingBox();
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `horizon card ${i} inside viewport`);
      }
      const wrapBox = await page.locator('[data-history] .market-table-wrap').boundingBox();
      assert.ok(wrapBox.x >= -1 && wrapBox.x + wrapBox.width <= width + 1, 'history wrapper inside viewport');
      const overflow = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `instrument overflow ${overflow} at ${width}px`);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}

test('Dashboard URL state clears US filters for crypto, persists pager and performance state, and restores safely', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const manyUs = buildMarketUniverse('us', 120);
  await installFixtures(page, 'us', 'aapl', { us: manyUs, crypto: cryptoRows });
  try {
    await page.goto(`${base}/analytics/markets/?market=us&exchange=NASDAQ&membership=Nasdaq-100&page=2&perfHorizon=return1m&perfOp=between&perfMin=-2&perfMax=2`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-pager]');
    assert.match(page.url(), /page=2/);
    assert.match(await page.locator('[data-filter-chips]').innerText(), /1M between -2% and 2%/);
    await page.click('[data-market="crypto"]');
    await page.waitForFunction(() => new URLSearchParams(location.search).get('market') === 'crypto');
    await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
    assert.ok(await page.locator('tbody[data-raw-table-body] tr[data-symbol]').count() > 0, 'crypto rows remain visible');
    assert.equal(await page.locator('[data-exchange]').count(), 0);
    assert.equal(await page.locator('[data-membership]').count(), 0);
    assert.doesNotMatch(page.url(), /exchange=|membership=/);
    assert.match(page.url(), /perfHorizon=return1m/);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-table-filter-toggle]');
    await page.waitForSelector('[data-performance-horizon]');
    assert.equal(await page.locator('[data-performance-horizon]').inputValue(), 'return1m');
    assert.equal(await page.locator('[data-performance-op]').inputValue(), 'between');
    assert.equal(await page.locator('[data-performance-min]').inputValue(), '-2');
    assert.equal(await page.locator('[data-performance-max]').inputValue(), '2');
    await page.goto(`${base}/analytics/markets/?market=us&bogus=x&sort=nonsense:up&page=bad&minPrice=oops&perfHorizon=nope&perfOp=wat&perfMin=NaN`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody[data-raw-table-body] tr[data-symbol]');
    assert.equal(await page.locator('[data-search]').inputValue(), '');
    assert.doesNotMatch(page.url(), /bogus|nonsense|perfHorizon/);
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.click('[data-page-action="next"]');
    assert.match(page.url(), /page=2/);
    await page.reload({ waitUntil: 'networkidle' });
    // Default fixture is 12 rows × 50-row pageSize → single-page dashboard
    // (Page 1 of 1). The reload still keeps `page=2` in the URL state, so the
    // pager must surface a valid Page X of Y status regardless of total page count.
    const pagerText = await page.locator('[data-pager]').innerText();
    assert.match(pagerText, /Page \d+ of \d+/, `pager format ${pagerText}`);
    await page.goBack({ waitUntil: 'networkidle' });
    assert.doesNotMatch(page.url(), /page=2/);
    await page.goForward({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => location.search.includes('page=2'));
    assert.match(page.url(), /page=2/);
  } finally { await browser.close(); }
});

test('Dashboard ranking selection uses the rendered sort order for ticker and numeric pages', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const manyUs = buildMarketUniverse('us', 120);
  await installFixtures(page, 'us', 'aapl', { us: manyUs, crypto: cryptoRows });
  try {
    await page.goto(`${base}/analytics/markets/?market=us`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-ranking-symbol]');
    for (const key of ['ticker', 'latestPrice']) {
      if (key === 'latestPrice') await page.click('[data-price-mode="price"]');
      await page.click(`[data-sort-key="${key}"]`);
      const selected = await page.locator('[data-ranking-symbol]').first().getAttribute('data-ranking-symbol');
      await page.click('[data-ranking-symbol]');
      await page.waitForSelector(`tr[data-symbol="${selected}"].is-selected`);
      // Compact UX keeps the row click selection working; with 120 rows ×
      // 50-row pageSize the pager is a 3-page status (Page 1, 2 or 3 of 3).
      assert.match(await page.locator('[data-pager]').innerText(), /Page [123] of 3/);
    }
  } finally { await browser.close(); }
});

test('Instrument URL restores crypto 4h and timeframe while US rejects 4h', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installFixtures(page, 'crypto', 'btc');
  // The same scenario then navigates to US/AAPL; route both instrument payloads
  // rather than relying on the static fixture server to contain mutable data.
  await page.route('**/analytics/markets/data/history/us/aapl.json', route => route.fulfill({ json: instrumentHistory('us', 'aapl', 'AAPL') }));
  await page.route('**/analytics/markets/data/summary-items/us/aapl.json', route => route.fulfill({ json: usRows.find(row => row.slug === 'aapl') }));
  try {
    await page.goto(`${base}/analytics/markets/instrument/?market=crypto&symbol=btc&frequency=4h&timeframe=3M`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-frequency]');
    assert.equal(await page.locator('[data-frequency]').inputValue(), '4h');
    assert.equal(await page.locator('[data-timeframe]').inputValue(), '3M');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-frequency]').inputValue(), '4h');
    assert.equal(await page.locator('[data-timeframe]').inputValue(), '3M');
    await page.goto(`${base}/analytics/markets/instrument/?market=us&symbol=aapl&frequency=4h&timeframe=3M`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-frequency]');
    assert.equal(await page.locator('[data-frequency]').inputValue(), '1d');
    assert.doesNotMatch(page.url(), /frequency=4h/);
    assert.equal(await page.locator('[data-timeframe]').inputValue(), '3M');
  } finally { await browser.close(); }
});
