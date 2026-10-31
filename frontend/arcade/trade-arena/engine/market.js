// Builds the shared market for one race: aligned timeline, per-asset features, cross-sectional ranks,
// benchmark beta/correlation, crypto funding and daily macro context. Pure ES module (browser + Node).
import { computeFeatures, betaCorr, FEATURE_NAMES } from './features.js';

const ok = Number.isFinite;
export const DAY = 86400000;
export const TF_MS = { '1d': DAY, '4h': 4 * 3600000, '1h': 3600000 };

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RANKED = ['ret5', 'ret20', 'ret60', 'ret120', 'rsi14', 'vol20', 'relVolume', 'distSma50', 'sharpe60', 'dollarVolume'];
export const EXTRA_FEATURES = {
  beta60: 'Beta of returns vs the market benchmark (BTC for crypto, SPY for stocks), 60 bars',
  corr60: 'Correlation of returns vs the benchmark, 60 bars',
  fundingRate: 'Crypto: latest perpetual funding rate per 8h (NaN when no perpetual)',
  funding7d: 'Crypto: average funding rate over the last 7 days',
  ...Object.fromEntries(RANKED.map(k => [`rank_${k}`, `Cross-sectional percentile of ${k} among assets listed now (0 lowest .. 1 highest)`])),
};
export const MARKET_FIELDS = {
  breadth50: 'Share of listed assets closing above their SMA50',
  breadth200: 'Share of listed assets closing above their SMA200',
  advancers: 'Share of listed assets with a positive 1-bar return',
  ewRet1: 'Equal-weight average 1-bar return of listed assets',
  ewRet20: 'Equal-weight average 20-bar return',
  dispersion20: 'Cross-sectional standard deviation of 20-bar returns',
  avgRsi14: 'Average RSI14 across assets',
  listed: 'Number of assets listed now',
};
export const CONTEXT_FIELDS = {
  spyRet1: 'S&P 500 ETF last completed daily return', spyRet20: 'S&P 500 ETF 20-day return', spyDistSma200: 'SPY close / SMA200 − 1',
  qqqRet20: 'Nasdaq-100 ETF 20-day return', vix: 'VIX level', vixChg5: 'VIX 5-day change (points)',
  tnx: 'US 10Y yield in %', tnxChg20: '10Y yield 20-day change (points)', dxyRet20: 'US Dollar Index 20-day return',
  gldRet20: 'Gold ETF 20-day return', tltRet20: '20Y+ Treasury ETF 20-day return',
};

function lastIndexAtOrBefore(t, x) { // binary search: last i with t[i] <= x
  let lo = 0, hi = t.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (t[m] <= x) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

function sliceCols(cols, from, to) {
  const out = {};
  for (const [k, v] of Object.entries(cols)) out[k] = Array.isArray(v) || ArrayBuffer.isView(v) ? (v.length === cols.t.length ? Array.from(v.slice(from, to)) : v) : v;
  return out;
}

/**
 * series: [{ symbol, name, market: 'crypto'|'stocks', sector, cols }]  (cols = raw columnar bars for cfg.tf)
 * context: { SPY: cols1d, QQQ, VIX, TNX, DXY, GLD, TLT } (daily, optional)
 * funding: { SYMBOL: { t, rate } } (optional)
 * cfg: { tf, start, end, blind, seed, warmup }
 */
export function prepareMarket(series, cfg, context = {}, funding = {}) {
  if (cfg.market !== 'crypto' && cfg.tf !== '1d') throw new Error('Stock intraday races are unavailable: session-close and terminal-quote timing has not been audited. Use daily bars.');
  const { tf, start, end, blind = false, seed = 1, warmup = 250 } = cfg;
  // Stock hourly bars open at :30 and crypto at :00, so intraday mixed timelines would interleave two clocks.
  if (tf !== '1d' && series.some(s => s.market === 'crypto') && series.some(s => s.market === 'stocks')) throw new Error('Mixed crypto + stock races are daily (1d) only');
  const rand = rng(seed ^ 0x5eed);
  const step = TF_MS[tf];
  // Assets need at least one bar inside the window.
  const live = series.filter(s => s.cols.t.length && s.cols.t[s.cols.t.length - 1] >= start && s.cols.t[0] <= end);
  // Blind aliases: shuffled order so the alias does not reveal alphabetical identity.
  const order = live.map((s, i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const alias = new Map();
  let cn = 0, sn = 0;
  for (const i of order) { const s = live[i]; alias.set(s.symbol, s.market === 'crypto' ? `C${String(++cn).padStart(2, '0')}` : `S${String(++sn).padStart(2, '0')}`); }

  const assets = [];
  for (const s of live) {
    // Keep warm-up history: features need up to 250 bars (1-year windows need a year of bars).
    const first = Math.max(0, lastIndexAtOrBefore(s.cols.t, start - 1) - Math.max(warmup, 400) + 1);
    const last = lastIndexAtOrBefore(s.cols.t, end);
    let cols = sliceCols(s.cols, first, last + 1);
    let scale = 1, vscale = 1;
    if (blind) {
      // Rebase so the last pre-race close is 100 (or the first bar if listed mid-race); volumes to a 1M median.
      const k = Math.max(0, lastIndexAtOrBefore(cols.t, start - 1));
      scale = 100 / cols.c[k];
      // Volume scale from pre-race bars only (the race window must not leak into it); first bar if listed mid-race.
      const vs = cols.v.slice(0, k + 1).sort((a, b) => a - b); vscale = 1e6 / (vs[vs.length >> 1] || 1);
      cols = { ...cols };
      for (const key of ['o', 'h', 'l', 'c']) cols[key] = cols[key].map(x => x * scale);
      cols.v = cols.v.map(x => x * vscale);
      if (cols.tb) cols.tb = cols.tb.map(x => x * vscale);
      if (cols.qv) cols.qv = cols.qv.map(x => x * scale * vscale);
      if (cols.n) cols.n = cols.n.slice();
    }
    const F = computeFeatures(cols, tf, s.market);
    const idx = new Map(); cols.t.forEach((t, i) => idx.set(t, i));
    assets.push({ symbol: s.symbol, id: blind ? alias.get(s.symbol) : s.symbol, name: s.name, market: s.market, sector: s.sector,
      cols, F, idx, scale, firstT: s.cols.t[0], funding: funding[s.symbol] });
  }

  // Benchmarks for beta/correlation.
  const bench = { crypto: assets.find(a => a.symbol === 'BTC'), stocks: null };
  if (context.SPY && tf === '1d') bench.stocks = { cols: context.SPY };
  else bench.stocks = assets.find(a => a.symbol === 'MSFT') || null; // intraday: no SPY hourly; use a mega-cap proxy
  for (const a of assets) {
    const b = bench[a.market];
    if (b && b !== a) { const bc = betaCorr(a.cols.t, a.F.ret1, b.cols.t, b.cols.c); a.F.beta60 = bc.beta; a.F.corr60 = bc.corr; }
    else { a.F.beta60 = new Float64Array(a.cols.t.length).fill(a === b ? 1 : NaN); a.F.corr60 = new Float64Array(a.cols.t.length).fill(a === b ? 1 : NaN); }
  }

  // Timeline: every bar timestamp inside the window from any asset.
  const ts = new Set();
  for (const a of assets) for (const t of a.cols.t) if (t >= start && t <= end) ts.add(t);
  const timeline = [...ts].sort((x, y) => x - y);

  // Context: last daily bar that has fully closed before the decision moment (bar close).
  const ctx = {};
  for (const [k, cols] of Object.entries(context)) {
    if (!cols?.t?.length) continue;
    const F = computeFeatures(cols, '1d', 'stocks');
    ctx[k] = { cols, F };
  }
  return { cfg: { ...cfg, step }, assets, timeline, ctx, aliases: blind ? Object.fromEntries(assets.map(a => [a.id, a.symbol])) : null };
}

// Close time of the bar opening at t (stocks hourly bars at :30 last 60 min, the final one 30 min).
export const barClose = (t, tf) => t + TF_MS[tf];

/** Snapshot of everything a bot may see at the close of timeline[k]. Shared by all bots. */
export function snapshot(m, k) {
  const T = m.timeline[k], tf = m.cfg.tf;
  const assets = {}, rows = [];
  for (const a of m.assets) {
    if (a.firstT > T) continue;
    const i = lastIndexAtOrBefore(a.cols.t, T);
    if (i < 0) continue;
    const bar = { t: m.cfg.blind ? null : a.cols.t[i], o: a.cols.o[i], h: a.cols.h[i], l: a.cols.l[i], c: a.cols.c[i], v: a.cols.v[i] };
    const f = {};
    for (const name of FEATURE_NAMES) f[name] = a.F[name][i];
    f.beta60 = a.F.beta60[i]; f.corr60 = a.F.corr60[i];
    if (a.market === 'crypto') {
      const fu = a.funding, j = fu ? lastIndexAtOrBefore(fu.t, barClose(T, tf)) : -1;
      f.fundingRate = j >= 0 ? fu.rate[j] : NaN;
      if (j >= 0) { let s = 0, n = 0; for (let q = j; q >= 0 && fu.t[q] > fu.t[j] - 7 * DAY; q--) { s += fu.rate[q]; n++; } f.funding7d = s / n; }
      else f.funding7d = NaN;
    } else { f.fundingRate = NaN; f.funding7d = NaN; }
    const fresh = a.cols.t[i] === T;
    assets[a.id] = { tradable: fresh, bar, f };
    rows.push(f);
  }
  // Cross-sectional ranks and breadth.
  for (const key of RANKED) {
    const vals = rows.map(f => f[key]).filter(ok).sort((x, y) => x - y);
    for (const f of rows) {
      const v = f[key];
      if (!ok(v) || vals.length < 2) { f['rank_' + key] = NaN; continue; }
      let lo = 0, hi = vals.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (vals[mid] < v) lo = mid + 1; else hi = mid; }
      f['rank_' + key] = lo / (vals.length - 1);
    }
  }
  const avg = arr => { const v = arr.filter(ok); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
  const r20 = rows.map(f => f.ret20).filter(ok), mr = avg(r20);
  const market = {
    breadth50: avg(rows.map(f => (ok(f.distSma50) ? +(f.distSma50 > 0) : NaN))),
    breadth200: avg(rows.map(f => (ok(f.distSma200) ? +(f.distSma200 > 0) : NaN))),
    advancers: avg(rows.map(f => (ok(f.ret1) ? +(f.ret1 > 0) : NaN))),
    ewRet1: avg(rows.map(f => f.ret1)), ewRet20: mr,
    dispersion20: r20.length > 1 ? Math.sqrt(r20.reduce((s, x) => s + (x - mr) ** 2, 0) / (r20.length - 1)) : NaN,
    avgRsi14: avg(rows.map(f => f.rsi14)), listed: rows.length,
  };
  // Daily macro context: only daily bars whose session ended before this bar closed.
  const context = {};
  const closeT = barClose(T, tf);
  const at = (key, name) => { const c = m.ctx[key]; if (!c) return NaN; const j = lastIndexAtOrBefore(c.cols.t, closeT - DAY); return j >= 0 ? (name === 'close' ? c.cols.c[j] : c.F[name][j]) : NaN; };
  const chg = (key, back) => { const c = m.ctx[key]; if (!c) return NaN; const j = lastIndexAtOrBefore(c.cols.t, closeT - DAY); return j >= back ? c.cols.c[j] - c.cols.c[j - back] : NaN; };
  if (Object.keys(m.ctx).length) {
    Object.assign(context, {
      spyRet1: at('SPY', 'ret1'), spyRet20: at('SPY', 'ret20'), spyDistSma200: at('SPY', 'distSma200'), qqqRet20: at('QQQ', 'ret20'),
      vix: at('VIX', 'close'), vixChg5: chg('VIX', 5), tnx: at('TNX', 'close'), tnxChg20: chg('TNX', 20), // Yahoo ^TNX is quoted in percent
      dxyRet20: at('DXY', 'ret20'), gldRet20: at('GLD', 'ret20'), tltRet20: at('TLT', 'ret20'),
    });
  }
  const d = new Date(T);
  return {
    step: k, steps: m.timeline.length,
    time: m.cfg.blind ? null : T,
    date: m.cfg.blind ? null : d.toISOString().slice(0, tf === '1d' ? 10 : 16).replace('T', ' '),
    dow: d.getUTCDay(), hour: tf === '1d' ? null : d.getUTCHours(),
    assets, market, context,
  };
}

/** Warm-up OHLCV history (bars strictly before the race start) for bot init. */
export function history(m, bars = 250) {
  const out = {};
  for (const a of m.assets) {
    const i = lastIndexAtOrBefore(a.cols.t, m.cfg.start - 1);
    if (i < 0) continue;
    const from = Math.max(0, i - bars + 1), pick = k => a.cols[k].slice(from, i + 1);
    out[a.id] = { t: m.cfg.blind ? null : pick('t'), o: pick('o'), h: pick('h'), l: pick('l'), c: pick('c'), v: pick('v') };
  }
  return out;
}
