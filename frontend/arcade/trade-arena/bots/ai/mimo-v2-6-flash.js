// Compass — regime-aware cross-sectional momentum with trend filter and optional shorts.
const ok = Number.isFinite;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

let allowShort = false;
let grossCap = 1;
let longCap = 1;
let every = 10;
let sectors = null;
let lastStep = -1e9;
let noteCache = '';

function regime(state) {
  const m = state.market || {};
  const c = state.context || {};
  let s = 0.5;
  if (ok(m.breadth50)) {
    s = m.breadth50;
    if (ok(m.breadth200)) s = 0.6 * m.breadth50 + 0.4 * m.breadth200;
  }
  if (ok(m.ewRet20)) s += clamp(m.ewRet20 * 1.5, -0.15, 0.15);
  if (ok(m.avgRsi14)) s += clamp((m.avgRsi14 - 50) / 250, -0.08, 0.08);
  if (ok(c.spyDistSma200)) s += c.spyDistSma200 > 0 ? 0.06 : -0.12;
  if (ok(c.spyRet20)) s += clamp(c.spyRet20 * 0.5, -0.08, 0.08);
  if (ok(c.vixChg5)) s -= clamp(c.vixChg5 / 40, -0.06, 0.1);
  if (ok(c.vix)) s -= c.vix > 30 ? 0.12 : c.vix > 22 ? 0.05 : 0;
  return clamp(s, 0, 1);
}

function momScore(f) {
  const r = (k) => (ok(f[k]) ? f[k] : 0.5);
  let m = 0.4 * r('rank_ret60') + 0.25 * r('rank_ret20') + 0.2 * r('rank_sharpe60') + 0.15 * r('rank_ret120');
  if (ok(f.rsi14) && f.rsi14 > 82) m -= 0.15;
  if (ok(f.rsi14) && f.rsi14 < 18) m += 0.05;
  m += 0.08 * (r('rank_dollarVolume') - 0.5);
  return m;
}

function trendOf(f) {
  if (ok(f.distSma200)) return f.distSma200;
  if (ok(f.distSma50)) return f.distSma50;
  return NaN;
}

function sizeBasket(list, exposure, nameCap) {
  if (!list.length || exposure <= 0) return {};
  let inv = 0;
  for (const p of list) inv += 1 / p.vol;
  const targets = {};
  let sum = 0;
  for (const p of list) {
    let w = (exposure * (1 / p.vol)) / inv;
    w = Math.min(w, nameCap);
    targets[p.s] = w;
    sum += w;
  }
  if (sum > 1e-9 && Math.abs(sum - exposure) > 1e-6) {
    const k = exposure / sum;
    for (const s in targets) targets[s] = targets[s] * k;
  }
  return targets;
}

function build(state) {
  const A = state.assets;
  const pos = state.portfolio.positions || {};
  const reg = regime(state);
  const listed = (state.market && ok(state.market.listed)) ? state.market.listed : Object.keys(A).length;
  const K = clamp(Math.round(listed / 4), 3, 8);

  const longs = [];
  const shorts = [];
  const secCount = {};
  const secCap = sectors ? 3 : 99;

  for (const s in A) {
    const a = A[s];
    const f = a.f;
    if (!ok(f.ret60) || !ok(f.vol20)) continue;
    const trend = trendOf(f);
    if (!ok(trend)) continue;
    const mom = momScore(f);
    const vol = Math.max(0.06, f.vol20);
    if (trend > 0) {
      const sec = sectors && sectors[s] ? sectors[s] : null;
      longs.push({ s, mom, vol, sec });
    } else if (allowShort && trend < 0 && mom < 0.45) {
      shorts.push({ s, mom, vol });
    }
  }

  longs.sort((x, y) => y.mom - x.mom);
  shorts.sort((x, y) => x.mom - y.mom);

  const pickL = [];
  for (const p of longs) {
    if (pickL.length >= K) break;
    if (p.sec && (secCount[p.sec] || 0) >= secCap) continue;
    if (p.sec) secCount[p.sec] = (secCount[p.sec] || 0) + 1;
    pickL.push(p);
  }
  const pickS = shorts.slice(0, Math.min(K, 5));

  let longExp = allowShort ? 0.15 + 1.0 * reg : 0.3 + 0.7 * reg;
  let shortExp = allowShort ? Math.max(0, 0.5 - reg) * 1.1 : 0;
  longExp = Math.min(longExp, longCap, grossCap);
  if (!pickL.length) longExp = 0;
  if (!pickS.length) shortExp = 0;
  const tot = longExp + shortExp;
  if (tot > grossCap && tot > 0) {
    const k = grossCap / tot;
    longExp *= k;
    shortExp *= k;
  }

  const targets = Object.assign(
    sizeBasket(pickL, longExp, allowShort ? 0.32 : 0.4),
    sizeBasket(pickS, shortExp, 0.28)
  );

  const cur = {};
  for (const s in pos) cur[s] = pos[s].weight || 0;
  let drift = 0;
  for (const s in targets) drift += Math.abs(targets[s] - (cur[s] || 0));
  for (const s in cur) if (!(s in targets)) drift += Math.abs(cur[s]);

  const top = pickL.slice(0, 3).map((p) => p.s).join(',');
  const topS = pickS.slice(0, 2).map((p) => p.s).join(',');
  const note =
    (reg < 0.4 ? `Risk-off ${(reg * 100) | 0}%` : reg > 0.65 ? `Risk-on ${(reg * 100) | 0}%` : `Neutral ${(reg * 100) | 0}%`) +
    (top ? ` · long ${top}` : ' · cash') +
    (topS && allowShort ? ` · short ${topS}` : '');

  return { targets, drift, note, nLong: pickL.length, nShort: pickS.length };
}

module.exports = {
  name: 'Compass',
  init(info) {
    allowShort = !!info.rules.allowShort;
    grossCap = ok(info.rules.maxGross) ? info.rules.maxGross : 1;
    longCap = allowShort ? Math.min(grossCap, 1.25) : Math.min(grossCap, 1);
    every = clamp(Math.round((info.periodsPerYear || 252) / 26), 4, 40);
    sectors = {};
    let any = false;
    for (const a of info.assets) {
      sectors[a.symbol] = a.sector || null;
      if (a.sector) any = true;
    }
    if (!any) sectors = null;
    lastStep = -1e9;
    noteCache = '';
  },
  onBar(state) {
    const pos = state.portfolio.positions || {};
    const A = state.assets;
    const final = state.steps > 0 && state.step >= state.steps - 1;

    let force = final;
    for (const s in pos) {
      const f = A[s] && A[s].f;
      if (!f) continue;
      const trend = trendOf(f);
      if (!ok(trend)) continue;
      const side = pos[s].side;
      if (side === 'long' && trend <= 0) force = true;
      if (side === 'short' && trend >= 0) force = true;
    }

    if (!force && state.step - lastStep < every) return null;

    const b = build(state);
    lastStep = state.step;

    if (!force && b.drift < 0.12) return null;
    if (b.nLong === 0 && b.nShort === 0 && Object.keys(pos).length === 0) return null;

    const note = b.note === noteCache ? undefined : b.note;
    noteCache = b.note;
    return { targets: b.targets, note };
  }
};
