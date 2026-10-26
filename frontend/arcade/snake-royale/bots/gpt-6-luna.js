module.exports = {
  name: 'OpenRange',
  move
};

function move(state) {
  const dirs = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'right', dx: 1, dy: 0 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 }
  ];

  const { width, height, you } = state;
  const key = (x, y) => `${x},${y}`;
  const inside = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const hazards = new Set((state.hazards || []).map(p => key(p.x, p.y)));
  const foods = new Set((state.food || []).map(p => key(p.x, p.y)));
  const snakes = state.snakes || [];
  const opponents = snakes.filter(s => s.id !== you.id);

  function safeAt(x, y, offset) {
    if (!inside(x, y) || hazards.has(key(x, y))) return false;
    const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
    const rings = Math.floor(Math.min(width, height) / 2);
    if (edge < rings - 1 && Number.isFinite(state.nextShrinkTurn)) {
      const closingTurn = state.nextShrinkTurn + 20 * edge;
      const arrivalTurn = state.turn + offset;
      if (arrivalTurn > closingTurn) return false;
    }
    return true;
  }

  function occupiedForFirstStep(x, y, eating) {
    for (const s of snakes) {
      const body = s.body || [];
      for (let i = 0; i < body.length; i++) {
        const p = body[i];
        if (p.x !== x || p.y !== y) continue;
        if (s.id === you.id && i === body.length - 1 && !eating) continue;
        if (s.id !== you.id && i === body.length - 1 && !eating) continue;
        return true;
      }
    }
    return false;
  }

  const candidates = [];
  for (const d of dirs) {
    const x = you.head.x + d.dx;
    const y = you.head.y + d.dy;
    const k = key(x, y);
    const eating = foods.has(k);
    let legal = inside(x, y) && !hazards.has(k) && !occupiedForFirstStep(x, y, eating);

    if (legal) {
      for (const o of opponents) {
        const dist = Math.abs(o.head.x - x) + Math.abs(o.head.y - y);
        if (dist === 1 && you.length <= o.length) {
          legal = false;
          break;
        }
      }
    }

    candidates.push({ ...d, x, y, eating, legal });
  }

  function evaluate(c) {
    const ownBody = (you.body || []).map(p => ({ x: p.x, y: p.y }));
    const body = c.eating ? ownBody : ownBody.slice(0, -1);
    body.unshift({ x: c.x, y: c.y });

    const blocked = new Set();
    for (const p of body.slice(1)) blocked.add(key(p.x, p.y));
    for (const o of opponents) {
      const ob = o.body || [];
      for (let i = 0; i < ob.length; i++) {
        if (i === ob.length - 1) continue;
        blocked.add(key(ob[i].x, ob[i].y));
      }
    }

    const start = key(c.x, c.y);
    const seen = new Set([start]);
    const queue = [{ x: c.x, y: c.y, dist: 0 }];
    let area = 0;
    let exits = 0;
    let nearestFood = Infinity;

    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi];
      area++;
      if (foods.has(key(p.x, p.y))) nearestFood = Math.min(nearestFood, p.dist);
      for (const d of dirs) {
        const nx = p.x + d.dx;
        const ny = p.y + d.dy;
        const nk = key(nx, ny);
        if (!safeAt(nx, ny, p.dist + 1) || blocked.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        queue.push({ x: nx, y: ny, dist: p.dist + 1 });
        if (p.dist === 0) exits++;
      }
    }

    const health = you.health - 1 + (c.eating ? 100 : 0);
    let score = area * 3 + exits * 2;
    score -= Math.max(0, you.length + 2 - area) * 18;
    if (nearestFood !== Infinity) {
      const urgency = Math.max(0, 75 - health) / 75;
      score += (c.eating ? 20 : 28 / (nearestFood + 1)) * (0.55 + urgency);
    } else if (health < 35) {
      score -= (35 - health) * 2;
    }
    if (c.eating) score += 3;
    return score;
  }

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (!c.legal) continue;
    const score = evaluate(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (best) return best.name;

  let fallback = candidates[0];
  let fallbackScore = -Infinity;
  for (const c of candidates) {
    let score = 0;
    if (inside(c.x, c.y)) score += 10;
    if (!hazards.has(key(c.x, c.y))) score += 5;
    if (!occupiedForFirstStep(c.x, c.y, c.eating)) score += 5;
    for (const o of opponents) {
      if (Math.abs(o.head.x - c.x) + Math.abs(o.head.y - c.y) === 1 && you.length <= o.length) score -= 10;
    }
    if (score > fallbackScore) {
      fallbackScore = score;
      fallback = c;
    }
  }
  return fallback.name;
}
