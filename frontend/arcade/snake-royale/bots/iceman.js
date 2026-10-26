// Smart Snake Royale bot
'use strict';

const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0]
};

const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left'
};

// Keep state between turns
let lastMove = null;

function move(state) {
  const { turn, width: W, height: H, you, snakes, food, hazards, nextShrinkTurn } = state;

  const myHead = you.head;
  const myLength = you.length;
  const myHealth = you.health;

  // Build blocked set for current positions (bodies except maybe tails that will move)
  // But need to be precise - tail moves away if not eaten
  const blockedNow = new Set();
  const blockedNext = new Set(); // for next turn prediction

  // For each snake, determine if tail will be removed next turn
  snakes.forEach(snake => {
    const isMe = snake.id === you.id;
    // Check if this snake will eat next turn - we don't know for sure, but we can guess
    // The snake eats if its new head would land on food. But we need to predict moves...
    // For now, be conservative - assume tails don't move unless we're sure
    // Actually in general safer to assume tail stays unless we can predict eating
    snake.body.forEach((p, idx) => {
      // Tail is at index snake.body.length-1
      // If snake will eat, tail stays; else tail leaves
      // We can't perfectly predict others' moves, but be conservative for ourselves
      if (idx === snake.body.length - 1) {
        // For our own snake, we know if we'll eat based on our move
        // For others, assume they might eat (conservative) or might not - safer to assume tail stays?
        // Or easier to just block all body cells for collision avoidance and be careful
        // The engine says "Tails move away on the same turn, except the tail of a snake that just ate"
        // So tail cell becomes free if NOT eaten. To be safe, we should NOT treat current tail as blocked
        // if that snake doesn't eat next turn - but we don't know if others eat. Be conservative.
        blockedNow.add(p.x + ',' + p.y);
      } else {
        blockedNow.add(p.x + ',' + p.y);
      }
    });
  });

  // Also add hazards
  hazards.forEach(p => {
    blockedNow.add(p.x + ',' + p.y);
  });

  // Find safe moves from current position
  const possibleMoves = [];
  for (const dirName of ['up', 'down', 'left', 'right']) {
    if (lastMove && OPPOSITE[dirName] === lastMove && myLength > 1) {
      continue; // can't go back into neck usually, but engine allows? Let us check - you die if enter body cell; neck is body cell
      // body[1] is neck if length > 1
    }
    const [dx, dy] = DIRS[dirName];
    const nx = myHead.x + dx;
    const ny = myHead.y + dy;

    // Check walls
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
      continue;
    }

    // Check if hitting hazard
    const isHazard = hazards.some(h => h.x === nx && h.y === ny);
    if (isHazard) {
      continue;
    }

    // Check if hitting any body (be conservative - assume tails don't move for safety in most cases)
    let willHitBody = false;
    for (const snake of snakes) {
      for (let i = 0; i < snake.body.length; i++) {
        const p = snake.body[i];
        if (p.x === nx && p.y === ny) {
          // If it's the tail and this snake won't eat, tail might move - but hard to tell
          // For our own snake, if we're not eating food there, tail moves
          const isTail = i === snake.body.length - 1;
          if (isTail) {
            // Check if this position has food
            const hasFood = food.some(f => f.x === nx && f.y === ny);
            if (hasFood) {
              // Will eat, tail stays - bad
              willHitBody = true;
              break;
            } else {
              // Tail moves away for snakes that don't eat - so tail cell becomes free
              // But for other snakes, we don't know if they eat; be conservative and don't count tail as blocking?
              // Or count it as blocking to be safe. Better safe.
              // Actually easier to be conservative: assume tail stays blocked
              willHitBody = true;
              break;
            }
          } else {
            willHitBody = true;
            break;
          }
        }
      }
      if (willHitBody) break;
    }
    if (willHitBody) continue;

    // Check head-to-head
    let headToHeadDanger = false;
    for (const snake of snakes) {
      if (snake.id === you.id) continue;
      const otherHead = snake.head;
      const otherNextX = otherHead.x + (DIRS[dirName] ? 0 : 0); // we need to predict their move - they might move toward us
      // Predict: opponents will try to move; for head-to-head, if they move to same cell as us and they're >= length, we die
      // Check all possible moves of opponent? Or assume they move optimally toward food or just be careful
      // Simple heuristic: check if any opponent can move to (nx,ny) and has >= length
      for (const odir of ['up','down','left','right']) {
        const [odx, ody] = DIRS[odir];
        const onx = otherHead.x + odx;
        const ony = otherHead.y + ody;
        if (onx === nx && ony === ny) {
          if (snake.length >= myLength) {
            headToHeadDanger = true;
            break;
          }
        }
      }
      if (headToHeadDanger) break;
    }
    if (headToHeadDanger) {
      // Only avoid if we're not significantly longer? If we're much longer maybe worth it, but risky
      // Be cautious
      continue;
    }

    possibleMoves.push({
      dir: dirName,
      x: nx,
      y: ny,
      distToFood: getMinFoodDist(nx, ny, food),
      isNearEdge: isNearEdge(nx, ny, W, H),
      space: 0 // will calculate
    });
  }

  if (possibleMoves.length === 0) {
    // Must make a move even if bad - try to go straight
    if (lastMove && lastMove !== OPPOSITE[lastMove]) return lastMove;
    return 'up';
  }

  // Calculate reachable space for each move using flood fill
  for (const move of possibleMoves) {
    move.space = getReachableSpace(move.x, move.y, state, move.dir);
  }

  // Filter out moves that lead to trapped spaces smaller than our body (accounting for growth)
  const safeSpaceMoves = possibleMoves.filter(m => {
    // We need at least enough space to survive; if we might eat soon maybe less critical
    const minSpace = myLength + 2; // buffer
    return m.space >= minSpace;
  });

  const candidateMoves = safeSpaceMoves.length > 0 ? safeSpaceMoves : possibleMoves;

  // Decide strategy based on game state
  // Late game - avoid storm, prioritize survival
  const stormClosing = turn >= nextShrinkTurn - 10 || hazardRingApproaching(state);

  // Score each move
  let bestMove = candidateMoves[0];
  let bestScore = -Infinity;

  for (const move of candidateMoves) {
    let score = 0;

    // Survival is top priority
    score += move.space * 10;

    // Avoid edges if storm coming
    if (stormClosing) {
      if (move.isNearEdge) score -= 50;
      // Prefer center
      const distFromCenter = Math.abs(move.x - Math.floor(W/2)) + Math.abs(move.y - Math.floor(H/2));
      score -= distFromCenter * 2;
    }

    // Food seeking
    if (myHealth < 60) {
      // Low health - prioritize food heavily
      score -= move.distToFood * 5;
    } else if (myHealth < 80) {
      score -= move.distToFood * 3;
    } else {
      // High health, be more strategic about food
      // Only go for food if it's valuable or necessary
      if (food.length > 0) {
        score -= move.distToFood * 1;
      }
    }

    // Try to control center
    const centerDist = Math.abs(move.x - Math.floor(W/2)) + Math.abs(move.y - Math.floor(H/2));
    score -= centerDist * 0.5;

    // Avoid getting boxed in by others
    // Prefer moves away from other long snakes
    for (const snake of snakes) {
      if (snake.id === you.id) continue;
      if (snake.length >= myLength) {
        const distToOther = Math.abs(snake.head.x - move.x) + Math.abs(snake.head.y - move.y);
        if (distToOther < 3) {
          score -= 30 / Math.max(1, distToOther);
        }
      }
    }

    // If we're long and others are shorter, be aggressive
    const longerThanMe = snakes.filter(s => s.id !== you.id && s.length > myLength).length;
    const shorterThanMe = snakes.filter(s => s.id !== you.id && s.length < myLength).length;
    if (shorterThanMe > longerThanMe && myLength > 3) {
      // Can be a bit more aggressive
      score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  lastMove = bestMove.dir;
  return bestMove.dir;
}

function getMinFoodDist(x, y, food) {
  if (food.length === 0) return 1000;
  let min = Infinity;
  for (const f of food) {
    const d = Math.abs(f.x - x) + Math.abs(f.y - y);
    if (d < min) min = d;
  }
  return min;
}

function isNearEdge(x, y, W, H, margin = 2) {
  return x < margin || x >= W - margin || y < margin || y >= H - margin;
}

function hazardRingApproaching(state) {
  const { turn, nextShrinkTurn } = state;
  return turn >= nextShrinkTurn - 5;
}

function getReachableSpace(startX, startY, state, moveDir) {
  const { width: W, height: H, you, snakes, food, hazards } = state;
  const visited = new Set();
  const queue = [[startX, startY]];
  visited.add(startX + ',' + startY);
  let count = 0;

  // Build blocked set for this simulation
  const blocked = new Set();
  hazards.forEach(p => blocked.add(p.x + ',' + p.y));

  // Block all snake bodies (conservative)
  snakes.forEach(snake => {
    snake.body.forEach((p, idx) => {
      // Don't block tail if it's not eating - but hard to predict
      const isTail = idx === snake.body.length - 1;
      if (isTail && snake.id !== you.id) {
        // For others, be conservative and block it
        blocked.add(p.x + ',' + p.y);
      } else if (snake.id === you.id && isTail) {
        // For us, tail moves if not eating
        const willEat = food.some(f => f.x === startX && f.y === startY);
        if (!willEat) {
          // tail will move, don't block
        } else {
          blocked.add(p.x + ',' + p.y);
        }
      } else {
        blocked.add(p.x + ',' + p.y);
      }
    });
  });

  let head = 0;
  while (head < queue.length && count < 200) { // limit to avoid timeout
    const [x, y] = queue[head++];
    count++;
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      const key = nx + ',' + ny;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (visited.has(key)) continue;
      if (blocked.has(key)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return count;
}

module.exports = { name: 'CunningSerpent', move };
