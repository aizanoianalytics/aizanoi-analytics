'use strict';

// Claude Haiku 5.5 Maze Chase bot.
// Runners: time-aware safe BFS (a cell is entered at tick t only if no ghost can
// reach it by then), scoring first moves by the value of reachable pellets,
// power pellets and edible ghosts.
// Ghosts: greedy chase on BFS distance maps, assigned to runners with a load
// penalty, with an ambush target for every second ghost; frightened ghosts flee.

const DIRS = ['up', 'right', 'down', 'left'];
const VEC = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const DIR_INDEX = { up: 0, right: 1, down: 2, left: 3 };
const INF = 1e9;
const HORIZON = 200;
const MARGIN = 0;

function stepDir(s, x, y, dir) {
  const v = VEC[dir];
  if (!v) return null;
  let nx = x + v[0];
  const ny = y + v[1];
  if (y === s.tunnelRow) nx = (nx + s.width) % s.width;
  if (ny < 0 || ny >= s.height || nx < 0 || nx >= s.width) return null;
  return { x: nx, y: ny, dir };
}

function canEnter(role, from, to) {
  if (to === undefined || to === '#') return false;
  if (role === 'runner') return to !== 'G' && to !== '-';
  if (from === 'G' && to !== 'G' && to !== '-') return false;
  if (to === 'G' && from !== 'G' && from !== '-') return false;
  return true;
}

function legalMoves(s, x, y, role) {
  const from = s.grid[y][x];
  const out = [];
  for (const dir of DIRS) {
    const n = stepDir(s, x, y, dir);
    if (n && canEnter(role, from, s.grid[n.y][n.x])) out.push(n);
  }
  return out;
}

// Multi-source shortest distances (Dial buckets). sources: {x, y, d}.
function distanceMap(s, sources, role) {
  const W = s.width;
  const dist = new Array(W * s.height).fill(INF);
  const buckets = [];
  for (const src of sources) {
    const d = src.d || 0;
    const k = src.y * W + src.x;
    if (d < dist[k]) {
      dist[k] = d;
      (buckets[d] || (buckets[d] = [])).push(k);
    }
  }
  for (let d = 0; d < buckets.length; d++) {
    const list = buckets[d];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const k = list[i];
      if (dist[k] !== d) continue;
      const x = k % W;
      const y = (k - x) / W;
      const from = s.grid[y][x];
      for (const dir of DIRS) {
        const n = stepDir(s, x, y, dir);
        if (!n || !canEnter(role, from, s.grid[n.y][n.x])) continue;
        const nk = n.y * W + n.x;
        if (d + 1 < dist[nk]) {
          dist[nk] = d + 1;
          (buckets[d + 1] || (buckets[d + 1] = [])).push(nk);
        }
      }
    }
  }
  return dist;
}

function runnerMove(s, you) {
  const W = s.width;
  const idx = (x, y) => y * W + x;

  // Ghosts that can hurt runners: not frightened. Pen ghosts count from release time.
  const threatSrc = s.ghosts
    .filter(g => !g.frightened)
    .map(g => ({ x: g.x, y: g.y, d: g.inPen ? g.releaseIn : 0 }));
  const threat = distanceMap(s, threatSrc, 'ghost');

  const edible = new Map();
  s.ghosts.forEach(g => {
    if (g.frightened && !g.inPen) edible.set(idx(g.x, g.y), s.nextGhostPoints);
  });

  const others = s.runners.filter(r => r.id !== you.id && r.alive && !r.respawnIn);
  const otherMaps = others.map(r => distanceMap(s, [{ x: r.x, y: r.y, d: 0 }], 'runner'));

  const start = idx(you.x, you.y);
  const threatNear = threat[start] <= 8;
  const invLeft = you.invulnerableTicksLeft || 0;

  // Earliest-arrival BFS with time-aware safety.
  const arrive = new Array(W * s.height).fill(-1);
  const first = new Array(W * s.height).fill(null);
  arrive[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const t = arrive[k];
    if (t >= HORIZON) continue;
    const x = k % W;
    const y = (k - x) / W;
    const from = s.grid[y][x];
    for (const dir of DIRS) {
      const n = stepDir(s, x, y, dir);
      if (!n || !canEnter('runner', from, s.grid[n.y][n.x])) continue;
      const nk = idx(n.x, n.y);
      if (arrive[nk] !== -1) continue;
      const nt = t + 1;
      if (nt >= invLeft && threat[nk] <= nt + MARGIN) continue;
      arrive[nk] = nt;
      first[nk] = t === 0 ? dir : first[k];
      queue.push(nk);
    }
  }

  const best = [0, 0, 0, 0];
  const mob = [0, 0, 0, 0];
  for (let qi = 1; qi < queue.length; qi++) {
    const k = queue[qi];
    const t = arrive[k];
    const di = DIR_INDEX[first[k]];
    mob[di] += 1 / (t + 1);
    const x = k % W;
    const y = (k - x) / W;
    const cell = s.grid[y][x];
    let value = 0;
    if (cell === '.') value = 10;
    else if (cell === 'o') value = 50 + (threatNear ? 60 : 0);
    if (edible.has(k) && t < s.frightTicksLeft) value += edible.get(k);
    if (!value) continue;
    for (const om of otherMaps) {
      if (om[k] < t) { value *= 0.5; break; }
    }
    const score = value / (t + 1);
    if (score > best[di]) best[di] = score;
  }

  let bestDir = null;
  let bestScore = -1;
  DIRS.forEach((d, i) => {
    const sc = best[i] + 0.01 * mob[i];
    if (best[i] > 0 && sc > bestScore) { bestScore = sc; bestDir = d; }
  });
  if (bestDir) return bestDir;

  // No safe target: flee to the cell farthest from ghosts.
  const legal = legalMoves(s, you.x, you.y, 'runner');
  if (!legal.length) return 'stay';
  legal.sort((a, b) => threat[idx(b.x, b.y)] - threat[idx(a.x, a.y)]);
  return legal[0].dir;
}

function ghostMove(s, you) {
  const W = s.width;
  const idx = (x, y) => y * W + x;
  const cur = idx(you.x, you.y);
  let legal = legalMoves(s, you.x, you.y, 'ghost');
  if (you.inPen && you.releaseIn > 1) {
    legal = legal.filter(n => s.grid[n.y][n.x] === 'G');
  }
  if (!legal.length) return 'stay';

  const live = s.runners.filter(r => r.alive && !r.respawnIn);
  const targets = live.length
    ? live.map(r => ({ x: r.x, y: r.y, dir: r.dir, id: r.id }))
    : s.runners.filter(r => r.alive).map(r => ({ x: r.spawn.x, y: r.spawn.y, dir: 'stay', id: r.id }));
  if (!targets.length) return 'stay';

  const pick = map => {
    let best = null;
    let bestV = INF + 1;
    for (const n of legal) {
      const v = map[idx(n.x, n.y)];
      if (v < bestV || (v === bestV && n.dir === you.dir)) { bestV = v; best = n; }
    }
    return best ? best.dir : 'stay';
  };

  // Waiting in the pen for release: head toward the door.
  if (you.inPen && you.releaseIn > 1) {
    const doors = [];
    s.grid.forEach((row, y) => Array.from(row).forEach((c, x) => {
      if (c === '-') doors.push({ x, y, d: 0 });
    }));
    if (!doors.length) return 'stay';
    const dm = distanceMap(s, doors, 'ghost');
    if (dm[cur] === 0) return 'stay';
    return pick(dm);
  }

  // Frightened: run from runners, preferring open cells.
  if (you.frightened) {
    const maps = targets.map(t => distanceMap(s, [{ x: t.x, y: t.y, d: 0 }], 'ghost'));
    let best = null;
    let bestV = -INF;
    for (const n of legal) {
      let dmin = INF;
      for (const m of maps) dmin = Math.min(dmin, m[idx(n.x, n.y)]);
      if (dmin >= INF) dmin = 1000;
      const open = legalMoves(s, n.x, n.y, 'ghost').length;
      const v = dmin + 0.3 * open;
      if (v > bestV) { bestV = v; best = n; }
    }
    return best ? best.dir : 'stay';
  }

  // Chase: assign each non-frightened ghost to a runner (deterministic, shared view).
  const maps = targets.map(t => distanceMap(s, [{ x: t.x, y: t.y, d: 0 }], 'ghost'));
  const ghosts = s.ghosts
    .filter(g => !g.frightened)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const counts = targets.map(() => 0);
  let myTarget = -1;
  let myIdx = 0;
  for (const g of ghosts) {
    let bestI = 0;
    let bestC = INF * 2;
    targets.forEach((t, i) => {
      const c = maps[i][idx(g.x, g.y)] + 6 * counts[i];
      if (c < bestC) { bestC = c; bestI = i; }
    });
    if (g.id === you.id) { myTarget = bestI; myIdx = counts[bestI]; }
    counts[bestI]++;
  }
  if (myTarget < 0) myTarget = 0;

  const r = targets[myTarget];
  let tx = r.x;
  let ty = r.y;
  if (myIdx % 2 === 1 && VEC[r.dir] && r.dir !== 'stay') {
    // Ambush: aim a few cells ahead of the runner's heading.
    let px = r.x;
    let py = r.y;
    for (let i = 0; i < 4; i++) {
      const n = stepDir(s, px, py, r.dir);
      if (!n) break;
      const c = s.grid[n.y][n.x];
      if (c === '#' || c === 'G' || c === '-') break;
      px = n.x;
      py = n.y;
    }
    if (px !== r.x || py !== r.y) {
      const pm = distanceMap(s, [{ x: px, y: py, d: 0 }], 'ghost');
      if (pm[cur] < INF) { tx = px; ty = py; }
    }
  }
  const tMap = (tx === r.x && ty === r.y)
    ? maps[myTarget]
    : distanceMap(s, [{ x: tx, y: ty, d: 0 }], 'ghost');
  return pick(tMap);
}

module.exports = {
  name: 'Claude Haiku 5.5',
  move(state) {
    try {
      const you = state.you;
      if (!you || !you.alive || you.respawnIn) return 'stay';
      const dir = you.role === 'runner' ? runnerMove(state, you) : ghostMove(state, you);
      return DIRS.includes(dir) ? dir : 'stay';
    } catch (e) {
      return 'stay';
    }
  }
};
