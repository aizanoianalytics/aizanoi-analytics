'use strict';

function push(heap, item) {
  let i = heap.length;
  heap.push(item);
  while (i > 0) {
    const parent = (i - 1) >>> 1;
    if (heap[parent].cost <= item.cost) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = item;
}

function pop(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (!heap.length) return first;
  let i = 0;
  while (i * 2 + 1 < heap.length) {
    let child = i * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
    if (last.cost <= heap[child].cost) break;
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = last;
  return first;
}

module.exports = function move(state) {
  const you = state.you;
  if (you.jailed || you.respawnIn > 0) return 'stay';
  const enemy = state.team === 'west' ? 'east' : 'west';
  const order = [you, ...state.teammates].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const ownHalf = x => state.team === 'west' ? x < state.border : x > state.border;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const defending = order.length > 1 && order[0].id === you.id && !you.carrying;
  const livingEnemies = state.enemies.filter(a => !a.jailed && !a.respawnIn);
  const defenders = livingEnemies.filter(a => !ownHalf(a.x) && a.x !== state.border);
  let target = state.flags[enemy];
  let rescue = false;
  if (defending) {
    const intruders = livingEnemies.filter(a => ownHalf(a.x));
    intruders.sort((a, b) => Number(b.carrying) - Number(a.carrying) || distance(you, a) - distance(you, b) ||
      (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    target = intruders[0] || state.flags[state.team].home;
  } else if (!you.carrying && state.teammates.some(a => a.jailed)) {
    const raiders = order.filter(a => a.id !== order[0].id && !a.jailed && !a.respawnIn && !a.carrying);
    const jail = state.zones[enemy].jail;
    raiders.sort((a, b) => Math.min(...jail.map(p => distance(a, p))) - Math.min(...jail.map(p => distance(b, p))) ||
      (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    rescue = raiders.length > 0 && raiders[0].id === you.id;
  }
  const goal = p => {
    if (you.carrying) return ownHalf(p.x);
    if (rescue) return state.zones[enemy].jail.some(j => distance(p, j) <= 1);
    return p.x === target.x && p.y === target.y;
  };
  const risk = p => {
    if (ownHalf(p.x) || p.x === state.border) return 0;
    let cost = 0;
    for (const a of defenders) {
      const d = distance(p, a);
      cost += d <= 2 ? 80 : d === 3 ? 20 : d === 4 ? 5 : 0;
    }
    return cost;
  };
  const directions = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  const costs = new Float64Array(state.width * state.height).fill(Infinity);
  const key = p => p.y * state.width + p.x;
  const heap = [];
  costs[key(you)] = 0;
  push(heap, { x: you.x, y: you.y, action: 'stay', cost: 0 });
  while (heap.length) {
    const p = pop(heap);
    if (p.cost !== costs[key(p)]) continue;
    if (goal(p)) return p.action;
    for (const [action, dx, dy] of directions) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height || state.grid[y][x] === '#' ||
          (defending && !ownHalf(x))) continue;
      const next = { x, y };
      const cost = p.cost + 1 + risk(next);
      if (cost >= costs[key(next)]) continue;
      costs[key(next)] = cost;
      push(heap, { x, y, cost, action: p.action === 'stay' ? action : p.action });
    }
  }
  return 'stay';
};
