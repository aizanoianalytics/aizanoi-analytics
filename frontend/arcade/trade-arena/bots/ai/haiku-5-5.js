// Trend-and-momentum rotation with a market-regime dial.
// Holds the strongest risk-adjusted uptrends (above SMA50 and SMA200, positive 60-bar return),
// sized by inverse volatility. Rebalances about monthly to keep fees low, and cuts exposure
// when breadth or the broad market is weak.
const MAX_HOLD = 5;
const MAX_WEIGHT = 0.4;
const STOP_FROM_ENTRY = -0.2;   // hard stop: unrealised loss on any single position
const HOLD_BONUS = 1.15;        // stickiness: a held name needs a clearly better score to be replaced
const DRIFT_BAND = 0.06;        // only resize a held position if its weight is off target by more than this

let lastRebalance = -Infinity;
let period = 7;

const ok = x => Number.isFinite(x);

function regimeExposure(state) {
  let mult = 1;
  const m = state.market || {};
  const c = state.context || {};
  if (ok(m.breadth200)) {
    if (m.breadth200 < 0.25) mult *= 0.3;
    else if (m.breadth200 < 0.4) mult *= 0.6;
  }
  if (ok(c.spyDistSma200) && c.spyDistSma200 < 0) mult *= 0.6;
  if (ok(c.vix) && c.vix > 30) mult *= 0.6;
  return mult;
}

function score(f) {
  // Return per unit of risk over 60 bars; comparable across assets within one race.
  if (!ok(f.ret60) || !ok(f.vol60) || f.vol60 <= 0) return null;
  return f.ret60 / f.vol60;
}

module.exports = {
  name: 'Trend Rotator',

  init(info) {
    // Rebalance about monthly: slower trend reads beat weekly churn after fees.
    period = Math.max(1, Math.round(info.periodsPerYear / 12));
  },

  onBar(state) {
    const assets = state.assets || {};
    const positions = (state.portfolio && state.portfolio.positions) || {};
    const held = new Set(Object.keys(positions).filter(s => positions[s].qty > 0));

    // Candidates: tradable, in a confirmed uptrend, with usable features.
    const cands = [];
    for (const [sym, a] of Object.entries(assets)) {
      const f = a.f || {};
      if (!a.tradable) continue;
      if (!(ok(f.distSma200) && f.distSma200 > 0 && ok(f.distSma50) && f.distSma50 > 0)) continue;
      const s = score(f);
      if (s === null || s <= 0) continue;
      cands.push({ sym, s: s * (held.has(sym) ? HOLD_BONUS : 1) });
    }

    // Hard stop on every bar, not only at rebalance.
    const stopped = new Set();
    for (const sym of held) {
      const p = positions[sym];
      if (ok(p.pnlPct) && p.pnlPct <= STOP_FROM_ENTRY) stopped.add(sym);
    }

    const scheduled = state.step - lastRebalance >= period;
    if (!scheduled && stopped.size === 0) return null;

    if (!scheduled) {
      // Stop-out only: close the stopped names, leave everything else as it is.
      const targets = {};
      for (const sym of held) {
        if (stopped.has(sym)) targets[sym] = 0;
        else if (!assets[sym] || !assets[sym].tradable) continue;
        else targets[sym] = positions[sym].weight;
      }
      return { targets, note: `Stop-out: ${[...stopped].join(', ')}` };
    }

    lastRebalance = state.step;

    cands.sort((x, y) => y.s - x.s);
    const n = Math.min(MAX_HOLD, Math.max(0, cands.length));
    const chosen = cands.filter(c => !stopped.has(c.sym)).slice(0, n);

    const exposure = 0.95 * regimeExposure(state);
    const targets = {};

    // Inverse-volatility weights among the chosen names.
    let invSum = 0;
    const inv = chosen.map(c => {
      const v = assets[c.sym].f.vol20;
      const w = ok(v) && v > 0 ? 1 / v : 1;
      invSum += w;
      return w;
    });
    chosen.forEach((c, i) => {
      const want = Math.min(MAX_WEIGHT, exposure * inv[i] / invSum);
      const have = held.has(c.sym) ? positions[c.sym].weight : 0;
      // Drift band: a position that is already close to its target is left alone, to avoid paying fees for noise.
      targets[c.sym] = Math.abs(want - have) < DRIFT_BAND && held.has(c.sym) ? have : want;
    });

    // Assets we hold but cannot trade right now keep their current weight, so their order is not lost.
    for (const sym of held) {
      if (sym in targets) continue;
      if (!assets[sym] || !assets[sym].tradable) {
        targets[sym] = positions[sym].weight;
      }
    }
    // Explicit zeros for everything else we hold is implied by omission (sold).

    const names = chosen.map(c => c.sym);
    if (!names.length) {
      return { targets, note: 'No confirmed uptrends. Moving to cash.' };
    }
    const dial = exposure / 0.95;
    return {
      targets,
      note: `Rotating into ${names.join(', ')}${dial < 1 ? ` (risk dialled to ${Math.round(dial * 100)}%)` : ''}`.slice(0, 140),
    };
  },
};
