'use strict';

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

function bfsDist(W, H, blocked, sx, sy) {
  const N = W * H;
  const INF = 1e9;
  const dist = new Int32Array(N).fill(INF);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return dist;
  const start = sy * W + sx;
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  dist[start] = 0;
  q[qt++] = start;
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W;
    const y = (i - x) / W;
    const nd = dist[i] + 1;
    if (x + 1 < W) { const j = i + 1; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
    if (x - 1 >= 0) { const j = i - 1; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
    if (y + 1 < H) { const j = i + W; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
    if (y - 1 >= 0) { const j = i - W; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
  }
  return dist;
}

function bfsMulti(W, H, blocked, sources) {
  const N = W * H;
  const INF = 1e9;
  const dist = new Int32Array(N).fill(INF);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const s of sources) {
    if (s.x < 0 || s.y < 0 || s.x >= W || s.y >= H) continue;
    const i = s.y * W + s.x;
    if (dist[i] !== INF) continue;
    dist[i] = 0;
    q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W;
    const y = (i - x) / W;
    const nd = dist[i] + 1;
    if (x + 1 < W) { const j = i + 1; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
    if (x - 1 >= 0) { const j = i - 1; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
    if (y + 1 < H) { const j = i + W; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
    if (y - 1 >= 0) { const j = i - W; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; q[qt++] = j; } }
  }
  return dist;
}

function rivalEats(rival, food) {
  const rx = rival.head.x, ry = rival.head.y;
  for (const f of food) {
    if (Math.abs(f.x - rx) + Math.abs(f.y - ry) <= 1) return true;
  }
  return false;
}

function decide(state) {
  const W = state.width, H = state.height, N = W * H;
  const me = state.you;
  if (!me || !me.head) return 'up';
  const turn = state.turn || 1;
  const food = state.food || [];
  const hazards = state.hazards || [];
  const snakes = state.snakes || [];
  const rivals = snakes.filter(s => s.id !== me.id);
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : 1e9;
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;

  const hset = new Uint8Array(N);
  for (const h of hazards) if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) hset[h.y * W + h.x] = 1;

  let hazardRing = 0;
  if (hazards.length) {
    for (let r = 0; r <= maxRing; r++) {
      const i = r * W + r;
      if (i < N && !hset[i]) { hazardRing = r; break; }
      if (r === maxRing) hazardRing = maxRing;
    }
  }

  const baseBlocked = new Uint8Array(N);
  for (const h of hazards) if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) baseBlocked[h.y * W + h.x] = 1;
  for (const s of snakes) {
    for (const seg of s.body || []) {
      if (seg.x >= 0 && seg.y >= 0 && seg.x < W && seg.y < H) baseBlocked[seg.y * W + seg.x] = 1;
    }
  }

  const rivalHeads = rivals.map(r => r.head);
  const oppDist = bfsMulti(W, H, baseBlocked, rivalHeads);

  const safeCount = N - hazards.length;
  let bestDir = null;
  let bestScore = -1e18;

  for (const d of DIRS) {
    const nx = me.head.x + d.dx;
    const ny = me.head.y + d.dy;
    let score = 0;
    let illegal = false;

    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { score -= 1e8; illegal = true; }
    const targetIdx = (nx >= 0 && ny >= 0 && nx < W && ny < H) ? ny * W + nx : -1;
    const isHazard = targetIdx >= 0 && hset[targetIdx];
    if (isHazard) { score -= 1e8; illegal = true; }

    const willEat = targetIdx >= 0 && food.some(f => f.x === nx && f.y === ny);
    const newLength = me.length + (willEat ? 1 : 0);

    const blocked = new Uint8Array(N);
    for (const h of hazards) if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) blocked[h.y * W + h.x] = 1;

    for (const r of rivals) {
      const eats = rivalEats(r, food);
      const body = r.body || [];
      const L = body.length;
      for (let k = 0; k < L; k++) {
        const seg = body[k];
        if (seg.x < 0 || seg.y < 0 || seg.x >= W || seg.y >= H) continue;
        if (k === L - 1 && !eats) continue;
        blocked[seg.y * W + seg.x] = 1;
      }
      if (r.head && r.head.x >= 0 && r.head.y >= 0 && r.head.x < W && r.head.y < H) {
        blocked[r.head.y * W + r.head.x] = 1;
      }
    }
    const body = me.body || [];
    const Lme = body.length;
    for (let k = 0; k < Lme; k++) {
      const seg = body[k];
      if (seg.x < 0 || seg.y < 0 || seg.x >= W || seg.y >= H) continue;
      if (k === Lme - 1 && !willEat) continue;
      blocked[seg.y * W + seg.x] = 1;
    }

    let isOppHead = false;
    for (const r of rivals) {
      if (r.head && r.head.x === nx && r.head.y === ny) { isOppHead = true; break; }
    }
    if (!illegal && targetIdx >= 0) {
      if (blocked[targetIdx]) { score -= 1e7; illegal = true; }
    }

    let riskHeadOn = false;
    let killBonus = 0;
    for (const r of rivals) {
      if (!r.head) continue;
      const man = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
      if (man === 1) {
        if (r.length >= me.length) riskHeadOn = true;
        else killBonus += 600 + r.length * 15;
      }
      if (r.head.x === nx && r.head.y === ny) {
        if (r.length >= me.length) riskHeadOn = true;
        else killBonus += 800 + r.length * 15;
      }
    }
    if (riskHeadOn) { score -= 5e6; illegal = true; }
    score += killBonus;

    if (!illegal && !willEat && me.health <= 1) { score -= 2e6; illegal = true; }

    let reach = 0;
    let myDist = null;
    if (targetIdx >= 0) {
      myDist = bfsDist(W, H, blocked, nx, ny);
      for (let i = 0; i < N; i++) if (myDist[i] < 1e9) reach++;
    }

    const newLen = newLength;
    const thr = Math.min(newLen, Math.max(4, safeCount));
    if (reach < thr) score -= 4000 + (thr - reach) * 250;
    else if (reach < newLen + 6) score -= (newLen + 6 - reach) * 60;
    score += Math.min(reach, 120) * 1.0;

    // exits from target
    let exits = 0;
    if (targetIdx >= 0) {
      const cand = [[nx+1,ny],[nx-1,ny],[nx,ny+1],[nx,ny-1]];
      for (const [ex,ey] of cand) {
        if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
        if (hset[ey*W+ex]) continue;
        if (blocked[ey*W+ex]) continue;
        exits++;
      }
    }
    score += exits * 8;

    if (myDist) {
      let territory = 0;
      for (let i = 0; i < N; i++) {
        if (myDist[i] >= 1e9) continue;
        if (myDist[i] + 1 < oppDist[i]) territory++;
      }
      score += territory * 2.5;
    }

    let foodDist = 1e9;
    let foodCell = -1;
    if (myDist) {
      for (const f of food) {
        const fi = f.y * W + f.x;
        if (fi >= 0 && fi < N && myDist[fi] < foodDist) { foodDist = myDist[fi]; foodCell = fi; }
      }
    }
    if (foodDist < 1e9) {
      const urgency = me.health <= 20 ? 9 : me.health <= 40 ? 4.5 : me.health <= 70 ? 1.8 : 0.7;
      if (foodDist < me.health) score += urgency * 25 / (foodDist + 1);
      else score -= 18;
      if (foodCell >= 0) {
        const od2 = oppDist[foodCell];
        if (od2 <= foodDist && rivals.some(r => r.length >= me.length)) score -= 50;
        if (foodDist < od2) score += 30;
      }
    } else {
      score -= 5;
    }

    const edge = (nx >= 0 && ny >= 0 && nx < W && ny < H) ? Math.min(nx, ny, W - 1 - nx, H - 1 - ny) : 0;
    const soon = nextShrink - turn <= 25;
    if (soon) {
      const futureRing = Math.min(hazardRing + 1, maxRing);
      if (edge < futureRing) score -= (futureRing - edge) * 80;
    }
    if (edge <= hazardRing + 1) score -= soon ? 90 : 25;
    if (edge <= hazardRing + 2 && nextShrink - turn <= 40) score -= 40;
    if (edge === hazardRing && hazardRing > 0) score -= soon ? 40 : 8;
    score -= (Math.abs(nx - cx) + Math.abs(ny - cy)) * (hazardRing > 0 ? 0.8 : 0.4);

    for (const r of rivals) {
      if (!r.head) continue;
      const man = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
      if (man <= 2 && r.length >= me.length) score -= 6;
      if (man <= 2) score -= 12;
      if (man === 1) score -= 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = d.name;
    }
  }

  if (bestDir) return bestDir;
  return 'up';
}

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

module.exports = { name: 'ApexViper', move };
