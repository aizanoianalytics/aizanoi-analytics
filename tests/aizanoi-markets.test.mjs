import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const requestedCrypto = [
  'AAVE-USD','ADA-USD','APT21794-USD','ARB11841-USD','ATOM-USD','AVAX-USD',
  'BCH-USD','BTC-USD','DOGE-USD','DOT-USD','ETC-USD','ETH-USD','FIL-USD',
  'GRAM-USD','HBAR-USD','INJ-USD','LINK-USD','LTC-USD','NEAR-USD','ONDO-USD',
  'OP-USD','POL28321-USD','RENDER-USD','RUNE-USD','S32684-USD','SAND-USD',
  'SOL-USD','SUI20947-USD','TAO22974-USD','THETA-USD','UNI7083-USD',
  'VIRTUAL-USD','XLM-USD','XRP-USD','ZEC-USD',
];

test('Aizanoi Markets is registered as an Analytics set', () => {
  const catalog = read('frontend/analytics/catalog.js');
  assert.match(catalog, /id:'aizanoi-markets'/);
  assert.match(catalog, /landing:'\/analytics\/markets\/'/);
  assert.match(catalog, /title:'Aizanoi Markets'/);
});

test('Markets landing exposes accessible US and Crypto dashboard tabs', () => {
  assert.equal(existsSync('frontend/analytics/markets/index.html'), true);
  const html = read('frontend/analytics/markets/index.html');
  assert.match(html, /<title>Aizanoi Markets — Aizanoi Analytics<\/title>/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-market="us"/);
  assert.match(html, /data-market="crypto"/);
  assert.match(html, /Data source: Yahoo Finance/);
  assert.match(html, /name="twitter:site" content="@AizanoiHQ"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /not investment advice/i);
});

test('browser loads static shards and never calls Yahoo directly', () => {
  const app = read('frontend/analytics/markets/app.js');
  assert.match(app, /\/analytics\/markets\/data\/manifest\.json/);
  assert.match(app, /\/analytics\/markets\/data\/summary\.json/);
  assert.doesNotMatch(app, /query[12]\.finance\.yahoo\.com/);
});

test('crypto universe maps ambiguous names to the intended Yahoo instruments', () => {
  const config = JSON.parse(read('scripts/markets/crypto-universe.json'));
  assert.deepEqual(config.map((entry) => entry.yahooSymbol), requestedCrypto);
  assert.equal(config.find((entry) => entry.label === 'Sonic').yahooSymbol, 'S32684-USD');
  assert.equal(config.find((entry) => entry.label === 'Aptos').yahooSymbol, 'APT21794-USD');
  assert.equal(config.find((entry) => entry.label === 'Sui').yahooSymbol, 'SUI20947-USD');
});

test('Markets is included in canonical sitemap generation', () => {
  const builder = read('scripts/news/build-news.mjs');
  assert.match(builder, /\['\/analytics\/markets\/', '2026-09-10'\]/);
  assert.match(read('frontend/sitemap.xml'), /https:\/\/aizanoianalytics\.com\/analytics\/markets\//);
});

test('Markets pipeline and frontend each document their ownership boundary', () => {
  assert.equal(existsSync('frontend/analytics/markets/index.md'), true);
  assert.equal(existsSync('scripts/markets/index.md'), true);
  assert.match(read('scripts/index.md'), /markets\/index\.md/);
});

test('operator runbook documents the Markets bootstrap and hourly commands', () => {
  const operations = read('docs/HERMES_OPERATIONS.md');
  assert.match(operations, /Aizanoi Markets refresh loop/);
  assert.match(operations, /update_markets\.py --mode bootstrap/);
  assert.match(operations, /update_markets\.py --mode hourly/);
  assert.match(operations, /\/var\/lib\/aizanoi-markets\/public/);
});

test('Nginx keeps mutable market data outside immutable release trees', () => {
  const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
  assert.match(nginx, /location \^~ \/analytics\/markets\/data\//);
  assert.match(nginx, /alias \/var\/lib\/aizanoi-markets\/public\//);
  assert.match(nginx, /expires -1/);
});

test('market metric engine identifies momentum, drawdown and unusual volume', async () => {
  const { computeMetrics } = await import('../frontend/analytics/markets/metrics.js');
  const candles = Array.from({ length: 220 }, (_, index) => ({
    t: 1_700_000_000 + index * 86_400,
    o: 100 + index,
    h: 102 + index,
    l: 99 + index,
    c: 101 + index,
    v: index === 219 ? 10_000 : 1_000,
  }));
  const metrics = computeMetrics(candles, { annualization: 252 });
  assert.ok(metrics.return30d > 0);
  assert.ok(metrics.volumeZ20 > 3);
  assert.ok(metrics.drawdown1y <= 0);
  assert.equal(metrics.aboveSma200, true);
  assert.ok(metrics.rsi14 > 50);
});
