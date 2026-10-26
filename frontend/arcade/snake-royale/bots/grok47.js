const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 }
];

function key(p) { return p.x + ',' + p.y; }

function floodFill(sx, sy, width, height, solid, hazards) {
  const visited = new Set();
  const q = [[sx, sy]];
  visited.add(key({x: sx, y: sy}));
  let count = 0;
  while (q.length) {
    const [x, y] = q.shift();
    count++;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      const k = key({x: nx, y: ny});
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (hazards.has(k) || solid.has(k) || visited.has(k)) continue;
      visited.add(k);
      q.push([nx, ny]);
    }
  }
  return count;
}

function nearestFoodDist(sx, sy, width, height, solid, hazards, foods) {
  if (foods.size === 0) return 999;
  const visited = new Set();
  const q = [[sx, sy, 0]];
  visited.add(key({x: sx, y: sy}));
  while (q.length) {
    const [x, y, dist] = q.shift();
    if (foods.has(key({x, y}))) return dist;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      const k = key({x: nx, y: ny});
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (hazards.has(k) || solid.has(k) || visited.has(k)) continue;
      visited.add(k);
      q.push([nx, ny, dist + 1]);
    }
  }
  return 999;
}

function move(state) {
  try {
    const you = state.you;
    const head = you.head;
    const myLen = you.length;
    const myHealth = you.health;
    const w = state.width, h = state.height;

    const solid = new Set();
    const tails = new Set();
    for (const snake of state.snakes) {
      const body = snake.body;
      for (let i = 0; i < body.length; i++) {
        const k = key(body[i]);
        if (i === body.length - 1 && body.length > 1) tails.add(k);
        else solid.add(k);
      }
    }

    const hazards = new Set(state.hazards.map(key));
    const foods = new Set(state.food.map(key));

    const threats = new Set();
    const attackables = new Set();
    for (const snake of state.snakes) {
      if (snake.id === you.id) continue;
      const sh = snake.head;
      for (const d of DIRS) {
        const nx = sh.x + d.dx, ny = sh.y + d.dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const k = key({x: nx, y: ny});
        if (hazards.has(k)) continue;
        if (solid.has(k) && !tails.has(k)) continue;
        if (snake.length >= myLen) threats.add(k);
        if (snake.length < myLen) attackables.add(k);
      }
    }

    const cx = w / 2, cy = h / 2;
    const stormUrgency = Math.max(0, state.turn - (state.nextShrinkTurn - 10));
    const hunger = Math.max(0, 35 - myHealth);

    let bestScore = -Infinity;
    let bestDir = 'up';

    for (const d of DIRS) {
      const nx = head.x + d.dx, ny = head.y + d.dy;
      const k = key({x: nx, y: ny});
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (hazards.has(k)) continue;
      if (solid.has(k) && !tails.has(k)) continue;

      const space = floodFill(nx, ny, w, h, solid, hazards);
      const spacePenalty = space < myLen ? 50000 : 0;

      let score = space * 12 - spacePenalty;

      if (threats.has(k)) score -= 8000;
      if (attackables.has(k)) score += 1200;

      if (tails.has(k)) score -= 80;

      const distCenter = Math.abs(nx - cx) + Math.abs(ny - cy);
      score -= distCenter * (2 + stormUrgency * 0.4);

      if (hunger > 0 || myHealth < 60) {
        const fDist = nearestFoodDist(nx, ny, w, h, solid, hazards, foods);
        score += foods.has(k) ? (400 + hunger * 20) : Math.max(0, 180 - fDist * 25);
      } else if (foods.has(k)) {
        score += 150;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDir = d.name;
      }
    }

    if (bestScore === -Infinity) {
      for (const d of DIRS) {
        const nx = head.x + d.dx, ny = head.y + d.dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !hazards.has(key({x: nx, y: ny}))) {
          return d.name;
        }
      }
    }
    return bestDir;
  } catch (e) {
    return 'up';
  }
}

module.exports = { name: 'NexusViper', move };
