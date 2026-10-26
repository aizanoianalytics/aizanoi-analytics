'use strict';

const DIRS = ['up', 'down', 'left', 'right'];
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

function move(state) {
  const W = state.width, H = state.height, N = W * H;
  const me = state.you;
  const myLength = me.length || me.body.length;
  const encode = p => p.y * W + p.x;
  const head = encode(me.head);
  const originalBody = me.body.map(encode);
  const enemies = state.snakes.filter(s => s.id !== me.id);
  const food = new Uint8Array(N);
  const hazard = new Uint8Array(N);
  const foodCells = [];
  for (const p of state.food) {
    const c = encode(p);
    food[c] = 1;
    foodCells.push(c);
  }
  for (const p of state.hazards) hazard[encode(p)] = 1;

  const neighbors = new Int16Array(N * 4);
  neighbors.fill(-1);
  const ring = new Int16Array(N);
  let safeArea = 0;
  let activeRings = Math.floor(Math.min(W, H) / 2);
  for (let c = 0; c < N; c++) {
    const x = c % W, y = (c / W) | 0;
    ring[c] = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (!hazard[c]) {
      safeArea++;
      if (ring[c] < activeRings) activeRings = ring[c];
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H)
        neighbors[c * 4 + d] = ny * W + nx;
    }
  }

  const cap = Math.floor(Math.min(W, H) / 2) - 1;
  const deadline = new Int16Array(N);
  const nextShrink = Number.isFinite(state.nextShrinkTurn)
    ? state.nextShrinkTurn
    : 150;
  const firstClosure = Math.max(2, nextShrink - state.turn + 2);
  let horizonArea = 0;
  for (let c = 0; c < N; c++) {
    deadline[c] = hazard[c] ? 0 :
      ring[c] < cap
        ? firstClosure + 20 * Math.max(0, ring[c] - activeRings)
        : 30000;
    if (deadline[c] > 12) horizonArea++;
  }

  const permanent = new Int16Array(N);
  const allRelease = new Int16Array(N);
  const ownRelease = new Int16Array(N);
  const enemyRelease = new Int16Array(N);
  const enemyStatic = new Uint8Array(N);
  const enemyData = [];
  let largestEnemy = 0;

  for (const s of state.snakes) {
    const b = s.body.map(encode);
    for (let i = 0; i < b.length; i++) {
      const c = b[i], release = b.length - i;
      if (i < b.length - 1) permanent[c]++;
      if (release > allRelease[c]) allRelease[c] = release;
      if (s.id === me.id && release > ownRelease[c])
        ownRelease[c] = release;
    }
    if (s.id !== me.id) {
      const length = s.length || b.length;
      largestEnemy = Math.max(largestEnemy, length);
      enemyData.push({ snake: s, body: b, length, moves: [], canEat: false });
    }
  }

  for (const e of enemyData) {
    const eh = encode(e.snake.head);
    for (let d = 0; d < 4; d++) {
      const c = neighbors[eh * 4 + d];
      if (c < 0 || deadline[c] <= 1 || permanent[c]) continue;
      if (food[c] && c === e.body[e.body.length - 1]) continue;
      let exits = 0;
      for (let k = 0; k < 4; k++) {
        const z = neighbors[c * 4 + k];
        if (z >= 0 && deadline[z] > 2 && !permanent[z]) exits++;
      }
      let nearest = W + H;
      const x = c % W, y = (c / W) | 0;
      for (const f of foodCells) {
        if (hazard[f]) continue;
        nearest = Math.min(nearest, Math.abs(x - f % W) + Math.abs(y - ((f / W) | 0)));
      }
      let desirability = exits * 0.35 - nearest * 0.13;
      if (food[c]) {
        desirability += e.snake.health < 55 ? 2.6 : 1.6;
        e.canEat = true;
      }
      if (deadline[c] < 5) desirability -= 2;
      e.moves.push({ c, desirability, probability: 0 });
    }
    let total = 0;
    let best = -Infinity;
    for (const m of e.moves) best = Math.max(best, m.desirability);
    for (const m of e.moves) {
      m.probability = Math.exp(m.desirability - best);
      total += m.probability;
    }
    for (const m of e.moves) m.probability /= total || 1;
    for (let i = 0; i < e.body.length; i++) {
      const c = e.body[i];
      const release = e.body.length - i + (e.canEat ? 1 : 0);
      enemyRelease[c] = Math.max(enemyRelease[c], release);
      if (i < e.body.length - 1 || e.canEat) enemyStatic[c] = 1;
    }
  }

  const enemyArrival = new Int16Array(N);
  const strongArrival = new Int16Array(N);
  const arrivalLength = new Int16Array(N);
  enemyArrival.fill(30000);
  strongArrival.fill(30000);
  const queue = new Int16Array(N);
  for (const e of enemyData) {
    const dist = new Int16Array(N);
    dist.fill(-1);
    let front = 0, back = 0;
    const eh = encode(e.snake.head);
    dist[eh] = 0;
    queue[back++] = eh;
    while (front < back) {
      const c = queue[front++];
      const t = dist[c];
      if (t < enemyArrival[c]) {
        enemyArrival[c] = t;
        arrivalLength[c] = e.length;
      } else if (t === enemyArrival[c]) {
        arrivalLength[c] = Math.max(arrivalLength[c], e.length);
      }
      if (e.length >= myLength && t < strongArrival[c]) strongArrival[c] = t;
      for (let d = 0; d < 4; d++) {
        const z = neighbors[c * 4 + d];
        const nt = t + 1;
        if (z < 0 || dist[z] >= 0 || deadline[z] <= nt) continue;
        if (allRelease[z] > nt) continue;
        dist[z] = nt;
        queue[back++] = z;
      }
    }
  }

  const foodDistance = new Int16Array(N);
  foodDistance.fill(30000);
  {
    let front = 0, back = 0;
    for (const c of foodCells) {
      if (!hazard[c]) {
        foodDistance[c] = 0;
        queue[back++] = c;
      }
    }
    while (front < back) {
      const c = queue[front++];
      for (let d = 0; d < 4; d++) {
        const z = neighbors[c * 4 + d];
        if (z < 0 || hazard[z] || foodDistance[z] <= foodDistance[c] + 1) continue;
        foodDistance[z] = foodDistance[c] + 1;
        queue[back++] = z;
      }
    }
  }

  let foodValue = myLength <= largestEnemy ? 23 : 15;
  if (enemies.length > 2 && myLength <= largestEnemy + 1) foodValue += 3;
  if (me.health < 55) foodValue += (55 - me.health) * 0.32;
  if (myLength > horizonArea * 0.55) foodValue *= 0.48;
  if (myLength > horizonArea * 0.8) foodValue *= 0.4;

  const centerX = (W - 1) / 2, centerY = (H - 1) / 2;
  function centerCost(c) {
    return Math.abs(c % W - centerX) + Math.abs(((c / W) | 0) - centerY);
  }

  function analyze(c, eating, body) {
    const dist = new Int16Array(N);
    dist.fill(-1);
    let front = 0, back = 0;
    queue[back++] = c;
    dist[c] = 1;
    let area = 0, territory = 0, nearFood = 30000, goodFood = 30000;
    while (front < back) {
      const p = queue[front++], t = dist[p];
      if (deadline[p] > Math.max(8, t)) area++;
      if (t < enemyArrival[p] ||
          (t === enemyArrival[p] && myLength + eating > arrivalLength[p])) {
        territory += 1;
      } else if (t <= enemyArrival[p] + 2) {
        territory += 0.25;
      }
      if (food[p] && !(eating && p === c)) {
        nearFood = Math.min(nearFood, t - 1);
        let contested = 0;
        if (enemyArrival[p] < t) contested = 7;
        else if (enemyArrival[p] === t && arrivalLength[p] >= myLength + eating)
          contested = 10;
        goodFood = Math.min(goodFood, t - 1 + contested);
      }
      for (let d = 0; d < 4; d++) {
        const z = neighbors[p * 4 + d], nt = t + 1;
        if (z < 0 || dist[z] >= 0 || deadline[z] <= nt) continue;
        if (enemyRelease[z] > nt || ownRelease[z] + eating > nt) continue;
        dist[z] = nt;
        queue[back++] = z;
      }
    }

    const blocked = new Uint8Array(enemyStatic);
    for (let i = 0; i < body.length - 1; i++) blocked[body[i]] = 1;
    const seen = new Uint8Array(N);
    front = 0; back = 0;
    queue[back++] = c; seen[c] = 1;
    let staticArea = 0, exits = 0;
    while (front < back) {
      const p = queue[front++];
      staticArea++;
      for (let d = 0; d < 4; d++) {
        const z = neighbors[p * 4 + d];
        if (z < 0 || seen[z] || blocked[z] || deadline[z] <= 2) continue;
        if (p === c) exits++;
        seen[z] = 1;
        queue[back++] = z;
      }
    }

    const len = myLength + eating;
    let score = 1.1 * Math.min(area, len * 3 + 22);
    score += Math.min(territory, 70) * 0.65;
    score += Math.min(staticArea, len + 12) * 0.65;
    if (area < len) score -= 180 + (len - area) * 28;
    else if (area < len + 3) score -= (len + 3 - area) * 13;
    if (!exits) score -= 190;
    if (staticArea <= 2 && area > staticArea) score -= 12;
    score += exits * 2.5;

    const health = eating ? 100 : me.health - 1;
    if (eating) score += foodValue;
    if (goodFood < 30000) {
      const desire = health < 35 ? 3.1 : health < 65 ? 1.9 : 1.15;
      score -= Math.min(goodFood, 35) * desire;
      if (nearFood >= health) score -= 210 + Math.min(150, (nearFood - health) * 9);
      else if (nearFood + 6 >= health) score -= (nearFood + 6 - health) * 11;
    } else if (foodCells.length && health < 55) {
      score -= 65 + (55 - health) * 2;
    }

    const urgency = firstClosure < 16 ? 0.8 : 0.15;
    score -= centerCost(c) * urgency;
    if (deadline[c] < 5) score -= (5 - deadline[c]) * 8;
    return score;
  }

  function endpoint(node, step) {
    const c = node.body[0];
    let nearest = 30000;
    if (!node.eaten.length) nearest = foodDistance[c];
    else {
      const x = c % W, y = (c / W) | 0;
      for (const f of foodCells) {
        if (node.eaten.indexOf(f) >= 0 || deadline[f] <= step + 1) continue;
        const dd = Math.abs(x - f % W) + Math.abs(y - ((f / W) | 0));
        nearest = Math.min(nearest, dd);
      }
    }
    let value = node.reward;
    if (nearest < 30000) {
      value -= Math.min(nearest, 30) * (node.health < 40 ? 2 : 0.85);
      if (nearest >= node.health) value -= 100;
    }
    value -= centerCost(c) * (firstClosure < 18 ? 0.4 : 0.08);
    if (deadline[c] < step + 4) value -= 8;

    let exits = 0;
    for (let d = 0; d < 4; d++) {
      const z = neighbors[c * 4 + d];
      if (z < 0 || deadline[z] <= step + 1 || enemyRelease[z] > step + 1) continue;
      let blocked = false;
      const eat = food[z] && node.eaten.indexOf(z) < 0;
      const end = node.body.length - (eat ? 0 : 1);
      for (let j = 0; j < end; j++) {
        if (node.body[j] === z) { blocked = true; break; }
      }
      if (!blocked) exits++;
    }
    value += Math.min(3, exits) * 1.7;
    if (!exits) value -= 90;
    return value;
  }

  function lookAhead(c, eating, body) {
    const depth = safeArea < 45 ? 13 : 10;
    const width = safeArea < 45 ? 22 : 15;
    let beam = [{
      body,
      eaten: eating ? [c] : [],
      health: eating ? 100 : me.health - 1,
      reward: 0,
      rank: 0
    }];
    let deepest = 1;
    for (let step = 2; step <= depth; step++) {
      const next = [];
      for (const node of beam) {
        const h = node.body[0];
        for (let d = 0; d < 4; d++) {
          const z = neighbors[h * 4 + d];
          if (z < 0 || deadline[z] <= step || enemyRelease[z] > step) continue;
          const eat = food[z] && node.eaten.indexOf(z) < 0;
          const health = eat ? 100 : node.health - 1;
          if (health <= 0) continue;
          let blocked = false;
          const end = node.body.length - (eat ? 0 : 1);
          for (let j = 0; j < end; j++) {
            if (node.body[j] === z) { blocked = true; break; }
          }
          if (blocked) continue;
          const b = new Array(end + 1);
          b[0] = z;
          for (let j = 0; j < end; j++) b[j + 1] = node.body[j];
          let reward = node.reward;
          if (eat) {
            const hunger = node.health < 45 ? (45 - node.health) * 0.3 : 0;
            reward += (foodValue + hunger) * Math.pow(0.94, step - 1);
          }
          if (step <= 3 && strongArrival[z] <= step) {
            reward -= (4 - step) * 2.3;
          }
          const child = {
            body: b,
            eaten: eat ? node.eaten.concat(z) : node.eaten,
            health,
            reward,
            rank: 0
          };
          child.rank = endpoint(child, step);
          next.push(child);
        }
      }
      if (!next.length) {
        let best = -Infinity;
        for (const node of beam) best = Math.max(best, endpoint(node, deepest));
        return -420 - (depth - deepest) * 30 + Math.max(-100, best) * 0.15;
      }
      next.sort((a, b) => b.rank - a.rank);
      beam = [];
      const seen = new Map();
      for (const node of next) {
        const b = node.body;
        const key = b[0] + N * (b[1] === undefined ? 0 : b[1]) +
          N * N * node.eaten.length;
        const count = seen.get(key) || 0;
        if (count >= 2) continue;
        seen.set(key, count + 1);
        beam.push(node);
        if (beam.length >= width) break;
      }
      deepest = step;
    }
    return beam[0].rank * 0.85;
  }

  let bestDirection = 'up', bestScore = -Infinity;
  let fallbackScore = -Infinity, fallback = 'up';
  for (let d = 0; d < 4; d++) {
    const c = neighbors[head * 4 + d];
    if (c < 0) continue;
    let rough = deadline[c] > 1 ? 10 : -1000;
    rough -= permanent[c] * 100;
    if (food[c]) rough += 2;
    if (rough > fallbackScore) {
      fallbackScore = rough;
      fallback = DIRS[d];
    }
    if (deadline[c] <= 1 || permanent[c]) continue;
    const eating = food[c] ? 1 : 0;
    if (eating && originalBody[originalBody.length - 1] === c) continue;
    if (!eating && me.health <= 1) continue;

    const body = [c].concat(eating ? originalBody : originalBody.slice(0, -1));
    let score = analyze(c, eating, body);
    let lossProbability = 0;
    let threatened = false;
    let attackBonus = 0;
    for (const e of enemyData) {
      if (e.canEat && c === e.body[e.body.length - 1]) {
        let growthProbability = 0;
        for (const m of e.moves) if (food[m.c]) growthProbability += m.probability;
        score -= 210 + growthProbability * 420;
      }
      for (const m of e.moves) {
        if (m.c !== c) continue;
        if (e.length + eating >= myLength + eating) {
          threatened = true;
          lossProbability = 1 - (1 - lossProbability) * (1 - m.probability);
        } else {
          attackBonus += m.probability * (e.moves.length === 1 ? 90 : 18);
        }
      }
    }
    if (threatened) score -= 480 + 540 * lossProbability;
    score += attackBonus;
    score += lookAhead(c, eating, body);

    if (originalBody.length > 1 && c === originalBody[1]) score -= 0.15;
    score += (3 - d) * 0.0001;
    if (score > bestScore) {
      bestScore = score;
      bestDirection = DIRS[d];
    }
  }
  return bestScore === -Infinity ? fallback : bestDirection;
}

module.exports = { name: 'Ringwarden', move };
