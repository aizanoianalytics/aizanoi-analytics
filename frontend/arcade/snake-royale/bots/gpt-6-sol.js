'use strict';

const name = 'Ringwise';

function move(state) {
  const W = state.width;
  const H = state.height;
  const N = W * H;
  const you = state.you;
  const turn = state.turn;
  const cap = Math.floor(Math.min(W, H) / 2) - 1;

  const ring = new Int8Array(N);
  const hazard = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ring[y * W + x] = Math.min(x, y, W - 1 - x, H - 1 - y);
    }
  }
  for (const p of state.hazards) hazard[p.y * W + p.x] = 1;

  const food = [];
  const foodAt = new Int16Array(N);
  foodAt.fill(-1);
  for (const p of state.food) {
    const id = p.y * W + p.x;
    if (!hazard[id] && foodAt[id] < 0) {
      foodAt[id] = food.length;
      food.push(id);
    }
  }

  const others = [];
  for (const s of state.snakes) {
    if (s.id !== you.id) {
      others.push({
        body: s.body.map(p => p.y * W + p.x),
        head: s.head.y * W + s.head.x,
        length: s.length
      });
    }
  }

  const initial = you.body.map(p => p.y * W + p.x);
  const start = initial[0];
  const directions = ['up', 'down', 'left', 'right'];
  const dx = [0, 0, -1, 1];
  const dy = [-1, 1, 0, 0];
  const xs = new Int8Array(N);
  const ys = new Int8Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = i % W;
    ys[i] = (i / W) | 0;
  }

  function safe(id, step) {
    if (hazard[id]) return false;
    const r = ring[id];
    return r >= cap || turn + step - 1 <= 150 + 20 * r;
  }

  function nextId(id, direction) {
    const x = xs[id] + dx[direction];
    const y = ys[id] + dy[direction];
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
  }

  // The last few segments will be free soon. Reuse these arrays for
  // inexpensive estimates of the space available beyond the search horizon.
  const marks = new Int32Array(N);
  const queue = new Int16Array(N);
  let stamp = 0;

  function space(node, step) {
    const mark = ++stamp;
    const body = node.body;
    for (let j = 1; j < body.length - 2; j++) marks[body[j]] = mark;
    for (const enemy of others) {
      const remaining = Math.max(0, enemy.body.length - step - 2);
      for (let j = 0; j < remaining; j++) marks[enemy.body[j]] = mark;
    }

    let front = 0;
    let back = 1;
    queue[0] = body[0];
    marks[body[0]] = mark;
    while (front < back && back < 28) {
      const id = queue[front++];
      for (let d = 0; d < 4; d++) {
        const to = nextId(id, d);
        if (to < 0 || marks[to] === mark || !safe(to, step + 4)) continue;
        marks[to] = mark;
        queue[back++] = to;
        if (back >= 28) break;
      }
    }
    return back;
  }

  function foodDistance(node, step) {
    if (food.length === 0) return 0;
    const pos = node.body[0];
    let best = 100;
    for (let i = 0; i < food.length; i++) {
      if (node.eaten.indexOf(i) !== -1) continue;
      const f = food[i];
      const dist = Math.abs(xs[pos] - xs[f]) + Math.abs(ys[pos] - ys[f]);
      const r = ring[f];
      if (r < cap && turn + step + dist - 1 > 150 + 20 * r) continue;
      if (dist < best) best = dist;
    }
    return best === 100 ? 0 : best;
  }

  function evaluate(node, step) {
    const pos = node.body[0];
    let value = node.g;
    const reachable = space(node, step);
    value += Math.min(reachable, 26) * 0.16;
    value -= Math.max(0, Math.min(9, node.body.length + 1) - reachable) * 1.55;
    if (reachable <= 2) value -= 8;

    const hunger = node.health < 60
      ? 0.2 + (60 - node.health) * 0.035
      : 0;
    value -= hunger * foodDistance(node, step);

    const r = ring[pos];
    if (r < cap) {
      const untilClosure = 150 + 20 * r - (turn + step - 1);
      if (untilClosure >= 0 && untilClosure < 9) {
        value -= (9 - untilClosure) * 0.36;
      }
    }
    return value;
  }

  function advance(node, direction, step) {
    const from = node.body[0];
    const to = nextId(from, direction);
    if (to < 0 || !safe(to, step)) return null;

    const fi = foodAt[to];
    const eating = fi >= 0 && node.eaten.indexOf(fi) < 0;
    const newLength = node.body.length + (eating ? 1 : 0);
    const occupied = node.body.length - (eating ? 0 : 1);
    for (let j = 0; j < occupied; j++) {
      if (node.body[j] === to) return null;
    }

    let risk = 0;
    for (const enemy of others) {
      const remaining = Math.max(0, enemy.body.length - step);
      for (let j = 0; j < remaining; j++) {
        if (enemy.body[j] === to) return null;
      }

      const dist = Math.abs(xs[to] - xs[enemy.head]) +
                   Math.abs(ys[to] - ys[enemy.head]);
      if (step === 1 && dist === 1) {
        if (enemy.length >= newLength) risk += 46;
        else if (enemy.length + 1 >= newLength) risk += 5;
      } else if (step <= 4 && dist <= step + 1 &&
                 enemy.length >= newLength) {
        risk += 2.2 / step;
      }
    }

    const health = eating ? 100 : node.health - 1;
    if (health <= 0) return null;

    let gain = -risk;
    if (eating) {
      gain += (65 - node.health) * 0.65 - 13;
      const closedBy = Math.max(0, Math.min(cap,
        Math.floor((turn + step + 45 - 150) / 20) + 1));
      const side = Math.min(W, H) - 2 * closedBy;
      if (side <= 5 && newLength > 6) {
        const excess = newLength - 6;
        gain -= 4 * excess * excess * (node.health < 16 ? 0.45 : 1);
      }
    }

    const body = [to];
    const kept = eating ? node.body.length : node.body.length - 1;
    for (let j = 0; j < kept; j++) body.push(node.body[j]);

    return {
      body,
      health,
      eaten: eating ? node.eaten.concat(fi) : node.eaten,
      first: node.first < 0 ? direction : node.first,
      g: node.g + gain,
      value: 0
    };
  }

  const safeSide = Math.min(W, H) -
    2 * Math.max(0, Math.min(cap, Math.floor((turn - 151) / 20) + 1));
  const horizon = safeSide <= 5 ? 20 : safeSide <= 9 ? 16 : 13;
  const perDirection = safeSide <= 5 ? 23 : 17;

  let beam = [{
    body: initial,
    health: you.health,
    eaten: [],
    first: -1,
    g: 0,
    value: 0
  }];
  let bestDirection = 0;
  let bestDepth = 0;
  let bestValue = -Infinity;

  for (let step = 1; step <= horizon; step++) {
    const candidates = [];
    for (const node of beam) {
      for (let d = 0; d < 4; d++) {
        const child = advance(node, d, step);
        if (!child) continue;
        child.value = evaluate(child, step);
        candidates.push(child);
      }
    }
    if (candidates.length === 0) break;

    candidates.sort((a, b) => b.value - a.value);
    const seen = new Set();
    const counts = [0, 0, 0, 0];
    const next = [];
    for (const node of candidates) {
      if (counts[node.first] >= perDirection) continue;
      const key = node.first + ':' + node.body.join(',') +
                  ':' + node.eaten.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      counts[node.first]++;
      next.push(node);
    }
    beam = next;

    // Completing more safe moves is more important than a short-term gain.
    const winner = beam[0];
    if (winner && (step > bestDepth ||
        (step === bestDepth && winner.value > bestValue))) {
      bestDepth = step;
      bestValue = winner.value;
      bestDirection = winner.first;
    }
  }

  return directions[bestDirection];
}

module.exports = { name, move };
