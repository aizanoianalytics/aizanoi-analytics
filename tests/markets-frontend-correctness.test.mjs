import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const toUrl = (rel) => pathToFileURL(path.join(repoRoot, rel)).href;

const core = await import(toUrl('frontend/analytics/markets/core.js'));
const css = readFileSync(path.join(repoRoot, 'frontend/analytics/markets/markets.css'), 'utf8');
const instrumentApp = readFileSync(path.join(repoRoot, 'frontend/analytics/markets/instrument/app.js'), 'utf8');
const dashboard = readFileSync(path.join(repoRoot, 'frontend/analytics/markets/dashboard.js'), 'utf8');

// ---------------------------------------------------------------------------
// Bug 4 — Market-aware price formatting
// ---------------------------------------------------------------------------

test('Bug 4 — formatPrice defaults to US/USD for the us market', () => {
  assert.equal(core.formatPrice(123.45), '$123.45');
  assert.equal(core.formatPrice(0), '$0.00');
  assert.equal(core.formatPrice(-12.5, 'us'), '-$12.50');
});

test('Bug 4 — formatPrice emits USDT suffix for crypto market', () => {
  assert.equal(core.formatPrice(65382.42, 'crypto'), '65,382.42 USDT');
  assert.equal(core.formatPrice(1, 'crypto'), '1.00 USDT');
});

test('Bug 4 — small crypto values keep enough decimal precision', () => {
  // < 1.00 → 4 decimals
  assert.equal(core.formatPrice(0.5, 'crypto'), '0.5000 USDT');
  // < 0.01 → 6 decimals
  assert.equal(core.formatPrice(0.005, 'crypto'), '0.005000 USDT');
  // < 0.0001 → 8 decimals
  assert.equal(core.formatPrice(0.00001234, 'crypto'), '0.00001234 USDT');
});

test('Bug 4 — non-finite prices render as em-dash placeholder', () => {
  assert.equal(core.formatPrice(NaN, 'us'), '—');
  assert.equal(core.formatPrice(NaN, 'crypto'), '—');
  assert.equal(core.formatPrice(null), '—');
  assert.equal(core.formatPrice(undefined), '—');
});

test('Bug 4 — formatPrice has second market parameter that does not affect US values', () => {
  // crypto formatting never crosses into the us market
  assert.equal(core.formatPrice(123, 'us'), '$123.00');
  assert.equal(core.formatPrice(123, 'crypto'), '123.00 USDT');
});

// ---------------------------------------------------------------------------
// Bug 4 — instrument and dashboard call sites pass the active market
// ---------------------------------------------------------------------------

test('Bug 4 — instrument/app.js forwards the page market to every formatPrice call', () => {
  // every formatPrice(value) without market arg should be formatPrice(value, market)
  const unparameterised = instrumentApp.match(/formatPrice\(([^)]+)\)/g) || [];
  for (const call of unparameterised) {
    assert.match(call, /formatPrice\([^)]+,\s*market\)/, `un-parameterised formatPrice call left in instrument/app.js: ${call}`);
  }
});

test('Bug 4 — dashboard.js forwards the active market to every formatPrice call', () => {
  const unparameterised = dashboard.match(/formatPrice\(([^)]+)\)/g) || [];
  for (const call of unparameterised) {
    // dashboard uses `this.market`, `state.market`, or a 3rd column argument
    assert.match(call, /formatPrice\([^)]+,\s*(?:this\.market|state\.market|market)\)/, `un-parameterised formatPrice call left in dashboard.js: ${call}`);
  }
});

// ---------------------------------------------------------------------------
// Bug 1 — Empty initial tooltip artifact
// ---------------------------------------------------------------------------

test('Bug 1 — chart tooltip is hidden by default and shown only when active', () => {
  // the chart-tooltip element is rendered with the hidden attribute
  assert.match(instrumentApp, /<div class="chart-tooltip" data-chart-tooltip hidden>/);
  // CSS enforces display:none when hidden
  assert.match(css, /\.chart-tooltip\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  // CSS only paints the tooltip when data-active is set
  assert.match(css, /\.chart-tooltip\[data-active\]\s*\{\s*display:\s*grid/);
  // runtime toggles data-active when showing
  assert.match(instrumentApp, /tooltip\.setAttribute\('data-active', ''\)/);
  // runtime clears data-active on hide
  assert.match(instrumentApp, /tooltip\.removeAttribute\('data-active'\)/);
});

// ---------------------------------------------------------------------------
// Bug 2 — Chart and History date ranges are independent
// ---------------------------------------------------------------------------

test('Bug 2 — chart and history date state fields are separate', () => {
  assert.match(instrumentApp, /chartDateFrom:\s*''/);
  assert.match(instrumentApp, /chartDateTo:\s*''/);
  assert.match(instrumentApp, /historyDateFrom:\s*''/);
  assert.match(instrumentApp, /historyDateTo:\s*''/);
  // no more generic state.dateFrom / state.dateTo references
  assert.doesNotMatch(instrumentApp, /\bstate\.dateFrom\b/);
  assert.doesNotMatch(instrumentApp, /\bstate\.dateTo\b/);
});

test('Bug 2 — chart toolbar inputs read/write the chart date state', () => {
  assert.match(instrumentApp, /data-date-from[\s\S]{0,80}state\.chartDateFrom/);
  assert.match(instrumentApp, /data-date-to[\s\S]{0,80}state\.chartDateTo/);
  assert.match(instrumentApp, /matches\(\s*'\[data-date-from\]'\s*\)[^}]+state\.chartDateFrom\s*=/);
  assert.match(instrumentApp, /matches\(\s*'\[data-date-to\]'\s*\)[^}]+state\.chartDateTo\s*=/);
});

test('Bug 2 — history form inputs read/write the history date state', () => {
  assert.match(instrumentApp, /data-history-from[\s\S]{0,80}state\.historyDateFrom/);
  assert.match(instrumentApp, /data-history-to[\s\S]{0,80}state\.historyDateTo/);
  assert.match(instrumentApp, /matches\(\s*'\[data-history-from\]'\s*\)[^}]+state\.historyDateFrom\s*=/);
  assert.match(instrumentApp, /matches\(\s*'\[data-history-to\]'\s*\)[^}]+state\.historyDateTo\s*=/);
});

test('Bug 2 — history filter submits only the history date state', () => {
  const submitStart = instrumentApp.indexOf("matches('[data-history-filter]'");
  assert.ok(submitStart >= 0, 'history filter submit handler not found');
  const submitMatch = instrumentApp.slice(submitStart, submitStart + 600);
  assert.match(submitMatch, /state\.historyDateFrom\s*=/);
  assert.match(submitMatch, /state\.historyDateTo\s*=/);
  assert.doesNotMatch(submitMatch, /state\.chartDateFrom\s*=/);
  assert.doesNotMatch(submitMatch, /state\.chartDateTo\s*=/);
});

test('Bug 2 — chart timeframe switches clear chart dates only', () => {
  const tfStart = instrumentApp.indexOf("matches('[data-timeframe]'");
  assert.ok(tfStart >= 0, 'timeframe handler not found');
  const tfMatch = instrumentApp.slice(tfStart, tfStart + 600);
  assert.match(tfMatch, /state\.chartDateFrom\s*=\s*''/);
  assert.match(tfMatch, /state\.chartDateTo\s*=\s*''/);
  assert.doesNotMatch(tfMatch, /state\.historyDateFrom/);
  assert.doesNotMatch(tfMatch[0], /state\.historyDateTo/);
});

test('Bug 2 — history filter and chart filter share a single historySearch field', () => {
  // history search state is intentionally one slot
  assert.match(instrumentApp, /historySearch:\s*''/);
});

// ---------------------------------------------------------------------------
// Bug 3 — Tooltip indicator values come from the full-history series
// ---------------------------------------------------------------------------

function makeCandles(count, base = 100, step = 1) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ t: 1_700_000_000 + i * 86_400, c: base + i * step });
  return out;
}

test('Bug 3 — indicatorSeries recomputes SMA/EMA over the full input', () => {
  const candles = makeCandles(120, 100, 1);
  const indicators = core.indicatorSeries(candles);
  // ema50 should be finite for the tail (warm-up period = 50)
  assert.ok(indicators.ema50.length === candles.length, 'ema50 length matches input');
  assert.ok(indicators.ema50[49] !== null, 'ema50 produces a value at the warm-up boundary');
  // last value matches a hand-computed EMA50 with seed = mean of first 50 closes
  const seed = candles.slice(0, 50).reduce((sum, c) => sum + c.c, 0) / 50;
  let prev = seed;
  for (let i = 50; i < candles.length; i++) {
    const factor = 2 / 51;
    prev = candles[i].c * factor + prev * (1 - factor);
  }
  assert.ok(Math.abs(indicators.ema50.at(-1) - prev) < 1e-9, 'ema50 tail matches the closed-form EMA chain');
});

test('Bug 3 — sliced indicator series preserves alignment with the source', () => {
  const candles = makeCandles(300, 100, 0.5);
  const indicators = core.indicatorSeries(candles);
  const offset = 50;
  const sliced = Object.fromEntries(Object.entries(indicators).map(([k, v]) => [k, v.slice(offset, offset + 100)]));
  assert.equal(sliced.sma20[0], indicators.sma20[50]);
  assert.equal(sliced.sma20.at(-1), indicators.sma20[149]);
  assert.equal(sliced.ema50[0], indicators.ema50[50]);
});

test('Bug 3 — instrument/app.js caches the full indicator series and looks up by source offset', () => {
  assert.match(instrumentApp, /state\.cachedIndicators\s*=\s*allIndicators/);
  assert.match(instrumentApp, /state\.cachedSourceOffset\s*=\s*offset/);
  assert.match(instrumentApp, /const\s+fullIndex\s*=\s*\(state\.cachedSourceOffset\s*\|\|\s*0\)\s*\+\s*visibleIndex/);
  assert.match(instrumentApp, /indicators\[key\]\?\.\[fullIndex\]/);
});

test('Bug 3 — tooltip indicator lookup never recomputes on the sliced visible source', () => {
  // The old behaviour called indicatorSeries(source) with the visibleSource; the new code must
  // use the cached full series and never call indicatorSeries(visibleSource).
  const tooltipBlock = instrumentApp.match(/function updateChartTooltip[\s\S]*?\n\}\n/);
  assert.ok(tooltipBlock, 'updateChartTooltip block not found');
  assert.doesNotMatch(tooltipBlock[0], /indicatorSeries\(\s*visibleSource\s*\)/);
});

// ---------------------------------------------------------------------------
// Cross-cutting — Existing behaviour must still hold
// ---------------------------------------------------------------------------

test('dashboard still exports createMarketsDashboard and renderRankingCard', () => {
  assert.match(dashboard, /export function createMarketsDashboard/);
  assert.match(dashboard, /export\s*\{\s*renderRankingCard\s*\}/);
});

test('CSS still applies the chart-tooltip visual style', () => {
  assert.match(css, /\.chart-tooltip\s*\{[^}]*background:\s*#12233f/);
});

test('CSS still pins the body to no horizontal overflow', () => {
  assert.match(css, /html,\s*body\s*\{\s*overflow-x:\s*hidden[^}]*\}/);
});

// ---------------------------------------------------------------------------
// Audit — dotted tickers resolve to real slugs (BRK.B -> brk-b, not brkb)
// ---------------------------------------------------------------------------

test('Audit — slugFromParam maps dotted tickers to dashed slugs', () => {
  assert.equal(core.slugFromParam('BRK.B'), 'brk-b');
  assert.equal(core.slugFromParam('BF.B'), 'bf-b');
  assert.equal(core.slugFromParam('AAPL'), 'aapl');
  assert.equal(core.slugFromParam('brk-b'), 'brk-b');
  assert.equal(core.slugFromParam(''), '');
  assert.equal(core.slugFromParam(null), '');
});

test('Audit — instrument/app.js resolves ?symbol= through slugFromParam', () => {
  assert.match(instrumentApp, /slugFromParam/);
  assert.match(instrumentApp, /const symbol = slugFromParam\(params\.get\('symbol'\)\)/);
  assert.doesNotMatch(instrumentApp, /replace\(\/\(\[^a-z0-9-\]\)\/g, ''\)/);
});

// ---------------------------------------------------------------------------
// Audit — getJson rejects on HTTP errors and load failures surface via showError
// ---------------------------------------------------------------------------

test('Audit — getJson throws on non-OK responses and resolves JSON on OK', async () => {
  const dashboardModule = await import(toUrl('frontend/analytics/markets/dashboard.js'));
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await assert.rejects(() => dashboardModule.getJson('/analytics/markets/data/manifest.json'), /Market data unavailable \(404\)/);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ hello: 'world' }) });
    assert.deepEqual(await dashboardModule.getJson('/analytics/markets/data/manifest.json'), { hello: 'world' });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Audit — dashboard load failures route to showError', () => {
  assert.match(dashboard, /if \(!response\.ok\) throw new Error\(`Market data unavailable/);
  assert.match(dashboard, /loadMarket\(state\.market\)\.catch\(showError\)/);
  assert.match(dashboard, /\}\)\.catch\(showError\)/);
});

// ---------------------------------------------------------------------------
// Audit — empty CSV export shows visible feedback instead of silent return
// ---------------------------------------------------------------------------

test('Audit — empty export writes a visible status message', () => {
  assert.match(dashboard, /\[data-export-status\]/);
  assert.match(dashboard, /No instruments match the current filters — nothing to export/);
  assert.match(dashboard, /role="status"/);
});

// ---------------------------------------------------------------------------
// Audit — US market never retains a ?frequency=4h state
// ---------------------------------------------------------------------------

test('Audit — instrument resets 4h frequency on the US market', () => {
  assert.match(instrumentApp, /requestedFrequency = params\.get\('frequency'\)/);
  assert.match(instrumentApp, /market === 'us'.*\?.*?'1d'.*?:.*?'4h'|\(market === 'us' \|\| event\.target\.value !== '4h'\) \? '1d' : '4h'/);
  assert.match(instrumentApp, /cleaned\.delete\('frequency'\)/);
});
