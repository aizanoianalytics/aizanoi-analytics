'use strict';
// SNAKE ROYALE bot: survival-first with simultaneous-move safety, tail-aware
// collisions, head-on discipline, flood-fill space, Voronoi territory, food
// urgency and storm/center control.

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

function bfs(W, H, blocked, sx, sy, inf) {
  const N = W * H;
  const dist = new Int32Array(N).fill(inf);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return dist;
  const start = sy * W + sx;
  if (blocked[start]) return dist;
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  dist[start] = 0;
  q[qt++] = start;
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W, y = (i - x) / W;
    const d = dist[i] + 1;
    if (x > 0) { const j = i - 1; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (x + 1 < W) { const j = i + 1; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (y > 0) { const j = i - W; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (y + 1 < H) { const j = i + W; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
  }
  return dist;
}

function multiBfs(W, H, blocked, sources, inf) {
  const N = W * H;
  const dist = new Int32Array(N).fill(inf);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let k = 0; k < sources.length; k++) {
    const s = sources[k];
    if (s.x < 0 || s.y < 0 || s.x >= W || s.y >= H) continue;
    const i = s.y * W + s.x;
    if (dist[i] !== inf) continue;
    dist[i] = 0;
    q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W, y = (i - x) / W;
    const d = dist[i] + 1;
    if (x > 0) { const j = i - 1; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (x + 1 < W) { const j = i + 1; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (y > 0) { const j = i - W; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
    if (y + 1 < H) { const j = i + W; if (!blocked[j] && dist[j] === inf) { dist[j] = d; q[qt++] = j; } }
  }
  return dist;
}

function countCoord(body, x, y) {
  let c = 0;
  for (let i = 0; i < body.length; i++) if (body[i].x === x && body[i].y === y) c++;
  return c;
}

function inHazard(x, y, ring, W, H) {
  return x < ring || y < ring || x >= W - ring || y >= H - ring;
}

// Infer the active ring from the hazard list (robust to custom schedules).
function ringFromHazards(hazards, W, H) {
  const cap = Math.floor(Math.min(W, H) / 2) - 1;
  const n = hazards.length;
  if (!n) return 0;
  const total = W * H;
  for (let r = 1; r <= cap; r++) {
    const iw = Math.max(0, W - 2 * r), ih = Math.max(0, H - 2 * r);
    if (total - iw * ih === n) return r;
  }
  return cap;
}

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

function decide(state) {
  if (!state || !state.you) return 'up';
  const W = state.width, H = state.height, N = W * H, INF = 1e9;
  const me = state.you;
  const snakes = state.snakes || [];
  const rivals = [];
  for (let i = 0; i < snakes.length; i++) if (snakes[i].id !== me.id) rivals.push(snakes[i]);
  const foodList = state.food || [];
  const foodSet = new Set();
  for (let i = 0; i < foodList.length; i++) {
    const f = foodList[i];
    if (f.x >= 0 && f.y >= 0 && f.x < W && f.y < H) foodSet.add(f.y * W + f.x);
  }
  const turn = state.turn || 1;
  const completed = turn - 1;
  const ring = ringFromHazards(state.hazards || [], W, H);
  const cap = Math.floor(Math.min(W, H) / 2) - 1;
  const nextRing = ring < cap ? ring + 1 : cap;
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : INF;
  const turnsToShrink = nextShrink - turn;
  // Project the ring ~25 turns ahead. Reconstruct the expansion schedule from
  // nextShrinkTurn and the inferred ring (cadence defaults to the common 20).
  let projRing = ring;
  if (nextShrink < INF / 2) {
    const cadence = 20;
    const firstExp = Math.max(0, nextShrink - ring * cadence);
    const T = completed + 25;
    if (T >= firstExp) projRing = Math.min(cap, Math.floor((T - firstExp) / cadence) + 1);
  }
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  // Growing much past this length becomes a liability once the storm core is tiny.
  const lenLimit = 11;

  const hazNow = new Uint8Array(N);
  for (let i = 0; i < (state.hazards || []).length; i++) {
    const h = state.hazards[i];
    if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) hazNow[h.y * W + h.x] = 1;
  }

  // Rival metadata: tail vacate analysis + food adjacency (may eat this turn).
  const rInfo = [];
  for (let i = 0; i < rivals.length; i++) {
    const r = rivals[i];
    const b = r.body;
    const tail = b[b.length - 1];
    const tailStacked = countCoord(b, tail.x, tail.y) > 1;
    let eats = false;
    const hd = r.head;
    if (foodSet.has(hd.y * W + hd.x)) eats = true;
    else {
      for (let d = 0; d < 4; d++) {
        const nx = hd.x + DIRS[d].dx, ny = hd.y + DIRS[d].dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && foodSet.has(ny * W + nx)) { eats = true; break; }
      }
    }
    rInfo.push({ r, tailStacked, eats, postLen: r.length + (eats ? 1 : 0) });
  }

  // Base occupancy: hazards + full rival bodies (conservative pre-move board).
  const baseBlocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (hazNow[i]) baseBlocked[i] = 1;
  for (let i = 0; i < rInfo.length; i++) {
    const b = rInfo[i].r.body;
    for (let j = 0; j < b.length; j++) baseBlocked[b[j].y * W + b[j].x] = 1;
  }

  // Opponent head multi-source distance on base grid.
  const oppDist = multiBfs(W, H, baseBlocked, rivals.map(r => r.head), INF);

  const meBody = me.body;
  const myTail = meBody[meBody.length - 1];
  const myTailStacked = countCoord(meBody, myTail.x, myTail.y) > 1;

  // Cells occupied by my body after moving (excluding old tail when it vacates).
  // Used so flood fill doesn't count my own corpse as free space.
  const myNewBodyBlock = new Uint8Array(N);
  for (let i = 0; i < meBody.length; i++) myNewBodyBlock[meBody[i].y * W + meBody[i].x] = 1;
  if (!myTailStacked) myNewBodyBlock[myTail.y * W + myTail.x] = 0;

  const health = me.health;
  const myLen = me.length;

  let bestScore = -Infinity;
  let bestDir = null;
  let fallbackScore = -Infinity;
  let fallbackDir = null;

  for (let d = 0; d < 4; d++) {
    const nx = me.head.x + DIRS[d].dx, ny = me.head.y + DIRS[d].dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const nIdx = ny * W + nx;
    if (hazNow[nIdx]) continue;

    const willEat = foodSet.has(nIdx);
    const postLen = myLen + (willEat ? 1 : 0);

    // Own body collision (old head vacates; tail vacates unless growing/stacked).
    let illegal = false;
    for (let i = 1; i < meBody.length; i++) {
      if (meBody[i].x === nx && meBody[i].y === ny) {
        if (i === meBody.length - 1 && !willEat && !myTailStacked) continue;
        illegal = true;
        break;
      }
    }
    if (illegal) continue;

    // Rival body after their simultaneous move.
    let blockedByBody = false;
    for (let i = 0; i < rInfo.length; i++) {
      const info = rInfo[i];
      const b = info.r.body;
      const last = b.length - 1;
      for (let j = 0; j < last; j++) {
        if (b[j].x === nx && b[j].y === ny) { blockedByBody = true; break; }
      }
      if (!blockedByBody && b[last].x === nx && b[last].y === ny) {
        // Tail vacates unless rival grows or tail is stacked.
        if (info.tailStacked || info.eats) blockedByBody = true;
      }
      if (blockedByBody) break;
    }
    if (blockedByBody) continue; // certain or near-certain body death: skip

    // Head-on: any rival who can step into our new cell with post-food length >= ours kills us.
    let headOnDeath = false;
    let attackBonus = 0;
    for (let i = 0; i < rInfo.length; i++) {
      const info = rInfo[i];
      const r = info.r;
      const man = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
      if (man === 1) {
        if (info.postLen >= postLen) headOnDeath = true;
        else attackBonus += 35;
      }
    }

    // Flood fill reachable space from the new head, ignoring my old tail cell.
    const blocked = new Uint8Array(N);
    for (let i = 0; i < N; i++) blocked[i] = baseBlocked[i] || myNewBodyBlock[i];
    blocked[nIdx] = 0;
    const myDist = bfs(W, H, blocked, nx, ny, INF);
    let reach = 0;
    for (let i = 0; i < N; i++) if (myDist[i] < INF) reach++;

    // Future-safe reach: space measured inside the ring that will be active
    // shortly after this move. Used when the storm is about to close.
    let safeReach = reach;
    if (turnsToShrink <= 8 && nextRing > ring) {
      const blockedSafe = new Uint8Array(N);
      for (let i = 0; i < N; i++) blockedSafe[i] = blocked[i];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (inHazard(x, y, nextRing, W, H) && !inHazard(x, y, ring, W, H)) blockedSafe[y * W + x] = 1;
        }
      }
      blockedSafe[nIdx] = 0;
      const sd = bfs(W, H, blockedSafe, nx, ny, INF);
      safeReach = 0;
      for (let i = 0; i < N; i++) if (sd[i] < INF) safeReach++;
    }

    // Tail chase: after this move, can we still path back to our new tail?
    // Unreachable tail means we are coiling toward self-trap.
    let tailReachable = true;
    if (meBody.length >= 4) {
      const tailNew = willEat ? myTail : meBody[meBody.length - 2];
      const td = myDist[tailNew.y * W + tailNew.x];
      // The tail cell itself is blocked in `blocked` (own body); allow stepping
      // onto it by checking any neighbouring cell distance instead.
      if (td >= INF) {
        let ok = false;
        const tx = tailNew.x, ty = tailNew.y;
        if (tx > 0 && myDist[ty * W + tx - 1] < INF) ok = true;
        if (!ok && tx + 1 < W && myDist[ty * W + tx + 1] < INF) ok = true;
        if (!ok && ty > 0 && myDist[(ty - 1) * W + tx] < INF) ok = true;
        if (!ok && ty + 1 < H && myDist[(ty + 1) * W + tx] < INF) ok = true;
        tailReachable = ok;
      }
    }

    // Nearest food distance on same grid.
    let foodDist = INF;
    if (willEat) foodDist = 0;
    else {
      const it = foodSet.values();
      let fv = it.next();
      while (!fv.done) {
        const fd = myDist[fv.value];
        if (fd < foodDist) foodDist = fd;
        fv = it.next();
      }
    }

    // Voronoi territory: cells we reach before any rival head.
    let territory = 0;
    for (let i = 0; i < N; i++) {
      if (myDist[i] >= INF) continue;
      if (myDist[i] + 1 < oppDist[i]) territory++;
    }

    let score = 0;
    // Hard quality tiers: lower tiers can never outrank higher ones.
    if (headOnDeath) score -= 100000;
    if (reach < postLen) score -= 2500 + (postLen - reach) * 100;
    if (!tailReachable) score -= 1200;

    score += Math.min(reach, 150) * 1.5;
    if (turnsToShrink <= 8 && nextRing > ring && safeReach < postLen) {
      score -= (postLen - safeReach) * 60 + 40;
    }

    score += attackBonus;
    score += territory * 3.5;

    // Food urgency scales with starvation pressure; length also wins head-ons.
    if (foodDist < INF) {
      let urgency;
      if (health <= 20) urgency = 16;
      else if (health <= 45) urgency = 5;
      else if (health <= 75) urgency = 3.5;
      else if (health <= 90) urgency = 0.8;
      else urgency = 0.25;
      if (foodDist < health) score += urgency * 35 / (foodDist + 1);
      else if (health <= 25) score -= 150;
      else score -= 15;
    } else if (health <= 25) {
      score -= 400; // no reachable food: last rites
    }

    // Unnecessary growth is a liability in tight storm cores.
    if (willEat && health > 75) {
      let eatPen = 16 + Math.max(0, postLen - lenLimit) * 12;
      if (reach < postLen * 2) eatPen += 40;
      score -= eatPen;
    }

    // Starvation on this exact move: health 1 and not eating = death.
    if (health <= 1 && !willEat) score -= 10000;

    // Storm control: current hazard already skipped. Strongly anticipate the
    // next ring so we are never trapped with every exit inside the storm.
    const edge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
    if (nextRing > ring) {
      if (inHazard(nx, ny, nextRing, W, H) && !inHazard(nx, ny, ring, W, H)) {
        let urgency;
        if (turnsToShrink <= 1) urgency = 500;
        else if (turnsToShrink <= 3) urgency = 240;
        else if (turnsToShrink <= 8) urgency = 110;
        else if (turnsToShrink <= 20) urgency = 45;
        else urgency = 15;
        score -= urgency;
      }
      // Inside the current ring but about to be covered: demand an exit deeper in.
      if (turnsToShrink <= 2 && edge < nextRing) score -= (nextRing - edge) * 250;
      else if (turnsToShrink <= 6 && edge < nextRing) score -= (nextRing - edge) * 60;
    }
    // Steady long-horizon depth: stay at least projected-ring deep so the
    // storm never catches us coiled against the wall.
    if (edge < projRing) score -= (projRing - edge) * 55;
    // Long-horizon drift toward the safe core as the storm schedule approaches.
    const safeNeed = ring;
    if (edge < safeNeed) score -= (safeNeed - edge) * 20;
    let stormBias;
    if (turnsToShrink <= 10) stormBias = 2.0;
    else if (turnsToShrink <= 30) stormBias = 1.2;
    else if (ring > 0) stormBias = 1.0;
    else stormBias = 0.3;
    score -= (Math.abs(nx - cx) + Math.abs(ny - cy)) * stormBias;

    // Mild pressure against ending adjacent to much longer heads (2-step threat).
    for (let i = 0; i < rInfo.length; i++) {
      const info = rInfo[i];
      if (info.postLen <= postLen) continue;
      const man = Math.abs(info.r.head.x - nx) + Math.abs(info.r.head.y - ny);
      if (man === 2) score -= 12;
    }

    if (!headOnDeath && score > bestScore) {
      bestScore = score;
      bestDir = DIRS[d].name;
    }
    if (score > fallbackScore) {
      fallbackScore = score;
      fallbackDir = DIRS[d].name;
    }
  }

  // If every legal move is head-on death, take the least-bad dying move.
  if (bestDir) return bestDir;
  if (fallbackDir) return fallbackDir;

  // No legal move at all: pick any direction (engine will resolve it).
  return 'up';
}

module.exports = { name: 'MimoFang', move };
