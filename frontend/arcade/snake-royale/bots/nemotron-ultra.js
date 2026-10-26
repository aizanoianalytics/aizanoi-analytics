const DIR_KEYS = ['up', 'down', 'left', 'right'];
const DIR_VECTORS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const OPPOSITE = [1, 0, 3, 2];

let cachedBoard = null;
let cachedTurn = -1;
let myId = null;
let lastMove = -1;

function buildBoard(state) {
  const { width, height, snakes, hazards } = state;
  const size = width * height;
  const blocked = new Uint8Array(size);
  const snakeIdAt = new Int16Array(size);
  const snakeIdxAt = new Int16Array(size);
  const heads = [];
  const tails = [];
  const lengths = [];
  const healths = [];
  const ids = [];
  const bodies = [];

  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    ids.push(s.id);
    lengths.push(s.length);
    healths.push(s.health);
    heads.push(s.head.x, s.head.y);
    const tail = s.body[s.body.length - 1];
    tails.push(tail.x, tail.y);
    const body = [];
    for (let j = 0; j < s.body.length; j++) {
      const p = s.body[j];
      const idx = p.y * width + p.x;
      blocked[idx] = 1;
      snakeIdAt[idx] = i;
      if (snakeIdxAt[idx] === 0) snakeIdxAt[idx] = j;
      body.push(idx);
    }
    bodies.push(body);
  }
  for (const h of hazards) blocked[h.y * width + h.x] = 1;

  return { width, height, size, blocked, snakeIdAt, snakeIdxAt, heads, tails, lengths, healths, ids, bodies };
}

function getBoard(state) {
  if (cachedTurn !== state.turn) {
    cachedBoard = buildBoard(state);
    cachedTurn = state.turn;
  }
  return cachedBoard;
}

function idx(board, x, y) { return y * board.width + x; }
function inBounds(board, x, y) { return x >= 0 && y >= 0 && x < board.width && y < board.height; }

function getSafeMoves(board, headX, headY, mySnakeIdx, myLen, lastMove) {
  const safe = [];
  const myTailX = board.tails[mySnakeIdx * 2];
  const myTailY = board.tails[mySnakeIdx * 2 + 1];
  const myTailIdx = idx(board, myTailX, myTailY);

  for (let d = 0; d < 4; d++) {
    if (lastMove !== -1 && d === OPPOSITE[lastMove]) continue;
    const nx = headX + DIR_VECTORS[d][0];
    const ny = headY + DIR_VECTORS[d][1];
    if (!inBounds(board, nx, ny)) continue;
    const i = idx(board, nx, ny);
    if (board.blocked[i]) {
      if (i === myTailIdx && board.snakeIdAt[i] === mySnakeIdx && (board.snakeIdxAt[i] === myLen - 1 || myLen <= 2)) {
        safe.push(d);
      }
      continue;
    }
    safe.push(d);
  }
  return safe;
}

function manhattan(x1, y1, x2, y2) {
  return (x1 > x2 ? x1 - x2 : x2 - x1) + (y1 > y2 ? y1 - y2 : y2 - y1);
}

const floodQueue = new Int32Array(20000);
const floodVisited = new Uint8Array(20000);

function floodFill(board, startX, startY, maxSteps) {
  const cappedSteps = Math.min(maxSteps, 250);
  const { width, height, blocked, size } = board;
  if (size > floodVisited.length) return cappedSteps;

  floodVisited.fill(0, 0, size);
  let qh = 0, qt = 0;
  floodQueue[qt++] = startX;
  floodQueue[qt++] = startY;
  floodVisited[startY * width + startX] = 1;
  let count = 0;

  while (qh < qt && count < cappedSteps) {
    const x = floodQueue[qh++];
    const y = floodQueue[qh++];
    count++;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_VECTORS[d][0];
      const ny = y + DIR_VECTORS[d][1];
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
        const i = ny * width + nx;
        if (!floodVisited[i] && !blocked[i]) {
          floodVisited[i] = 1;
          floodQueue[qt++] = nx;
          floodQueue[qt++] = ny;
        }
      }
    }
  }
  return count;
}

function getReachableFood(board, x, y, food, myLen) {
  let best = null, bestDist = 1e9;
  for (const f of food) {
    const d = manhattan(x, y, f.x, f.y);
    if (d < bestDist && d <= myLen + 6) {
      const space = floodFill(board, f.x, f.y, myLen * 2);
      if (space >= myLen + 2) {
        bestDist = d;
        best = f;
      }
    }
  }
  return best;
}

function predictThreats(state, board, mySnakeIdx) {
  const threats = [];
  for (let i = 0; i < board.ids.length; i++) {
    if (i === mySnakeIdx) continue;
    const hx = board.heads[i * 2];
    const hy = board.heads[i * 2 + 1];
    const oppLen = board.lengths[i];
    const safeMoves = [];
    for (let d = 0; d < 4; d++) {
      const nx = hx + DIR_VECTORS[d][0];
      const ny = hy + DIR_VECTORS[d][1];
      if (inBounds(board, nx, ny) && !board.blocked[idx(board, nx, ny)]) {
        safeMoves.push(d);
      }
    }
    const willEat = state.food.some(f => f.x === hx && f.y === hy);
    threats.push({ x: hx, y: hy, len: oppLen, health: board.healths[i], idx: i, moves: safeMoves, willEat, body: board.bodies[i] });
  }
  return threats;
}

function getFutureBlocked(board, threats, mySnakeIdx, myMove, myX, myY, myLen) {
  const { width, height, size } = board;
  const future = new Uint8Array(size);
  future.set(board.blocked);

  const myNx = myX + DIR_VECTORS[myMove][0];
  const myNy = myY + DIR_VECTORS[myMove][1];
  future[idx(board, myNx, myNy)] = 1;
  const myTailIdx = board.tails[mySnakeIdx * 2] + board.tails[mySnakeIdx * 2 + 1] * width;
  if (!(myNx === board.tails[mySnakeIdx * 2] && myNy === board.tails[mySnakeIdx * 2 + 1])) {
    future[myTailIdx] = 0;
  }

  for (const t of threats) {
    for (const om of t.moves) {
      const nx = t.x + DIR_VECTORS[om][0];
      const ny = t.y + DIR_VECTORS[om][1];
      if (inBounds(board, nx, ny)) future[idx(board, nx, ny)] = 1;
    }
    if (!t.willEat && t.body.length > 0) {
      const tailIdx = t.body[t.body.length - 1];
      future[tailIdx] = 0;
    }
  }
  return future;
}

function floodFillCustom(blocked, width, height, startX, startY, maxSteps) {
  const cappedSteps = Math.min(maxSteps, 250);
  const size = width * height;
  if (size > floodVisited.length) return cappedSteps;
  floodVisited.fill(0, 0, size);
  let qh = 0, qt = 0;
  floodQueue[qt++] = startX;
  floodQueue[qt++] = startY;
  floodVisited[startY * width + startX] = 1;
  let count = 0;
  while (qh < qt && count < cappedSteps) {
    const x = floodQueue[qh++];
    const y = floodQueue[qh++];
    count++;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_VECTORS[d][0];
      const ny = y + DIR_VECTORS[d][1];
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
        const i = ny * width + nx;
        if (!floodVisited[i] && !blocked[i]) {
          floodVisited[i] = 1;
          floodQueue[qt++] = nx;
          floodQueue[qt++] = ny;
        }
      }
    }
  }
  return count;
}

function willCollideHeadOn(board, myX, myY, myLen, threats, myMove) {
  const nx = myX + DIR_VECTORS[myMove][0];
  const ny = myY + DIR_VECTORS[myMove][1];
  for (const t of threats) {
    if (nx === t.x && ny === t.y) {
      if (myLen <= t.len) return true;
      const forcedCollision = t.moves.length === 1 && t.moves[0] === OPPOSITE[myMove];
      if (!forcedCollision) return true;
    }
    for (const om of t.moves) {
      const onx = t.x + DIR_VECTORS[om][0];
      const ony = t.y + DIR_VECTORS[om][1];
      if (onx === nx && ony === ny && myLen <= t.len) return true;
    }
  }
  return false;
}

function move(state) {
  myId = state.you.id;
  const board = getBoard(state);

  let mySnakeIdx = -1;
  for (let i = 0; i < board.ids.length; i++) if (board.ids[i] === myId) { mySnakeIdx = i; break; }
  if (mySnakeIdx === -1) return 'up';

  const headX = state.you.head.x;
  const headY = state.you.head.y;
  const myLen = state.you.length;
  const myHealth = state.you.health;

  const safeMoves = getSafeMoves(board, headX, headY, mySnakeIdx, myLen, lastMove);
  if (!safeMoves.length) {
    const fallback = getSafeMoves(board, headX, headY, mySnakeIdx, myLen, -1);
    if (fallback.length) { lastMove = fallback[0]; return DIR_KEYS[fallback[0]]; }
    return 'up';
  }
  if (safeMoves.length === 1) {
    lastMove = safeMoves[0];
    return DIR_KEYS[safeMoves[0]];
  }

  const threats = predictThreats(state, board, mySnakeIdx);
  const nearStorm = state.turn >= state.nextShrinkTurn - 8;
  const stormRing = state.turn >= state.nextShrinkTurn ? Math.floor((state.turn - state.nextShrinkTurn) / 20) + 1 : 0;
  const stormActive = stormRing > 0;

  const foodTarget = getReachableFood(board, headX, headY, state.food, myLen);
  const needFood = myHealth < 50 || (myHealth < 70 && state.food.length < 3);

  let bestMove = safeMoves[0];
  let bestScore = -1e9;

  for (const d of safeMoves) {
    const nx = headX + DIR_VECTORS[d][0];
    const ny = headY + DIR_VECTORS[d][1];

    if (willCollideHeadOn(board, headX, headY, myLen, threats, d)) continue;

    const futureBlocked = getFutureBlocked(board, threats, mySnakeIdx, d, headX, headY, myLen);
    const space = floodFillCustom(futureBlocked, board.width, board.height, nx, ny, myLen * 3);
    if (space < myLen + 1) continue;

    let score = space * 1.5;

    let nextSafe = 0;
    for (let d2 = 0; d2 < 4; d2++) {
      const nnx = nx + DIR_VECTORS[d2][0];
      const nny = ny + DIR_VECTORS[d2][1];
      if (inBounds(board, nnx, nny) && !futureBlocked[idx(board, nnx, nny)]) nextSafe++;
    }
    score += nextSafe * 6;

    for (const t of threats) {
      const dist = manhattan(nx, ny, t.x, t.y);
      if (dist === 1) {
        if (myLen > t.len) score += 50;
        else score -= 80;
      } else if (dist === 2) {
        if (myLen > t.len) score += 20;
        else score -= 30;
      } else if (dist <= 3 && myLen <= t.len) {
        score -= 10;
      }
    }

    if (needFood && foodTarget) {
      const foodDist = manhattan(nx, ny, foodTarget.x, foodTarget.y);
      score -= foodDist * 4;
    }

    if (nearStorm || stormActive) {
      const distToEdge = Math.min(nx, ny, board.width - 1 - nx, board.height - 1 - ny);
      score += distToEdge * (stormActive ? 20 : 12);
    } else if (stormRing > 0) {
      const cx = (board.width - 1) / 2;
      const cy = (board.height - 1) / 2;
      const toCenter = manhattan(nx, ny, cx, cy);
      score -= toCenter * 2;
    }

    if (space < myLen * 2) {
      score -= (myLen * 2 - space) * 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = d;
    }
  }

  lastMove = bestMove;
  return DIR_KEYS[bestMove];
}

module.exports = { name: 'Nemotron', move };