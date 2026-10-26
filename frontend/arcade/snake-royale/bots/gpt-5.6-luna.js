'use strict';

const directions = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
  { name: 'down', dx: 0, dy: 1 }
];

let lastDirection = 0;
let previousTurn = null;

function numberValue(v, fallback) {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function pointOf(v) {
  if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') return null;
  return { x: v.x, y: v.y };
}

function move(state) {
  if (!state || !state.you) return directions[lastDirection].name;

  const width = Math.max(1, numberValue(state.width, 1));
  const height = Math.max(1, numberValue(state.height, 1));
  const size = width * height;
  const turn = numberValue(state.turn, 0);

  if (turn === 0 || (previousTurn !== null && turn < previousTurn)) {
    lastDirection = 0;
  }
  previousTurn = turn;

  const you = state.you;
  const snakes = Array.isArray(state.snakes) ? state.snakes : [you];
  const foodList = Array.isArray(state.food) ? state.food : [];
  const hazardsList = Array.isArray(state.hazards) ? state.hazards : [];

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < width && y < height;
  }

  function pos(x, y) {
    return y * width + x;
  }

  function validPos(p) {
    return p && inBounds(p.x, p.y);
  }

  function bodyOf(snake) {
    if (Array.isArray(snake.body) && snake.body.length) {
      return snake.body;
    }
    return snake.head ? [snake.head] : [];
  }

  function snakeLength(snake) {
    const b = bodyOf(snake);
    return Math.max(1, numberValue(snake.length, b.length || 1));
  }

  const foodSet = new Set();
  const foodPositions = [];
  for (const f of foodList) {
    const p = pointOf(f);
    if (validPos(p)) {
      const n = pos(p.x, p.y);
      if (!foodSet.has(n)) {
        foodSet.add(n);
        foodPositions.push(n);
      }
    }
  }

  const hazardSet = new Set();
  for (const h of hazardsList) {
    const p = pointOf(h);
    if (validPos(p)) hazardSet.add(pos(p.x, p.y));
  }

  const youBody = bodyOf(you);
  const myLength = snakeLength(you);
  const myHealth = numberValue(you.health, 100);
  const myHead = pointOf(you.head) || pointOf(youBody[0]) || { x: 0, y: 0 };

  const ownForbidden = new Set();
  for (let i = 0; i < Math.max(0, youBody.length - 1); i++) {
    const p = pointOf(youBody[i]);
    if (validPos(p)) ownForbidden.add(pos(p.x, p.y));
  }
  const ownTailPoint = youBody.length ? pointOf(youBody[youBody.length - 1]) : null;
  const ownTail = validPos(ownTailPoint) ? pos(ownTailPoint.x, ownTailPoint.y) : -1;

  const opponents = [];
  for (const snake of snakes) {
    if (!snake) continue;
    if (snake === you || (you.id !== undefined && snake.id === you.id)) continue;

    const body = bodyOf(snake);
    const head = pointOf(snake.head) || pointOf(body[0]);
    if (!head) continue;

    const guaranteed = new Set();
    for (let i = 0; i < Math.max(0, body.length - 1); i++) {
      const p = pointOf(body[i]);
      if (validPos(p)) guaranteed.add(pos(p.x, p.y));
    }

    const tailPoint = body.length ? pointOf(body[body.length - 1]) : null;
    const tail = validPos(tailPoint) ? pos(tailPoint.x, tailPoint.y) : -1;

    opponents.push({
      snake,
      body,
      head,
      headPos: pos(head.x, head.y),
      tail,
      guaranteed,
      length: snakeLength(snake),
      health: numberValue(snake.health, 100)
    });
  }

  let ringCount = 0;
  for (const h of hazardsList) {
    const p = pointOf(h);
    if (!validPos(p)) continue;
    const depth = Math.min(p.x, p.y, width - 1 - p.x, height - 1 - p.y);
    ringCount = Math.max(ringCount, depth + 1);
  }

  const ringCap = Math.max(0, Math.floor(Math.min(width, height) / 2) - 1);
  const nextShrink = numberValue(state.nextShrinkTurn, Infinity);
  const shrinkSoon = nextShrink <= turn + 1;
  const futureRing = new Set();

  if (shrinkSoon && ringCount < ringCap) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const depth = Math.min(x, y, width - 1 - x, height - 1 - y);
        if (depth === ringCount) futureRing.add(pos(x, y));
      }
    }
  }

  function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function opponentCanEnter(opponent, target) {
    if (!inBounds(target.x, target.y)) return false;
    const p = pos(target.x, target.y);
    if (hazardSet.has(p)) return false;
    if (opponent.health <= 1 && !foodSet.has(p)) return false;
    if (opponent.guaranteed.has(p)) return false;
    if (foodSet.has(p) && opponent.tail === p) return false;
    return true;
  }

  function analyze(candidate, hasFood, hard) {
    if (!candidate.inBounds) {
      return { score: -1000000000, hard: true };
    }

    const target = candidate.point;
    const targetPos = candidate.pos;
    const blocked = new Set(hazardSet);

    if (shrinkSoon) {
      for (const p of futureRing) blocked.add(p);
    }

    const ownKeep = hasFood ? youBody.length : Math.max(0, youBody.length - 1);
    for (let i = 0; i < ownKeep; i++) {
      const p = pointOf(youBody[i]);
      if (validPos(p)) blocked.add(pos(p.x, p.y));
    }

    for (const opponent of opponents) {
      for (const p of opponent.guaranteed) blocked.add(p);
      if (opponent.body.length <= 1 && opponent.headPos >= 0) {
        blocked.add(opponent.headPos);
      }
    }

    blocked.delete(targetPos);

    const seen = new Int16Array(size);
    seen.fill(-1);
    const queue = new Int32Array(size);
    let first = 0;
    let last = 0;
    let space = 0;
    let nearestFoodDistance = -1;
    let nearestFoodPos = -1;

    if (!blocked.has(targetPos)) {
      queue[last++] = targetPos;
      seen[targetPos] = 0;
    } else {
      queue[last++] = targetPos;
      seen[targetPos] = 0;
    }

    while (first < last) {
      const current = queue[first++];
      const d = seen[current];
      space++;

      if (foodSet.has(current) &&
          (nearestFoodDistance < 0 || d < nearestFoodDistance)) {
        nearestFoodDistance = d;
        nearestFoodPos = current;
      }

      const x = current % width;
      const y = Math.floor(current / width);

      for (const dir of directions) {
        const nx = x + dir.dx;
        const ny = y + dir.dy;
        if (!inBounds(nx, ny)) continue;
        const np = pos(nx, ny);
        if (seen[np] !== -1 || blocked.has(np)) continue;
        seen[np] = d + 1;
        queue[last++] = np;
      }
    }

    let exits = 0;
    for (const dir of directions) {
      const nx = target.x + dir.dx;
      const ny = target.y + dir.dy;
      if (!inBounds(nx, ny)) continue;
      const np = pos(nx, ny);
      if (!blocked.has(np)) exits++;
    }

    const depth = Math.min(
      target.x,
      target.y,
      width - 1 - target.x,
      height - 1 - target.y
    );

    let score = 0;
    score += space * 1.15;
    score += exits * 11;
    score += depth * 3.2;

    if (space <= myLength + 1) score -= 1100;
    else if (space <= myLength + 4) score -= 240;

    if (exits === 0) score -= 500;
    else if (exits === 1) score -= 35;

    if (futureRing.has(targetPos)) score -= 85;

    if (nearestFoodDistance >= 0) {
      let foodValue;
      if (myHealth <= 25) foodValue = 250;
      else if (myHealth <= 55) foodValue = 155;
      else foodValue = 88;

      let nearestEnemyFoodDistance = Infinity;
      if (nearestFoodPos >= 0) {
        const fx = nearestFoodPos % width;
        const fy = Math.floor(nearestFoodPos / width);
        for (const opponent of opponents) {
          nearestEnemyFoodDistance = Math.min(
            nearestEnemyFoodDistance,
            Math.abs(opponent.head.x - fx) + Math.abs(opponent.head.y - fy)
          );
        }
      }

      if (nearestFoodDistance > nearestEnemyFoodDistance + 1) {
        foodValue *= 0.42;
      }

      score += foodValue;
      score -= nearestFoodDistance * (myHealth <= 30 ? 5.5 : 2.6);
      if (nearestFoodDistance === 0) score += 24;
    } else if (myHealth < 20) {
      score -= (20 - myHealth) * 5;
    }

    const resultingLength = myLength + (hasFood ? 1 : 0);

    for (const opponent of opponents) {
      const d = distance(target, opponent.head);

      if (d <= 2 && opponent.length >= resultingLength) {
        score -= (3 - d) * 38;
      } else if (d <= 2 && opponent.length < resultingLength) {
        score += (3 - d) * 11;
      }

      if (d === 1 && opponentCanEnter(opponent, target) &&
          opponent.length < resultingLength) {
        score += 28 + Math.min(24, resultingLength - opponent.length);
      }
    }

    if (candidate.index === lastDirection) score += 4;
    if ((candidate.index + 2) % 4 === lastDirection) score -= 1.5;

    score += (Math.random() - 0.5) * 0.03;
    return { score, hard };
  }

  const candidates = [];
  let bestAllowed = null;
  let bestAny = null;

  for (let i = 0; i < directions.length; i++) {
    const dir = directions[i];
    const x = myHead.x + dir.dx;
    const y = myHead.y + dir.dy;
    const inBoard = inBounds(x, y);
    const p = inBoard ? pos(x, y) : -1;
    const hasFood = inBoard && foodSet.has(p);
    let hard = !inBoard;

    if (inBoard && hazardSet.has(p)) hard = true;
    if (inBoard && ownForbidden.has(p)) hard = true;
    if (inBoard && hasFood && ownTail === p) hard = true;

    if (inBoard && !hasFood && myHealth <= 1) hard = true;

    if (inBoard) {
      for (const opponent of opponents) {
        if (opponent.guaranteed.has(p)) hard = true;

        if (hasFood && opponent.tail === p &&
            distance({ x, y }, opponent.head) === 1) {
          hard = true;
        }

        if (distance({ x, y }, opponent.head) === 1 &&
            opponentCanEnter(opponent, { x, y })) {
          const opponentResultingLength =
            opponent.length + (foodSet.has(p) ? 1 : 0);
          const myResultingLength = myLength + (hasFood ? 1 : 0);
          if (opponentResultingLength >= myResultingLength) {
            hard = true;
          }
        }
      }
    }

    const candidate = {
      index: i,
      point: { x, y },
      pos: p,
      inBounds: inBoard
    };

    const result = analyze(candidate, hasFood, hard);
    candidate.score = result.score;
    candidate.hard = result.hard;
    candidates.push(candidate);

    if (!candidate.hard &&
        (!bestAllowed || candidate.score > bestAllowed.score)) {
      bestAllowed = candidate;
    }
    if (!bestAny || candidate.score > bestAny.score) {
      bestAny = candidate;
    }
  }

  const chosen = bestAllowed || bestAny;
  if (chosen) lastDirection = chosen.index;
  return directions[lastDirection].name;
}

module.exports = {
  name: 'AdaptiveRoyale',
  move
};
