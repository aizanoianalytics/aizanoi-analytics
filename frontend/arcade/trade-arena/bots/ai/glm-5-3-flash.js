// Dragon Rider (renamed from Tide Rider by the owner; logic unchanged): throttled cross-sectional momentum (ret60, SMA200 gate),
// graded gross exposure from a smoothed share-above-SMA200 gauge plus a quick
// crash brake, per-position hard stops, and a short sleeve in weak markets
// when the rules allow it.
let REBAL = 7;
let lastTradeStep = -99;
let lastKlass = -1;
let peakEquity = 0;
let b200e = NaN;
let ewEma = 0;
let recentStops = {};
const RULES = { maxGross: 1, allowShort: false };

function fin(x, d) {
  return Number.isFinite(x) ? x : d;
}

module.exports = {
  name: 'Dragon Rider',
  init(info) {
    const tf = info.timeframe || '1d';
    REBAL = tf === '1d' ? 7 : tf === '4h' ? 21 : 63;
    const r = info.rules || {};
    RULES.maxGross = Math.max(1, r.maxGross || 1);
    RULES.allowShort = !!r.allowShort;
  },
  onBar(state) { return decide(state); }
};

function decide(state) {
  const m = state.market || {};
  const port = state.portfolio || {};
  const eq = fin(port.equity, 0);
  if (Number.isFinite(eq) && eq > 0) peakEquity = Math.max(peakEquity, eq);
  const pos = port.positions || {};
  const assets = state.assets;

  const b200 = fin(m.breadth200, fin(m.breadth50, 0.5));
  b200e = Number.isFinite(b200e) ? b200e + 0.25 * (b200 - b200e) : b200;
  const ew20 = fin(m.ewRet20, 0);
  ewEma += 0.25 * (ew20 - ewEma);

  // graded gross budget
  let budget = b200e > 0.62 ? 0.92 : b200e >= 0.45 ? 0.5 : 0.12;
  if (ewEma < -0.2) budget = Math.min(budget, 0.12);

  // hard stops, checked every bar
  const stops = [];
  for (const sym of Object.keys(pos)) {
    const p = pos[sym];
    if (!assets[sym] || !assets[sym].tradable) continue;
    if (p.side === 'long' && (p.weight || 0) > 0.02 && fin(p.pnlPct, 0) < -0.16) { stops.push(sym); recentStops[sym] = state.step; }
    else if (p.side === 'short' && (p.weight || 0) < -0.02 && fin(p.pnlPct, 0) < -0.22) { stops.push(sym); recentStops[sym] = state.step; }
  }
  // re-enter a stopped symbol only after a cooldown
  const onCooldown = (sym) => state.step - fin(recentStops[sym], -999) < 15;

  const due = state.step - lastTradeStep >= REBAL;
  const klass = budget > 0.72 ? 2 : budget >= 0.3 ? 1 : 0;
  const klassShift = klass !== lastKlass;
  if (!stops.length && !due && !klassShift) return null;

  // universe (only needed when trading)
  const up = [];
  const weak = [];
  for (const sym of Object.keys(assets)) {
    const a = assets[sym];
    if (!a || !a.tradable) continue;
    const f = a.f || {};
    if (!Number.isFinite(f.ret60) || !Number.isFinite(f.sma50)) continue;
    if (Number.isFinite(f.distSma200) && f.distSma200 > 0 && !onCooldown(sym)) up.push({ sym: sym, r60: f.ret60, f: f });
    else if (fin(f.distSma50, 0) < -0.03 && fin(f.ret20, 0) < 0) weak.push({ sym: sym, s: fin(f.rank_ret60, 0.5) + fin(f.rank_sharpe60, 0.5), f: f });
  }
  up.sort((x, y) => y.r60 - x.r60);
  weak.sort((x, y) => x.s - y.s);

  const out = {};
  const maxGross = RULES.maxGross * 0.98;

  // short sleeve when allowed and market weak
  let shortGross = 0;
  if (RULES.allowShort && b200e < 0.5 && ewEma < -0.04) {
    const sMax = b200e < 0.38 ? 0.38 : 0.2;
    let sLeft = sMax;
    for (const c of weak.slice(0, 3)) {
      if (sLeft < 0.09) break;
      const w = Math.round(-Math.min(0.16, sLeft) * 10000) / 10000;
      out[c.sym] = w;
      shortGross += -w;
      sLeft -= -w;
    }
  }

  // longs
  let longBudget = Math.min(maxGross - shortGross, budget - 0.5 * shortGross);
  if (longBudget > 0.06 && up.length) {
    const K = 5;
    const picks = up.slice(0, K);
    const w = Math.round(longBudget / picks.length * 10000) / 10000;
    if (w > 0.03) {
      for (const c of picks) {
        const f = c.f;
        if (fin(f.zscore20, 0) > 2.4) continue; // dont chase vertical bars
        out[c.sym] = w;
      }
    }
  }

  lastTradeStep = state.step;
  lastKlass = klass;

  const names = Object.keys(out).slice(0, 4).join(',');
  let note = '';
  if (stops.length) note = 'Stop; ';
  note += (budget >= 0.85 ? 'Full risk' : budget >= 0.5 ? 'Risk reduced' : 'Low risk') + ': ' + (names || 'cash');
  return { targets: out, note: note.slice(0, 140) };
}
