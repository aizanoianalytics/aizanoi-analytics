// TrendCrew: concentrated cross-sectional trend/momentum. Holds the strongest
// in-trend assets until momentum or trend breaks; no rebalancing churn. Cuts
// exposure by breadth/VIX/drawdown; shorts the weakest broken-trend assets
// when long/short is allowed.
module.exports = {
  name: 'TrendCrew',
  init(info) {
    const r = info.rules || {};
    this.maxGross = Math.max(1, Number(r.maxGross) || 1);
    this.shortAllowed = !!r.allowShort;
    this.rebN = { '1h': 60, '4h': 30, '1d': 15 }[info.timeframe] || 15;
    this.minHold = { '1h': 24, '4h': 6, '1d': 3 }[info.timeframe] || 3;
    this.lastReb = -999;
    this.peak = Number(r.cash) || 100000;
    this.entryStep = {};
  },
  fin(x) { return Number.isFinite(x); },
  score(a) {
    const f = a.f || {};
    let s = this.fin(f.rank_ret60) ? f.rank_ret60 : 0.5;
    if (this.fin(f.ret20)) s += Math.tanh(f.ret20 * 4) * 0.15;
    if (this.fin(f.rsi14) && f.rsi14 > 85) s -= 0.25;
    if (this.fin(f.volRatio) && f.volRatio > 4) s -= 0.15;
    return s;
  },
  trendOk(a) {
    const f = a.f || {};
    return f.distSma200 > -0.08 || f.supertrendDir === 1 || f.psarDir === 1;
  },
  onBar(state) {
    const { assets, market, portfolio, step, context } = state;
    const equity = this.fin(portfolio.equity) ? portfolio.equity : this.peak;
    if (equity > this.peak) this.peak = equity;
    const dd = this.peak > 0 ? (this.peak - equity) / this.peak : 0;
    const pos = portfolio.positions || {};
    const cur = {};
    for (const s of Object.keys(pos)) {
      const w = pos[s].weight;
      if (this.fin(w)) cur[s] = w;
    }

    const rebalance = step - this.lastReb >= this.rebN || step === 0;
    let targets = {};
    let note = '';
    let traded = false;

      if (rebalance) {
        this.lastReb = step;

      const cands = [];
      for (const s of Object.keys(assets)) {
        const a = assets[s];
        if (!a || !a.tradable) continue;
        const sc = this.score(a);
        if (!this.fin(sc)) continue;
        cands.push({ s, sc, trend: this.trendOk(a) });
      }
      cands.sort((x, y) => y.sc - x.sc);
      const n = cands.length;
      const posOf = {};
      cands.forEach((x, i) => { x.index = i; posOf[x.s] = i; });

      const N = Math.max(2, Math.floor(n * 0.2));
      const M = this.shortAllowed ? Math.max(1, Math.floor(n * 0.15)) : 0;

      let scalar = 1.0;
      if (market && this.fin(market.breadth50)) {
        scalar *= market.breadth50 < 0.35 ? 0.5 : market.breadth50 < 0.55 ? 0.75 : 1;
      }
      if (context && this.fin(context.vix) && context.vix > 28) scalar *= 0.6;
      if (dd > 0.12) scalar *= 0.5;
      if (dd > 0.25) scalar *= 0.3;
      if (dd > 0.50) scalar *= 0.1;

      const longBudget = this.shortAllowed ? this.maxGross * 0.6 : this.maxGross * 0.92;
      const shortBudget = this.shortAllowed ? this.maxGross * 0.35 : 0;

      const isLongEnter = x => x.index < N && x.sc >= 0.55 && x.trend;
      const isLongKeep = x => x.index < N * 1.6 && x.sc >= 0.35 && x.trend;
      const isShortEnter = x => this.shortAllowed && n - 1 - x.index < M && x.sc <= 0.45 && !x.trend;
      const isShortKeep = x => this.shortAllowed && n - 1 - x.index < M * 1.6 && x.sc <= 0.65 && !x.trend;

      const longW = N ? (longBudget * scalar) / N : 0;
      const shortW = M ? -(shortBudget * scalar) / M : 0;
      if (step < 3) console.log('DBG step', step, 'n', n, 'N', N, 'M', M, 'scalar', scalar, 'longW', longW, 'top', cands.slice(0, 8).map(x => `${x.s}:${x.sc.toFixed(2)}:${x.trend ? 1 : 0}:${x.index}`).join(','));

      const wantLong = {}, wantShort = {};
      for (const x of cands) {
        if (isLongEnter(x) || isLongKeep(x)) wantLong[x.s] = longW;
        if (isShortEnter(x) || isShortKeep(x)) wantShort[x.s] = shortW;
      }

      const allSyms = new Set([...Object.keys(cur), ...Object.keys(wantLong), ...Object.keys(wantShort)]);
      for (const s of allSyms) {
        const c = cur[s] ?? 0;
        const held = Math.abs(c) > 1e-9;
        const longing = c > 0;
        const inLong = this.fin(wantLong[s]);
        const inShort = this.fin(wantShort[s]);
        if (!held) {
          if (inLong) {
            if (step - (this.entryStep[s] || -999) >= this.minHold) {
              targets[s] = wantLong[s]; traded = true; this.entryStep[s] = step;
            }
          } else if (inShort) {
            if (step - (this.entryStep[s] || -999) >= this.minHold) {
              targets[s] = wantShort[s]; traded = true; this.entryStep[s] = step;
            }
          }
        } else if (longing && !inLong) {
          traded = true; delete this.entryStep[s]; // exit long
        } else if (!longing && !inShort) {
          traded = true; delete this.entryStep[s]; // exit short
        } else if (held) {
          targets[s] = c; // hold, no churn
        }
      }
      if (traded) {
        const ls = Object.keys(targets).filter(s => targets[s] > 0);
        const ss = Object.keys(targets).filter(s => targets[s] < 0);
        const parts = [];
        if (ls.length) parts.push('L:' + ls.join(','));
        if (ss.length) parts.push('S:' + ss.join(','));
        if (!parts.length) parts.push('Cash');
        note = parts.join(' | ') + ` (DD ${(dd * 100).toFixed(0)}%)`;
        if (note.length > 140) note = note.slice(0, 137) + '...';
      }
    } else {
      for (const s of Object.keys(cur)) targets[s] = cur[s];
    }

    if (!traded) return null;
    return { targets, note };
  }
};
