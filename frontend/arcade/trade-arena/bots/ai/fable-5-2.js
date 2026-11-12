// Tidewater — rides the tide, steps aside when it turns.
// Momentum rotation with trend and breadth filters, computed on the bot's own close history so the horizons
// scale with the timeframe. Longs the strongest uptrends, cuts broken ones between rebalances, shorts the
// weakest downtrends when the race allows it and the tide is out, and adds leverage only in broad calm
// uptrends. Sizes from state.portfolio, so it also works as a portfolio reviewer (advice mode).
const ok = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const P = {
  kH: 2, kD: 4,                // horizon multiplier for 4h / 1h bars
  rebal: 7,                    // bars (x K) between full rebalances
  nLong: 6, nShort: 5,
  wF: 0.25, wM: 0.5, wS: 0.25,         // score weights for 20/60/120-bar returns
  volNorm: 0,                  // 0 = raw momentum, 1 = vol-normalised
  invVol: 0,                   // 0 = equal weight, 1 = inverse-vol weight
  stop50: 0.08,                // held long is cut when it closes this far below its 50-bar mean
  gateLo: 0.15, gateHi: 0.35,  // breadth range over which long exposure scales from gateMin to 1
  gateMin: 0.3,
  targetVol: 0.5,              // portfolio vol aimed for when leverage is available
  levBreadth: 0.5,
  shortOn: 0.25, shortFull: 0.12, shortBudget: 0.35,
  sStop: 0.06, sStop20: 0.03, sLoss: 0.15,                 // short is covered when it closes this far above its 50-bar mean
  band: 0.25, cut200: 0.03, entry50: 0.04, minN: 200, sB50: 0.3, levB50: 0.5, offB: 0, offB50: 0, phase: 0,
};

let K = 1, allowShort = false, maxGross = 1, ppy = 365, lastRebal = -1e9, lastNote = '';
let mine = {};       // what we last asked for: symbol -> weight
const H = {}, MK = {};
const MAXLEN = 1000;

function analyse(c, bpy) {
  const n = c.length;
  if (n < 120) return null;
  const last = c[n - 1];
  const ret = L0 => { const L = Math.min(L0 * K, n - 1); return last / c[n - 1 - L] - 1; };
  const sma = L0 => { const L = Math.min(L0 * K, n); let s = 0; for (let i = n - L; i < n; i++) s += c[i]; return s / L; };
  const vw = Math.min(40 * K, n - 1);
  let s = 0, s2 = 0;
  for (let i = n - vw; i < n; i++) { const r = Math.log(c[i] / c[i - 1]); s += r; s2 += r * r; }
  const vb = Math.max(Math.sqrt(Math.max(s2 / vw - (s / vw) * (s / vw), 0)), 1e-5);
  const r20 = ret(20), r60 = ret(60), r120 = ret(120);
  const sma20 = sma(20), sma50 = sma(50), sma200 = sma(200);
  let score = P.wF * r20 + P.wM * r60 + P.wS * r120;
  if (P.volNorm) score = P.wF * r20 / (vb * Math.sqrt(20 * K)) + P.wM * r60 / (vb * Math.sqrt(60 * K)) + P.wS * r120 / (vb * Math.sqrt(120 * K));
  return { score, r20, r60, r120, d20: last / sma20 - 1, d50: last / sma50 - 1, d200: last / sma200 - 1, vol: vb * Math.sqrt(bpy), n };
}

module.exports = {
  name: 'Tidewater',
  init(info) {
    K = info.timeframe === '1h' ? P.kD : info.timeframe === '4h' ? P.kH : 1;
    allowShort = !!(info.rules && info.rules.allowShort);
    maxGross = (info.rules && ok(info.rules.maxGross) && info.rules.maxGross > 0) ? info.rules.maxGross : 1;
    ppy = info.periodsPerYear || 365;
    const per = { '1d': [365, 252], '4h': [2190, 504], '1h': [8760, 1764] }[info.timeframe] || [ppy, ppy];
    for (const a of info.assets || []) {
      MK[a.symbol] = { market: a.market, bpy: a.market === 'stocks' ? per[1] : per[0] };
      const h = info.history && info.history[a.symbol];
      H[a.symbol] = h && Array.isArray(h.c) ? h.c.filter(x => ok(x) && x > 0) : [];
    }
  },
  onBar(state) {
    const A = state.assets || {};
    const pf = state.portfolio || {};
    const pos = pf.positions || {};
    const W = {};
    for (const s in pos) if (pos[s] && ok(pos[s].weight) && pos[s].weight !== 0) W[s] = pos[s].weight;

    // 1. own history + analysis
    const R = {};
    const rows = [];
    for (const sym in A) {
      const a = A[sym];
      if (!a || !a.bar) continue;
      const h = H[sym] || (H[sym] = []);
      if (!MK[sym]) MK[sym] = { market: 'crypto', bpy: ppy };
      if (a.tradable !== false && ok(a.bar.c) && a.bar.c > 0) {
        h.push(a.bar.c);
        if (h.length > MAXLEN + 200) h.splice(0, h.length - MAXLEN);
      }
      const r = analyse(h, MK[sym].bpy);
      if (!r || !ok(r.score)) continue;
      r.sym = sym;
      R[sym] = r; rows.push(r);
    }
    const held = Object.keys(W);
    if (!rows.length) return null;

    let up = 0, up50 = 0;
    for (const r of rows) { if (r.d200 > 0) up++; if (r.d50 > 0) up50++; }
    const b50 = up50 / rows.length;
    const breadth = up / rows.length;
    const G = maxGross * 0.97;

    // 2. is this a rebalance bar?  (also when the portfolio is not the one we built: advice mode)
    let foreign = false;
    for (const s of held) if (!(s in mine) || (mine[s] !== 0 && Math.sign(mine[s]) !== Math.sign(W[s]))) foreign = true;
    const due = (state.step >= P.phase && state.step - lastRebal >= P.rebal * K) || foreign;

    if (!due) {
      // between rebalances: only cut broken positions
      const cut = [];
      for (const s of held) {
        const r = R[s];
        if (!r) continue;
        if (W[s] > 0 && (r.d50 < -P.stop50 || r.d200 < -P.cut200)) cut.push(s);
        if (W[s] < 0 && (r.d50 > P.sStop || r.d20 > P.sStop20 || r.d200 > 0.02 || (pos[s].pnlPct < -P.sLoss))) cut.push(s);
      }
      if (!cut.length) return null;
      const T = {};
      for (const s of held) if (!cut.includes(s)) T[s] = W[s];
      for (const s of cut) mine[s] = 0;   // exit may still be pending (closed market)
      return { targets: T, note: `${cut.slice(0, 4).join(', ')} broke trend, stepping out`.slice(0, 140) };
    }
    lastRebal = state.step;

    // 3. long book
    const D = {};
    const riskOff = breadth < P.offB && b50 < P.offB50;
    const longs = riskOff ? [] : rows.filter(r => r.d200 > 0 && r.score > 0 && r.d50 > -P.entry50 && r.n >= P.minN)
      .sort((a, b) => b.score - a.score).slice(0, P.nLong);
    let longSum = 0;
    if (longs.length) {
      const gate = clamp(P.gateMin + (1 - P.gateMin) * (breadth - P.gateLo) / (P.gateHi - P.gateLo), P.gateMin, 1);
      let iv = 0, pv = 0;
      for (const r of longs) { r.iv = P.invVol ? 1 / clamp(r.vol, 0.1, 3) : 1; iv += r.iv; }
      for (const r of longs) pv += (r.iv / iv) * r.vol;
      pv *= 0.8;
      let budget = Math.min(G, 0.98) * gate * longs.length / P.nLong;
      if (maxGross > 1 && breadth > P.levBreadth && b50 > P.levB50) budget = clamp(P.targetVol / Math.max(pv, 0.05), budget, G) * longs.length / P.nLong;
      for (const r of longs) { D[r.sym] = budget * r.iv / iv; longSum += D[r.sym]; }
    }

    // 4. short book
    if (allowShort && breadth < P.shortOn && b50 < P.sB50) {
      const inten = clamp((P.shortOn - breadth) / (P.shortOn - P.shortFull), 0, 1);
      const budget = Math.min(P.shortBudget * inten * Math.max(1, maxGross * 0.75), G - longSum);
      const shorts = rows.filter(r => !D[r.sym] && MK[r.sym].market === 'crypto' && r.d200 < 0 && r.d50 < 0 && r.d20 < 0 && r.r20 < 0 && r.score < 0 && r.n >= 200)
        .sort((a, b) => a.score - b.score).slice(0, P.nShort);
      if (shorts.length && budget > 0.03) {
        let iv = 0;
        for (const r of shorts) { r.iv = 1 / clamp(r.vol, 0.15, 3); iv += r.iv; }
        for (const r of shorts) D[r.sym] = -Math.min(budget * 1.6 / P.nShort, budget * r.iv / iv);
      }
    }

    // 5. no-trade band around what we actually hold
    const T = {};
    let change = 0, gross = 0;
    const syms = new Set([...Object.keys(D), ...held]);
    for (const s of syms) {
      const d = D[s] || 0, w = W[s] || 0;
      if (!A[s]) { if (w) { T[s] = w; gross += Math.abs(w); } continue; }
      let t = d;
      if (d !== 0 && w !== 0 && Math.sign(d) === Math.sign(w) && Math.abs(d - w) < P.band * Math.abs(d)) t = w;
      if (!allowShort && t < 0) t = 0;
      if (t !== 0) T[s] = t;
      change += Math.abs(t - w);
      gross += Math.abs(t);
    }
    if (gross > G) { const k = G / gross; for (const s in T) T[s] *= k; change += gross - G; }
    mine = Object.assign({}, T);
    for (const s of held) if (!(s in mine)) mine[s] = 0;
    if (change < 0.004) return null;

    const ln = Object.keys(T).filter(s => T[s] > 0).sort((a, b) => T[b] - T[a]);
    const sn = Object.keys(T).filter(s => T[s] < 0).sort((a, b) => T[a] - T[b]);
    let note;
    if (!ln.length && !sn.length) note = `Tide is out (${Math.round(breadth * 100)}% above trend). All cash.`;
    else {
      note = ln.length ? `Long ${ln.slice(0, 5).join(', ')}` : 'No longs';
      if (sn.length) note += `; short ${sn.slice(0, 4).join(', ')}`;
      note += ` · breadth ${Math.round(breadth * 100)}%`;
    }
    const out = { targets: T };
    if (note !== lastNote) { out.note = note.slice(0, 140); lastNote = note; }
    return out;
  }
};
