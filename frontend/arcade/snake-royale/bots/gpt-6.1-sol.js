'use strict';

let boardCache = null;
let previousDirection = 0;

const DIRECTIONS = ['up', 'down', 'left', 'right'];
const REVERSE = [1, 0, 3, 2];

function getBoard(w, h) {
  if (boardCache && boardCache.w === w && boardCache.h === h) return boardCache;
  const n = w * h;
  const neighbors = new Int16Array(n * 4);
  const rings = new Int16Array(n);
  const xs = new Int16Array(n);
  const ys = new Int16Array(n);
  neighbors.fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      xs[c] = x;
      ys[c] = y;
      rings[c] = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (y > 0) neighbors[c * 4] = c - w;
      if (y + 1 < h) neighbors[c * 4 + 1] = c + w;
      if (x > 0) neighbors[c * 4 + 2] = c - 1;
      if (x + 1 < w) neighbors[c * 4 + 3] = c + 1;
    }
  }
  boardCache = { w, h, n, neighbors, rings, xs, ys };
  return boardCache;
}

function move(state) {
  const started = Date.now();
  const w = state.width;
  const h = state.height;
  const board = getBoard(w, h);
  const N = board.n;
  const nb = board.neighbors;
  const rings = board.rings;
  const xs = board.xs;
  const ys = board.ys;
  const me = state.you;
  const L = me.length || me.body.length;
  const health = me.health;
  const start = me.head.y * w + me.head.x;
  const turn = state.turn || 0;
  const snakes = state.snakes || [me];
  const food = state.food || [];
  const F = food.length;
  const foodIndex = new Int16Array(N);
  foodIndex.fill(-1);
  const foodCells = new Int16Array(F);
  for (let i = 0; i < F; i++) {
    const c = food[i].y * w + food[i].x;
    foodCells[i] = c;
    foodIndex[c] = i;
  }

  const hazardous = new Uint8Array(N);
  const hazards = state.hazards || [];
  for (let i = 0; i < hazards.length; i++) {
    const c = hazards[i].y * w + hazards[i].x;
    if (c >= 0 && c < N) hazardous[c] = 1;
  }

  let inset = 10000;
  for (let c = 0; c < N; c++) {
    if (!hazardous[c] && rings[c] < inset) inset = rings[c];
  }
  const cap = Math.floor(Math.min(w, h) / 2) - 1;
  const nextShrink = typeof state.nextShrinkTurn === 'number'
    ? state.nextShrinkTurn
    : (turn <= 150 ? 150 : 150 + 20 * Math.ceil((turn - 150) / 20));
  const delta = Math.max(0, nextShrink - turn);
  const deadline = new Int16Array(N);
  for (let c = 0; c < N; c++) {
    if (hazardous[c]) {
      deadline[c] = 1;
    } else if (rings[c] < cap && inset < cap) {
      deadline[c] = Math.min(30000, delta + 2 + 20 * Math.max(0, rings[c] - inset));
    } else {
      deadline[c] = 30000;
    }
  }

  const ownRelease = new Int16Array(N);
  const otherRelease = new Int16Array(N);
  const globalRelease = new Int16Array(N);
  const opponents = [];
  for (let s = 0; s < snakes.length; s++) {
    const snake = snakes[s];
    const body = snake.body;
    const len = snake.length || body.length;
    const isMe = snake.id === me.id;
    const release = isMe ? ownRelease : otherRelease;
    const individual = isMe ? null : new Int16Array(N);
    for (let j = 0; j < body.length; j++) {
      const c = body[j].y * w + body[j].x;
      const r = len - j;
      if (r > release[c]) release[c] = r;
      if (r > globalRelease[c]) globalRelease[c] = r;
      if (individual && r > individual[c]) individual[c] = r;
    }
    if (!isMe) {
      opponents.push({
        snake,
        len,
        head: snake.head.y * w + snake.head.x,
        release: individual,
        actions: [],
        growProbability: 0
      });
    }
  }
  for (let c = 0; c < N; c++) {
    if (ownRelease[c] > globalRelease[c]) globalRelease[c] = ownRelease[c];
  }

  const topLength = new Int16Array(N);
  const secondLength = new Int16Array(N);
  const topOwner = new Int16Array(N);
  topOwner.fill(-1);

  function addThreat(cell, len, owner) {
    if (len > topLength[cell]) {
      secondLength[cell] = topLength[cell];
      topLength[cell] = len;
      topOwner[cell] = owner;
    } else if (len > secondLength[cell]) {
      secondLength[cell] = len;
    }
  }

  function initialActions(head, len, hp, owner, destination) {
    for (let dir = 0; dir < 4; dir++) {
      const c = nb[head * 4 + dir];
      if (c < 0 || deadline[c] <= 1 || globalRelease[c] > 1) continue;
      const eating = foodIndex[c] >= 0;
      if (hp <= 1 && !eating) continue;
      const effectiveLength = len + (eating ? 1 : 0);
      if (destination) destination.push({ c, dir, len: effectiveLength, probability: 0 });
      addThreat(c, effectiveLength, owner);
    }
  }

  initialActions(start, L, health, opponents.length, null);
  for (let i = 0; i < opponents.length; i++) {
    const op = opponents[i];
    initialActions(op.head, op.len, op.snake.health, i, op.actions);
  }

  const nearestFood = new Int16Array(N);
  nearestFood.fill(1000);
  const foodDistances = [];
  for (let f = 0; f < F; f++) {
    const distances = new Int16Array(N);
    const fc = foodCells[f];
    for (let c = 0; c < N; c++) {
      const d = Math.abs(xs[c] - xs[fc]) + Math.abs(ys[c] - ys[fc]);
      distances[c] = d;
      if (d < nearestFood[c]) nearestFood[c] = d;
    }
    foodDistances.push(distances);
  }

  const predictionDepth = 4;
  const headAll = [];
  const headStrong = [];
  const futureBody = [];
  for (let d = 0; d <= 7; d++) {
    headAll.push(new Float32Array(N));
    headStrong.push(new Float32Array(N));
    futureBody.push(new Float32Array(N));
  }

  for (let oi = 0; oi < opponents.length; oi++) {
    const op = opponents[oi];
    const cellWeight = new Float32Array(N);
    const hunger = op.snake.health < 45 ? 0.72 : (op.len < 8 ? 0.53 : 0.26);
    for (let c = 0; c < N; c++) {
      let weight = F ? Math.exp(-hunger * Math.min(35, nearestFood[c])) : 1;
      if (foodIndex[c] >= 0) weight *= op.snake.health < 65 ? 3 : 1.65;
      if (deadline[c] < 15) weight *= 0.32 + 0.045 * deadline[c];
      cellWeight[c] = Math.max(0.000001, weight);
    }

    let total = 0;
    for (let a = 0; a < op.actions.length; a++) {
      const action = op.actions[a];
      const c = action.c;
      let weight = cellWeight[c];
      const threat = topOwner[c] === oi ? secondLength[c] : topLength[c];
      if (threat >= action.len) weight *= threat > action.len ? 0.025 : 0.10;
      let exits = 0;
      for (let k = 0; k < 4; k++) {
        if (k === REVERSE[action.dir]) continue;
        const v = nb[c * 4 + k];
        if (v >= 0 && deadline[v] > 2 && globalRelease[v] <= 2) exits++;
      }
      if (exits === 0) weight *= 0.015;
      else if (exits === 1) weight *= 0.52;
      const body = op.snake.body;
      if (body.length > 1) {
        const neck = body[1].y * w + body[1].x;
        if (nb[op.head * 4 + REVERSE[action.dir]] === neck) weight *= 1.12;
      }
      action.weight = weight;
      total += weight;
    }

    if (total <= 0) continue;
    let directed = new Float32Array(N * 4);
    const history = [];
    history[0] = null;
    const first = new Float32Array(N);
    for (let a = 0; a < op.actions.length; a++) {
      const action = op.actions[a];
      const p = action.weight / total;
      action.probability = p;
      directed[action.c * 4 + action.dir] += p;
      first[action.c] += p;
      headAll[1][action.c] += p;
      if (action.len >= L) headStrong[1][action.c] += p;
      if (foodIndex[action.c] >= 0) op.growProbability += p;
    }
    history[1] = first;

    for (let d = 2; d <= predictionDepth; d++) {
      const nextDirected = new Float32Array(N * 4);
      const distribution = new Float32Array(N);
      for (let c = 0; c < N; c++) {
        const base = c * 4;
        for (let incoming = 0; incoming < 4; incoming++) {
          const p = directed[base + incoming];
          if (p < 0.00001) continue;
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            if (k === REVERSE[incoming]) continue;
            const v = nb[base + k];
            if (v < 0 || deadline[v] <= d || globalRelease[v] > d) continue;
            sum += cellWeight[v] * (k === incoming ? 1.08 : 1);
          }
          if (sum <= 0) continue;
          const scale = p / sum;
          for (let k = 0; k < 4; k++) {
            if (k === REVERSE[incoming]) continue;
            const v = nb[base + k];
            if (v < 0 || deadline[v] <= d || globalRelease[v] > d) continue;
            const q = scale * cellWeight[v] * (k === incoming ? 1.08 : 1);
            nextDirected[v * 4 + k] += q;
            distribution[v] += q;
          }
        }
      }
      history[d] = distribution;
      for (let c = 0; c < N; c++) {
        headAll[d][c] += distribution[c];
        if (op.len + 1 >= L) headStrong[d][c] += distribution[c];
      }
      directed = nextDirected;
    }

    for (let d = 2; d <= 7; d++) {
      const fade = d <= 4 ? 1 : Math.pow(0.62, d - 4);
      for (let j = 1; j < d && j <= predictionDepth; j++) {
        if (d - j >= op.len + 1) continue;
        const distribution = history[j];
        for (let c = 0; c < N; c++) {
          futureBody[d][c] += distribution[c] * fade;
        }
      }
    }
  }

  const otherFutureRelease = new Int16Array(otherRelease);
  for (let oi = 0; oi < opponents.length; oi++) {
    const op = opponents[oi];
    if (op.growProbability < 0.18) continue;
    for (let c = 0; c < N; c++) {
      if (op.release[c] && op.release[c] + 1 > otherFutureRelease[c]) {
        otherFutureRelease[c] = op.release[c] + 1;
      }
    }
  }

  const enemyDistance = new Int16Array(N);
  enemyDistance.fill(10000);
  const inQueue = new Uint8Array(N);
  const distanceQueue = [];
  for (let i = 0; i < opponents.length; i++) {
    const c = opponents[i].head;
    if (enemyDistance[c] !== 0) {
      enemyDistance[c] = 0;
      distanceQueue.push(c);
      inQueue[c] = 1;
    }
  }
  for (let qi = 0; qi < distanceQueue.length; qi++) {
    const c = distanceQueue[qi];
    inQueue[c] = 0;
    const t = enemyDistance[c];
    for (let k = 0; k < 4; k++) {
      const v = nb[c * 4 + k];
      if (v < 0) continue;
      const arrival = Math.max(t + 1, globalRelease[v]);
      if (arrival >= deadline[v] || arrival >= enemyDistance[v] || arrival > 65) continue;
      enemyDistance[v] = arrival;
      if (!inQueue[v]) {
        inQueue[v] = 1;
        distanceQueue.push(v);
      }
    }
  }

  function hasEaten(node, f) {
    if (f < 30) return (node.mask & (1 << f)) !== 0;
    for (let q = node; q && q.d > 0; q = q.parent) {
      if (q.ate === f) return true;
    }
    return false;
  }

  function growthValue(len) {
    if (len < 5) return 40;
    if (len < 7) return 27;
    if (len < 8) return 15;
    return turn > 105 ? -21 : -15;
  }

  function heuristic(node) {
    const len = L + node.g;
    let coefficient = len < 5 ? 2.8 : (len < 7 ? 2.0 : (len < 8 ? 1.0 : 0));
    coefficient += Math.max(0, 65 - node.health) / 15;
    let nearest = 10000;
    if (coefficient > 0) {
      for (let f = 0; f < F; f++) {
        if (hasEaten(node, f)) continue;
        const dist = foodDistances[f][node.c];
        if (deadline[foodCells[f]] <= node.d + dist) continue;
        let adjusted = dist;
        const theirTime = enemyDistance[foodCells[f]];
        if (theirTime + 1 < node.d + dist) {
          adjusted += Math.min(7, (node.d + dist - theirTime) * 0.55);
        }
        if (adjusted < nearest) nearest = adjusted;
      }
    }
    let value = node.acc + node.health * 0.085;
    value -= Math.max(0, 45 - node.health) * 0.28;
    if (nearest < 10000) {
      value -= coefficient * nearest;
      if (nearest >= node.health) value -= 35 + 14 * (nearest - node.health + 1);
    }
    const remaining = deadline[node.c] - node.d;
    if (remaining < 150) value -= 27 / (1 + Math.max(0, remaining - 1) * 0.15);
    return value;
  }

  function makeChild(parent, c, dir, depth) {
    if (c < 0 || deadline[c] <= depth) return null;
    if ((depth === 1 ? otherRelease[c] : otherFutureRelease[c]) > depth) return null;

    const f = foodIndex[c];
    const eating = f >= 0 && !hasEaten(parent, f);
    const g = parent.g + (eating ? 1 : 0);
    const len = L + g;
    if (ownRelease[c] > depth - g) return null;

    for (let q = parent; q && q.d > 0 && depth - q.d < len; q = q.parent) {
      if (q.c === c) return null;
    }

    const hp = eating ? 100 : parent.health - 1;
    if (hp <= 0) return null;
    let acc = parent.acc;
    if (eating) {
      let reward = growthValue(L + parent.g) + (100 - parent.health) * 0.35;
      if (depth > 1 && enemyDistance[c] + 1 < depth && reward > 0) reward *= 0.58;
      acc += reward;
    }
    if (depth >= 2 && depth <= 7) {
      const bodyRisk = Math.min(1.3, futureBody[depth][c]);
      const headRisk = Math.min(1.2, headStrong[depth][c]) * Math.pow(0.76, g);
      acc -= (bodyRisk * 150 + headRisk * 125) * Math.pow(0.90, depth - 2);
    }
    const node = {
      c,
      dir,
      parent,
      d: depth,
      g,
      health: hp,
      mask: eating && f < 30 ? parent.mask | (1 << f) : parent.mask,
      ate: eating ? f : -1,
      acc,
      rank: 0
    };
    node.rank = heuristic(node);
    return node;
  }

  function measureArea(node, requestedHorizon) {
    const len = L + node.g;
    const own = new Int16Array(N);
    for (let c = 0; c < N; c++) {
      const remaining = ownRelease[c] - node.d + node.g;
      if (ownRelease[c] && remaining > 0) own[c] = remaining;
    }
    for (let q = node; q && q.d > 0; q = q.parent) {
      const remaining = len - node.d + q.d;
      if (remaining > 0 && remaining > own[q.c]) own[q.c] = remaining;
      if (remaining <= 0) break;
    }

    const seen = new Uint8Array(N);
    const layerStamp = new Int16Array(N);
    let current = new Int16Array(N);
    let next = new Int16Array(N);
    current[0] = node.c;
    let size = 1;
    seen[node.c] = 1;
    let count = 1;
    let territory = 1;
    let futureCount = deadline[node.c] > node.d + Math.min(requestedHorizon, len + 1) ? 1 : 0;
    let horizon = requestedHorizon;
    let nearest = foodIndex[node.c] >= 0 && !hasEaten(node, foodIndex[node.c]) ? 0 : 10000;

    for (let t = 1; t <= horizon; t++) {
      let nextSize = 0;
      const absolute = node.d + t;
      for (let j = 0; j < size; j++) {
        const c = current[j];
        for (let k = 0; k < 4; k++) {
          const v = nb[c * 4 + k];
          if (v < 0 || layerStamp[v] === t) continue;
          if (deadline[v] <= absolute || own[v] > t || otherFutureRelease[v] > absolute) continue;
          layerStamp[v] = t;
          next[nextSize++] = v;
          if (!seen[v]) {
            seen[v] = 1;
            count++;
            const enemyArrival = enemyDistance[v];
            const advantage = enemyArrival - absolute;
            territory += advantage >= 2 ? 1 : (advantage >= 0 ? 0.72 : 0.30);
            if (deadline[v] > node.d + Math.min(requestedHorizon, len + 1)) futureCount++;
            const fi = foodIndex[v];
            if (fi >= 0 && !hasEaten(node, fi) && t < nearest) nearest = t;
          }
        }
      }
      if (!nextSize) break;
      const temp = current;
      current = next;
      next = temp;
      size = nextSize;
      if (t === horizon && count < len && horizon < Math.min(48, len + 2)) {
        horizon = Math.min(48, len + 2);
      }
    }
    return { count, territory, futureCount, nearest };
  }

  const baseNode = {
    c: start,
    dir: previousDirection,
    parent: null,
    d: 0,
    g: 0,
    health,
    mask: 0,
    ate: -1,
    acc: 0,
    rank: 0
  };

  const roots = [];
  for (let dir = 0; dir < 4; dir++) {
    const c = nb[start * 4 + dir];
    const node = makeChild(baseNode, c, dir, 1);
    if (!node) continue;
    const len = L + node.g;
    let noKill = 1;
    let possibleKill = false;
    let killReward = 0;
    let noTailCollision = 1;
    for (let i = 0; i < opponents.length; i++) {
      const op = opponents[i];
      let lethalProbability = 0;
      for (let a = 0; a < op.actions.length; a++) {
        const action = op.actions[a];
        if (action.c !== c) continue;
        if (action.len >= len) {
          possibleKill = true;
          lethalProbability += action.probability;
        } else {
          killReward += action.probability * (opponents.length === 1 ? 150 : 70);
        }
      }
      noKill *= 1 - Math.min(1, lethalProbability);
      if (op.release[c] === 1) noTailCollision *= 1 - op.growProbability;
    }
    const pKill = 1 - noKill;
    const pTail = 1 - noTailCollision;
    let base = killReward;
    if (possibleKill) base -= 1700 + pKill * 2800;
    if (pTail > 0.00001) base -= 450 + pTail * 3500;
    if (dir === previousDirection) base += 0.18;
    const area = measureArea(node, Math.min(24, Math.max(14, len + 4)));
    base += 1.15 * Math.min(area.count, len * 2 + 18) + 0.42 * area.territory;
    if (area.count < len) base -= 2500 + 400 * (len - area.count);
    if (area.futureCount < len && area.futureCount < area.count) {
      base -= 45 * (len - area.futureCount);
    }
    if (health < 24 && area.nearest > health - 1 && area.nearest < 10000) {
      base -= 60 + 18 * Math.min(20, area.nearest - health + 1);
    }
    roots.push({
      dir,
      base,
      beam: [node],
      depth: 1,
      dead: false,
      area,
      best: node,
      bestRank: node.rank
    });
  }

  if (!roots.length) {
    let bestDir = previousDirection;
    let best = -Infinity;
    for (let dir = 0; dir < 4; dir++) {
      const c = nb[start * 4 + dir];
      let score = dir === previousDirection ? 0.1 : 0;
      if (c < 0) score -= 1000;
      else {
        if (foodIndex[c] >= 0) score += 500;
        if (hazardous[c]) score -= 150;
        if (ownRelease[c] > 1) score -= 60;
        if (otherRelease[c] > 1) score -= 70;
        score += rings[c];
      }
      if (score > best) {
        best = score;
        bestDir = dir;
      }
    }
    previousDirection = bestDir;
    return DIRECTIONS[bestDir];
  }

  let safeCells = 0;
  for (let c = 0; c < N; c++) if (!hazardous[c]) safeCells++;
  const targetDepth = safeCells <= 49 ? 16 : (N <= 121 ? 13 : 12);
  const beamWidth = safeCells <= 49 ? 24 : 18;

  for (let depth = 2; depth <= targetDepth; depth++) {
    if (depth > 4 && Date.now() - started > 33) break;
    let anyAlive = false;
    for (let r = 0; r < roots.length; r++) {
      const root = roots[r];
      if (root.dead) continue;
      const candidates = [];
      const beam = root.beam;
      for (let j = 0; j < beam.length; j++) {
        const parent = beam[j];
        for (let dir = 0; dir < 4; dir++) {
          const c = nb[parent.c * 4 + dir];
          const child = makeChild(parent, c, dir, depth);
          if (child) candidates.push(child);
        }
      }
      if (!candidates.length) {
        root.dead = true;
        continue;
      }
      candidates.sort((a, b) => b.rank - a.rank);
      const retained = [];
      const diversity = new Uint8Array(N * 4);
      for (let j = 0; j < candidates.length && retained.length < beamWidth; j++) {
        const child = candidates[j];
        const key = child.c * 4 + child.dir;
        if (diversity[key] >= 2) continue;
        diversity[key]++;
        retained.push(child);
      }
      root.beam = retained;
      root.depth = depth;
      root.best = retained[0];
      root.bestRank = retained[0].rank;
      anyAlive = true;
    }
    if (!anyAlive) break;
  }

  let bestScore = -Infinity;
  let bestDirection = roots[0].dir;
  for (let r = 0; r < roots.length; r++) {
    const root = roots[r];
    let score;
    if (root.dead) {
      score = -50000 + root.depth * 1200 + root.base + root.bestRank;
    } else {
      let leafBest = -Infinity;
      const evaluations = Date.now() - started > 39 ? 1 : Math.min(4, root.beam.length);
      for (let j = 0; j < evaluations; j++) {
        const node = root.beam[j];
        const len = L + node.g;
        const area = measureArea(node, Math.min(24, Math.max(12, len + 3)));
        let leafScore = node.rank;
        leafScore += 1.15 * Math.min(area.count, 2 * len + 15) + 0.20 * area.territory;
        if (area.count < len) leafScore -= 8000 + 500 * (len - area.count);
        if (area.futureCount < len && area.futureCount < area.count) {
          leafScore -= 75 * (len - area.futureCount);
        }
        if (node.health < 18 && area.nearest >= node.health && area.nearest < 10000) {
          leafScore -= 120 + 25 * Math.min(15, area.nearest - node.health + 1);
        }
        if (leafScore > leafBest) leafBest = leafScore;
      }
      score = root.base + leafBest;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDirection = root.dir;
    }
  }

  previousDirection = bestDirection;
  return DIRECTIONS[bestDirection];
}

module.exports = { name: 'Aegis Coil', move };
