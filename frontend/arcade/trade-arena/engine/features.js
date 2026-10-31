// Trade Arena feature library. Every value at index i uses bars 0..i only (no look-ahead).
// Runs unchanged in the browser, in Web Workers and in Node (ES module, no dependencies).
// Input: columnar bars { t, o, h, l, c, v, [qv, n, tb] }. Output: { name: Float64Array } with NaN for warm-up.

const NA = NaN;
const ok = Number.isFinite;
const arr = n => new Float64Array(n).fill(NA);

export function sma(x, w) { // NaN-aware: a window needs w finite values
  const s = rollSum(x, w);
  for (let i = 0; i < s.length; i++) s[i] /= w;
  return s;
}

// EMA seeded with the SMA of the first w finite values; NaN inputs are skipped (value carried).
export function ema(x, w, alpha = 2 / (w + 1)) {
  const out = arr(x.length); let prev = NA, seen = 0, s = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!ok(v)) { out[i] = prev; continue; }
    if (seen < w) { s += v; seen++; if (seen === w) prev = s / w; out[i] = prev; continue; }
    prev = alpha * v + (1 - alpha) * prev; out[i] = prev;
  }
  return out;
}
export const wilder = (x, w) => ema(x, w, 1 / w);

export function rollStd(x, w) {
  const out = arr(x.length); let s = 0, q = 0, cnt = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (ok(v)) { s += v; q += v * v; cnt++; }
    if (i >= w) { const u = x[i - w]; if (ok(u)) { s -= u; q -= u * u; cnt--; } }
    if (i >= w - 1 && cnt === w) out[i] = Math.sqrt(Math.max(0, (q - s * s / w) / (w - 1)));
  }
  return out;
}

function rollSum(x, w) {
  const out = arr(x.length); let s = 0, cnt = 0;
  for (let i = 0; i < x.length; i++) {
    if (ok(x[i])) { s += x[i]; cnt++; }
    if (i >= w && ok(x[i - w])) { s -= x[i - w]; cnt--; }
    if (i >= w - 1 && cnt === w) out[i] = s;
  }
  return out;
}

// Monotonic-deque rolling max/min, O(n).
function rollExt(x, w, isMax) {
  const out = arr(x.length), dq = [];
  let head = 0;
  for (let i = 0; i < x.length; i++) {
    while (dq.length > head && (isMax ? x[dq[dq.length - 1]] <= x[i] : x[dq[dq.length - 1]] >= x[i])) dq.pop();
    dq.push(i);
    if (dq[head] <= i - w) head++;
    if (i >= w - 1) out[i] = x[dq[head]];
  }
  return out;
}
export const rollMax = (x, w) => rollExt(x, w, true);
export const rollMin = (x, w) => rollExt(x, w, false);

function rollArgAge(x, w, isMax) { // bars since the rolling extreme (for Aroon)
  const out = arr(x.length);
  for (let i = w; i < x.length; i++) {
    let best = i - w;
    for (let j = i - w + 1; j <= i; j++) if (isMax ? x[j] >= x[best] : x[j] <= x[best]) best = j;
    out[i] = i - best;
  }
  return out;
}

function rollMoments(r, w) { // skew and excess kurtosis
  const sk = arr(r.length), ku = arr(r.length);
  for (let i = w - 1; i < r.length; i++) {
    let m = 0, n = 0;
    for (let j = i - w + 1; j <= i; j++) if (ok(r[j])) { m += r[j]; n++; }
    if (n < w * 0.9) continue;
    m /= n; let m2 = 0, m3 = 0, m4 = 0;
    for (let j = i - w + 1; j <= i; j++) if (ok(r[j])) { const d = r[j] - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
    m2 /= n; m3 /= n; m4 /= n;
    if (m2 > 0) { sk[i] = m3 / m2 ** 1.5; ku[i] = m4 / (m2 * m2) - 3; }
  }
  return [sk, ku];
}

function rollAutocorr(r, w) {
  const out = arr(r.length);
  for (let i = w; i < r.length; i++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
    for (let j = i - w + 1; j <= i; j++) {
      const a = r[j - 1], b = r[j];
      if (!ok(a) || !ok(b)) continue;
      sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; n++;
    }
    const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    if (n > 10 && den > 0) out[i] = (n * sxy - sx * sy) / den;
  }
  return out;
}

function linreg(x, w) { // slope (per bar, relative to price) and r^2 of close on time
  const slope = arr(x.length), r2 = arr(x.length);
  const mt = (w - 1) / 2, stt = w * (w * w - 1) / 12;
  for (let i = w - 1; i < x.length; i++) {
    let sy = 0, sty = 0, syy = 0;
    for (let k = 0; k < w; k++) { const y = x[i - w + 1 + k]; sy += y; sty += k * y; syy += y * y; }
    const my = sy / w, cov = sty - w * mt * my, vy = syy - w * my * my;
    const b = cov / stt;
    slope[i] = my ? b / my : NA;
    r2[i] = vy > 0 ? (cov * cov) / (stt * vy) : NA;
  }
  return [slope, r2];
}

const div = (a, b) => (ok(a) && ok(b) && b !== 0 ? a / b : NA);
const map = (n, f) => { const o = arr(n); for (let i = 0; i < n; i++) o[i] = f(i); return o; };

// Bars per year by timeframe and market (stocks: 252 sessions, ~7 hourly bars per session).
export function periodsPerYear(tf, market) {
  if (market === 'stocks' || market === 'context') return { '1d': 252, '4h': 504, '1h': 1764 }[tf];
  return { '1d': 365, '4h': 2190, '1h': 8760 }[tf];
}

export const FEATURE_GROUPS = {
  'Returns & candle': {
    ret1: 'Close-to-close return over 1 bar', ret3: '3-bar return', ret5: '5-bar return', ret10: '10-bar return',
    ret20: '20-bar return', ret60: '60-bar return', ret120: '120-bar return', ret250: '250-bar return',
    logRet1: 'Log return over 1 bar', gap: 'Open vs previous close', range: '(high-low)/close',
    body: '(close-open)/open', upperWick: 'Upper wick / close', lowerWick: 'Lower wick / close',
    closeLoc: 'Close location in bar range, 0=low 1=high',
  },
  Trend: {
    sma5: 'Simple MA 5', sma10: 'Simple MA 10', sma20: 'Simple MA 20', sma50: 'Simple MA 50', sma100: 'Simple MA 100', sma200: 'Simple MA 200',
    ema9: 'Exponential MA 9', ema12: 'EMA 12', ema21: 'EMA 21', ema26: 'EMA 26', ema50: 'EMA 50', ema200: 'EMA 200',
    distSma20: 'close/SMA20 - 1', distSma50: 'close/SMA50 - 1', distSma200: 'close/SMA200 - 1',
    sma50over200: 'SMA50/SMA200 - 1 (golden/death cross > 0 / < 0)', sma20slope: '5-bar change of SMA20',
    lrSlope20: 'Linear-regression slope of last 20 closes, per bar, relative to price', lrR2_20: 'R² of that regression (trend quality)',
    adx14: 'Average Directional Index 14', plusDI14: '+DI 14', minusDI14: '−DI 14',
    aroonUp25: 'Aroon up 25 (0..100)', aroonDown25: 'Aroon down 25', aroonOsc25: 'Aroon up − down',
    tenkan: 'Ichimoku conversion line (9)', kijun: 'Ichimoku base line (26)',
    senkouA: 'Ichimoku leading span A as of now (from 26 bars ago)', senkouB: 'Ichimoku leading span B as of now',
    cloudPos: '+1 above cloud, −1 below, 0 inside', psar: 'Parabolic SAR (0.02/0.2)', psarDir: '+1 SAR below price (uptrend), −1 above',
    supertrend: 'Supertrend line (10, 3)', supertrendDir: '+1 uptrend, −1 downtrend',
    donchHigh20: '20-bar highest high', donchLow20: '20-bar lowest low', donchPos20: 'Close position in 20-bar channel 0..1',
    donchHigh55: '55-bar highest high', donchLow55: '55-bar lowest low',
  },
  Momentum: {
    rsi14: 'RSI 14 (Wilder)', rsi2: 'RSI 2', stochK14: 'Stochastic %K 14', stochD3: 'Stochastic %D (3-bar SMA of %K)',
    stochRsi14: 'Stochastic RSI 14 (0..1)', williamsR14: 'Williams %R 14 (−100..0)', cci20: 'Commodity Channel Index 20',
    mfi14: 'Money Flow Index 14', roc12: 'Rate of change 12', mom10: 'close − close 10 bars ago, relative',
    macd: 'MACD line (12,26)', macdSignal: 'MACD signal (9)', macdHist: 'MACD histogram', ppo: 'Percentage price oscillator (12,26)',
    ao: 'Awesome oscillator relative to price (SMA5−SMA34 of median price)', tsi: 'True strength index (25,13)',
    uo: 'Ultimate oscillator (7,14,28)',
  },
  Volatility: {
    atr14: 'Average True Range 14', atrPct: 'ATR14 / close', trueRange: 'True range of this bar',
    bbMid: 'Bollinger middle (SMA20)', bbUpper: 'Bollinger upper (2σ)', bbLower: 'Bollinger lower (2σ)',
    bbWidth: '(upper−lower)/mid', bbPctB: 'Bollinger %B', kcUpper: 'Keltner upper (EMA20 + 2·ATR)', kcLower: 'Keltner lower',
    squeeze: '1 when Bollinger bands are inside Keltner channels', vol10: 'Annualised realised volatility 10',
    vol20: 'Annualised realised volatility 20', vol60: 'Annualised realised volatility 60',
    parkinson20: 'Parkinson high-low volatility 20 (annualised)', garmanKlass20: 'Garman-Klass volatility 20 (annualised)',
    volRatio: 'vol10 / vol60', zscore20: '(close − SMA20)/σ20', drawdown: 'close / running max close − 1',
    distHigh52w: 'close / 1-year high − 1', distLow52w: 'close / 1-year low − 1',
  },
  Volume: {
    volume: 'Base-asset volume (shares or coins)', dollarVolume: 'close × volume', volSma20: 'Volume SMA 20',
    relVolume: 'volume / SMA20 volume', volZ20: 'Volume z-score 20', obv: 'On-balance volume',
    obvSlope20: '20-bar change of OBV relative to 20-bar total volume', cmf20: 'Chaikin money flow 20',
    adLine: 'Accumulation/distribution line', forceIndex13: 'Force index EMA 13 relative to dollar volume',
    vwap20: 'Rolling 20-bar VWAP', distVwap20: 'close/VWAP20 − 1', vpt: 'Volume-price trend',
    takerBuyRatio: 'Crypto: taker-buy volume / volume (0.5 = balanced)', takerBuyRatio20: 'Crypto: 20-bar taker-buy ratio',
    trades: 'Crypto: number of trades in the bar', avgTradeSize: 'Crypto: quote volume per trade',
  },
  Statistics: {
    sharpe60: 'Annualised Sharpe of last 60 bars (rf=0)', sortino60: 'Annualised Sortino of last 60 bars',
    skew60: 'Return skewness 60', kurt60: 'Excess kurtosis 60', autocorr60: 'Lag-1 return autocorrelation 60',
    upRatio20: 'Share of up bars in last 20', maxRet20: 'Largest 1-bar return in last 20', minRet20: 'Largest 1-bar loss in last 20',
  },
  Patterns: {
    doji: '1 if body < 10% of range', hammer: '1 if hammer', shootingStar: '1 if shooting star',
    bullEngulf: '1 if bullish engulfing', bearEngulf: '1 if bearish engulfing', insideBar: '1 if inside bar',
    outsideBar: '1 if outside bar', nr7: '1 if narrowest range of last 7', higherHigh: '1 if high > previous high and low > previous low',
    streak: 'Consecutive up (+) or down (−) closes', newHigh20: '1 if close is a 20-bar closing high', newLow20: '1 if close is a 20-bar closing low',
  },
};
export const FEATURE_NAMES = Object.values(FEATURE_GROUPS).flatMap(g => Object.keys(g));

export function computeFeatures(b, tf = '1d', market = 'crypto') {
  const n = b.c.length, { o, h, l, c } = b, v = b.v || new Float64Array(n);
  const ppy = periodsPerYear(tf, market) || 365, ann = Math.sqrt(ppy);
  const F = {};
  const ret = k => map(n, i => (i >= k ? c[i] / c[i - k] - 1 : NA));
  const r1 = ret(1);
  for (const k of [1, 3, 5, 10, 20, 60, 120, 250]) F['ret' + k] = k === 1 ? r1 : ret(k);
  const lr = map(n, i => (i ? Math.log(c[i] / c[i - 1]) : NA));
  F.logRet1 = lr;
  F.gap = map(n, i => (i ? o[i] / c[i - 1] - 1 : NA));
  F.range = map(n, i => (h[i] - l[i]) / c[i]);
  F.body = map(n, i => (c[i] - o[i]) / o[i]);
  F.upperWick = map(n, i => (h[i] - Math.max(o[i], c[i])) / c[i]);
  F.lowerWick = map(n, i => (Math.min(o[i], c[i]) - l[i]) / c[i]);
  F.closeLoc = map(n, i => (h[i] > l[i] ? (c[i] - l[i]) / (h[i] - l[i]) : 0.5));

  for (const w of [5, 10, 20, 50, 100, 200]) F['sma' + w] = sma(c, w);
  for (const w of [9, 12, 21, 26, 50, 200]) F['ema' + w] = ema(c, w);
  F.distSma20 = map(n, i => div(c[i], F.sma20[i]) - 1);
  F.distSma50 = map(n, i => div(c[i], F.sma50[i]) - 1);
  F.distSma200 = map(n, i => div(c[i], F.sma200[i]) - 1);
  F.sma50over200 = map(n, i => div(F.sma50[i], F.sma200[i]) - 1);
  F.sma20slope = map(n, i => (i >= 5 ? div(F.sma20[i], F.sma20[i - 5]) - 1 : NA));
  [F.lrSlope20, F.lrR2_20] = linreg(c, 20);

  // True range, ATR, directional movement
  const tr = map(n, i => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]));
  F.trueRange = tr;
  F.atr14 = wilder(tr, 14);
  F.atrPct = map(n, i => div(F.atr14[i], c[i]));
  const pdm = map(n, i => { if (!i) return 0; const up = h[i] - h[i - 1], dn = l[i - 1] - l[i]; return up > dn && up > 0 ? up : 0; });
  const mdm = map(n, i => { if (!i) return 0; const up = h[i] - h[i - 1], dn = l[i - 1] - l[i]; return dn > up && dn > 0 ? dn : 0; });
  const sp = wilder(pdm, 14), sm = wilder(mdm, 14);
  F.plusDI14 = map(n, i => 100 * div(sp[i], F.atr14[i]));
  F.minusDI14 = map(n, i => 100 * div(sm[i], F.atr14[i]));
  const dx = map(n, i => { const a = F.plusDI14[i], m = F.minusDI14[i]; return ok(a) && ok(m) && a + m > 0 ? 100 * Math.abs(a - m) / (a + m) : NA; });
  F.adx14 = wilder(dx, 14);
  const ageHi = rollArgAge(h, 25, true), ageLo = rollArgAge(l, 25, false);
  F.aroonUp25 = map(n, i => (ok(ageHi[i]) ? 100 * (25 - ageHi[i]) / 25 : NA));
  F.aroonDown25 = map(n, i => (ok(ageLo[i]) ? 100 * (25 - ageLo[i]) / 25 : NA));
  F.aroonOsc25 = map(n, i => F.aroonUp25[i] - F.aroonDown25[i]);

  // Ichimoku (causal: spans are those that are plotted at the current bar)
  const mid = w => { const hi = rollMax(h, w), lo = rollMin(l, w); return map(n, i => (hi[i] + lo[i]) / 2); };
  F.tenkan = mid(9); F.kijun = mid(26);
  const spanB = mid(52);
  F.senkouA = map(n, i => (i >= 26 ? (F.tenkan[i - 26] + F.kijun[i - 26]) / 2 : NA));
  F.senkouB = map(n, i => (i >= 26 ? spanB[i - 26] : NA));
  F.cloudPos = map(n, i => { const a = F.senkouA[i], s = F.senkouB[i]; if (!ok(a) || !ok(s)) return NA; return c[i] > Math.max(a, s) ? 1 : c[i] < Math.min(a, s) ? -1 : 0; });

  // Parabolic SAR
  F.psar = arr(n); F.psarDir = arr(n);
  if (n > 2) {
    let up = c[1] >= c[0], sar = up ? l[0] : h[0], ep = up ? h[1] : l[1], af = 0.02;
    for (let i = 1; i < n; i++) {
      sar = sar + af * (ep - sar);
      if (up) {
        sar = Math.min(sar, l[i - 1], i > 1 ? l[i - 2] : l[i - 1]);
        if (l[i] < sar) { up = false; sar = ep; ep = l[i]; af = 0.02; }
        else if (h[i] > ep) { ep = h[i]; af = Math.min(0.2, af + 0.02); }
      } else {
        sar = Math.max(sar, h[i - 1], i > 1 ? h[i - 2] : h[i - 1]);
        if (h[i] > sar) { up = true; sar = ep; ep = h[i]; af = 0.02; }
        else if (l[i] < ep) { ep = l[i]; af = Math.min(0.2, af + 0.02); }
      }
      F.psar[i] = sar; F.psarDir[i] = up ? 1 : -1;
    }
  }

  // Supertrend (10, 3)
  F.supertrend = arr(n); F.supertrendDir = arr(n);
  { const atr10 = wilder(tr, 10); let fu = NA, fl = NA, dir = 1;
    for (let i = 0; i < n; i++) {
      if (!ok(atr10[i])) continue;
      const m = (h[i] + l[i]) / 2, bu = m + 3 * atr10[i], bl = m - 3 * atr10[i];
      fu = !ok(fu) || bu < fu || c[i - 1] > fu ? bu : fu;
      fl = !ok(fl) || bl > fl || c[i - 1] < fl ? bl : fl;
      if (dir === 1 && c[i] < fl) dir = -1; else if (dir === -1 && c[i] > fu) dir = 1;
      F.supertrend[i] = dir === 1 ? fl : fu; F.supertrendDir[i] = dir;
    } }

  F.donchHigh20 = rollMax(h, 20); F.donchLow20 = rollMin(l, 20);
  F.donchPos20 = map(n, i => { const r = F.donchHigh20[i] - F.donchLow20[i]; return r > 0 ? (c[i] - F.donchLow20[i]) / r : NA; });
  F.donchHigh55 = rollMax(h, 55); F.donchLow55 = rollMin(l, 55);

  // Momentum
  const rsi = w => {
    const g = map(n, i => (i ? Math.max(0, c[i] - c[i - 1]) : NA)), d = map(n, i => (i ? Math.max(0, c[i - 1] - c[i]) : NA));
    const ag = wilder(g, w), al = wilder(d, w);
    return map(n, i => (!ok(ag[i]) ? NA : al[i] === 0 ? (ag[i] > 0 ? 100 : 50) : 100 - 100 / (1 + ag[i] / al[i])));
  };
  F.rsi14 = rsi(14); F.rsi2 = rsi(2);
  const hh14 = rollMax(h, 14), ll14 = rollMin(l, 14);
  F.stochK14 = map(n, i => (hh14[i] > ll14[i] ? 100 * (c[i] - ll14[i]) / (hh14[i] - ll14[i]) : NA));
  F.stochD3 = sma(F.stochK14, 3);
  { const rh = rollMax(F.rsi14, 14), rl = rollMin(F.rsi14, 14); F.stochRsi14 = map(n, i => (rh[i] > rl[i] ? (F.rsi14[i] - rl[i]) / (rh[i] - rl[i]) : NA)); }
  F.williamsR14 = map(n, i => (hh14[i] > ll14[i] ? -100 * (hh14[i] - c[i]) / (hh14[i] - ll14[i]) : NA));
  { const tp = map(n, i => (h[i] + l[i] + c[i]) / 3), m = sma(tp, 20);
    F.cci20 = map(n, i => { if (!ok(m[i])) return NA; let md = 0; for (let j = i - 19; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= 20; return md ? (tp[i] - m[i]) / (0.015 * md) : 0; });
    const mf = map(n, i => tp[i] * v[i]);
    const pos = rollSum(map(n, i => (i && tp[i] > tp[i - 1] ? mf[i] : 0)), 14), neg = rollSum(map(n, i => (i && tp[i] < tp[i - 1] ? mf[i] : 0)), 14);
    F.mfi14 = map(n, i => (!ok(pos[i]) ? NA : neg[i] === 0 ? 100 : 100 - 100 / (1 + pos[i] / neg[i])));
    const vwNum = rollSum(mf, 20), vwDen = rollSum(v, 20);
    F.vwap20 = map(n, i => div(vwNum[i], vwDen[i]));
    F.distVwap20 = map(n, i => div(c[i], F.vwap20[i]) - 1); }
  F.roc12 = ret(12);
  F.mom10 = ret(10);
  F.macd = map(n, i => F.ema12[i] - F.ema26[i]);
  F.macdSignal = ema(F.macd, 9);
  F.macdHist = map(n, i => F.macd[i] - F.macdSignal[i]);
  F.ppo = map(n, i => 100 * div(F.macd[i], F.ema26[i]));
  { const mp = map(n, i => (h[i] + l[i]) / 2), a5 = sma(mp, 5), a34 = sma(mp, 34); F.ao = map(n, i => div(a5[i] - a34[i], c[i])); }
  { const m1 = map(n, i => (i ? c[i] - c[i - 1] : NA)), a1 = map(n, i => Math.abs(m1[i]));
    const e1 = ema(ema(m1, 25), 13), e2 = ema(ema(a1, 25), 13); F.tsi = map(n, i => 100 * div(e1[i], e2[i])); }
  { const bp = map(n, i => (i ? c[i] - Math.min(l[i], c[i - 1]) : NA)), tr2 = map(n, i => (i ? tr[i] : NA));
    const avg = w => { const s1 = rollSum(bp, w), s2 = rollSum(tr2, w); return map(n, i => div(s1[i], s2[i])); };
    const a7 = avg(7), a14 = avg(14), a28 = avg(28); F.uo = map(n, i => 100 * (4 * a7[i] + 2 * a14[i] + a28[i]) / 7); }

  // Volatility
  const sd20 = rollStd(c, 20);
  F.bbMid = F.sma20;
  F.bbUpper = map(n, i => F.sma20[i] + 2 * sd20[i]); F.bbLower = map(n, i => F.sma20[i] - 2 * sd20[i]);
  F.bbWidth = map(n, i => div(F.bbUpper[i] - F.bbLower[i], F.sma20[i]));
  F.bbPctB = map(n, i => div(c[i] - F.bbLower[i], F.bbUpper[i] - F.bbLower[i]));
  { const e20 = ema(c, 20), a20 = wilder(tr, 20);
    F.kcUpper = map(n, i => e20[i] + 2 * a20[i]); F.kcLower = map(n, i => e20[i] - 2 * a20[i]);
    F.squeeze = map(n, i => (ok(F.bbUpper[i]) && ok(F.kcUpper[i]) ? +(F.bbUpper[i] < F.kcUpper[i] && F.bbLower[i] > F.kcLower[i]) : NA)); }
  for (const w of [10, 20, 60]) { const s = rollStd(lr, w); F['vol' + w] = map(n, i => s[i] * ann); }
  { const pk = map(n, i => Math.log(h[i] / l[i]) ** 2), ps = sma(pk, 20); F.parkinson20 = map(n, i => Math.sqrt(ps[i] / (4 * Math.log(2))) * ann);
    const gk = map(n, i => 0.5 * Math.log(h[i] / l[i]) ** 2 - (2 * Math.log(2) - 1) * Math.log(c[i] / o[i]) ** 2), gs = sma(gk, 20);
    F.garmanKlass20 = map(n, i => Math.sqrt(Math.max(0, gs[i])) * ann); }
  F.volRatio = map(n, i => div(F.vol10[i], F.vol60[i]));
  F.zscore20 = map(n, i => div(c[i] - F.sma20[i], sd20[i]));
  { let mx = -Infinity; F.drawdown = map(n, i => { mx = Math.max(mx, c[i]); return c[i] / mx - 1; }); }
  { const y = Math.round(ppy), hi = rollMax(h, y), lo = rollMin(l, y);
    F.distHigh52w = map(n, i => div(c[i], hi[i]) - 1); F.distLow52w = map(n, i => div(c[i], lo[i]) - 1); }

  // Volume
  F.volume = Float64Array.from(v);
  F.dollarVolume = b.qv ? Float64Array.from(b.qv) : map(n, i => c[i] * v[i]);
  F.volSma20 = sma(v, 20);
  { const vs = rollStd(v, 20); F.relVolume = map(n, i => div(v[i], F.volSma20[i])); F.volZ20 = map(n, i => div(v[i] - F.volSma20[i], vs[i])); }
  { let s = 0; F.obv = map(n, i => (s += i ? Math.sign(c[i] - c[i - 1]) * v[i] : 0)); }
  { const vs = rollSum(v, 20); F.obvSlope20 = map(n, i => (i >= 20 ? div(F.obv[i] - F.obv[i - 20], vs[i]) : NA)); }
  { const mfv = map(n, i => (h[i] > l[i] ? ((c[i] - l[i]) - (h[i] - c[i])) / (h[i] - l[i]) * v[i] : 0));
    const a = rollSum(mfv, 20), d = rollSum(v, 20); F.cmf20 = map(n, i => div(a[i], d[i]));
    let s = 0; F.adLine = map(n, i => (s += mfv[i])); }
  { const fi = ema(map(n, i => (i ? (c[i] - c[i - 1]) * v[i] : NA)), 13), dv = sma(map(n, i => c[i] * v[i]), 13);
    F.forceIndex13 = map(n, i => div(fi[i], dv[i])); }
  { let s = 0; F.vpt = map(n, i => (s += i ? v[i] * (c[i] / c[i - 1] - 1) : 0)); }
  if (b.tb) {
    F.takerBuyRatio = map(n, i => div(b.tb[i], v[i]));
    const a = rollSum(Float64Array.from(b.tb), 20), d = rollSum(v, 20); F.takerBuyRatio20 = map(n, i => div(a[i], d[i]));
    F.trades = Float64Array.from(b.n);
    F.avgTradeSize = map(n, i => div(b.qv[i], b.n[i]));
  } else for (const k of ['takerBuyRatio', 'takerBuyRatio20', 'trades', 'avgTradeSize']) F[k] = arr(n);

  // Statistics
  { const m = sma(r1, 60), s = rollStd(r1, 60);
    const dn = sma(map(n, i => (ok(r1[i]) ? Math.min(0, r1[i]) ** 2 : NA)), 60);
    F.sharpe60 = map(n, i => div(m[i], s[i]) * ann);
    F.sortino60 = map(n, i => div(m[i], Math.sqrt(dn[i])) * ann);
    [F.skew60, F.kurt60] = rollMoments(r1, 60);
    F.autocorr60 = rollAutocorr(r1, 60);
    F.upRatio20 = sma(map(n, i => (ok(r1[i]) ? +(r1[i] > 0) : NA)), 20);
    F.maxRet20 = rollMax(map(n, i => (ok(r1[i]) ? r1[i] : -Infinity)), 20).map(x => (x === -Infinity ? NA : x));
    F.minRet20 = rollMin(map(n, i => (ok(r1[i]) ? r1[i] : Infinity)), 20).map(x => (x === Infinity ? NA : x)); }

  // Candle patterns
  { const rng = i => h[i] - l[i], bd = i => Math.abs(c[i] - o[i]);
    F.doji = map(n, i => +(rng(i) > 0 && bd(i) < 0.1 * rng(i)));
    F.hammer = map(n, i => +(rng(i) > 0 && Math.min(o[i], c[i]) - l[i] > 2 * bd(i) && h[i] - Math.max(o[i], c[i]) < bd(i) && i >= 5 && c[i] < c[i - 5]));
    F.shootingStar = map(n, i => +(rng(i) > 0 && h[i] - Math.max(o[i], c[i]) > 2 * bd(i) && Math.min(o[i], c[i]) - l[i] < bd(i) && i >= 5 && c[i] > c[i - 5]));
    F.bullEngulf = map(n, i => +(i > 0 && c[i - 1] < o[i - 1] && c[i] > o[i] && c[i] >= o[i - 1] && o[i] <= c[i - 1]));
    F.bearEngulf = map(n, i => +(i > 0 && c[i - 1] > o[i - 1] && c[i] < o[i] && c[i] <= o[i - 1] && o[i] >= c[i - 1]));
    F.insideBar = map(n, i => +(i > 0 && h[i] < h[i - 1] && l[i] > l[i - 1]));
    F.outsideBar = map(n, i => +(i > 0 && h[i] > h[i - 1] && l[i] < l[i - 1]));
    const r7 = rollMin(map(n, rng), 7); F.nr7 = map(n, i => +(ok(r7[i]) && rng(i) === r7[i]));
    F.higherHigh = map(n, i => +(i > 0 && h[i] > h[i - 1] && l[i] > l[i - 1]));
    let st = 0; F.streak = map(n, i => (st = !i ? 0 : c[i] > c[i - 1] ? Math.max(0, st) + 1 : c[i] < c[i - 1] ? Math.min(0, st) - 1 : 0));
    const ch = rollMax(c, 20), cl = rollMin(c, 20);
    F.newHigh20 = map(n, i => (ok(ch[i]) ? +(c[i] >= ch[i]) : NA)); F.newLow20 = map(n, i => (ok(cl[i]) ? +(c[i] <= cl[i]) : NA)); }

  return F;
}

// Rolling beta / correlation of asset returns vs a benchmark aligned on the same timestamps.
export function betaCorr(t, r, benchT, benchC, w = 60) {
  const idx = new Map(); for (let i = 0; i < benchT.length; i++) idx.set(benchT[i], i);
  const br = new Float64Array(t.length).fill(NA);
  for (let i = 0; i < t.length; i++) { const j = idx.get(t[i]); if (j > 0) br[i] = benchC[j] / benchC[j - 1] - 1; }
  const beta = arr(t.length), corr = arr(t.length);
  for (let i = w; i < t.length; i++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, k = 0;
    for (let j = i - w + 1; j <= i; j++) { const a = br[j], y = r[j]; if (!ok(a) || !ok(y)) continue; sx += a; sy += y; sxx += a * a; syy += y * y; sxy += a * y; k++; }
    if (k < w * 0.7) continue;
    const cov = sxy - sx * sy / k, vx = sxx - sx * sx / k, vy = syy - sy * sy / k;
    if (vx > 0) beta[i] = cov / vx;
    if (vx > 0 && vy > 0) corr[i] = cov / Math.sqrt(vx * vy);
  }
  return { beta, corr };
}
