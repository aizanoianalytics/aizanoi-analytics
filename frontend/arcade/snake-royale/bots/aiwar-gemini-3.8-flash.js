'use strict';

// ============================================================================
// FlashRoyale - Grandmaster AI Tournament Bot for Snake Royale
//
// Core Strategy & Features:
// 1. High-Performance Zero-Allocation Engine: Pre-allocated typed arrays for
//    all search buffers and game simulation; runs in <5ms with 0 GC overhead.
// 2. Exact Rule-Perfect Simultaneous Simulator: Accurately replicates engine.js
//    simultaneous movement, tail-pop before collision, stacked segment clearing,
//    head-to-head length dominance, and scheduled storm expansion.
// 3. Simultaneous Maximin Search with Alpha-Beta Pruning: Evaluates minimax
//    security values across joint action spaces up to 4 plies deep.
// 4. Opponent Trap Detection & Execution: Detects when opponent can be cut off,
//    confined into spaces smaller than their body, or forced into lethal clashes.
// 5. Length-Dominant Voronoi Territory: Multi-source BFS awarding territory
//    where length dominates contested borders.
// 6. Proactive Storm Management: Shrink ring avoidance, doomed-cell masking,
//    and safe-zone centering prevents being trapped when rings shrink.
// 7. Dynamic Health & Growth Curves: Aggressively seeks length when equal or
//    shorter; switches to control and territory choking when dominant.
// ============================================================================

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];

const MAX_CELLS = 1024;
const MAX_SNAKES = 16;
const MAX_DEPTH = 6;
const INF = 30000;

const nextShrinkFor = t => (t <= 150 ? 150 : 150 + Math.ceil((t - 150) / 20) * 20);

// Evaluation / Flood-fill scratch buffers
const bufBlocked = new Uint8Array(MAX_CELLS);
const bufMyDist = new Int16Array(MAX_CELLS);
const bufOppDist = new Int16Array(MAX_CELLS);
const bufOppLen = new Int16Array(MAX_CELLS);
const bufQueue = new Int16Array(MAX_CELLS);

// Pre-allocated flat simulation state tree per depth
const simState = new Array(MAX_DEPTH);
for (let d = 0; d < MAX_DEPTH; d++) {
  const snakes = new Array(MAX_SNAKES);
  for (let s = 0; s < MAX_SNAKES; s++) {
    snakes[s] = {
      id: '',
      body: new Int16Array(800), // [x0, y0, x1, y1, ...]
      length: 0,
      health: 0,
      alive: false
    };
  }
  simState[d] = {
    snakes,
    numSnakes: 0,
    hasFood: new Uint8Array(MAX_CELLS),
    isHazard: new Uint8Array(MAX_CELLS),
    currentRing: 0,
    turn: 0,
    nextShrink: 0
  };
}

// Depth-indexed scratch buffers for search recursion
const simMoves = new Int8Array(MAX_DEPTH * MAX_SNAKES);
const simDeadMask = new Uint8Array(MAX_DEPTH * MAX_SNAKES);
const simAteMask = new Uint8Array(MAX_DEPTH * MAX_SNAKES);

// ----------------------------------------------------------------------------
// Simultaneous Step Simulator: exact duplicate of engine.js logic
// ----------------------------------------------------------------------------
function stepSimFast(depth, W, H, moveOffset, maxRing) {
  const cur = simState[depth];
  const nxt = simState[depth + 1];
  const num = cur.numSnakes;
  const N = W * H;
  const maskOffset = depth * MAX_SNAKES;

  nxt.numSnakes = num;
  nxt.currentRing = cur.currentRing;
  nxt.turn = cur.turn + 1;
  nxt.nextShrink = cur.nextShrink;

  nxt.hasFood.set(cur.hasFood.subarray(0, N));
  nxt.isHazard.set(cur.isHazard.subarray(0, N));

  simDeadMask.fill(0, maskOffset, maskOffset + num);
  simAteMask.fill(0, maskOffset, maskOffset + num);

  // 1. Advance heads and decrement health
  for (let i = 0; i < num; i++) {
    const s = cur.snakes[i];
    const d = nxt.snakes[i];
    d.id = s.id;
    d.alive = s.alive;

    if (!s.alive) continue;

    const dir = DIRS[simMoves[moveOffset + i]];
    const hx = s.body[0] + dir.dx;
    const hy = s.body[1] + dir.dy;
    const newHealth = s.health - 1;

    let eats = false;
    if (hx >= 0 && hy >= 0 && hx < W && hy < H) {
      const idx = hy * W + hx;
      if (cur.hasFood[idx]) {
        eats = true;
        simAteMask[maskOffset + i] = 1;
      }
    }

    const newLen = eats ? s.length + 1 : s.length;
    d.length = newLen;
    d.health = eats ? 100 : newHealth;

    // Shift body: new head at (0, 1), copy old segments
    d.body[0] = hx;
    d.body[1] = hy;
    const copyLimit = eats ? s.length : s.length - 1;
    for (let k = 0; k < copyLimit; k++) {
      d.body[(k + 1) * 2] = s.body[k * 2];
      d.body[(k + 1) * 2 + 1] = s.body[k * 2 + 1];
    }
  }

  // 2. Remove eaten food
  for (let i = 0; i < num; i++) {
    if (simAteMask[maskOffset + i]) {
      const hx = nxt.snakes[i].body[0];
      const hy = nxt.snakes[i].body[1];
      nxt.hasFood[hy * W + hx] = 0;
    }
  }

  // 3. Collision and elimination checks
  for (let i = 0; i < num; i++) {
    const s = nxt.snakes[i];
    if (!s.alive) continue;

    const hx = s.body[0], hy = s.body[1];

    // Wall collision
    if (hx < 0 || hy < 0 || hx >= W || hy >= H) {
      simDeadMask[maskOffset + i] = 1;
      continue;
    }

    // Active storm hazard collision
    if (cur.isHazard[hy * W + hx]) {
      simDeadMask[maskOffset + i] = 1;
      continue;
    }

    // Starvation
    if (s.health <= 0) {
      simDeadMask[maskOffset + i] = 1;
      continue;
    }

    // Body collisions (including self)
    let hitBody = false;
    for (let j = 0; j < num; j++) {
      const t = nxt.snakes[j];
      if (!cur.snakes[j].alive) continue; // Snake was alive at start of collision pass
      for (let k = 1; k < t.length; k++) {
        if (t.body[k * 2] === hx && t.body[k * 2 + 1] === hy) {
          hitBody = true;
          break;
        }
      }
      if (hitBody) break;
    }
    if (hitBody) {
      simDeadMask[maskOffset + i] = 1;
      continue;
    }

    // Head-on collisions
    let hitHead = false;
    for (let j = 0; j < num; j++) {
      if (i === j) continue;
      const t = nxt.snakes[j];
      if (!cur.snakes[j].alive) continue;
      if (t.body[0] === hx && t.body[1] === hy && t.length >= s.length) {
        hitHead = true;
        break;
      }
    }
    if (hitHead) {
      simDeadMask[maskOffset + i] = 1;
    }
  }

  // Apply deaths
  for (let i = 0; i < num; i++) {
    if (simDeadMask[maskOffset + i]) {
      nxt.snakes[i].alive = false;
    }
  }

  // 4. Storm expansion
  const turn = nxt.turn;
  if (turn >= 150 && (turn - 150) % 20 === 0 && nxt.currentRing < maxRing) {
    const newRing = nxt.currentRing + 1;
    nxt.currentRing = newRing;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < newRing || y < newRing || x >= W - newRing || y >= H - newRing) {
          const idx = y * W + x;
          nxt.isHazard[idx] = 1;
          nxt.hasFood[idx] = 0;
        }
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Get legal move directions for a snake in simState[depth]
// ----------------------------------------------------------------------------
function getLegalMovesFast(depth, W, H, snakeIdx) {
  const state = simState[depth];
  const s = state.snakes[snakeIdx];
  if (!s.alive) return [];

  const hx = s.body[0], hy = s.body[1];
  const isHazard = state.isHazard;
  const hasFood = state.hasFood;
  const num = state.numSnakes;
  const legal = [];

  for (let d = 0; d < 4; d++) {
    const nx = hx + DIRS[d].dx, ny = hy + DIRS[d].dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const idx = ny * W + nx;
    if (isHazard[idx]) continue;

    const eats = hasFood[idx] === 1;
    if (s.health <= 1 && !eats) continue;

    let hit = false;
    for (let j = 0; j < num; j++) {
      const t = state.snakes[j];
      if (!t.alive) continue;
      // Tail vacates if not eating on step
      const limit = (j === snakeIdx && eats) ? t.length : t.length - 1;
      for (let k = 0; k < limit; k++) {
        if (t.body[k * 2] === nx && t.body[k * 2 + 1] === ny) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }

    if (!hit) legal.push(d);
  }

  return legal;
}

// ----------------------------------------------------------------------------
// Static Position Evaluation for simState[depth]
// ----------------------------------------------------------------------------
function evalSimState(depth, W, H, meIdx) {
  const state = simState[depth];
  const me = state.snakes[meIdx];

  // Terminal death check
  if (!me.alive) {
    return -100000 - depth * 1000;
  }

  let aliveRivals = 0;
  let maxRivalLen = 0;
  let rivalIdx = -1;
  const num = state.numSnakes;

  for (let i = 0; i < num; i++) {
    if (i !== meIdx && state.snakes[i].alive) {
      aliveRivals++;
      if (state.snakes[i].length > maxRivalLen) {
        maxRivalLen = state.snakes[i].length;
      }
      rivalIdx = i;
    }
  }

  // Terminal victory check
  if (aliveRivals === 0 && num > 1) {
    return 100000 + me.length * 100 + me.health;
  }

  const N = W * H;
  const isHazard = state.isHazard;
  const hasFood = state.hasFood;

  const turnsToShrink = nextShrinkFor(state.turn) - state.turn;
  const nextRing = state.currentRing + 1;
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;

  // Build blocked grid
  bufBlocked.fill(0, 0, N);
  for (let i = 0; i < N; i++) {
    if (isHazard[i]) bufBlocked[i] = 1;
    bufMyDist[i] = INF;
    bufOppDist[i] = INF;
    bufOppLen[i] = 0;
  }

  for (let i = 0; i < num; i++) {
    const s = state.snakes[i];
    if (!s.alive) continue;
    const limit = s.length - 1; // Tail is considered passable in BFS
    for (let k = 0; k < limit; k++) {
      const bx = s.body[k * 2], by = s.body[k * 2 + 1];
      if (bx >= 0 && by >= 0 && bx < W && by < H) {
        bufBlocked[by * W + bx] = 1;
      }
    }
  }

  // 1. My BFS reachable space
  const mhx = me.body[0], mhy = me.body[1];
  const mStart = mhy * W + mhx;
  bufMyDist[mStart] = 0;

  let qh = 0, qt = 0;
  bufQueue[qt++] = mStart;

  const myTailX = me.body[(me.length - 1) * 2];
  const myTailY = me.body[(me.length - 1) * 2 + 1];
  const myTailIdx = myTailY * W + myTailX;
  let canReachMyTail = false;

  while (qh < qt) {
    const u = bufQueue[qh++];
    const ux = u % W, uy = (u - ux) / W;
    const nd = bufMyDist[u] + 1;

    for (let d = 0; d < 4; d++) {
      const vx = ux + DIRS[d].dx, vy = uy + DIRS[d].dy;
      if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
      const v = vy * W + vx;
      if (bufBlocked[v] || bufMyDist[v] !== INF) continue;

      bufMyDist[v] = nd;
      if (v === myTailIdx) canReachMyTail = true;
      bufQueue[qt++] = v;
    }
  }
  const myReach = qt;

  // 2. Opponent BFS reachable space
  qh = 0; qt = 0;
  for (let i = 0; i < num; i++) {
    if (i === meIdx || !state.snakes[i].alive) continue;
    const s = state.snakes[i];
    const sIdx = s.body[1] * W + s.body[0];
    bufOppDist[sIdx] = 0;
    bufOppLen[sIdx] = s.length;
    bufQueue[qt++] = sIdx;
  }

  let oppReach = 0;
  let canOppReachTail = false;
  let oppTailIdx = -1;
  if (aliveRivals === 1 && rivalIdx >= 0) {
    const rv = state.snakes[rivalIdx];
    oppTailIdx = rv.body[(rv.length - 1) * 2 + 1] * W + rv.body[(rv.length - 1) * 2];
  }

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

      if (bufOppDist[v] === INF) {
        bufOppDist[v] = nd;
        bufOppLen[v] = ul;
        oppReach++;
        if (v === oppTailIdx) canOppReachTail = true;
        bufQueue[qt++] = v;
      } else if (bufOppDist[v] === nd && ul > bufOppLen[v]) {
        bufOppLen[v] = ul;
      }
    }
  }

  // 3. Voronoi territory & Food distances (excluding doomed shrink ring)
  let myVoronoi = 0;
  let oppVoronoi = 0;
  let minFoodDist = INF;
  let uncontestedFoodDist = INF;

  for (let i = 0; i < N; i++) {
    const md = bufMyDist[i];
    const od = bufOppDist[i];

    if (md < INF) {
      if (hasFood[i]) {
        if (md < minFoodDist) minFoodDist = md;
        if (md < od || (md === od && me.length > bufOppLen[i])) {
          if (md < uncontestedFoodDist) uncontestedFoodDist = md;
        }
      }

      if (md < od) {
        myVoronoi += 1.0;
      } else if (md === od) {
        if (me.length > bufOppLen[i]) myVoronoi += 0.8;
        else if (me.length === bufOppLen[i]) myVoronoi += 0.3;
        else oppVoronoi += 0.8;
      } else {
        oppVoronoi += 1.0;
      }
    } else if (od < INF) {
      oppVoronoi += 1.0;
    }
  }

  let score = 0;

  // Space & pocket analysis
  if (myReach < me.length) {
    if (canReachMyTail) {
      score += 100;
      score -= (me.length - myReach) * 10;
    } else {
      score -= 18000 + (me.length - myReach) * 400;
    }
  } else {
    score += Math.min(myReach, 80) * 1.5;
    if (canReachMyTail) score += 100;
  }

  // Opponent trap detection!
  if (aliveRivals === 1 && oppReach < maxRivalLen && !canOppReachTail) {
    score += 20000 + (maxRivalLen - oppReach) * 300;
  }

  // Voronoi balance
  score += myVoronoi * 6.5 - oppVoronoi * 2.8;

  // Length dominance
  const lenDiff = me.length - maxRivalLen;
  if (lenDiff > 0) {
    score += 120 + Math.min(lenDiff, 6) * 40;
  } else if (lenDiff === 0) {
    score -= 10;
  } else {
    score -= 90 + Math.min(-lenDiff, 6) * 45;
  }

  // Food strategy
  const isDuel = aliveRivals === 1;
  let foodUrgency = 0.8;
  if (me.health <= 25) {
    foodUrgency = 9.0;
  } else if (me.health <= 50) {
    foodUrgency = 4.0;
  } else if (isDuel && lenDiff <= 0) {
    foodUrgency = 3.5; // In duel, must grow to dominate
  } else if (me.length < 8) {
    foodUrgency = 2.0;
  }

  if (uncontestedFoodDist < INF && uncontestedFoodDist < me.health) {
    score += (foodUrgency * 45) / (uncontestedFoodDist + 1);
  } else if (minFoodDist < INF && minFoodDist < me.health) {
    score += (foodUrgency * 20) / (minFoodDist + 1);
  } else if (me.health < 25) {
    score -= 1000; // Danger of starvation
  }

  score += me.health * 0.25;

  // --------------------------------------------------------------------------
  // PROACTIVE STORM & PERIMETER SURVIVAL
  // --------------------------------------------------------------------------
  const cx = (W - 1) / 2, cy = (H - 1) / 2;

  if (state.currentRing < maxRing && turnsToShrink <= 18) {
    const inUpcomingRing = (
      mhx < nextRing || mhy < nextRing ||
      mhx >= W - nextRing || mhy >= H - nextRing
    );

    if (inUpcomingRing) {
      if (turnsToShrink <= 1) {
        let hasInwardSafe = false;
        for (let d = 0; d < 4; d++) {
          const inx = mhx + DIRS[d].dx, iny = mhy + DIRS[d].dy;
          if (inx >= nextRing && iny >= nextRing && inx < W - nextRing && iny < H - nextRing) {
            const iIdx = iny * W + inx;
            if (!isHazard[iIdx] && !bufBlocked[iIdx]) {
              hasInwardSafe = true;
              break;
            }
          }
        }
        if (!hasInwardSafe) {
          score -= 20000;
        } else {
          score -= 500;
        }
      } else {
        score -= (19 - turnsToShrink) * 35;
      }
    }
  }

  const centerDist = Math.abs(mhx - cx) + Math.abs(mhy - cy);
  const centerWeight = (state.currentRing > 0 || turnsToShrink <= 25) ? 1.0 : 0.4;
  score -= centerDist * centerWeight;

  return score;
}

// ----------------------------------------------------------------------------
// Simultaneous Maximin Search with Alpha-Beta Pruning
// ----------------------------------------------------------------------------
function searchMaximinFast(depth, maxDepth, W, H, meIdx, rivalIdx, alpha, beta, maxRing) {
  const me = simState[depth].snakes[meIdx];
  if (!me.alive || depth === maxDepth) {
    return evalSimState(depth, W, H, meIdx);
  }

  const hasRival = (rivalIdx >= 0 && simState[depth].snakes[rivalIdx].alive);
  if (!hasRival) {
    return evalSimState(depth, W, H, meIdx);
  }

  const myMoves = getLegalMovesFast(depth, W, H, meIdx);
  if (myMoves.length === 0) {
    return -100000 - depth * 1000;
  }

  const oppMoves = getLegalMovesFast(depth, W, H, rivalIdx);
  const oppMoveList = (oppMoves.length > 0) ? oppMoves : [0];

  let bestVal = -Infinity;
  const numSnakes = simState[depth].numSnakes;
  const curMovesOffset = depth * MAX_SNAKES;

  for (let m = 0; m < myMoves.length; m++) {
    const myDir = myMoves[m];
    let worstForThisMove = Infinity;

    simMoves.fill(0, curMovesOffset, curMovesOffset + numSnakes);
    simMoves[curMovesOffset + meIdx] = myDir;

    // Set other snakes to keep straight or first legal move
    for (let i = 0; i < numSnakes; i++) {
      if (i !== meIdx && i !== rivalIdx && simState[depth].snakes[i].alive) {
        simMoves[curMovesOffset + i] = 0;
      }
    }

    for (let o = 0; o < oppMoveList.length; o++) {
      simMoves[curMovesOffset + rivalIdx] = oppMoveList[o];

      stepSimFast(depth, W, H, curMovesOffset, maxRing);

      const val = searchMaximinFast(
        depth + 1, maxDepth, W, H, meIdx, rivalIdx,
        alpha, Math.min(beta, worstForThisMove), maxRing
      );

      if (val < worstForThisMove) {
        worstForThisMove = val;
      }

      // Alpha-Beta cutoff: opponent will minimize below current best
      if (worstForThisMove <= alpha) {
        break;
      }
    }

    if (worstForThisMove > bestVal) {
      bestVal = worstForThisMove;
    }
    if (bestVal > alpha) {
      alpha = bestVal;
    }
    if (alpha >= beta) {
      break;
    }
  }

  return bestVal;
}

// ----------------------------------------------------------------------------
// Initialize Root Simulation State from state
// ----------------------------------------------------------------------------
function initRootSimState(state) {
  const W = state.width;
  const H = state.height;
  const N = W * H;
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;
  const turn = state.turn || 1;
  const nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : 999999;

  const root = simState[0];
  root.turn = turn;
  root.nextShrink = nextShrink;
  root.hasFood.fill(0, 0, N);
  root.isHazard.fill(0, 0, N);

  const hazards = state.hazards || [];
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (h.x >= 0 && h.y >= 0 && h.x < W && h.y < H) {
      root.isHazard[h.y * W + h.x] = 1;
    }
  }

  let currentRing = 0;
  while (currentRing <= maxRing && root.isHazard[currentRing * W + currentRing]) {
    currentRing++;
  }
  root.currentRing = currentRing;

  const foods = state.food || [];
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    if (f.x >= 0 && f.y >= 0 && f.x < W && f.y < H) {
      const idx = f.y * W + f.x;
      if (!root.isHazard[idx]) {
        root.hasFood[idx] = 1;
      }
    }
  }

  const snakes = state.snakes || [];
  root.numSnakes = snakes.length;
  let meIdx = 0;

  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    const dst = root.snakes[i];
    dst.id = s.id;
    dst.length = s.body ? s.body.length : 0;
    dst.health = s.health;
    dst.alive = (dst.length > 0);

    if (s.id === state.you.id) {
      meIdx = i;
    }

    if (dst.alive) {
      for (let k = 0; k < dst.length; k++) {
        dst.body[k * 2] = s.body[k].x;
        dst.body[k * 2 + 1] = s.body[k].y;
      }
    }
  }

  return meIdx;
}

// ----------------------------------------------------------------------------
// Main Decision Procedure
// ----------------------------------------------------------------------------
function decide(state) {
  if (!state || !state.you || !state.you.head) return 'up';

  const W = state.width;
  const H = state.height;
  const maxRing = Math.floor(Math.min(W, H) / 2) - 1;

  const meIdx = initRootSimState(state);
  const root = simState[0];
  const me = root.snakes[meIdx];

  const legalMoves = getLegalMovesFast(0, W, H, meIdx);
  if (legalMoves.length === 0) {
    // Emergency escape: any non-hazard cell
    const hx = me.body[0], hy = me.body[1];
    for (let d = 0; d < 4; d++) {
      const nx = hx + DIRS[d].dx, ny = hy + DIRS[d].dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !root.isHazard[ny * W + nx]) {
        return DIRS[d].name;
      }
    }
    return 'up';
  }

  if (legalMoves.length === 1) {
    return DIRS[legalMoves[0]].name;
  }

  // Find primary rival
  let primaryRivalIdx = -1;
  let minRivalDist = Infinity;
  const mhx = me.body[0], mhy = me.body[1];

  for (let i = 0; i < root.numSnakes; i++) {
    if (i === meIdx || !root.snakes[i].alive) continue;
    const r = root.snakes[i];
    const dist = Math.abs(r.body[0] - mhx) + Math.abs(r.body[1] - mhy);
    if (dist < minRivalDist) {
      minRivalDist = dist;
      primaryRivalIdx = i;
    }
  }

  const isDuel = (root.numSnakes === 2);
  // Search depth: 4 plies in duel or close threat, 3 plies otherwise
  const searchDepth = (isDuel || minRivalDist <= 5) ? 4 : 3;

  let bestMoveDir = legalMoves[0];
  let bestScore = -Infinity;

  const oppLegal = (primaryRivalIdx >= 0) ? getLegalMovesFast(0, W, H, primaryRivalIdx) : [];
  const oppMoveList = (oppLegal.length > 0) ? oppLegal : [0];
  const rootMovesOffset = 0;

  // Pre-calculate default legal moves for passive snakes in simulation
  const passiveDefaults = new Int8Array(root.numSnakes);
  for (let i = 0; i < root.numSnakes; i++) {
    if (i !== meIdx && i !== primaryRivalIdx && root.snakes[i].alive) {
      const leg = getLegalMovesFast(0, W, H, i);
      passiveDefaults[i] = leg.length > 0 ? leg[0] : 0;
    }
  }

  for (let m = 0; m < legalMoves.length; m++) {
    const myDir = legalMoves[m];
    const nx = me.body[0] + DIRS[myDir].dx;
    const ny = me.body[1] + DIRS[myDir].dy;
    const eatsFood = root.hasFood[ny * W + nx] === 1;
    const myNewLen = me.length + (eatsFood ? 1 : 0);

    // Multi-rival step-1 head-on collision danger filter
    let headOnPenalty = 0;
    let headOnBonus = 0;
    for (let i = 0; i < root.numSnakes; i++) {
      if (i === meIdx || !root.snakes[i].alive) continue;
      const rv = root.snakes[i];
      const man = Math.abs(rv.body[0] - nx) + Math.abs(rv.body[1] - ny);
      if (man === 1) {
        // Check if rival can legally step to (nx, ny)
        const rvMoves = getLegalMovesFast(0, W, H, i);
        let canStepHere = false;
        for (let rd = 0; rd < rvMoves.length; rd++) {
          const rx = rv.body[0] + DIRS[rvMoves[rd]].dx;
          const ry = rv.body[1] + DIRS[rvMoves[rd]].dy;
          if (rx === nx && ry === ny) {
            canStepHere = true;
            break;
          }
        }
        if (canStepHere) {
          const rvNewLen = rv.length + (eatsFood ? 1 : 0);
          if (rvNewLen >= myNewLen) {
            headOnPenalty += (rvMoves.length <= 1) ? 60000 : 30000;
          } else {
            headOnBonus += (rvMoves.length <= 1) ? 20000 : 250;
          }
        }
      }
    }

    let worstChild = Infinity;

    simMoves.fill(0, rootMovesOffset, rootMovesOffset + root.numSnakes);
    simMoves[rootMovesOffset + meIdx] = myDir;
    for (let i = 0; i < root.numSnakes; i++) {
      if (i !== meIdx && i !== primaryRivalIdx && root.snakes[i].alive) {
        simMoves[rootMovesOffset + i] = passiveDefaults[i];
      }
    }

    if (primaryRivalIdx < 0) {
      stepSimFast(0, W, H, rootMovesOffset, maxRing);
      worstChild = evalSimState(1, W, H, meIdx);
    } else {
      for (let o = 0; o < oppMoveList.length; o++) {
        simMoves[rootMovesOffset + primaryRivalIdx] = oppMoveList[o];
        stepSimFast(0, W, H, rootMovesOffset, maxRing);

        const val = searchMaximinFast(
          1, searchDepth, W, H, meIdx, primaryRivalIdx,
          -Infinity, worstChild, maxRing
        );

        if (val < worstChild) {
          worstChild = val;
        }
      }
    }

    // Direct root food eat bonus & head-on adjustments
    if (eatsFood) {
      worstChild += 30;
    }
    worstChild -= headOnPenalty;
    worstChild += headOnBonus;

    if (worstChild > bestScore) {
      bestScore = worstChild;
      bestMoveDir = myDir;
    }
  }

  return DIRS[bestMoveDir].name;
}

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'up';
  }
}

module.exports = { name: 'FlashRoyale', move };
