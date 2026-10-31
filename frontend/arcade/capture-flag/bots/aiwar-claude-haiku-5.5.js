'use strict';

// Haiku Sentinel: deterministic role-based planner.
// - Only enemy defenders standing in the enemy half can tag us, and only when
//   we are inside that half. So attackers plan time-aware safe routes through
//   enemy territory (BFS with a per-cell arrival-time danger check).
// - Our defenders are never tagged inside our own half, so they hunt invaders
//   and intercept enemy carriers using predicted carrier paths.
// - Teammates compute the same plan from the same state, so roles stay consistent.

const BOT_NAME = 'Haiku Sentinel';
const INF = 1e9;
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const EMERGENCY_RADIUS = 12;
const STALL_TICKS = 1e9; // stall aggression disabled: it traded jailings for little
const ACTIONS = ['up', 'down', 'left', 'right', 'stay'];

// Per-seat memory (persists within one game only).
let memTick = -1;
let memScoreKey = -1;
let memLastChange = 0;

function isActive(a) {
  return !!a && !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null;
}

function other(team) {
  return team === 'west' ? 'east' : 'west';
}

function inHalf(team, x, border) {
  return team === 'west' ? x < border : x > border;
}

function byId(a, b) {
  const sa = String(a.id);
  const sb = String(b.id);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function makeCtx(state) {
  const W = state.width;
  const H = state.height;
  const N = W * H;
  const open = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) open[y * W + x] = state.grid[y][x] !== '#' ? 1 : 0;
  }
  return { W, H, N, open, B: state.border };
}

// Multi-source BFS. mask (optional) restricts the cells that may be visited.
function bfs(ctx, sources, mask) {
  const { W, H, N, open } = ctx;
  const dist = new Int32Array(N).fill(INF);
  const q = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  for (const s of sources) {
    if (s >= 0 && s < N && open[s] && dist[s] === INF && (!mask || mask[s])) {
      dist[s] = 0;
      q[qt++] = s;
    }
  }
  while (qh < qt) {
    const c = q[qh++];
    const x = c % W;
    const y = (c - x) / W;
    const d = dist[c] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!open[n] || dist[n] !== INF || (mask && !mask[n])) continue;
      dist[n] = d;
      q[qt++] = n;
    }
  }
  return dist;
}

// Earliest-arrival BFS from start to any goal cell. allowed(cell, step) gates
// entering a cell at the given step. Returns the first cell to step onto
// (start itself means stay), or -1 when no route exists.
function firstStep(ctx, start, goal, allowed) {
  if (goal[start]) return start;
  const { W, H, N, open } = ctx;
  const par = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const dep = new Int32Array(N);
  const q = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  q[qt++] = start;
  seen[start] = 1;
  let found = -1;
  while (qh < qt && found < 0) {
    const c = q[qh++];
    const x = c % W;
    const y = (c - x) / W;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!open[n] || seen[n]) continue;
      if (allowed && !allowed(n, dep[c] + 1)) continue;
      seen[n] = 1;
      par[n] = c;
      dep[n] = dep[c] + 1;
      if (goal[n]) {
        found = n;
        break;
      }
      q[qt++] = n;
    }
  }
  if (found < 0) return -1;
  let c = found;
  while (par[c] !== start) c = par[c];
  return c;
}

// Greedy descent along a distance field, used to predict a runner's route.
function gradientPath(ctx, dist, start, maxLen) {
  const { W, H } = ctx;
  const path = [start];
  let c = start;
  for (let i = 0; i < maxLen && dist[c] > 0 && dist[c] < INF; i++) {
    const x = c % W;
    const y = (c - x) / W;
    let best = -1;
    let bd = dist[c];
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] < bd) {
        bd = dist[n];
        best = n;
      }
    }
    if (best < 0) break;
    c = best;
    path.push(c);
  }
  return path;
}

function singleMask(N, i) {
  const m = new Uint8Array(N);
  if (i >= 0 && i < N) m[i] = 1;
  return m;
}

function toAction(W, from, to) {
  if (to < 0 || to === from) return 'stay';
  const dx = (to % W) - (from % W);
  const dy = Math.floor(to / W) - Math.floor(from / W);
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return 'stay';
}

function decide(state) {
  // Per-game memory bookkeeping.
  if (state.tick < memTick) memLastChange = state.tick;
  memTick = state.tick;
  const scoreKey = state.score.west * 1000 + state.score.east;
  if (scoreKey !== memScoreKey) {
    memScoreKey = scoreKey;
    memLastChange = state.tick;
  }
  const stalled = state.tick - memLastChange > STALL_TICKS;

  const me = state.you;
  if (!isActive(me)) return 'stay';

  const ctx = makeCtx(state);
  const { W, H, N, open, B } = ctx;
  const team = state.team;
  const foe = other(team);
  const idx = a => a.y * W + a.x;
  const myFlag = state.flags[team];
  const theirFlag = state.flags[foe];
  const myStandIdx = myFlag.home.y * W + myFlag.home.x;

  // Masks: cells strictly inside each half (border column is neutral).
  const ownMask = new Uint8Array(N);
  const foeMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!open[i]) continue;
    const x = i % W;
    if (inHalf(team, x, B)) ownMask[i] = 1;
    if (inHalf(foe, x, B)) foeMask[i] = 1;
  }

  // Danger inside the enemy half: earliest step at which an enemy defender
  // could be adjacent to a cell (tagging needs both agents inside the foe half).
  const foeDefenders = state.enemies.filter(e => isActive(e) && inHalf(foe, e.x, B)).map(idx);
  const dE = bfs(ctx, foeDefenders, foeMask);
  const dEmin = new Int32Array(N).fill(INF);
  for (let i = 0; i < N; i++) {
    if (!foeMask[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    let m = dE[i];
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dE[n] < m) m = dE[n];
    }
    dEmin[i] = m;
  }
  const safeAt = (cell, step) => !foeMask[cell] || dEmin[cell] > step;
  const safeOrAggressive = stalled ? null : safeAt;

  // Roles, computed identically by every teammate from the same state.
  const actives = [me, ...state.teammates].filter(isActive).sort(byId);
  const nonCarriers = actives.filter(a => !a.carrying);
  const attackerCount = actives.length <= 2 ? 1 : 2;
  const attackerIds = new Set(nonCarriers.slice(0, attackerCount).map(a => a.id));
  const isAttacker = attackerIds.has(me.id);

  // 1) Carrying the enemy flag: run home through the safest route.
  if (me.carrying) {
    const ownGoal = ownMask;
    let c = firstStep(ctx, idx(me), ownGoal, safeAt);
    if (c < 0) c = firstStep(ctx, idx(me), ownGoal, null);
    return toAction(W, idx(me), c);
  }

  // 2) Intercept an enemy carrying our flag.
  const stolenBy = myFlag.carrier !== null ? state.enemies.find(e => e.id === myFlag.carrier) : null;
  if (stolenBy && isActive(stolenBy)) {
    const carrierIdx = idx(stolenBy);
    const ranked = nonCarriers.slice().sort((a, b) =>
      manhattan(a, stolenBy) - manhattan(b, stolenBy) || byId(a, b));
    const chasers = ranked.slice(0, actives.length >= 3 ? 2 : 1);
    if (chasers.some(a => a.id === me.id)) {
      const predict = bfs(ctx, sourcesIn(ctx, foeMask), null);
      return intercept(ctx, me, carrierIdx, predict);
    }
  }

  // 2b) Emergency: an enemy in our half near our flag gets the nearest responder, whatever the role.
  const invaders = state.enemies.filter(e => isActive(e) && inHalf(team, e.x, B));
  if (invaders.length) {
    const threat = invaders.slice().sort((a, b) =>
      manhattan(a, myFlag.home) - manhattan(b, myFlag.home) || byId(a, b))[0];
    if (manhattan(threat, myFlag.home) <= EMERGENCY_RADIUS) {
      const responder = nonCarriers.slice().sort((a, b) =>
        manhattan(a, threat) - manhattan(b, threat) || byId(a, b))[0];
      if (responder && responder.id === me.id) {
        const predict = bfs(ctx, [myStandIdx], null);
        return intercept(ctx, me, idx(threat), predict);
      }
    }
  }

  // 3) Rescue jailed teammates from the enemy jail if an attacker can do it safely.
  const jailedMates = state.teammates.filter(a => a.jailed);
  if (jailedMates.length && isAttacker) {
    const rescueGoal = new Uint8Array(N);
    for (const p of state.zones[foe].jail) {
      for (let k = 0; k < 4; k++) {
        const nx = p.x + DX[k];
        const ny = p.y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (open[n]) rescueGoal[n] = 1;
      }
      if (open[p.y * W + p.x]) rescueGoal[p.y * W + p.x] = 1;
    }
    const c = firstStep(ctx, idx(me), rescueGoal, safeAt);
    if (c >= 0) return toAction(W, idx(me), c);
  }

  // 4) Attack: enemy flag is free -> safe route to its stand.
  if (isAttacker) {
    if (theirFlag.carrier === null) {
      const goal = singleMask(N, theirFlag.y * W + theirFlag.x);
      let c = firstStep(ctx, idx(me), goal, safeOrAggressive);
      if (c < 0) {
        // Wait somewhere neutral or in our half until a route opens.
        const staging = new Uint8Array(N);
        for (let i = 0; i < N; i++) if (open[i] && !foeMask[i]) staging[i] = 1;
        c = firstStep(ctx, idx(me), staging, safeAt);
        if (c < 0) c = idx(me);
      }
      return toAction(W, idx(me), c);
    }
    // Enemy flag carried by a teammate: escort toward the carrier.
    const goal = singleMask(N, theirFlag.y * W + theirFlag.x);
    let c = firstStep(ctx, idx(me), goal, safeAt);
    if (c < 0) c = firstStep(ctx, idx(me), goal, null);
    return toAction(W, idx(me), c);
  }

  // 5) Defend: intercept nearest invader in our half, otherwise guard.
  if (invaders.length) {
    const nearest = invaders.slice().sort((a, b) =>
      manhattan(me, a) - manhattan(me, b) || byId(a, b))[0];
    const predict = bfs(ctx, [myStandIdx], null);
    return intercept(ctx, me, idx(nearest), predict);
  }

  const defenders = actives.filter(a => !attackerIds.has(a.id) && !a.carrying);
  const slot = Math.max(0, defenders.findIndex(a => a.id === me.id));
  const guard = guardCell(ctx, team, myFlag.home, slot, ownMask);
  const goal = singleMask(N, guard);
  const c = firstStep(ctx, idx(me), goal, null);
  return toAction(W, idx(me), c);
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sourcesIn(ctx, mask) {
  const out = [];
  for (let i = 0; i < ctx.N; i++) if (mask[i]) out.push(i);
  return out;
}

// Move toward the earliest point on the runner's predicted route that we can reach in time.
function intercept(ctx, me, runnerIdx, predict) {
  const { W, N } = ctx;
  const meIdx = me.y * W + me.x;
  const path = gradientPath(ctx, predict, runnerIdx, 80);
  const dMe = bfs(ctx, [meIdx], null);
  let target = path[path.length - 1];
  for (let j = 0; j < path.length; j++) {
    if (dMe[path[j]] <= j + 1) {
      target = path[j];
      break;
    }
  }
  const c = firstStep(ctx, meIdx, singleMask(N, target), null);
  return toAction(W, meIdx, c);
}

// Guard cells sit in our half, spread vertically, a few columns in front of our flag.
function guardCell(ctx, team, home, slot, ownMask) {
  const { W, H, N, B } = ctx;
  const offsets = [0, -4, 4, -8, 8, -2, 2];
  const gx = team === 'west' ? B - 4 : B + 4;
  let gy = home.y + offsets[slot % offsets.length];
  gy = Math.max(1, Math.min(H - 2, gy));
  let best = home.y * W + home.x;
  let bd = INF;
  for (let i = 0; i < N; i++) {
    if (!ownMask[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const d = Math.abs(x - gx) + Math.abs(y - gy);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

module.exports = {
  name: BOT_NAME,
  move(state) {
    try {
      const action = decide(state);
      return ACTIONS.includes(action) ? action : 'stay';
    } catch (err) {
      return 'stay';
    }
  }
};
