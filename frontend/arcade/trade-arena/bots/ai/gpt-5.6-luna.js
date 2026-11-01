'use strict';

// Adaptive cross-sectional trend bot.  It deliberately uses only information exposed
// by the API, so aliases and rebased prices in blind races require no special cases.

let cfg = null;
let lastTargets = Object.create(null);
let lastRegime = '';
let lastTradeStep = -1000000;

function finite(x) {
  return Number.isFinite(x);
}

function value(f, key, fallback) {
  return finite(f[key]) ? f[key] : fallback;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function cleanTargets(targets) {
  const out = Object.create(null);
  let gross = 0;
  for (const [sym, raw] of Object.entries(targets)) {
    if (!finite(raw) || raw <= 0) continue;
    const w = Math.min(raw, 1);
    out[sym] = w;
    gross += w;
  }
  const maxGross = cfg && cfg.rules && finite(cfg.rules.maxGross) ? cfg.rules.maxGross : 1;
  if (gross > maxGross && gross > 0) {
    const scale = maxGross / gross;
    for (const sym of Object.keys(out)) out[sym] *= scale;
  }
  return out;
}

function targetsClose(a, b, tolerance) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const sym of keys) {
    if (Math.abs((a[sym] || 0) - (b[sym] || 0)) > tolerance) return false;
  }
  return true;
}

function regimeFor(state, isCrypto) {
  const m = state.market || {};
  const breadth50 = m.breadth50;
  const breadth200 = m.breadth200;
  const ew20 = m.ewRet20;
  let risk = 1;

  if (finite(breadth200) && breadth200 < 0.35) risk *= 0.45;
  else if (finite(breadth200) && breadth200 < 0.50) risk *= 0.72;
  if (finite(breadth50) && breadth50 < 0.30) risk *= 0.72;
  if (finite(ew20) && ew20 < -0.08) risk *= 0.60;
  else if (finite(ew20) && ew20 < -0.025) risk *= 0.82;

  // Crypto has no weekend-specific adjustment; this merely makes a broad,
  // persistent crypto selloff reduce exposure even if a breadth field is absent.
  if (isCrypto && finite(ew20) && ew20 < -0.12) risk *= 0.70;
  risk = clamp(risk, 0.25, 1);
  if (risk > 0.88) return 'risk-on';
  if (risk < 0.55) return 'defensive';
  return 'mixed';
}

function scoreAsset(entry, state) {
  const f = entry.f || {};
  const close = entry.bar && entry.bar.c;
  if (!finite(close) || close <= 0) return null;

  const r20 = f.ret20;
  const r60 = f.ret60;
  const dist50 = f.distSma50;
  const dist200 = f.distSma200;
  const rsi = f.rsi14;

  // Do not buy a clearly deteriorating instrument. Missing warm-up values are
  // allowed because the supplied history can begin partway through a listing.
  if (finite(r20) && r20 < -0.035) return null;
  if (finite(dist50) && dist50 < -0.055) return null;
  if (finite(dist200) && dist200 < -0.14) return null;

  const ret20 = value(f, 'rank_ret20', 0.5);
  const ret60 = value(f, 'rank_ret60', ret20);
  const ret120 = value(f, 'rank_ret120', ret60);
  const ret250 = value(f, 'rank_ret250', ret120);
  const sharpe = value(f, 'rank_sharpe60', 0.5);
  const relVol = value(f, 'rank_relVolume', 0.5);
  const distRank = value(f, 'rank_distSma50', 0.5);

  let score;
  if (cfg.timeframe === '1h') {
    score = 0.12 * ret20 + 0.23 * ret60 + 0.25 * ret120 +
      0.20 * ret250 + 0.12 * sharpe + 0.08 * distRank;
  } else if (cfg.timeframe === '4h') {
    score = 0.20 * ret20 + 0.27 * ret60 + 0.22 * ret120 +
      0.13 * ret250 + 0.12 * sharpe + 0.06 * distRank;
  } else {
    score = 0.28 * ret20 + 0.24 * ret60 + 0.18 * ret120 +
      0.14 * sharpe + 0.10 * distRank + 0.06 * relVol;
  }

  if (finite(dist50) && dist50 > 0) score += 0.045;
  if (finite(dist200) && dist200 > 0) score += 0.045;
  if (finite(f.sma50over200) && f.sma50over200 > 0) score += 0.035;
  if (finite(f.adx14) && f.adx14 > 18) score += 0.025;
  if (finite(f.lrR2_20) && f.lrR2_20 > 0.30 && finite(f.lrSlope20) && f.lrSlope20 > 0) score += 0.025;
  if (finite(f.newHigh20) && f.newHigh20 === 1) score += 0.018;

  // A mild overextension penalty avoids repeatedly buying one vertical candle,
  // while leaving normal strong trends eligible.
  if (finite(rsi) && rsi > 78) score -= 0.055;
  if (finite(f.vol20) && f.vol20 > 1.10) score -= 0.025;

  const vol = finite(f.vol20) && f.vol20 > 0.04 ? f.vol20 :
    (finite(f.atrPct) && f.atrPct > 0.005 ? f.atrPct * Math.sqrt(value(cfg, 'periodsPerYear', 365)) : 0.35);
  const quality = clamp(score, 0.05, 1.25);
  return { sym: entry.sym, score: quality, vol: clamp(vol, 0.06, 2.5), rsi };
}

module.exports = {
  name: 'Regime Trend Rotation',

  init(info) {
    cfg = info || {};
    lastTargets = Object.create(null);
    lastRegime = '';
    lastTradeStep = -1000000;
  },

  onBar(state) {
    if (!state || !state.assets) return null;

    const assetKinds = Object.values(state.assets).map(a => a && a.market).filter(Boolean);
    const isCrypto = assetKinds.length > 0 && assetKinds.every(k => k === 'crypto');
    const regime = regimeFor(state, isCrypto);
    const candidates = [];

    for (const [sym, asset] of Object.entries(state.assets)) {
      if (!asset || asset.tradable === false) continue;
      const scored = scoreAsset({ sym, ...asset }, state);
      if (scored) candidates.push(scored);
    }

    candidates.sort((a, b) => b.score - a.score || a.vol - b.vol);

    const marketRisk = regime === 'risk-on' ? 1 : (regime === 'mixed' ? 0.78 : 0.48);
    const maxGross = cfg && cfg.rules && finite(cfg.rules.maxGross) ? cfg.rules.maxGross : 1;
    const gross = Math.min(0.94, maxGross) * marketRisk;
    const limit = cfg.timeframe === '4h' ? 12 : 8;
    const selected = candidates.filter(x => x.score >= 0.49).slice(0, limit);
    const targets = Object.create(null);

    if (selected.length > 0 && gross >= 0.08) {
      // A bounded basket keeps concentration under control while still allowing
      // the best trends to matter.
      let total = 0;
      for (const x of selected) {
        x.raw = (1 / Math.sqrt(x.vol)) * (0.80 + 0.40 * clamp(x.score, 0, 1));
        total += x.raw;
      }
      for (const x of selected) targets[x.sym] = gross * x.raw / total;
    }

    const cleaned = cleanTargets(targets);
    const positionSyms = Object.keys((state.portfolio && state.portfolio.positions) || {});
    const heldOutside = positionSyms.some(sym => !(sym in cleaned));
    const meaningful = !targetsClose(cleaned, lastTargets, 0.045) || heldOutside;
    const cadence = cfg.timeframe === '1h' ? 24 : (cfg.timeframe === '4h' ? 24 : 5);
    const cooldown = state.step - lastTradeStep < cadence;

    // A target is retained until a material change or an exit is needed. This
    // prevents fee-heavy daily reshuffling from tiny rank movements.
    if (!meaningful && regime === lastRegime) return null;
    if (cooldown) return null;

    lastTargets = cleaned;
    lastRegime = regime;
    lastTradeStep = state.step;

    const names = Object.keys(cleaned);
    let note;
    if (names.length === 0) note = 'Broad trend weak; moving to cash';
    else note = (regime === 'defensive' ? 'Defensive rotation into strongest trends' : 'Rotating into strongest multi-horizon trends');
    return { targets: cleaned, note };
  }
};
