const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const lastMove = {};

function man(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function move(state) {
  const W = state.width, H = state.height;
  const you = state.you;
  const snakes = state.snakes;
  const food = state.food || [];
  const hazards = state.hazards || [];
  const turn = state.turn;
  const nextShrink = state.nextShrinkTurn;

  const blocked = new Uint8Array(W * H);
  for (const p of hazards) blocked[p.y * W + p.x] = 1;
  for (const s of snakes) {
    const b = s.body;
    for (let i = 1; i < b.length - 1; i++) blocked[b[i].y * W + b[i].x] = 1;
  }

  let hazardRing = 0;
  if (hazards.length) {
    let mx = -1;
    for (const p of hazards) mx = Math.max(mx, Math.min(p.x, p.y, W - 1 - p.x, H - 1 - p.y));
    hazardRing = mx + 1;
  }


  const predicted = [];
  const predictedShorter = new Set();
  for (const o of snakes) {
    if (o.id === you.id) continue;
    let best = null, bestVal = Infinity;
    for (const name of DIR_NAMES) {
      const nx = o.head.x + DIRS[name][0], ny = o.head.y + DIRS[name][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (blocked[ny * W + nx]) continue;
      let nf = Infinity;
      for (const f of food) {
        const d = Math.abs(f.x - nx) + Math.abs(f.y - ny);
        if (d < nf) nf = d;
      }
      const val = (nf === Infinity ? 1000 : nf) + (Math.abs(nx - (W - 1) / 2) + Math.abs(ny - (H - 1) / 2)) * 0.05;
      if (val < bestVal) { bestVal = val; best = { x: nx, y: ny, snake: o }; }
    }
    if (best) {
      predicted.push(best);
      if (o.body.length < you.body.length) predictedShorter.add(best.x + "," + best.y);
    }
  }

  const cands = [];
  for (const name of DIR_NAMES) {
    const dx = DIRS[name][0], dy = DIRS[name][1];
    const nx = you.head.x + dx, ny = you.head.y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (blocked[ny * W + nx]) continue;
    cands.push({ name, x: nx, y: ny });
  }
  if (!cands.length) {
    const fb = lastMove[you.id] || 'up';
    return fb;
  }

  const futureBlocked = new Uint8Array(W * H);
  for (const p of hazards) futureBlocked[p.y * W + p.x] = 1;
  for (const s of snakes) {
    const b = s.body;
    for (let i = 0; i < b.length - 1; i++) futureBlocked[b[i].y * W + b[i].x] = 1;
  }

  function flood(sx, sy, grid) {
    const start = sy * W + sx;
    if (grid[start]) return 0;
    const seen = new Uint8Array(W * H);
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    while (stack.length) {
      const cur = stack.pop();
      n++;
      const x = cur % W, y = (cur / W) | 0;
      if (x > 0) { const ni = cur - 1; if (!grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } }
      if (x < W - 1) { const ni = cur + 1; if (!grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } }
      if (y > 0) { const ni = cur - W; if (!grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } }
      if (y < H - 1) { const ni = cur + W; if (!grid[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } }
    }
    return n;
  }

  let best = cands[0], bestScore = -Infinity;
  for (const c of cands) {
    const onFood = food.some(f => f.x === c.x && f.y === c.y);
    const newLen = you.body.length + (onFood ? 1 : 0);
    const newHealth = onFood ? 100 : (you.health - 1);

    let score = 0;


    let fatal = false;
    let killPotential = 0;
    for (const o of snakes) {
      if (o.id === you.id) continue;
      const d = Math.abs(o.head.x - c.x) + Math.abs(o.head.y - c.y);
      if (d !== 1) continue;
      const oppLen = o.body.length + (onFood ? 1 : 0);
      if (oppLen >= newLen) fatal = true;
      else killPotential++;
    }
    if (fatal) score -= 8000;
    const g = new Uint8Array(futureBlocked);
    g[c.y * W + c.x] = 0;
    for (const p of predicted) {
      if (p.x === c.x && p.y === c.y) continue;
      g[p.y * W + p.x] = 1;
    }
    const area = flood(c.x, c.y, g);
    score += area * 3;
    if (area < newLen * 1.5) score -= 6000;


    let oppSpace = 0;
    for (const o of snakes) {
      if (o.id === you.id) continue;
      if (o.head.x === c.x && o.head.y === c.y) continue;
      const hi = o.head.y * W + o.head.x;
      const prev = g[hi];
      g[hi] = 0;
      oppSpace += flood(o.head.x, o.head.y, g);
      g[hi] = prev;
    }
    score -= oppSpace * 0.4;
    if (onFood) score += (area < newLen * 2.5 && you.health >= 25) ? 300 : 1000;
    if (newHealth <= 0) score -= 100000;

    const foodW = you.health < 30 ? 6 : (you.health < 60 ? 3 : 1.5);
    const spaceFactor = (area < newLen * 3 && you.health >= 30) ? 0.35 : 1;
    let bestFoodScore = 0;
    for (const f of food) {
      const d = Math.abs(f.x - c.x) + Math.abs(f.y - c.y);
      let oppD = Infinity;
      for (const o of snakes) {
        if (o.id === you.id) continue;
        const od = Math.abs(o.head.x - f.x) + Math.abs(o.head.y - f.y);
        if (od < oppD) oppD = od;
      }
      let val = (40 - Math.min(40, d)) * foodW * 4 * spaceFactor;
      if (d > oppD) val *= 0.2;
      else if (d === oppD) val *= 0.5;
      if (val > bestFoodScore) bestFoodScore = val;
    }
    score += bestFoodScore;


    const ed = Math.min(c.x, c.y, W - 1 - c.x, H - 1 - c.y);
    if (ed <= hazardRing) score -= 100000;
    const turnsToShrink = nextShrink - turn;
    if (turnsToShrink <= 12 && ed <= hazardRing + 0) score -= 5000;
    const centerW = (turn > 120 || nextShrink - turn < 25) ? 1.1 : 0.35;
    score -= (Math.abs(c.x - (W - 1) / 2) + Math.abs(c.y - (H - 1) / 2)) * centerW;


    for (const o of snakes) {
      if (o.id === you.id) continue;
      const d = Math.abs(o.head.x - c.x) + Math.abs(o.head.y - c.y);
      if (d <= 1) {
        if (o.body.length >= newLen) score -= 50;
        else score += 25;
      }
    }
    score += killPotential * 80;
    if (predictedShorter.has(c.x + "," + c.y)) score += 220;

    let tailRisk = false;
    for (const o of snakes) {
      const t = o.body[o.body.length - 1];
      if (t.x === c.x && t.y === c.y) {
        const couldEat = food.some(f => Math.abs(f.x - o.head.x) + Math.abs(f.y - o.head.y) === 1);
        if (couldEat) tailRisk = true;
      }
    }
    if (tailRisk) score -= 4000;

    score += newLen;

    if (score > bestScore || (score === bestScore && DIR_NAMES.indexOf(c.name) < DIR_NAMES.indexOf(best.name))) {
      bestScore = score;
      best = c;
    }
  }

  if (!isFinite(bestScore)) {
    best = cands[0];
  }
  lastMove[you.id] = best.name;
  return best.name;
}

module.exports = { name: 'Viper', move };
