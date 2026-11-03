// House bot (not an AI-model entry): rebuilds a diversified basket from the current market state.
// Every ~2 weeks it reads the regime (breadth, average trend, SPY/VIX when present), picks up to 8
// assets with the best risk-adjusted momentum that are still in an uptrend, weights them by inverse
// volatility (max 20 % each, max 3 per sector) and scales total exposure to the regime.
// A held asset that breaks 8 % below its 50-bar average is dropped at the next bar.
const ok = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
let every = 10, last = -1e9, sectorOf = {};

function regime(state) {
  const m = state.market || {}, c = state.context || {};
  let score = 0.5;
  if (ok(m.breadth50)) score = m.breadth50;
  if (ok(m.breadth200)) score = 0.6 * score + 0.4 * m.breadth200;
  if (ok(m.ewRet20)) score += clamp(m.ewRet20 * 2, -0.15, 0.15);
  if (ok(c.spyDistSma200)) score += c.spyDistSma200 > 0 ? 0.05 : -0.1;
  if (ok(c.vix)) score -= c.vix > 30 ? 0.2 : c.vix > 22 ? 0.07 : 0;
  // 0 → defensive (20 % invested), 1 → fully invested (95 %)
  return clamp(0.2 + (score - 0.2) * 1.25, 0.2, 0.95);
}

module.exports = {
  name: 'Basket Builder',
  init(info) {
    every = Math.max(5, Math.round(info.periodsPerYear / 26));
    for (const a of info.assets) sectorOf[a.symbol] = a.sector || a.market;
  },
  onBar(state) {
    const A = state.assets, pos = state.portfolio.positions || {};
    let broken = null;
    for (const s in pos) {
      const f = A[s] && A[s].f;
      if (f && ok(f.distSma50) && f.distSma50 < -0.08) { broken = s; break; }
    }
    if (!broken && state.step - last < every) return null;
    last = state.step;

    const picks = [];
    for (const s in A) {
      const a = A[s], f = a.f;
      if (!a.tradable && !pos[s]) continue;
      if (s === broken) continue;
      if (!ok(f.ret60) || !ok(f.ret20) || f.ret60 <= 0) continue;
      const upTrend = ok(f.distSma200) ? f.distSma200 > 0 : ok(f.distSma50) && f.distSma50 > 0;
      if (!upTrend || (ok(f.distSma50) && f.distSma50 < -0.03)) continue;
      const vol = Math.max(0.08, ok(f.vol60) ? f.vol60 : ok(f.vol20) ? f.vol20 : 0.6);
      let score = (ok(f.rank_ret60) ? f.rank_ret60 : 0.5) * 0.45
        + (ok(f.rank_ret20) ? f.rank_ret20 : 0.5) * 0.25
        + (ok(f.rank_sharpe60) ? f.rank_sharpe60 : 0.5) * 0.3;
      if (ok(f.rsi14) && f.rsi14 > 80) score -= 0.1; // don't chase blow-off tops
      if (pos[s]) score += 0.1;                        // keep incumbents unless clearly beaten
      picks.push({ s, score, vol, sector: sectorOf[s] || 'other' });
    }
    picks.sort((x, y) => y.score - x.score);

    const basket = [], perSector = {};
    for (const p of picks) {
      if (basket.length >= 8) break;
      if ((perSector[p.sector] || 0) >= 3) continue;
      perSector[p.sector] = (perSector[p.sector] || 0) + 1;
      basket.push(p);
    }
    if (!basket.length) {
      return Object.keys(pos).length ? { targets: {}, note: 'No asset passes the trend filter. Basket empty, holding cash.' } : null;
    }

    const exposure = regime(state);
    let inv = 0; for (const p of basket) inv += 1 / p.vol;
    const targets = {};
    for (const p of basket) targets[p.s] = Math.min(0.2, exposure * (1 / p.vol) / inv);

    let drift = 0;
    for (const k of new Set([...Object.keys(targets), ...Object.keys(pos)])) drift += Math.abs((targets[k] || 0) - ((pos[k] && pos[k].weight) || 0));
    if (drift < 0.15 && !broken) return null;

    const names = basket.slice(0, 5).map(p => p.s).join(', ') + (basket.length > 5 ? ` +${basket.length - 5}` : '');
    return { targets, note: `${broken ? `Dropped ${broken}. ` : ''}Basket: ${names} · ${Math.round(exposure * 100)}% invested` };
  }
};
