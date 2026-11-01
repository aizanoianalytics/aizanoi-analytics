'use strict';

// Cross-sectional, long-only trend/momentum allocator. Uses only information in state.
const bot = {
  name: 'Adaptive Trend Rotation',
  init(info) {
    this.maxGross = Number.isFinite(info?.rules?.maxGross) ? info.rules.maxGross : 1;
    this.previous = new Set();
    this.rebalanceEvery = info?.timeframe === '1h' ? 24 : info?.timeframe === '4h' ? 6 : 1;
  },
  onBar(state) {
    if (this.rebalanceEvery > 1 && state.step % this.rebalanceEvery !== 0) return null;
    const candidates = [];
    for (const [symbol, a] of Object.entries(state.assets || {})) {
      const f = a?.f || {};
      const r20 = f.ret20, r60 = f.ret60, r120 = f.ret120;
      const d50 = f.distSma50, d200 = f.distSma200;
      if (![r20, r60, d50].every(Number.isFinite)) continue;
      // Favor persistent medium-term winners; require an intact intermediate trend.
      if (r20 <= 0 || r60 <= 0 || d50 <= 0) continue;
      if (Number.isFinite(d200) && d200 < -0.08) continue;
      const vol = Number.isFinite(f.vol20) && f.vol20 > 0.08 ? f.vol20 : 0.8;
      const rank = [f.rank_ret20, f.rank_ret60, f.rank_ret120].filter(Number.isFinite);
      const rankBonus = rank.length ? rank.reduce((x, y) => x + y, 0) / rank.length : 0.5;
      const mom = 0.20 * Math.log1p(Math.max(-0.95, r20)) +
        0.45 * Math.log1p(Math.max(-0.95, r60)) +
        0.35 * Math.log1p(Math.max(-0.95, Number.isFinite(r120) ? r120 : r60));
      const trend = Math.min(0.15, Math.max(-0.15, d50)) +
        (Number.isFinite(d200) ? 0.35 * Math.min(0.2, Math.max(-0.2, d200)) : 0);
      const score = (mom + trend + 0.08 * (rankBonus - 0.5)) / Math.sqrt(vol);
      // Modest incumbent preference reduces rank churn and transaction costs.
      const adjusted = score * (this.previous?.has(symbol) ? 1.12 : 1);
      if (Number.isFinite(adjusted) && adjusted > 0) candidates.push({ symbol, score: adjusted, vol });
    }
    candidates.sort((a, b) => b.score - a.score);

    // A broad trend failure is a reason to hold cash, rather than force exposure.
    const breadth = state.market?.breadth50;
    let gross = this.maxGross;
    if (Number.isFinite(breadth) && breadth < 0.30) gross *= 0.35;
    else if (Number.isFinite(breadth) && breadth < 0.45) gross *= 0.65;

    const chosen = candidates.slice(0, 4);
    if (!chosen.length || gross <= 0) {
      const wasInvested = this.previous.size > 0;
      this.previous = new Set();
      return wasInvested ? { targets: {}, note: 'Trend filter defensive; holding cash' } : null;
    }
    // Inverse-volatility weights, clipped so one volatile asset cannot dominate.
    const raw = chosen.map(x => Math.min(1 / Math.sqrt(x.vol), 2.5));
    const total = raw.reduce((s, x) => s + x, 0);
    const targets = {};
    for (let i = 0; i < chosen.length; i++) {
      targets[chosen[i].symbol] = gross * raw[i] / total;
    }
    const next = new Set(chosen.map(x => x.symbol));
    const changed = next.size !== this.previous.size || [...next].some(x => !this.previous.has(x));
    if (!changed) return null; // Let winners run; avoid paying to rebalance every bar.
    this.previous = next;
    return { targets, note: `Rotating into ${[...next].join(', ')}` };
  }
};

module.exports = bot;
