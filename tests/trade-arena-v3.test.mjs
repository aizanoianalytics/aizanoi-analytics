// Trade Arena v3: long/short costs, advice mode, live tails, Borsa Istanbul and the basket advisor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { prepareMarket } from '../frontend/arcade/trade-arena/engine/market.js';
import { runRace, DEFAULT_RULES, advicePortfolio, benchmarks, noiseDraw } from '../frontend/arcade/trade-arena/engine/sim.js';
import { UNIVERSE } from '../frontend/arcade/trade-arena/engine/universe.js';
import { appendTail, tailKey, liveEnd, loadLive, liveLoader } from '../frontend/arcade/trade-arena/ui/live.js';
import { diffBaskets } from '../frontend/arcade/trade-arena/ui/sim-client.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const root = 'frontend/arcade/trade-arena/';
const DAY = 86400000;

test('Flint emits a short target when a bearish regime selects a candidate', () => {
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(read(root + 'bots/ai/flint-40b.js'), context);
  const bot = context.module.exports;
  bot.init({ rules: { allowShort: true, maxGross: 1.5 }, periodsPerYear: 252 });
  const answer = bot.onBar({ step: 0, steps: 100, market: { ewRet20: -0.03 }, context: {}, portfolio: { positions: {} },
    assets: { A: { tradable: true, f: { ret60: 0.1, distSma200: 0.1, distSma50: -0.1 } } } });
  assert.ok(answer?.targets?.A < 0, 'bearish short decision must not silently become null');
});

// Synthetic two-asset market: A rises 1 % a day, B falls 1 % a day.
function synthetic(days = 120) {
  const t0 = Date.parse('2024-01-01');
  const mk = (sym, g) => {
    const cols = { t: [], o: [], h: [], l: [], c: [], v: [] };
    let p = 100;
    for (let i = 0; i < days + 300; i++) { const o = p; p *= g; cols.t.push(t0 + i * DAY); cols.o.push(o); cols.h.push(Math.max(o, p)); cols.l.push(Math.min(o, p)); cols.c.push(p); cols.v.push(1e6); }
    return { symbol: sym, name: sym, market: 'crypto', sector: 'Crypto', cols };
  };
  const series = [mk('A', 1.01), mk('B', 0.99)];
  return prepareMarket(series, { market: 'crypto', tf: '1d', start: t0 + 300 * DAY, end: t0 + (300 + days - 1) * DAY, seed: 1 }, {}, {});
}
const host = onBar => ({ async init() { return { ok: true }; }, async onBar(state) { return { ok: true, value: onBar(state) }; }, close() {} });

test('long-only cash races pay no carry; shorts pay borrow and profit from a falling asset', async () => {
  const m = synthetic();
  const res = await runRace(m, [
    { id: 'long', name: 'long', host: host(() => ({ targets: { A: 1 } })) },
    { id: 'short', name: 'short', host: host(() => ({ targets: { B: -0.5 } })) },
  ], { allowShort: true, maxGross: 1 });
  const [long, short] = res.stats;
  assert.equal(long.carry, 0, 'a long cash book borrows nothing');
  assert.ok(short.carry > 0, 'shorts accrue a borrow fee');
  assert.ok(short.final > DEFAULT_RULES.cash, 'shorting a falling asset makes money');
  assert.ok(res.accounts[1].trades.some(t => t.kind === 'short'));
  // In a long-only race the same negative target is ignored.
  const lo = await runRace(synthetic(), [{ id: 's', name: 's', host: host(() => ({ targets: { B: -0.5 } })) }], {});
  assert.equal(lo.stats[0].trades, 0);
});

test('a runaway short is closed by a margin call instead of going below zero', async () => {
  const m = synthetic(200);
  const res = await runRace(m, [{ id: 'squeeze', name: 'squeeze', host: host(s => (s.step === 0 ? { targets: { A: -1 } } : null)) }], { allowShort: true, maxGross: 1 });
  const acc = res.accounts[0];
  assert.ok(acc.marginCalls >= 1, 'margin call fired');
  assert.ok(acc.trades.some(t => t.kind === 'liquidated'));
  assert.ok(acc.equity > 0);
});

test('advice mode shows the viewer basket on the last bar and falls back to the bot basket on null', async () => {
  const m = synthetic(60);
  const seen = [];
  const res = await runRace(m, [
    { id: 'react', name: 'react', host: host(s => { if (s.step === s.steps - 1) { seen.push(s.portfolio); return { targets: { A: 0.6 }, note: 'more A' }; } return s.step === 0 ? { targets: { B: 0.3 } } : null; }) },
    { id: 'quiet', name: 'quiet', host: host(s => (s.step === 0 ? { targets: { A: 0.4 } } : null)) },
  ], {}, null, { advice: { equity: 50000, positions: { B: 0.5, A: { weight: 0.2, avgPrice: 1 } } } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].equity, 50000);
  assert.equal(seen[0].positions.B.side, 'long');
  assert.ok(Math.abs(seen[0].positions.B.weight - 0.5) < 1e-9);
  assert.ok(seen[0].positions.A.pnlPct > 0, 'entry price is honoured');
  assert.deepEqual(res.accounts[0].advice, { targets: { A: 0.6 }, note: 'more A', source: 'decision' });
  assert.equal(res.accounts[1].advice.source, 'own');
  assert.ok(res.accounts[1].advice.targets.A > 0.3, 'its own (drifted) A position');
  const p = advicePortfolio({ positions: { A: -0.25 } }, { assets: { A: { bar: { c: 10 } } } });
  assert.equal(p.positions.A.side, 'short'); assert.equal(p.cash, 125000);
});

test('diffBaskets turns two books into close / trim / add / open / flip / keep actions', () => {
  const rows = Object.fromEntries(diffBaskets({ A: 0.3, B: 0.2, C: 0.1, D: -0.1, E: 0.2 }, { A: 0.3, B: 0.1, C: 0.25, E: -0.1, F: 0.15 }).map(r => [r.s, r.action]));
  assert.deepEqual(rows, { A: 'keep', B: 'trim', C: 'add', D: 'cover', E: 'flip', F: 'open' });
});

test('live tails append only newer bars and never touch dividends, splits or the archive', () => {
  const base = { t: [1, 2, 3], c: [10, 11, 12], v: [5, 5, 5], dividends: [[1, 0.1], [2, 0.1], [3, 0.1]] };
  const out = appendTail(base, { t: [2, 3, 4, 5], c: [0, 0, 13, 14], v: [9, 9, 9, 9] });
  assert.deepEqual(out.t, [1, 2, 3, 4, 5]); assert.deepEqual(out.c, [10, 11, 12, 13, 14]);
  assert.equal(out.dividends, base.dividends); assert.deepEqual(base.t, [1, 2, 3]); assert.equal(out.liveBars, 2);
  const missing = appendTail({ t: [1], c: [1], n: [7] }, { t: [2], c: [2] });
  assert.ok(Number.isNaN(missing.n[1]), 'a column absent from the tail is NaN, not a guess');
  assert.equal(tailKey('data/raw/crypto/1d/BTC.json'), 'crypto/1d/BTC');
  assert.equal(tailKey('bots/roster.json'), null);
  assert.equal(liveEnd(null, '2026-10-30'), '2026-10-30');
  assert.equal(liveEnd({ end: { crypto: '2026-11-02', stocks: '2026-10-31' } }, '2026-10-30'), '2026-11-02');
  assert.equal(liveEnd({ end: { crypto: '2026-11-02', stocks: '2026-11-02', bist: '2026-11-03' } }, '2026-10-30'), '2026-11-03', 'BIST closes before the US and must not lose its latest session');
  assert.equal(liveEnd({ end: { crypto: 'garbage' } }, '2026-10-30'), '2026-10-30');
});

test('partial live manifests fall back instead of mixing fresh and stale series', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: 1, end: { crypto: '2026-11-02' }, series: {}, failed: [{ series: 'crypto/1d/BTC' }] }) });
    assert.equal(await loadLive('https://example.com/'), null);
  } finally { globalThis.fetch = originalFetch; }
  const manifest = { series: { 'crypto/1d/A': { bars: 1, last: 2 }, 'crypto/1d/B': { bars: 0, last: 1 } } };
  const loader = liveLoader('https://example.com/', manifest, async () => ({ t: [1], c: [10] }));
  await assert.rejects(loader('data/raw/crypto/1d/B.json'), /live .*coverage/);
  await assert.rejects(loader('data/raw/crypto/1d/C.json'), /live .*missing/);
});

test('funding tails use the same injected live loader as price and context bars', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ t: [2], rate: [0.02] }) });
    const loader = liveLoader('https://example.com/', { series: { 'crypto/funding/BTC': { bars: 1, last: 2 } } }, async () => ({ t: [1], rate: [0.01] }));
    assert.deepEqual((await loader('data/raw/crypto/funding/BTC.json')).rate, [0.01, 0.02]);
    const worker = read(root + 'ui/race-worker.js');
    assert.match(worker, /async function loadUniverse\(market, tf, progress, get\)/);
    assert.match(worker, /const f = await get\(url\)/);
  } finally { globalThis.fetch = originalFetch; }
});

test('the race worker uses live tails all-or-nothing and the server side is documented', () => {
  const worker = read(root + 'ui/race-worker.js');
  assert.match(worker, /liveLoader\(BASE, live, get\)/);
  assert.match(worker, /using the archive/);
  const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
  assert.match(nginx, /location \^~ \/arcade\/trade-arena\/live\/ \{\s*alias \/var\/lib\/aizanoi-trade-arena\/live\/;/);
  for (const unit of ['service', 'timer']) assert.ok(existsSync(new URL(`../infra/systemd/aizanoi-trade-arena-live.${unit}.example`, import.meta.url)));
  assert.match(read('infra/systemd/aizanoi-trade-arena-live.service.example'), /scripts\/trade-arena\/update_live\.py/);
  const py = read('scripts/trade-arena/update_live.py');
  assert.match(py, /data-api\.binance\.vision/);
  assert.match(py, /def session_closed/);
  assert.doesNotMatch(py, /api[_-]?key|token|password/i, 'public endpoints only');
  assert.match(read('.gitignore'), /\/frontend\/arcade\/trade-arena\/live\/raw\//);
  const placeholder = JSON.parse(read(root + 'live/manifest.json'));
  assert.deepEqual([placeholder.version, placeholder.series, liveEnd(placeholder, '2026-10-30')], [1, {}, '2026-10-30'], 'the shipped placeholder means archive only');
});

test('Borsa Istanbul is a separate TRY market benchmarked against BIST 100', async () => {
  assert.equal(UNIVERSE.bist.length, 30);
  for (const a of UNIVERSE.bist) { assert.equal(a.exchange, 'BIST'); assert.equal(a.currency, 'TRY'); assert.match(a.yahoo, /\.IS$/); assert.ok(existsSync(new URL(`../${root}data/raw/bist/1d/${a.ticker}.json`, import.meta.url)), a.ticker); }
  assert.ok(UNIVERSE.context.some(a => a.ticker === 'XU100'));
  const catalog = JSON.parse(read(root + 'data/catalog.json'));
  assert.equal(catalog.bist.length, 30);
  const series = UNIVERSE.bist.slice(0, 6).map(a => ({ symbol: a.ticker, name: a.name, market: 'stocks', exchange: 'BIST', currency: 'TRY', sector: a.sector, cols: JSON.parse(read(`${root}data/raw/bist/1d/${a.ticker}.json`)) }));
  const ctx = { XU100: JSON.parse(read(root + 'data/raw/context/1d/XU100.json')), SPY: JSON.parse(read(root + 'data/raw/context/1d/SPY.json')) };
  const m = prepareMarket(series, { market: 'bist', tf: '1d', start: Date.parse('2026-01-01'), end: Date.parse('2026-06-30'), seed: 7 }, ctx, {});
  assert.ok(m.assets.every(a => a.exchange === 'BIST' && a.currency === 'TRY'));
  const bench = benchmarks(m);
  assert.ok(bench['BIST 100 hold'] && !bench['S&P 500 hold']);
  const worker = read(root + 'ui/race-worker.js');
  assert.match(worker, /market === 'bist'\) for \(const a of UNIVERSE\.bist\)/);
  assert.match(read(root + 'ui/advisor.js'), /cannot share a basket with USD/);
});

test('the basket advisor is wired, private and labelled as not investment advice', async () => {
  const app = read(root + 'ui/app.js'), page = read(root + 'ui/advisor.js'), index = read(root + 'index.html');
  assert.match(index, /href="#\/advisor" data-r="advisor"/);
  assert.match(app, /r === 'advisor'\) renderAdvisor/);
  assert.match(app, /releaseAdvisor\(\)/);
  assert.match(page, /Not investment advice/);
  assert.match(page, /stays in this browser/);
  assert.doesNotMatch(page, /fetch\(|style=/);
  globalThis.localStorage ??= { getItem: () => null, setItem() {} };
  const { parseBasket } = await import('../frontend/arcade/trade-arena/ui/advisor.js');
  const { rows, bad } = parseBasket('BTC 30\nnvda 15 @ 180\nTSLA short 10;DOGE -5\nXYZ 4\nhello', new Set(['BTC', 'NVDA', 'TSLA', 'DOGE']));
  assert.deepEqual(rows, [{ s: 'BTC', w: 30 }, { s: 'NVDA', w: 15, px: 180 }, { s: 'TSLA', w: -10 }, { s: 'DOGE', w: -5 }]);
  assert.deepEqual(bad, ['XYZ 4', 'hello']);
});

test('market noise is seeded, shared by every bot, off by default and changes results between seeds', async () => {
  const universe = (await import('../frontend/arcade/trade-arena/engine/universe.js')).UNIVERSE;
  const series = universe.crypto.slice(0, 8).map(a => ({ symbol: a.ticker, name: a.name, market: 'crypto', sector: 'Crypto', cols: JSON.parse(read(`${root}data/raw/crypto/1d/${a.ticker}.json`)) }));
  const market = () => prepareMarket(series, { market: 'crypto', tf: '1d', start: Date.parse('2025-01-01'), end: Date.parse('2025-06-30'), seed: 7 }, {}, {});
  // Weekly rotation into the two best 20-bar performers: trades often enough for noise to matter.
  const rotator = () => host(s => (s.step % 5 ? null : { targets: Object.fromEntries(Object.entries(s.assets).filter(([, a]) => Number.isFinite(a.f.ret20)).sort((x, y) => y[1].f.ret20 - x[1].f.ret20).slice(0, 2).map(([k]) => [k, 0.45])) }));
  const run = async rules => (await runRace(market(), [{ id: 'r', name: 'r', host: rotator() }], rules)).stats[0].final;
  const quiet = await run({});
  assert.equal(await run({ noise: 0, noiseSeed: 99 }), quiet, 'noise 0 ignores the seed');
  const a = await run({ noise: 1, noiseSeed: 11 }), b = await run({ noise: 1, noiseSeed: 11 }), c = await run({ noise: 1, noiseSeed: 12 });
  assert.equal(a, b, 'same seed, same race');
  assert.notEqual(a, c, 'another seed, another outcome');
  assert.notEqual(a, quiet);
  assert.equal(DEFAULT_RULES.noise, 0);
  const d = noiseDraw(5, 10, 'BTC', 0);
  assert.ok(d >= 0 && d < 1 && d === noiseDraw(5, 10, 'BTC', 0) && d !== noiseDraw(5, 11, 'BTC', 0));
});
