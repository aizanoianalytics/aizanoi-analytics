let every = 5, last = -999, held = {};
const ok = Number.isFinite;
module.exports = {
  name: 'Trend Keeper',
  init(info) {
    every = Math.max(3, Math.round(info.periodsPerYear / 70));
  },
  onBar(state) {
    const A = state.assets, pos = state.portfolio.positions || {};
    // risk exit check every bar: held asset breaking trend
    let forced = false;
    for (const s in pos) {
      const a = A[s]; if (!a) continue;
      const f = a.f;
      if (ok(f.sma50) && f.distSma50 < -0.05) forced = true;
    }
    if (!forced && state.step - last < every) return null;
    last = state.step;
    const cands = [];
    for (const s in A) {
      const a = A[s], f = a.f;
      if (!a.tradable && !pos[s]) continue;
      const trend = ok(f.sma200) ? f.distSma200 > 0 : (ok(f.sma100) ? f.distSma50 > 0 && a.bar.c > f.sma100 : ok(f.sma50) && f.distSma50 > 0);
      if (!trend || !ok(f.ret60) || !ok(f.ret20)) continue;
      if (f.supertrendDir < 0 && !pos[s]) continue;
      if (f.distSma50 < 0) continue;
      let sc = (ok(f.rank_ret60) ? f.rank_ret60 : 0.5) * 0.5 + (ok(f.rank_ret20) ? f.rank_ret20 : 0.5) * 0.3 + (ok(f.rank_sharpe60) ? f.rank_sharpe60 : 0.5) * 0.2;
      if (pos[s]) sc += 0.15; // hysteresis
      if (f.ret60 <= 0) continue;
      cands.push([s, sc, Math.max(0.1, ok(f.vol60) ? f.vol60 : (ok(f.vol20) ? f.vol20 : 0.5))]);
    }
    cands.sort((x, y) => y[1] - x[1]);
    const top = cands.slice(0, 6);
    const m = state.market;
    let expo = 0.97;
    if (ok(m.breadth50)) expo *= Math.max(0, Math.min(1, (m.breadth50 - 0.15) * 2.5));
    if (!top.length) {
      if (Object.keys(pos).length) return { targets: {}, note: 'No clean trends. Sitting in cash.' };
      return null;
    }
    let tw = 0; for (const c of top) tw += 1 / c[2];
    const targets = {};
    for (const c of top) targets[c[0]] = Math.min(0.3, expo * (1 / c[2]) / tw);
    // avoid churn: skip if change is tiny
    let diff = 0; const keys = new Set([...Object.keys(targets), ...Object.keys(pos)]);
    for (const k of keys) diff += Math.abs((targets[k] || 0) - ((pos[k] && pos[k].weight) || 0));
    if (diff < 0.2 && !forced) return null;
    return { targets, note: 'Riding ' + top.map(c => c[0]).slice(0, 4).join(', ') + ' (exp ' + Math.round(expo * 100) + '%)' };
  }
};
