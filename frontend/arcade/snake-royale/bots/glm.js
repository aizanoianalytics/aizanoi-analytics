'use strict';

// NAGA - a tournament snake.
// Core: per-candidate evaluation with tail-aware collision model, flood-fill space
// safety, head-to-head prediction, contested-food logic and storm-ring escape planning.

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ORDER = ['up', 'down', 'left', 'right'];
const SHRINK_EVERY = 20;
let lastMove = 'up';

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    // Never crash: limp toward any open cell.
    const me = state.you, W = state.width, H = state.height;
    for (const d of ORDER) {
      const x = me.head.x + DIRS[d][0], y = me.head.y + DIRS[d][1];
      if (x >= 0 && y >= 0 && x < W && y < H) return d;
    }
    return lastMove;
  }
}

function decide(state) {
  const W = state.width, H = state.height, N = W * H;
  const turn = state.turn;
  const me = state.you;
  const myLen = me.length;
  const health = me.health;
  const hx = me.head.x, hy = me.head.y;
  const INF = 1e9;

  // ---- static maps ----
  const ring = new Int16Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ring[y * W + x] = Math.min(x, y, W - 1 - x, H - 1 - y);
    }
  }

  const blocked = new Uint8Array(N);
  const foodAt = new Uint8Array(N);
  const foods = [];
  for (const f of state.food) {
    if (f.x < 0 || f.y < 0 || f.x >= W || f.y >= H) continue;
    const i = f.y * W + f.x;
    foodAt[i] = 1;
    foods.push(i);
  }

  // hazard level: cells with ring < hz are already deadly
  let hz = 0, minRing = 999;
  for (const p of state.hazards) {
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) continue;
    blocked[p.y * W + p.x] = 1;
    const r = ring[p.y * W + p.x];
    if (r < minRing) minRing = r;
  }
  if (minRing < 900) hz = minRing + 1;
  const maxHz = Math.floor(Math.min(W, H) / 2) - 1;
  const willClose = hz < maxHz;
  // Ring R becomes deadly from turn closeTurn(R-1)+1. Once the deadline for the
  // ring we're inside nears, aim for the next ring deeper so we never get caught.
  const SHRINK_MARGIN = 8;
  let targetRing = hz;
  if (willClose) {
    targetRing = hz + 1;
    if (state.nextShrinkTurn <= turn + SHRINK_MARGIN && state.nextShrinkTurn + SHRINK_EVERY <= turn + SHRINK_MARGIN) {
      targetRing = hz + 2;
    }
  }
  const safeRing = targetRing;
  const shrinkStart = state.nextShrinkTurn - hz * SHRINK_EVERY;

  // ---- bodies, tail-aware ----
  // A snake's tail vacates this turn unless it eats (its head reaching food).
  let myTail = -1;
  for (const s of state.snakes) {
    const b = s.body;
    for (let k = 0; k < b.length; k++) blocked[b[k].y * W + b[k].x] = 1;
    const tl = b[b.length - 1];
    const ti = tl.y * W + tl.x;
    if (s.id === me.id) {
      myTail = ti;
      blocked[ti] = 0; // per-candidate special case
    } else {
      let eats = false;
      for (const fi of foods) {
        const fx = fi % W, fy = (fi / W) | 0;
        if (Math.abs(fx - s.head.x) + Math.abs(fy - s.head.y) === 1) { eats = true; break; }
      }
      if (!eats) blocked[ti] = 0;
    }
  }

  // ---- enemies ----
  const enemies = [];
  for (const s of state.snakes) if (s.id !== me.id) enemies.push(s);
  const many = enemies.length > 1;

  // forbid: an enemy with length >= mine could land on the same cell (head-on kills me)
  // headNext: any enemy could land there (if they are shorter, that's a kill for me)
  const forbid = new Uint8Array(N);
  const headNext = new Uint8Array(N);
  for (const e of enemies) {
    const ex = e.head.x, ey = e.head.y;
    for (let k = 0; k < 4; k++) {
      const nx = ex + DIRS[ORDER[k]][0], ny = ey + DIRS[ORDER[k]][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = ny * W + nx;
      headNext[i] = 1;
      if (e.length >= myLen) forbid[i] = 1;
    }
  }

  const starving = health <= 40;

  // precompute, per enemy: tail index (pops unless it eats) and the cells its
  // head can move into next turn (its body[1] or a head-on landing on us)
  const enemySeal = [];
  for (const e of enemies) {
    const b = e.body;
    const tailI = b[b.length - 1].y * W + b[b.length - 1].x;
    let eats = false;
    for (const fi of foods) {
      const fx = fi % W, fy = (fi / W) | 0;
      if (Math.abs(fx - e.head.x) + Math.abs(fy - e.head.y) === 1) { eats = true; break; }
    }
    const reach = [];
    for (let k = 0; k < 4; k++) {
      const nx = e.head.x + DIRS[ORDER[k]][0], ny = e.head.y + DIRS[ORDER[k]][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      reach.push(ny * W + nx);
    }
    enemySeal.push({ tail: tailI, eats, reach });
  }

  // ---- flood fill / BFS from a candidate landing cell ----
  // Returns dist map, reachable area, and BFS distance to the next-safe ring.
  function bfs(start, tailBlocked, tailFree) {
    const b2 = new Uint8Array(blocked);
    if (tailBlocked && myTail >= 0) b2[myTail] = 1;
    if (tailFree && myTail >= 0) b2[myTail] = 0;
    const dist = new Int32Array(N).fill(-1);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    dist[start] = 0;
    q[qt++] = start;
    let size = 0;
    let dOut = willClose ? INF : 0;
    while (qh < qt) {
      const c = q[qh++];
      const d = dist[c];
      size++;
      if (willClose && ring[c] >= safeRing && d < dOut) dOut = d;
      const cx = c % W, cy = (c / W) | 0;
      if (cx > 0) { const n = c - 1; if (dist[n] === -1 && !b2[n]) { dist[n] = d + 1; q[qt++] = n; } }
      if (cx < W - 1) { const n = c + 1; if (dist[n] === -1 && !b2[n]) { dist[n] = d + 1; q[qt++] = n; } }
      if (cy > 0) { const n = c - W; if (dist[n] === -1 && !b2[n]) { dist[n] = d + 1; q[qt++] = n; } }
      if (cy < H - 1) { const n = c + W; if (dist[n] === -1 && !b2[n]) { dist[n] = d + 1; q[qt++] = n; } }
    }
    return { dist, size, dOut };
  }

  // region size one ply ahead from cell `c`, with my head parked at `headCell`.
  // Conservative: enemy tails vacate but every cell an enemy head could move into
  // is treated as enemy body next turn.
  function childArea(c, headCell) {
    const b3 = new Uint8Array(blocked);
    if (myTail >= 0) b3[myTail] = 0; // my tail pops next turn
    for (const e of enemySeal) {
      if (!e.eats) b3[e.tail] = 0;
      for (const nIdx of e.reach) b3[nIdx] = 1;
    }
    b3[headCell] = 1;
    let size = 0;
    const seen = new Uint8Array(N);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    seen[c] = 1;
    q[qt++] = c;
    while (qh < qt) {
      const cur = q[qh++];
      size++;
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx > 0) { const n = cur - 1; if (!seen[n] && !b3[n]) { seen[n] = 1; q[qt++] = n; } }
      if (cx < W - 1) { const n = cur + 1; if (!seen[n] && !b3[n]) { seen[n] = 1; q[qt++] = n; } }
      if (cy > 0) { const n = cur - W; if (!seen[n] && !b3[n]) { seen[n] = 1; q[qt++] = n; } }
      if (cy < H - 1) { const n = cur + W; if (!seen[n] && !b3[n]) { seen[n] = 1; q[qt++] = n; } }
    }
    return size;
  }

  // ---- evaluate the four candidates ----
  let best = null, bestScore = -Infinity;
  for (const dname of ORDER) {
    const tx = hx + DIRS[dname][0], ty = hy + DIRS[dname][1];
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    const t = ty * W + tx;
    if (blocked[t]) continue;
    const myEats = foodAt[t] === 1;
    // eating onto my own tail cell is fatal (tail would not pop)
    if (myEats && t === myTail) continue;

    const f = bfs(t, myEats);
    let s = 0;

    // 1) space safety: never step into a pocket smaller than my body
    const need = myLen + (myEats ? 1 : 0);
    if (f.size < need) s -= 600 + (need - f.size) * 150;
    else if (f.size < need * 1.8) s -= (need * 1.8 - f.size) * 5;
    s += Math.min(f.size, 120) * 0.4;

    // mild inward bias before the storm era: keep off the outer rail
    if (turn < shrinkStart && ring[t] === 0) s -= 3;

    // 2) mobility: few ways out of t is risky
    let exits = 0;
    if (tx > 0 && !blocked[t - 1] && !forbid[t - 1]) exits++;
    if (tx < W - 1 && !blocked[t + 1] && !forbid[t + 1]) exits++;
    if (ty > 0 && !blocked[t - W] && !forbid[t - W]) exits++;
    if (ty < H - 1 && !blocked[t + W] && !forbid[t + W]) exits++;
    if (exits < 2) s -= 25 * (2 - exits);

    // 2b) next-ply trap detection: is there a child move whose pocket is smaller than me?
    let childMin = INF;
    for (const dn2 of ORDER) {
      const nx = tx + DIRS[dn2][0], ny = ty + DIRS[dn2][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (ni === t) { // my neck stays occupied next turn
        childMin = 0;
        continue;
      }
      if (blocked[ni] || forbid[ni]) continue;
      const a = childArea(ni, t);
      if (a < childMin) childMin = a;
    }
    if (childMin >= INF) s -= 400; // every child move is blocked or forbidden next turn
    else if (childMin < need) s -= 150 + (need - childMin) * 40;

    // 3) head-to-head chess
    if (forbid[t]) s -= 6000;
    else if (headNext[t]) s += many ? 12 : 35;

    const prox = many ? 1.5 : 1;
    for (const e of enemies) {
      if (e.length <= myLen) continue;
      const d = Math.abs(e.head.x - tx) + Math.abs(e.head.y - ty);
      if (d === 2) s -= 10 * prox;
      else if (d === 3) s -= 3 * prox;
    }

    // 4) food: pick best reachable food by effective distance
    let eff = INF;
    for (const fi of foods) {
      const dd = f.dist[fi];
      if (dd < 0) continue;
      const fx = fi % W, fy = (fi / W) | 0;
      const closeT = shrinkStart + ring[fi] * SHRINK_EVERY;
      if (closeT - turn - dd < 3) continue; // storm would swallow it first
      if (!starving) {
        // never race a longer snake to food: it eats first and kills me on the way
        let lost = false;
        for (const en of enemies) {
          if (en.length <= myLen) continue;
          if (Math.abs(en.head.x - fx) + Math.abs(en.head.y - fy) <= dd) { lost = true; break; }
        }
        if (lost) continue;
      }
      let e2 = dd;
      let contest = 0;
      for (const en of enemies) {
        const eD = Math.abs(en.head.x - fx) + Math.abs(en.head.y - fy);
        if (eD <= dd) {
          const c = en.health <= 30 ? 30 : (starving ? 2 : 14);
          if (c > contest) contest = c;
        }
      }
      e2 += contest;
      if (e2 < eff) eff = e2;
    }
    if (eff < INF) {
      const w = starving ? 45 : health <= 60 ? 15 : health <= 85 ? 7 : 3;
      let cost = eff;
      if (health > 70) cost = Math.min(eff, 10) + Math.max(0, eff - 10) * 0.3;
      s -= cost * w;
    } else if (starving) {
      s -= 400;
    }

    // 5) storm escape planning: must reach ring >= safeRing before it closes
    if (willClose && f.dOut < INF / 2) {
      const movesAvail = state.nextShrinkTurn - turn + 1;
      if (movesAvail <= 30) {
        if (f.dOut >= movesAvail) s -= 600 + (f.dOut - movesAvail) * 350;
        else if (f.dOut >= movesAvail - 1) s -= 90;
        else s -= f.dOut * 4;
      }
    } else if (willClose) {
      s -= 6000; // safe zone unreachable from here
    }

    s += Math.random(); // tiebreak jitter (engine seeds Math.random per game)

    if (s > bestScore) { bestScore = s; best = dname; }
  }

  if (!best) {
    for (const dname of ORDER) {
      const x = hx + DIRS[dname][0], y = hy + DIRS[dname][1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (!blocked[y * W + x]) { best = dname; break; }
    }
  }
  if (!best) best = lastMove;
  lastMove = best;
  return best;
}

module.exports = { name: 'Naga', move };
