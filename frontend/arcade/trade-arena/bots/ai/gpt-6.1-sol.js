'use strict';

// Cross-sectional, absolute-momentum rotation. All inputs are causal and unit-free.
let config, metadata, lastRebalance;
const finite = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const val = (x, fallback = 0) => finite(x) ? x : fallback;

module.exports = {
  name: 'Adaptive Momentum Rotation',
  init(info) {
    config = info;
    metadata = Object.fromEntries(info.assets.map(a => [a.symbol, a]));
    lastRebalance = -100000;
  },
  onBar(state) {
    const daily = config.timeframe === '1d';
    const cadence = daily ? 5 : config.timeframe === '4h' ? 18 : 72;
    const positions = state.portfolio.positions;
    const groups = {};
    const stopped = new Set();
    let emergency = false;
    for (const [symbol, a] of Object.entries(state.assets)) {
      const f = a.f;
      const market = metadata[symbol]?.market || 'crypto';
      const g = groups[market] || (groups[market] = { n: 0, up: 0, long: 0 });
      if (finite(f.ret60) && finite(f.distSma50)) {
        g.n++;
        g.up += f.distSma50 > 0 ? 1 : 0;
        g.long += val(f.distSma200, f.distSma50) > 0 ? 1 : 0;
      }
      if (val(positions[symbol]?.weight) < 0.015 || !a.tradable) continue;
      const threshold = Math.max(daily ? 0.025 : 0.012, 1.6 * val(f.atrPct, 0.02));
      if (val(f.distSma50) < -threshold || (val(f.ret20) < -2.5 * threshold && val(f.distSma20) < 0)) {
        stopped.add(symbol);
        emergency = true;
      }
    }
    for (const g of Object.values(groups)) {
      const breadth = g.n ? g.long / g.n : 0.5;
      const fast = g.n ? g.up / g.n : 0.5;
      g.risk = daily ? clamp((breadth - 0.16) / 0.34, 0.10, 1) * clamp((fast + 0.25) / 0.65, 0.45, 1)
        : clamp((breadth - 0.10) / 0.45, 0.20, 1);
    }
    if (state.step - lastRebalance < cadence) {
      if (!emergency) return null;
      // Intraday stops exit broken trends without rotating all other holdings.
      // Daily stops warrant re-evaluating the entire opportunity set below.
      if (!daily) {
        const targets = {};
        let gross = 0;
        for (const [symbol, position] of Object.entries(positions)) {
          if (!stopped.has(symbol) && finite(position.weight) && position.weight > 0) {
            targets[symbol] = position.weight;
            gross += position.weight;
          }
        }
        if (gross > config.rules.maxGross) {
          for (const symbol of Object.keys(targets)) targets[symbol] *= config.rules.maxGross / gross;
        }
        return { targets, note: 'Exit broken trends; preserve other holdings' };
      }
    }

    const candidates = [];
    for (const [symbol, a] of Object.entries(state.assets)) {
      const f = a.f;
      if (stopped.has(symbol) || !f || !finite(a.bar.c) || a.bar.c <= 0 || !finite(f.ret60)) continue;
      const market = metadata[symbol]?.market || 'crypto';
      const r20 = val(f.ret20);
      const r60 = f.ret60;
      const r120 = val(f.ret120, r60);
      const d50 = val(f.distSma50);
      const d200 = finite(f.distSma200) ? f.distSma200 : d50;
      const held = val(positions[symbol]?.weight) > 0.02;
      const trend = a.bar.c / val(f.sma100, val(f.sma50, a.bar.c)) - 1;
      const atr = val(f.atrPct, 0.025);
      if (trend < (held ? -0.5 * atr : 0) || r60 < (held ? 0 : 0.01)) continue;
      if (d50 < -Math.max(0.02, atr) || (d200 < -0.04 && r20 < 0)) continue;
      const vol = Math.max(0.15, val(f.vol60, val(f.vol20, 0.5)));
      const momentum = 0.25 * Math.log1p(Math.max(-0.95, r20)) +
        0.45 * Math.log1p(Math.max(-0.95, r60)) +
        0.30 * Math.log1p(Math.max(-0.95, r120));
      const score = momentum / Math.pow(vol, 0.4) + (held ? 0.035 : 0);
      if (score <= 0) continue;
      candidates.push({ symbol, score, vol, market });
    }
    candidates.sort((a, b) => b.score - a.score);
    const markets = Object.keys(groups);
    const chosen = [];
    const targets = {};
    const gross = Math.min(val(config.rules.maxGross, 1), 1.35);
    // Separate sleeves keep incomparable crypto and stock return scales from
    // allowing one market to crowd the other out of mixed races.
    for (const market of markets) {
      const count = Math.min(5, Math.max(1, Math.ceil(groups[market].n / (daily ? 10 : 7))));
      const pool = candidates.filter(c => c.market === market);
      const selected = pool.slice(0, count);
      chosen.push(...selected);
      const deployment = gross / markets.length * Math.min(1, pool.length / Math.min(count, 3));
      let total = 0;
      for (const c of selected) { c.raw = 1 / Math.pow(c.vol, 0.35); total += c.raw; }
      for (const c of selected) {
        const risk = groups[market].risk;
        const volScale = daily ? Math.min(1, (market === 'crypto' ? 1.5 : 1.0) / c.vol) : 1;
        targets[c.symbol] = deployment * c.raw / total * risk * volScale;
      }
    }

    let difference = 0;
    for (const s of new Set([...Object.keys(positions), ...Object.keys(targets)])) {
      difference += Math.abs(val(targets[s]) - val(positions[s]?.weight));
    }
    lastRebalance = state.step;
    const fullExit = Object.keys(targets).length === 0 && Object.keys(positions).length > 0;
    if (!fullExit && difference < (emergency ? 0.015 : 0.10)) return null;
    return { targets, note: chosen.length ? 'Relative strength, breadth-adjusted exposure' : 'No qualifying uptrends; preserve cash' };
  }
};
