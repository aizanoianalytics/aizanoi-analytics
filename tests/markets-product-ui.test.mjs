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

test('standalone Markets exposes only Markets and Aizanoi Picks navigation, no legacy tabs', () => {
  const html = read('frontend/analytics/markets/index.html');
  const dashboard = read('frontend/analytics/markets/dashboard.js');
  for (const legacy of ['Signals', 'Explorer', 'Crypto risk', 'Data health', 'data-view="signals"', 'data-view="explorer"', 'data-view="crypto-risk"', 'data-view="data-health"', 'Rate of change 20']) {
    assert.doesNotMatch(html + dashboard, new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), legacy);
  }
  assert.match(html + dashboard, /data-nav="main"/);
  assert.match(html + dashboard, /data-nav="picks"/);
  assert.match(html, /Aizanoi Picks/);
  assert.match(html, /Markets/);
});

test('main dashboard surfaces status strip, four breadth cards, six rankings and raw data', () => {
  const dashboard = read('frontend/analytics/markets/dashboard.js');
  assert.match(dashboard, /data-status-strip/);
  assert.match(dashboard, /data-breadth/);
  assert.match(dashboard, /data-rankings-block/);
  assert.match(dashboard, /data-raw-section/);
  assert.match(dashboard, /data-price-mode="price"/);
  assert.match(dashboard, /data-price-mode="change"/);
  assert.match(dashboard, /market-filter-chips/);
  assert.match(dashboard, /data-pager/);
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

test('generic instrument page supports all required timeframes and ROC 12 label', () => {
  const html = read('frontend/analytics/markets/instrument/index.html');
  const app = read('frontend/analytics/markets/instrument/app.js');
  for (const timeframe of ['1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y']) {
    assert.match(app + html, new RegExp(`['"]${timeframe}['"]`), timeframe);
  }
  for (const timeframe of ['SINCE_2019', 'CUSTOM']) {
    assert.match(app, new RegExp(`['"]${timeframe}['"]`), timeframe);
  }
  for (const indicator of ['sma20', 'sma50', 'sma200', 'ema12', 'ema26', 'ema50', 'bollinger', 'rsi14', 'macd', 'macdHistogram', 'roc12']) {
    assert.match(app + html, new RegExp(indicator, 'i'), indicator);
  }
  assert.match(app, /ROC 12/);
  assert.doesNotMatch(app + html, /Rate of change 20/i);
  assert.match(app + html, /data-date-from/);
  assert.match(app + html, /data-date-to/);
  assert.match(app, /history\/\$\{market\}\/\$\{encodeURIComponent\(symbol\)\}\.json/);
});

test('instrument page defaults frequency to Daily and only restores requested crypto 4H', () => {
  const app = read('frontend/analytics/markets/instrument/app.js');
  assert.match(app, /frequency: '1d'/);
  assert.match(app, /market === 'crypto' && requestedFrequency === '4h' && has4H/);
  assert.doesNotMatch(app, /payload\.fourHour\?\.length \? '4h'/);
});

test('navigation supports row activation, double click and exact-search submit', () => {
  const dashboard = read('frontend/analytics/markets/dashboard.js');
  assert.match(dashboard, /handleDblClick|dblclick/);
  assert.match(dashboard, /data-open-instrument/);
  assert.match(dashboard, /detailUrl/);
  assert.match(dashboard, /requestSubmit|submit/);
});
