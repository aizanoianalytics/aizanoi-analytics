'use strict';
// Flavius Coil -- Snake Royale bot.
//
// Strategy: paranoid alpha-beta minimax over simultaneous moves (me vs. the nearest rival,
// any further rivals are predicted with a cheap greedy policy), using an exact re-implementation
// of the engine's turn resolution (eat -> tail pop -> wall/storm/starve/body/head-on by length ->
// storm expansion). Leaves are scored with a storm-schedule-aware Voronoi territory count,
// reachable-space (tail-vacating) checks, hunger/food distance and length advantage.
// Iterative deepening with a wall-clock guard keeps every decision far below the 400 ms budget.

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const NAMES = ['up', 'down', 'left', 'right'];
const WIN = 100000;
const LOSS = -100000;
const DRAW = -3000;
const HARD_MS = 80;   // abort search after this
const SOFT_MS = 25;   // do not start another iteration after this
const MAX_DEPTH = 16;
const TIMEOUT = { timeout: true };

const nowFn = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? function () { return performance.now(); }
  : function () { return Date.now(); };

let W = 0, H = 0, N = 0, CAP = 0;
let RING0 = 0, NEXT_SHRINK = 1e9, EVERY = 20, T0 = 0, START_HEALTH = 100;
let edgeDist = null, blockedUntil = null, bodyStamp = null, owner = null, dist = null, queue = null, visitStamp = null;
let bodyStampVal = 0, visitVal = 0;
let ME = 0, OPP = -1, DUEL = true;
let nodes = 0, deadline = 0;
let lastMove = 0;

function setup(w, h) {
  if (w === W && h === H && edgeDist) return;
  W = w; H = h; N = W * H;
  CAP = Math.floor(Math.min(W, H) / 2) - 1;
  edgeDist = new Int16Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) edgeDist[y * W + x] = Math.min(x, y, W - 1 - x, H - 1 - y);
  blockedUntil = new Int16Array(N);
  bodyStamp = new Int32Array(N); bodyStampVal = 0;
  owner = new Int8Array(N);
  dist = new Int16Array(N);
  visitStamp = new Int32Array(N); visitVal = 0;
  queue = new Int32Array(N);
}

// Storm ring active during the collision check of turn T (T = turn about to execute).
function ringAt(T) {
  if (T - 1 < NEXT_SHRINK) return RING0;
  const r = RING0 + Math.floor((T - 1 - NEXT_SHRINK) / EVERY) + 1;
  return r > CAP ? CAP : r;
}

function buildRoot(state) {
  const snakes = new Array(state.snakes.length);
  for (let i = 0; i < state.snakes.length; i++) {
    const s = state.snakes[i];
    const body = new Array(s.body.length);
    for (let k = 0; k < s.body.length; k++) body[k] = s.body[k].y * W + s.body[k].x;
    snakes[i] = { body: body, len: body.length, health: s.health, alive: true, deathTurn: 0 };
  }
  const food = new Uint8Array(N);
  for (const f of state.food) if (f.x >= 0 && f.y >= 0 && f.x < W && f.y < H) food[f.y * W + f.x] = 1;
  return { turn: state.turn, snakes: snakes, food: food };
}

// blockedUntil[c] = number of moves until body cell c is vacated (0 = free now).
function fillBlocked(node) {
  blockedUntil.fill(0);
  const sn = node.snakes;
  for (let i = 0; i < sn.length; i++) {
    const s = sn[i];
    if (!s.alive) continue;
    const b = s.body, L = s.len;
    for (let k = 0; k < L; k++) {
      const c = b[k];
      if (c < 0) continue;
      const v = L - k;
      if (v > blockedUntil[c]) blockedUntil[c] = v;
    }
  }
}

// Exact engine step for one turn. moves[i] = direction index for snake i.
function simulate(node, moves) {
  const T = node.turn, ring = ringAt(T);
  const old = node.snakes, n = old.length;
  const snakes = new Array(n);
  const food = node.food;
  let newFood = null;
  for (let i = 0; i < n; i++) {
    const s = old[i];
    if (!s.alive) { snakes[i] = s; continue; }
    const m = moves[i];
    const h = s.body[0];
    const x = (h % W) + DX[m], y = ((h - (h % W)) / W) + DY[m];
    const inb = x >= 0 && y >= 0 && x < W && y < H;
    const nh = inb ? y * W + x : -1;
    const ate = inb && food[nh] === 1;
    const copyLen = ate ? s.len : s.len - 1;
    const body = new Array(copyLen + 1);
    body[0] = nh;
    for (let k = 0; k < copyLen; k++) body[k + 1] = s.body[k];
    if (ate) { if (!newFood) newFood = food.slice(); newFood[nh] = 0; }
    snakes[i] = { body: body, len: copyLen + 1, health: ate ? START_HEALTH : s.health - 1, alive: true, deathTurn: 0, inb: inb };
  }
  bodyStampVal++;
  const st = bodyStampVal;
  for (let i = 0; i < n; i++) {
    const s = snakes[i];
    if (!old[i].alive) continue;
    const b = s.body;
    for (let k = 1; k < s.len; k++) if (b[k] >= 0) bodyStamp[b[k]] = st;
  }
  for (let i = 0; i < n; i++) {
    if (!old[i].alive) continue;
    const s = snakes[i];
    const hc = s.body[0];
    let dead = false;
    if (!s.inb) dead = true;
    else if (edgeDist[hc] < ring) dead = true;
    else if (s.health <= 0) dead = true;
    else if (bodyStamp[hc] === st) dead = true;
    else {
      for (let j = 0; j < n; j++) {
        if (j === i || !old[j].alive) continue;
        const t = snakes[j];
        if (t.body[0] === hc && t.len >= s.len) { dead = true; break; }
      }
    }
    if (dead) { s.alive = false; s.deathTurn = T; }
  }
  const ring2 = ringAt(T + 1);
  let f = newFood || food;
  if (ring2 > ring) {
    if (!newFood) f = food.slice();
    for (let c = 0; c < N; c++) if (f[c] && edgeDist[c] < ring2) f[c] = 0;
  }
  return { turn: T + 1, snakes: snakes, food: f };
}

// Moves that are not immediately fatal (wall, active storm, non-vacating body).
function candidates(node, idx) {
  const s = node.snakes[idx];
  const ring = ringAt(node.turn);
  const h = s.body[0];
  const hx = h % W, hy = (h - hx) / W;
  const res = [];
  for (let d = 0; d < 4; d++) {
    const x = hx + DX[d], y = hy + DY[d];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const c = y * W + x;
    if (edgeDist[c] < ring) continue;
    if (blockedUntil[c] > 1) continue;
    res.push(d);
  }
  if (res.length === 0) {
    for (let d = 0; d < 4; d++) {
      const x = hx + DX[d], y = hy + DY[d];
      if (x >= 0 && y >= 0 && x < W && y < H) res.push(d);
    }
    if (res.length === 0) res.push(0);
  }
  return res;
}

// Cheap greedy policy for rivals that are not inside the minimax tree. Requires fillBlocked(node).
function predictMove(node, idx) {
  const s = node.snakes[idx];
  const ring = ringAt(node.turn);
  const h = s.body[0];
  const hx = h % W, hy = (h - hx) / W;
  const food = node.food;
  let bestD = -1, bestS = -Infinity;
  let prevD = -1;
  if (s.len > 1 && s.body[1] !== h && s.body[1] >= 0) {
    const p = s.body[1];
    const px = p % W, py = (p - px) / W;
    for (let d = 0; d < 4; d++) if (hx - px === DX[d] && hy - py === DY[d]) prevD = d;
  }
  for (let d = 0; d < 4; d++) {
    const x = hx + DX[d], y = hy + DY[d];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const c = y * W + x;
    let sc = 0;
    if (edgeDist[c] < ring) sc -= 1000;
    if (blockedUntil[c] > 1) sc -= 1000;
    for (let j = 0; j < node.snakes.length; j++) {
      if (j === idx) continue;
      const t = node.snakes[j];
      if (!t.alive || t.len < s.len) continue;
      const th = t.body[0];
      const tx = th % W, ty = (th - tx) / W;
      if (Math.abs(tx - x) + Math.abs(ty - y) === 1) sc -= 60;
    }
    let fd = 1e9;
    for (let c2 = 0; c2 < N; c2++) {
      if (!food[c2]) continue;
      const fx = c2 % W, fy = (c2 - fx) / W;
      const dd = Math.abs(fx - x) + Math.abs(fy - y);
      if (dd < fd) fd = dd;
    }
    if (fd < 1e9) sc -= fd * (s.health < 40 ? 3 : 1);
    sc += Math.min(edgeDist[c], 3) * 0.7;
    if (d === prevD) sc += 0.5;
    if (sc > bestS) { bestS = sc; bestD = d; }
  }
  return bestD < 0 ? 0 : bestD;
}

// Multi-source BFS: territory per snake (ties go to the longer snake; equal -> nobody).
const counts = new Int32Array(16);
function voronoi(node) {
  const sn = node.snakes, n = sn.length, T = node.turn;
  visitVal++;
  const vs = visitVal;
  let qh = 0, qt = 0;
  for (let k = 0; k < n; k++) {
    counts[k] = 0;
    const s = sn[k];
    if (!s.alive) continue;
    const c = s.body[0];
    visitStamp[c] = vs; owner[c] = k; dist[c] = 0; queue[qt++] = c;
  }
  while (qh < qt) {
    const c = queue[qh++];
    const o = owner[c];
    if (o < 0) continue;
    const d = dist[c] + 1;
    const r = ringAt(T + d - 1);
    const x = c % W, y = (c - x) / W;
    const lo = sn[o].len;
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DX[dir], ny = y + DY[dir];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nc = ny * W + nx;
      if (edgeDist[nc] < r) continue;
      if (blockedUntil[nc] > d) continue;
      if (visitStamp[nc] !== vs) {
        visitStamp[nc] = vs; owner[nc] = o; dist[nc] = d; queue[qt++] = nc; counts[o]++;
      } else if (dist[nc] === d && owner[nc] !== o && owner[nc] >= 0) {
        const o2 = owner[nc];
        const l2 = sn[o2].len;
        if (lo > l2) { owner[nc] = o; counts[o]++; counts[o2]--; }
        else if (lo === l2) { owner[nc] = -1; counts[o2]--; }
      }
    }
  }
}

// Single-snake BFS: reachable cell count and distance to nearest food.
let soloReach = 0, soloFood = -1;
function solo(node, idx) {
  const s = node.snakes[idx], T = node.turn, food = node.food;
  visitVal++;
  const vs = visitVal;
  let qh = 0, qt = 0, reach = 0, fd = -1;
  const c0 = s.body[0];
  visitStamp[c0] = vs; dist[c0] = 0; queue[qt++] = c0;
  while (qh < qt) {
    const c = queue[qh++];
    const d = dist[c] + 1;
    const r = ringAt(T + d - 1);
    const x = c % W, y = (c - x) / W;
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + DX[dir], ny = y + DY[dir];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nc = ny * W + nx;
      if (edgeDist[nc] < r) continue;
      if (blockedUntil[nc] > d) continue;
      if (visitStamp[nc] === vs) continue;
      visitStamp[nc] = vs; dist[nc] = d; queue[qt++] = nc; reach++;
      if (fd < 0 && food[nc]) fd = d;
    }
  }
  soloReach = reach; soloFood = fd;
}

function evaluate(node) {
  const sn = node.snakes, n = sn.length;
  const me = sn[ME];
  const plies = node.turn - T0;
  let aliveOpp = 0, deadOpp = 0;
  for (let i = 0; i < n; i++) { if (i === ME) continue; if (sn[i].alive) aliveOpp++; else deadOpp++; }
  if (!me.alive) {
    if (DUEL) {
      const o = sn[OPP];
      if (!o.alive && o.deathTurn === me.deathTurn) {
        if (me.len > o.len) return WIN * 0.9 - plies * 10;
        if (me.len < o.len) return LOSS * 0.9 + plies * 10;
        return DRAW + plies * 10;
      }
    }
    return LOSS + deadOpp * 2000 + plies * 60;
  }
  if (aliveOpp === 0) return WIN - plies * 10;

  fillBlocked(node);
  voronoi(node);
  const myT = counts[ME];
  const opp = (OPP >= 0 && sn[OPP].alive) ? sn[OPP] : null;
  let score = 0;
  const tw = DUEL ? 10 : 7;
  score += myT * tw;
  if (opp) score -= counts[OPP] * (DUEL ? 10 : 5);

  solo(node, ME);
  const myReach = soloReach, foodDist = soloFood;
  if (myReach < me.len) score -= 1500 + (me.len - myReach) * 120;
  else if (myReach < 2 * me.len) score -= (2 * me.len - myReach) * 8;

  if (opp) {
    solo(node, OPP);
    if (soloReach < opp.len) score += 800 + (opp.len - soloReach) * 80;
    let ld = me.len - opp.len;
    if (ld > 4) ld = 4; else if (ld < -4) ld = -4;
    score += ld * 60;
  }

  // Hunger / growth.
  const hp = me.health;
  if (foodDist < 0) {
    if (hp < 45) score -= (45 - hp) * 50;
  } else if (foodDist >= hp) {
    score -= 3000;
  } else {
    let w = hp > 60 ? 1.2 : hp > 35 ? 4 : 12;
    if (opp && me.len <= opp.len) w += 3;
    const ring = ringAt(node.turn);
    if (ring >= 2 && hp > 50 && opp && me.len > opp.len + 1) w = 0.3;
    score -= w * foodDist;
  }
  score -= (START_HEALTH - hp) * 0.4;

  if (!DUEL) {
    score -= aliveOpp * 300;
    // Head-on danger from rivals outside the search tree.
    const h = me.body[0];
    const hx = h % W, hy = (h - hx) / W;
    for (let i = 0; i < n; i++) {
      if (i === ME || i === OPP) continue;
      const t = sn[i];
      if (!t.alive || t.len < me.len) continue;
      const th = t.body[0];
      const tx = th % W, ty = (th - tx) / W;
      const dd = Math.abs(tx - hx) + Math.abs(ty - hy);
      if (dd <= 2) score -= 250;
    }
  }
  return score;
}

function search(node, depth, alpha, beta) {
  const sn = node.snakes;
  const me = sn[ME];
  if (!me.alive || depth === 0) return evaluate(node);
  let anyOpp = false;
  for (let i = 0; i < sn.length; i++) if (i !== ME && sn[i].alive) { anyOpp = true; break; }
  if (!anyOpp) return evaluate(node);
  nodes++;
  if ((nodes & 7) === 0 && nowFn() > deadline) throw TIMEOUT;

  fillBlocked(node);
  const base = new Array(sn.length);
  for (let i = 0; i < sn.length; i++) {
    base[i] = 0;
    if (i === ME || i === OPP || !sn[i].alive) continue;
    base[i] = predictMove(node, i);
  }
  const myMoves = candidates(node, ME);
  const oppAlive = OPP >= 0 && sn[OPP].alive;
  const oppMoves = oppAlive ? candidates(node, OPP) : [0];
  let best = -Infinity;
  for (let a = 0; a < myMoves.length; a++) {
    let worst = Infinity;
    for (let b = 0; b < oppMoves.length; b++) {
      const mv = base.slice();
      mv[ME] = myMoves[a];
      if (oppAlive) mv[OPP] = oppMoves[b];
      const child = simulate(node, mv);
      const v = search(child, depth - 1, alpha, worst < beta ? worst : beta);
      if (v < worst) worst = v;
      if (worst <= alpha) break;
    }
    if (worst > best) best = worst;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function rootSearch(node, depth, order, riskPenalty) {
  const sn = node.snakes;
  fillBlocked(node);
  const base = new Array(sn.length);
  for (let i = 0; i < sn.length; i++) {
    base[i] = 0;
    if (i === ME || i === OPP || !sn[i].alive) continue;
    base[i] = predictMove(node, i);
  }
  const oppAlive = OPP >= 0 && sn[OPP].alive;
  const oppMoves = oppAlive ? candidates(node, OPP) : [0];
  const values = new Array(order.length);
  let alpha = -Infinity;
  let bestMove = order[0], bestVal = -Infinity;
  for (let a = 0; a < order.length; a++) {
    const m = order[a];
    let worst = Infinity;
    for (let b = 0; b < oppMoves.length; b++) {
      const mv = base.slice();
      mv[ME] = m;
      if (oppAlive) mv[OPP] = oppMoves[b];
      const child = simulate(node, mv);
      const v = search(child, depth - 1, alpha, worst);
      if (v < worst) worst = v;
      if (worst <= alpha) break;
    }
    const val = worst - (riskPenalty[m] || 0);
    values[a] = val;
    if (val > bestVal) { bestVal = val; bestMove = m; }
    if (val > alpha) alpha = val;
  }
  const idx = order.map((m, i) => i).sort((i, j) => values[j] - values[i]);
  return { move: bestMove, value: bestVal, order: idx.map(i => order[i]) };
}

function safeFallback(state) {
  const me = state.you;
  const occ = new Set();
  for (const s of state.snakes) for (let k = 0; k < s.body.length - 1; k++) occ.add(s.body[k].y * W + s.body[k].x);
  for (const h of state.hazards) occ.add(h.y * W + h.x);
  for (let d = 0; d < 4; d++) {
    const x = me.head.x + DX[d], y = me.head.y + DY[d];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (occ.has(y * W + x)) continue;
    return NAMES[d];
  }
  return NAMES[lastMove] || 'up';
}

function decide(state) {
  const start = nowFn();
  setup(state.width, state.height);
  T0 = state.turn;
  NEXT_SHRINK = (typeof state.nextShrinkTurn === 'number' && state.nextShrinkTurn >= T0) ? state.nextShrinkTurn : 1e9;
  EVERY = 20;
  // Current ring from the active hazard list.
  const hz = new Uint8Array(N);
  for (const h of state.hazards || []) if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) hz[h.y * W + h.x] = 1;
  RING0 = 0;
  while (RING0 < CAP && hz[RING0 * W + RING0]) RING0++;
  START_HEALTH = 100;
  for (const s of state.snakes) if (s.health > START_HEALTH) START_HEALTH = s.health;

  const node = buildRoot(state);
  ME = -1;
  for (let i = 0; i < state.snakes.length; i++) if (state.snakes[i].id === state.you.id) ME = i;
  if (ME < 0) return safeFallback(state);
  const meS = state.you;
  OPP = -1;
  let bestD = 1e9;
  for (let i = 0; i < state.snakes.length; i++) {
    if (i === ME) continue;
    const s = state.snakes[i];
    const dd = Math.abs(s.head.x - meS.head.x) + Math.abs(s.head.y - meS.head.y);
    if (dd < bestD) { bestD = dd; OPP = i; }
  }
  DUEL = state.snakes.length === 2;

  fillBlocked(node);
  let order = candidates(node, ME);
  if (order.length === 1) { lastMove = order[0]; return NAMES[order[0]]; }

  // Root risk: cells a non-modelled, not-shorter rival could also enter this turn.
  const riskPenalty = [0, 0, 0, 0];
  if (!DUEL) {
    for (const m of order) {
      const x = meS.head.x + DX[m], y = meS.head.y + DY[m];
      for (let i = 0; i < state.snakes.length; i++) {
        if (i === ME || i === OPP) continue;
        const s = state.snakes[i];
        if (s.length < meS.length) continue;
        if (Math.abs(s.head.x - x) + Math.abs(s.head.y - y) === 1) riskPenalty[m] += 2500;
      }
    }
  }

  deadline = start + HARD_MS;
  nodes = 0;
  let bestMove = order[0];
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    if (nowFn() - start > SOFT_MS) break;
    let res;
    try {
      res = rootSearch(node, depth, order, riskPenalty);
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
    bestMove = res.move;
    order = res.order;
    if (res.value > WIN / 2 || res.value < LOSS / 2) break;
  }
  lastMove = bestMove;
  return NAMES[bestMove];
}

function move(state) {
  try {
    if (!state || !state.you || !state.snakes) return NAMES[lastMove] || 'up';
    return decide(state);
  } catch (e) {
    try { return safeFallback(state); } catch (e2) { return 'up'; }
  }
}

module.exports = { name: 'Flavius Coil', move: move };
