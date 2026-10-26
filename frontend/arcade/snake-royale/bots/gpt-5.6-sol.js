'use strict';

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
  { name: 'down', dx: 0, dy: 1 }
];

let searchDeadline = 0;
let searchNodes = 0;
const TIMEOUT = {};

function inside(x, y, w, h) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function indexOf(x, y, w) {
  return y * w + x;
}

function makeMask(points, w, h) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (inside(p.x, p.y, w, h)) a[indexOf(p.x, p.y, w)] = 1;
  }
  return a;
}

function closedRings(w, h, hazards) {
  const cap = Math.max(0, Math.floor(Math.min(w, h) / 2) - 1);
  let count = 0;
  for (let r = 0; r < cap; r++) {
    if (hazards[indexOf(r, r, w)]) count++;
    else break;
  }
  return count;
}

function ringOf(x, y, w, h) {
  return Math.min(x, y, w - 1 - x, h - 1 - y);
}

function bfs(w, h, start, blocked, hazards) {
  const n = w * h;
  const dist = new Int16Array(n);
  dist.fill(-1);
  const q = new Int16Array(n);
  let head = 0;
  let tail = 0;
  const si = indexOf(start.x, start.y, w);
  dist[si] = 0;
  q[tail++] = si;

  while (head < tail) {
    const cur = q[head++];
    const x = cur % w;
    const y = (cur / w) | 0;
    const nd = dist[cur] + 1;

    if (y > 0) {
      const ni = cur - w;
      if (dist[ni] < 0 && !hazards[ni] && (!blocked[ni] || ni === si)) {
        dist[ni] = nd;
        q[tail++] = ni;
      }
    }
    if (x > 0) {
      const ni = cur - 1;
      if (dist[ni] < 0 && !hazards[ni] && (!blocked[ni] || ni === si)) {
        dist[ni] = nd;
        q[tail++] = ni;
      }
    }
    if (x + 1 < w) {
      const ni = cur + 1;
      if (dist[ni] < 0 && !hazards[ni] && (!blocked[ni] || ni === si)) {
        dist[ni] = nd;
        q[tail++] = ni;
      }
    }
    if (y + 1 < h) {
      const ni = cur + w;
      if (dist[ni] < 0 && !hazards[ni] && (!blocked[ni] || ni === si)) {
        dist[ni] = nd;
        q[tail++] = ni;
      }
    }
  }
  return dist;
}

function optimisticOccupancy(state) {
  const w = state.width;
  const occ = new Int16Array(w * state.height);
  for (let s = 0; s < state.snakes.length; s++) {
    const body = state.snakes[s].body;
    for (let i = 0; i + 1 < body.length; i++) {
      const p = body[i];
      if (inside(p.x, p.y, state.width, state.height)) {
        occ[indexOf(p.x, p.y, w)]++;
      }
    }
  }
  return occ;
}

function immediateMoveCount(state, snake, hazards, foodMask, occ) {
  let count = 0;
  const w = state.width;
  const h = state.height;
  const tail = snake.body[snake.body.length - 1];

  for (let d = 0; d < 4; d++) {
    const x = snake.head.x + DIRS[d].dx;
    const y = snake.head.y + DIRS[d].dy;
    if (!inside(x, y, w, h)) continue;
    const i = indexOf(x, y, w);
    if (hazards[i]) continue;
    const eat = !!foodMask[i];
    if (!eat && snake.health <= 1) continue;
    if (occ[i] > 0) continue;
    if (eat && tail && tail.x === x && tail.y === y) continue;
    count++;
  }
  return count;
}

function simulateDuel(state, myId, enemyId, myDirIndex, enemyDirIndex) {
  const w = state.width;
  const h = state.height;
  const n = w * h;
  const foodMask = makeMask(state.food, w, h);
  let hazardMask = makeMask(state.hazards, w, h);
  const choices = Object.create(null);
  choices[myId] = myDirIndex;
  choices[enemyId] = enemyDirIndex;

  const moved = [];
  const consumed = new Uint8Array(n);

  for (let s = 0; s < state.snakes.length; s++) {
    const old = state.snakes[s];
    const d = DIRS[choices[old.id]];
    const hx = old.head.x + d.dx;
    const hy = old.head.y + d.dy;
    const inBoard = inside(hx, hy, w, h);
    const hi = inBoard ? indexOf(hx, hy, w) : -1;
    const ate = inBoard && !!foodMask[hi];
    if (ate) consumed[hi] = 1;

    const body = [{ x: hx, y: hy }];
    for (let j = 0; j < old.body.length; j++) {
      body.push({ x: old.body[j].x, y: old.body[j].y });
    }
    if (!ate) body.pop();

    moved.push({
      id: old.id,
      name: old.name,
      head: body[0],
      body,
      length: old.length + (ate ? 1 : 0),
      health: ate ? 100 : old.health - 1,
      preliminaryDead: !inBoard || (inBoard && !!hazardMask[hi]) || (!ate && old.health <= 1),
      dead: false
    });
  }

  const bodyCounts = new Int16Array(n);
  for (let s = 0; s < moved.length; s++) {
    const body = moved[s].body;
    for (let j = 1; j < body.length; j++) {
      const p = body[j];
      if (inside(p.x, p.y, w, h)) bodyCounts[indexOf(p.x, p.y, w)]++;
    }
  }

  for (let s = 0; s < moved.length; s++) {
    const sn = moved[s];
    if (sn.preliminaryDead) {
      sn.dead = true;
      continue;
    }
    const hi = indexOf(sn.head.x, sn.head.y, w);
    if (bodyCounts[hi] > 0) sn.dead = true;
  }

  for (let a = 0; a < moved.length; a++) {
    const sa = moved[a];
    if (sa.dead) continue;
    for (let b = 0; b < moved.length; b++) {
      if (a === b) continue;
      const sb = moved[b];
      if (sb.dead) continue;
      if (sa.head.x === sb.head.x && sa.head.y === sb.head.y && sb.length >= sa.length) {
        sa.dead = true;
        break;
      }
    }
  }

  const finalLength = Object.create(null);
  const living = [];
  for (let s = 0; s < moved.length; s++) {
    const sn = moved[s];
    finalLength[sn.id] = sn.length;
    if (!sn.dead) {
      living.push({
        id: sn.id,
        name: sn.name,
        head: sn.head,
        body: sn.body,
        length: sn.length,
        health: sn.health
      });
    }
  }

  const nextTurn = state.turn + 1;
  let nextShrinkTurn = state.nextShrinkTurn;
  let didClose = false;

  if (state.turn === state.nextShrinkTurn) {
    didClose = true;
    const before = closedRings(w, h, hazardMask);
    const cap = Math.max(0, Math.floor(Math.min(w, h) / 2) - 1);
    if (before < cap) {
      const r = before;
      const newHazards = new Uint8Array(hazardMask);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (ringOf(x, y, w, h) === r) newHazards[indexOf(x, y, w)] = 1;
        }
      }
      hazardMask = newHazards;
    }
    nextShrinkTurn += 20;
  }

  const food = [];
  for (let i = 0; i < n; i++) {
    if (foodMask[i] && !consumed[i] && !hazardMask[i]) {
      food.push({ x: i % w, y: (i / w) | 0 });
    }
  }

  const hazards = [];
  if (didClose) {
    for (let i = 0; i < n; i++) {
      if (hazardMask[i]) hazards.push({ x: i % w, y: (i / w) | 0 });
    }
  } else {
    for (let i = 0; i < state.hazards.length; i++) {
      hazards.push(state.hazards[i]);
    }
  }

  let you = null;
  for (let i = 0; i < living.length; i++) {
    if (living[i].id === myId) {
      you = living[i];
      break;
    }
  }

  return {
    state: {
      turn: nextTurn,
      width: w,
      height: h,
      you,
      snakes: living,
      food,
      hazards,
      nextShrinkTurn
    },
    myAlive: living.some(s => s.id === myId),
    enemyAlive: living.some(s => s.id === enemyId),
    myFinal: finalLength[myId],
    enemyFinal: finalLength[enemyId]
  };
}

function terminalValue(result, remainingDepth) {
  if (result.myAlive && !result.enemyAlive) return 100000000 + remainingDepth * 1000;
  if (!result.myAlive && result.enemyAlive) return -100000000 - remainingDepth * 1000;
  if (!result.myAlive && !result.enemyAlive) {
    if (result.myFinal > result.enemyFinal) return 20000000;
    if (result.myFinal < result.enemyFinal) return -20000000;
    return 0;
  }
  if (result.state.turn >= 600) return 0;
  return null;
}

function duelEvaluation(state, myId, enemyId) {
  let me = null;
  let enemy = null;
  for (let i = 0; i < state.snakes.length; i++) {
    if (state.snakes[i].id === myId) me = state.snakes[i];
    else if (state.snakes[i].id === enemyId) enemy = state.snakes[i];
  }
  if (!me && !enemy) return 0;
  if (!me) return -100000000;
  if (!enemy) return 100000000;

  const w = state.width;
  const h = state.height;
  const n = w * h;
  const hazards = makeMask(state.hazards, w, h);
  const foodMask = makeMask(state.food, w, h);
  const blocked = new Uint8Array(n);

  for (let s = 0; s < state.snakes.length; s++) {
    const body = state.snakes[s].body;
    for (let j = 1; j < body.length; j++) {
      const p = body[j];
      if (inside(p.x, p.y, w, h)) blocked[indexOf(p.x, p.y, w)] = 1;
    }
  }

  const myDist = bfs(w, h, me.head, blocked, hazards);
  const enemyDist = bfs(w, h, enemy.head, blocked, hazards);
  let myTerritory = 0;
  let enemyTerritory = 0;
  let myArea = 0;
  let enemyArea = 0;

  for (let i = 0; i < n; i++) {
    if (hazards[i] || blocked[i]) continue;
    const a = myDist[i];
    const b = enemyDist[i];
    if (a >= 0) myArea++;
    if (b >= 0) enemyArea++;
    if (a >= 0 && (b < 0 || a < b)) myTerritory++;
    else if (b >= 0 && (a < 0 || b < a)) enemyTerritory++;
    else if (a >= 0 && a === b) {
      if (me.length > enemy.length) myTerritory += 0.75;
      else if (enemy.length > me.length) enemyTerritory += 0.75;
      else {
        myTerritory += 0.35;
        enemyTerritory += 0.35;
      }
    }
  }

  const occ = optimisticOccupancy(state);
  const myMoves = immediateMoveCount(state, me, hazards, foodMask, occ);
  const enemyMoves = immediateMoveCount(state, enemy, hazards, foodMask, occ);

  let score = 0;
  score += (myTerritory - enemyTerritory) * 115;
  score += (myArea - enemyArea) * 10;
  score += (me.length - enemy.length) * 520;
  score += (me.health - enemy.health) * 5;
  score += (myMoves - enemyMoves) * 270;

  if (myMoves === 0) score -= 10000;
  if (enemyMoves === 0) score += 10000;
  if (myArea < me.length + 1) score -= (me.length + 1 - myArea) * 1800;
  if (enemyArea < enemy.length + 1) score += (enemy.length + 1 - enemyArea) * 1800;

  let myFood = 32767;
  let enemyFood = 32767;
  for (let i = 0; i < state.food.length; i++) {
    const p = state.food[i];
    const k = indexOf(p.x, p.y, w);
    if (myDist[k] >= 0 && myDist[k] < myFood) myFood = myDist[k];
    if (enemyDist[k] >= 0 && enemyDist[k] < enemyFood) enemyFood = enemyDist[k];
  }

  if (myFood < 32767) {
    score += (100 - me.health) * 16 / (myFood + 1);
    if (myFood > me.health) score -= 12000;
  }
  if (enemyFood < 32767) {
    score -= (100 - enemy.health) * 16 / (enemyFood + 1);
    if (enemyFood > enemy.health) score += 12000;
  }

  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  const myCenter = Math.abs(me.head.x - centerX) + Math.abs(me.head.y - centerY);
  const enemyCenter = Math.abs(enemy.head.x - centerX) + Math.abs(enemy.head.y - centerY);
  const untilShrink = state.nextShrinkTurn - state.turn;
  if (untilShrink < 30) score += (enemyCenter - myCenter) * (30 - Math.max(0, untilShrink)) * 2;

  const headDistance = Math.abs(me.head.x - enemy.head.x) + Math.abs(me.head.y - enemy.head.y);
  if (headDistance <= 3) {
    if (me.length > enemy.length) score += (4 - headDistance) * 90;
    else if (me.length < enemy.length) score -= (4 - headDistance) * 110;
  }

  return score;
}

function duelSearch(state, myId, enemyId, depth) {
  if ((++searchNodes & 31) === 0 && Date.now() >= searchDeadline) throw TIMEOUT;
  if (depth <= 0) return duelEvaluation(state, myId, enemyId);

  let best = -Infinity;
  for (let a = 0; a < 4; a++) {
    let worst = Infinity;
    for (let e = 0; e < 4; e++) {
      const result = simulateDuel(state, myId, enemyId, a, e);
      let value = terminalValue(result, depth);
      if (value === null) value = duelSearch(result.state, myId, enemyId, depth - 1);
      if (value < worst) worst = value;
      if (worst <= best) break;
    }
    if (worst > best) best = worst;
  }
  return best;
}

function duelRoot(state, myId, enemyId, depth, preferred) {
  const order = [preferred, 0, 1, 2, 3].filter((v, i, a) => v >= 0 && a.indexOf(v) === i);
  let bestDir = order[0];
  let bestValue = -Infinity;

  for (let oi = 0; oi < order.length; oi++) {
    if (Date.now() >= searchDeadline) throw TIMEOUT;
    const a = order[oi];
    let worst = Infinity;

    for (let e = 0; e < 4; e++) {
      const result = simulateDuel(state, myId, enemyId, a, e);
      let value = terminalValue(result, depth);
      if (value === null) value = duelSearch(result.state, myId, enemyId, depth - 1);
      if (value < worst) worst = value;
      if (worst <= bestValue) break;
    }

    if (worst > bestValue || (worst === bestValue && Math.random() < 0.25)) {
      bestValue = worst;
      bestDir = a;
    }
  }

  return bestDir;
}

function chooseDuel(state, startTime) {
  const myId = state.you.id;
  let enemyId = null;
  for (let i = 0; i < state.snakes.length; i++) {
    if (state.snakes[i].id !== myId) {
      enemyId = state.snakes[i].id;
      break;
    }
  }

  let preferred = 0;
  const body = state.you.body;
  if (body.length > 1) {
    const dx = state.you.head.x - body[1].x;
    const dy = state.you.head.y - body[1].y;
    for (let i = 0; i < 4; i++) {
      if (DIRS[i].dx === dx && DIRS[i].dy === dy) preferred = i;
    }
  }

  searchDeadline = startTime + 44;
  searchNodes = 0;
  let answer = preferred;

  for (let depth = 1; depth <= 3; depth++) {
    if (depth === 3 && Date.now() > startTime + 29) break;
    try {
      const next = duelRoot(state, myId, enemyId, depth, answer);
      answer = next;
    } catch (err) {
      if (err !== TIMEOUT) throw err;
      break;
    }
  }

  return DIRS[answer].name;
}

function temporalReach(state, candidate, ownBody, releaseBase, hazards) {
  const w = state.width;
  const h = state.height;
  const n = w * h;
  const release = new Int16Array(releaseBase);

  for (let j = 1; j < ownBody.length; j++) {
    const p = ownBody[j];
    if (!inside(p.x, p.y, w, h)) continue;
    const k = indexOf(p.x, p.y, w);
    const r = ownBody.length - j;
    if (r > release[k]) release[k] = r;
  }

  const dist = new Int16Array(n);
  dist.fill(32767);
  const queue = [];
  const si = indexOf(candidate.x, candidate.y, w);
  dist[si] = 0;
  queue.push(si);
  let qh = 0;

  while (qh < queue.length) {
    const cur = queue[qh++];
    const cd = dist[cur];
    if (cd >= 28) continue;
    const x = cur % w;
    const y = (cur / w) | 0;

    const tryCell = ni => {
      if (hazards[ni]) return;
      let nd = cd + 1;
      if (release[ni] > nd) nd = release[ni];
      if (nd <= 28 && nd < dist[ni]) {
        dist[ni] = nd;
        queue.push(ni);
      }
    };

    if (y > 0) tryCell(cur - w);
    if (x > 0) tryCell(cur - 1);
    if (x + 1 < w) tryCell(cur + 1);
    if (y + 1 < h) tryCell(cur + w);
  }

  let count = 0;
  for (let i = 0; i < n; i++) if (dist[i] <= 28) count++;
  return count;
}

function scoreRoyaleMove(state, dirIndex, context) {
  const you = state.you;
  const w = state.width;
  const h = state.height;
  const n = w * h;
  const dir = DIRS[dirIndex];
  const x = you.head.x + dir.dx;
  const y = you.head.y + dir.dy;

  if (!inside(x, y, w, h)) return -1e12 + Math.random();
  const targetIndex = indexOf(x, y, w);
  if (context.hazards[targetIndex]) return -1e12 + Math.random();

  const eat = !!context.foodMask[targetIndex];
  if (!eat && you.health <= 1) return -1e12 + Math.random();
  if (context.occ[targetIndex] > 0) return -1e12 + Math.random();

  const ownTail = you.body[you.body.length - 1];
  if (eat && ownTail && ownTail.x === x && ownTail.y === y) {
    return -1e12 + Math.random();
  }

  const candidate = { x, y };
  const myLength = you.length + (eat ? 1 : 0);
  const myHealth = eat ? 100 : you.health - 1;
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (context.occ[i] > 0) blocked[i] = 1;
  if (eat && ownTail && inside(ownTail.x, ownTail.y, w, h)) {
    blocked[indexOf(ownTail.x, ownTail.y, w)] = 1;
  }
  blocked[targetIndex] = 0;

  const enemySources = [];
  const enemyCanEat = Object.create(null);
  const enemyTailAtTarget = [];

  for (let s = 0; s < state.snakes.length; s++) {
    const enemy = state.snakes[s];
    if (enemy.id === you.id) continue;
    const tail = enemy.body[enemy.body.length - 1];
    if (tail && tail.x === x && tail.y === y) enemyTailAtTarget.push(enemy);

    for (let d = 0; d < 4; d++) {
      const ex = enemy.head.x + DIRS[d].dx;
      const ey = enemy.head.y + DIRS[d].dy;
      if (!inside(ex, ey, w, h)) continue;
      const ei = indexOf(ex, ey, w);
      if (context.hazards[ei]) continue;
      const enemyEat = !!context.foodMask[ei];
      if (!enemyEat && enemy.health <= 1) continue;
      if (context.occ[ei] > 0) continue;

      const enemyTail = enemy.body[enemy.body.length - 1];
      if (enemyEat && enemyTail && enemyTail.x === ex && enemyTail.y === ey) continue;
      if (eat && ownTail && ownTail.x === ex && ownTail.y === ey) continue;

      const newLength = enemy.length + (enemyEat ? 1 : 0);
      enemySources.push({
        x: ex,
        y: ey,
        index: ei,
        length: newLength,
        id: enemy.id,
        eat: enemyEat
      });
      if (enemyEat) enemyCanEat[enemy.id] = true;
    }
  }

  let score = 0;
  let dangerousHeadCount = 0;
  let shorterHeadCount = 0;

  for (let i = 0; i < enemySources.length; i++) {
    const src = enemySources[i];
    if (src.x === x && src.y === y) {
      if (src.length >= myLength) dangerousHeadCount++;
      else shorterHeadCount++;
    }
  }

  if (dangerousHeadCount) score -= 30000000 * dangerousHeadCount;
  if (shorterHeadCount) score += 80 * shorterHeadCount;

  for (let i = 0; i < enemyTailAtTarget.length; i++) {
    if (enemyCanEat[enemyTailAtTarget[i].id]) score -= 1800000;
  }

  const ownDist = bfs(w, h, candidate, blocked, context.hazards);
  let area = 0;
  for (let i = 0; i < n; i++) if (ownDist[i] >= 0) area++;

  const enemyDist = new Int16Array(n);
  const enemyPower = new Int16Array(n);
  enemyDist.fill(-1);
  const queue = new Int16Array(Math.max(n, 1));
  let qh = 0;
  let qt = 0;

  for (let i = 0; i < enemySources.length; i++) {
    const src = enemySources[i];
    if (blocked[src.index] || context.hazards[src.index]) continue;
    if (enemyDist[src.index] < 0) {
      enemyDist[src.index] = 0;
      enemyPower[src.index] = src.length;
      queue[qt++] = src.index;
    } else if (src.length > enemyPower[src.index]) {
      enemyPower[src.index] = src.length;
    }
  }

  while (qh < qt) {
    const cur = queue[qh++];
    const cx = cur % w;
    const cy = (cur / w) | 0;
    const nd = enemyDist[cur] + 1;
    const power = enemyPower[cur];

    const visit = ni => {
      if (context.hazards[ni] || blocked[ni]) return;
      if (enemyDist[ni] < 0) {
        enemyDist[ni] = nd;
        enemyPower[ni] = power;
        queue[qt++] = ni;
      } else if (enemyDist[ni] === nd && power > enemyPower[ni]) {
        enemyPower[ni] = power;
      }
    };

    if (cy > 0) visit(cur - w);
    if (cx > 0) visit(cur - 1);
    if (cx + 1 < w) visit(cur + 1);
    if (cy + 1 < h) visit(cur + w);
  }

  let secure = 0;
  for (let i = 0; i < n; i++) {
    const od = ownDist[i];
    if (od < 0) continue;
    const ed = enemyDist[i];
    if (ed < 0 || od < ed) secure += 1;
    else if (od === ed) {
      if (myLength > enemyPower[i]) secure += 0.75;
      else if (myLength === enemyPower[i]) secure += 0.3;
      else secure += 0.04;
    }
  }

  const ownBody = [{ x, y }];
  for (let i = 0; i < you.body.length; i++) ownBody.push(you.body[i]);
  if (!eat) ownBody.pop();

  const temporalArea = temporalReach(state, candidate, ownBody, context.releaseBase, context.hazards);
  const effectiveArea = Math.max(area, temporalArea * 0.72);

  score += area * 13;
  score += secure * 37;
  score += temporalArea * 5;
  score += myLength * 35;

  if (effectiveArea < myLength + 2) {
    score -= (myLength + 2 - effectiveArea) * 5000;
  } else if (effectiveArea < myLength + 7) {
    score -= (myLength + 7 - effectiveArea) * 450;
  }

  let mobility = 0;
  let saferMobility = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DIRS[d].dx;
    const ny = y + DIRS[d].dy;
    if (!inside(nx, ny, w, h)) continue;
    const ni = indexOf(nx, ny, w);
    if (context.hazards[ni]) continue;
    if (context.releaseBase[ni] > 1) continue;
    mobility++;
    if (enemyDist[ni] < 0 || enemyDist[ni] > 1 || myLength > enemyPower[ni]) saferMobility++;
  }

  score += mobility * 130;
  score += saferMobility * 150;
  if (mobility === 0) score -= 150000;
  else if (saferMobility === 0) score -= 8000;

  let nearestFood = 32767;
  let bestFoodCompetition = 0;
  for (let i = 0; i < state.food.length; i++) {
    const p = state.food[i];
    const fi = indexOf(p.x, p.y, w);
    const d = ownDist[fi];
    if (d >= 0 && d < nearestFood) {
      nearestFood = d;
      bestFoodCompetition = enemyDist[fi];
    }
  }

  if (eat) score += 1250;
  if (nearestFood < 32767) {
    const hunger = 100 - myHealth;
    score += (250 + hunger * 18) / (nearestFood + 1);
    if (myHealth <= 45) score += (46 - myHealth) * 24 / (nearestFood + 1);
    if (nearestFood > myHealth) score -= 2200000;
    else if (bestFoodCompetition >= 0 && bestFoodCompetition <= nearestFood && myHealth < 45) {
      score -= 650 / (nearestFood + 1);
    }
  } else if (myHealth < 12) {
    score -= (12 - myHealth) * 450;
  }

  score += myHealth * 1.2;

  const ring = ringOf(x, y, w, h);
  const margin = ring - context.closed;
  const until = state.nextShrinkTurn - state.turn;
  if (margin >= 0) score += Math.min(margin, 4) * 18;

  if (margin === 0 && until <= 8) {
    score -= (9 - Math.max(0, until)) * 420;
  } else if (margin === 1 && until <= -12) {
    score -= 500;
  }

  const cap = Math.max(0, Math.floor(Math.min(w, h) / 2) - 1);
  if (context.closed < cap && until < 35) {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    score -= (Math.abs(x - cx) + Math.abs(y - cy)) * Math.max(0, 35 - until) * 1.15;
  }

  if (context.previousDir === dirIndex) score += 14;
  score += Math.random() * 2;
  return score;
}

function chooseRoyale(state) {
  const w = state.width;
  const h = state.height;
  const hazards = makeMask(state.hazards, w, h);
  const foodMask = makeMask(state.food, w, h);
  const occ = optimisticOccupancy(state);
  const releaseBase = new Int16Array(w * h);

  for (let s = 0; s < state.snakes.length; s++) {
    const snake = state.snakes[s];
    if (snake.id === state.you.id) continue;
    const len = snake.body.length;
    for (let i = 0; i + 1 < len; i++) {
      const p = snake.body[i];
      if (!inside(p.x, p.y, w, h)) continue;
      const projectedIndex = i + 1;
      const release = len - projectedIndex;
      const k = indexOf(p.x, p.y, w);
      if (release > releaseBase[k]) releaseBase[k] = release;
    }
  }

  let previousDir = -1;
  if (state.you.body.length > 1) {
    const dx = state.you.head.x - state.you.body[1].x;
    const dy = state.you.head.y - state.you.body[1].y;
    for (let i = 0; i < 4; i++) {
      if (DIRS[i].dx === dx && DIRS[i].dy === dy) previousDir = i;
    }
  }

  const context = {
    hazards,
    foodMask,
    occ,
    releaseBase,
    closed: closedRings(w, h, hazards),
    previousDir
  };

  let best = -Infinity;
  let bestDir = previousDir >= 0 ? previousDir : 0;
  for (let d = 0; d < 4; d++) {
    const value = scoreRoyaleMove(state, d, context);
    if (value > best) {
      best = value;
      bestDir = d;
    }
  }
  return DIRS[bestDir].name;
}

function move(state) {
  const start = Date.now();
  if (!state || !state.you || !state.snakes || state.snakes.length === 0) return 'up';
  if (state.snakes.length === 2) return chooseDuel(state, start);
  return chooseRoyale(state);
}

module.exports = {
  name: 'AegisViper',
  move
};
