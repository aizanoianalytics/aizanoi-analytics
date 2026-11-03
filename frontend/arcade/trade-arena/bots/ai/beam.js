module.exports = {
  name: 'TrendRider',
  init(info) {
    this.tf = info.timeframe;
    this.allowShort = !!info.rules.allowShort;
    this.maxGross = info.rules.maxGross || 1;
    this.last = -1e9;
    this.interval = info.timeframe === '1h' ? 24 : (info.timeframe === '4h' ? 12 : 5);
  },
  onBar(state) {
    const assets = state.assets;
    const syms = Object.keys(assets);
    if (!syms.length) return null;
    if (state.step !== state.steps - 1 && state.step - this.last < this.interval) return null;
    this.last = state.step;

    const m = state.market;
    const g = (x, d = 0) => Number.isFinite(x) ? x : d;
    const breadth200 = g(m.breadth200, 0.5);
    const ewRet20 = g(m.ewRet20, 0);
    const bull = breadth200 >= 0.55 && ewRet20 >= 0;
    const bear = breadth200 <= 0.4 || ewRet20 < -0.02;

    const rows = syms.map(s => {
      const f = assets[s].f;
      const score =
        g(f.rank_ret60, 0.5) * 0.30 +
        g(f.rank_ret20, 0.5) * 0.25 +
        g(f.rank_ret120, 0.5) * 0.15 +
        g(f.rank_sharpe60, 0.5) * 0.15 +
        g(f.rank_distSma50, 0.5) * 0.10 +
        (1 - g(f.rank_vol20, 0.5)) * 0.05;
      const trendOk = g(f.distSma200, 0) > 0 || g(f.sma50over200, 0) > 0;
      return { s, f, score, trendOk };
    });

    const K = Math.min(syms.length, syms.length > 50 ? 3 : 5);
    const allowShort = this.allowShort;
    const maxGross = this.maxGross;
    let targets = {};

    if (bull) {
      const cands = rows.filter(r => r.trendOk).sort((a, b) => b.score - a.score);
      const pick = (cands.length ? cands : rows.sort((a, b) => b.score - a.score)).slice(0, K);
      const gross = Math.min(maxGross, Math.max(0.95, maxGross*0.9));
      if (pick.length) {
        const w = gross / pick.length;
        for (const r of pick) targets[r.s] = w;
      }
    } else if (bear) {
      if (allowShort) {
        const cands = rows.filter(r => !r.trendOk).sort((a, b) => a.score - b.score);
        const pick = (cands.length ? cands : rows.sort((a, b) => a.score - b.score)).slice(0, K);
        const gross = Math.min(maxGross, Math.max(0.8, maxGross*0.8));
        if (pick.length) {
          const w = gross / pick.length;
          for (const r of pick) targets[r.s] = -w;
        }
      } else {
        if (breadth200 >= 0.35) {
          const pick = rows.sort((a, b) => b.score - a.score).slice(0, 3);
          const w = 0.5 / pick.length;
          for (const r of pick) targets[r.s] = w;
        }
      }
    } else {
      // sideways
      if (allowShort) {
        const longs = rows.filter(r => r.trendOk).sort((a, b) => b.score - a.score).slice(0, Math.max(2, Math.floor(K / 2)));
        const shorts = rows.filter(r => !r.trendOk).sort((a, b) => a.score - b.score).slice(0, Math.max(2, Math.floor(K / 2)));
        const gross = Math.min(maxGross, Math.max(0.6, maxGross*0.6));
        const half = gross / 2;
        if (longs.length) {
          const w = half / longs.length;
          for (const r of longs) targets[r.s] = w;
        }
        if (shorts.length) {
          const w = half / shorts.length;
          for (const r of shorts) targets[r.s] = (targets[r.s] || 0) - w;
        }
        if (!longs.length && !shorts.length) {
          const pick = rows.sort((a, b) => b.score - a.score).slice(0, 3);
          const w = 0.4 / pick.length;
          for (const r of pick) targets[r.s] = w;
        }
      } else {
        const pick = rows.filter(r => r.trendOk).sort((a, b) => b.score - a.score).slice(0, 3);
        const w = (pick.length ? 0.6 : 0) / (pick.length || 1);
        for (const r of pick) targets[r.s] = w;
      }
    }

    const note = bull ? 'Bull: long leaders' : (bear ? (allowShort ? 'Bear: short laggards' : 'Bear: cash/defensive') : 'Sideways: balanced');
    return { targets, note };
  }
};
