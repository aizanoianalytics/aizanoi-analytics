// Portfolio simulation and race loop. Orders are decided on bar close and filled at the next bar's open.
import { snapshot, history, TF_MS, EXTRA_FEATURES, MARKET_FIELDS, CONTEXT_FIELDS } from './market.js';
import { FEATURE_GROUPS, periodsPerYear } from './features.js';

const ok = Number.isFinite;

export const DEFAULT_RULES = {
  cash: 100000,
  feeBps: { crypto: 10, stocks: 1 },      // commission per side
  slippageBps: { crypto: 5, stocks: 2 },  // adverse fill vs next open
  maxGross: 1,        // sum of |weights| allowed (1 = cash account, 2 = 2x margin)
  allowShort: false,
  minTradeValue: 25,  // smaller rebalances are skipped
  // Carrying costs, annual rates charged pro rata to elapsed time at every close. They only touch accounts that
  // hold shorts or borrow cash, so long-only cash races are unchanged.
  borrowBps: { crypto: 800, stocks: 300 }, // stock-loan / perpetual-funding proxy on the market value of short positions
  marginBps: 600,     // interest on a negative cash balance (leverage above 1x)
  // Market noise (0 = off, 1 = full): the fill price moves inside the bar's range, slippage varies per trade and an
  // order sometimes misses a bar. Draws depend only on (noiseSeed, bar, asset), so every bot meets the same market.
  noise: 0,
  noiseSeed: 1,
  initMs: 5000,
  barMs: 250,
};

export function createAccount(bot, rules) {
  return { id: bot.id, name: bot.name, cash: rules.cash, qty: {}, cost: {}, pending: null, equity: rules.cash,
    curve: [], trades: [], notes: [], fees: 0, turnover: 0, errors: 0, timeouts: 0, retired: null, peak: rules.cash,
    maxDD: 0, realized: [], lastTargets: null, carry: 0, lastT: null };
}

function priceMap(m, k, field) { // latest price per alias at timeline[k] using `field` for fresh bars, close otherwise
  const T = m.timeline[k], out = {}, fresh = {};
  for (const a of m.assets) {
    const i = a.idx.get(T);
    if (i !== undefined) { out[a.id] = a.cols[field][i]; fresh[a.id] = true; continue; }
    // last close before T
    let lo = 0, hi = a.cols.t.length - 1, j = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (a.cols.t[mid] < T) { j = mid; lo = mid + 1; } else hi = mid - 1; }
    if (j >= 0) out[a.id] = a.cols.c[j];
  }
  return { px: out, fresh };
}

function equityAt(acc, px) {
  let e = acc.cash;
  for (const [s, q] of Object.entries(acc.qty)) if (q && ok(px[s])) e += q * px[s];
  return e;
}

/** Clean a bot answer into { targets, note } or null (= hold). */
export function normaliseDecision(answer, listed, rules) {
  if (answer == null) return null;
  const raw = typeof answer === 'object' && answer.targets !== undefined ? answer.targets : answer;
  const note = typeof answer?.note === 'string' ? answer.note.slice(0, 140) : null;
  if (raw == null) return note ? { targets: null, note } : null;
  if (typeof raw !== 'object') throw new Error('targets must be an object of symbol -> weight');
  const targets = {};
  let gross = 0;
  for (const [sym, w0] of Object.entries(raw)) {
    if (!listed.has(sym)) continue;
    let w = Number(w0);
    if (!ok(w) || w === 0) continue;
    if (w < 0 && !rules.allowShort) continue;
    targets[sym] = w; gross += Math.abs(w);
  }
  if (gross > rules.maxGross) for (const s of Object.keys(targets)) targets[s] *= rules.maxGross / gross;
  return { targets, note };
}

/** Fill pending targets at the open of timeline[k] for assets with a fresh bar. */
/** Deterministic uniform draw in [0,1) for (seed, bar, asset, slot): shared by every bot in the race. */
export function noiseDraw(seed, k, sym, slot) {
  let h = (seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(slot + 7, 0x85ebca6b);
  for (let i = 0; i < sym.length; i++) h = Math.imul(h ^ sym.charCodeAt(i), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Noisy fills: open moved within [low, high] by up to 25 % of the range, 5 % of (bar, asset) pairs skipped. */
function noisyOpen(m, k, rules, px, fresh) {
  const n = rules.noise, T = m.timeline[k];
  for (const a of m.assets) {
    if (!fresh[a.id]) continue;
    if (noiseDraw(rules.noiseSeed, k, a.id, 2) < 0.05 * n) { fresh[a.id] = false; continue; } // no fill this bar
    const i = a.idx.get(T), lo = a.cols.l[i], hi = a.cols.h[i];
    const shift = (noiseDraw(rules.noiseSeed, k, a.id, 0) * 2 - 1) * 0.25 * n * (hi - lo);
    px[a.id] = Math.min(hi, Math.max(lo, px[a.id] + shift));
  }
}

function execute(acc, m, k, rules, market) {
  if (!acc.pending) return;
  const { px, fresh } = priceMap(m, k, 'o');
  if (rules.noise > 0) noisyOpen(m, k, rules, px, fresh);
  const E = equityAt(acc, px);
  if (E <= 0) return;
  const want = acc.pending;
  const syms = new Set([...Object.keys(acc.qty).filter(s => acc.qty[s]), ...Object.keys(want)]);
  const orders = [];
  let waiting = false;
  for (const s of syms) {
    if (acc.filled?.has(s)) continue; // already rebalanced for this decision; only closed markets still wait
    if (!fresh[s]) { if ((want[s] || 0) !== 0 || acc.qty[s]) waiting = true; continue; }
    const target = (want[s] || 0) * E / px[s];
    const dq = target - (acc.qty[s] || 0);
    if (Math.abs(dq * px[s]) < rules.minTradeValue && target !== 0) continue;
    if (dq !== 0) orders.push([s, dq]);
  }
  orders.sort((a, b) => a[1] - b[1]); // sells first
  for (const [s, dq0] of orders) {
    const mk = market(s), fee = rules.feeBps[mk] / 1e4;
    // With noise, slippage varies between 0.5× and 2.5× of the nominal rate (same draw for every bot).
    const slip = rules.slippageBps[mk] / 1e4 * (rules.noise > 0 ? 1 + rules.noise * (noiseDraw(rules.noiseSeed, k, s, 1) * 2 - 0.5) : 1);
    const price = px[s] * (dq0 > 0 ? 1 + slip : 1 - slip);
    let dq = dq0;
    if (dq > 0 && rules.maxGross <= 1) { // 1× gross: never borrow (short proceeds count as cash)
      const affordable = acc.cash / (price * (1 + fee));
      if (dq > affordable) dq = Math.max(0, affordable);
      if (dq * price < rules.minTradeValue) continue;
    }
    const value = Math.abs(dq) * price, cost = value * fee;
    const before = acc.qty[s] || 0, after = before + dq;
    // Realised P&L for the closed part of a position (FIFO-free average cost).
    if (before !== 0 && Math.sign(dq) !== Math.sign(before)) {
      const closed = Math.min(Math.abs(dq), Math.abs(before)) * Math.sign(before);
      const pnl = closed * (price - acc.cost[s]);
      acc.realized.push(pnl - cost);
    }
    if (after === 0 || Math.abs(after * price) < 1e-6) { delete acc.qty[s]; delete acc.cost[s]; }
    else {
      // Cost basis includes the entry commission, so realised P&L and win rate are net of both fees.
      const basis = price * (1 + Math.sign(dq) * fee);
      if (before === 0 || Math.sign(after) !== Math.sign(before)) acc.cost[s] = basis;
      else if (Math.abs(after) > Math.abs(before)) acc.cost[s] = (acc.cost[s] * before + basis * dq) / after;
      acc.qty[s] = after;
    }
    acc.cash -= dq * price + cost;
    acc.fees += cost; acc.turnover += value;
    const kind = before >= 0 && after >= 0 ? (dq > 0 ? (before ? 'add' : 'open') : (after ? 'reduce' : 'close'))
      : before <= 0 && after <= 0 ? (dq < 0 ? (before ? 'add' : 'short') : (after ? 'reduce' : 'cover'))
      : 'flip';
    acc.trades.push({ k, s, side: dq > 0 ? 'buy' : 'sell', kind, qty: dq, price, value, fee: cost });
  }
  for (const [s] of orders) (acc.filled ??= new Set()).add(s);
  for (const s of syms) if (fresh[s]) (acc.filled ??= new Set()).add(s);
  if (!waiting) { acc.pending = null; acc.filled = null; }
}

const YEAR_MS = 365.25 * 86400000;

/** Accrue short-borrow and margin interest for the time since the previous close. */
function carry(acc, m, k, rules, px, market) {
  const T = m.timeline[k], dt = acc.lastT == null ? 0 : (T - acc.lastT) / YEAR_MS;
  acc.lastT = T;
  if (!(dt > 0)) return;
  let c = 0;
  for (const [s, q] of Object.entries(acc.qty)) if (q < 0 && ok(px[s])) c += -q * px[s] * (rules.borrowBps?.[market(s)] ?? 0) / 1e4 * dt;
  if (acc.cash < -0.01) c += -acc.cash * (rules.marginBps ?? 0) / 1e4 * dt; // ignore float dust
  if (c > 0) { acc.cash -= c; acc.carry += c; }
}

function mark(acc, m, k, rules, market) {
  const { px } = priceMap(m, k, 'c');
  if (!acc.retired) carry(acc, m, k, rules, px, market);
  acc.equity = equityAt(acc, px);
  acc.peak = Math.max(acc.peak, acc.equity);
  acc.maxDD = Math.min(acc.maxDD, acc.equity / acc.peak - 1);
  let gross = 0, net = 0;
  const pos = {};
  for (const [s, q] of Object.entries(acc.qty)) {
    const value = q * px[s];
    gross += Math.abs(value); net += value;
    pos[s] = { qty: q, side: q > 0 ? 'long' : 'short', value, weight: acc.equity ? value / acc.equity : 0, avgPrice: acc.cost[s], pnlPct: q > 0 ? px[s] / acc.cost[s] - 1 : 1 - px[s] / acc.cost[s] };
  }
  acc.curve.push(acc.equity);
  acc.exposure = acc.equity > 0 ? gross / acc.equity : 0;
  acc.net = acc.equity > 0 ? net / acc.equity : 0;
  acc.positions = pos;
  if (acc.equity <= rules.cash * 0.01 && !acc.retired) { acc.retired = 'busted'; acc.pending = null; }
  // Margin call: positions are closed at this close when gross exposure runs far past the race limit (a short squeeze).
  else if (!acc.retired && rules.allowShort && acc.exposure > Math.max(1, rules.maxGross) * 2) {
    for (const [s, q] of Object.entries(acc.qty)) {
      const mk = market(s), price = px[s] * (q > 0 ? 1 - rules.slippageBps[mk] / 1e4 : 1 + rules.slippageBps[mk] / 1e4), value = Math.abs(q) * price, fee = value * rules.feeBps[mk] / 1e4;
      acc.realized.push(q * (price - acc.cost[s]) - fee);
      acc.cash += q * price - fee; acc.fees += fee; acc.turnover += value;
      acc.trades.push({ k, s, side: q > 0 ? 'sell' : 'buy', kind: 'liquidated', qty: -q, price, value, fee });
    }
    acc.qty = {}; acc.cost = {}; acc.pending = null; acc.positions = {}; acc.exposure = 0; acc.net = 0;
    acc.equity = acc.cash; acc.curve[acc.curve.length - 1] = acc.equity; acc.marginCalls = (acc.marginCalls || 0) + 1;
    acc.notes.push({ k, text: 'Margin call: all positions closed', system: true });
  }
  return pos;
}

export function describeApi() {
  return { features: { ...Object.fromEntries(Object.entries(FEATURE_GROUPS).map(([g, v]) => [g, v])), 'Cross-asset': EXTRA_FEATURES },
    market: MARKET_FIELDS, context: CONTEXT_FIELDS };
}

/**
 * Run a race. bots: [{ id, name, host }] where host = { init(info) → Promise<{ok,error,ms}>,
 *   onBar(state) → Promise<{ok, value, error, ms, timeout, fatal}>, close() }.
 * onStep(k, snap, accounts) is awaited after every bar (UI pacing / streaming).
 */
/** The viewer's basket as a bot-facing portfolio at the final close: { equity, positions: { SYM: { weight, avgPrice? } } }. */
export function advicePortfolio(advice, snap) {
  const E = ok(advice?.equity) && advice.equity > 0 ? advice.equity : DEFAULT_RULES.cash;
  const positions = {};
  let cash = E, gross = 0;
  for (const [s, p] of Object.entries(advice?.positions || {})) {
    const a = snap.assets[s], w = Number(typeof p === 'object' ? p.weight : p);
    if (!a || !ok(w) || w === 0 || !(a.bar.c > 0)) continue;
    const value = w * E, qty = value / a.bar.c, avg = ok(p?.avgPrice) && p.avgPrice > 0 ? p.avgPrice : a.bar.c;
    positions[s] = { qty, side: w > 0 ? 'long' : 'short', value, weight: w, avgPrice: avg, pnlPct: w > 0 ? a.bar.c / avg - 1 : 1 - a.bar.c / avg };
    cash -= value; gross += Math.abs(value);
  }
  return { cash, equity: E, exposure: gross / E, positions };
}

export async function runRace(m, bots, rulesIn = {}, onStep = null, opts = {}) {
  const rules = { ...DEFAULT_RULES, ...rulesIn, feeBps: { ...DEFAULT_RULES.feeBps, ...rulesIn.feeBps }, slippageBps: { ...DEFAULT_RULES.slippageBps, ...rulesIn.slippageBps }, borrowBps: { ...DEFAULT_RULES.borrowBps, ...rulesIn.borrowBps } };
  const market = Object.fromEntries(m.assets.map(a => [a.id, a.market]));
  const accounts = bots.map(b => createAccount(b, rules));
  const info = {
    timeframe: m.cfg.tf, blind: !!m.cfg.blind, steps: m.timeline.length,
    periodsPerYear: periodsPerYear(m.cfg.tf, m.assets.some(a => a.market === 'crypto') ? 'crypto' : 'stocks'),
    start: m.cfg.blind ? null : m.timeline[0], end: m.cfg.blind ? null : m.timeline[m.timeline.length - 1],
    rules: { cash: rules.cash, feeBps: rules.feeBps, slippageBps: rules.slippageBps, maxGross: rules.maxGross, allowShort: rules.allowShort, minTradeValue: rules.minTradeValue, barMs: rules.barMs, borrowBps: rules.borrowBps, marginBps: rules.marginBps, noise: rules.noise },
    assets: m.assets.map(a => ({ symbol: a.id, market: a.market, name: m.cfg.blind ? null : a.name, sector: m.cfg.blind ? null : a.sector || null,
      exchange: m.cfg.blind ? null : a.exchange || null, currency: a.currency || 'USD' })),
    history: history(m),
  };
  await Promise.all(bots.map(async (b, i) => {
    const r = await b.host.init(structuredClone(info));
    if (!r.ok) { accounts[i].errors++; accounts[i].initError = r.error; if (r.fatal) accounts[i].retired = 'init failed'; }
  }));
  for (let k = 0; k < m.timeline.length; k++) {
    for (const acc of accounts) if (!acc.retired) execute(acc, m, k, rules, s => market[s]);
    for (const acc of accounts) mark(acc, m, k, rules, s => market[s]);
    const snap = snapshot(m, k);
    const listed = new Set(Object.keys(snap.assets));
    const last = k === m.timeline.length - 1;
    if (!last) await Promise.all(bots.map(async (b, i) => {
      const acc = accounts[i];
      if (acc.retired) return;
      const state = { ...snap, portfolio: { cash: acc.cash, equity: acc.equity, exposure: acc.exposure, positions: acc.positions } };
      const r = await b.host.onBar(state);
      if (r.timeout) acc.timeouts++;
      if (!r.ok) { acc.errors++; acc.lastError = r.error; if (r.fatal) acc.retired = r.timeout ? 'timed out' : 'crashed'; return; }
      try {
        const d = normaliseDecision(r.value, listed, rules);
        if (!d) return;
        if (d.note) acc.notes.push({ k, text: d.note });
        if (d.targets) { acc.pending = d.targets; acc.filled = null; acc.lastTargets = d.targets; }
      } catch (err) { acc.errors++; acc.lastError = String(err.message || err); }
    }));
    // Advice mode: one extra decision at the final close, seeing the viewer's basket instead of the bot's own book.
    // A bot without a new opinion (null) is read as "hold my current basket".
    if (last && opts.advice) await Promise.all(bots.map(async (b, i) => {
      const acc = accounts[i];
      if (acc.retired) return;
      // An order still waiting for a closed market is part of the bot's intended basket.
      const own = acc.pending ? { ...acc.pending } : Object.fromEntries(Object.entries(acc.positions || {}).map(([s, p]) => [s, p.weight]));
      const r = await b.host.onBar({ ...snap, portfolio: advicePortfolio(opts.advice, snap) });
      if (!r.ok) { acc.advice = { error: r.error, targets: own, source: 'own' }; return; }
      try {
        const d = normaliseDecision(r.value, listed, rules);
        acc.advice = d?.targets ? { targets: d.targets, note: d.note, source: 'decision' } : { targets: own, note: d?.note || null, source: 'own' };
      } catch (err) { acc.advice = { error: String(err.message || err), targets: own, source: 'own' }; }
    }));
    if (onStep) await onStep(k, snap, accounts);
  }
  await Promise.all(bots.map(b => b.host.close?.()));
  return { accounts, rules, stats: accounts.map(a => stats(a, m, rules)) };
}

export function stats(acc, m, rules) {
  const c = acc.curve, n = c.length;
  const ppy = periodsPerYear(m.cfg.tf, m.assets.some(a => a.market === 'crypto') ? 'crypto' : 'stocks');
  const r = []; for (let i = 1; i < n; i++) r.push(c[i] / c[i - 1] - 1);
  const mean = r.reduce((s, x) => s + x, 0) / (r.length || 1);
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, r.length - 1));
  const dsd = Math.sqrt(r.reduce((s, x) => s + Math.min(0, x) ** 2, 0) / Math.max(1, r.length));
  const years = (m.timeline[n - 1] - m.timeline[0] + TF_MS[m.cfg.tf]) / (365.25 * 86400000);
  const total = c[n - 1] / rules.cash - 1;
  const cagr = years > 0 && c[n - 1] > 0 ? (c[n - 1] / rules.cash) ** (1 / years) - 1 : NaN;
  const wins = acc.realized.filter(x => x > 0).length;
  return {
    id: acc.id, name: acc.name, final: c[n - 1], totalReturn: total, cagr,
    volatility: sd * Math.sqrt(ppy), sharpe: sd ? mean / sd * Math.sqrt(ppy) : 0, sortino: dsd ? mean / dsd * Math.sqrt(ppy) : 0,
    maxDrawdown: acc.maxDD, calmar: acc.maxDD < 0 ? cagr / -acc.maxDD : NaN,
    trades: acc.trades.length, closedTrades: acc.realized.length, winRate: acc.realized.length ? wins / acc.realized.length : NaN,
    fees: acc.fees, carry: acc.carry || 0, marginCalls: acc.marginCalls || 0,
    shortTrades: acc.trades.filter(t => t.kind === 'short' || t.kind === 'flip').length,
    turnover: acc.turnover / rules.cash, errors: acc.errors, timeouts: acc.timeouts, retired: acc.retired,
    bestBar: r.length ? Math.max(...r) : 0, worstBar: r.length ? Math.min(...r) : 0,
  };
}

/** Buy-and-hold benchmark curves on the race timeline. Same terms as a bot: the first possible fill is the open of
 *  bar 1 (bots decide at the close of bar 0), and entries pay the market's commission and slippage. */
export function benchmarks(m, rules = DEFAULT_RULES) {
  const out = {};
  const N = m.timeline.length;
  const T1 = m.timeline[Math.min(1, N - 1)];
  const lastAt = (cols, T) => { let lo = 0, hi = cols.t.length - 1, j = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (cols.t[mid] <= T) { j = mid; lo = mid + 1; } else hi = mid - 1; } return j; };
  const curveFor = members => {
    const units = {}, part = rules.cash / members.length;
    for (const a of members) {
      const i = a.cols.t.findIndex(t => t >= T1);
      if (i < 0) continue;
      const mk = a.market === 'crypto' ? 'crypto' : 'stocks';
      const fee = (rules.feeBps?.[mk] ?? 0) / 1e4, slip = (rules.slippageBps?.[mk] ?? 0) / 1e4;
      const px = a.cols.o[i] * (1 + slip);
      units[a.id] = { q: part / (px * (1 + fee)), from: a.cols.t[i] };
    }
    return m.timeline.map(T => {
      let e = 0;
      for (const a of members) {
        const u = units[a.id];
        if (!u || T < u.from) { e += part; continue; }   // still cash until its first fill
        e += u.q * a.cols.c[Math.max(0, lastAt(a.cols, T))];
      }
      return e;
    });
  };
  const atStart = m.assets.filter(a => a.firstT <= m.timeline[0]);
  out['Equal weight'] = curveFor(atStart);
  const btc = m.assets.find(a => a.symbol === 'BTC'); if (btc) out['BTC hold'] = curveFor([btc]);
  const bist = m.assets.some(a => a.exchange === 'BIST');
  const idxCols = bist ? m.ctx.XU100?.cols : m.ctx.SPY?.cols;
  if (idxCols && m.assets.some(a => a.market === 'stocks') && m.cfg.tf === '1d') {
    out[bist ? 'BIST 100 hold' : 'S&P 500 hold'] = curveFor([{ id: bist ? '__XU100' : '__SPY', market: 'stocks', cols: idxCols, idx: new Map(idxCols.t.map((t, i) => [t, i])) }]);
  }
  return out;
}
