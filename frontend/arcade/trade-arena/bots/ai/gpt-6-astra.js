'use strict';

// All horizons are approximate trading days, independent of symbol and price scale.
const PARAMS = { slow: 120, fast: 40, skip: 5, slots: 6, review: 7, regime: 1, stop: 1, volPower: 0.5, stick: 1.3, core: 0.75, coreVol: 0.5, long: 150, individual: 0 };
let cfg, books, nextReview;
const finite = Number.isFinite;
const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function add(b, price) {
  if (!(finite(price) && price > 0)) return;
  const old = b.prices.length ? b.prices[b.prices.length - 1] : price;
  const r = Math.log(price / old);
  b.variance += (r * r - b.variance) * (2 / (30 * b.day + 1));
  for (const [key, horizon] of [['fast', PARAMS.fast], ['slow', PARAMS.slow], ['long', PARAMS.long]]) {
    b[key] = b[key] ? b[key] + (price - b[key]) * (2 / (horizon * b.day + 1)) : price;
  }
  b.prices.push(price);
  if (b.prices.length > 125 * b.day + 2) b.prices.shift();
  b.count++;
}

function signal(b) {
  const p = b.prices, n = p.length - 1;
  if (n < 25) return null;
  const price = p[n], skip = Math.min(Math.round(PARAMS.skip * b.day), Math.floor(n / 5));
  const ret = days => Math.log(p[n - skip] / p[n - Math.min(n, Math.round(days * b.day))]);
  const dailyVol = Math.max(0.008, Math.sqrt(Math.max(b.variance, 0) * b.day));
  const r20 = Math.log(price / p[n - Math.min(n, 20 * b.day)]), r60 = ret(60), r120 = ret(120);
  const score = (0.55 * r60 + 0.45 * r120) / Math.pow(dailyVol, PARAMS.volPower);
  const eligible = price > b.slow && r60 > 0 && r20 > -2 * dailyVol;
  const exit = PARAMS.stop ? price < b.fast && r20 < -dailyVol : price < b.slow;
  return { score, eligible, exit, vol: dailyVol, above: price > b.long, market: b.market };
}

module.exports = {
  name: 'Breadth and Momentum Blend',
  init(info) {
    cfg = info;
    books = Object.create(null);

    nextReview = 0;
    for (const a of info.assets) {
      const day = info.timeframe === '1d' ? 1 : info.timeframe === '4h' ? (a.market === 'crypto' ? 6 : 2) : (a.market === 'crypto' ? 24 : 7);
      const b = books[a.symbol] = { market: a.market, day, prices: [], fast: 0, slow: 0, long: 0, variance: 0, count: 0 };
      for (const p of (info.history[a.symbol]?.c || [])) add(b, p);
    }
  },
  onBar(state) {
    const rows = [], all = [], groups = { crypto: {n:0,up:0}, stocks: {n:0,up:0} };
    let riskExit = false;
    const positions = state.portfolio.positions;
    for (const [sym, a] of Object.entries(state.assets)) {
      const b = books[sym];
      if (!b) continue;
      if (a.tradable) add(b, a.bar.c);
      const s = signal(b);
      if (!s) continue;
      groups[s.market].n++; groups[s.market].up += +s.above;
      all.push({sym,...s});
      const held = (positions[sym]?.weight || 0) > 0.005;
      if (held && s.exit && a.tradable && (positions[sym]?.weight || 0) > 0.07) riskExit = true;
      if ((s.eligible || (held && !s.exit && s.score > 0)) && !s.exit) rows.push({ sym, ...s, held });
    }
    const barsDay = cfg.timeframe === '1d' ? 1 : cfg.timeframe === '4h' ? (cfg.assets.some(a => a.market === 'crypto') ? 6 : 2) : (cfg.assets.some(a => a.market === 'crypto') ? 24 : 7);
    // Emergency exits are checked at most once per approximate trading day.
    if (state.step < nextReview && !(riskExit && state.step % barsDay === 0)) return null;
    nextReview = state.step + PARAMS.review * barsDay;
    rows.sort((a, b) => (b.score * (b.held ? PARAMS.stick : 1)) - (a.score * (a.held ? PARAMS.stick : 1)));
    const slots = Math.min(PARAMS.slots, cfg.assets.length);
    const selected = rows.slice(0, slots);
    const targets = {};
    const gross = Math.min(cfg.rules.maxGross, 1.25) * 0.99 * Math.min(1, selected.length / Math.min(3, cfg.assets.length));
    const total = selected.reduce((s, a) => s + Math.pow(a.vol, -0.35), 0);
    for (const a of selected) {
      const g = groups[a.market], breadth = g.n ? g.up / g.n : 0;
      const risk = PARAMS.regime ? clip((breadth - 0.1) / 0.5, a.market === 'crypto' ? 0 : 0.4, 1) : 1;
      targets[a.sym] = (1 - PARAMS.core) * gross * risk * Math.pow(a.vol, -0.35) / total;
    }
    const coreTotal = all.reduce((sum, a) => sum + Math.pow(a.vol, -PARAMS.coreVol), 0);
    for (const a of all) {
      const g = groups[a.market], breadth = g.n ? g.up / g.n : 0;
      const risk = PARAMS.regime ? clip((breadth - 0.1) / 0.5, a.market === 'crypto' ? 0 : 0.4, 1) : 1;
      // Blend market breadth with each constituent's own long trend. The broad
      // sleeve avoids having the whole portfolio chase a few recent winners.
      const coreRisk = 0.5 * risk + 0.5 * (a.above ? 1 : (a.market === 'stocks' ? 0.4 : 0));
      targets[a.sym] = (targets[a.sym] || 0) + PARAMS.core * 0.99 * Math.min(cfg.rules.maxGross, 1.25) * coreRisk * Math.pow(a.vol, -PARAMS.coreVol) / coreTotal;
      if (targets[a.sym] < 0.001) delete targets[a.sym];
    }
    // Let small drift ride rather than constantly paying for precise weights.
    const keys = new Set([...Object.keys(targets), ...Object.keys(positions)]);
    let difference = 0, membership = false;
    for (const k of keys) {
      difference += Math.abs((targets[k] || 0) - (positions[k]?.weight || 0));
      if (!!targets[k] !== !!positions[k]?.weight) membership = true;
    }
    if (difference < 0.12 && !membership) return null;
    return { targets, note: Object.keys(targets).length ? 'Broad trend exposure plus a small momentum-leader sleeve' : 'No positive trends: cash' };
  }
};
