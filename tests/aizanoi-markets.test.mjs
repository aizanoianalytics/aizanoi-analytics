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
  assert.match(html, /data-markets-root/);
  assert.match(html, /data-view="overview"/);
  assert.match(html, /data-view="crypto-risk"/);
  assert.match(html, /Close-price intelligence/);
  assert.match(html, /name="twitter:site" content="@AizanoiHQ"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /not investment advice/i);
});

test('browser loads static shards and never calls upstream providers directly', () => {
  const app = read('frontend/analytics/markets/dashboard.js');
  assert.match(app, /\/analytics\/markets\/data/);
  assert.match(app, /summary\/\$\{market\}\/index\.json/);
  assert.doesNotMatch(app, /finance\.yahoo\.com/);
});

test('crypto universe maps ambiguous names to the intended instruments', () => {
  const config = JSON.parse(read('scripts/markets/crypto-universe.json'));
  // Schema v3: active contract is providerSymbol (Binance USDT pair).
  const expectedSymbols = [
    'AAVEUSDT','ADAUSDT','APTUSDT','ARBUSDT','ATOMUSDT','AVAXUSDT',
    'BCHUSDT','BTCUSDT','DOGEUSDT','DOTUSDT','ETCUSDT','ETHUSDT','FILUSDT',
    'GRAMUSDT','HBARUSDT','INJUSDT','LINKUSDT','LTCUSDT','NEARUSDT','ONDOUSDT',
    'OPUSDT','POLUSDT','RENDERUSDT','RUNEUSDT','SUSDT','SANDUSDT',
    'SOLUSDT','SUIUSDT','TAOUSDT','THETAUSDT','UNIUSDT',
    'VIRTUALUSDT','XLMUSDT','XRPUSDT','ZECUSDT',
  ];
  assert.deepEqual(config.map((entry) => entry.providerSymbol), expectedSymbols);
  assert.equal(config.find((entry) => entry.label === 'Sonic').providerSymbol, 'SUSDT');
  assert.equal(config.find((entry) => entry.label === 'Aptos').providerSymbol, 'APTUSDT');
  assert.equal(config.find((entry) => entry.label === 'Sui').providerSymbol, 'SUIUSDT');
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

test('market metric engine identifies momentum, drawdown and 52-week position', async () => {
  const { computeMetrics } = await import('../frontend/analytics/markets/metrics.js');
  const candles = Array.from({ length: 220 }, (_, index) => ({
    t: 1_700_000_000 + index * 86_400,
    c: 101 + index,
  }));
  const metrics = computeMetrics(candles, { annualization: 252 });
  assert.ok(metrics.return30d > 0);
  assert.ok(metrics.rangePosition52w > 0.99);
  assert.ok(metrics.drawdown1y <= 0);
  assert.equal(metrics.aboveSma200, true);
});
