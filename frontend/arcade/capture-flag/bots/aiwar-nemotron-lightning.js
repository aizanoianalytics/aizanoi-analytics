'use strict';

module.exports = function move(state) {
  const you = state.you;
  if (you.jailed || you.respawnIn > 0) return 'stay';

  const enemy = state.team === 'west' ? 'east' : 'west';
  const border = state.border;
  const width = state.width;
  const height = state.height;
  const grid = state.grid;

  const ownHalf = x => state.team === 'west' ? x < border : x > border;
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const me = { x: you.x, y: you.y };

  const dirs = ['up', 'down', 'left', 'right'];

  // ---- 1. CARRYING FLAG ----
  if (you.carrying) {
    if (ownHalf(you.x)) {
      for (const a of dirs) {
        const dx = { up: 0, down: 0, left: -1, right: 1 }[a];
        const dy = { up: -1, down: 1, left: 0, right: 0 }[a];
        const nx = you.x + dx;
        const ny = you.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] !== '#' && ownHalf(nx)) return a;
      }
      return 'stay';
    }
    const enemyDefenders = state.enemies.filter(a => !a.jailed && !a.respawnIn && ownHalf(a.x));
    const risk = (x, y) => {
      let c = 0;
      for (const a of enemyDefenders) if (Math.abs(x - a.x) + Math.abs(y - a.y) <= 2) c += 10;
      return c;
    };
    return bfsTowardGoal(width, height, grid, me, (x, y) => ownHalf(x), risk);
  }

  // ---- 2. RESCUE TEAMMATE ----
  const jailedTeammates = state.teammates.filter(t => t.jailed);
  if (jailedTeammates.length > 0 && !you.carrying) {
    const enemyJail = state.zones[enemy].jail;
    let closestJail = null;
    let minD = Infinity;
    for (const c of enemyJail) {
      const d = Math.abs(me.x - c.x) + Math.abs(me.y - c.y);
      if (d < minD) { minD = d; closestJail = c; }
    }
    if (closestJail) {
      return bfsTowardGoal(width, height, grid, me, () => manhattan(me, closestJail) <= 1, () => 0);
    }
  }

  // ---- 3. PICK UP FLAG ----
  const enemyFlag = state.flags[enemy];
  if (!enemyFlag.carrier && !you.carrying && manhattan(me, { x: enemyFlag.x, y: enemyFlag.y }) <= 1) {
    return 'stay';
  }

  // ---- 4. DEFEND AGAINST INTRUDERS ----
  const livingEnemies = state.enemies.filter(a => !a.jailed && !a.respawnIn);
  const intruders = livingEnemies.filter(a => ownHalf(a.x));
  if (intruders.length > 0 && !you.carrying) {
    const closest = intruders.reduce((a, b) => manhattan(me, { x: a.x, y: a.y }) < manhattan(me, { x: b.x, y: b.y }) ? a : b);
    return bfsTowardGoal(width, height, grid, me, () => manhattan(me, { x: closest.x, y: closest.y }) <= 1,
      () => manhattan(me, { x: closest.x, y: closest.y }) <= 2 ? 5 : 0);
  }

  // ---- 5. GENERAL OFFENSE: move toward enemy flag ----
  return bfsTowardGoal(width, height, grid, me, () => manhattan(me, { x: state.flags[enemy].x, y: state.flags[enemy].y }) <= 2, () => 0);
};

function bfsTowardGoal(width, height, grid, start, goalCheck, riskFn) {
  const costs = new Float64Array(width * height).fill(Infinity);
  const queue = [];
  const key = (x, y) => y * width + x;

  costs[key(start.x, start.y)] = 0;
  queue.push(start);

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (goalCheck(p.x, p.y)) return getAction(start, p);

    for (const [dx, dy] of dirs) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || grid[ny][nx] === '#') continue;
      const newCost = costs[key(p.x, p.y)] + 1 + riskFn(nx, ny);
      if (newCost >= costs[key(nx, ny)]) continue;
      costs[key(nx, ny)] = newCost;
      queue.push({ x: nx, y: ny });
    }
  }
  return 'stay';
}

function getAction(start, target) {
  // Find first step from start toward target
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return 'stay';
}