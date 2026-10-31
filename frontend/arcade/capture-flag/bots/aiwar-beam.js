'use strict';

module.exports = function move(state) {
  try {
    const you = state.you;
    if (!you || you.jailed || you.respawnIn > 0) return 'stay';

    const team = state.team;
    const enemyTeam = team === 'west' ? 'east' : 'west';
    const border = state.border;
    const W = state.width;
    const H = state.height;
    const grid = state.grid;

    const ownHalf = x => team === 'west' ? x < border : x > border;
    const passable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== '#';
    const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const byId = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;

    const allAllies = [you].concat(state.teammates || []).slice().sort(byId);
    const activeAllies = allAllies.filter(a => !a.jailed && a.respawnIn === 0);
    const activeEnemies = (state.enemies || []).filter(a => !a.jailed && a.respawnIn === 0).slice().sort(byId);

    const ourPrisoners = allAllies.filter(a => a.jailed);
    const enemyCarrier = activeEnemies.find(a => a.carrying) || (state.enemies || []).find(a => a.carrying);
    const enemyCarrierInOurHalf = !!enemyCarrier && ownHalf(enemyCarrier.x);

    const enemyDefs = activeEnemies.filter(a => !ownHalf(a.x) && a.x !== border);

    const jailDist = (a, jail) => Math.min.apply(null, jail.map(p => Math.abs(a.x - p.x) + Math.abs(a.y - p.y)));

    // base defenders if no rescue
    const defenderSlots = allAllies.length >= 4 ? 2 : (allAllies.length >= 2 ? 1 : 0);
    const baseDefenderIds = activeAllies.filter(a => !a.carrying).sort(byId).slice(0, defenderSlots).map(a => a.id);

    let rescueId = null;
    if (ourPrisoners.length > 0 && !enemyCarrierInOurHalf) {
      const cands = activeAllies.filter(a => !a.carrying);
      if (cands.length) {
        cands.sort((a, b) => {
          const prefA = baseDefenderIds.indexOf(a.id) >= 0 ? 1 : 0;
          const prefB = baseDefenderIds.indexOf(b.id) >= 0 ? 1 : 0;
          if (prefA !== prefB) return prefA - prefB;
          const jail = state.zones[enemyTeam].jail;
          return jailDist(a, jail) - jailDist(b, jail) || byId(a, b);
        });
        rescueId = cands[0].id;
      }
    }

    const defenderIds = new Set();
    if (!enemyCarrierInOurHalf) {
      const cands = activeAllies.filter(a => !a.carrying && a.id !== rescueId).sort(byId);
      for (let i = 0; i < defenderSlots && i < cands.length; i++) defenderIds.add(cands[i].id);
    }

    let mode;
    if (you.carrying) mode = 'carrier';
    else if (enemyCarrierInOurHalf) mode = 'chase';
    else if (rescueId !== null && you.id === rescueId) mode = 'rescue';
    else if (defenderIds.has(you.id)) mode = 'defend';
    else mode = 'raid';

    const riskEnemyHalf = (x, y) => {
      if (ownHalf(x) || x === border) return 0;
      let cost = 0;
      for (const d of enemyDefs) {
        const dd = Math.abs(x - d.x) + Math.abs(y - d.y);
        if (dd <= 1) cost += 2000;
        else if (dd === 2) cost += 200;
        else if (dd === 3) cost += 50;
        else if (dd === 4) cost += 10;
      }
      return cost;
    };

    let goalFn, canEnter, riskFn;
    if (mode === 'carrier') {
      goalFn = (x, y) => ownHalf(x);
      canEnter = (x, y) => passable(x, y);
      riskFn = (x, y) => riskEnemyHalf(x, y);
    } else if (mode === 'chase') {
      const c = enemyCarrier;
      goalFn = (x, y) => x === c.x && y === c.y;
      canEnter = (x, y) => passable(x, y) && (ownHalf(x) || x === border);
      riskFn = () => 0;
    } else if (mode === 'rescue') {
      const jail = state.zones[enemyTeam].jail;
      goalFn = (x, y) => jail.some(j => Math.abs(x - j.x) + Math.abs(y - j.y) <= 1);
      canEnter = (x, y) => passable(x, y);
      riskFn = (x, y) => riskEnemyHalf(x, y);
    } else if (mode === 'defend') {
      const intruders = activeEnemies.filter(a => ownHalf(a.x));
      intruders.sort((a, b) => Number(b.carrying) - Number(a.carrying) || dist(a, state.flags[team].home) - dist(b, state.flags[team].home) || byId(a, b));
      const defenderList = activeAllies.filter(a => defenderIds.has(a.id)).sort(byId);
      const idx = defenderList.findIndex(a => a.id === you.id);
      const tgt = intruders[idx >= 0 ? idx : 0] || intruders[0];
      if (tgt) {
        goalFn = (x, y) => x === tgt.x && y === tgt.y;
      } else {
        const h = state.flags[team].home;
        goalFn = (x, y) => x === h.x && y === h.y;
      }
      canEnter = (x, y) => passable(x, y) && (ownHalf(x) || x === border);
      riskFn = () => 0;
    } else {
      const ef = state.flags[enemyTeam];
      const ourHasCarrier = activeAllies.some(a => a.carrying);
      if (ef.carrier === null) {
        goalFn = (x, y) => x === ef.x && y === ef.y;
        canEnter = (x, y) => passable(x, y);
        riskFn = (x, y) => riskEnemyHalf(x, y);
      } else if (ourHasCarrier) {
        const h = state.flags[team].home;
        goalFn = (x, y) => x === h.x && y === h.y;
        canEnter = (x, y) => passable(x, y) && (ownHalf(x) || x === border);
        riskFn = () => 0;
      } else {
        goalFn = (x, y) => x === ef.home.x && y === ef.home.y;
        canEnter = (x, y) => passable(x, y);
        riskFn = (x, y) => riskEnemyHalf(x, y);
      }
    }

    // Dijkstra
    const dirs = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
    const N = W * H;
    const INF = 1e15;
    const distArr = new Float64Array(N);
    for (let i = 0; i < N; i++) distArr[i] = INF;
    const startIdx = you.y * W + you.x;
    distArr[startIdx] = 0;
    const heap = [{ cost: 0, idx: startIdx, action: 'stay' }];
    function push(item) {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >>> 1;
        if (heap[p].cost <= item.cost) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = item;
    }
    function pop() {
      const first = heap[0];
      const last = heap.pop();
      if (!heap.length) return first;
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].cost < heap[c].cost) c++;
        if (last.cost <= heap[c].cost) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
      return first;
    }

    while (heap.length) {
      const cur = pop();
      if (cur.cost !== distArr[cur.idx]) continue;
      const cx = cur.idx % W;
      const cy = (cur.idx / W) | 0;
      if (goalFn(cx, cy)) return cur.action;
      for (const [action, dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!passable(nx, ny)) continue;
        if (!canEnter(nx, ny)) continue;
        const nidx = ny * W + nx;
        const ncost = cur.cost + 1 + riskFn(nx, ny);
        if (ncost >= distArr[nidx]) continue;
        distArr[nidx] = ncost;
        push({ cost: ncost, idx: nidx, action: cur.action === 'stay' ? action : cur.action });
      }
    }
    return 'stay';
  } catch (e) {
    return 'stay';
  }
};
