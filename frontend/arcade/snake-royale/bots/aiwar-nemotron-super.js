'use strict';

// Snake Royale bot: territory-seeking flood-fill + Voronoi contest, head-on discipline,
// food urgency scaled by health, storm/edge awareness, tail-vacancy awareness.

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

const INF = 1 << 28;
const DEAD = -1000000;

function bfs(W, H, blocked, sources) {
  const N = W * H;
  const dist = new Int32Array(N);
  for (let i = 0; i < N; i++) dist[i] = INF;
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const s of sources) {
    const i = s.y * W + s.x;
    if (i < 0 || i >= N) continue;
    if (blocked[i] || dist[i] !== INF) continue;
    dist[i] = 0;
    q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W, y = i / W | 0;
    const d = dist[i] + 1;
    if (x + 1 < W) { const j = i + 1; if (!blocked[j] && dist[j] === INF) { dist[j] = d; q[qt++] = j; } }
    if (x > 0) { const j = i - 1; if (!blocked[j] && dist[j] === INF) { dist[j] = d; q[qt++] = j; } }
    if (y + 1 < H) { const j = i + W; if (!blocked[j] && dist[j] === INF) { dist[j] = d; q[qt++] = j; } }
    if (y > 0) { const j = i - W; if (!blocked[j] && dist[j] === INF) { dist[j] = d; q[qt++] = j; } }
  }
  return dist;
}

let lastDir = null;

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

function decide(state) {
  if (!state || !state.you) return 'up';
  const W = state.width, H = state.height, N = W * H;
  const me = state.you;
  const myHead = me.head;
  const myLen = me.length;
  const health = me.health;
  const turn = state.turn || 1;
  const rivals = (state.snakes || []).filter(s => s.id !== me.id);
  const food = state.food || [];
  const hazards = state.hazards || [];

  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // Static obstacles: hazards + every body segment.
  const base = new Uint8Array(N);
  for (const h of hazards) if (inB(h.x, h.y)) base[h.y * W + h.x] = 1;
  for (const s of state.snakes || []) {
    const body = s.body;
    for (let k = 0; k < body.length; k++) {
      const seg = body[k];
      if (inB(seg.x, seg.y)) base[seg.y * W + seg.x] = 1;
    }
  }

  // Current hazard ring (cells with edge < ring are hazardous now).
  let ring = 0;
  for (const h of hazards) {
    const e = Math.min(h.x, h.y, W - 1 - h.x, H - 1 - h.y);
    if (e + 1 > ring) ring = e + 1;
  }
  const shrinkImminent = state.nextShrinkTurn === turn;
  const stormActive = hazards.length > 0 || shrinkImminent || ring > 0;

  // Rival heads are Voronoi sources; they vacate their current cells this turn.
  const rivalHeads = rivals.map(r => r.head);
  const ov = new Uint8Array(base);
  for (const r of rivalHeads) if (inB(r.x, r.y)) ov[r.y * W + r.x] = 0;

  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  let best = null, bestScore = -Infinity;
  let fallback = null, fallbackReach = -1;

  for (const d of DIRS) {
    const nx = myHead.x + d.dx, ny = myHead.y + d.dy;
    let score = 0;
    let reach = 0;

    if (!inB(nx, ny)) { score = DEAD; }
    else {
      const eat = food.some(f => f.x === nx && f.y === ny);
      const postLen = myLen + (eat ? 1 : 0);
      const postHealth = eat ? 100 : health - 1;
      if (postHealth <= 0) score = DEAD;

      // Move-specific obstacles: my tail vacates if I do not eat.
      const mblocked = new Uint8Array(base);
      for (let k = 1; k < me.body.length; k++) {
        const seg = me.body[k];
        if (inB(seg.x, seg.y)) mblocked[seg.y * W + seg.x] = 1;
      }
      if (!eat) {
        const tail = me.body[me.body.length - 1];
        if (inB(tail.x, tail.y)) mblocked[tail.y * W + tail.x] = 0;
      }
      // Rival heads vacate too (they move this turn).
      for (const r of rivalHeads) if (inB(r.x, r.y)) mblocked[r.y * W + r.x] = 0;

      if (mblocked[ny * W + nx] === 1) score = DEAD; // hazard, body, or rival head staying

      const headIdx = ny * W + nx;
      const myDist = bfs(W, H, mblocked, [{ x: nx, y: ny }]);
      const oppDist = bfs(W, H, ov, rivalHeads);

      let territory = 0, foodDist = INF;
      for (let i = 0; i < N; i++) {
        if (myDist[i] >= INF) continue;
        reach++;
        if (myDist[i] <= oppDist[i]) territory++;
      }
      for (const f of food) {
        const fi = f.y * W + f.x;
        if (myDist[fi] < INF) foodDist = Math.min(foodDist, myDist[fi]);
      }

      // Head-on discipline: adjacent rival heads can step into my new cell.
      let unsafe = false, attack = 0;
      for (const r of rivals) {
        const man = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
        if (man === 1) {
          if (r.length + 1 > postLen) unsafe = true; // avoid only clashes I would lose post-food
          else attack += 1;
        }
      }

      if (reach < postLen) score -= 10000 * (postLen - reach);
      if (unsafe) score -= 300000;
      score += attack * 6000;

      score += territory * 6;
      score += reach * (stormActive ? 5 : 3);

      if (foodDist < INF) {
        const growthValue = myLen < 5 ? 1.0 : myLen < 7 ? 0.3 : myLen < 9 ? 0.1 : 0.02;
        const urgency = health <= 25 ? 14 : health <= 55 ? 5 : health <= 80 ? 1.2 : 0.3;
        let want = urgency * growthValue;
        if (myLen >= 8 && health > 60) want *= 0.25; // do not over-grow when healthy
        if (foodDist < health) score += want * 700 / (foodDist + 1);
        else score -= 120;
      } else {
        score -= 60;
      }

      const edge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
      if (stormActive) {
        const margin = edge - ring; // rings of safety remaining on this cell
        if (margin < 3) score -= (3 - margin) * 450;
        const nextRing = ring + (shrinkImminent ? 1 : 0); // ring after this turn's expansion
        if (edge < nextRing) score -= (nextRing - edge) * 700; // cell turns hazardous next turn
        if (edge === 0) score -= 600;
      }
      score -= (Math.abs(nx - cx) + Math.abs(ny - cy)) * (1.0 + ring * 0.7);

      if (d.name === lastDir) score += 2;
    }

      if (reach > fallbackReach) { fallbackReach = reach; fallback = d.name; }

      if (score > bestScore) { bestScore = score; best = d.name; }
    }

  if (!best || bestScore <= -50000) best = fallback || 'up';
  if (!best) best = 'up';
  lastDir = best;
  return best;
}

module.exports = { move };
