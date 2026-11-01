'use strict';

// Cross-sectional momentum with a trend filter and buffered, infrequent rotation.
let config = {};
let previous = [];
module.exports = {
  name: 'Adaptive Momentum Basket',
  init(info) {
    config = { interval: info.timeframe === '1d' ? 5 : info.timeframe === '4h' ? 24 : 72,
      gross: Math.min(1, info.rules.maxGross || 1) };
    previous = [];
  },
  onBar(state) {
    if (state.step % config.interval !== 0) return null;
    const candidates = [];
    const riskOff = Number.isFinite(state.market.breadth50) && state.market.breadth50 < 0.35;
    for (const [symbol, asset] of Object.entries(state.assets)) {
      if (riskOff) break;
      const f = asset.f || {};
      if (!asset.bar || !Number.isFinite(f.ret60) || !Number.isFinite(f.ret20) ||
          !Number.isFinite(f.distSma50) || !Number.isFinite(f.vol60)) continue;
      if (f.ret60 <= 0 || f.distSma50 <= 0) continue;
      // Combining horizons reduces dependence on a single recent price move.
      const r120 = Number.isFinite(f.ret120) ? f.ret120 : f.ret60;
      const score = 0.5 * f.ret60 + 0.3 * r120 + 0.2 * f.ret20;
      candidates.push({symbol, score: score + (previous.includes(symbol) ? 0.025 : 0)});
    }
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates.slice(0, 4).map(x => x.symbol);
    if (selected.length === previous.length && selected.every(s => previous.includes(s))) return null;
    previous = selected;
    const targets = {};
    for (const symbol of selected) targets[symbol] = config.gross / selected.length;
    return {targets};
  }
};
