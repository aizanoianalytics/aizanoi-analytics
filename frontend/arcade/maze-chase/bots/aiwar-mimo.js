'use strict';

const DIRS = ['up', 'right', 'down', 'left'];
const DELTA = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0], stay: [0, 0] };
const BIG = 0x3fffffff;

module.exports = {
  name: 'Apex',
  move(state) {
    try {
      if (!state || !state.you || !state.grid || !state.width) return 'stay';
      const you = state.you;
      if (you.role === 'runner') {
        if (!you.alive || you.respawnIn > 0) return 'stay';
        return runnerMove(state);
      }
      return ghostMove(state);
    } catch (e) {
      return 'stay';
    }
  }
};

function stepCell(state, x, y, dir) {
  const d = DELTA[dir];
  let nx = x + d[0];
  const ny = y + d[1];
  if (ny < 0 || ny >= state.height) return null;
  if (y === state.tunnelRow && d[1] === 0) {
    nx = (nx + state.width) % state.width;
  } else if (nx < 0 || nx >= state.width) {
    return null;
  }
  if (state.grid[ny][nx] === '#') return null;
  return { x: nx, y: ny };
}

function runnerNext(state, x, y, dir) {
  if (dir === 'stay') return { x, y };
  const p = stepCell(state, x, y, dir);
  if (!p) return null;
  const c = state.grid[p.y][p.x];
  if (c === 'G' || c === '-') return null;
  return p;
}

function ghostNext(state, x, y, dir, canLeave) {
  if (dir === 'stay') return { x, y };
  const from = state.grid[y][x];
  const p = stepCell(state, x, y, dir);
  if (!p) return null;
  const c = state.grid[p.y][p.x];
  if (from === 'G' && c !== 'G' && c !== '-') return null;
  if (c === 'G' && from !== 'G' && from !== '-') return null;
  if (!canLeave && c !== 'G') return null;
  return p;
}

function exteriorBfs(state, sx, sy) {
  const W = state.width;
  const dist = new Int32Array(W * state.height).fill(-1);
  if (state.grid[sy][sx] === 'G') return dist;
  const q = [sx, sy];
  dist[sy * W + sx] = 0;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1];
    const d = dist[y * W + x];
    for (const dir of DIRS) {
      const p = stepCell(state, x, y, dir);
      if (!p) continue;
      const c = state.grid[p.y][p.x];
      if (c === 'G' || c === '-') continue;
      const k = p.y * W + p.x;
      if (dist[k] !== -1) continue;
      dist[k] = d + 1;
      q.push(p.x, p.y);
    }
  }
  return dist;
}

function penDistMap(state, sx, sy) {
  const W = state.width;
  const dist = new Int32Array(W * state.height).fill(-1);
  const q = [sx, sy];
  dist[sy * W + sx] = 0;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1];
    const d = dist[y * W + x];
    for (const dir of DIRS) {
      const p = stepCell(state, x, y, dir);
      if (!p) continue;
      const c = state.grid[p.y][p.x];
      if (c !== 'G' && c !== '-') continue;
      const k = p.y * W + p.x;
      if (dist[k] !== -1) continue;
      dist[k] = d + 1;
      q.push(p.x, p.y);
    }
  }
  return dist;
}

function penToDoorMap(state) {
  const W = state.width, H = state.height;
  const dist = new Int32Array(W * H).fill(-1);
  const q = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (state.grid[y][x] === '-') {
        dist[y * W + x] = 0;
        q.push(x, y);
      }
    }
  }
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1];
    const d = dist[y * W + x];
    for (const dir of DIRS) {
      const p = stepCell(state, x, y, dir);
      if (!p) continue;
      const c = state.grid[p.y][p.x];
      if (c !== 'G' && c !== '-') continue;
      const k = p.y * W + p.x;
      if (dist[k] !== -1) continue;
      dist[k] = d + 1;
      q.push(p.x, p.y);
    }
  }
  return dist;
}

function doorCells(state) {
  const out = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (state.grid[y][x] === '-') out.push({ x, y });
    }
  }
  return out;
}

function doorOuts(state, dx, dy) {
  const out = [];
  for (const dir of DIRS) {
    const p = stepCell(state, dx, dy, dir);
    if (!p) continue;
    const c = state.grid[p.y][p.x];
    if (c === 'G' || c === '-') continue;
    out.push(p);
  }
  return out;
}

function mergeFrom(state, sx, sy, sd, dist) {
  const W = state.width;
  if (state.grid[sy][sx] === 'G') return;
  const local = new Int32Array(dist.length).fill(-1);
  const q = [sx, sy];
  local[sy * W + sx] = sd;
  if (sd < dist[sy * W + sx]) dist[sy * W + sx] = sd;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1];
    const d = local[y * W + x];
    for (const dir of DIRS) {
      const p = stepCell(state, x, y, dir);
      if (!p) continue;
      const c = state.grid[p.y][p.x];
      if (c === 'G' || c === '-') continue;
      const k = p.y * W + p.x;
      if (local[k] !== -1) continue;
      local[k] = d + 1;
      if (d + 1 < dist[k]) dist[k] = d + 1;
      q.push(p.x, p.y);
    }
  }
}

function computeDanger(state) {
  const W = state.width, H = state.height;
  const dist = new Int32Array(W * H).fill(BIG);
  for (const g of state.ghosts) {
    if (g.frightened) continue;
    if (!g.inPen) {
      mergeFrom(state, g.x, g.y, 0, dist);
    } else {
      const wait = Math.max(0, g.releaseIn - 1);
      const pd = penDistMap(state, g.x, g.y);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (state.grid[y][x] !== '-') continue;
          const pk = y * W + x;
          if (pd[pk] === -1) continue;
          const base = wait + pd[pk] + 1;
          for (const n of doorOuts(state, x, y)) {
            mergeFrom(state, n.x, n.y, base, dist);
          }
        }
      }
    }
  }
  return dist;
}

function liveRunners(state) {
  return state.runners.filter(r => r.alive && !r.respawnIn);
}

function powerValue(state, danger, you) {
  const W = state.width;
  let v = 50;
  const dt = danger[you.y * W + you.x];
  if (state.frightTicksLeft === 0) {
    if (dt <= 4) v += 150;
    else if (dt <= 8) v += 70;
    else if (dt <= 14) v += 25;
  } else {
    if (state.frightTicksLeft <= 8) v += 70;
    else if (state.ghostChain >= 2) v -= 40;
  }
  return v;
}

function evalRunnerMove(state, you, dest, danger, edible, protLeft) {
  const W = state.width, H = state.height;
  const dk = dest.y * W + dest.x;
  const protAt = t => protLeft >= t + 1;
  let death = false;
  if (!protAt(1) && danger[dk] <= 1) death = true;

  const pv = powerValue(state, danger, you);
  const huntActive = state.frightTicksLeft > 2 && edible.length > 0;
  let firstPellet = -1, firstPower = -1, firstHunt = -1;
  const huntSet = new Set(edible.map(g => g.y * W + g.x));

  const seen = new Int8Array(W * H);
  let frontier = [dest.x, dest.y];
  seen[dk] = 1;
  let t = 1;
  const maxDepth = 48;
  while (frontier.length && t <= maxDepth) {
    const next = [];
    const prot = protAt(t);
    for (let i = 0; i < frontier.length; i += 2) {
      const x = frontier[i], y = frontier[i + 1];
      const k = y * W + x;
      if (!prot && danger[k] <= t) continue;
      const cell = state.grid[y][x];
      if (firstPower < 0 && cell === 'o') firstPower = t;
      if (firstPellet < 0 && cell === '.') firstPellet = t;
      if (firstHunt < 0 && huntSet.has(k)) firstHunt = t;
      if (firstPellet >= 0 && firstPower >= 0 && (!huntActive || firstHunt >= 0)) {
        t = maxDepth + 1;
        break;
      }
      for (const dir of DIRS) {
        const p = runnerNext(state, x, y, dir);
        if (!p) continue;
        const nk = p.y * W + p.x;
        if (seen[nk]) continue;
        seen[nk] = 1;
        next.push(p.x, p.y);
      }
    }
    frontier = next;
    t++;
  }

  let score = 0;
  const dc = state.grid[dest.y][dest.x];
  if (dc === '.') score += 14;
  if (dc === 'o') score += pv;
  if (firstPellet > 0) score += 12 / firstPellet;
  if (firstPower > 0) score += pv * 0.85 / firstPower;
  if (huntActive && firstHunt > 0 && firstHunt <= state.frightTicksLeft - 2) {
    score += Math.min(state.nextGhostPoints, 800) * 0.9 / firstHunt;
  }

  let margin = 8;
  if (!death) {
    margin = danger[dk] - 1;
    if (margin > 8) margin = 8;
  }
  score += margin * 0.6;

  let deg = 0;
  for (const dir of DIRS) if (runnerNext(state, dest.x, dest.y, dir)) deg++;
  score += deg * 0.15;

  if (death) score -= 1e7;
  return { score, death };
}

function runnerMove(state) {
  const you = state.you;
  const W = state.width;
  const protLeft = you.invulnerableTicksLeft;
  const danger = computeDanger(state);
  const edible = state.ghosts.filter(g => g.frightened && !g.inPen);

  const cands = [];
  for (const dir of ['stay'].concat(DIRS)) {
    const p = runnerNext(state, you.x, you.y, dir);
    if (!p) continue;
    cands.push({ dir, p });
  }
  if (!cands.length) return 'stay';

  let best = null;
  let bestSafe = null;
  for (const c of cands) {
    const ev = evalRunnerMove(state, you, c.p, danger, edible, protLeft);
    const rec = { dir: c.dir, score: ev.score + (c.dir === you.dir ? 0.05 : 0) };
    if (!ev.death) {
      if (!bestSafe || rec.score > bestSafe.score) bestSafe = rec;
    }
    if (!best || rec.score > best.score) best = rec;
  }
  return (bestSafe || best).dir;
}

function computeAssignments(state) {
  const runners = liveRunners(state);
  const assign = {};
  if (!runners.length || !state.ghosts.length) return assign;
  const doors = doorCells(state);
  const pairs = [];
  state.ghosts.forEach((g, gi) => {
    const costs = runners.map(r => {
      if (!g.inPen) {
        const m = exteriorBfs(state, g.x, g.y);
        const d = m[r.y * state.width + r.x];
        return d >= 0 ? d : 4000;
      }
      const wait = Math.max(0, g.releaseIn - 1);
      let best = 4000;
      for (const d of doors) {
        const rough = wait + Math.abs(g.x - d.x) + Math.abs(g.y - d.y)
          + 1 + Math.abs(d.x - r.x) + Math.abs(d.y - r.y);
        if (rough < best) best = rough;
      }
      return best;
    });
    costs.forEach((c, ri) => pairs.push({ gi, gid: g.id, ri, c }));
  });
  pairs.sort((a, b) => a.c - b.c || a.gi - b.gi || a.ri - b.ri);
  const gUsed = new Set(), rUsed = new Set();
  const manyRunners = runners.length >= state.ghosts.length;
  for (const p of pairs) {
    if (gUsed.has(p.gi)) continue;
    if (manyRunners && rUsed.has(p.ri)) continue;
    gUsed.add(p.gi);
    rUsed.add(p.ri);
    assign[p.gid] = runners[p.ri].id;
  }
  for (const g of state.ghosts) {
    if (assign[g.id]) continue;
    let bi = 0, bc = 4e9;
    runners.forEach((r, ri) => {
      const rough = Math.abs(g.x - r.x) + Math.abs(g.y - r.y);
      if (rough < bc) { bc = rough; bi = ri; }
    });
    assign[g.id] = runners[bi].id;
  }
  return assign;
}

function interceptScore(state, fromX, fromY, target, reachAt) {
  const m = exteriorBfs(state, fromX, fromY);
  const W = state.width;
  const T = Math.min(12, 20);
  for (let t = 1; t <= T; t++) {
    let bestD = BIG;
    for (let k = 0; k < reachAt.length; k++) {
      if (reachAt[k] < 0 || reachAt[k] > t) continue;
      const d = m[k];
      if (d >= 0 && d < bestD) bestD = d;
    }
    if (bestD <= t) return t;
  }
  const td = m[target.y * W + target.x];
  return td >= 0 ? 100 + td : 400;
}

function runnerReachMap(state, r, T) {
  const W = state.width, H = state.height;
  const addedAt = new Int16Array(W * H).fill(-1);
  let frontier = [r.x, r.y];
  addedAt[r.y * W + r.x] = 0;
  for (let t = 1; t <= T; t++) {
    const next = [];
    for (let i = 0; i < frontier.length; i += 2) {
      const x = frontier[i], y = frontier[i + 1];
      for (const dir of DIRS) {
        const p = runnerNext(state, x, y, dir);
        if (!p) continue;
        const k = p.y * W + p.x;
        if (addedAt[k] !== -1) continue;
        addedAt[k] = t;
        next.push(p.x, p.y);
      }
    }
    frontier = next;
  }
  return addedAt;
}

function powerHotZones(state) {
  const W = state.width;
  const runners = liveRunners(state).filter(r => !r.invulnerable);
  const zones = [];
  if (state.frightTicksLeft > 0 || !runners.length) return zones;
  for (const p of state.powerPellets) {
    let rp = BIG;
    for (const r of runners) {
      const m = runnerReachMap(state, r, 5);
      const d = m[p.y * W + p.x];
      if (d >= 0 && d < rp) rp = d;
    }
    if (rp <= 3) zones.push({ x: p.x, y: p.y, rp });
  }
  return zones;
}

function ghostMove(state) {
  const you = state.you;
  const nextTick = state.tick + 1;
  const frozen = you.frightened && nextTick % 2 === 1;
  const W = state.width;

  const canLeave = !(you.inPen && you.releaseIn > 1);
  const legal = [];
  for (const dir of ['stay'].concat(DIRS)) {
    const p = ghostNext(state, you.x, you.y, dir, canLeave);
    if (p) legal.push({ dir, p });
  }
  if (!legal.length) return 'stay';

  const runners = liveRunners(state);

  if (you.inPen) {
    if (you.frightened) return 'stay';
    const hold = holdAssignments(state);
    const target = hold.assign[you.id]
      || (runners[0] ? { x: runners[0].x, y: runners[0].y } : null);
    const pd = penToDoorMap(state);
    const tMap = target ? exteriorBfs(state, target.x, target.y) : null;
    let best = null;
    for (const c of legal) {
      const cell = state.grid[c.p.y][c.p.x];
      let sc;
      if (cell === 'G' || cell === '-') {
        const v = pd[c.p.y * W + c.p.x];
        sc = v === -1 ? -80 : -v;
      } else {
        const td = tMap ? tMap[c.p.y * W + c.p.x] : 0;
        sc = 10000 - (td >= 0 ? Math.min(td, 999) : 999);
      }
      if (!best || sc > best.sc) best = { sc, dir: c.dir };
    }
    return best.dir;
  }

  if (frozen) return 'stay';

  if (you.frightened) {
    let best = null;
    for (const c of legal) {
      const cell = state.grid[c.p.y][c.p.x];
      if (cell === '-' || cell === 'G') continue;
      let mind = BIG;
      for (const r of runners) {
        const m = exteriorBfs(state, r.x, r.y);
        const d = m[c.p.y * W + c.p.x];
        if (d >= 0 && d < mind) mind = d;
      }
      const sc = mind * 10 + (c.dir === you.dir ? 1 : 0);
      if (!best || sc > best.sc) best = { sc, dir: c.dir };
    }
    if (best) return best.dir;
    return 'stay';
  }

  if (!runners.length) return 'stay';

  const myDists = runners.map(r => {
    const m = exteriorBfs(state, r.x, r.y);
    const d = m[you.y * W + you.x];
    return { r, d: d >= 0 ? d : BIG };
  });
  myDists.sort((a, b) => a.d - b.d);

  if (myDists[0].d <= 2) {
    const target = myDists[0].r;
    const reach = runnerReachMap(state, target, 12);
    let best = null;
    for (const c of legal) {
      const cell = state.grid[c.p.y][c.p.x];
      if (cell === '-' || cell === 'G') continue;
      const sc = -interceptScore(state, c.p.x, c.p.y, target, reach);
      if (!best || sc > best.sc) best = { sc, dir: c.dir };
    }
    if (best) return best.dir;
  }

  const hold = holdAssignments(state);
  const holdT = hold.assign[you.id];
  if (holdT) {
    if (holdT.x === you.x && holdT.y === you.y) return 'stay';
    const td = exteriorBfs(state, holdT.x, holdT.y);
    let best = null;
    for (const c of legal) {
      const cell = state.grid[c.p.y][c.p.x];
      if (cell === '-' || cell === 'G') continue;
      const d = td[c.p.y * W + c.p.x];
      if (d < 0) continue;
      const sc = -d + (c.dir === you.dir ? 0.1 : 0);
      if (!best || sc > best.sc) best = { sc, dir: c.dir };
    }
    if (best) return best.dir;
  }

  const assign = computeAssignments(state);
  const target2 = runners.find(r => r.id === assign[you.id]) || myDists[0].r;
  const reach = runnerReachMap(state, target2, 12);
  let best = null;
  for (const c of legal) {
    const cell = state.grid[c.p.y][c.p.x];
    if (cell === '-' || cell === 'G') continue;
    const sc = -interceptScore(state, c.p.x, c.p.y, target2, reach);
    if (!best || sc > best.sc) best = { sc, dir: c.dir };
  }
  return best ? best.dir : 'stay';
}

function holdAssignments(state) {
  const W = state.width, H = state.height;
  const runners = liveRunners(state);
  const pelletsList = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (state.grid[y][x] === 'o') pelletsList.push({ x, y, power: true });
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (state.grid[y][x] === '.') pelletsList.push({ x, y, power: false });
    }
  }
  const assign = {};
  if (!pelletsList.length) return { assign };

  const powerGap = new Map();
  const powers = pelletsList.filter(p => p.power);
  for (const p of powers) {
    let gap = BIG;
    const m = exteriorBfs(state, p.x, p.y);
    for (const q of powers) {
      if (q === p) continue;
      const d = m[q.y * W + q.x];
      if (d >= 0 && d < gap) gap = d;
    }
    powerGap.set(p.y * W + p.x, gap);
  }

  const runDist = new Int32Array(W * H).fill(BIG);
  for (const r of runners) {
    const m = exteriorBfs(state, r.x, r.y);
    for (let k = 0; k < runDist.length; k++) {
      if (m[k] >= 0 && m[k] < runDist[k]) runDist[k] = m[k];
    }
  }

  const doors = doorCells(state);
  const ghostPelletScores = state.ghosts.map(g => {
    let gd;
    if (!g.inPen) {
      gd = exteriorBfs(state, g.x, g.y);
    } else {
      gd = new Int32Array(W * H).fill(BIG);
      const wait = Math.max(0, g.releaseIn - 1);
      const pd = penDistMap(state, g.x, g.y);
      for (const d of doors) {
        const pk = d.y * W + d.x;
        if (pd[pk] === -1) continue;
        const base = wait + pd[pk] + 1;
        for (const n of doorOuts(state, d.x, d.y)) {
          const m = exteriorBfs(state, n.x, n.y);
          for (let k = 0; k < gd.length; k++) {
            if (m[k] >= 0 && base + m[k] < gd[k]) gd[k] = base + m[k];
          }
        }
      }
    }
    return pelletsList.map(p => {
      const gdist = gd[p.y * W + p.x];
      const rdist = runDist[p.y * W + p.x];
      if (gdist >= BIG) return -1e6;
      let sc = rdist - gdist;
      if (p.power) {
        sc += 8;
        const gap = powerGap.get(p.y * W + p.x);
        if (gap < 8) sc -= (8 - gap) * 4;
      }
      sc -= gdist * 0.05;
      return sc;
    });
  });

  const taken = new Set();
  for (let gi = 0; gi < state.ghosts.length; gi++) {
    let bestP = -1, bestSc = -Infinity;
    for (let pi = 0; pi < pelletsList.length; pi++) {
      if (taken.has(pi)) continue;
      const sc = ghostPelletScores[gi][pi];
      if (sc > bestSc) { bestSc = sc; bestP = pi; }
    }
    if (bestP >= 0) {
      taken.add(bestP);
      assign[state.ghosts[gi].id] = pelletsList[bestP];
    }
  }
  return { assign };
}
