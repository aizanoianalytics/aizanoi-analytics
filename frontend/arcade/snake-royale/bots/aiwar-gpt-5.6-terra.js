'use strict';

// Snake Royale: tactical safety first, then territory, food and pressure.
const DIRS = [
  ['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]
];

function move(state) {
  try { return choose(state); } catch (_) { return 'up'; }
}

function choose(S) {
  const W = S.width | 0, H = S.height | 0, N = W * H;
  const me = S.you;
  if (!me || W < 1 || H < 1) return 'up';
  const snakes = S.snakes || [], food = S.food || [], hazards = S.hazards || [];
  const rivals = snakes.filter(s => s.id !== me.id);
  const id = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const foodAt = new Uint8Array(N);
  for (const f of food) if (inside(f.x, f.y)) foodAt[id(f.x, f.y)] = 1;

  // Keep counts, not just a blocked bit: stacked spawn segments and overlapping
  // bodies mean one vacating tail must not free the other remaining segments.
  const hazard = new Uint8Array(N), occ = new Int16Array(N);
  for (const p of hazards) if (inside(p.x, p.y)) hazard[id(p.x, p.y)] = 1;
  for (const s of snakes) for (const p of s.body) if (inside(p.x, p.y)) occ[id(p.x, p.y)]++;

  // A tail is usable if that snake cannot eat this turn. Our own tail status is
  // candidate-dependent, so it is handled for each candidate.
  for (const s of rivals) {
    let couldGrow = false;
    for (const d of DIRS) {
      const x = s.head.x + d[1], y = s.head.y + d[2];
      if (inside(x, y) && foodAt[id(x, y)]) { couldGrow = true; break; }
    }
    if (!couldGrow && s.body.length) {
      const t = s.body[s.body.length - 1];
      if (inside(t.x, t.y)) occ[id(t.x, t.y)]--;
    }
  }

  // Distance from every rival head through static free territory. It measures
  // contestable territory, rather than pretending opponents stand still.
  const staticBlocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) staticBlocked[i] = hazard[i] || occ[i] > 0 ? 1 : 0;
  const oppDist = multiBfs(W, H, staticBlocked, rivals.map(s => s.head));
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  let currentRing = 0;
  while (currentRing < Math.floor(Math.min(W, H) / 2) && hazard[id(currentRing, currentRing)]) currentRing++;
  const turnsToShrink = typeof S.nextShrinkTurn === 'number' ? S.nextShrinkTurn - S.turn : 999;
  let best = 'up', bestScore = -1e100;

  for (const d of DIRS) {
    const nx = me.head.x + d[1], ny = me.head.y + d[2];
    if (!inside(nx, ny)) continue;
    const ni = id(nx, ny), eating = !!foodAt[ni];
    const candidateOcc = occ.slice();
    if (!eating && me.body.length) {
      const tail = me.body[me.body.length - 1];
      if (inside(tail.x, tail.y)) candidateOcc[id(tail.x, tail.y)]--;
    }
    if (hazard[ni] || candidateOcc[ni] > 0) continue;
    const myLen = me.length + (eating ? 1 : 0);
    let lethal = false, pressure = 0;

    // An enemy can choose any adjacent square; eliminate destinations where it
    // can force an equal/longer head collision (including food growth).
    for (const r of rivals) {
      const dist = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
      if (dist !== 1) continue;
      const rgrows = !!foodAt[ni];
      const rlen = r.length + (rgrows ? 1 : 0);
      if (rlen >= myLen) lethal = true;
      else pressure += 38 + Math.min(20, myLen - rlen) * 2;
    }
    if (lethal) continue;

    const blocked = new Uint8Array(N);
    for (let i = 0; i < N; i++) blocked[i] = hazard[i] || candidateOcc[i] > 0 ? 1 : 0;
    const dist = bfs(W, H, blocked, nx, ny);
    let reach = 0, territory = 0, nearestFood = 999, exits = 0;
    for (let i = 0; i < N; i++) if (dist[i] >= 0) {
      reach++;
      if (dist[i] + 1 < oppDist[i]) territory++;
      if (foodAt[i] && dist[i] < nearestFood) nearestFood = dist[i];
    }
    for (const q of DIRS) {
      const ex = nx + q[1], ey = ny + q[2];
      if (inside(ex, ey) && !blocked[id(ex, ey)]) exits++;
    }

    // A pocket smaller than the snake is generally fatal; this dominates food
    // and cosmetic centrality.  Space is intentionally capped in rewards.
    let score = territory * 5 + Math.min(reach, 110) * 1.4 + exits * 5 + pressure;
    if (reach < myLen + 2) score -= 100000 + (myLen - reach) * 1000;
    else if (reach < myLen * 2) score -= (myLen * 2 - reach) * 90;

    if (eating) score += me.health <= 35 ? 180 : 42;
    if (nearestFood < 999) {
      const urgency = me.health <= 15 ? 75 : me.health <= 35 ? 26 : me.health <= 60 ? 8 : 2;
      if (nearestFood < me.health) score += urgency / (nearestFood + 1);
      else score -= 45;
    } else if (me.health < 25) score -= 500;

    const edge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
    // The current ring is already hard-blocked. Before a scheduled expansion,
    // favor cells with room to retreat; after it, center control matters most.
    const central = Math.abs(nx - cx) + Math.abs(ny - cy);
    score -= central * (S.turn >= 110 ? 1.2 : 0.18);
    if (turnsToShrink <= 18) {
      // The coming ring is the current safe boundary, not always board edge.
      if (edge === currentRing) score -= 220;
      else if (edge === currentRing + 1) score -= 45;
      score -= central * 1.5;
    }
    // Deterministic tie-break gives stable behavior without relying on randomness.
    score += (d[0] === 'up' ? 0.03 : d[0] === 'left' ? 0.02 : d[0] === 'right' ? 0.01 : 0);
    if (score > bestScore) { bestScore = score; best = d[0]; }
  }
  return best;
}

function bfs(W, H, blocked, sx, sy) {
  const n = W * H, d = new Int16Array(n);
  d.fill(-1);
  const q = new Int16Array(n);
  let a = 0, b = 0, start = sy * W + sx;
  d[start] = 0; q[b++] = start;
  while (a < b) {
    const v = q[a++], x = v % W, y = (v - x) / W, nd = d[v] + 1;
    if (x && !blocked[v - 1] && d[v - 1] < 0) { d[v - 1] = nd; q[b++] = v - 1; }
    if (x + 1 < W && !blocked[v + 1] && d[v + 1] < 0) { d[v + 1] = nd; q[b++] = v + 1; }
    if (y && !blocked[v - W] && d[v - W] < 0) { d[v - W] = nd; q[b++] = v - W; }
    if (y + 1 < H && !blocked[v + W] && d[v + W] < 0) { d[v + W] = nd; q[b++] = v + W; }
  }
  return d;
}

function multiBfs(W, H, blocked, sources) {
  const n = W * H, d = new Int16Array(n);
  d.fill(-1);
  const q = new Int16Array(n); let a = 0, b = 0;
  for (const p of sources) if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H) {
    const v = p.y * W + p.x;
    if (d[v] < 0) { d[v] = 0; q[b++] = v; }
  }
  while (a < b) {
    const v = q[a++], x = v % W, y = (v - x) / W, nd = d[v] + 1;
    if (x && !blocked[v - 1] && d[v - 1] < 0) { d[v - 1] = nd; q[b++] = v - 1; }
    if (x + 1 < W && !blocked[v + 1] && d[v + 1] < 0) { d[v + 1] = nd; q[b++] = v + 1; }
    if (y && !blocked[v - W] && d[v - W] < 0) { d[v - W] = nd; q[b++] = v - W; }
    if (y + 1 < H && !blocked[v + W] && d[v + W] < 0) { d[v + W] = nd; q[b++] = v + W; }
  }
  for (let i = 0; i < n; i++) if (d[i] < 0) d[i] = 30000;
  return d;
}

module.exports = { name: 'ApexFlood', move };
