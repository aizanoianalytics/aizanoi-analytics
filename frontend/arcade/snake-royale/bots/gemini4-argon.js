'use strict';

// ============================================================================
// OUROBOROS PRIME — Championship Snake Royale Engine
// ============================================================================

const DIRS = [
  { name: 'up',    dx: 0,  dy: -1 },
  { name: 'down',  dx: 0,  dy: 1  },
  { name: 'left',  dx: -1, dy: 0  },
  { name: 'right', dx: 1,  dy: 0  }
];

function move(state) {
  try {
    return computeBestMove(state);
  } catch (e) {
    // Ultimate failsafe: pick any non-suicidal adjacent move
    return emergencyMove(state);
  }
}

function emergencyMove(state) {
  const you = state.you;
  if (!you || !you.head) return 'up';
  const hx = you.head.x;
  const hy = you.head.y;
  const w = state.width || 11;
  const h = state.height || 11;
  const neck = (you.body && you.body.length > 1) ? you.body[1] : null;

  for (let i = 0; i < 4; i++) {
    const d = DIRS[i];
    const nx = hx + d.dx;
    const ny = hy + d.dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
      if (!neck || nx !== neck.x || ny !== neck.y) {
        return d.name;
      }
    }
  }
  return 'up';
}

function computeBestMove(state) {
  const startTime = Date.now();
  const W = state.width;
  const H = state.height;
  const N = W * H;
  const turn = state.turn || 0;
  const you = state.you;
  const myId = you.id;
  const myHead = you.head;
  const myLen = you.length;
  const myHealth = you.health;

  // Separate snakes into me and living enemies
  const enemies = [];
  for (let i = 0; i < state.snakes.length; i++) {
    const s = state.snakes[i];
    if (s.id !== myId && s.health > 0 && s.body && s.body.length > 0) {
      enemies.push(s);
    }
  }
  const numEnemies = enemies.length;
  const isDuel = numEnemies === 1;

  // --------------------------------------------------------------------------
  // 1. BOARD & HAZARD REPRESENTATION
  // --------------------------------------------------------------------------
  // hazardGrid: 1 if deadly now, 2 if shrinking VERY soon (nextShrinkTurn <= turn + 1)
  const hazardGrid = new Uint8Array(N);
  if (state.hazards) {
    for (let i = 0; i < state.hazards.length; i++) {
      const hz = state.hazards[i];
      if (hz.x >= 0 && hz.x < W && hz.y >= 0 && hz.y < H) {
        hazardGrid[hz.y * W + hz.x] = 1;
      }
    }
  }

  // Determine current safe bounds (outside of existing storm rings)
  let minSafeX = 0, maxSafeX = W - 1, minSafeY = 0, maxSafeY = H - 1;
  while (minSafeX < maxSafeX && hazardGrid[Math.floor(H / 2) * W + minSafeX] === 1) minSafeX++;
  while (maxSafeX > minSafeX && hazardGrid[Math.floor(H / 2) * W + maxSafeX] === 1) maxSafeX--;
  while (minSafeY < maxSafeY && hazardGrid[minSafeY * W + Math.floor(W / 2)] === 1) minSafeY++;
  while (maxSafeY > minSafeY && hazardGrid[maxSafeY * W + Math.floor(W / 2)] === 1) maxSafeY--;

  const nextShrink = (typeof state.nextShrinkTurn === 'number' && state.nextShrinkTurn >= turn)
    ? state.nextShrinkTurn
    : (turn < 150 ? 150 : 150 + Math.ceil((turn - 150) / 20) * 20);
  const turnsToShrink = nextShrink - turn;

  // Mark ring that is about to shrink
  const nextRingGrid = new Uint8Array(N);
  if (maxSafeX - minSafeX >= 2 && maxSafeY - minSafeY >= 2) {
    for (let x = minSafeX; x <= maxSafeX; x++) {
      nextRingGrid[minSafeY * W + x] = 1;
      nextRingGrid[maxSafeY * W + x] = 1;
    }
    for (let y = minSafeY; y <= maxSafeY; y++) {
      nextRingGrid[y * W + minSafeX] = 1;
      nextRingGrid[y * W + maxSafeX] = 1;
    }
  }

  // Food map
  const foodGrid = new Uint8Array(N);
  const foods = [];
  if (state.food) {
    for (let i = 0; i < state.food.length; i++) {
      const f = state.food[i];
      if (f.x >= 0 && f.x < W && f.y >= 0 && f.y < H) {
        const idx = f.y * W + f.x;
        if (hazardGrid[idx] === 0) {
          foodGrid[idx] = 1;
          foods.push(f);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. OBSTACLE TIMELINE GRID (Exact turn when each cell becomes free)
  // --------------------------------------------------------------------------
  // freeAtTurn[idx] = how many turns from NOW until cell idx is vacated by bodies.
  // If freeAtTurn[idx] <= 1, it is free on the next turn (turn + 1).
  // For hazard cells, freeAtTurn[idx] = 9999.
  const freeAtTurn = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    if (hazardGrid[i] === 1) freeAtTurn[i] = 9999;
    // If storm shrinks on the exact next turn, the outer ring becomes deadly on turn+1!
    else if (turnsToShrink <= 1 && nextRingGrid[i] === 1) freeAtTurn[i] = 9999;
  }

  // Helper to check if a snake is stacked at the tail (e.g. just ate or start of game)
  // or adjacent to food (might eat next turn and keep its tail).
  function registerSnakeBody(snake, isMe) {
    const body = snake.body;
    const len = body.length;
    // Check if snake might eat on next turn
    let canEatNext = false;
    const sh = snake.head;
    for (let d = 0; d < 4; d++) {
      const nx = sh.x + DIRS[d].dx;
      const ny = sh.y + DIRS[d].dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && foodGrid[ny * W + nx] === 1) {
        canEatNext = true;
        break;
      }
    }

    // Iterate from head (i=0) to tail (i=len-1)
    // Segment at index i will vacate in (len - i) turns, unless stacked or eats.
    // Wait: on turn + 1, the tail (index len - 1) moves away IF it is not stacked with index len - 2.
    // So segment i vacates after (len - 1 - i) turns!
    // Specifically: index len - 1 has remaining stay = 0 (free on next move, i.e. 1 step away).
    // index len - 2 has remaining stay = 1 (blocked on next move, free on step 2).
    for (let i = 0; i < len; i++) {
      const seg = body[i];
      if (seg.x < 0 || seg.x >= W || seg.y < 0 || seg.y >= H) continue;
      const idx = seg.y * W + seg.x;
      // If multiple segments are stacked on the same cell, the EARLIEST index (closest to head)
      // determines when that cell actually becomes free!
      let turnsBlocked = len - 1 - i; // 0 for unstacked tail, 1 for pre-tail, etc.
      if (!isMe && canEatNext) {
        // Enemy might eat next turn, delaying its tail movement by 1 turn (if it takes >=1 step to reach)
        turnsBlocked += 1;
      }
      const vacateStep = turnsBlocked + 1; // can step onto this cell on step `vacateStep`
      if (vacateStep > freeAtTurn[idx]) {
        freeAtTurn[idx] = vacateStep;
      }
    }
  }

  registerSnakeBody(you, true);
  for (let i = 0; i < numEnemies; i++) {
    registerSnakeBody(enemies[i], false);
  }

  // --------------------------------------------------------------------------
  // 3. ENEMY HEAD-TO-HEAD DANGER & CONTROL MAPS
  // --------------------------------------------------------------------------
  // step1Danger[idx]:
  //   0 = no enemy can reach in 1 step
  //   1 = only smaller enemies can reach in 1 step (we win H2H!)
  //   2 = equal or larger enemy can reach in 1 step (deadly/risky H2H!)
  const step1Danger = new Uint8Array(N);
  const step1EnemyProb = new Float32Array(N); // Max probability of a >= enemy stepping here
  const step1SmallerCount = new Uint8Array(N);
  const step2Danger = new Uint8Array(N); // 1 if >= enemy can reach in 2 steps

  for (let i = 0; i < numEnemies; i++) {
    const e = enemies[i];
    const eh = e.head;
    const eBiggerOrEqual = e.length >= myLen;

    // Count valid moves for this enemy to estimate probabilities
    const validMoves = [];
    for (let d = 0; d < 4; d++) {
      const nx = eh.x + DIRS[d].dx;
      const ny = eh.y + DIRS[d].dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nIdx = ny * W + nx;
      if (freeAtTurn[nIdx] <= 1) {
        validMoves.push({ x: nx, y: ny, idx: nIdx });
      }
    }

    const numValid = validMoves.length || 1;
    for (let m = 0; m < validMoves.length; m++) {
      const vm = validMoves[m];
      if (eBiggerOrEqual) {
        step1Danger[vm.idx] = 2;
        // If enemy has food on this cell or only 1 move, higher probability
        let prob = 1.0 / numValid;
        if (foodGrid[vm.idx] === 1) prob = Math.min(1.0, prob + 0.35);
        if (prob > step1EnemyProb[vm.idx]) step1EnemyProb[vm.idx] = prob;

        // Mark step 2 danger
        for (let d2 = 0; d2 < 4; d2++) {
          const n2x = vm.x + DIRS[d2].dx;
          const n2y = vm.y + DIRS[d2].dy;
          if (n2x >= 0 && n2x < W && n2y >= 0 && n2y < H) {
            const idx2 = n2y * W + n2x;
            if (freeAtTurn[idx2] <= 2) {
              step2Danger[idx2] = 1;
            }
          }
        }
      } else {
        if (step1Danger[vm.idx] === 0) step1Danger[vm.idx] = 1;
        step1SmallerCount[vm.idx]++;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. GENERATE CANDIDATE MOVES
  // --------------------------------------------------------------------------
  const candidates = [];
  const neck = you.body.length > 1 ? you.body[1] : null;

  for (let d = 0; d < 4; d++) {
    const dir = DIRS[d];
    const nx = myHead.x + dir.dx;
    const ny = myHead.y + dir.dy;

    // Never reverse directly into neck
    if (neck && nx === neck.x && ny === neck.y && you.body.length > 2) continue;
    // Out of bounds check
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

    const nIdx = ny * W + nx;
    const eating = foodGrid[nIdx] === 1;

    // Wait: if we eat food on (nx, ny), our tail DOES NOT move this turn!
    // What if (nx, ny) IS our own tail? Food cannot spawn on our tail, so eating on our own tail is impossible.
    // Thus freeAtTurn[nIdx] <= 1 accurately reflects whether (nx, ny) is free on step 1!
    const isWallOrBody = freeAtTurn[nIdx] > 1;
    const isCurrentHazard = hazardGrid[nIdx] === 1;
    const isShrinkHazard = turnsToShrink <= 1 && nextRingGrid[nIdx] === 1;

    candidates.push({
      dir: dir.name,
      x: nx,
      y: ny,
      idx: nIdx,
      eating,
      isWallOrBody,
      isCurrentHazard,
      isShrinkHazard,
      h2hDanger: step1Danger[nIdx],
      h2hProb: step1EnemyProb[nIdx],
      score: 0
    });
  }

  if (candidates.length === 0) return 'up';

  // Filter out guaranteed instant deaths (walls, bodies, active hazards) UNLESS all moves are instant death
  let viable = candidates.filter(c => !c.isWallOrBody && !c.isCurrentHazard && !c.isShrinkHazard);
  if (viable.length === 0) {
    // Maybe a shrink hazard or tail that might not vacate is our only hope
    viable = candidates.filter(c => !c.isCurrentHazard && !c.isWallOrBody);
  }
  if (viable.length === 0) {
    // Only walls/bodies left — pick cell with smallest freeAtTurn (e.g. enemy tail that might not eat)
    candidates.sort((a, b) => freeAtTurn[a.idx] - freeAtTurn[b.idx]);
    return candidates[0].dir;
  }
  if (viable.length === 1) {
    return viable[0].dir;
  }

  // --------------------------------------------------------------------------
  // 5. VORONOI TERRITORY, REACHABLE SPACE, TARJAN ARTICULATION & CORRIDORS
  // --------------------------------------------------------------------------
  // Reusable typed arrays for fast BFS
  const myDist = new Int16Array(N);
  const enemyDist = new Int16Array(N);
  const owner = new Int8Array(N); // 1 = me, 2 = enemy, 3 = tied
  const bfsQueue = new Int32Array(N * 2);

  // Precompute multi-source Enemy BFS distances from all current enemy heads
  enemyDist.fill(9999);
  let qHead = 0, qTail = 0;
  for (let i = 0; i < numEnemies; i++) {
    const eh = enemies[i].head;
    const eIdx = eh.y * W + eh.x;
    enemyDist[eIdx] = 0;
    bfsQueue[qTail++] = eIdx;
  }
  while (qHead < qTail) {
    const curr = bfsQueue[qHead++];
    const cd = enemyDist[curr];
    const cx = curr % W;
    const cy = (curr - cx) / W;
    const nextStep = cd + 1;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d].dx;
      const ny = cy + DIRS[d].dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nIdx = ny * W + nx;
      if (enemyDist[nIdx] <= nextStep) continue;
      // Time-aware passability: cell is passable at `nextStep` if freeAtTurn[nIdx] <= nextStep
      if (freeAtTurn[nIdx] <= nextStep) {
        enemyDist[nIdx] = nextStep;
        bfsQueue[qTail++] = nIdx;
      }
    }
  }

  // Determine strategic weights based on game state
  const maxEnemyLen = numEnemies > 0 ? Math.max(...enemies.map(e => e.length)) : 0;
  const targetLen = isDuel ? (maxEnemyLen + 2) : (maxEnemyLen + 1);
  const needLength = myLen < targetLen;
  const urgentHunger = myHealth < 38;
  const moderateHunger = myHealth < 65;

  let foodWeight = 1.0;
  if (urgentHunger) foodWeight = 6.5;
  else if (moderateHunger) foodWeight = 2.6;
  else if (needLength) foodWeight = isDuel ? 2.8 : 1.8;
  else foodWeight = 0.6; // Already longest and healthy: prioritize space & survival

  // Evaluate each viable candidate thoroughly
  for (let cIdx = 0; cIdx < viable.length; cIdx++) {
    const cand = viable[cIdx];
    let score = 0;

    // Create candidate-specific adjustments to obstacle durations:
    // If we eat on cand.idx, our body takes +1 turn to vacate every segment!
    const eatDelay = cand.eating ? 1 : 0;

    // Run time-aware BFS from candidate position (which is at step = 1)
    myDist.fill(9999);
    myDist[cand.idx] = 1;
    let mqHead = 0, mqTail = 0;
    bfsQueue[mqTail++] = cand.idx;

    let reachableCount = 0;
    let effectiveSpace = 0; // Weighted space (penalizing dead ends and shrink rings)
    let myVoronoi = 0;
    let enemyVoronoi = 0;
    let canReachMyTail = false;
    let canReachSafeCenter = false;
    let minFoodDist = 999;
    let ownedFoodCount = 0;

    const myTail = you.body[you.body.length - 1];
    const myTailIdx = myTail.y * W + myTail.x;

    while (mqHead < mqTail) {
      const curr = bfsQueue[mqHead++];
      const cd = myDist[curr];
      const cx = curr % W;
      const cy = (curr - cx) / W;

      reachableCount++;

      // Check degree of cell (corridor / dead-end detection)
      let openNeighbors = 0;
      const nextStep = cd + 1;

      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d].dx;
        const ny = cy + DIRS[d].dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const nIdx = ny * W + nx;

        // Account for our own body's eatDelay if nIdx is part of our body
        let reqTurn = freeAtTurn[nIdx];
        if (eatDelay > 0 && reqTurn > 0 && reqTurn < 9000) {
          reqTurn += eatDelay;
        }
        // We cannot step back onto cand.idx while our body is still passing through it
        if (nIdx === cand.idx && nextStep <= myLen + eatDelay) {
          continue;
        }

        if (reqTurn <= nextStep) {
          openNeighbors++;
          if (myDist[nIdx] > nextStep) {
            // At step 2, avoid stepping directly onto a cell where a bigger enemy is adjacent (unless no choice)
            myDist[nIdx] = nextStep;
            bfsQueue[mqTail++] = nIdx;
          }
        }
      }

      if (curr === myTailIdx) canReachMyTail = true;
      if (nextRingGrid[curr] === 0 && hazardGrid[curr] === 0) canReachSafeCenter = true;

      // Space quality weighting
      let cellVal = 1.0;
      if (openNeighbors <= 1) cellVal = 0.45; // Dead-end / tight tunnel penalty
      if (turnsToShrink <= 8 && nextRingGrid[curr] === 1) cellVal *= 0.5;
      effectiveSpace += cellVal;

      // Voronoi comparison
      const ed = enemyDist[curr];
      if (cd < ed) {
        myVoronoi++;
        if (foodGrid[curr] === 1 && cd - 1 < minFoodDist) {
          minFoodDist = cd - 1;
          ownedFoodCount++;
        }
      } else if (cd === ed) {
        // Tie-break Voronoi by snake length!
        if (myLen > maxEnemyLen) {
          myVoronoi += 0.7;
          if (foodGrid[curr] === 1 && cd - 1 < minFoodDist) minFoodDist = cd - 1;
        } else {
          enemyVoronoi += 0.7;
        }
      } else {
        enemyVoronoi++;
        // Even if enemy is closer to this food, record distance in case we are starving
        if (foodGrid[curr] === 1 && (cd - 1) + 4 < minFoodDist) {
          minFoodDist = (cd - 1) + 4;
        }
      }
    }

    // Also check if cand itself is food!
    if (cand.eating) {
      minFoodDist = 0;
      ownedFoodCount++;
    }

    // ------------------------------------------------------------------------
    // A. SPACE & ENTRAPMENT EVALUATION (Critical Survival)
    // ------------------------------------------------------------------------
    const requiredSpace = myLen + (cand.eating ? 2 : 1);
    if (reachableCount < requiredSpace) {
      // Pocket is smaller than our body!
      if (canReachMyTail) {
        // We can chase our tail inside the loop, so it's survivable but risky
        score -= 250 + (requiredSpace - reachableCount) * 15;
      } else {
        // Fatal self-trap! Massive penalty proportional to how quickly we die
        score -= 4000 - (requiredSpace - reachableCount) * 120;
      }
    } else {
      // Plenty of space: reward effective space up to a soft cap
      const cappedSpace = Math.min(effectiveSpace, myLen * 3.5);
      score += cappedSpace * 4.5;
      if (canReachMyTail) score += 45; // Tail connectivity is a huge safety guarantee
    }

    // Bottleneck / Escape Routes check from cand (how many safe step-2 moves exist?)
    let safeStep2Moves = 0;
    let riskyStep2Moves = 0;
    for (let d = 0; d < 4; d++) {
      const n2x = cand.x + DIRS[d].dx;
      const n2y = cand.y + DIRS[d].dy;
      if (n2x < 0 || n2x >= W || n2y < 0 || n2y >= H) continue;
      const idx2 = n2y * W + n2x;
      let reqTurn = freeAtTurn[idx2] + (eatDelay > 0 && freeAtTurn[idx2] > 0 && freeAtTurn[idx2] < 9000 ? 1 : 0);
      if (reqTurn <= 2) {
        if (step2Danger[idx2] === 0) safeStep2Moves++;
        else riskyStep2Moves++;
      }
    }
    if (safeStep2Moves === 0 && riskyStep2Moves === 0 && reachableCount <= 1) {
      score -= 8000; // Instant dead-end!
    } else if (safeStep2Moves === 0 && riskyStep2Moves > 0) {
      score -= 450; // Forced into a step-2 head-to-head risk!
    } else if (safeStep2Moves === 1) {
      score -= 55; // Narrow 1-wide corridor
    } else {
      score += safeStep2Moves * 18;
    }

    // ------------------------------------------------------------------------
    // B. HEAD-TO-HEAD COMBAT EVALUATION
    // ------------------------------------------------------------------------
    if (cand.h2hDanger === 2) {
      // Equal or longer snake can move to cand.idx THIS turn!
      // Scale penalty by probability and whether we have any safe alternatives
      score -= 2200 + cand.h2hProb * 1800;
    } else if (cand.h2hDanger === 1) {
      // Only SMALLER snake(s) can move to cand.idx!
      // Aggressive kill opportunity! Make sure stepping here doesn't trap us if they dodge.
      if (reachableCount >= requiredSpace) {
        score += 180 * step1SmallerCount[cand.idx] + (isDuel ? 140 : 0);
      }
    }

    // Pressure smaller enemy heads (move adjacent to their potential moves to force them back)
    for (let i = 0; i < numEnemies; i++) {
      const e = enemies[i];
      const distToEnemyHead = Math.abs(cand.x - e.head.x) + Math.abs(cand.y - e.head.y);
      if (e.length < myLen) {
        if (distToEnemyHead === 2) {
          score += isDuel ? 65 : 30; // Apply murder pressure
        }
      } else {
        // Respect larger/equal enemies in FFA more than in Duels
        if (distToEnemyHead === 2) {
          score -= isDuel ? 35 : 70;
        }
      }
    }

    // ------------------------------------------------------------------------
    // C. VORONOI TERRITORY & ENEMY CUTOFF / KILL DETECTION
    // ------------------------------------------------------------------------
    if (isDuel) {
      // In a 1v1 duel, board control and cutting off the opponent is supreme
      score += (myVoronoi - enemyVoronoi) * 3.8;
    } else {
      // In FFA, focus on our own territory without overextending into 3rd parties
      score += myVoronoi * 2.4;
    }

    // Check if this move severely restricts or traps any enemy!
    for (let i = 0; i < numEnemies; i++) {
      const e = enemies[i];
      const eh = e.head;
      const dist = Math.abs(cand.x - eh.x) + Math.abs(cand.y - eh.y);
      if (dist <= 6) {
        // Quick local flood-fill for enemy `e` assuming we occupy `cand.idx`
        const eSpace = estimateEnemySpace(e, cand.idx, myLen >= e.length, W, H, freeAtTurn, N);
        if (eSpace < e.length) {
          // We are trapping this enemy in a pocket smaller than its body!
          score += isDuel ? 650 : 280;
        } else if (eSpace < e.length * 1.6) {
          score += (e.length * 1.6 - eSpace) * (isDuel ? 18 : 8);
        }
      }
    }

    // ------------------------------------------------------------------------
    // D. FOOD & HEALTH MANAGEMENT
    // ------------------------------------------------------------------------
    if (urgentHunger && myHealth <= minFoodDist + 2) {
      // If this move cannot reach food before we starve, penalize heavily
      score -= 3500;
    }

    if (minFoodDist < 900) {
      // Reward proximity to food scaled by foodWeight
      const foodProxScore = Math.max(0, (W + H - minFoodDist)) * 12 * foodWeight;
      score += foodProxScore;
      if (cand.eating) {
        // Immediate eating bonus when hungry or needing length, UNLESS it traps us
        if (reachableCount >= requiredSpace) {
          score += 55 * foodWeight;
        }
      }
    }
    score += ownedFoodCount * 10 * foodWeight;

    // ------------------------------------------------------------------------
    // E. STORM / SHRINKING RING & CENTER POSITIONING
    // ------------------------------------------------------------------------
    const onNextRing = nextRingGrid[cand.idx] === 1;
    if (onNextRing) {
      if (turnsToShrink <= 2) {
        score -= 1800; // Extremely dangerous: about to become hazard!
      } else if (turnsToShrink <= 6) {
        score -= (7 - turnsToShrink) * 85;
      } else {
        score -= 22; // Mild edge penalty at all times
      }
    }
    if (!canReachSafeCenter && turnsToShrink <= 10) {
      score -= 1200; // Cut off from the safe inner arena before storm hits!
    }

    // Subtle attraction toward the center of the safe zone
    const centerX = (minSafeX + maxSafeX) * 0.5;
    const centerY = (minSafeY + maxSafeY) * 0.5;
    const distFromCenter = Math.abs(cand.x - centerX) + Math.abs(cand.y - centerY);
    score -= distFromCenter * 2.5;

    // Wall hug penalty: being on the outer wall cuts escape routes in half
    if (cand.x === minSafeX || cand.x === maxSafeX) score -= 14;
    if (cand.y === minSafeY || cand.y === maxSafeY) score -= 14;

    cand.score = score;
  }

  // --------------------------------------------------------------------------
  // 6. TACTICAL 2-PLY MINIMAX LOOKAHEAD (When within time budget)
  // --------------------------------------------------------------------------
  // Sort viable candidates best-first
  viable.sort((a, b) => b.score - a.score);

  const elapsed = Date.now() - startTime;
  if (elapsed < 28 && numEnemies > 0 && viable.length > 1) {
    // Find closest dangerous enemy within Manhattan distance 4
    let closeEnemy = null;
    let minEDist = 999;
    for (let i = 0; i < numEnemies; i++) {
      const e = enemies[i];
      const d = Math.abs(myHead.x - e.head.x) + Math.abs(myHead.y - e.head.y);
      if (d < minEDist) {
        minEDist = d;
        closeEnemy = e;
      }
    }

    if (closeEnemy && minEDist <= 5) {
      // Simulate 1-turn simultaneous interaction with `closeEnemy`
      const enemyMoves = [];
      for (let d = 0; d < 4; d++) {
        const nx = closeEnemy.head.x + DIRS[d].dx;
        const ny = closeEnemy.head.y + DIRS[d].dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && freeAtTurn[ny * W + nx] <= 1) {
          enemyMoves.push({ x: nx, y: ny, idx: ny * W + nx });
        }
      }

      if (enemyMoves.length > 0) {
        for (let i = 0; i < viable.length; i++) {
          if (Date.now() - startTime > 38) break;
          const cand = viable[i];
          let worstCasePenalty = 0;

          for (let em = 0; em < enemyMoves.length; em++) {
            const eMove = enemyMoves[em];
            if (eMove.idx === cand.idx) {
              // Direct collision! Already handled in h2hDanger, skip duplicate
              continue;
            }
            // Measure our reachable space if enemy steps on eMove.idx
            const spaceAfter = quickSpaceCheck(
              cand.idx,
              eMove.idx,
              closeEnemy.length >= myLen,
              Math.min(myLen + 6, 35),
              W, H, freeAtTurn
            );
            if (spaceAfter < myLen) {
              const pen = (myLen - spaceAfter) * 95;
              if (pen > worstCasePenalty) worstCasePenalty = pen;
            }
          }
          cand.score -= worstCasePenalty;
        }
        viable.sort((a, b) => b.score - a.score);
      }
    }
  }

  return viable[0].dir;
}

// Fast bounded flood-fill to estimate an enemy's remaining space if we move to `myNextIdx`
function estimateEnemySpace(enemy, myNextIdx, iAmThreat, W, H, freeAtTurn, N) {
  const maxCheck = Math.min(enemy.length + 8, 40);
  const visited = new Uint8Array(N);
  const q = new Int32Array(maxCheck + 8);
  let qH = 0, qT = 0;

  const startIdx = enemy.head.y * W + enemy.head.x;
  visited[startIdx] = 1;
  visited[myNextIdx] = 1; // Blocked by our head

  // If we are >= enemy length, our adjacent step-2 cells are also dangerous to the enemy
  if (iAmThreat) {
    const mx = myNextIdx % W;
    const my = (myNextIdx - mx) / W;
    for (let d = 0; d < 4; d++) {
      const nx = mx + DIRS[d].dx;
      const ny = my + DIRS[d].dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        visited[ny * W + nx] = 1;
      }
    }
  }

  q[qT++] = startIdx;
  let count = 0;

  while (qH < qT && count < maxCheck) {
    const curr = q[qH++];
    const cx = curr % W;
    const cy = (curr - cx) / W;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d].dx;
      const ny = cy + DIRS[d].dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nIdx = ny * W + nx;
      if (visited[nIdx] === 0 && freeAtTurn[nIdx] <= 2) {
        visited[nIdx] = 1;
        count++;
        if (count >= maxCheck) return count;
        q[qT++] = nIdx;
      }
    }
  }
  return count;
}

// Fast bounded flood-fill to verify our space after a simultaneous enemy move
function quickSpaceCheck(myIdx, enemyIdx, enemyIsThreat, limit, W, H, freeAtTurn) {
  const visited = new Uint8Array(W * H);
  const q = new Int32Array(limit + 8);
  let qH = 0, qT = 0;

  visited[myIdx] = 1;
  visited[enemyIdx] = 1;

  if (enemyIsThreat) {
    const ex = enemyIdx % W;
    const ey = (enemyIdx - ex) / W;
    for (let d = 0; d < 4; d++) {
      const nx = ex + DIRS[d].dx;
      const ny = ey + DIRS[d].dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        visited[ny * W + nx] = 1;
      }
    }
  }

  q[qT++] = myIdx;
  let count = 1;

  while (qH < qT && count < limit) {
    const curr = q[qH++];
    const cx = curr % W;
    const cy = (curr - cx) / W;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d].dx;
      const ny = cy + DIRS[d].dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nIdx = ny * W + nx;
      if (visited[nIdx] === 0 && freeAtTurn[nIdx] <= 2) {
        visited[nIdx] = 1;
        count++;
        if (count >= limit) return count;
        q[qT++] = nIdx;
      }
    }
  }
  return count;
}

module.exports = { name: 'OuroborosPrime', move };
