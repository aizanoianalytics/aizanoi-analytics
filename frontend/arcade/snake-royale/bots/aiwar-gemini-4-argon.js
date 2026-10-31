'use strict';

// ============================================================================
// ArgonRoyale - Tournament AI Bot for Snake Royale
// Combines exact simultaneous body-release horizon mapping, Tarjan biconnected
// articulation/chamber survival analysis, parity-adjusted Voronoi territory,
// and Alpha-Beta Maximin tactical lookahead with opponent-trap detection.
// ============================================================================

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

const MAX_CELLS = 1024;
const bufMyDist = new Int16Array(MAX_CELLS);
const bufOppDist = new Int16Array(MAX_CELLS);
const bufOppLen = new Int16Array(MAX_CELLS);
const bufQueue = new Int16Array(MAX_CELLS);
const bufBlocked = new Uint8Array(MAX_CELLS);
const bufDisc = new Int16Array(MAX_CELLS);
const bufLow = new Int16Array(MAX_CELLS);
const bufSubtree = new Int16Array(MAX_CELLS);
const bufArtic = new Uint8Array(MAX_CELLS);

function analyzeBoard(state) {
  const W = state.width;
  const H = state.height;
  const N = W * H;
  const turn = state.turn || 1;
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : 999999;
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;

  const isHazard = new Uint8Array(N);
  const hazards = state.hazards || [];
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) {
      isHazard[h.y * W + h.x] = 1;
    }
  }

  let currentRing = 0;
  while (currentRing <= maxRing && isHazard[currentRing * W + currentRing]) {
    currentRing++;
  }

  const hasFood = new Uint8Array(N);
  const foodList = state.food || [];
  const uniqueFood = [];
  for (let i = 0; i < foodList.length; i++) {
    const f = foodList[i];
    if (f.x >= 0 && f.y >= 0 && f.x < W && f.y < H) {
      const idx = f.y * W + f.x;
      if (!hasFood[idx] && !isHazard[idx]) {
        hasFood[idx] = 1;
        uniqueFood.push(f);
      }
    }
  }

  const releaseTime = new Int16Array(N);
  const snakeOwner = new Int16Array(N).fill(-1);
  const snakes = state.snakes || [];

  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si];
    const body = s.body || [];
    const L = body.length;
    for (let k = L - 1; k >= 0; k--) {
      const seg = body[k];
      if (seg.x >= 0 && seg.y >= 0 && seg.x < W && seg.y < H) {
        const idx = seg.y * W + seg.x;
        const rel = L - k;
        if (rel > releaseTime[idx]) {
          releaseTime[idx] = rel;
          snakeOwner[idx] = si;
        }
      }
    }
  }

  return {
    W, H, N, turn, nextShrink, maxRing, currentRing,
    isHazard, hasFood, uniqueFood, releaseTime, snakeOwner, snakes
  };
}

function isStep1Safe(board, me, nx, ny) {
  const { W, H, isHazard, hasFood, snakes } = board;
  if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
  const idx = ny * W + nx;
  if (isHazard[idx]) return false;

  const weEat = hasFood[idx] === 1;
  if (me.health <= 1 && !weEat) return false;

  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si];
    const body = s.body;
    const L = body.length;
    const limit = (s.id === me.id && weEat) ? L : L - 1;
    for (let k = 0; k < limit; k++) {
      if (body[k].x === nx && body[k].y === ny) return false;
    }
  }
  return true;
}

function isRiskyOpponentTail(board, me, nx, ny) {
  const { W, H, hasFood, snakes } = board;
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si];
    if (s.id === me.id) continue;
    const body = s.body;
    const L = body.length;
    if (L === 0) continue;
    const tail = body[L - 1];
    if (tail.x === nx && tail.y === ny) {
      const hx = body[0].x, hy = body[0].y;
      for (let d = 0; d < 4; d++) {
        const ox = hx + DIRS[d].dx, oy = hy + DIRS[d].dy;
        if (ox >= 0 && oy >= 0 && ox < W && oy < H && hasFood[oy * W + ox]) {
          return true;
        }
      }
    }
  }
  return false;
}

function findArticulationAndChambers(W, H, N, startIdx, passable) {
  bufDisc.fill(0, 0, N);
  bufLow.fill(0, 0, N);
  bufSubtree.fill(0, 0, N);
  bufArtic.fill(0, 0, N);

  let timer = 1;
  bufDisc[startIdx] = timer;
  bufLow[startIdx] = timer;
  bufSubtree[startIdx] = 1;

  function dfs(u, p) {
    let children = 0;
    const ux = u % W, uy = (u - ux) / W;
    for (let d = 0; d < 4; d++) {
      const vx = ux + DIRS[d].dx, vy = uy + DIRS[d].dy;
      if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx;
      if (v === p || !passable[v]) continue;
      if (bufDisc[v] !== 0) {
        if (bufDisc[v] < bufLow[u]) bufLow[u] = bufDisc[v];
      } else {
        children++;
        timer++;
        bufDisc[v] = timer;
        bufLow[v] = timer;
        bufSubtree[v] = 1;
        dfs(v, u);
        bufSubtree[u] += bufSubtree[v];
        if (bufLow[v] < bufLow[u]) bufLow[u] = bufLow[v];
        if (p !== -1 && bufLow[v] >= bufDisc[u]) {
          bufArtic[u] = 1;
        }
      }
    }
    if (p === -1 && children > 1) {
      bufArtic[u] = 1;
    }
  }

  dfs(startIdx, -1);
}

function evaluatePosition(board, myHeadX, myHeadY, myLength, myHealth, weAteStep1, stepOffset, activeRivals) {
  const { W, H, N, isHazard, hasFood, uniqueFood, releaseTime, meSnake, meIndex } = board;
  const INF = 999999;
  const startIdx = myHeadY * W + myHeadX;

  const myDist = new Int32Array(N).fill(INF);
  const passable = new Uint8Array(N);
  const rivalHeadDanger = new Uint8Array(N);

  for (let r = 0; r < activeRivals.length; r++) {
    const rv = activeRivals[r];
    for (let d = 0; d < 4; d++) {
      const rx = rv.x + DIRS[d].dx, ry = rv.y + DIRS[d].dy;
      if (rx >= 0 && ry >= 0 && rx < W && ry < H) {
        const rIdx = ry * W + rx;
        const rLenAfter = rv.length + (hasFood[rIdx] ? 1 : 0);
        if (rLenAfter >= myLength) {
          rivalHeadDanger[rIdx] = 2;
        } else if (rivalHeadDanger[rIdx] === 0) {
          rivalHeadDanger[rIdx] = 1;
        }
      }
    }
  }

  let qh = 0, qt = 0;
  myDist[startIdx] = 0;
  passable[startIdx] = 1;
  bufQueue[qt++] = startIdx;

  let canReachOwnTail = false;
  const myTail = meSnake.body[meSnake.body.length - 1];
  const myTailIdx = myTail.y * W + myTail.x;

  while (qh < qt) {
    const u = bufQueue[qh++];
    const ux = u % W, uy = (u - ux) / W;
    const nextD = myDist[u] + 1;
    const stepAtNext = stepOffset + nextD;

    for (let d = 0; d < 4; d++) {
      const vx = ux + DIRS[d].dx, vy = uy + DIRS[d].dy;
      if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx;
      if (isHazard[v] || myDist[v] !== INF) continue;

      let reqStep = releaseTime[v];
      if (weAteStep1 && reqStep > 0 && board.snakeOwner[v] === meIndex) {
        reqStep += 1;
      }
      if (stepAtNext < reqStep) continue;

      myDist[v] = nextD;
      passable[v] = 1;
      if (v === myTailIdx) canReachOwnTail = true;
      bufQueue[qt++] = v;
    }
  }

  const reachableCount = qt;

  findArticulationAndChambers(W, H, N, startIdx, passable);

  const oppDist = new Int32Array(N).fill(INF);
  const oppLenAt = new Int16Array(N);
  let oqh = 0, oqt = 0;
  for (let r = 0; r < activeRivals.length; r++) {
    const rv = activeRivals[r];
    const rIdx = rv.y * W + rv.x;
    if (rIdx >= 0 && rIdx < N) {
      oppDist[rIdx] = 0;
      oppLenAt[rIdx] = rv.length;
      bufQueue[oqt++] = rIdx;
    }
  }

  while (oqh < oqt) {
    const u = bufQueue[oqh++];
    const ux = u % W, uy = (u - ux) / W;
    const nextD = oppDist[u] + 1;
    const uLen = oppLenAt[u];
    for (let d = 0; d < 4; d++) {
      const vx = ux + DIRS[d].dx, vy = uy + DIRS[d].dy;
      if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx;
      if (isHazard[v]) continue;
      if (nextD < releaseTime[v]) continue;
      if (oppDist[v] === INF) {
        oppDist[v] = nextD;
        oppLenAt[v] = uLen;
        bufQueue[oqt++] = v;
      } else if (oppDist[v] === nextD && uLen > oppLenAt[v]) {
        oppLenAt[v] = uLen;
      }
    }
  }

  let myTerritory = 0;
  let safeReachable = 0;
  let evenCells = 0, oddCells = 0;
  const startParity = (myHeadX + myHeadY) & 1;

  for (let i = 0; i < N; i++) {
    const md = myDist[i];
    if (md === INF) continue;
    const x = i % W, y = (i - x) / W;
    if (((x + y) & 1) === startParity) evenCells++;
    else oddCells++;

    if (md > 1 || rivalHeadDanger[i] < 2) {
      safeReachable++;
    }

    const myStep = md + stepOffset;
    const od = oppDist[i];
    if (myStep < od) {
      myTerritory += 1.0;
    } else if (myStep === od) {
      if (myLength > oppLenAt[i]) myTerritory += 0.75;
      else if (myLength === oppLenAt[i]) myTerritory += 0.25;
    }
  }

  const paritySpace = 2 * Math.min(evenCells, oddCells) + (oddCells > evenCells ? 1 : 0);
  const effectiveSpace = Math.min(reachableCount, paritySpace + 2);

  let canReachAnyTail = canReachOwnTail;
  if (!canReachAnyTail) {
    for (let si = 0; si < board.snakes.length; si++) {
      const s = board.snakes[si];
      if (s.body.length > 0) {
        const tl = s.body[s.body.length - 1];
        const tIdx = tl.y * W + tl.x;
        if (myDist[tIdx] !== INF) {
          canReachAnyTail = true;
          break;
        }
      }
    }
  }

  let onwardMoves = 0;
  let safeOnwardMoves = 0;
  for (let d = 0; d < 4; d++) {
    const nx = myHeadX + DIRS[d].dx, ny = myHeadY + DIRS[d].dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const nIdx = ny * W + nx;
    if (isHazard[nIdx]) continue;
    let req = releaseTime[nIdx];
    if (weAteStep1 && req > 0 && board.snakeOwner[nIdx] === meIndex) req += 1;
    if (stepOffset + 1 >= req) {
      onwardMoves++;
      if (rivalHeadDanger[nIdx] < 2) safeOnwardMoves++;
    }
  }

  let minFoodDist = INF;
  let uncontestedFoodDist = INF;
  for (let i = 0; i < uniqueFood.length; i++) {
    const f = uniqueFood[i];
    const fIdx = f.y * W + f.x;
    const d = myDist[fIdx];
    if (d === INF) continue;
    if (d < minFoodDist) minFoodDist = d;
    const myStep = d + stepOffset;
    const od = oppDist[fIdx];
    if (myStep < od || (myStep === od && myLength > oppLenAt[fIdx])) {
      if (d < uncontestedFoodDist) uncontestedFoodDist = d;
    }
  }

  return {
    reachableCount,
    safeReachable,
    effectiveSpace,
    myTerritory,
    canReachOwnTail,
    canReachAnyTail,
    onwardMoves,
    safeOnwardMoves,
    minFoodDist,
    uncontestedFoodDist
  };
}

function cloneSimSnakes(snakes) {
  const res = new Array(snakes.length);
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    const b = new Int16Array(s.body.length * 2);
    for (let k = 0; k < s.body.length; k++) {
      b[k * 2] = s.body[k].x;
      b[k * 2 + 1] = s.body[k].y;
    }
    res[i] = {
      id: s.id,
      body: b,
      length: s.body.length,
      health: s.health,
      alive: true
    };
  }
  return res;
}

function stepSim(W, H, isHazard, hasFood, simSnakes, moveDirs, turn, nextShrink, currentRing, maxRing) {
  const num = simSnakes.length;
  const newSnakes = new Array(num);
  let anyAte = false;
  const ateMask = new Uint8Array(num);

  for (let i = 0; i < num; i++) {
    const s = simSnakes[i];
    if (!s.alive) {
      newSnakes[i] = s;
      continue;
    }
    const dir = DIRS[moveDirs[i]];
    const hx = s.body[0] + dir.dx;
    const hy = s.body[1] + dir.dy;
    const newHealth = s.health - 1;

    let eats = false;
    if (hx >= 0 && hy >= 0 && hx < W && hy < H && hasFood[hy * W + hx]) {
      eats = true;
      anyAte = true;
      ateMask[i] = 1;
    }

    const newLen = eats ? s.length + 1 : s.length;
    const newBody = new Int16Array(newLen * 2);
    newBody[0] = hx;
    newBody[1] = hy;
    const copySegments = eats ? s.length : s.length - 1;
    for (let k = 0; k < copySegments; k++) {
      newBody[(k + 1) * 2] = s.body[k * 2];
      newBody[(k + 1) * 2 + 1] = s.body[k * 2 + 1];
    }

    newSnakes[i] = {
      id: s.id,
      body: newBody,
      length: newLen,
      health: eats ? 100 : newHealth,
      alive: true
    };
  }

  const dead = new Uint8Array(num);
  for (let i = 0; i < num; i++) {
    const s = newSnakes[i];
    if (!s.alive) continue;
    const hx = s.body[0], hy = s.body[1];
    if (hx < 0 || hy < 0 || hx >= W || hy >= H || isHazard[hy * W + hx] || s.health <= 0) {
      dead[i] = 1;
      continue;
    }
    let hitBody = false;
    for (let j = 0; j < num; j++) {
      const t = newSnakes[j];
      if (!t.alive) continue;
      for (let k = 1; k < t.length; k++) {
        if (t.body[k * 2] === hx && t.body[k * 2 + 1] === hy) {
          hitBody = true;
          break;
        }
      }
      if (hitBody) break;
    }
    if (hitBody) {
      dead[i] = 1;
      continue;
    }
    for (let j = 0; j < num; j++) {
      if (i === j) continue;
      const t = newSnakes[j];
      if (!t.alive) continue;
      if (t.body[0] === hx && t.body[1] === hy && t.length >= s.length) {
        dead[i] = 1;
        break;
      }
    }
  }

  for (let i = 0; i < num; i++) {
    if (dead[i]) newSnakes[i].alive = false;
  }

  let newFood = hasFood;
  if (anyAte) {
    newFood = new Uint8Array(hasFood);
    for (let i = 0; i < num; i++) {
      if (ateMask[i]) {
        const hx = newSnakes[i].body[0], hy = newSnakes[i].body[1];
        newFood[hy * W + hx] = 0;
      }
    }
  }

  let newHazard = isHazard;
  let newRing = currentRing;
  if (turn === nextShrink && currentRing < maxRing) {
    newRing = currentRing + 1;
    newHazard = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < newRing || y < newRing || x >= W - newRing || y >= H - newRing) {
          newHazard[y * W + x] = 1;
        }
      }
    }
  }

  return {
    snakes: newSnakes,
    hasFood: newFood,
    isHazard: newHazard,
    currentRing: newRing,
    turn: turn + 1,
    nextShrink: turn === nextShrink ? nextShrink + 20 : nextShrink
  };
}

function evalSimState(W, H, simState, meIdx) {
  const snakes = simState.snakes;
  const me = snakes[meIdx];
  if (!me.alive) return -100000 - me.length * 10;

  let aliveRivals = 0;
  let maxRivalLen = 0;
  for (let i = 0; i < snakes.length; i++) {
    if (i !== meIdx && snakes[i].alive) {
      aliveRivals++;
      if (snakes[i].length > maxRivalLen) maxRivalLen = snakes[i].length;
    }
  }
  if (aliveRivals === 0 && snakes.length > 1) {
    return 100000 + me.length * 10 + me.health;
  }

  const N = W * H;
  const isHazard = simState.isHazard;
  for (let i = 0; i < N; i++) {
    bufBlocked[i] = isHazard[i];
    bufMyDist[i] = 9999;
    bufOppDist[i] = 9999;
    bufOppLen[i] = 0;
  }

  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    if (!s.alive) continue;
    const limit = s.length - 1;
    for (let k = 0; k < limit; k++) {
      const bx = s.body[k * 2], by = s.body[k * 2 + 1];
      if (bx >= 0 && by >= 0 && bx < W && by < H) {
        bufBlocked[by * W + bx] = 1;
      }
    }
  }

  const mhx = me.body[0], mhy = me.body[1];
  const mStart = mhy * W + mhx;
  bufMyDist[mStart] = 0;
  let qh = 0, qt = 0;
  bufQueue[qt++] = mStart;

  while (qh < qt) {
    const u = bufQueue[qh++];
    const ux = u % W, uy = (u - ux) / W;
    const nd = bufMyDist[u] + 1;
    for (let d = 0; d < 4; d++) {
      const vx = ux + DIRS[d].dx, vy = uy + DIRS[d].dy;
      if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx;
      if (bufBlocked[v] || bufMyDist[v] !== 9999) continue;
      bufMyDist[v] = nd;
      bufQueue[qt++] = v;
    }
  }
  const myReach = qt;

  qh = 0; qt = 0;
  for (let i = 0; i < snakes.length; i++) {
    if (i === meIdx || !snakes[i].alive) continue;
    const s = snakes[i];
    const idx = s.body[1] * W + s.body[0];
    bufOppDist[idx] = 0;
    bufOppLen[idx] = s.length;
    bufQueue[qt++] = idx;
  }

  let oppReach = 0;
  while (qh < qt) {
    const u = bufQueue[qh++];
    const ux = u % W, uy = (u - ux) / W;
    const nd = bufOppDist[u] + 1;
    const ul = bufOppLen[u];
    for (let d = 0; d < 4; d++) {
      const vx = ux + DIRS[d].dx, vy = uy + DIRS[d].dy;
      if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx;
      if (bufBlocked[v]) continue;
      if (bufOppDist[v] === 9999) {
        bufOppDist[v] = nd;
        bufOppLen[v] = ul;
        oppReach++;
        bufQueue[qt++] = v;
      } else if (bufOppDist[v] === nd && ul > bufOppLen[v]) {
        bufOppLen[v] = ul;
      }
    }
  }

  let myVoronoi = 0;
  let oppVoronoi = 0;
  let minFoodDist = 9999;
  const hasFood = simState.hasFood;

  for (let i = 0; i < N; i++) {
    const md = bufMyDist[i];
    const od = bufOppDist[i];
    if (md < 9999) {
      if (hasFood[i] && md < minFoodDist) minFoodDist = md;
      if (md < od) myVoronoi += 1.0;
      else if (md === od) {
        if (me.length > bufOppLen[i]) myVoronoi += 0.7;
        else if (me.length === bufOppLen[i]) myVoronoi += 0.3;
        else oppVoronoi += 0.7;
      } else {
        oppVoronoi += 1.0;
      }
    } else if (od < 9999) {
      oppVoronoi += 1.0;
    }
  }

  let score = 0;
  const myTailX = me.body[(me.length - 1) * 2];
  const myTailY = me.body[(me.length - 1) * 2 + 1];
  const tailReachable = bufMyDist[myTailY * W + myTailX] < 9999;

  if (myReach < me.length && !tailReachable) {
    score -= 4000 + (me.length - myReach) * 250;
  }

  if (snakes.length === 2 && oppReach < maxRivalLen) {
    score += 2500 + (maxRivalLen - oppReach) * 150;
  }

  score += myVoronoi * 6.0 - oppVoronoi * 2.5;
  score += Math.min(myReach, 60) * 1.5;

  const lenDiff = me.length - maxRivalLen;
  if (lenDiff > 0) score += 80 + Math.min(lenDiff, 6) * 25;
  else if (lenDiff === 0) score -= 20;
  else score -= 60 + Math.min(-lenDiff, 6) * 30;

  if (me.health < 35 || lenDiff <= 0) {
    const urgency = me.health < 20 ? 5.0 : me.health < 40 ? 2.5 : (lenDiff <= 0 ? 1.8 : 0.6);
    if (minFoodDist < 9999 && minFoodDist < me.health) {
      score += (urgency * 35) / (minFoodDist + 1);
    } else if (me.health < 25) {
      score -= 500;
    }
  }
  score += me.health * 0.3;

  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const nextRing = simState.currentRing + 1;
  const turnsToShrink = simState.nextShrink - simState.turn;
  if (turnsToShrink <= 15 && simState.currentRing < Math.floor(Math.min(W, H) / 2) - 1) {
    if (mhx < nextRing || mhy < nextRing || mhx >= W - nextRing || mhy >= H - nextRing) {
      score -= (16 - Math.max(0, turnsToShrink)) * 35;
    }
  }
  score -= (Math.abs(mhx - cx) + Math.abs(mhy - cy)) * 0.8;

  return score;
}

function getLegalSimDirs(W, H, simState, snakeIdx) {
  const s = simState.snakes[snakeIdx];
  const hx = s.body[0], hy = s.body[1];
  const isHazard = simState.isHazard;
  const hasFood = simState.hasFood;
  const snakes = simState.snakes;
  const valid = [];

  for (let d = 0; d < 4; d++) {
    const nx = hx + DIRS[d].dx, ny = hy + DIRS[d].dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const idx = ny * W + nx;
    if (isHazard[idx]) continue;
    const eats = hasFood[idx] === 1;
    if (s.health <= 1 && !eats) continue;

    let hit = false;
    for (let j = 0; j < snakes.length; j++) {
      const t = snakes[j];
      if (!t.alive) continue;
      const limit = (j === snakeIdx && eats) ? t.length : t.length - 1;
      for (let k = 0; k < limit; k++) {
        if (t.body[k * 2] === nx && t.body[k * 2 + 1] === ny) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) valid.push(d);
  }
  return valid;
}

function searchMaximin(W, H, simState, meIdx, rivalIndices, depth, alpha, beta) {
  const me = simState.snakes[meIdx];
  if (!me.alive || depth === 0) {
    return evalSimState(W, H, simState, meIdx);
  }

  let anyRivalAlive = false;
  for (let i = 0; i < rivalIndices.length; i++) {
    if (simState.snakes[rivalIndices[i]].alive) {
      anyRivalAlive = true;
      break;
    }
  }
  if (!anyRivalAlive && rivalIndices.length > 0) {
    return evalSimState(W, H, simState, meIdx);
  }

  const myMoves = getLegalSimDirs(W, H, simState, meIdx);
  if (myMoves.length === 0) {
    return -100000 - depth * 1000;
  }

  const numSnakes = simState.snakes.length;
  const oppMoveLists = new Array(numSnakes);
  for (let i = 0; i < numSnakes; i++) {
    if (i === meIdx || !simState.snakes[i].alive) continue;
    const mvs = getLegalSimDirs(W, H, simState, i);
    oppMoveLists[i] = mvs.length > 0 ? mvs : [0];
  }

  let bestVal = -Infinity;
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;

  for (let m = 0; m < myMoves.length; m++) {
    const myDir = myMoves[m];
    let worstForMyMove = Infinity;

    const primaryRivals = [];
    const fixedDirs = new Int8Array(numSnakes);
    fixedDirs[meIdx] = myDir;

    for (let i = 0; i < numSnakes; i++) {
      if (i === meIdx || !simState.snakes[i].alive) continue;
      if (rivalIndices.indexOf(i) !== -1 && primaryRivals.length < 2) {
        primaryRivals.push(i);
      } else {
        fixedDirs[i] = oppMoveLists[i][0];
      }
    }

    if (primaryRivals.length === 0) {
      const nextState = stepSim(
        W, H, simState.isHazard, simState.hasFood, simState.snakes,
        fixedDirs, simState.turn, simState.nextShrink, simState.currentRing, maxRing
      );
      worstForMyMove = searchMaximin(W, H, nextState, meIdx, rivalIndices, depth - 1, alpha, beta);
    } else if (primaryRivals.length === 1) {
      const r0 = primaryRivals[0];
      const r0Moves = oppMoveLists[r0];
      for (let a = 0; a < r0Moves.length; a++) {
        fixedDirs[r0] = r0Moves[a];
        const nextState = stepSim(
          W, H, simState.isHazard, simState.hasFood, simState.snakes,
          fixedDirs, simState.turn, simState.nextShrink, simState.currentRing, maxRing
        );
        const val = searchMaximin(W, H, nextState, meIdx, rivalIndices, depth - 1, alpha, Math.min(beta, worstForMyMove));
        if (val < worstForMyMove) worstForMyMove = val;
        if (worstForMyMove <= alpha) break;
      }
    } else {
      const r0 = primaryRivals[0], r1 = primaryRivals[1];
      const r0Moves = oppMoveLists[r0], r1Moves = oppMoveLists[r1];
      let cutoff = false;
      for (let a = 0; a < r0Moves.length && !cutoff; a++) {
        fixedDirs[r0] = r0Moves[a];
        for (let b = 0; b < r1Moves.length; b++) {
          fixedDirs[r1] = r1Moves[b];
          const nextState = stepSim(
            W, H, simState.isHazard, simState.hasFood, simState.snakes,
            fixedDirs, simState.turn, simState.nextShrink, simState.currentRing, maxRing
          );
          const val = searchMaximin(W, H, nextState, meIdx, rivalIndices, depth - 1, alpha, Math.min(beta, worstForMyMove));
          if (val < worstForMyMove) worstForMyMove = val;
          if (worstForMyMove <= alpha) {
            cutoff = true;
            break;
          }
        }
      }
    }

    if (worstForMyMove > bestVal) bestVal = worstForMyMove;
    if (bestVal > alpha) alpha = bestVal;
    if (alpha >= beta) break;
  }

  return bestVal;
}

function decide(state) {
  if (!state || !state.you || !state.you.head) return 'up';

  const me = state.you;
  const board = analyzeBoard(state);
  const { W, H, turn, nextShrink, currentRing, maxRing, hasFood, snakes } = board;

  let meIndex = 0;
  for (let i = 0; i < snakes.length; i++) {
    if (snakes[i].id === me.id) {
      meIndex = i;
      break;
    }
  }
  board.meSnake = me;
  board.meIndex = meIndex;

  const rivals = [];
  let maxRivalLen = 0;
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    if (s.id !== me.id && s.body && s.body.length > 0) {
      rivals.push({
        id: s.id,
        index: i,
        x: s.head.x,
        y: s.head.y,
        length: s.length || s.body.length,
        health: s.health,
        body: s.body
      });
      if (s.length > maxRivalLen) maxRivalLen = s.length;
    }
  }

  const candidates = [];
  for (let d = 0; d < 4; d++) {
    const dir = DIRS[d];
    const nx = me.head.x + dir.dx;
    const ny = me.head.y + dir.dy;
    if (isStep1Safe(board, me, nx, ny)) {
      candidates.push({ d, name: dir.name, nx, ny });
    }
  }

  if (candidates.length === 0) {
    for (let d = 0; d < 4; d++) {
      const nx = me.head.x + DIRS[d].dx, ny = me.head.y + DIRS[d].dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !board.isHazard[ny * W + nx]) {
        return DIRS[d].name;
      }
    }
    return 'up';
  }
  if (candidates.length === 1) {
    return candidates[0].name;
  }

  const closeRivals = rivals
    .map(r => ({
      index: r.index,
      dist: Math.abs(r.x - me.head.x) + Math.abs(r.y - me.head.y),
      length: r.length
    }))
    .sort((a, b) => a.dist - b.dist);

  const searchRivalIndices = [];
  for (let i = 0; i < closeRivals.length && i < 2; i++) {
    if (closeRivals[i].dist <= 8 || rivals.length === 1) {
      searchRivalIndices.push(closeRivals[i].index);
    }
  }

  const searchDepth = searchRivalIndices.length <= 1 ? 3 : 2;
  const baseSimState = {
    snakes: cloneSimSnakes(snakes),
    hasFood: board.hasFood,
    isHazard: board.isHazard,
    currentRing: board.currentRing,
    turn: board.turn,
    nextShrink: board.nextShrink
  };

  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  let bestMove = candidates[0].name;
  let bestScore = -Infinity;

  for (let c = 0; c < candidates.length; c++) {
    const cand = candidates[c];
    const { d, name, nx, ny } = cand;
    const idx = ny * W + nx;
    const weEat = hasFood[idx] === 1;
    const myNewLen = me.length + (weEat ? 1 : 0);
    const myNewHealth = weEat ? 100 : me.health - 1;

    const ev = evaluatePosition(board, nx, ny, myNewLen, myNewHealth, weEat, 1, rivals);
    let score = 0;

    // 1. Immediate head-on collision risk assessment
    let lethalHeadOnCount = 0;
    let winningHeadOnCount = 0;
    let rivalMustHitUs = false;

    for (let r = 0; r < rivals.length; r++) {
      const rv = rivals[r];
      const man = Math.abs(rv.x - nx) + Math.abs(rv.y - ny);
      if (man === 1) {
        const rvLenIfThere = rv.length + (weEat ? 1 : 0);
        if (rvLenIfThere >= myNewLen) {
          lethalHeadOnCount++;
          const rvSafeMoves = getLegalSimDirs(W, H, baseSimState, rv.index);
          if (rvSafeMoves.length <= 1) rivalMustHitUs = true;
        } else {
          winningHeadOnCount++;
        }
      }
    }

    if (rivalMustHitUs) {
      score -= 25000;
    } else if (lethalHeadOnCount > 0) {
      score -= 7500 + (lethalHeadOnCount - 1) * 2000;
    }
    if (winningHeadOnCount > 0) {
      score += winningHeadOnCount * 85;
    }

    // 2. Risky opponent tail (opponent tail that stays if opponent eats this turn)
    if (isRiskyOpponentTail(board, me, nx, ny)) {
      score -= 6500;
    }

    // 3. Space, pocket & tail-chase survival analysis
    if (ev.onwardMoves === 0 && rivals.length > 0) {
      score -= 30000;
    } else if (ev.safeOnwardMoves === 0 && ev.onwardMoves > 0 && lethalHeadOnCount === 0) {
      score -= 4500;
    }

    if (ev.effectiveSpace < myNewLen) {
      if (ev.canReachOwnTail) {
        score -= 250 + (myNewLen - ev.effectiveSpace) * 20;
      } else if (ev.canReachAnyTail) {
        score -= 800 + (myNewLen - ev.effectiveSpace) * 50;
      } else {
        score -= 12000 + (myNewLen - ev.effectiveSpace) * 400;
      }
    } else if (ev.effectiveSpace < myNewLen * 1.6 && !ev.canReachAnyTail) {
      score -= 400 + (myNewLen * 1.6 - ev.effectiveSpace) * 35;
    }

    if (ev.canReachOwnTail) {
      score += 45;
    }

    // 4. Territory and openness
    score += ev.myTerritory * 5.0;
    score += Math.min(ev.effectiveSpace, 80) * 1.2;
    score += ev.safeOnwardMoves * 18;

    // 5. Food & growth strategy
    const isDuel = rivals.length === 1;
    const lenDeficit = maxRivalLen - me.length;
    let foodUrgency = 1.0;
    if (me.health <= 25) {
      foodUrgency = 8.0;
    } else if (me.health <= 45) {
      foodUrgency = 3.5;
    } else if (isDuel && lenDeficit >= 0) {
      foodUrgency = 2.8;
    } else if (!isDuel && lenDeficit >= 2) {
      foodUrgency = 1.6;
    } else if (me.length < 8) {
      foodUrgency = 1.4;
    } else {
      foodUrgency = 0.6;
    }

    if (weEat) {
      if (ev.effectiveSpace >= myNewLen || ev.canReachOwnTail) {
        score += foodUrgency * 45;
      } else {
        score -= 2000;
      }
    } else if (ev.uncontestedFoodDist < 999) {
      if (ev.uncontestedFoodDist < me.health) {
        score += (foodUrgency * 36) / (ev.uncontestedFoodDist + 1);
      }
    } else if (ev.minFoodDist < 999) {
      if (ev.minFoodDist < me.health) {
        score += (foodUrgency * 18) / (ev.minFoodDist + 1);
      } else {
        score -= 500;
      }
    }

    // 6. Storm & ring shrink awareness
    const nextRing = Math.min(maxRing, currentRing + 1);
    const turnsUntilShrink = nextShrink - turn;
    const distFromSafeEdge = Math.min(
      nx - currentRing,
      ny - currentRing,
      W - 1 - currentRing - nx,
      H - 1 - currentRing - ny
    );

    if (currentRing < maxRing && turnsUntilShrink <= 20) {
      if (distFromSafeEdge === 0) {
        if (turnsUntilShrink === 0) {
          let inwardSafe = 0;
          for (let idir = 0; idir < 4; idir++) {
            const inx = nx + DIRS[idir].dx, iny = ny + DIRS[idir].dy;
            if (inx >= nextRing && iny >= nextRing && inx < W - nextRing && iny < H - nextRing) {
              const iIdx = iny * W + inx;
              if (board.releaseTime[iIdx] <= 2) inwardSafe++;
            }
          }
          if (inwardSafe === 0) score -= 18000;
          else score -= 350;
        } else {
          score -= Math.max(10, (21 - turnsUntilShrink) * 14);
        }
      } else if (distFromSafeEdge === 1 && turnsUntilShrink <= 8) {
        score -= (9 - turnsUntilShrink) * 8;
      }
    }

    const centerDist = Math.abs(nx - cx) + Math.abs(ny - cy);
    score -= centerDist * (currentRing > 0 || turnsUntilShrink <= 30 ? 1.2 : 0.4);

    if (distFromSafeEdge === 0) {
      score -= 12;
    }

    // 7. Tactical lookahead via Simultaneous Maximin Search
    const numSnakes = snakes.length;
    const fixedDirs = new Int8Array(numSnakes);
    fixedDirs[meIndex] = d;

    const oppMoveLists = new Array(numSnakes);
    for (let i = 0; i < numSnakes; i++) {
      if (i === meIndex) continue;
      const mvs = getLegalSimDirs(W, H, baseSimState, i);
      oppMoveLists[i] = mvs.length > 0 ? mvs : [0];
      fixedDirs[i] = oppMoveLists[i][0];
    }

    let minSearchScore = Infinity;
    if (searchRivalIndices.length === 0) {
      const nextSim = stepSim(
        W, H, baseSimState.isHazard, baseSimState.hasFood, baseSimState.snakes,
        fixedDirs, baseSimState.turn, baseSimState.nextShrink, baseSimState.currentRing, maxRing
      );
      minSearchScore = searchMaximin(W, H, nextSim, meIndex, searchRivalIndices, searchDepth - 1, -Infinity, Infinity);
    } else if (searchRivalIndices.length === 1) {
      const r0 = searchRivalIndices[0];
      const r0Moves = oppMoveLists[r0];
      for (let a = 0; a < r0Moves.length; a++) {
        fixedDirs[r0] = r0Moves[a];
        const nextSim = stepSim(
          W, H, baseSimState.isHazard, baseSimState.hasFood, baseSimState.snakes,
          fixedDirs, baseSimState.turn, baseSimState.nextShrink, baseSimState.currentRing, maxRing
        );
        const val = searchMaximin(W, H, nextSim, meIndex, searchRivalIndices, searchDepth - 1, -Infinity, minSearchScore);
        if (val < minSearchScore) minSearchScore = val;
      }
    } else {
      const r0 = searchRivalIndices[0], r1 = searchRivalIndices[1];
      const r0Moves = oppMoveLists[r0], r1Moves = oppMoveLists[r1];
      for (let a = 0; a < r0Moves.length; a++) {
        fixedDirs[r0] = r0Moves[a];
        for (let b = 0; b < r1Moves.length; b++) {
          fixedDirs[r1] = r1Moves[b];
          const nextSim = stepSim(
            W, H, baseSimState.isHazard, baseSimState.hasFood, baseSimState.snakes,
            fixedDirs, baseSimState.turn, baseSimState.nextShrink, baseSimState.currentRing, maxRing
          );
          const val = searchMaximin(W, H, nextSim, meIndex, searchRivalIndices, searchDepth - 1, -Infinity, minSearchScore);
          if (val < minSearchScore) minSearchScore = val;
        }
      }
    }

    if (minSearchScore < Infinity) {
      score += minSearchScore * 0.45;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = name;
    }
  }

  return bestMove;
}

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

module.exports = { name: 'ArgonRoyale', move };
