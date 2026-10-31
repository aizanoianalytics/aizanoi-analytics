'use strict';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

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

function decide(state) {
  const W = state.width, H = state.height;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const me = state.you;
  const turn = state.turn || 0;
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : 1e9;
  const rivals = (state.snakes || []).filter(s => s.id !== me.id);
  const food = (state.food || []).map(f => ({ x: f.x, y: f.y }));
  const hazards = (state.hazards || []).map(h => ({ x: h.x, y: h.y }));

  // Build blocked grid: body segments + hazards
  const N = W * H;
  const blocked = new Uint8Array(N);
  for (const h of hazards) if (inB(h.x, h.y)) blocked[h.y * W + h.x] = 1;
  for (const s of state.snakes || []) {
    for (const seg of s.body) if (inB(seg.x, seg.y)) blocked[seg.y * W + seg.x] = 1;
  }

  // Multi-source BFS from all rival heads
  const oppDist = bfs(W, H, blocked, rivals.map(r => r.head), 1e9);

  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const meHead = me.head;
  const myLength = me.length;
  const myHealth = me.health;

  let bestDir = null;
  let bestScore = -1e18;

  for (const [name, [dx, dy]] of Object.entries(DIRS)) {
    const nx = meHead.x + dx;
    const ny = meHead.y + dy;
    if (!inB(nx, ny)) continue;
    if (blocked[ny * W + nx]) continue;

    // BFS from this target cell (we would occupy it next turn)
    const myDist = bfs(W, H, blocked, [{ x: nx, y: ny }], 1e9);

    // Reachability: how many cells can we reach from this position?
    let reach = 0;
    for (let i = 0; i < N; i++) if (myDist[i] < 1e9) reach++;

    // Territory: cells closer to us than rivals (we move at time 1, they from head at time 0)
    let territory = 0;
    for (let i = 0; i < N; i++) {
      if (myDist[i] < 1e9 && myDist[i] + 1 < oppDist[i]) territory++;
    }

    // Attack evaluation: adjacent rivals
    let attack = 0;
    let unsafe = false;
    for (const r of rivals) {
      const man = Math.abs(r.head.x - nx) + Math.abs(r.head.y - ny);
      if (man === 1) {
        if (r.length >= myLength) {
          unsafe = true;   // equal or longer rival: avoid head-on trade
        } else {
          attack += 30;    // shorter rival dies if it steps into us
        }
      }
    }

    // Storm evaluation
    const edge = Math.min(nx, ny, W - 1 - nx, H - 1 - ny);
    let stormPenalty = 0;
    if (turn >= 120) {
      const soon = nextShrink - turn <= 25;
      if (edge === 0) stormPenalty = soon ? 120 : 15;
      else if (edge === 1) stormPenalty = soon ? 40 : 5;
    }

    // Food proximity
    let foodDist = Infinity;
    for (const f of food) {
      const d = Math.abs(nx - f.x) + Math.abs(ny - f.y);
      if (d < foodDist) foodDist = d;
    }

    // Score computation
    let score = 0;

    // Trapped in a pocket smaller than our body: very bad
    if (reach < myLength) score -= 3000 + (myLength - reach) * 100;

    // Territory is valuable
    score += territory * 4;

    // Reachability: more space is better (diminishing after 80)
    score += Math.min(reach, 80) * 0.5;

    // Attack bonus (only for weaker rivals; unsafe trades heavily penalized)
    score += attack;
    if (unsafe) score -= 5000;

    // Storm avoidance (stronger as storm approaches)
    score -= stormPenalty;

    // Center preference (generally safer, more territory)
    score -= (Math.abs(nx - cx) + Math.abs(ny - cy)) * 0.2;

    // Food chase when hungry; penalize heavily if food unreachable
    if (foodDist < Infinity) {
      const urgency = myHealth <= 25 ? 6 : myHealth <= 50 ? 2 : 0;
      if (foodDist < myHealth) {
        score += urgency * 30 / (foodDist + 1);
      } else {
        score -= 30; // can't reach food in time, better to move
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = name;
    }
  }

  // Safety: if no valid move found, or if score is very negative, fallback
  if (!bestDir || bestScore < -1e15) {
    // No legal moves at all - return any direction that won't immediately wall-strike
    for (const [name, [dx, dy]] of Object.entries(DIRS)) {
      const nx = meHead.x + dx;
      const ny = meHead.y + dy;
      if (inB(nx, ny)) return name;
    }
    return 'up';
  }

  return bestDir;
}

module.exports = { name: 'NemotronBot', move };