'use strict';

// Cross-sectional, long-only dual-momentum strategy.  All decisions use
// dimensionless features so the same code works with blind/rebased races.
let cfg;
let assetMarket;
let lastTargets;
let lastTradeStep;
let selected;

const finite = Number.isFinite;
const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function init(info) {
  assetMarket = Object.create(null);
  for (const a of info.assets) assetMarket[a.symbol] = a.market;

  const allCrypto = info.assets.every(a => a.market === 'crypto');
  const allStocks = info.assets.every(a => a.market === 'stocks');
  const mixed = !allCrypto && !allStocks;
  cfg = {
    tf: info.timeframe,
    mixed,
    maxGross: info.rules.maxGross,
    allowShort: info.rules.allowShort,
    // Mixed races need a little more breadth; otherwise slower reviews reduce
    // fee drag and reactions to noisy rank changes.
    rebalance: info.timeframe === '1d' ? (mixed ? 5 : 10) : (info.timeframe === '4h' ? 24 : 48),
    maxHold: mixed ? 6 : 4,
    minHold: 2,
    drift: assetMarket && info.assets.some(a => a.market === 'crypto') ? 0.035 : 0.025
  };
  lastTargets = Object.create(null);
  lastTradeStep = -1000000;
  selected = [];
}

function valid(x) { return finite(x); }
function value(f, key, fallback) { return valid(f[key]) ? f[key] : fallback; }

function scoreAsset(sym, a) {
  const f = a.f || {};
  const px = a.bar && a.bar.c;
  if (!a.tradable || !valid(px) || px <= 0) return null;

  const d50 = value(f, 'distSma50', -1);
  const d200 = value(f, 'distSma200', NaN);
  const cross = value(f, 'sma50over200', NaN);
  const r20 = value(f, 'ret20', NaN);
  const r60 = value(f, 'ret60', NaN);
  const r120 = value(f, 'ret120', NaN);
  const vol = value(f, 'vol20', NaN);
  if (!valid(r20) || !valid(r60) || !valid(vol) || vol <= 0) return null;

  // Absolute momentum gate.  The 200-bar test is used when warmed up;
  // otherwise the 50-bar trend gives newly listed assets a fair route in.
  const longTrend = valid(d200) ? d200 > 0 : d50 > 0;
  const mediumTrend = d50 > -0.015 && r60 > 0;
  const establishedUptrend = !valid(cross) || cross > 0;
  if (!longTrend || !mediumTrend || !establishedUptrend || r20 < -0.08) return null;

  const rr20 = value(f, 'rank_ret20', 0.5);
  const rr60 = value(f, 'rank_ret60', 0.5);
  const rr120 = value(f, 'rank_ret120', valid(r120) && r120 > 0 ? 0.6 : 0.4);
  const rs = value(f, 'rank_sharpe60', 0.5);
  const rd = value(f, 'rank_distSma50', 0.5);
  const rliq = value(f, 'rank_dollarVolume', 0.5);
  const rvol = value(f, 'rank_vol20', 0.5);

  // Avoid the least liquid tail when a broad universe is present.
  if (rliq < 0.12) return null;

  let score = 0.22 * rr20 + 0.30 * rr60 + 0.25 * rr120 +
              0.15 * rs + 0.08 * rd;
  // Modest preference for liquid assets and against lottery-like volatility.
  score += 0.035 * rliq - 0.025 * Math.max(0, rvol - 0.8);
  // Penalise very stretched moves, which often reverse before the next rebalance.
  if (d50 > 0.35) score -= Math.min(0.16, (d50 - 0.35) * 0.35);
  if (value(f, 'rsi14', 50) > 82) score -= 0.06;
  // A small incumbent bonus prevents noisy rank changes near the cutoff from
  // churning the portfolio while still allowing decisive leadership changes.
  if (selected.includes(sym)) score += 0.045;

  return { sym, score, vol, r20 };
}

function materiallyDifferent(targets, state) {
  const positions = state.portfolio.positions || {};
  const names = new Set([...Object.keys(targets), ...Object.keys(positions)]);
  for (const sym of names) {
    const want = targets[sym] || 0;
    const have = positions[sym] && finite(positions[sym].weight) ? positions[sym].weight : 0;
    if (Math.abs(want - have) > cfg.drift) return true;
  }
  return false;
}

function onBar(state) {
  if (!cfg) return null;
  const due = state.step === 0 || state.step - lastTradeStep >= cfg.rebalance;
  if (!due) return null;

  const candidates = [];
  for (const [sym, a] of Object.entries(state.assets)) {
    const c = scoreAsset(sym, a);
    if (c) candidates.push(c);
  }
  candidates.sort((a, b) => (b.score - a.score) || (b.r20 - a.r20) || (a.vol - b.vol));

  // Require genuine relative strength, not merely being best in a weak market.
  let picks = candidates.filter(x => x.score >= 0.53);
  const nListed = Math.max(1, state.market && state.market.listed || Object.keys(state.assets).length);
  let count = clip(Math.round(Math.sqrt(nListed)), cfg.minHold, cfg.maxHold);
  if (cfg.tf !== '1d') count = Math.min(count, 4);
  picks = picks.slice(0, count);

  // Broad weakness scales risk down; an empty absolute-momentum set means cash.
  let gross = Math.min(1, cfg.maxGross);
  const b50 = state.market && state.market.breadth50;
  const b200 = state.market && state.market.breadth200;
  const marketRet20 = state.market && state.market.ewRet20;
  if (valid(b50) && b50 < 0.36) gross = 0;
  else if (valid(b50) && b50 < 0.46) gross *= 0.55;
  if (valid(b200) && b200 < 0.24) gross *= 0.65;
  if (valid(marketRet20) && marketRet20 < -0.035) gross = 0;
  else if (valid(marketRet20) && marketRet20 < 0) gross *= 0.55;
  if (!picks.length) gross = 0;

  const targets = {};
  if (gross > 0) {
    // Capped inverse-volatility sizing balances stocks and crypto without letting
    // one exceptionally quiet asset consume the portfolio.
    const raw = picks.map(x => 1 / clip(x.vol, 0.18, 1.20));
    const sum = raw.reduce((a, b) => a + b, 0);
    const cap = picks.length > 1 ? 0.34 : 1;
    let weights = raw.map(x => Math.min(cap, x / sum));
    let ws = weights.reduce((a, b) => a + b, 0);
    // Redistribute cap residue once; any tiny remainder stays as cash.
    if (ws < 0.995) {
      const room = weights.map(w => cap - w);
      const roomSum = room.reduce((a, b) => a + b, 0);
      if (roomSum > 0) weights = weights.map((w, i) => w + (1 - ws) * room[i] / roomSum);
      ws = weights.reduce((a, b) => a + b, 0);
    }
    for (let i = 0; i < picks.length; i++) targets[picks[i].sym] = gross * weights[i] / ws;
  }

  const newNames = Object.keys(targets).sort().join(',');
  const oldNames = Object.keys(lastTargets).sort().join(',');
  const changedSet = newNames !== oldNames;
  if (!changedSet && !materiallyDifferent(targets, state)) {
    // Count this review so a stable portfolio is not reconsidered every bar.
    lastTradeStep = state.step;
    return null;
  }

  lastTargets = targets;
  selected = Object.keys(targets);
  lastTradeStep = state.step;
  return {
    targets,
    note: selected.length ? `Momentum rotation: ${selected.join(', ')}` : 'No positive trends; holding cash'
  };
}

module.exports = { name: 'Adaptive Dual Momentum', init, onBar };
