'use strict';

/*
 * "Chimera" - a runner/ghost bot for Maze Chase.
 *
 * Runner: time/risk weighted pellet routing with danger fields, power pellet
 *         emergencies, frightened-ghost hunting and a short-range escape mode.
 * Ghost:  pen release handling, intercept prediction along likely runner
 *         paths, penalty for duplicated pursuit and a frightened retreat.
 *
 * Only the documented globals (module, MazeEngine) are used.
 */
(function () {
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const DNAME = ['up', 'right', 'down', 'left'];
  const INF = 1e9;

  const isFloor = ch => ch === '.' || ch === 'o' || ch === ' ';

  function buildGraph(state) {
    const w = state.width, h = state.height, tun = state.tunnelRow;
    const grid = state.grid, n = w * h;
    const runAdj = new Array(n);
    const ghostAdj = new Array(n);
    const doors = [];
    const pellets = [];
    for (let y = 0; y < h; y++) {
      const row = grid[y];
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const cell = row[x];
        if (cell === '-') doors.push(i);
        if (cell === '.' || cell === 'o') pellets.push(i);
        const ra = [];
        const ga = [];
        if (cell !== '#') {
          for (let d = 0; d < 4; d++) {
            let nx = x + DX[d];
            const ny = y + DY[d];
            if (y === tun) nx = (nx + w) % w;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const dc = grid[ny][nx];
            if (dc === '#') continue;
            const j = ny * w + nx;
            let ghostOk = true;
            if (cell === 'G') ghostOk = dc === 'G' || dc === '-';
            else if (dc === 'G') ghostOk = cell === 'G' || cell === '-';
            if (ghostOk) ga.push({ i: j, dir: DNAME[d] });
            if (cell !== 'G' && cell !== '-' && isFloor(dc)) {
              ra.push({ i: j, dir: DNAME[d] });
            }
          }
        }
        runAdj[i] = ra;
        ghostAdj[i] = ga;
      }
    }
    return { w, h, n, tun, grid, runAdj, ghostAdj, doors, pellets };
  }

  function bfs(adj, sources, n) {
    const dist = new Int32Array(n);
    dist.fill(-1);
    const q = new Int32Array(n);
    let head = 0, tail = 0;
    for (let s = 0; s < sources.length; s++) {
      const v = sources[s];
      if (v >= 0 && v < n && dist[v] === -1) {
        dist[v] = 0;
        q[tail++] = v;
      }
    }
    while (head < tail) {
      const u = q[head++];
      const nd = dist[u] + 1;
      const arr = adj[u];
      for (let k = 0; k < arr.length; k++) {
        const v = arr[k].i;
        if (dist[v] === -1) {
          dist[v] = nd;
          q[tail++] = v;
        }
      }
    }
    return dist;
  }

  // Small binary heap for Dijkstra.
  function heapPush(heap, d, i) {
    let k = heap.length;
    heap.push([d, i]);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      const t = heap[p]; heap[p] = heap[k]; heap[k] = t;
      k = p;
    }
  }
  function heapPop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        const t = heap[m]; heap[m] = heap[k]; heap[k] = t;
        k = m;
      }
    }
    return top;
  }

  // Dijkstra with non-negative per-cell risk. Returns cost, first direction
  // string and predecessor for every reachable cell.
  function weightedSearch(adj, start, risk, n) {
    const cost = new Float64Array(n);
    cost.fill(Infinity);
    const prev = new Int32Array(n);
    prev.fill(-1);
    const first = new Array(n);
    first.fill(null);
    const heap = [];
    cost[start] = 0;
    heapPush(heap, 0, start);
    while (heap.length) {
      const top = heapPop(heap);
      const d = top[0], u = top[1];
      if (d > cost[u] + 1e-12) continue;
      const arr = adj[u];
      for (let k = 0; k < arr.length; k++) {
        const e = arr[k], v = e.i;
        const nd = d + 1 + risk[v];
        if (nd + 1e-12 < cost[v]) {
          cost[v] = nd;
          prev[v] = u;
          first[v] = u === start ? e.dir : first[u];
          heapPush(heap, nd, v);
        }
      }
    }
    return { cost, prev, first };
  }

  function pathFirst(g, start, target) {
    // BFS along the given adjacency, returns first direction to target.
    const dist = new Int32Array(g.n);
    dist.fill(-1);
    const prev = new Int32Array(g.n);
    prev.fill(-1);
    const pdir = new Array(g.n);
    const q = new Int32Array(g.n);
    let head = 0, tail = 0;
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const u = q[head++];
      if (u === target) break;
      const nd = dist[u] + 1;
      const arr = g.adj[u];
      for (let k = 0; k < arr.length; k++) {
        const v = arr[k].i;
        if (dist[v] === -1) {
          dist[v] = nd;
          prev[v] = u;
          pdir[v] = arr[k].dir;
          q[tail++] = v;
        }
      }
    }
    if (dist[target] === -1) return null;
    let v = target;
    while (prev[v] !== -1 && prev[v] !== start) v = prev[v];
    if (prev[v] === -1) return null;
    return pdir[v];
  }

  function nearestByDist(dist, candidates) {
    let best = -1, bd = INF;
    for (let k = 0; k < candidates.length; k++) {
      const c = candidates[k];
      const d = dist[c];
      if (d >= 0 && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function charAt(g, i) {
    return g.grid[(i / g.w) | 0][i % g.w];
  }

  // ---------------------------------------------------------------- runner

  // Persistent between moves in one round. Holding a destination avoids
  // flip-flopping between two pellets while a ghost patrols a junction.
  let memTarget = -1;
  let memKind = null;
  let lastScore = -1;
  let lastProgressTick = 0;

  function runnerMove(state, g) {
    const a = state.you;
    if (!a.alive || a.respawnIn > 0) return 'stay';

    const w = g.w, n = g.n, grid = g.grid;
    const me = a.y * w + a.x;
    const legal = g.runAdj[me];
    if (!legal || !legal.length) return 'stay';

    const frightNext = state.frightTicksLeft > 1;
    const protectedNext = a.invulnerableTicksLeft > 1;
    const threats = [];
    const edible = [];
    for (let k = 0; k < state.ghosts.length; k++) {
      const gh = state.ghosts[k];
      const gi = gh.y * w + gh.x;
      const frightenedNext = gh.frightened && frightNext;
      if (!frightenedNext) threats.push(gi);
      else if (!gh.inPen) edible.push({ gi, gh });
    }

    const ghostDist = threats.length
      ? bfs(g.ghostAdj, threats, n)
      : (() => { const d = new Int32Array(n); d.fill(-1); return d; })();
    const myDist = bfs(g.runAdj, [me], n);

    const nearestThreat = ghostDist[me] >= 0 ? ghostDist[me] : 999;

    if (lastScore < 0) { lastScore = a.score; lastProgressTick = state.tick; }
    if (a.score > lastScore) { lastScore = a.score; lastProgressTick = state.tick; }
    const desperate = state.tick - lastProgressTick >= 28;

    // Risk of being intercepted at a cell (relative to shortest arrival).
    const risk = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (myDist[i] < 0) continue;
      const gd = ghostDist[i];
      if (gd < 0) continue;
      const gap = gd - myDist[i];
      let r;
      if (gap <= 0) r = 400;
      else if (gap === 1) r = 12;
      else if (gap === 2) r = 4;
      else if (gap <= 4) r = 1;
      else r = 0;
      // Running into a dead end while a ghost is on your tail is fatal.
      if (gap <= 1 && g.runAdj[i].length < 2) r += 220;
      // A cell a dangerous ghost can step onto next tick is a hard no when
      // alternate routes exist.  This makes the planner detour instead of
      // oscillating in front of an adjacent ghost.
      if (!protectedNext && charAt(g, i) !== 'o' && gd <= 1) r += 100000;
      if (desperate) {
        if (gap <= 0) r = 45;
        else if (gap === 1) r = 3;
        else if (gap === 2) r = 1;
        else r = 0;
        if (!protectedNext && gd === 0) r += 5000;
      }
      risk[i] = protectedNext ? r * 0.35 : r;
    }

    const search = weightedSearch(g.runAdj, me, risk, n);

    let bestCell = -1;
    let bestScore = -Infinity;
    let bestKind = null;

    const powerBoost = nearestThreat <= 7
      ? 1 + (8 - nearestThreat) * 1.35
      : 1;

    const edibleSet = new Set(edible.map(e => e.gi));

    const targetScore = (i, kind) => {
      if (!(search.cost[i] < Infinity)) return -Infinity;
      if (kind === 'ghost') {
        if (!edibleSet.has(i)) return -Infinity;
        const steps = myDist[i];
        if (steps < 0) return -Infinity;
        if (steps * 1.6 + 2 > state.frightTicksLeft) return -Infinity;
        const value = state.nextGhostPoints * (0.55 + 0.35 * Math.min(1, state.frightTicksLeft / 30));
        return value / (search.cost[i] + 3);
      }
      const ch = charAt(g, i);
      if (ch !== '.' && ch !== 'o') return -Infinity;
      const power = ch === 'o';
      const value = power ? 50 * powerBoost : 10;
      return value / (search.cost[i] + 2);
    };

    for (let k = 0; k < g.pellets.length; k++) {
      const i = g.pellets[k];
      const ch = charAt(g, i);
      const kind = ch === 'o' ? 'power' : 'pellet';
      const score = targetScore(i, kind);
      if (score > bestScore) {
        bestScore = score;
        bestCell = i;
        bestKind = kind;
      }
    }

    // Hunt frightened ghosts when there is enough fright time left.
    for (let k = 0; k < edible.length; k++) {
      const i = edible[k].gi;
      const score = targetScore(i, 'ghost');
      if (score > bestScore) {
        bestScore = score;
        bestCell = i;
        bestKind = 'ghost';
      }
    }

    // Destination hysteresis: keep the current goal unless it vanished or a
    // clearly better chance appeared.
    if (memTarget >= 0) {
      const held = targetScore(memTarget, memKind);
      if (held > -Infinity && bestCell !== memTarget && bestScore < held * 2.5) {
        bestCell = memTarget;
        bestKind = memKind;
        bestScore = held;
      } else if (held === -Infinity) {
        memTarget = -1;
        memKind = null;
      }
    }
    if (bestCell >= 0) {
      memTarget = bestCell;
      memKind = bestKind;
    }

    const makeSafe = (i) => {
      if (i < 0) return false;
      if (protectedNext) return true;
      if (charAt(g, i) === 'o') return true;
      const gd = ghostDist[i];
      if (desperate) return !(gd === 0);
      return !(gd >= 0 && gd <= 1);
    };

    let chosen = null;
    let rejectDir = null, rejectGd = null;
    const targetDir = bestCell >= 0 ? search.first[bestCell] : null;
    if (bestCell >= 0 && targetDir) {
      // Walk the first step and verify its destination.
      const entry = legal.find(e => e.dir === targetDir);
      if (entry && makeSafe(entry.i)) chosen = targetDir;
      else if (entry) { rejectDir = targetDir; rejectGd = ghostDist[entry.i]; }
    }

    if (!chosen) {
      chosen = evade(g, legal, me, ghostDist, protectedNext, nearestThreat);
    }
    if (state.__trace) {
      const gs = state.ghosts.map(gh => gh.x + ',' + gh.y).join('|');
      console.log('RUN', state.tick, 'at', a.x + ',' + a.y, 'threat', nearestThreat,
        'best', bestCell >= 0 ? ((bestCell % w) + ',' + ((bestCell / w) | 0)) : '-', bestKind,
        'score', bestScore.toFixed(3), 'targetDir', targetDir, 'chosen', chosen,
        'rej', rejectDir, rejectGd,
        'mem', memTarget >= 0 ? ((memTarget % w) + ',' + ((memTarget / w) | 0)) : '-', memKind,
        'ghosts', gs, 'legal', legal.map(e => e.dir).join(''));
    }
    return chosen;
  }

  function evade(g, legal, me, ghostDist, protectedNext, nearestThreat) {
    const grid = g.grid, w = g.w;
    let bestDir = 'stay';
    let bestScore = -Infinity;

    const evaluate = (i, dir) => {
      const ch = charAt(g, i);
      let score = 0;
      const gd = ghostDist[i] >= 0 ? ghostDist[i] : 40;
      if (!protectedNext && ch !== 'o' && ghostDist[i] >= 0 && ghostDist[i] <= 1) {
        score -= 100000;
      }
      if (ch === 'o') score += 1000000;
      if (protectedNext) score += Math.min(gd, 20) * 30;
      else score += Math.min(gd, 18) * 120;
      const deg = g.runAdj[i].length;
      score += deg * 18;
      if (((i / w) | 0) === g.tun) score += 12;
      if (deg <= 1 && gd <= 5) score -= 220;
      if (deg <= 1 && gd <= 2) score -= 600;
      return score;
    };

    // Staying is a legitimate dodge when a ghost is far.
    const stayScore = evaluate(me, 'stay');
    if (stayScore > bestScore) { bestScore = stayScore; bestDir = 'stay'; }

    for (let k = 0; k < legal.length; k++) {
      const e = legal[k];
      const s = evaluate(e.i, e.dir);
      if (s > bestScore) { bestScore = s; bestDir = e.dir; }
    }
    return bestDir;
  }

  // ----------------------------------------------------------------- ghost

  function predictRunner(g, r, pelletDist, threatField, horizon) {
    const w = g.w;
    let x = r.x, y = r.y;
    let prevDir = r.dir;
    const out = [];
    for (let step = 0; step < horizon; step++) {
      const cur = y * w + x;
      const cands = g.runAdj[cur];
      let best = cur, bestScore = -Infinity;
      const hereDanger = threatField[cur];
      const careful = hereDanger >= 0 && hereDanger <= 6;
      for (let k = 0; k < cands.length; k++) {
        const e = cands[k];
        const v = e.i;
        const danger = threatField[v] >= 0 ? threatField[v] : 30;
        const pd = pelletDist[v] >= 0 ? pelletDist[v] : 30;
        let score;
        if (careful) {
          score = danger * 100 - pd * 3;
        } else {
          score = -pd * 30 + Math.min(danger, 12) * 2;
        }
        if (e.dir === prevDir) score += 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (best === cur) {
        out.push(cur);
      } else {
        // recover direction for continuity bias
        for (let k = 0; k < cands.length; k++) {
          if (cands[k].i === best) { prevDir = cands[k].dir; break; }
        }
        x = best % w;
        y = (best / w) | 0;
        out.push(best);
      }
    }
    return out;
  }

  function ghostMove(state, g) {
    const a = state.you;
    const w = g.w, n = g.n, grid = g.grid;
    const me = a.y * w + a.x;
    const nextTick = state.tick + 1;
    const frightNext = state.frightTicksLeft > 1;
    const frightenedNext = a.frightened && frightNext;

    const legalFrom = i => {
      const arr = g.ghostAdj[i];
      if (!a.inPen) return arr;
      if (a.releaseIn > 1) {
        // Still locked inside the pen: only G cells are legal.
        return arr.filter(e => charAt(g, e.i) === 'G');
      }
      return arr;
    };

    if (a.inPen) {
      if (frightenedNext) {
        // The pen is the only truly safe spot during fright.
        return 'stay';
      }
      const here = charAt(g, me);
      if (a.releaseIn > 1) {
        // Wait near the door so release costs no extra ticks.
        if (!g.doors.length) return 'stay';
        const door = g.doors[0];
        const dx = door % w;
        const dy = (door / w) | 0;
        let goal = -1;
        for (let k = 0; k < g.ghostAdj.length; k++) {
          if (charAt(g, k) !== 'G') continue;
          const x = k % w, y = (k / w) | 0;
          if (x === dx && y === dy + 1) { goal = k; break; }
        }
        if (goal < 0) return 'stay';
        if (me === goal) return 'stay';
        const adj = { n: g.n, adj: g.ghostAdj.map(list =>
          list.filter(e => charAt(g, e.i) === 'G')) };
        const d = pathFirst(adj, me, goal);
        return d || 'stay';
      }
      // Eligible: head for the nearest exterior floor cell.
      const exits = [];
      for (let i = 0; i < g.n; i++) {
        if (isFloor(charAt(g, i))) exits.push(i);
      }
      const dist = bfs(g.ghostAdj, [me], n);
      const target = nearestByDist(dist, exits);
      if (target < 0) return 'stay';
      const d = pathFirst({ n, adj: g.ghostAdj }, me, target);
      return d || 'stay';
    }

    // Exterior ghost.
    const runners = state.runners.filter(r => r.alive && !r.respawnIn);

    if (!frightenedNext) {
      // ------------------------------------------------------------ chase
      if (!runners.length) return wander(g, me, legalFrom(me), null);

      // Endgame lock: once every power pellet is gone, a ghost can simply
      // stand on a pellet far from all runner spawns.  Runners cannot pick
      // it up without first touching the ghost, and a 10-tick respawn shield
      // cannot cover that distance.  This converts a large pellet lead into
      // an unavoidable timeout.
      if (!state.powerPellets.length) {
        const gDist0 = bfs(g.ghostAdj, [me], n);
        const hereCh = charAt(g, me);
        const spawnSources = [];
        for (let k = 0; k < state.runners.length; k++) {
          const sp = state.runners[k].spawn;
          spawnSources.push(sp.y * w + sp.x);
        }
        const spawnDist = spawnSources.length
          ? bfs(g.runAdj, spawnSources, n)
          : (() => { const d = new Int32Array(n); d.fill(-1); return d; })();
        const camps = [];
        for (let k = 0; k < g.pellets.length; k++) {
          const i = g.pellets[k];
          if (charAt(g, i) !== '.') continue;
          if (gDist0[i] < 0) continue;
          camps.push({ i, sd: spawnDist[i] >= 0 ? spawnDist[i] : 0, gd: gDist0[i] });
        }
        if (camps.length) {
          camps.sort((a, b) => b.sd - a.sd || a.gd - b.gd || a.i - b.i);
          // Different ghosts take different far pellets when several of our
          // copies are on the board.
          const myIndex = state.ghosts.findIndex(gh => gh.id === a.id);
          const pick = camps[Math.max(0, myIndex) % camps.length];
          if (me === pick.i) return 'stay';
          // If a teammate already sits on a pellet, hunting is more useful.
          let teammateCamping = false;
          for (let k = 0; k < state.ghosts.length; k++) {
            const gh = state.ghosts[k];
            if (gh.id === a.id || gh.inPen) continue;
            const gi = gh.y * w + gh.x;
            if (charAt(g, gi) === '.' && gDist0[gi] >= 0) { teammateCamping = true; break; }
          }
          if (!teammateCamping) {
            const first = pathFirst({ n, adj: g.ghostAdj }, me, pick.i);
            if (first) return first;
          }
        }
      }

      const gDist = bfs(g.ghostAdj, [me], n);
      const pelletDist = bfs(g.runAdj, g.pellets, n);

      const threatSources = [];
      const others = [];
      for (let k = 0; k < state.ghosts.length; k++) {
        const gh = state.ghosts[k];
        const gi = gh.y * w + gh.x;
        if (gh.id === a.id) {
          threatSources.push(gi);
        } else {
          others.push({ gh, gi });
          if (!gh.inPen && !(gh.frightened && frightNext)) threatSources.push(gi);
        }
      }
      const threatField = bfs(g.ghostAdj, threatSources, n);
      const otherFields = others.map(o => bfs(g.ghostAdj, [o.gi], n));

      const myIndex = state.ghosts.findIndex(gh => gh.id === a.id);
      const H = 10;
      let bestTarget = -1;
      let bestTargetScore = -Infinity;

      for (let k = 0; k < runners.length; k++) {
        const r = runners[k];
        const rIdx = r.y * w + r.x;
        const pred = predictRunner(g, r, pelletDist, threatField, H);
        let intercept = rIdx;
        let chosenK = -1;
        let interceptDelta = INF;
        // Earliest predicted cell we can reach no later than the runner.
        for (let q = 1; q <= H; q++) {
          const c = pred[q - 1];
          const gd = gDist[c];
          if (gd < 0) continue;
          const delta = gd - q;
          if (delta <= 0) {
            intercept = c;
            chosenK = q;
            interceptDelta = delta;
            break;
          }
        }
        if (chosenK < 0) {
          // No cutting point: shadow the position where we are least behind.
          let bd = INF;
          for (let q = 1; q <= H; q++) {
            const c = pred[q - 1];
            const gd = gDist[c];
            if (gd < 0) continue;
            const delta = gd - q;
            if (delta < bd) { bd = delta; intercept = c; chosenK = q; }
          }
          interceptDelta = bd;
        }

        const ourDist = gDist[rIdx] >= 0 ? gDist[rIdx] : 999;
        let otherMin = 999;
        for (let z = 0; z < otherFields.length; z++) {
          const d = otherFields[z][rIdx];
          if (d >= 0 && d < otherMin) otherMin = d;
        }

        let score = -interceptDelta;
        if (r.invulnerable) score -= 5;
        if (r.lives === 1) score += 2.5;
        // Slight preference for targets we are relatively best suited for.
        if (otherMin < ourDist) score -= Math.min(3, (ourDist - otherMin) * 0.25);
        if (myIndex % 2 === 1) {
          // Vary the intercept slightly so identical teammates pincer.
          score += (chosenK % 3) * 0.05;
        }

        if (score > bestTargetScore) {
          bestTargetScore = score;
          bestTarget = intercept;
        }
      }

      if (bestTarget < 0) {
        return wander(g, me, legalFrom(me), gDist);
      }
      if (bestTarget === me) return 'stay';
      const first = pathFirst({ n, adj: g.ghostAdj }, me, bestTarget);
      if (first) return first;
      // Fallback: move straight at the nearest runner.
      let near = -1, nd = INF;
      for (let k = 0; k < runners.length; k++) {
        const ri = runners[k].y * w + runners[k].x;
        const d = gDist[ri];
        if (d >= 0 && d < nd) { nd = d; near = ri; }
      }
      if (near >= 0) {
        const f = pathFirst({ n, adj: g.ghostAdj }, me, near);
        if (f) return f;
      }
      return wander(g, me, legalFrom(me), gDist);
    }

    // ------------------------------------------------------- frightened
    const legal = legalFrom(me);
    if (!legal.length) return 'stay';

    // Runners are dangerous to us. Prefer the pen when it is close.
    const runnerIdxs = runners.map(r => r.y * w + r.x);
    const runDist = runnerIdxs.length
      ? bfs(g.runAdj, runnerIdxs, n)
      : (() => { const d = new Int32Array(n); d.fill(-1); return d; })();
    const doorDist = g.doors.length
      ? bfs(g.ghostAdj, g.doors, n)
      : (() => { const d = new Int32Array(n); d.fill(-1); return d; })();

    const myRunnerDist = runDist[me] >= 0 ? runDist[me] : 999;
    const myDoorDist = doorDist[me] >= 0 ? doorDist[me] : 999;

    if (myDoorDist <= 7 && myDoorDist <= myRunnerDist + 2) {
      const door = nearestByDist(doorDist, g.doors);
      if (door >= 0) {
        const first = pathFirst({ n, adj: g.ghostAdj }, me, door);
        if (first) return first;
      }
    }

    let bestDir = 'stay';
    let bestScore = -Infinity;
    const houseDoor = g.doors.length ? g.doors[0] : -1;
    const scoreCell = i => {
      const rd = runDist[i] >= 0 ? runDist[i] : 25;
      let s = Math.min(rd, 20) * 100;
      const deg = g.runAdj[i].length;
      s += deg * 8;
      if (houseDoor >= 0) {
        const dd = doorDist[i];
        if (dd >= 0) s += Math.max(0, 8 - dd) * 1.2;
      }
      return s;
    };
    const stayScore = scoreCell(me) + 2;
    if (stayScore > bestScore) { bestScore = stayScore; bestDir = 'stay'; }
    for (let k = 0; k < legal.length; k++) {
      const s = scoreCell(legal[k].i);
      if (s > bestScore) { bestScore = s; bestDir = legal[k].dir; }
    }
    return bestDir;
  }

  function wander(g, me, legal, dist) {
    if (!legal || !legal.length) return 'stay';
    let best = legal[0];
    let bs = -Infinity;
    for (let k = 0; k < legal.length; k++) {
      const e = legal[k];
      const dd = dist ? dist[e.i] : 0;
      const s = (dd >= 0 ? dd : 0) * 2 + g.runAdj[e.i].length;
      if (s > bs) { bs = s; best = e; }
    }
    return best.dir;
  }

  // ------------------------------------------------------------------ main

  function move(state) {
    const g = buildGraph(state);
    if (state.you.role === 'ghost') return ghostMove(state, g);
    return runnerMove(state, g);
  }

  module.exports = { name: 'Chimera', move };
})();
