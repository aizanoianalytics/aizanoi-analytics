'use strict';
// SNAKE ROYALE bot: flood fill + Voronoi territory + head-to-head discipline + food urgency.

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

function bfs(W, H, blocked, sources, inf) {
  const N = W * H;
  const dist = new Int32Array(N).fill(inf);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const s of sources) {
    const i = s.y * W + s.x;
    if (dist[i] !== inf) continue;
    dist[i] = 0;
    q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W, y = (i - x) / W;
    const d = dist[i] + 1;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (blocked[j] || dist[j] !== inf) continue;
      dist[j] = d;
      q[qt++] = j;
    }
  }
  return dist;
}

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

function decide(state) {
  const W = state.width, H = state.height, N = W * H;
  const INF = 1e9;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const me = state.you;
  const turn = state.turn || 0;
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : INF;
  const storm = turn >= 120;

  // Hard-blocked grid: every body segment of every snake, plus hazards.
  const blocked = new Uint8Array(N);
  for (const h of state.hazards || []) if (inB(h.x, h.y)) blocked[h.y * W + h.x] = 1;
  for (const s of state.snakes || []) {
    for (const seg of s.body || []) if (inB(seg.x, seg.y)) blocked[seg.y * W + seg.x] = 1;
  }

  const rivals = (state.snakes || []).filter(s => s.id !== me.id);
  const food = state.food || [];

  // Opponent territory: multi-source BFS from every rival head (their moves land at distance >= 1).
  const oppDist = bfs(W, H, blocked, rivals.map(r => r.head), INF);

  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  let best = null, bestScore = -Infinity;

  for (const d of DIRS) {
    const nx = me.head.x + d.dx, ny = me.head.y + d.dy;
    if (!inB(nx, ny)) continue;
    if (blocked[ny * W + nx]) continue;

    let score = 0;
    let unsafe = false;
    let attack = 0;
    for (const r of rivals) {
      const man = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
      if (man === 1) {
        if (r.length >= me.length) unsafe = true;   // equal or longer rival can trade heads with us
        else attack += 40;                           // shorter rival dies if it steps into us
      }
    }

    // Our reachable space starting from the target cell (we occupy it next).
    const myDist = bfs(W, H, blocked, [{ x: nx, y: ny }], INF);
    let reach = 0, territory = 0, foodDist = INF;
    for (let i = 0; i < N; i++) {
      if (myDist[i] >= INF) continue;
      reach++;
      // We are at the target at time 1; opponents move from their heads at time 0.
      if (myDist[i] + 1 < oppDist[i]) territory++;
    }
    for (const f of food) {
      const fi = f.y * W + f.x;
      if (myDist[fi] < INF) foodDist = Math.min(foodDist, myDist[fi]);
    }

    // Trapped in a pocket smaller than our body: very bad.
    if (reach < me.length) score -= 3000 + (me.length - reach) * 100;
    if (unsafe) score -= 5000;

    score += territory * 4;
    score += Math.min(reach, 80) * 0.5;
    score += attack;

    // Food: eat more when health is low; otherwise a small steady pull (length wins head-to-heads).
    if (foodDist < INF) {
      const urgency = me.health <= 25 ? 6 : me.health <= 50 ? 2 : 0.8;
      // Only chase food we can reach before starvation.
      if (foodDist < me.health) score += urgency * 30 / (foodDist + 1);
      else score -= 20;
    }

    // Storm: stay off the outer rings as they close, and drift toward center.
    const edge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
    if (storm) {
      const soon = nextShrink - turn <= 25;
      if (edge === 0) score -= soon ? 120 : 15;
      else if (edge === 1) score -= soon ? 40 : 5;
    }
    score -= (Math.abs(nx - cx) + Math.abs(ny - cy)) * (storm ? 0.6 : 0.2);

    if (score > bestScore) {
      bestScore = score;
      best = d.name;
    }
  }

  if (best) return best;
  // No legal cell: return any direction (the arena will treat it as a death anyway).
  return 'up';
}

module.exports = { name: 'HaikuRoyale', move };
