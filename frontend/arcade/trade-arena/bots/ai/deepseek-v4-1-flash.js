// Regime Rig: hold the strongest five momentum names; in weak markets short the laggards.
let CFG = { interval: 7, maxGross: 1, allowShort: false };
let lastReb = -1e9;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (x, d) => (Number.isFinite(x) ? x : d);

function topWeights(items, gross, cap) {
  const out = {};
  if (!items.length) return out;
  const w = Math.min(gross / items.length, cap);
  for (const x of items) out[x.sym] = w;
  return out;
}

function computeTargets(state) {
  const assets = state.assets || {};
  const mk = state.market || {};
  const b50 = num(mk.breadth50, 0.5);
  const ew20 = num(mk.ewRet20, 0);
  const longs = [], shorts = [];
  const nAssets = Object.keys(assets).length;

  for (const sym of Object.keys(assets)) {
    const a = assets[sym];
    const f = (a && a.f) || {};
    if (!Number.isFinite(f.ret60) || !Number.isFinite(f.distSma200)) continue;
    if (f.distSma200 > 0) {
      longs.push({ sym, sc: num(f.rank_ret60, 0.5) });
    } else if (CFG.allowShort && f.distSma50 < 0 && num(f.ret20, 0) < 0) {
      shorts.push({ sym, sc: num(f.rank_ret60, 0.5) });
    }
  }
  longs.sort((a, b) => b.sc - a.sc);
  shorts.sort((a, b) => a.sc - b.sc);

  const kLong = clamp(Math.round(nAssets * 0.16), 3, 5);
  const kShort = clamp(Math.round(nAssets * 0.13), 2, 5);

  const bearish = b50 < 0.28 || (b50 < 0.4 && ew20 < -0.05);
  let longGross = 0.95;
  if (CFG.allowShort && bearish) longGross = 0.7;

  const longSel = longs.slice(0, kLong);
  const capL = longSel.length <= 1 ? 0.75 : longSel.length <= 2 ? 0.5 : longSel.length <= 4 ? 0.3 : 0.22;
  const lw = topWeights(longSel, longGross, capL);
  const targets = {};
  let longSum = 0;
  for (const k of Object.keys(lw)) { targets[k] = lw[k]; longSum += lw[k]; }

  const bits = [];
  if (longSel.length) bits.push('L ' + longSel.slice(0, 4).map(x => x.sym).join(','));

  if (CFG.allowShort && bearish) {
    let shortGross = 0.3;
    shortGross = Math.min(shortGross, Math.max(0, CFG.maxGross * 0.96 - longSum));
    if (shortGross > 0.02) {
      const sSel = shorts.slice(0, kShort);
      const sw = topWeights(sSel, shortGross, 0.2);
      for (const k of Object.keys(sw)) targets[k] = -sw[k];
      if (sSel.length) bits.push('S ' + sSel.slice(0, 3).map(x => x.sym).join(','));
    }
  }

  if (!bits.length) bits.push('no leaders, cash');
  const note = `Breadth ${Math.round(b50 * 100)}% · ${bits.join(' · ')}`.slice(0, 140);
  return { targets, note };
}

module.exports = {
  name: 'Regime Rig',
  init(info) {
    const tf = info && info.timeframe;
    CFG = {
      interval: tf === '1h' ? 36 : tf === '4h' ? 15 : 7,
      maxGross: num(info && info.rules && info.rules.maxGross, 1),
      allowShort: !!(info && info.rules && info.rules.allowShort),
    };
    lastReb = -1e9;
  },
  onBar(state) {
    if (!state || !state.assets) return null;
    const due = state.step - lastReb >= CFG.interval;

    const { targets, note } = computeTargets(state);

    const pos = (state.portfolio && state.portfolio.positions) || {};
    const syms = new Set([...Object.keys(targets), ...Object.keys(pos)]);
    let maxDiff = 0;
    for (const s of syms) {
      const cur = pos[s] ? num(pos[s].weight, 0) : 0;
      maxDiff = Math.max(maxDiff, Math.abs((targets[s] || 0) - cur));
    }
    if (!due && maxDiff < 0.35) return null;

    lastReb = state.step;
    return { targets, note };
  },
};
