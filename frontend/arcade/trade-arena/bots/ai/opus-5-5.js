// Tide Rider: regime-aware, broad trend follower.
// - Builds its own equal-weight index of everything listed and reads the "tide" from it on
//   day-scaled lookbacks (so 1h / 4h / 1d races behave alike), with hysteresis.
// - Rising tide: owns a broad basket of uptrending assets, tilted to the strongest momentum,
//   mildly levered when the race allows it.
// - Ebbing tide: cash in long-only races; in long/short races shorts the weakest downtrends.
// - Rebalances on a slow clock with a drift threshold to keep fees low.
const ok = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

let bpd = 1, allowShort = false, maxGross = 1;
let every = 5, lastReb = -1e9;
let hist = {};            // sym -> closes
let maxLen = 400;
let idx = [1];            // own equal-weight index
let lastClose = {};
let mode = null;
let shortEntry = {};      // sym -> price at short entry (for stop)
const P = { trendDays: 100, fastDays: 50, rebDays: 7, tilt: 1.0, lev: 1.3, shortG: 0.5, drift: 0.15, filter: 1, part: 0, bullT: 3, bearT: 2 };

function lb(days) { return Math.max(2, Math.round(days * bpd)); }
function push(arr, c, cap) { arr.push(c); if (arr.length > cap + 64) arr.splice(0, arr.length - cap); }
function retN(a, n) {
  if (!a || a.length < 3) return NaN;
  const k = Math.min(n, a.length - 1);
  return a[a.length - 1] / a[a.length - 1 - k] - 1;
}
function smaN(a, n) {
  if (!a || a.length < 3) return NaN;
  const k = Math.min(n, a.length);
  let s = 0;
  for (let i = a.length - k; i < a.length; i++) s += a[i];
  return s / k;
}
function addBar(sym, c) {
  if (!ok(c) || c <= 0) return NaN;
  const prev = lastClose[sym];
  lastClose[sym] = c;
  push(hist[sym] || (hist[sym] = []), c, maxLen);
  return ok(prev) ? c / prev - 1 : NaN;
}

module.exports = {
  name: 'Tide Rider',

  init(info) {
    const r = info.rules || {};
    allowShort = !!r.allowShort;
    maxGross = ok(r.maxGross) ? Math.max(0, r.maxGross) : 1;
    const hasCrypto = (info.assets || []).some(a => a.market === 'crypto');
    const ppy = info.periodsPerYear || (hasCrypto ? 365 : 252);
    bpd = Math.max(1, ppy / (hasCrypto ? 365 : 252));
    every = Math.max(1, Math.round(P.rebDays * bpd));
    maxLen = lb(P.trendDays * 1.3) + 5;
    hist = {}; lastClose = {}; idx = [1]; mode = null; lastReb = -1e9; shortEntry = {};
    // Rebuild index from history, aligning bars by timestamp (null when blind -> by position from end).
    const H = info.history || {};
    const syms = Object.keys(H).filter(s => H[s] && H[s].c && H[s].c.length);
    const L = Math.max(0, ...syms.map(s => H[s].c.length));
    const timed = syms.every(s => H[s].t && ok(H[s].t[0]));
    let rows = [];
    if (timed) {
      const map = new Map();
      for (const s of syms) H[s].t.forEach((t, i) => { if (!map.has(t)) map.set(t, []); map.get(t).push([s, H[s].c[i]]); });
      rows = [...map.keys()].sort((a, b) => a - b).map(t => map.get(t));
    } else {
      for (let j = 0; j < L; j++) {
        const row = [];
        for (const s of syms) { const c = H[s].c, i = c.length - L + j; if (i >= 0) row.push([s, c[i]]); }
        rows.push(row);
      }
    }
    for (const row of rows) {
      let sr = 0, n = 0;
      for (const [s, c] of row) { const r1 = addBar(s, c); if (ok(r1)) { sr += clamp(r1, -0.5, 1); n++; } }
      push(idx, idx[idx.length - 1] * (1 + (n ? sr / n : 0)), maxLen);
    }
  },

  onBar(state) {
    const A = state.assets || {};
    const port = state.portfolio || { positions: {} };
    const pos = port.positions || {};
    let sr = 0, nr = 0;
    for (const s in A) {
      if (!A[s].tradable || !A[s].bar) continue;
      const r1 = addBar(s, A[s].bar.c);
      if (ok(r1)) { sr += clamp(r1, -0.5, 1); nr++; }
    }
    push(idx, idx[idx.length - 1] * (1 + (nr ? sr / nr : 0)), maxLen);

    // ---- tide from own index
    const ic = idx[idx.length - 1];
    const iSlow = smaN(idx, lb(P.trendDays)), iFast = smaN(idx, lb(P.fastDays));
    const iMom = retN(idx, lb(60));
    const m = state.market || {};
    let sig = 0;
    if (ok(iSlow)) sig += ic > iSlow ? 1 : -1;
    if (ok(iFast)) sig += ic > iFast ? 1 : -1;
    if (ok(iMom)) sig += iMom > 0 ? 1 : -1;
    if (ok(m.breadth200)) sig += m.breadth200 > 0.5 ? 0.5 : -0.5;
    let newMode = mode || 'bull';
    if (idx.length < 15) newMode = 'bull';
    else if (sig >= P.bullT) newMode = 'bull';
    else if (sig <= -P.bearT) newMode = 'bear';
    else if (mode === null) newMode = sig >= 0 ? 'bull' : 'bear';
    const flipped = newMode !== mode;
    mode = newMode;

    // ---- short stops (between rebalances)
    let stopped = [];
    for (const s in pos) {
      const p = pos[s];
      if (!(p.qty < 0) || !A[s]) continue;
      if (ok(p.pnlPct) && p.pnlPct < -0.25) stopped.push(s);
    }
    const due = flipped || stopped.length > 0 || state.step - lastReb >= every;
    if (!due) return null;

    // ---- per-asset signals
    const rows = [];
    for (const s in A) {
      const a = hist[s];
      const f = A[s].f || {};
      if (!A[s].tradable && !pos[s]) continue;
      if (!a || a.length < 10) continue;
      const c = a[a.length - 1];
      const r20 = retN(a, lb(20)), r60 = retN(a, lb(60)), r120 = retN(a, lb(120));
      const sSlow = smaN(a, lb(P.trendDays)), sFast = smaN(a, lb(P.fastDays));
      let vol = ok(f.vol60) ? f.vol60 : ok(f.vol20) ? f.vol20 : 0.6;
      vol = Math.max(0.1, vol);
      const mom = (0.25 * r20 + 0.45 * r60 + 0.3 * r120) / Math.sqrt(vol);
      rows.push({ s, c, mom, vol, up: c > sSlow || (c > sFast && r20 > 0), dn: c < sSlow && c < sFast && r60 < 0 });
    }
    if (!rows.length) return null;
    rows.sort((a, b) => b.mom - a.mom);
    rows.forEach((r, i) => r.rank = rows.length > 1 ? 1 - i / (rows.length - 1) : 0.5);

    const targets = {};
    if (mode === 'bull') {
      const g = Math.min(maxGross, maxGross > 1 ? P.lev : 1) * 0.98;
      const picks = P.filter ? rows.filter(r => r.up) : rows;
      let tot = 0;
      for (const r of picks) { r.w = (1 + P.tilt * (2 * r.rank - 1)) ** 2; tot += r.w; }
      // scale by fraction of the universe in uptrend: weak participation -> partial exposure
      const part = !P.part ? 1 : clamp(picks.length / Math.max(1, rows.length) * 1.6, 0.3, 1);
      for (const r of picks) targets[r.s] = Math.min(0.35 * Math.max(1, g), g * part * r.w / tot);
    } else if (allowShort) {
      const g = Math.min(maxGross, P.shortG);
      const picks = rows.filter(r => r.dn && !stopped.includes(r.s)).reverse().slice(0, Math.max(3, Math.ceil(rows.length / 3)));
      let tot = 0;
      for (const r of picks) { r.w = 1 / r.vol; tot += r.w; }
      for (const r of picks) targets[r.s] = -Math.min(0.25, g * r.w / tot);
    }

    let drift = 0;
    for (const k of new Set([...Object.keys(targets), ...Object.keys(pos)])) drift += Math.abs((targets[k] || 0) - ((pos[k] && pos[k].weight) || 0));
    lastReb = state.step;
    if (drift < P.drift && !flipped && !stopped.length) return null;

    const L = Object.keys(targets).filter(k => targets[k] > 0).sort((a, b) => targets[b] - targets[a]);
    const S = Object.keys(targets).filter(k => targets[k] < 0).sort((a, b) => targets[a] - targets[b]);
    let note = mode === 'bull' ? 'Rising tide' : 'Ebb tide';
    if (flipped) note += ' - regime flip';
    if (stopped.length) note += `, stop-out ${stopped.slice(0, 3).join(',')}`;
    if (L.length) note += `. Long ${L.length}, top ${L.slice(0, 3).join(',')}`;
    if (S.length) note += `. Short ${S.length}: ${S.slice(0, 3).join(',')}`;
    if (!L.length && !S.length) note += '. Sitting in cash';
    return { targets, note: note.slice(0, 140) };
  }
};
