// Aizo Bot — house bot (not an AI-model entry), written to the owner's rules on 2026-11-03.
//
// Contrarian extremes, every condition at the same time:
//   SHORT when the close is above EMA 7, 21, 50, 100 and 200, RSI(14) > 70 and the close is above its value
//         1 week, 1 month, 6 months, 1 year and 3 years ago (shorts only in long/short races).
//   LONG  in the mirror case: below every EMA, RSI(14) < 30 and below every past value.
//   A past value the bot cannot see yet (1 year / 3 years at the start of a race) is skipped; 1 week,
//   1 month and 6 months are always required.
// Sizing: every new signal opens a fresh lot of 10 % of equity.
// Long lot: no stop. At +20 % it sells exactly the principal and moves the rest to a "kept" stock that is
//   never sold. A later signal opens a new lot beside the kept stock, which grows lot by lot.
// Short lot: closed completely at +20 % profit or at a 20 % loss.
const ok = Number.isFinite;
const DAYS = { week: 7, month: 30, half: 182, year: 365, three: 1095 };
const REQUIRED = ['week', 'month', 'half'];

let allowShort = false, maxGross = 1, tf = '1d';
const S = {}; // sym -> { market, closes: [], e7, e100, n, kept, lot }

function barsPerDay(market) {
  if (tf === '1d') return market === 'crypto' ? 1 : 252 / 365;
  const perDay = tf === '4h' ? 6 : 24;
  return market === 'crypto' ? perDay : perDay * 252 / 365;
}

function seed(sym, market) {
  return (S[sym] ??= { market, closes: [], e7: NaN, e100: NaN, n: 0, kept: 0, lot: null });
}

function push(s, c) {
  if (!ok(c) || c <= 0) return;
  s.closes.push(c);
  if (s.closes.length > 30000) s.closes.splice(0, s.closes.length - 30000);
  s.n++;
  s.e7 = ok(s.e7) ? s.e7 + (2 / 8) * (c - s.e7) : c;
  s.e100 = ok(s.e100) ? s.e100 + (2 / 101) * (c - s.e100) : c;
}

/** +1 long signal, -1 short signal, 0 none. */
function signal(s, a) {
  const f = a.f || {}, c = a.bar.c;
  if (s.n < 100) return 0; // EMA 100 needs its warm-up
  const emas = [s.e7, f.ema21, f.ema50, s.e100, f.ema200];
  if (!emas.every(ok) || !ok(f.rsi14)) return 0;
  const bpd = barsPerDay(s.market), n = s.closes.length;
  const past = [];
  for (const [k, d] of Object.entries(DAYS)) {
    const back = Math.round(d * bpd);
    if (back >= n) { if (REQUIRED.includes(k)) return 0; continue; } // not visible yet: skip 1y/3y only
    past.push(s.closes[n - 1 - back]);
  }
  if (f.rsi14 > 70 && emas.every(e => c > e) && past.every(p => c > p)) return -1;
  if (f.rsi14 < 30 && emas.every(e => c < e) && past.every(p => c < p)) return 1;
  return 0;
}

const fmt = x => `${(x * 100).toFixed(0)}%`;

/** Advice mode (final bar, viewer's basket): apply the same exits to the viewer's positions, add new lots. */
function advise(state) {
  const A = state.assets, pos = state.portfolio.positions || {}, targets = {}, notes = [];
  for (const [sym, a] of Object.entries(A)) if (a.tradable) push(S[sym] || seed(sym, 'stocks'), a.bar.c); // the final close
  let gross = 0;
  for (const [sym, p] of Object.entries(pos)) {
    const a = A[sym]; if (!a || !ok(p.weight)) continue;
    const c = a.bar.c, avg = ok(p.avgPrice) && p.avgPrice > 0 ? p.avgPrice : c;
    let w = p.weight;
    if (w > 0 && c >= avg * 1.2) { w *= 1 - avg / c; notes.push(`take principal on ${sym}`); }
    else if (w < 0 && (c <= avg * 0.8 || c >= avg * 1.2)) { w = 0; notes.push(`cover ${sym}`); }
    if (w) { targets[sym] = w; gross += Math.abs(w); }
  }
  for (const [sym, a] of Object.entries(A)) {
    if (targets[sym] || !a.tradable) continue;
    const sig = signal(S[sym] || seed(sym, 'stocks'), a);
    if (!sig || (sig < 0 && !allowShort) || gross + 0.1 > maxGross - 0.02) continue;
    targets[sym] = 0.1 * sig; gross += 0.1; notes.push(`${sig > 0 ? 'buy' : 'short'} ${sym}`);
  }
  return { targets, note: notes.length ? `Aizo: ${notes.slice(0, 4).join(', ')}` : 'Aizo: no rule fires, keep the basket' };
}

module.exports = {
  name: 'Aizo Bot',
  init(info) {
    allowShort = !!info.rules?.allowShort;
    maxGross = ok(info.rules?.maxGross) ? Math.max(1, info.rules.maxGross) : 1;
    tf = info.timeframe || '1d';
    for (const a of info.assets) {
      const s = seed(a.symbol, a.market);
      for (const c of info.history?.[a.symbol]?.c || []) push(s, c);
    }
  },
  onBar(state) {
    const A = state.assets, P = state.portfolio, pos = P.positions || {}, E = P.equity;
    if (state.step === state.steps - 1) return advise(state); // only advice calls see the last bar
    if (!(E > 0)) return null;
    // 1. Indicators, and lots that were filled at this bar's open.
    for (const [sym, a] of Object.entries(A)) {
      const s = S[sym] || seed(sym, 'stocks');
      if (!a.tradable) continue;
      push(s, a.bar.c);
      const qty = pos[sym]?.qty || 0;
      if (s.lot?.pending) {
        const filled = qty - s.kept;
        if (Math.sign(filled) === s.lot.side && Math.abs(filled) > 1e-12) { s.lot.qty = filled; s.lot.entry = a.bar.o; s.lot.pending = false; }
        else s.lot = null; // not filled (cash or gross limit): forget it
      } else if (!s.lot && !s.exiting) s.kept = Math.max(0, qty); // follow small engine drift of the kept stock
      s.exiting = false;
    }
    // 2. Exits.
    const notes = [];
    let changed = false;
    for (const [sym, s] of Object.entries(S)) {
      const a = A[sym]; if (!s.lot || s.lot.pending || !a?.tradable) continue;
      const c = a.bar.c, { side, qty, entry } = s.lot;
      if (side > 0 && c >= entry * 1.2) {
        const sell = qty * entry / c; // principal back, the rest is kept forever
        s.kept += qty - sell; s.lot = null; s.exiting = true; changed = true;
        notes.push(`+20% on ${sym}: principal out, rest kept`);
      } else if (side < 0 && (c <= entry * 0.8 || c >= entry * 1.2)) {
        s.lot = null; s.exiting = true; changed = true;
        notes.push(`${c <= entry * 0.8 ? 'Short +20%' : 'Short stop −20%'} on ${sym}: closed`);
      }
    }
    // 3. Entries: 10 % lots, never beyond the gross limit (a scaled-down book would touch the kept stock).
    const value = sym => { const s = S[sym], c = A[sym]?.bar.c; return ok(c) ? (s.kept + (s.lot ? s.lot.qty : 0)) * c : 0; };
    let gross = Object.keys(S).reduce((t, sym) => t + Math.abs(value(sym)), 0) / E;
    const cands = [];
    for (const [sym, a] of Object.entries(A)) {
      const s = S[sym]; if (!s || s.lot || !a.tradable) continue;
      const sig = signal(s, a);
      if (sig < 0 && !allowShort) continue;
      if (sig) cands.push([sym, sig, Math.abs(a.f.rsi14 - 50)]);
    }
    cands.sort((x, y) => y[2] - x[2]); // most extreme RSI first
    for (const [sym, sig] of cands) {
      if (gross + 0.1 > maxGross - 0.02) break;
      const c = A[sym].bar.c;
      S[sym].lot = { side: sig, qty: sig * 0.1 * E / c, entry: c, pending: true };
      gross += 0.1; changed = true;
      notes.push(`${sig > 0 ? 'Buy' : 'Short'} ${sym} (RSI ${A[sym].f.rsi14.toFixed(0)})`);
    }
    if (!changed) return null; // nothing to do: never touch the book
    const targets = {};
    for (const sym of Object.keys(S)) { const v = value(sym); if (v) targets[sym] = v / E; }
    return { targets, note: notes.slice(0, 3).join(' · ').slice(0, 140) };
  },
};
