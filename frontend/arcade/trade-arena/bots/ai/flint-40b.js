// TrendRider - momentum rider with regime-aware risk.
const ok = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
let allowShort = false;
let maxGross = 1;
let every = 10;
let emittedFor = -100000;
function regimeExposure(state) {
  const m = state.market || {};
  const c = state.context || {};
  let s = 0.5;
  if (ok(m.breadth50)) s = m.breadth50;
  if (ok(m.breadth200)) s = 0.6 * s + 0.4 * m.breadth200;
  if (ok(m.ewRet20)) s += clamp(m.ewRet20, -0.1, 0.1);
  if (ok(c.spyRet20)) s += clamp(c.spyRet20, -0.1, 0.1);
  if (ok(c.spyDistSma200)) s += clamp(c.spyDistSma200, -0.15, 0.15);
  if (ok(c.vix)) s -= Math.max(0, c.vix - 25) * 0.01;
  const r = clamp(s, 0, 1);
  if (r > 0.62) return 0.98;
  if (r < 0.42) return 0.2;
  return 0.7;
}
function bearish(state) {
  const m = state.market || {};
  const c = state.context || {};
  const ew = ok(m.ewRet20) ? m.ewRet20 : 0;
  const sp = ok(c.spyDistSma200) ? c.spyDistSma200 : 0;
  return ew < -0.012 || sp < -0.05;
}
function plan(state) {
  const A = state.assets || {};
  const positions = (state.portfolio && state.portfolio.positions) || {};
  const finalBar = state.step === state.steps - 1;
  const useShorts = !!(bearish(state) && allowShort);
  const invest = useShorts ? Math.min(maxGross, 0.6) : regimeExposure(state);
  const exits = {};
  for (const s of Object.keys(positions)) {
    const p = positions[s];
    if (!p || !p.qty) continue;
    const f = A[s] && A[s].f;
    if (p.side === 'long') { if (ok(f && f.distSma50) && f.distSma50 < -0.12) exits[s] = 1; }
    else if (ok(f && f.distSma20) && f.distSma20 > 0.05) exits[s] = 1;
  }
  const cands = [];
  for (const s of Object.keys(A)) {
    const a = A[s];
    const f = a.f || {};
    const held = positions[s];
    const wantHold = !!(held && held.qty);
    if (!a.tradable && !wantHold) continue;
    if (!ok(f.ret60) || !ok(f.distSma200)) continue;
    if (!(f.distSma200 > 0)) continue;
    cands.push({ s, ret60: f.ret60, distSma50: ok(f.distSma50) ? f.distSma50 : 0 });
  }
  cands.sort((x, y) => y.ret60 - x.ret60);
  let longs = cands.filter(c => !exits[c.s]).slice(0, 5);
  const shorts = [];
  if (useShorts) {
    for (const c of cands) {
      if (shorts.length >= 2) break;
      if (exits[c.s]) continue;
      if (!(c.ret60 > 0) || !(c.distSma50 < -0.05)) continue;
      shorts.push(c);
    }
    if (shorts.length) longs = longs.filter(l => !shorts.some(s => s.s === l.s));
  }
  const desired = {};
  const keys = new Set();
  for (const l of longs) keys.add(l.s);
  for (const s of Object.keys(positions)) if (!exits[s]) keys.add(s);
  for (const s of keys) desired[s] = 0;
  const names = [];
  if (useShorts) {
    const sg = Math.min(maxGross, 0.6);
    const n = Math.min(shorts.length, 2);
    const w = Math.min(sg / n, 0.2);
    for (const c of shorts) { desired[c.s] = -w; names.push(c.s); }
  } else {
    const n = Math.min(longs.length, 5);
    const w = n ? Math.min(invest / n, 0.98 / n) : 0;
    for (const l of longs) { desired[l.s] = w; names.push(l.s); }
  }
  let gsum = 0;
  for (const s in desired) gsum += Math.abs(desired[s] || 0);
  if (gsum > (maxGross || 1) && gsum > 0) {
    const f = (maxGross || 1) / gsum;
    for (const s in desired) desired[s] = (desired[s] || 0) * f;
  }
  let shouldEmit = finalBar;
  if (!shouldEmit) shouldEmit = state.step - emittedFor >= every;
  if (!shouldEmit && Object.keys(exits).length) shouldEmit = true;
  if (shouldEmit) emittedFor = state.step;
  let note = null;
  if (shouldEmit) {
    if (names.length) {
      note = (useShorts ? 'Short ' : 'Long ') + names.slice(0, 4).join(', ') + (names.length > 4 ? ' +' + (names.length - 4) : '') + ' - ' + Math.round(gsum * 100) + '%';
    } else if (Object.keys(positions).length) {
      note = 'No setup, flat';
    }
  }
  return { targets: desired, note, shouldEmit };
}
module.exports = {
  name: 'TrendRider',
  init(info) {
    allowShort = !!(info && info.rules && info.rules.allowShort);
    maxGross = (info && info.rules && info.rules.maxGross) || 1;
    every = Math.max(3, Math.round(((info && info.periodsPerYear) || 252) / 26));
    emittedFor = -100000;
  },
  onBar(state) {
    try {
      const res = plan(state);
      if (res.shouldEmit === false) return null;
      emittedFor = state.step;
      const out = { targets: res.targets };
      if (res.note) out.note = String(res.note).slice(0, 140);
      return out;
    } catch (e) {
      return null;
    }
  },
};
