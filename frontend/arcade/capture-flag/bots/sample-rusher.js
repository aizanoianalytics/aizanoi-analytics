'use strict';

module.exports = function move(state) {
  const you = state.you;
  if (you.jailed || you.respawnIn > 0) return 'stay';
  const enemy = state.team === 'west' ? 'east' : 'west';
  const target = state.flags[enemy];
  const ownHalf = x => state.team === 'west' ? x < state.border : x > state.border;
  const goal = p => you.carrying ? ownHalf(p.x) : p.x === target.x && p.y === target.y;
  const directions = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  const queue = [{ x: you.x, y: you.y, action: 'stay' }];
  const visited = new Set([you.y * state.width + you.x]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (goal(p)) return p.action;
    for (const [action, dx, dy] of directions) {
      const x = p.x + dx;
      const y = p.y + dy;
      const key = y * state.width + x;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height || visited.has(key) || state.grid[y][x] === '#') continue;
      visited.add(key);
      queue.push({ x, y, action: i === 0 ? action : p.action });
    }
  }
  return 'stay';
};
