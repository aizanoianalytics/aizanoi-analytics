'use strict';
// ClaudeHaiku bot: 1-ply lookahead for each legal move, scored by Voronoi territory (cells I reach
// before any opponent head), storm-aware (uses the ring that expands at the end of this turn),
// head-on danger by length, and food urgency driven by health.

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

const INF = 1e9;
const DEFAULT_SHRINK_START = 150, DEFAULT_SHRINK_EVERY = 20;

function decide(state) {
  const W = state.width, H = state.height, N = W * H;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const me = state.you;
  const snakes = state.snakes || [];
  const myLen = me.body.length;
  const health = me.health;
  const turn = state.turn || 0;

  // Current storm ring r: cell is hazardous iff min edge distance d < r.
  const edgeDist = (x, y) => Math.min(x, y, W - 1 - x, H - 1 - y);
  let ring = 0;
  for (const h of state.hazards || []) ring = Math.max(ring, edgeDist(h.x, h.y) + 1);
  const cap = Math.floor(Math.min(W, H) / 2) - 1;
  // Expansion lands at the end of this turn when nextShrinkTurn === turn.
  const expandNow = typeof state.nextShrinkTurn === 'number' && state.nextShrinkTurn === turn && ring < cap;
  const nextRing = expandNow ? ring + 1 : ring;
  const turnsToShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn - turn : INF;

  // Blocked grid: current hazards, bodies (except each tail, which usually vacates).
  const blocked = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (edgeDist(x, y) < ring) blocked[y * W + x] = 1;
  for (const s of snakes) {
    const b = s.body;
    for (let k = 0; k < b.length - 1; k++) if (inB(b[k].x, b[k].y)) blocked[b[k].y * W + b[k].x] = 1;
  }
  // Territory field also treats the ring expanding this turn as walls.
  const blockedFuture = Uint8Array.from(blocked);
  if (expandNow) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (edgeDist(x, y) < nextRing) blockedFuture[y * W + x] = 1;

  const food = new Uint8Array(N);
  for (const f of state.food || []) if (inB(f.x, f.y)) food[f.y * W + f.x] = 1;

  const opps = snakes.filter(s => s.id !== me.id);

  // Multi-source BFS. Returns Int32Array of distances (INF = unreachable).
  function bfs(sources, blk) {
    const dist = new Int32Array(N).fill(INF);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (const [x, y] of sources) {
      const i = y * W + x;
      if (dist[i] === 0) continue;
      dist[i] = 0; q[qt++] = i;
    }
    while (qh < qt) {
      const i = q[qh++];
      const x = i % W, y = (i - x) / W;
      const d = dist[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (blk[j] || dist[j] !== INF) continue;
        dist[j] = d; q[qt++] = j;
      }
    }
    return dist;
  }

  const oppSources = opps.map(s => [s.body[0].x, s.body[0].y]);
  const oppDist = oppSources.length ? bfs(oppSources, blockedFuture) : new Int32Array(N).fill(INF);

  const candidates = [];
  for (const d of DIRS) {
    const nx = me.body[0].x + d.dx, ny = me.body[0].y + d.dy;
    if (!inB(nx, ny)) continue;
    const i = ny * W + nx;
    if (blocked[i]) continue;
    candidates.push({ name: d.name, nx, ny, i });
  }
  if (!candidates.length) return null;

  let best = null, bestScore = -INF;
  for (const c of candidates) {
    const eatsHere = food[c.i] === 1;
    const myNewLen = myLen + (eatsHere ? 1 : 0);
    const newHealth = eatsHere ? 100 : health - 1;
    let score = 0;

    // Head-on danger: an opponent head adjacent to my target can step onto it this turn.
    let risky = false;
    for (const o of opps) {
      const dx = Math.abs(o.body[0].x - c.nx), dy = Math.abs(o.body[0].y - c.ny);
      if (dx + dy !== 1) continue;
      if (o.body.length >= myNewLen) risky = true;
      else score += 40; // shorter snake next to me: a head-on we would win
    }
    if (risky) score -= 5000;

    // Standing in a cell the storm takes at the end of this turn: dies next move unless it's escaped.
    if (expandNow && edgeDist(c.nx, c.ny) < nextRing) score -= 800;

    // Territory from the candidate cell.
    const myDist = bfs([[c.nx, c.ny]], blockedFuture);
    let territory = 0, reach = 0, nearestFood = INF;
    for (let j = 0; j < N; j++) {
      const md = myDist[j];
      if (md === INF) continue;
      reach++;
      if (md < oppDist[j]) territory++;
      if (food[j] && md < nearestFood) nearestFood = md;
    }
    score += territory * 1.0 + reach * 0.2;

    // Food: strong when hungry, mild otherwise.
    if (nearestFood < INF) {
      const df = nearestFood + 1;
      if (newHealth <= 45 || newHealth - df < 25) score += 400 - 15 * df;
      else score += 4 - df;
    } else {
      score -= 200;
    }
    if (eatsHere && health <= 60) score += 60;
    if (eatsHere && health > 60) score -= 25; // growth is a liability when healthy

    // Storm: when a shrink is imminent, prefer cells farther from the edge.
    if (turnsToShrink <= 6) score += 6 * edgeDist(c.nx, c.ny);

    if (score > bestScore) { bestScore = score; best = c.name; }
  }
  return best;
}

function fallbackMove(state) {
  const me = state.you;
  const W = state.width, H = state.height;
  const blocked = new Set();
  for (const s of state.snakes || []) for (const b of s.body) blocked.add(b.x + ',' + b.y);
  for (const h of state.hazards || []) blocked.add(h.x + ',' + h.y);
  let best = 'up', bestS = -INF;
  for (const d of DIRS) {
    const nx = me.body[0].x + d.dx, ny = me.body[0].y + d.dy;
    let s = 0;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) s -= 1000;
    else if (blocked.has(nx + ',' + ny)) s -= 500;
    if (s > bestS) { bestS = s; best = d.name; }
  }
  return best;
}

function move(state) {
  try {
    const m = decide(state);
    if (m === 'up' || m === 'down' || m === 'left' || m === 'right') return m;
  } catch (e) { /* fall through */ }
  try { return fallbackMove(state); } catch (e2) { return 'up'; }
}

module.exports = { name: 'ClaudeHaiku', move };
