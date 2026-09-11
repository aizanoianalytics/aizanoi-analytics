import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = path.join(process.cwd(), 'artifacts/final-visual-review');
fs.mkdirSync(out, { recursive: true });

const quality = { dailyClose: 'complete', fourHour: 'complete', ohlcv: 'unavailable', history: 'complete' };

function buildUniverse(market, count) {
  return Array.from({ length: count }, (_, i) => ({
    market,
    ticker: `${market === 'us' ? 'U' : 'C'}${String(i).padStart(3, '0')}`,
    name: `${market === 'us' ? 'United Stock' : 'Crypto Asset'} ${i}`,
    exchange: market === 'us' ? (i % 2 ? 'NYSE' : 'NASDAQ') : 'Crypto · USD',
    slug: `${market}${i}`,
    memberships: market === 'us' ? ['S&P 500'] : ['Crypto'],
    latestPrice: (market === 'us' ? 100 : 10000) + (i % 12) * (i % 2 === 0 ? 1 : -1),
    previousPrice: 99 + i,
    price1w: 101 + i, price1m: 102 + i, price3m: 103 + i, price6m: 104 + i,
    price1y: 105 + i, price2y: 106 + i, price3y: 107 + i, price2019: 108 + i,
    return1d: (i % 7 - 3) * 0.01, return1w: (i % 5 - 2) * 0.02, return1m: (i % 11 - 5) * 0.01,
    return3m: (i % 13 - 6) * 0.015, return6m: (i % 9 - 4) * 0.02, return1y: (i % 17 - 8) * 0.03,
    return2y: (i % 19 - 9) * 0.04, return3y: (i % 23 - 11) * 0.05, returnSince2019: (i % 29 - 14) * 0.06,
    dataQuality: quality,
  }));
}

const usRows = buildUniverse('us', 12);
const cryptoRows = buildUniverse('crypto', 10);
usRows[0].ticker = 'AAPL'; usRows[0].name = 'Apple Inc.'; usRows[0].slug = 'aapl';
usRows[1].ticker = 'MSFT'; usRows[1].name = 'Microsoft Corp.'; usRows[1].slug = 'msft';
Object.assign(usRows[1], { return1d: 0.04, return1w: 0.05, return1m: 0.06, return3m: 0.07, return6m: 0.08, return1y: 0.35, return2y: 0.4, return3y: 0.45, returnSince2019: 0.5 });
Object.assign(usRows[2], { return1d: -0.04, return1w: -0.05, return1m: -0.06, return3m: -0.07, return6m: -0.08, return1y: -0.35, return2y: -0.4, return3y: -0.45, returnSince2019: -0.5 });

function pulse(market, rows) {
  const advancing = rows.filter(row => row.return1d > 0).length;
  const declining = rows.filter(row => row.return1d < 0).length;
  return {
    market, instruments: rows.length, observed1d: rows.length, advancing, declining,
    advancingShare: advancing / rows.length, decliningShare: declining / rows.length,
    medianReturn1d: 0.001, medianReturn1y: 0.05,
  };
}

function history(market, slug, ticker) {
  const startTs = 1_577_836_800;
  return {
    market, ticker, name: ticker, provider: market === 'us' ? 'fintable' : 'binance',
    exchange: market === 'us' ? 'NASDAQ' : 'Crypto · USD', slug, dataQuality: quality,
    daily: Array.from({ length: 1500 }, (_, i) => ({ t: startTs + i * 86_400, c: 100 + i * 0.1 + Math.sin(i / 6) * 2 })),
    fourHour: [],
  };
}

async function installFixtures(page) {
  await page.route('**/analytics/markets/data/manifest.json', route => route.fulfill({ json: { schemaVersion: 3, completedAt: '2026-09-11T07:00:00Z', status: 'complete', counts: { us: usRows.length, crypto: cryptoRows.length } } }));
  await page.route('**/analytics/markets/data/health.json', route => route.fulfill({ json: { schemaVersion: 3, status: 'complete', us: { expected: usRows.length, published: usRows.length, missingHistory: [], failedCurrentRefresh: [], stale: 0, status: 'complete', latestObservationAt: '2026-09-10T04:00:00Z', priceBasis: 'Adjusted close', provider: 'fintable' }, crypto: { expected: cryptoRows.length, published: cryptoRows.length, missingHistory: [], failedCurrentRefresh: [], stale: 0, status: 'complete', latestObservationAt: '2026-09-10T00:00:00Z', priceBasis: 'Exchange close', provider: 'binance' }, failedSymbols: [], quality: { fourHourUnavailable: 0, limitedHistory: 0 } } }));
  await page.route('**/analytics/markets/data/snapshots/pulse.json', route => route.fulfill({ json: { snapshots: [] } }));
  for (const m of ['us', 'crypto']) {
    const rows = m === 'us' ? usRows : cryptoRows;
    await page.route(`**/analytics/markets/data/summary/${m}/index.json`, route => route.fulfill({ json: { market: m, chunks: [{ path: '00.json', count: rows.length }] } }));
    await page.route(`**/analytics/markets/data/summary/${m}/00.json`, route => route.fulfill({ json: { market: m, rows } }));
    await page.route(`**/analytics/markets/data/pulse/${m}.json`, route => route.fulfill({ json: pulse(m, rows) }));
  }
  await page.route('**/analytics/markets/data/history/us/aapl.json', route => route.fulfill({ json: history('us', 'aapl', 'AAPL') }));
  await page.route('**/analytics/markets/data/summary-items/us/aapl.json', route => route.fulfill({ json: usRows[0] }));
  await page.route('**/analytics/markets/data/instruments.json', route => route.fulfill({ json: [...usRows, ...cryptoRows] }));
}

const browser = await chromium.launch({ headless: true });
const shots = [
  ['markets-00-main-1440', '/analytics/markets/?market=us', { width: 1440, height: 900 }, '[data-rankings-block]'],
  ['markets-01-main-390', '/analytics/markets/?market=us', { width: 390, height: 844 }, '[data-rankings-block]'],
  ['markets-02-main-320', '/analytics/markets/?market=us', { width: 320, height: 568 }, '[data-rankings-block]'],
  ['markets-03-picks-1440', '/analytics/markets/?market=us&view=picks', { width: 1440, height: 900 }, '.market-picks-card'],
  ['markets-04-picks-390', '/analytics/markets/?market=us&view=picks', { width: 390, height: 844 }, '.market-picks-card'],
  ['markets-05-picks-320', '/analytics/markets/?market=us&view=picks', { width: 320, height: 568 }, '.market-picks-card'],
  ['markets-06-instrument-1440', '/analytics/markets/instrument/?market=us&symbol=aapl', { width: 1440, height: 900 }, '.instrument-horizon-card'],
  ['markets-07-instrument-390', '/analytics/markets/instrument/?market=us&symbol=aapl', { width: 390, height: 844 }, '.instrument-horizon-card'],
  ['markets-08-instrument-320', '/analytics/markets/instrument/?market=us&symbol=aapl', { width: 320, height: 568 }, '.instrument-horizon-card'],
];

for (const [name, route, viewport, ready] of shots) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installFixtures(page);
  const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`${route} returned ${response?.status()}`);
  await page.waitForSelector(ready, { timeout: 15000 });
  await page.waitForTimeout(400);
  if (errors.length) throw new Error(`${name} browser errors: ${errors.join(' | ')}`);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  console.log(`captured ${name}.png`);
  await context.close();
}
await browser.close();
console.log('Markets visual capture complete: 9 screenshots with deterministic fixtures.');
