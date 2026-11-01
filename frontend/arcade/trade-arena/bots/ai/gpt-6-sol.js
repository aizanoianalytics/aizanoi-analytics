'use strict';

// Trade Arena: cross-sectional, long-only trend and momentum rotation.
let universe = [];
let cadence = 5;
let lastDecision = -100000;
let maxGross = 1;
const valid = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

module.exports = {
  name: 'Adaptive Trend Rotation',
  init(info) {
    universe = info.assets.map(a => ({ symbol: a.symbol, market: a.market }));
    cadence = info.timeframe === '1d' ? 6 : info.timeframe === '4h' ? 18 : 48;
    maxGross = Math.min(1, info.rules.maxGross);
    lastDecision = -100000;
  },
  onBar(state) {
    const held = state.portfolio.positions;
    const mixed = universe.some(a => a.market === 'crypto') && universe.some(a => a.market === 'stocks');
    const cryptoDaily = cadence === 6 && universe.some(a => a.market === 'crypto');
    const cryptoSymbols = (mixed || cryptoDaily) ? universe.filter(x => x.market === 'crypto' && state.assets[x.symbol]) : [];
    const cryptoFastTrend = cryptoSymbols.map(x => state.assets[x.symbol].f.distSma50).filter(valid);
    const cryptoBreadth50 = cryptoFastTrend.length ? cryptoFastTrend.filter(x => x > 0).length / cryptoFastTrend.length : 1;
    // Reassess immediately on an adverse trend break, otherwise avoid costs.
    let broken = false;
    for (const sym of Object.keys(held)) {
      const a = state.assets[sym];
      if (a && a.tradable && a.f && valid(a.f.distSma50) &&
          a.f.distSma50 < -0.085 && valid(a.f.ret20) && a.f.ret20 < -0.10) broken = true;
    }
    if (cryptoDaily && cryptoBreadth50 < 0.42 && cryptoSymbols.some(x => held[x.symbol])) broken = true;
    if (state.step - lastDecision < cadence && !broken) return null;
    lastDecision = state.step;
    const daily = cadence === 6;
    const entries = [];
    for (const asset of universe) {
      const a = state.assets[asset.symbol];
      if (!a || !a.f) continue;
      const f = a.f;
      const fast = daily ? f.ret20 : f.ret60;
      const medium = daily ? f.ret60 : f.ret120;
      const slow = daily ? f.ret120 : f.ret250;
      const trend = daily ? f.distSma50 : f.distSma200;
      if (!valid(fast) || !valid(medium) || !valid(trend) || !valid(f.vol20)) continue;
      // Require absolute momentum and an established rising price trend.
      if (medium <= 0 || trend <= 0 || (valid(slow) && slow < -0.18)) continue;
      const fscore = clamp(fast, -0.5, 1.5);
      const mscore = clamp(medium, -0.6, 2.5);
      const sscore = valid(slow) ? clamp(slow, -0.5, 3) : 0;
      const trendScore = clamp(trend, -0.3, 0.8);
      // Penalize excessive realized volatility slightly, without removing high-beta winners.
      const riskPenalty = 0.035 * Math.log(1 + Math.max(0, f.vol20));
      const score = 0.30 * fscore + 0.43 * mscore + 0.20 * sscore + 0.07 * trendScore - riskPenalty;
      if (score > 0.012) entries.push({ sym: asset.symbol, score, market: asset.market });
    }
    entries.sort((a, b) => b.score - a.score);
    // At most four names; avoid switching for near ties with existing holdings.
    const picks = mixed
      ? [...entries.filter(x => x.market === 'crypto').slice(0, 2),
         ...entries.filter(x => x.market === 'stocks').slice(0, 2)]
      : entries.slice(0, 4);
    if (!mixed && entries.length > 4) {
      const cutoff = picks[3].score;
      for (const item of entries.slice(4, 8)) {
        if (!held[item.sym] || item.score < cutoff * 0.84) continue;
        const replace = picks.findIndex(x => !held[x.sym] && x.score < item.score / 0.84);
        if (replace >= 0) picks[replace] = item;
      }
    }
    const targets = {};
    // Breadth of long-term trends distinguishes broad bear markets from
    // temporary pullbacks; preserve capital instead of chasing isolated rallies.
    const breadth = state.market.breadth200;
    let risk = valid(breadth) ? breadth < 0.32 ? 0 : breadth < 0.45 ? 0.5 : 1 : 1;
    if (cryptoDaily && !mixed) risk *= cryptoBreadth50 < 0.42 ? 0 : cryptoBreadth50 < 0.58 ? 0.5 : 1;
    if (picks.length && mixed) {
      const groups = {};
      for (const mk of ['crypto', 'stocks']) {
        const marketSymbols = universe.filter(x => x.market === mk && state.assets[x.symbol]);
        const trend = marketSymbols.map(x => state.assets[x.symbol].f.distSma200).filter(valid);
        const r60 = marketSymbols.map(x => state.assets[x.symbol].f.ret60).filter(valid);
        const b = trend.length ? trend.filter(x => x > 0).length / trend.length : 0;
        const strength = r60.length ? r60.reduce((s, x) => s + x, 0) / r60.length : 0;
        const fastRisk = mk === 'crypto' ? cryptoBreadth50 < 0.42 ? 0 : cryptoBreadth50 < 0.58 ? 0.5 : 1 : 1;
        groups[mk] = (b < 0.40 ? 0 : b < 0.55 ? 0.5 : 1) * fastRisk *
          clamp(1 + 2 * strength, 0.65, 1.5) * (picks.some(x => x.market === mk) ? 1 : 0);
      }
      const groupTotal = groups.crypto + groups.stocks;
      if (groupTotal) {
        for (const mk of ['crypto', 'stocks']) {
          const subset = picks.filter(x => x.market === mk);
          if (!subset.length || !groups[mk]) continue;
          const totalScore = subset.reduce((sum, x) => sum + Math.sqrt(Math.max(0.015, x.score)), 0);
          for (const x of subset) {
            const weight = maxGross * groups[mk] / groupTotal *
              Math.sqrt(Math.max(0.015, x.score)) / totalScore;
            targets[x.sym] = Math.min(subset.length === 1 ? 1 : 0.50, weight);
          }
        }
      }
    } else if (picks.length) {
      // Momentum concentration, bounded to control single-name crashes.
      const power = picks.map(x => Math.sqrt(Math.max(0.015, x.score)));
      const total = power.reduce((a, b) => a + b, 0);
      for (let i = 0; i < picks.length; i++) {
        const cap = picks.length === 1 ? 1 : picks.length === 2 ? 0.60 : 0.48;
        const weight = Math.min(cap, risk * maxGross * power[i] / total);
        targets[picks[i].sym] = weight;
      }
      // Remaining fraction stays cash when a position is capped.
    }
    // No rebalancing if current holdings are already close to the desired allocation.
    const keys = new Set([...Object.keys(held), ...Object.keys(targets)]);
    let turnover = 0;
    for (const sym of keys) turnover += Math.abs((held[sym]?.weight || 0) - (targets[sym] || 0));
    if (turnover < 0.11) return null;
    return { targets, note: Object.keys(targets).length ? 'Following relative strength with trend protection' : 'No qualifying uptrends; holding cash' };
  }
};
