'use strict';

module.exports = {
  name: 'MazeChaser',
  move(state) {
    try {
      return decide(state);
    } catch (e) {
      return 'stay';
    }
  }
};

function decide(state) {
  const D = MazeEngine.DIRS;
  const W = state.width;
  const H = state.height;
  const TR = state.tunnelRow;
  const grid = state.grid;
  const you = state.you;

  if (!you.alive || you.respawnIn > 0) return 'stay';

  const nextTick = state.tick + 1;
  if (you.role === 'ghost' && you.frightened && (nextTick % 2 === 1)) return 'stay';

  function neighbors(x, y, role, inPen, releaseIn) {
    const from = grid[y][x];
    const out = [];
    const dirs = ['up', 'down', 'left', 'right'];
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const dx = D[dir][0];
      const dy = D[dir][1];
      let nx = x + dx;
      const ny = y + dy;
      if (y === TR) nx = (nx + W) % W;
      if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
      const to = grid[ny][nx];
      if (to === '#') continue;
      if (role === 'runner') {
        if (to === 'G' || to === '-') continue;
      } else {
        if (from === 'G' && to !== 'G' && to !== '-') continue;
        if (to === 'G' && from !== 'G' && from !== '-') continue;
        if (inPen && releaseIn > 1 && to !== 'G') continue;
      }
      out.push({ x: nx, y: ny, dir: dir });
    }
    return out;
  }

  function bfs(sources, role, inPen, releaseIn) {
    const dist = new Int16Array(W * H);
    dist.fill(-1);
    const q = new Int32Array(W * H);
    let tail = 0;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const k = s.y * W + s.x;
      if (dist[k] === -1) {
        dist[k] = 0;
        q[tail++] = k;
      }
    }
    let head = 0;
    while (head < tail) {
      const k = q[head++];
      const x = k % W;
      const y = (k / W) | 0;
      const nd = dist[k] + 1;
      const nbrs = neighbors(x, y, role, inPen, releaseIn);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const nk = n.y * W + n.x;
        if (dist[nk] === -1) {
          dist[nk] = nd;
          q[tail++] = nk;
        }
      }
    }
    return dist;
  }

  const legal = neighbors(you.x, you.y, you.role, you.inPen, you.releaseIn);
  if (!legal.length) return 'stay';

  const frightenedGlobal = state.frightTicksLeft > 0;

  if (you.role === 'ghost') {
    const doors = [];
    if (you.inPen) {
      for (let y = 0; y < H; y++) {
        const row = grid[y];
        for (let x = 0; x < W; x++) {
          if (row[x] === '-') doors.push({ x: x, y: y });
        }
      }
    }

    const liveRunners = state.runners.filter(r => r.alive && !r.respawnIn);

    const chaseGhosts = state.ghosts.filter(g => !g.frightened && !(g.inPen && g.releaseIn > 1));

    const distMaps = new Map();
    for (let i = 0; i < chaseGhosts.length; i++) {
      const g = chaseGhosts[i];
      distMaps.set(g.id, bfs([{ x: g.x, y: g.y }], 'ghost', false, 0));
    }

    const assignment = new Map();
    const used = new Set();
    for (let i = 0; i < chaseGhosts.length; i++) {
      const g = chaseGhosts[i];
      const dm = distMaps.get(g.id);
      let best = null;
      let bestD = 1e9;
      for (let j = 0; j < liveRunners.length; j++) {
        const r = liveRunners[j];
        const d = dm[r.y * W + r.x];
        if (d < 0) continue;
        const penalty = used.has(r.id) ? 1000 : 0;
        if (d + penalty < bestD) {
          bestD = d + penalty;
          best = r;
        }
      }
      if (best) {
        assignment.set(g.id, best);
        if (!used.has(best.id)) used.add(best.id);
      }
    }

    function predictRunner(r, steps) {
      let x = r.x, y = r.y, dir = r.dir;
      for (let i = 0; i < steps; i++) {
        let nx = x, ny = y;
        if (dir === 'up') ny--;
        else if (dir === 'down') ny++;
        else if (dir === 'left') nx--;
        else if (dir === 'right') nx++;
        else break;
        if (y === TR) nx = (nx + W) % W;
        if (ny < 0 || ny >= H || nx < 0 || nx >= W) break;
        const to = grid[ny][nx];
        if (to === '#' || to === 'G' || to === '-') break;
        x = nx;
        y = ny;
      }
      return { x: x, y: y };
    }

    if (you.frightened && !you.inPen) {
      const runnerDist = bfs(liveRunners.map(r => ({ x: r.x, y: r.y })), 'ghost', false, 0);
      let best = null;
      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        const d = runnerDist[m.y * W + m.x];
        const score = d < 0 ? 10000 : d;
        if (!best || score > best.score || (score === best.score && m.dir === you.dir)) {
          best = { m: m, score: score };
        }
      }
      if (best) return best.m.dir;
      return legal[0].dir;
    }

    if (you.inPen && you.releaseIn > 1) {
      let target = null;
      if (doors.length) target = doors[0];
      if (target) {
        const dm = bfs([target], 'ghost', true, you.releaseIn);
        let best = null;
        for (let i = 0; i < legal.length; i++) {
          const m = legal[i];
          const d = dm[m.y * W + m.x];
          if (d < 0) continue;
          if (!best || d < best.d || (d === best.d && m.dir === you.dir)) {
            best = { m: m, d: d };
          }
        }
        if (best) return best.m.dir;
      }
      return legal[0].dir;
    }

    let targetRunner = assignment.get(you.id);
    if (!targetRunner && liveRunners.length) {
      const dm = bfs([{ x: you.x, y: you.y }], 'ghost', false, 0);
      let best = null, bestD = 1e9;
      for (let i = 0; i < liveRunners.length; i++) {
        const r = liveRunners[i];
        const d = dm[r.y * W + r.x];
        if (d >= 0 && d < bestD) { bestD = d; best = r; }
      }
      targetRunner = best || liveRunners[0];
    }

    let target = null;
    if (targetRunner) {
      target = predictRunner(targetRunner, 3);
    } else if (doors.length && you.inPen) {
      target = doors[0];
    } else {
      target = { x: (W / 2) | 0, y: (H / 2) | 0 };
    }

    const inPenFlag = you.inPen && you.releaseIn > 1;
    const ri = inPenFlag ? you.releaseIn : 0;
    const dm = bfs([target], 'ghost', inPenFlag, ri);

    let best = null;
    for (let i = 0; i < legal.length; i++) {
      const m = legal[i];
      const d = dm[m.y * W + m.x];
      if (d < 0) continue;
      if (!best || d < best.d || (d === best.d && m.dir === you.dir)) {
        best = { m: m, d: d };
      }
    }
    if (best) return best.m.dir;
    return legal[0].dir;
  }

  // runner
  const threats = state.ghosts.filter(g => !g.frightened && !g.inPen);
  const edible = state.ghosts.filter(g => g.frightened && !g.inPen);

  const runnerList = state.runners.filter(r => r.alive && !r.respawnIn);

  const runnerDistMaps = new Map();
  for (let i = 0; i < runnerList.length; i++) {
    const r = runnerList[i];
    runnerDistMaps.set(r.id, bfs([{ x: r.x, y: r.y }], 'runner', false, 0));
  }
  const youDist = runnerDistMaps.get(you.id) || bfs([{ x: you.x, y: you.y }], 'runner', false, 0);

  let dangerDist = null;
  if (threats.length) {
    dangerDist = bfs(threats.map(g => ({ x: g.x, y: g.y })), 'ghost', false, 0);
  }

  const pellets = [];
  for (let y = 0; y < H; y++) {
    const row = grid[y];
    for (let x = 0; x < W; x++) {
      const c = row[x];
      if (c === '.' || c === 'o') pellets.push({ x: x, y: y, power: c === 'o' });
    }
  }

  const nearestThreatDist = (!you.invulnerable && dangerDist)
    ? (dangerDist[you.y * W + you.x] < 0 ? 100 : dangerDist[you.y * W + you.x])
    : 100;
  const flee = !you.invulnerable && threats.length > 0 && nearestThreatDist <= 7;

  let target = null;

  if (flee) {
    target = null;
  } else if (frightenedGlobal && edible.length) {
    const candidates = [];
    for (let i = 0; i < edible.length; i++) {
      const g = edible[i];
      const d = youDist[g.y * W + g.x];
      if (d >= 0 && d < state.frightTicksLeft - 1) {
        candidates.push({ g: g, d: d });
      }
    }
    if (candidates.length) {
      let best = null;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        let minOther = 1e9;
        for (let j = 0; j < runnerList.length; j++) {
          const r = runnerList[j];
          if (r.id === you.id) continue;
          const dm = runnerDistMaps.get(r.id);
          if (!dm) continue;
          const d = dm[c.g.y * W + c.g.x];
          if (d >= 0 && d < minOther) minOther = d;
        }
        const voronoiPenalty = minOther <= c.d ? 2 : 0;
        const score = c.d + voronoiPenalty;
        if (!best || score < best.score) best = { g: c.g, score: score };
      }
      if (best) target = { x: best.g.x, y: best.g.y };
    }
  }

  if (!target && pellets.length) {
    let best = null;
    for (let i = 0; i < pellets.length; i++) {
      const p = pellets[i];
      const dSelf = youDist[p.y * W + p.x];
      if (dSelf < 0) continue;
      let minOther = 1e9;
      for (let j = 0; j < runnerList.length; j++) {
        const r = runnerList[j];
        if (r.id === you.id) continue;
        const dm = runnerDistMaps.get(r.id);
        if (!dm) continue;
        const d = dm[p.y * W + p.x];
        if (d >= 0 && d < minOther) minOther = d;
      }
      let score = dSelf;
      if (p.power) {
        if (threats.length) score -= 4;
        else score += 2;
      }
      if (minOther <= dSelf) score += 3;
      if (!best || score < best.score) best = { p: p, score: score };
    }
    if (best) target = { x: best.p.x, y: best.p.y };
  }

  if (target) {
    const distToTarget = bfs([target], 'runner', false, 0);
    function safetyOf(m) {
      if (you.invulnerable) return 100;
      if (!dangerDist) return 100;
      const d = dangerDist[m.y * W + m.x];
      return d < 0 ? 100 : d;
    }

    let chosen = null;
    for (let i = 0; i < legal.length; i++) {
      const m = legal[i];
      const s = safetyOf(m);
      if (s < 1) continue;
      const d = distToTarget[m.y * W + m.x];
      const dd = d < 0 ? 1000 : d;
      if (!chosen || dd < chosen.dd || (dd === chosen.dd && s > chosen.s) || (dd === chosen.dd && s === chosen.s && m.dir === you.dir)) {
        chosen = { m: m, dd: dd, s: s };
      }
    }
    if (!chosen) {
      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        const s = safetyOf(m);
        if (s < 1) continue;
        const d = distToTarget[m.y * W + m.x];
        const dd = d < 0 ? 1000 : d;
        if (!chosen || dd < chosen.dd || (dd === chosen.dd && s > chosen.s) || (dd === chosen.dd && s === chosen.s && m.dir === you.dir)) {
          chosen = { m: m, dd: dd, s: s };
        }
      }
    }
    if (!chosen) {
      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        const s = safetyOf(m);
        const d = distToTarget[m.y * W + m.x];
        const dd = d < 0 ? 1000 : d;
        if (!chosen || s > chosen.s || (s === chosen.s && dd < chosen.dd) || (s === chosen.s && dd === chosen.dd && m.dir === you.dir)) {
          chosen = { m: m, dd: dd, s: s };
        }
      }
    }
    if (chosen) return chosen.m.dir;
  }

  if (dangerDist) {
    let best = null;
    for (let i = 0; i < legal.length; i++) {
      const m = legal[i];
      const s = (dangerDist[m.y * W + m.x] < 0 ? 100 : dangerDist[m.y * W + m.x]);
      if (!best || s > best.s || (s === best.s && m.dir === you.dir)) {
        best = { m: m, s: s };
      }
    }
    if (best) return best.m.dir;
  }

  for (let i = 0; i < legal.length; i++) {
    if (legal[i].dir === you.dir) return legal[i].dir;
  }
  return legal[0].dir;
}
