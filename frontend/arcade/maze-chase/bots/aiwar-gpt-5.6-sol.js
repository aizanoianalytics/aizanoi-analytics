'use strict';

// Atlas uses complete-board distance fields plus a short, safety-aware lookahead.
module.exports = {
  name: 'Atlas',
  move(state) {
    const D = MazeEngine.DIRS;
    const DIRS = ['up', 'left', 'down', 'right'];
    const INF = 65535;
    const w = state.width, h = state.height, n = w * h;
    const you = state.you;
    const idx = (x, y) => y * w + x;
    const xy = i => ({ x: i % w, y: (i / w) | 0 });

    if (!you.alive || you.respawnIn) return 'stay';

    function step(x, y, dir) {
      let nx = x + D[dir][0], ny = y + D[dir][1];
      if (y === state.tunnelRow) nx = (nx + w) % w;
      return { x: nx, y: ny, dir };
    }

    function edgeOK(x, y, nx, ny, role) {
      const row = state.grid[ny];
      if (!row || nx < 0 || nx >= w || row[nx] === '#') return false;
      const to = row[nx], from = state.grid[y][x];
      if (role === 'runner') return to !== 'G' && to !== '-';
      if (from === 'G' && to !== 'G' && to !== '-') return false;
      if (to === 'G' && from !== 'G' && from !== '-') return false;
      return true;
    }

    function movesAt(x, y, role, includeStay) {
      const out = [];
      for (const dir of DIRS) {
        const p = step(x, y, dir);
        if (edgeOK(x, y, p.x, p.y, role)) out.push(p);
      }
      if (includeStay) out.push({ x, y, dir: 'stay' });
      return out;
    }

    let legal = movesAt(you.x, you.y, you.role, true);
    if (you.role === 'ghost' && you.inPen && you.releaseIn > 1) {
      legal = legal.filter(p => state.grid[p.y][p.x] === 'G');
      if (!legal.length) return 'stay';
    }

    // Build the two static movement graphs. This is bounded by 4*w*h (<=14884).
    const graph = role => {
      const g = Array.from({ length: n }, () => []);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = state.grid[y][x];
        if (c === '#' || (role === 'runner' && (c === 'G' || c === '-'))) continue;
        for (const p of movesAt(x, y, role, false)) g[idx(x, y)].push(idx(p.x, p.y));
      }
      return g;
    };
    const runnerGraph = graph('runner');
    const ghostGraph = graph('ghost');

    function bfs(sources, g) {
      const dist = new Uint16Array(n); dist.fill(INF);
      const q = new Int32Array(n); let head = 0, tail = 0;
      for (const s of sources) {
        const k = typeof s === 'number' ? s : idx(s.x, s.y);
        if (k >= 0 && k < n && dist[k] === INF) { dist[k] = 0; q[tail++] = k; }
      }
      while (head < tail) {
        const a = q[head++], nd = dist[a] + 1;
        for (const b of g[a]) if (dist[b] === INF) { dist[b] = nd; q[tail++] = b; }
      }
      return dist;
    }

    const activeRunners = state.runners.filter(r => r.alive && !r.respawnIn);

    if (you.role === 'ghost') {
      // Frightened ghosts only move on even destination ticks.
      if (you.frightened && ((state.tick + 1) & 1)) return 'stay';

      // Leave the pen as soon as possible; waiting ghosts approach the door without
      // illegally entering it before their release tick.
      if (you.inPen) {
        const doors = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
          if (state.grid[y][x] === '-') doors.push({ x, y });
        const doorDist = bfs(doors, ghostGraph);
        legal.sort((a, b) => doorDist[idx(a.x, a.y)] - doorDist[idx(b.x, b.y)]
          || (a.dir === 'stay') - (b.dir === 'stay'));
        return legal[0].dir;
      }

      if (!activeRunners.length) return legal[0].dir;
      const runnerDist = bfs(activeRunners, ghostGraph);

      if (you.frightened) {
        // Maximise separation, then mobility. Avoid head-on/equal-cell contacts.
        let best = null, bestScore = -Infinity;
        for (const p of legal) {
          const k = idx(p.x, p.y);
          let contact = 0;
          for (const r of activeRunners) {
            if ((p.x === r.x && p.y === r.y) ||
                (p.x === r.x && p.y === r.y && you.x === r.x && you.y === r.y)) contact = 1;
            if (p.x === r.x && p.y === r.y) contact = 1;
          }
          const d = runnerDist[k] === INF ? 100 : runnerDist[k];
          const score = d * 25 + ghostGraph[k].length * 3 - contact * 10000
            + (p.dir === you.dir ? 0.25 : 0) - (p.dir === 'stay' ? 2 : 0);
          if (score > bestScore) { bestScore = score; best = p; }
        }
        return best ? best.dir : 'stay';
      }

      // Assign ghosts deterministically across runners; nearby ghosts still switch
      // to a catch that is materially closer.
      const ghostOrder = state.ghosts.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const rank = Math.max(0, ghostOrder.findIndex(g => g.id === you.id));
      const fromYou = bfs([you], ghostGraph);
      const targets = activeRunners.slice().sort((a, b) => {
        const da = fromYou[idx(a.x, a.y)], db = fromYou[idx(b.x, b.y)];
        return da - db || a.lives - b.lives || (a.id < b.id ? -1 : 1);
      });
      let target = targets[rank % targets.length];
      if (fromYou[idx(targets[0].x, targets[0].y)] + 3 < fromYou[idx(target.x, target.y)]) target = targets[0];

      // Project the runner along its likely pellet route. Different ghost ranks
      // aim at different lead points, producing pincer pressure instead of a queue.
      let tx = target.x, ty = target.y;
      const pelletCells = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = state.grid[y][x];
        if (c === '.' || c === 'o') pelletCells.push(idx(x, y));
      }
      const runnerFood = bfs(pelletCells, runnerGraph);
      const lead = 3 + (rank % 3);
      let heading = target.dir;
      for (let z = 0; z < lead; z++) {
        const opts = movesAt(tx, ty, 'runner', false);
        if (!opts.length) break;
        opts.sort((a, b) => runnerFood[idx(a.x, a.y)] - runnerFood[idx(b.x, b.y)]
          || (b.dir === heading) - (a.dir === heading));
        const p = opts[0];
        tx = p.x; ty = p.y; heading = p.dir;
      }
      const direct = bfs([{ x: target.x, y: target.y }], ghostGraph);
      const intercept = bfs([{ x: tx, y: ty }], ghostGraph);
      const powers = state.powerPellets.length ? bfs(state.powerPellets, ghostGraph) : null;
      let best = null, bestScore = Infinity;
      for (const p of legal) {
        const k = idx(p.x, p.y);
        const chaseWeight = rank % 3 === 0 ? 0.58 : rank % 3 === 1 ? 0.28 : 0.42;
        let s = (direct[k] * chaseWeight + intercept[k] * (1 - chaseWeight)) * 20;
        // Do not feed a runner by stepping onto a power pellet it can collect now.
        const isPower = state.grid[p.y][p.x] === 'o';
        if (isPower && Math.abs(target.x - p.x) + Math.abs(target.y - p.y) <= 1) s += 500;
        // Secondary ghosts shade toward powers/escape routes while keeping pressure.
        if (powers && rank % 2) s += Math.min(powers[k], 20) * 0.35;
        if (p.dir === you.dir) s -= 0.3;
        if (p.dir === 'stay') s += 4;
        // Immediate certain catch dominates all positioning.
        if (p.x === target.x && p.y === target.y && !isPower) s -= 10000;
        if (s < bestScore) { bestScore = s; best = p; }
      }
      return best ? best.dir : 'stay';
    }

    // RUNNER ---------------------------------------------------------------
    // Round-local trail memory breaks deterministic two-cell orbit traps while
    // still allowing a retreat when every fresh move is immediately unsafe.
    if (!this._trail) this._trail = [];
    const here = idx(you.x, you.y);
    if (this._trail[this._trail.length - 1] !== here) this._trail.push(here);
    if (this._trail.length > 24) this._trail.shift();
    const dangerous = state.ghosts.filter(g => !g.inPen && !g.frightened);
    const edible = state.ghosts.filter(g => !g.inPen && g.frightened);
    const dangerDist = bfs(dangerous, ghostGraph);
    const edibleDist = bfs(edible, ghostGraph);
    const pellets = [], powers = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = state.grid[y][x];
      if (c === '.' || c === 'o') pellets.push(idx(x, y));
      if (c === 'o') powers.push(idx(x, y));
    }
    const pelletDist = bfs(pellets, runnerGraph);

    // Exact one-tick collision envelope, including head-on swaps and ghost stays.
    function immediateRisk(p) {
      if (you.invulnerable || state.grid[p.y][p.x] === 'o') return 0;
      let risk = 0;
      for (const g of dangerous) {
        const gm = movesAt(g.x, g.y, 'ghost', true);
        let can = false;
        for (const q of gm) {
          if ((q.x === p.x && q.y === p.y) ||
              (p.x === g.x && p.y === g.y && q.x === you.x && q.y === you.y)) { can = true; break; }
        }
        if (can) risk++;
      }
      return risk;
    }

    // Beam-search short routes. Ghost arrival distances provide an adversarial
    // safety margin; power collection flips that risk for the remaining horizon.
    let beam = [{ k: idx(you.x, you.y), first: 'stay', score: 0, path: [idx(you.x, you.y)], powered: false }];
    const depth = n > 1600 ? 6 : 8;
    for (let t = 1; t <= depth; t++) {
      const next = [];
      for (const node of beam) {
        const pos = xy(node.k);
        const opts = movesAt(pos.x, pos.y, 'runner', true);
        for (const p of opts) {
          const k = idx(p.x, p.y), cell = state.grid[p.y][p.x];
          const first = t === 1 ? p.dir : node.first;
          const powerNow = cell === 'o' && !node.path.includes(k);
          const powered = node.powered || powerNow;
          let s = node.score;
          const fresh = !node.path.includes(k);
          if (fresh && cell === '.') s += 34 / (1 + t * 0.08);
          if (fresh && cell === 'o') {
            const urgent = dangerous.length && dangerDist[node.k] < 8;
            s += urgent ? 85 : (state.frightTicksLeft > 10 ? 10 : 42);
          }
          let margin = dangerDist[k] === INF ? 50 : dangerDist[k] - t;
          if (!you.invulnerable && !powered && dangerous.length) {
            if (margin <= 0) s -= t <= 2 ? 6000 : 75;
            else if (margin === 1) s -= t <= 3 ? 180 : 32;
            else if (margin === 2) s -= 35;
            else s += Math.min(margin, 8) * 1.2;
          }
          if (state.frightTicksLeft > t && edible.length) {
            const de = edibleDist[k];
            if (de !== INF && de <= state.frightTicksLeft - t) s += state.nextGhostPoints / (35 * (de + 1));
          }
          s += runnerGraph[k].length * 0.45;
          if (p.dir === 'stay') s -= 5;
          if (node.path.length > 1 && k === node.path[node.path.length - 2]) s -= 2.5;
          const path = node.path.length < 10 ? node.path.concat(k) : node.path;
          next.push({ k, first, score: s, path, powered });
        }
      }
      next.sort((a, b) => b.score - a.score);
      // Keep diverse endpoints so one attractive but doomed corridor cannot fill the beam.
      const used = new Set(), cut = [];
      for (const node of next) {
        const tag = node.k + ':' + node.first + ':' + node.powered;
        if (used.has(tag)) continue;
        used.add(tag); cut.push(node);
        if (cut.length >= 90) break;
      }
      beam = cut;
    }

    const byFirst = new Map();
    for (const node of beam) {
      let final = node.score;
      const pd = pelletDist[node.k];
      if (pd !== INF) final -= pd * (state.pellets < 20 ? 8 : 4.2);
      const old = byFirst.get(node.first);
      if (old === undefined || final > old) byFirst.set(node.first, final);
    }

    let best = null, bestScore = -Infinity;
    for (const p of legal) {
      const k = idx(p.x, p.y);
      let s = byFirst.has(p.dir) ? byFirst.get(p.dir) : -100000;
      const risk = immediateRisk(p);
      if (risk) s -= 100000 * risk;
      // Strong immediate incentives and deterministic tie breaks.
      if (state.grid[p.y][p.x] === '.') s += 18;
      if (p.dir === you.dir) s += 0.4;
      if (p.dir === 'stay') s -= 3;
      const oldVisit = this._trail.lastIndexOf(k);
      if (oldVisit >= 0) s -= 10 + (oldVisit + 1) * 1.4;
      // Spread runners naturally instead of shadowing an ally's route.
      for (const r of activeRunners) if (r.id !== you.id && r.x === p.x && r.y === p.y) s -= 8;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return best ? best.dir : 'stay';
  }
};
