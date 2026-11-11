// Flavius Tide — regime-aware cross-sectional trend follower.
// Long the strongest risk-adjusted trends, short the weakest when allowed and the tide is out,
// inverse-volatility sizing, exposure scaled to market regime, slow rebalancing with drift hysteresis.
const ok = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const g = (f, k, d = 0) => (f && ok(f[k]) ? f[k] : d);

let every = 5, last = -1e9, sectorOf = {}, rules = {}, ppy = 365, isIntraday = false, lastNote = '';

function regime(state) {
  const m = state.market || {}, c = state.context || {};
  let s = 0.5;
  if (ok(m.breadth50)) s = m.breadth50;
  if (ok(m.breadth200)) s = 0.55 * s + 0.45 * m.breadth200;
  if (ok(m.ewRet20)) s += clamp(m.ewRet20 * 1.5, -0.15, 0.15);
  if (ok(c.spyDistSma200)) s += c.spyDistSma200 > 0 ? 0.05 : -0.08;
  if (ok(c.vix)) s -= c.vix > 32 ? 0.15 : c.vix > 24 ? 0.06 : 0;
  if (ok(c.spyRet20) && c.spyRet20 < -0.08) s -= 0.08;
  return clamp(s, 0, 1);
}

function longScore(f, held) {
  let sc = 0.55 * g(f, 'rank_ret60', 0.5) + 0.25 * g(f, 'rank_ret20', 0.5)
    + 0.1 * g(f, 'rank_sharpe60', 0.5) + 0.1 * g(f, 'rank_ret120', 0.5);
  if (g(f, 'supertrendDir') > 0) sc += 0.06;
  if (g(f, 'sma50over200') > 0) sc += 0.05;
  if (g(f, 'adx14') > 25 && g(f, 'plusDI14') > g(f, 'minusDI14')) sc += 0.04;
  const rsi = g(f, 'rsi14', 50);
  if (rsi > 82) sc -= 0.15;          // blow-off tops
  if (g(f, 'distSma20') > 0.25) sc -= 0.1; // too extended
  if (held) sc += 0.08;              // incumbents stay unless clearly beaten
  return sc;
}

function shortScore(f, held) {
  let sc = 0.35 * (1 - g(f, 'rank_ret60', 0.5)) + 0.2 * (1 - g(f, 'rank_ret20', 0.5))
    + 0.3 * (1 - g(f, 'rank_sharpe60', 0.5)) + 0.15 * (1 - g(f, 'rank_ret120', 0.5));
  if (g(f, 'supertrendDir') < 0) sc += 0.06;
  if (g(f, 'sma50over200') < 0) sc += 0.05;
  const rsi = g(f, 'rsi14', 50);
  if (rsi < 22) sc -= 0.15;          // oversold, bounce risk
  if (g(f, 'distSma20') < -0.25) sc -= 0.1;
  if (held) sc += 0.08;
  return sc;
}

function volOf(f) {
  const v = ok(f.vol60) ? f.vol60 : ok(f.vol20) ? f.vol20 : ok(f.atrPct) ? f.atrPct * Math.sqrt(ppy) : 0.6;
  return Math.max(0.08, v);
}

module.exports = {
  name: 'Flavius Tide',
  init(info) {
    rules = (info && info.rules) || {};
    ppy = (info && info.periodsPerYear) || 365;
    isIntraday = info && info.timeframe !== '1d';
    every = clamp(Math.round(ppy / 70), 3, 150);
    sectorOf = {};
    for (const a of (info && info.assets) || []) sectorOf[a.symbol] = a.sector || a.market || 'other';
  },
  onBar(state) {
    const A = state.assets || {}, P = state.portfolio || {}, pos = P.positions || {};
    const allowShort = !!rules.allowShort, maxGross = Math.max(1, rules.maxGross || 1);

    // Every bar: check held positions for broken trends / stops.
    const broken = [];
    for (const s in pos) {
      const a = A[s]; if (!a || !a.f) continue;
      const f = a.f, p = pos[s], isShort = p.side === 'short' || p.qty < 0;
      const atr = g(f, 'atrPct', 0.03);
      const stop = clamp(atr * (isIntraday ? 14 : 5), 0.1, 0.35);
      if (!isShort) {
        if (ok(p.pnlPct) && p.pnlPct < -stop) broken.push(s);
        else if (g(f, 'supertrendDir') < 0 && g(f, 'distSma50') < -0.1) broken.push(s);
      } else {
        if (ok(p.pnlPct) && p.pnlPct < -stop) broken.push(s);
        else if (g(f, 'supertrendDir') > 0 && g(f, 'distSma50') > 0.1) broken.push(s);
      }
    }
    const isLast = state.step >= state.steps - 1;
    if (!broken.length && !isLast && state.step - last < every) return null;
    last = state.step;
    const brokenSet = new Set(broken);

    const r = regime(state);
    const m = state.market || {};
    const bear = r < 0.3 && (ok(m.ewRet20) ? m.ewRet20 < 0 : true);

    // ---- long book ----
    const longs = [];
    for (const s in A) {
      const a = A[s], f = a.f; if (!f) continue;
      if (!a.tradable && !pos[s]) continue;
      if (brokenSet.has(s)) continue;
      if (!ok(f.ret60) || !ok(f.ret20)) continue;
      if (f.ret60 <= 0) continue;
      const up200 = ok(f.distSma200) ? f.distSma200 > 0 : g(f, 'distSma50') > 0;
      if (!up200 || g(f, 'distSma50') < -0.03) continue;
      if (g(f, 'rank_dollarVolume', 1) < 0.1) continue; // illiquid tail
      longs.push({ s, score: longScore(f, pos[s] && pos[s].qty > 0), vol: volOf(f), sector: sectorOf[s] || 'other' });
    }
    longs.sort((x, y) => y.score - x.score);
    const nLong = clamp(Math.round(Object.keys(A).length / 6), 4, 6);
    const lBook = [], perSec = {};
    for (const p of longs) {
      if (lBook.length >= nLong) break;
      if ((perSec[p.sector] || 0) >= Math.ceil(nLong * 0.67)) continue;
      perSec[p.sector] = (perSec[p.sector] || 0) + 1;
      lBook.push(p);
    }

    // Long exposure: 0.25 .. 1 of maxGross-adjusted budget, scaled by regime.
    // full sail whenever the tide is at least neutral; shrink quickly below that
    let longExp = r >= 0.35 ? 0.98 : clamp(0.3 + r * 1.95, 0.25, 0.98);
    if (lBook.length < nLong) longExp *= lBook.length / nLong + 0.3 * (1 - lBook.length / nLong);
    // mild leverage only in strong regimes when the race allows it
    if (maxGross > 1 && r > 0.75) longExp *= Math.min(maxGross, 1.25);

    // ---- short book ----
    const sBook = [];
    let shortExp = 0;
    if (allowShort && r < 0.45) {
      const shorts = [];
      for (const s in A) {
        const a = A[s], f = a.f; if (!f) continue;
        if (!a.tradable && !pos[s]) continue;
        if (brokenSet.has(s)) continue;
        if (!ok(f.ret60) || !ok(f.ret20) || f.ret60 >= 0) continue;
        const down200 = ok(f.distSma200) ? f.distSma200 < 0 : g(f, 'distSma50') < 0;
        if (!down200 || g(f, 'distSma50') > 0.03) continue;
        if (g(f, 'rank_dollarVolume', 1) < 0.1) continue;
        if (g(f, 'ret5') < -0.18) continue; // already capitulated this week
        shorts.push({ s, score: shortScore(f, pos[s] && pos[s].qty < 0), vol: volOf(f), sector: sectorOf[s] || 'other' });
      }
      shorts.sort((x, y) => y.score - x.score);
      const perSecS = {};
      const nShort = clamp(Math.round(Object.keys(A).length / 8), 3, 6);
      for (const p of shorts) {
        if (sBook.length >= nShort) break;
        if ((perSecS[p.sector] || 0) >= 2) continue;
        if (lBook.some(q => q.s === p.s)) continue;
        perSecS[p.sector] = (perSecS[p.sector] || 0) + 1;
        sBook.push(p);
      }
      // bearishness 0..1 → short exposure up to 0.6 of equity (more with leverage)
      const bearish = clamp((0.45 - r) / 0.45, 0, 1);
      shortExp = bearish * (bear ? 0.6 : 0.35) * Math.min(maxGross, 1.5);
      if (sBook.length < nShort) shortExp *= sBook.length / nShort;
    }

    // ---- weights ----
    const targets = {};
    const invW = (book, exp, cap, sign) => {
      if (!book.length || exp <= 0) return;
      let inv = 0; for (const p of book) inv += 1 / p.vol;
      let total = 0;
      for (const p of book) { p.w = Math.min(cap, exp * (1 / p.vol) / inv); total += p.w; }
      // redistribute what the cap removed, once
      if (total < exp * 0.98) {
        const room = book.filter(p => p.w < cap); let inv2 = 0; for (const p of room) inv2 += 1 / p.vol;
        const extra = exp - total;
        for (const p of room) p.w = Math.min(cap, p.w + extra * (1 / p.vol) / inv2);
      }
      for (const p of book) targets[p.s] = (targets[p.s] || 0) + sign * p.w;
    };
    for (const p of lBook) p.vol = Math.sqrt(p.vol); // half-way between inverse-vol and equal weight
    invW(lBook, longExp, 0.3, 1);
    invW(sBook, shortExp, 0.15, -1);

    // Respect gross limit
    let gross = 0; for (const k in targets) gross += Math.abs(targets[k]);
    if (gross > maxGross) for (const k in targets) targets[k] *= maxGross / gross;

    // ---- hysteresis: trade only when the book moved enough ----
    let drift = 0;
    const keys = new Set([...Object.keys(targets), ...Object.keys(pos)]);
    for (const k of keys) drift += Math.abs((targets[k] || 0) - ((pos[k] && ok(pos[k].weight)) ? pos[k].weight : 0));
    if (!broken.length && !isLast && drift < 0.2) return null;
    if (!Object.keys(targets).length) {
      if (!Object.keys(pos).length) return null;
      return { targets: {}, note: broken.length ? `Stopped out of ${broken.join(', ')}. Tide out, all cash.` : 'Nothing in an uptrend. All cash.' };
    }

    const ln = lBook.slice(0, 4).map(p => p.s).join(', ') + (lBook.length > 4 ? ` +${lBook.length - 4}` : '');
    const sn = sBook.length ? ` · short ${sBook.slice(0, 3).map(p => p.s).join(', ')}` : '';
    const pre = broken.length ? `Dropped ${broken.slice(0, 3).join(', ')}. ` : '';
    const note = `${pre}Long ${ln || 'none'}${sn} · ${Math.round(r * 100)}% tide`;
    const out = { targets };
    if (note !== lastNote) { out.note = note.slice(0, 140); lastNote = note; }
    return out;
  }
};
