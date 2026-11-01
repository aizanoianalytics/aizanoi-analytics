'use strict';

/*
  Cross-sectional trend follower.  It deliberately trades only on a slow cadence:
  avoiding turnover is important because target changes are charged transaction costs.
*/
let cfg = null;
let lastRebalance = -1000000;
let riskExited = false;

function finite(x) {
  return Number.isFinite(x);
}

function value(x, fallback) {
  return finite(x) ? x : fallback;
}

function rebalanceEvery(timeframe) {
  // Intraday commission compounds rapidly, especially for crypto.  Let trends
  // persist for several sessions rather than reacting to each noisy bar.
  if (timeframe === '1h') return 72;       // about three days
  if (timeframe === '4h') return 24;       // about four days
  return 5;                                // about one week for daily bars
}

function rankValue(f, field, fallback) {
  const x = f[field];
  return finite(x) ? x : fallback;
}

function isRiskOff(state) {
  const m = state.market || {};
  // A broad, sustained downtrend is a poor long-only environment.  Require both
  // weak breadth and negative intermediate breadth return to reduce whipsaws.
  return finite(m.breadth50) && finite(m.ewRet20) &&
    m.breadth50 < 0.32 && m.ewRet20 < -0.035;
}

function candidate(sym, item) {
  if (!item || !item.tradable || !item.f) return null;
  const f = item.f;
  const r20 = f.ret20;
  const r60 = f.ret60;
  const d50 = f.distSma50;
  const rsi = f.rsi14;
  if (!finite(r20) || !finite(r60) || !finite(d50) || !finite(rsi)) return null;

  // Trend confirmation is intentionally independent of identity, price level,
  // sector, date, and the availability of fundamental information.
  if (r20 <= 0 || r60 < -0.04 || d50 < -0.018 || rsi < 47 || rsi > 86) return null;

  const momentum = 0.42 * rankValue(f, 'rank_ret20', r20) +
    0.28 * rankValue(f, 'rank_ret60', r60) +
    0.15 * rankValue(f, 'rank_ret120', value(f.ret120, r60)) +
    0.10 * rankValue(f, 'rank_sharpe60', 0.5) +
    0.05 * rankValue(f, 'rank_relVolume', 0.5);

  // Favour persistent trends, but do not make any price-level assumptions.
  const quality = (finite(f.lrR2_20) ? Math.min(1, Math.max(0, f.lrR2_20)) : 0.4) * 0.06;
  const trend = (finite(f.supertrendDir) && f.supertrendDir > 0 ? 0.035 : 0) +
    (finite(f.psarDir) && f.psarDir > 0 ? 0.02 : 0);
  return { sym, score: momentum + quality + trend, vol: value(f.vol20, NaN) };
}

module.exports = {
  name: 'Measured Momentum',

  init(info) {
    cfg = {
      cadence: rebalanceEvery(info.timeframe),
      maxGross: finite(info.rules && info.rules.maxGross) ? info.rules.maxGross : 1
    };
    lastRebalance = -1000000;
    riskExited = false;
  },

  onBar(state) {
    if (!cfg) return null;

    if (isRiskOff(state)) {
      if (!riskExited || Object.keys(state.portfolio.positions || {}).length > 0) {
        riskExited = true;
        lastRebalance = state.step;
        return { targets: {}, note: 'Broad trend weak; preserving cash' };
      }
      return null;
    }

    const due = state.step === 0 || riskExited || state.step - lastRebalance >= cfg.cadence;
    if (!due) return null;
    riskExited = false;
    lastRebalance = state.step;

    const picks = [];
    for (const sym of Object.keys(state.assets || {})) {
      const pick = candidate(sym, state.assets[sym]);
      if (pick) picks.push(pick);
    }
    picks.sort((a, b) => b.score - a.score || a.sym.localeCompare(b.sym));

    // A small, diversified basket keeps a single high-beta name from dominating.
    const count = picks.length >= 18 ? 5 : (picks.length >= 8 ? 4 : 3);
    const chosen = picks.slice(0, count);
    if (!chosen.length) return { targets: {}, note: 'No confirmed uptrends; in cash' };

    // Reserve a little cash for gaps and reduce concentration when the universe
    // has too few qualifying assets.  Volatility does not set weights: annualised
    // volatility varies by market/timeframe and simple equal weights are stable.
    const gross = chosen.length === 1 ? 0.72 : (chosen.length === 2 ? 0.84 : 0.94);
    const allowedGross = Math.min(gross, cfg.maxGross);
    const targets = {};
    const weight = allowedGross / chosen.length;
    for (const pick of chosen) targets[pick.sym] = weight;

    return { targets, note: 'Rebalanced into persistent relative-strength trends' };
  }
};
