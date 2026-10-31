'use strict';

const DIRS = MazeEngine.DIRS;
const CARDINAL = ['up', 'down', 'left', 'right'];
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left', stay: 'stay' };

function cellAt(state, x, y) {
  const row = state.grid[y];
  return row ? row[x] : undefined;
}

function key(x, y, w) {
  return (y * w + x) | 0;
}

function legalNeighbors(x, y, role, state) {
  const w = state.width;
  const h = state.height;
  const row = state.tunnelRow;
  const from = cellAt(state, x, y);
  const me = state.you;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const dir = CARDINAL[i];
    const d = DIRS[dir];
    let nx = x + d[0];
    const ny = y + d[1];
    if (y === row) nx = (nx + w) % w;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const cell = cellAt(state, nx, ny);
    if (!cell || cell === '#') continue;
    if (role === 'runner') {
      if (cell === 'G' || cell === '-') continue;
    } else {
      if (from === 'G' && cell !== 'G' && cell !== '-') continue;
      if (cell === 'G' && from !== 'G' && from !== '-') continue;
      if (me.inPen && me.releaseIn > 0 && cell !== 'G') continue;
    }
    out.push({ x: nx, y: ny, dir });
  }
  return out;
}

function bfsDistances(sources, role, state) {
  const w = state.width;
  const dist = new Map();
  const queue = [];
  sources.forEach(s => {
    const k = key(s.x, s.y, w);
    if (!dist.has(k)) {
      dist.set(k, 0);
      queue.push(s);
    }
  });
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    const d = dist.get(key(p.x, p.y, w)) + 1;
    legalNeighbors(p.x, p.y, role, state).forEach(n => {
      const k = key(n.x, n.y, w);
      if (!dist.has(k)) {
        dist.set(k, d);
        queue.push(n);
      }
    });
  }
  return dist;
}

function runnerMove(state) {
  const me = state.you;
  if (!me.alive || me.respawnIn) return 'stay';
  const legal = legalNeighbors(me.x, me.y, 'runner', state);
  if (!legal.length) return 'stay';

  const threats = state.ghosts.filter(g => !g.frightened && !g.inPen);
  const edible = state.ghosts.filter(g => g.frightened && !g.inPen);
  const danger = bfsDistances(threats, 'ghost', state);

  const pelletSrcs = [];
  const ediblePos = [];
  state.grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || c === 'o') pelletSrcs.push({ x, y });
      if (state.grid[y][x] === ' ') {}
    }
  });
  edible.forEach(g => ediblePos.push({ x: g.x, y: g.y }));

  const pelletDist = bfsDistances(pelletSrcs, 'runner', state);
  const edibleDist = bfsDistances(ediblePos, 'runner', state);
  const nextTick = state.tick + 1;
  const invuln = me.invulnerable;
  const curDanger = danger.get(key(me.x, me.y, state.width)) ?? 9999;

  let bestDir = 'stay';
  let bestScore = -Infinity;
  const w = state.width;
  for (let i = 0; i < legal.length; i++) {
    const m = legal[i];
    const k = key(m.x, m.y, w);
    const cell = cellAt(state, m.x, m.y);
    let s = 0;
    if (cell === 'o') s += 1500 + (curDanger <= 6 ? 1500 : 0);
    else if (cell === '.') s += 120;

    const edibleHere = edible.some(g => g.x === m.x && g.y === m.y);
    if (edibleHere) s += (nextTick % 2 === 1) ? 6000 : 1800;

    if (!invuln) {
      const d = danger.get(k) ?? 9999;
      if (d === 0) s -= 900000;
      else if (d <= 1) s -= 90000;
      else if (d <= 2) s -= 40000;
      else if (d <= 4) s -= 6000;
    }

    const pd = pelletDist.get(k) ?? 9999;
    s -= pd * 3;
    const ed = edibleDist.get(k) ?? 9999;
    if (edible.length) s -= ed;

    if (m.dir === me.dir) s += 2;
    if (m.dir === REVERSE[me.dir]) s -= 1;

    if (s > bestScore) {
      bestScore = s;
      bestDir = m.dir;
    }
  }
  return bestDir;
}

function ghostMove(state) {
  const me = state.you;
  const legal = legalNeighbors(me.x, me.y, 'ghost', state);
  if (!legal.length) return 'stay';

  const runners = state.runners.filter(r => r.alive && !r.respawnIn);
  const w = state.width;
  let bestDir = 'stay';
  let bestScore = -Infinity;

  if (me.frightened) {
    if (runners.length) {
      const dist = bfsDistances(runners, 'ghost', state);
      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        const d = dist.get(key(m.x, m.y, w)) ?? 0;
        let s = d * 10;
        if (m.dir === me.dir) s += 1;
        if (s > bestScore) {
          bestScore = s;
          bestDir = m.dir;
        }
      }
    } else {
      const pref = legal.find(m => m.dir === me.dir);
      return pref ? pref.dir : legal[0].dir;
    }
  } else if (runners.length) {
    const dist = bfsDistances(runners, 'ghost', state);
    for (let i = 0; i < legal.length; i++) {
      const m = legal[i];
      const d = dist.get(key(m.x, m.y, w)) ?? 9999;
      let s = -d * 10;
      if (m.dir === me.dir) s += 1;
      if (s > bestScore) {
        bestScore = s;
        bestDir = m.dir;
      }
    }
  } else {
    const pref = legal.find(m => m.dir === me.dir);
    return pref ? pref.dir : legal[0].dir;
  }
  return bestDir;
}

module.exports = {
  name: 'Nemotron',
  move(state) {
    return state.you.role === 'ghost' ? ghostMove(state) : runnerMove(state);
  }
};
