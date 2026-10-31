'use strict';
// Opus Warden: Voronoi-territory ghosts + safe-region runners.

const DIRN = ['up', 'right', 'down', 'left'];
const DV = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0], stay: [0, 0] };
const INF = 30000;
let TGTW = +(globalThis.TGTW || 40);
const PRED = { tick: -1, m: {} };
const RMEM = { t: -1, tick: -5 };
let PW_R = +(globalThis.PW_R || 6), PW_D = +(globalThis.PW_D || 14), PW_K = +(globalThis.PW_K || 80);
let RCAP = +(globalThis.RCAP || 32);
let RMODE = +(globalThis.RMODE ?? 1), RA = +(globalThis.RA || 40);
let G = null; // static graph cache

function buildGraph(state) {
  const w = state.width, h = state.height, grid = state.grid, row = state.tunnelRow;
  const N = w * h;
  const cellT = new Array(N); // 0 wall, 1 floor, 2 pen, 3 door
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grid[y][x];
    cellT[y * w + x] = c === '#' ? 0 : c === 'G' ? 2 : c === '-' ? 3 : 1;
  }
  // neighbours by direction index (-1 if illegal)
  const rN = new Int32Array(N * 4).fill(-1);
  const gN = new Int32Array(N * 4).fill(-1);
  const doors = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = cellT[i];
    if (!t) continue;
    if (t === 3) doors.push(i);
    for (let d = 0; d < 4; d++) {
      const v = DV[DIRN[d]];
      let nx = x + v[0];
      const ny = y + v[1];
      if (y === row) nx = (nx + w) % w;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const j = ny * w + nx, u = cellT[j];
      if (!u) continue;
      if (t === 1 && u === 1) rN[i * 4 + d] = j;
      // ghost rules
      if (t === 2 && u === 1) continue;
      if (u === 2 && t === 1) continue;
      gN[i * 4 + d] = j;
    }
  }
  G = { w, h, N, cellT, rN, gN, doors, cache: new Map(), key: grid.join('|').replace(/[.o]/g, ' ') };
}

// BFS single source, cached
function distFrom(src, ghost) {
  const k = src * 2 + (ghost ? 1 : 0);
  let d = G.cache.get(k);
  if (d) return d;
  if (G.cache.size > 2500) G.cache.clear();
  d = bfs([src], [0], ghost);
  G.cache.set(k, d);
  return d;
}

function bfs(srcs, times, ghost, blockFn) {
  const N = G.N, nb = ghost ? G.gN : G.rN;
  const d = new Int16Array(N).fill(INF);
  // bucketed queue since times may differ
  const order = srcs.map((s, i) => [s, times[i]]).sort((a, b) => a[1] - b[1]);
  const q = new Int32Array(N + srcs.length + 4);
  let qh = 0, qt = 0, oi = 0;
  // simple approach: process with deque using pending sources
  while (oi < order.length || qh < qt) {
    // push sources whose time <= current front
    if (qh === qt || (oi < order.length && order[oi][1] <= d[q[qh]])) {
      const [s, t] = order[oi++];
      if (t < d[s]) { d[s] = t; q[qt++] = s; }
      continue;
    }
    const i = q[qh++];
    const di = d[i] + 1;
    for (let k = 0; k < 4; k++) {
      const j = nb[i * 4 + k];
      if (j < 0 || d[j] <= di) continue;
      if (blockFn && blockFn(j, di)) continue;
      d[j] = di;
      q[qt++] = j;
    }
  }
  return d;
}

function idx(a) { return a.y * G.w + a.x; }

function legalMoves(state, a) {
  const res = [];
  const i = idx(a);
  const ghost = a.role === 'ghost';
  const nb = ghost ? G.gN : G.rN;
  for (let d = 0; d < 4; d++) {
    const j = nb[i * 4 + d];
    if (j < 0) continue;
    if (ghost && a.inPen && a.releaseIn > 1 && G.cellT[j] !== 2) continue;
    res.push([DIRN[d], j]);
  }
  res.push(['stay', i]);
  return res;
}

// time at which a ghost becomes a catching threat at each cell
function ghostThreatTimes(state, g, startPos, startTime) {
  const F = state.frightTicksLeft;
  const res = new Int32Array(G.N).fill(INF);
  const src = startPos === undefined ? idx(g) : startPos;
  const t0 = startTime || 0;
  const d = distFrom(src, true);
  let rel = 0;
  if (g.inPen && g.releaseIn > 0 && startPos === undefined) rel = g.releaseIn;
  const fr = g.frightened && F > 0;
  const mF = fr ? Math.floor(F / 2) : 0;
  for (let c = 0; c < G.N; c++) {
    let dc = d[c];
    if (dc >= INF) continue;
    if (G.cellT[c] !== 1) continue;
    let t = dc + t0;
    if (rel) {
      // need to pass a door at time >= rel
      let best = INF;
      for (const door of G.doors) {
        const dd = d[door];
        if (dd >= INF) continue;
        const dd2 = distFrom(door, true)[c];
        if (dd2 >= INF) continue;
        best = Math.min(best, Math.max(dd, rel) + dd2);
      }
      t = best;
    }
    if (fr) t = F + Math.max(0, t - mF);
    res[c] = t;
  }
  return res;
}

function pickupList(state) {
  const list = [];
  const grid = state.grid, w = G.w;
  for (let y = 0; y < G.h; y++) {
    const r = grid[y];
    for (let x = 0; x < w; x++) {
      const c = r[x];
      if (c === '.' || c === 'o') list.push(y * w + x);
    }
  }
  return list;
}

// ---------------- RUNNER ----------------
function runnerMove(state, meArg) {
  const me = meArg || state.you;
  const myIdx = state.runners.findIndex(r => r.id === me.id);
  const mi = idx(me);
  const moves = legalMoves(state, me);
  const F = state.frightTicksLeft;
  const prot = me.invulnerable ? me.invulnerableTicksLeft : 0;
  const ghosts = state.ghosts;
  // combined ghost threat time per cell
  const threat = new Int32Array(G.N).fill(INF);
  for (const g of ghosts) {
    if (g.frightImmune === false && g.frightened && F > 0) {
      // frightened: threat after fright
    }
    const t = ghostThreatTimes(state, g);
    for (let c = 0; c < G.N; c++) if (t[c] < threat[c]) threat[c] = t[c];
  }
  const pick = pickupList(state);
  const isPick = new Uint8Array(G.N);
  for (const p of pick) isPick[p] = state.grid[Math.floor(p / G.w)][p % G.w] === 'o' ? 2 : 1;
  const tmDist = [], tmStrict = [];
  state.runners.forEach((r, j) => {
    if (r.id === me.id || !r.alive || r.respawnIn) return;
    if (j < myIdx) {
      if (PRED.tick !== state.tick) { PRED.tick = state.tick; PRED.m = {}; }
      const pd = PRED.m[r.id] || (PRED.m[r.id] = runnerMove(state, r));
      const v = DV[pd];
      let nx = r.x + v[0]; const ny = r.y + v[1];
      if (r.y === state.tunnelRow) nx = (nx + G.w) % G.w;
      let ni = ny * G.w + nx; if (G.cellT[ni] !== 1) ni = idx(r);
      tmDist.push(distFrom(ni, false)); tmStrict.push(false);
    } else { tmDist.push(distFrom(idx(r), false)); tmStrict.push(true); }
  });
  const anyThreatNear = (() => { let m = INF; for (const g of ghosts) { if (!g.frightened && !g.inPen) { const dd = distFrom(idx(g), true)[mi]; if (dd < m) m = dd; } } return m; })();

  // edible ghosts
  const edible = ghosts.filter(g => g.frightened && !g.inPen && F > 0);

  // committed target pickup
  let tgt = -1;
  if (!meArg) {
    const mem = RMEM;
    if (mem.t >= 0 && isPick[mem.t] && mem.tick === state.tick - 1) tgt = mem.t;
    else {
      const ud = distFrom(mi, false);
      let bv = INF;
      for (const p of pick) {
        let v = ud[p];
        if (threat[p] <= v) v += 30;
        for (let q = 0; q < tmDist.length; q++) if (tmDist[q][p] < ud[p]) v += 15;
        if (v < bv) { bv = v; tgt = p; }
      }
    }
    RMEM.t = tgt; RMEM.tick = state.tick;
  }
  const tgtD = tgt >= 0 ? distFrom(tgt, false) : null;
  let best = null, bestScore = -INF;
  for (const [dir, n] of moves) {
    // immediate danger
    let score = 0;
    const safeNow = prot >= 2 || threat[n] > 1;
    // also swap: ghost currently at n moving into me: threat[n]==0 covers
    if (!safeNow) score -= 1e6;
    // safe-region BFS from n starting time 1
    const rd = bfs([n], [1], false, (j, t) => t >= threat[j] && t > prot);
    let region = 0, pelVal = 0, nearest = INF, cnt = 0;
    for (let c = 0; c < G.N; c++) {
      const t = rd[c];
      if (t >= INF) continue;
      region++;
      if (isPick[c]) {
        let share = 1;
        for (let q = 0; q < tmDist.length; q++) { const tt = tmDist[q][c] + 1; if (tmStrict[q] ? tt < t : tt <= t) share = 0.2; }
        let v = isPick[c] === 2 ? powerValue(state, t, anyThreatNear, edible.length) : 1;
        pelVal += v * share / ((t) * (t));
        if (t < nearest) nearest = t;
        cnt++;
      }
    }
    // safety margin of the next cell
    const margin = Math.min(threat[n] - 1, 12);
    const rw = me.lives >= 2 ? Math.max(0.2, 1.2 - 1.2 * state.tick / state.maxTicks) : 1;
    score += (RMODE ? RA * Math.log2(1 + Math.min(region, RCAP)) : Math.min(region, RCAP) * 15) * rw + Math.min(region, 40) * 0.5 + margin * 0.5;
    score += pelVal * 60 + (nearest < INF ? 40 / nearest : 0);
    if (!cnt) {
      // no pickup reachable safely: head toward nearest pickup anyway (unrestricted)
      const ud = distFrom(n, false);
      let m = INF;
      for (const p of pick) if (ud[p] < m) m = ud[p];
      score += (60 + 300 * state.tick / state.maxTicks) / (m + 1);
    }
    // hunting edible ghosts
    for (const g of edible) {
      const gi = idx(g);
      const dd = distFrom(n, false)[gi];
      if (dd >= INF) continue;
      // ghost may flee at half speed; require time
      if (dd * 2 + 2 < F) score += (state.nextGhostPoints / 200) * 25 / (dd + 1);
      if (dd === 0 || (n === gi)) score += 200;
    }
    // swap-eat check: ghost at n moving into my cell also counts; fine
    if (dir === me.dir) score += 0.5;
    if (tgtD) score += (tgtD[mi] - tgtD[n]) * TGTW;
    for (const td of tmDist) { const dd = td[n]; if (dd < 4) score -= (4 - dd) * 6; }
    if (dir === 'stay') score -= 1;
    if (!meArg && globalThis.DBG) console.log(state.tick, me.id, dir, n % G.w, Math.floor(n / G.w), "reg", region, "pel", pelVal.toFixed(3), "near", nearest, "thr", threat[n], "S", score.toFixed(1));
    if (score > bestScore) { bestScore = score; best = dir; }
  }
  return best || 'stay';
}

function powerValue(state, t, threatDist, nEdible) {
  // power pellets are valuable when ghosts are near; otherwise save them
  if (state.pellets <= 4) return 3;
  const near = threatDist < 10 ? 6 : threatDist < 18 ? 1.5 : 0.25;
  if (state.frightTicksLeft > 15) return 0.2;
  return near;
}

// ---------------- GHOST ----------------
let memo = { tick: -1, plan: null };

function ghostPlan(state) {
  // deterministic sequential plan for all ghosts
  const ghosts = state.ghosts;
  const runners = state.runners.filter(r => r.alive && !r.respawnIn);
  const F = state.frightTicksLeft;
  const plan = {};
  const pick = pickupList(state);
  const pickW = new Float32Array(G.N);
  const total = pick.length;
  for (const p of pick) pickW[p] = total < 40 ? 6 : 2;
  const decided = []; // [cellIdx, time]
  const rDist = runners.map(r => distFrom(idx(r), false));
  const powers = state.powerPellets.map(p => p.y * G.w + p.x);
  for (let k = 0; k < ghosts.length; k++) {
    const g = ghosts[k];
    const moves = legalMoves(state, g);
    const fr = g.frightened && F > 0;
    const halt = fr && ((state.tick + 1) % 2 === 1);
    let best = 'stay', bestS = -INF, bestCell = idx(g);
    for (const [dir, n] of moves) {
      const cell = halt ? idx(g) : n;
      let s;
      if (fr) s = frightScore(state, g, cell, runners, rDist, F);
      else s = huntScore(state, g, k, cell, ghosts, decided, runners, rDist, pickW, powers, F);
      if (dir === g.dir) s += 0.01;
      if (s > bestS) { bestS = s; best = dir; bestCell = cell; }
    }
    plan[g.id] = best;
    decided.push(bestCell);
  }
  return plan;
}

function frightScore(state, g, cell, runners, rDist, F) {
  const ct = G.cellT[cell];
  if (ct === 2 || ct === 3) return F < 4 ? 900 : 3000;
  let minD = INF;
  for (const rd of rDist) if (rd[cell] < minD) minD = rd[cell];
  if (!rDist.length) return 0;
  const rMin = (c) => { let m = INF; for (const rd of rDist) if (rd[c] < m) m = rd[c]; return m; };
  let s = 0;
  if (minD <= 1) s -= 5000;
  // safe flood toward pen, ghost needs ~2 ticks per step while frightened
  const seen = new Map(); seen.set(cell, 0);
  const q = [cell]; let penK = -1, region = 0;
  for (let h = 0; h < q.length && region < 300; h++) {
    const c = q[h], k = seen.get(c);
    if (G.cellT[c] !== 1) { penK = k; break; }
    region++;
    for (let d = 0; d < 4; d++) {
      const j = G.gN[c * 4 + d];
      if (j < 0 || seen.has(j)) continue;
      const tg = 1 + 2 * (k + 1);
      if (G.cellT[j] === 1 && rMin(j) <= Math.min(tg, F + k + 1)) continue;
      seen.set(j, k + 1); q.push(j);
    }
  }
  if (penK >= 0 && F > 2 * penK) s += 2000 - penK * 10;
  s += Math.min(region, 40) * 5 + Math.min(minD, 30) * 10;
  if (F < 6) s -= minD * 4;
  return s;
}

function huntScore(state, g, k, cell, ghosts, decided, runners, rDist, pickW, powers, F) {
  if (!runners.length) {
    // guard pellets: move toward pickups centroid / stay near pellets
    return -nearestPick(cell, pickW);
  }
  // multi-source ghost times: decided ghosts at time 1, me at time 1, later ghosts at current pos time 0
  const srcs = [cell], times = [1];
  for (let j = 0; j < ghosts.length; j++) {
    if (j === k) continue;
    const o = ghosts[j];
    if (o.frightened && F > 0) continue;
    if (j < k) { srcs.push(decided[j]); times.push(1); }
    else {
      if (o.inPen && o.releaseIn > 0) {
        for (const d of G.doors) { srcs.push(d); times.push(Math.max(o.releaseIn, distFrom(idx(o), true)[d])); }
      } else { srcs.push(idx(o)); times.push(0); }
    }
  }
  const gd = bfs(srcs, times, true);
  let terr = 0, s = 0;
  const myD = distFrom(cell, true);
  for (let r = 0; r < runners.length; r++) {
    const rr = runners[r];
    const rd = rDist[r];
    const ri = idx(rr);
    let t = 0;
    for (let c = 0; c < G.N; c++) {
      if (rd[c] < gd[c]) t += 1 + pickW[c];
    }
    const w = rr.invulnerable ? 0.5 : 1;
    terr += t * w;
    // capture
    const dm = myD[ri];
    if (!rr.invulnerable || rr.invulnerableTicksLeft <= 1) {
      if (cell === ri) s += 5000;
    }
    s -= dm * 0.5 * w;
    // power pellet danger: runner close to a power, me close to runner
    for (const p of powers) {
      const rp = rd[p];
      if (rp <= PW_R && myD[p] > rp && !(F > rp + 2)) { const need = PW_D - rp; if (dm < need) s -= (need - dm) * PW_K; }
    }
  }
  s -= terr;
  return s;
}

function nearestPick(cell, pickW) {
  const d = distFrom(cell, true);
  let m = INF;
  for (let c = 0; c < G.N; c++) if (pickW[c] && d[c] < m) m = d[c];
  return m;
}

function ghostMove(state) {
  if (memo.tick !== state.tick || !memo.plan) {
    memo = { tick: state.tick, plan: ghostPlan(state) };
  }
  return memo.plan[state.you.id] || 'stay';
}

function move(state) {
  try {
    const key = state.grid.join('|').replace(/[.o]/g, ' ');
    if (!G || G.key !== key || G.w !== state.width) buildGraph(state);
    const me = state.you;
    if (!me.alive || me.respawnIn) return 'stay';
    const r = me.role === 'ghost' ? ghostMove(state) : runnerMove(state);
    return r;
  } catch (e) {
    return 'stay';
  }
}

module.exports = { name: 'Opus Warden', move };

// JIT warm-up during import (startup budget is generous); state is reset afterwards.
(function warmup() {
  try {
    const E = (typeof MazeEngine !== 'undefined' && MazeEngine) || null;
    if (!E || !E.create) return;
    const seats = [{ id: 'a', role: 'runner' }, { id: 'b', role: 'runner' },
      { id: 'x', role: 'ghost' }, { id: 'y', role: 'ghost' }, { id: 'z', role: 'ghost' }];
    const game = E.create(seats, { seed: 12345, layout: 'generated', width: 41, height: 41, maxTicks: 60 });
    for (let t = 0; t < 40 && !game.finished(); t++) {
      const mv = {};
      for (const s of seats) {
        mv[s.id] = move(game.botState(s.id));
      }
      game.step(mv);
    }
  } catch (e) { /* ignore */ }
  G = null; memo = { tick: -1, plan: null };
  RMEM.t = -1; RMEM.tick = -5; PRED.tick = -1; PRED.m = {};
})();
