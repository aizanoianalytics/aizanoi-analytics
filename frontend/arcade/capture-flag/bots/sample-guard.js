'use strict';

module.exports = function move(state) {
  const you = state.you;
  if (you.jailed || you.respawnIn > 0) return 'stay';
  const enemy = state.team === 'west' ? 'east' : 'west';
  const order = [you, ...state.teammates].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const ownHalf = x => state.team === 'west' ? x < state.border : x > state.border;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const defending = order.length > 1 && order[0].id === you.id && !you.carrying;
  let target = state.flags[enemy];
  if (defending) {
    const intruders = state.enemies.filter(a => !a.jailed && !a.respawnIn && ownHalf(a.x));
    intruders.sort((a, b) => distance(you, a) - distance(you, b) || (String(a.id) < String(b.id) ? -1 : 1));
    const home = state.flags[state.team].home;
    const patrol = state.zones[state.team].home.filter(p => distance(p, home) === 1);
    target = intruders[0] || patrol[Math.floor(state.tick / 10) % patrol.length];
  }
  const goal = p => you.carrying ? ownHalf(p.x) : p.x === target.x && p.y === target.y;
  const queue = [{ x: you.x, y: you.y, action: 'stay' }];
  const seen = new Set([you.y * state.width + you.x]);
  const directions = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (goal(p)) return p.action;
    for (const [action, dx, dy] of directions) {
      const x = p.x + dx;
      const y = p.y + dy;
      const key = y * state.width + x;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height || seen.has(key) ||
          state.grid[y][x] === '#' || (defending && !ownHalf(x))) continue;
      seen.add(key);
      queue.push({ x, y, action: i === 0 ? action : p.action });
    }
  }
  return 'stay';
};
