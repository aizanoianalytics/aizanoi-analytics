// Tidewalker: adaptive regime momentum, long + short.
//
// Every ~2 weeks it buys the strongest risk-adjusted momentum names in an
// uptrend (inverse-vol x conviction sized, concentrated when leadership is
// narrow, tilted to liquid leaders), scales exposure to a multi-signal
// regime gauge, and hides in cash when nothing qualifies. In long/short
// races it also shorts confirmed downtrends while the regime is fearful.
// Every bar it only runs cheap confirmed exits: a per-position stop, a
// market-crash gate and a portfolio trail stop. No latch-ups: every brake
// re-evaluates from current market state. Blind-safe throughout.
const ok = Number.isFinite;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

let EVERY = 10;
let ALLOW_SHORT = false;
let MAX_GROSS = 1;
let SECTOR = {};
let BLIND = false;
let FOCUS = false; // true when the universe has few real sectors: concentrate
let DAYBARS = 1; // bars per calendar day (1d->1, 4h->6, 1h->24 crypto)
let SQ = 1; // sqrt(DAYBARS): scales return thresholds across timeframes
let TRAILN = 12; // trail-stop lookback in bars (~12 calendar days)
let LAST = -1e12;
let TRAIL = []; // recent portfolio equities for the trail stop
let RHIST = []; // recent regime readings for exposure smoothing
let EXCLUDE = {}; // sym -> step until which it is excluded (stopped out)

function regime(state, stats) {
  const m = state.market || {};
  const c = state.context || {};
  const parts = [];
  // Fast breadth whipsaws on intraday bars; there use the slower breadth200.
  if (DAYBARS <= 6 && ok(m.breadth50)) parts.push([m.breadth50, 0.34]);
  if (ok(m.breadth200)) parts.push([m.breadth200, DAYBARS <= 6 ? 0.2 : 0.4]);
  if (ok(m.avgRsi14)) parts.push([clamp((m.avgRsi14 - 35) / 30, 0, 1), 0.2]);
  if (ok(m.ewRet20)) parts.push([clamp(0.5 + (m.ewRet20 * 2.5) / SQ, 0, 1), 0.26]);
  let wsum = 0, r = 0;
  for (const [v, w] of parts) { r += v * w; wsum += w; }
  r = wsum ? r / wsum : 0.5;
  if (ok(c.spyDistSma200)) r += c.spyDistSma200 > 0.03 ? 0.08 : c.spyDistSma200 < -0.03 ? -0.08 : 0;
  if (ok(c.spyRet20)) r += clamp(c.spyRet20 * 1.2, -0.08, 0.08);
  if (ok(c.vix)) r -= c.vix > 32 ? 0.2 : c.vix > 22 ? 0.08 : 0;
  if (ok(c.vixChg5)) r -= clamp(c.vixChg5 / 60, 0, 0.12);
  r = clamp(r, 0, 1);
  // Narrow-bull override: durable leadership + market not broadly falling +
  // benchmark not in a deep bear (avoids concentrating into bear rallies).
  // Daily bars only: on intraday timeframes 60-bar "leadership" is just
  // short-term heat, so no floor and no concentration there.
  const spyOK = !ok(c.spyDistSma200) || c.spyDistSma200 > -0.03;
  if (DAYBARS <= 2 && stats.durable && r < 0.55 && ok(m.ewRet20) && m.ewRet20 > -0.08 * SQ && spyOK) r = 0.55;
  return r;
}

function longScore(f, incumbent, r) {
  let s = 0.45 * (ok(f.rank_ret60) ? f.rank_ret60 : 0.5)
    + 0.17 * (ok(f.rank_ret20) ? f.rank_ret20 : 0.5)
    + 0.12 * (ok(f.rank_ret120) ? f.rank_ret120 : 0.5)
    + 0.1 * (ok(f.rank_sharpe60) ? f.rank_sharpe60 : 0.5)
    + 0.08 * (ok(f.rank_distSma50) ? f.rank_distSma50 : 0.5);
  // Blind-safe participation tilt: prefer names trading with their usual
  // activity (dead names and volume-spike manias both score worse).
  if (ok(f.rank_relVolume)) s += 0.08 * (0.5 + clamp(f.rank_relVolume - 0.5, -0.3, 0.2));
  // Size tilt (non-blind only): ranked dollar volume is meaningless once
  // prices are rebased, so this is disabled in blind races.
  if (!BLIND && ok(f.rank_dollarVolume)) s += 0.08 * (f.rank_dollarVolume - 0.5);
  if (ok(f.rsi14) && f.rsi14 > 82) s -= 0.1;
  if (ok(f.rsi14) && f.rsi14 < 18) s -= 0.05;
  if (ok(f.funding7d) && f.funding7d > 0) s -= clamp(f.funding7d * 120, 0, 0.12);
  if (ok(f.drawdown) && f.drawdown < -0.5) s -= 0.06;
  // Weak regime: shun high-beta (bear rallies are led by junk).
  if (r < 0.6 && ok(f.beta60) && f.beta60 > 1) s -= clamp((f.beta60 - 1) * 0.3, 0, 0.25);
  if (incumbent) s += 0.1;
  return s;
}

function shortScore(f, incumbent) {
  let s = 0.4 * (ok(f.rank_ret60) ? 1 - f.rank_ret60 : 0.5)
    + 0.24 * (ok(f.rank_ret20) ? 1 - f.rank_ret20 : 0.5)
    + 0.12 * (ok(f.rank_ret120) ? 1 - f.rank_ret120 : 0.5)
    + 0.12 * (ok(f.rank_sharpe60) ? 1 - f.rank_sharpe60 : 0.5)
    + 0.07 * (ok(f.rank_distSma50) ? 1 - f.rank_distSma50 : 0.5)
    + 0.05 * (ok(f.rank_relVolume) ? 1 - f.rank_relVolume : 0.5);
  // Fade broken-down names: prefer weak-but-not-washed-out (rsi 40-62,
  // mild 20-bar action) over max-weakness names that snap back violently.
  // An oversold bounce inside a downtrend (ret20>0, ret60<0) is the ideal fade.
  if (ok(f.rsi14) && f.rsi14 < 30) s -= 0.1;
  if (ok(f.ret20) && f.ret20 < -0.25) s -= 0.1; // vertical drop: bounce coming
  if (ok(f.ret20) && ok(f.ret60) && f.ret20 > 0 && f.ret60 < 0) s += 0.1;
  if (ok(f.rsi14) && f.rsi14 < 18) s -= 0.15;
  if (ok(f.funding7d) && f.funding7d > 0) s += clamp(f.funding7d * 80, 0, 0.06);
  if (ok(f.drawdown) && f.drawdown > -0.15) s -= 0.05;
  if (incumbent) s += 0.08;
  return s;
}

function upTrend(f) {
  if (ok(f.distSma200)) return f.distSma200 > -0.05;
  if (ok(f.sma50over200)) return f.sma50over200 > -0.03;
  if (ok(f.distSma50)) return f.distSma50 > -0.05;
  if (ok(f.ret60)) return f.ret60 > -0.06;
  return true;
}

function downTrend(f) {
  if (ok(f.distSma50) && f.distSma50 < -0.02) return true;
  if (ok(f.distSma200) && f.distSma200 < -0.02) return true;
  if (ok(f.sma50over200) && f.sma50over200 < 0) return true;
  if (ok(f.ret60) && ok(f.ret20) && f.ret60 < 0 && f.ret20 < 0) return true;
  return false;
}

function volOf(f) {
  const v = ok(f.vol60) ? f.vol60 : ok(f.vol20) ? f.vol20 : ok(f.vol10) ? f.vol10 : NaN;
  return clamp(ok(v) ? v : 0.6, 0.08, 3);
}

function crossStats(A) {
  let maxR60 = -Infinity, maxR120 = -Infinity, n = 0;
  const r20 = [];
  for (const s in A) {
    const f = A[s].f;
    if (!f) continue;
    n++;
    if (ok(f.ret60) && f.ret60 > maxR60) maxR60 = f.ret60;
    if (ok(f.ret120) && f.ret120 > maxR120) maxR120 = f.ret120;
    if (ok(f.ret20)) r20.push(f.ret20);
  }
  r20.sort((a, b) => a - b);
  const leadership = ok(maxR60) && maxR60 > 0.22 / SQ;
  // Durable leadership: some asset is up big over 6 months (a real winner
  // exists) — separates true narrow bulls from bear-rally head-fakes.
  const durable = leadership && ok(maxR120) && maxR120 > 0.15 / SQ;
  return { n, maxR60: ok(maxR60) ? maxR60 : NaN, medR20: r20.length ? r20[r20.length >> 1] : NaN, leadership, durable };
}

function buildTargets(state, stats, r, step) {
  const A = state.assets;
  const pos = (state.portfolio && state.portfolio.positions) || {};
  const listed = stats.n;

  const lp = [];
  for (const s in A) {
    const a = A[s], f = a.f;
    if (!f) continue;
    if (!a.tradable && !pos[s]) continue;
    if (EXCLUDE[s] > step) continue;
    if (!ok(f.ret60) || !ok(f.ret20)) continue;
    const heldLong = pos[s] && (pos[s].side || 'long') === 'long';
    if (!heldLong && !(f.ret60 > -0.06 * SQ || (ok(f.rank_ret60) && f.rank_ret60 > 0.5))) continue;
    // New money needs a strict long-term uptrend (golden-rule filter); held
    // names keep looser rules so bull-market wobbles don't shake us out.
    if (!heldLong) {
      const strict = ok(f.distSma200) ? f.distSma200 > 0
        : ok(f.sma50over200) ? f.sma50over200 > 0
        : ok(f.rank_distSma50) ? f.rank_distSma50 > 0.55 : upTrend(f);
      if (!strict) continue;
    } else if (!upTrend(f)) {
      // Held name lost its trend: only keep if still a relative winner.
      if (!(ok(f.rank_ret60) && f.rank_ret60 > 0.6)) continue;
    }
    if (ok(f.distSma50) && f.distSma50 < -0.08 && !heldLong) continue;
    if (pos[s] && (pos[s].side || 'long') === 'short') continue;
    if (heldLong && ok(pos[s].pnlPct) && pos[s].pnlPct < -0.2) continue;
    lp.push({ s, score: longScore(f, !!heldLong, r), vol: volOf(f), sector: SECTOR[s] || null });
  }
  lp.sort((x, y) => y.score - x.score);
  // Single-theme universes concentrate; multi-sector diversify. Intraday:
  // never concentrate (short-horizon "leadership" is noise), always spread.
  let nL = FOCUS ? clamp(Math.ceil(Math.sqrt(Math.max(listed, 4))) - 1, 3, 6)
    : clamp(Math.ceil(Math.sqrt(Math.max(listed, 4))), 2, 8);
  const ctx = state.context || {};
  if (DAYBARS <= 2 && stats.durable && (!ok(ctx.spyDistSma200) || ctx.spyDistSma200 > -0.03)) nL = clamp(nL - 2, 3, 8);
  const longs = [], secL = {};
  for (const p of lp) {
    if (longs.length >= nL) break;
    if (p.sector && (secL[p.sector] || 0) >= 3) continue;
    if (p.sector) secL[p.sector] = (secL[p.sector] || 0) + 1;
    longs.push(p);
  }

  let shorts = [];
  if (ALLOW_SHORT) {
    const sp = [];
    for (const s in A) {
      const a = A[s], f = a.f;
      if (!f) continue;
      if (!a.tradable && !pos[s]) continue;
      if (EXCLUDE[s] > step) continue;
      if (!ok(f.ret60) || !ok(f.ret20)) continue;
      const heldShort = pos[s] && (pos[s].side || 'long') === 'short';
      if (pos[s] && (pos[s].side || 'long') === 'long') continue;
      if (heldShort) {
        // Keep proven shorts through wobbles; cover only on real strength.
        // Squeeze-covers are excluded for a while (no re-shorting into the rip).
        if (!downTrend(f)) continue;
        if (ok(pos[s].pnlPct) && pos[s].pnlPct < -0.18) { EXCLUDE[s] = step + EVERY; continue; } // squeezed
        if (ok(f.rsi14) && f.rsi14 > 65) { EXCLUDE[s] = step + EVERY; continue; } // ripping: step aside
        if (r > 0.8) continue; // full risk-on: no shorts
      } else {
        if (r > 0.7) continue; // new shorts only when not euphoric
        if (f.ret60 >= 0) continue;
        if (!downTrend(f)) continue;
        if (ok(f.rsi14) && (f.rsi14 > 62 || f.rsi14 < 25)) continue; // weak, not washed out
        if (ok(f.ret20) && f.ret20 < -0.3) continue; // don't short the waterfall
      }
      sp.push({ s, score: shortScore(f, !!heldShort), vol: volOf(f) });
    }
    sp.sort((x, y) => y.score - x.score);
    const nS = clamp(Math.ceil(Math.sqrt(Math.max(listed, 4)) / 2), 1, 5);
    shorts = sp.filter(p => p.score > 0.52).slice(0, nS);
  }

  const cap = 0.95 * Math.max(1, MAX_GROSS);
  let longGross, shortGross;
  if (!ALLOW_SHORT) {
    longGross = clamp(0.2 + (r - 0.2) * 1.25, 0.15, 0.95) * Math.min(MAX_GROSS, 1);
    if (!longs.length) longGross = 0;
    shortGross = 0;
    if (r < 0.35) longGross *= 0.5; // fear brake: faint regime, halve longs
  } else {
    let lf = longs.length ? clamp(0.25 + (r - 0.25) * 1.3, 0.12, 0.95) : 0;
    let sf = shorts.length ? (r < 0.4 ? clamp(0.7 - r, 0, 0.6) : clamp(0.62 - r, 0, 0.55)) : 0;
    if (r < 0.4) lf *= 0.3; // deep fear: longs shrink to a stub, shorts dominate
    else if (r < 0.35) lf *= 0.5;
    // Press confirmed bulls with leverage — but only when the benchmark
    // confirms (keeps bear rallies at 1x even when breadth spikes).
    const ctxB = state.context || {};
    if (r > 0.75 && stats.durable && ok(ctxB.spyDistSma200) && ctxB.spyDistSma200 > 0.05)
      lf = Math.max(lf, 0.95 * (1 + (MAX_GROSS - 1) * 0.5));
    const tot = lf + sf;
    const scale = tot > cap ? cap / tot : 1;
    longGross = lf * scale;
    shortGross = sf * scale * 0.9; // borrow costs: size shorts a touch lighter
  }

  const targets = {};
  if (longs.length && longGross > 0.02) {
    let wsum = 0;
    for (const p of longs) wsum += (1 / p.vol) * (0.5 + p.score);
    const perCap = Math.min(0.35, Math.max(0.15, longGross / 3));
    for (const p of longs) targets[p.s] = Math.min(perCap, (longGross * ((1 / p.vol) * (0.5 + p.score))) / wsum);
  }
  if (shorts.length && shortGross > 0.02) {
    let wsum = 0;
    for (const p of shorts) wsum += (1 / p.vol) * (0.5 + p.score);
    const perCap = Math.min(0.3, Math.max(0.12, shortGross / 2));
    for (const p of shorts) targets[p.s] = -Math.min(perCap, (shortGross * ((1 / p.vol) * (0.5 + p.score))) / wsum);
  }
  return { targets, longs, shorts };
}

module.exports = {
  name: 'Tidewalker',
  init(info) {
    EVERY = Math.max(5, Math.round((info.periodsPerYear || 365) / 26)); // ~2 weeks
    ALLOW_SHORT = !!(info.rules && info.rules.allowShort);
    MAX_GROSS = (info.rules && info.rules.maxGross) || 1;
    BLIND = !!info.blind;
    DAYBARS = (info.periodsPerYear || 365) / 365;
    SQ = Math.sqrt(Math.max(DAYBARS, 0.2));
    TRAILN = Math.min(300, Math.max(12, Math.round(12 * DAYBARS)));
    SECTOR = {};
    const seen = new Set();
    for (const a of info.assets || []) {
      SECTOR[a.symbol] = a.sector || null; // null when blind/unknown: no cap
      if (a.sector) seen.add(a.sector);
    }
    FOCUS = seen.size < 4;
    LAST = -1e12;
    TRAIL = [];
    RHIST = [];
    EXCLUDE = {};
  },
  onBar(state) {
    try {
      const A = state.assets;
      const pf = state.portfolio || {};
      const pos = pf.positions || {};
      const isLast = state.step === state.steps - 1;
      const eq = ok(pf.equity) ? pf.equity : NaN;
      if (ok(eq) && !isLast) { TRAIL.push(eq); if (TRAIL.length > TRAILN) TRAIL.shift(); }

      const stats = crossStats(A);
      const m = state.market || {};
      const hasLong = Object.keys(pos).some(s => (pos[s].side || 'long') === 'long'
        && Math.abs(pos[s].weight || 0) > 0.03);

      // Per-position stop (meaningful size only): absolute breakdown, or
      // weakest-decile vs trend (adapts to any timeframe's noise level).
      let broken = null;
      for (const s in pos) {
        if (!A[s] || (pos[s].side || 'long') !== 'long') continue;
        if (Math.abs(pos[s].weight || 0) < 0.03) continue;
        const f = A[s].f;
        if (!f || !ok(f.distSma50)) continue;
        if (f.distSma50 < -0.1) { broken = s; break; }
        if (f.distSma50 < -0.03 && ok(f.rank_distSma50) && f.rank_distSma50 < 0.1) { broken = s; break; }
      }
      // Market crash gate: breadth + RSI + median + no leadership.
      const crash = hasLong && ok(m.breadth50) && ok(m.avgRsi14) && ok(stats.medR20)
        && (m.breadth50 < 0.2 && (m.avgRsi14 < 40 || (ok(m.ewRet20) && m.ewRet20 < -0.1 * SQ))
          && stats.medR20 < -0.02 * SQ && !stats.leadership);
      // Portfolio trail stop: ~8% under our own 12-bar peak while fearful.
      let trail = false;
      const rNow = regime(state, stats);
      if (!isLast) { RHIST.push(rNow); if (RHIST.length > 8) RHIST.shift(); }
      const rExp = rNow;
      if (hasLong && !isLast && ok(eq) && TRAIL.length >= Math.min(6, TRAILN)) {
        let peak = 0;
        for (const v of TRAIL) if (v > peak) peak = v;
        // The portfolio's own drawdown is the most honest signal: exit fast
        // when the market is falling too, without waiting for smoothed gauges.
        if (peak > 0 && eq < 0.92 * peak && (rNow < 0.6 || stats.medR20 < 0)) trail = true;
      }

      const must = broken || crash || trail || isLast;
      if (!must && state.step - LAST < EVERY) return null;

      let note;
      if ((crash || trail) && !isLast) {
        if (broken) EXCLUDE[broken] = state.step + EVERY;
        const targets = {};
        for (const s in pos) if ((pos[s].side || 'long') === 'short') targets[s] = pos[s].weight;
        LAST = state.step;
        note = trail && !crash ? 'Trailing stop: locking in, cutting longs' : 'Downtrend confirmed on every gauge, cutting longs';
        if (!Object.keys(targets).length && !Object.keys(pos).length) return null;
        if (!Object.keys(targets).length) return { targets: {}, note };
        return { targets, note };
      }

      if (broken) EXCLUDE[broken] = state.step + EVERY;
      const r = rExp;
      const built = buildTargets(state, stats, r, state.step);
      const targets = built.targets;
      const nL = built.longs.length, nS = built.shorts.length;
      const l = built.longs.slice(0, 4).map(p => p.s).join(',');
      const sh = built.shorts.slice(0, 3).map(p => p.s).join(',');
      note = ALLOW_SHORT
        ? `${Math.round(r * 100)}% risk-on: ${nL} long${sh ? ` / short ${sh}` : ''}`
        : `${l ? `Basket ${l}${nL > 4 ? ` +${nL - 4}` : ''}` : 'No trend to hold'} · ${Math.round(r * 100)}% risk-on`;
      if (broken) note = `Stopped ${broken}. ` + note;
      if (r < 0.35 && nL && (!ALLOW_SHORT || !nS)) note = 'Fearful market, half size. ' + note;

      let drift = 0;
      const keys = new Set([...Object.keys(targets), ...Object.keys(pos)]);
      for (const k of keys) drift += Math.abs((targets[k] || 0) - ((pos[k] && pos[k].weight) || 0));
      if (!isLast && !broken && drift < 0.25) { LAST = state.step; return null; }
      LAST = state.step;

      // Ramp-in: the first rebalance of a race runs at half size. A day-one
      // full-size bet has no confirmation; this halves the cost of starting
      // inside a crash and costs little once the trend confirms.
      if (state.step < EVERY && !isLast) for (const k in targets) targets[k] *= 0.5;

      if (!Object.keys(targets).length) {
        return Object.keys(pos).length ? { targets: {}, note: 'No trend to hold. Cash.' } : null;
      }
      return { targets, note: String(note).slice(0, 140) };
    } catch (e) {
      return null;
    }
  }
};
