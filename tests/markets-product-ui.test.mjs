import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const marketSources = [
  'scripts/markets/update_markets.py',
  'frontend/analytics/markets/index.html',
  'frontend/analytics/markets/app.js',
  'frontend/analytics/markets/core.js',
  'frontend/js/v3/apps/markets/src/app.js',
];

test('Markets production sources contain no volume or split feature', () => {
  for (const path of marketSources) {
    const source = read(path);
    assert.doesNotMatch(source, /volume/i, path);
    assert.doesNotMatch(source, /splitSuspect|splitAdjusted|corporate action|reverse split/i, path);
  }
});

test('standalone Markets exposes overview signals explorer crypto risk and data health views', () => {
  const html = read('frontend/analytics/markets/index.html');
  for (const view of ['overview', 'signals', 'explorer', 'crypto-risk', 'data-health']) {
    assert.match(html, new RegExp(`data-view="${view}"`), view);
  }
  assert.match(html, /data-watchlist-only/);
  assert.match(html, /data-columns/);
  assert.match(html, /data-export-csv/);
  assert.match(html, /data-breadth-chart/);
});

test('frontends use market-scoped summaries and shared dashboard code', () => {
  const shared = read('frontend/analytics/markets/dashboard.js');
  const standalone = read('frontend/analytics/markets/app.js');
  const osApp = read('frontend/js/v3/apps/markets/src/app.js');
  assert.match(shared, /summary\/\$\{market\}\/index\.json/);
  assert.match(shared, /link\[href=\"\/analytics\/markets\/markets\.css\"\]/);
  assert.doesNotMatch(shared, /cache\s*:\s*['"]no-store/);
  assert.match(standalone, /createMarketsDashboard/);
  assert.match(osApp, /createMarketsDashboard/);
});

test('generic instrument page supports timeframes indicators and oscillators', () => {
  assert.equal(existsSync('frontend/analytics/markets/instrument/index.html'), true);
  assert.equal(existsSync('frontend/analytics/markets/instrument/app.js'), true);
  const html = read('frontend/analytics/markets/instrument/index.html');
  const app = read('frontend/analytics/markets/instrument/app.js');
  for (const timeframe of ['1M', '3M', '6M', '1Y', '5Y', 'ALL']) assert.match(html, new RegExp(`value="${timeframe}"`));
  for (const indicator of ['sma20', 'sma50', 'sma200', 'ema12', 'ema26', 'bollinger', 'rsi14', 'macd', 'roc20']) assert.match(html + app, new RegExp(indicator, 'i'));
  assert.match(html, /data-date-from/);
  assert.match(html, /data-date-to/);
  assert.match(app, /history\/\$\{market\}\/\$\{encodeURIComponent\(symbol\)\}\.json/);
  assert.doesNotMatch(app, /finance\.yahoo\.com/);
});

test('instrument navigation supports row activation, double click and exact-search submit', () => {
  const dashboard = read('frontend/analytics/markets/dashboard.js');
  assert.match(dashboard, /dblclick/);
  assert.match(dashboard, /data-open-instrument/);
  assert.match(dashboard, /detailUrl/);
  assert.match(dashboard, /requestSubmit|submit/);
});
