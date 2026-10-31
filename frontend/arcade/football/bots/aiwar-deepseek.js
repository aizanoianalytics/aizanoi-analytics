'use strict';

/*
 * AI Football bot.
 *
 * Strategy outline:
 *  - Every seat independently derives the same role assignment from the public
 *    state: the closest player chases the ball, the next deepest player guards
 *    the goal, everyone else supports.
 *  - Attackers approach the ball from the goal side (relative to a chosen aim
 *    point), dribble with body contact when close, and release a compensated
 *    kick (the kick is added to the ball's existing velocity) when a lane opens.
 *  - The goalkeeper stays goal-side of the ball, tracks the predicted crossing
 *    point, and clears upfield.
 */

const memory = {
  step: -1,
  ballX: 0,
  ballY: 0,
  idle: 0
};

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}

function unit(x, y, fallbackX, fallbackY) {
  const length = hypot(x, y);
  if (length < 1e-9) return { x: fallbackX == null ? 1 : fallbackX, y: fallbackY || 0 };
  return { x: x / length, y: y / length };
}

function dist(a, b) {
  return hypot(a.x - b.x, a.y - b.y);
}

function compareIds(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  const first = String(a.id);
  const second = String(b.id);
  return first < second ? -1 : first > second ? 1 : 0;
}

function sameId(a, b) {
  return String(a) === String(b);
}

function predictBall(ball, steps) {
  const t = clamp(steps, 0, 90);
  const decay = Math.pow(0.99, t);
  const travel = 0.99 * (1 - decay) / 0.01;
  return {
    x: ball.x + ball.vx * travel,
    y: ball.y + ball.vy * travel,
    vx: ball.vx * decay,
    vy: ball.vy * decay
  };
}

function segmentClearance(from, to, players) {
  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const length2 = sx * sx + sy * sy;
  if (length2 < 1e-9) return Infinity;
  let best = Infinity;
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];
    let t = ((player.x - from.x) * sx + (player.y - from.y) * sy) / length2;
    if (t <= 0.02 || t >= 0.985) continue;
    const px = from.x + sx * t;
    const py = from.y + sy * t;
    const gap = hypot(player.x - px, player.y - py);
    if (gap < best) best = gap;
  }
  return best;
}

function nearestTargetGap(players, target) {
  let best = Infinity;
  for (let i = 0; i < players.length; i += 1) {
    const gap = dist(players[i], target);
    if (gap < best) best = gap;
  }
  return best;
}

function moveTo(state, targetX, targetY, kick) {
  const you = state.you;
  const dx = targetX - you.x;
  const dy = targetY - you.y;
  const length = hypot(dx, dy);
  let desiredX = 0;
  let desiredY = 0;
  if (length > 1e-6) {
    const speed = Math.min(2.6, length * 0.55);
    desiredX = dx / length * speed;
    desiredY = dy / length * speed;
  }
  let ux = desiredX - you.vx * 0.8;
  let uy = desiredY - you.vy * 0.8;
  const magnitude = hypot(ux, uy);
  if (magnitude < 1e-9) {
    ux = 0;
    uy = 0;
  } else {
    ux /= magnitude;
    uy /= magnitude;
  }
  return { x: ux, y: uy, kick: kick === true };
}

function attackTargets(state) {
  const targets = [];
  const lanes = [-40, -28, -14, 0, 14, 28, 40];
  for (let i = 0; i < lanes.length; i += 1) {
    const y = lanes[i];
    targets.push({ x: 420, y: y, goal: true, lane: y });
  }
  return targets;
}

function chooseAttackTarget(state) {
  const ball = state.ball;
  const you = state.you;
  const opponents = state.opponents;
  const targets = attackTargets(state);
  const rel = unit(ball.x - you.x, ball.y - you.y, 1, 0);
  let best = null;
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const clearance = segmentClearance(ball, target, opponents);
    const targetGap = nearestTargetGap(opponents, target);
    const corner = Math.abs(target.y) / 40;
    const targetDir = unit(target.x - ball.x, target.y - ball.y, 1, 0);
    const alignment = rel.x * targetDir.x + rel.y * targetDir.y;
    let score = Math.min(clearance, 140) +
      Math.min(targetGap, 110) * 0.65 +
      corner * 7;
    if (ball.x > 300) score += corner * 12;
    if (ball.x > 250) score += Math.max(0, alignment) * 34;
    if (ball.x < -100) score -= 10;
    if (!best || score > best.score) {
      best = {
        x: target.x,
        y: target.y,
        score: score,
        clearance: clearance,
        goal: true
      };
    }
  }
  return best;
}

function chooseDribbleTarget(state, shot) {
  const ball = state.ball;
  const opponents = state.opponents;
  if (shot.clearance > 30) return shot;
  let blocker = null;
  let blockerDistance = Infinity;
  for (let i = 0; i < opponents.length; i += 1) {
    const gap = dist(opponents[i], ball);
    if (gap < blockerDistance) {
      blockerDistance = gap;
      blocker = opponents[i];
    }
  }
  const forward = unit(420 - ball.x, -ball.y, 1, 0);
  const perpX = -forward.y;
  const perpY = forward.x;
  let side = 1;
  if (blocker) {
    side = (ball.y - blocker.y) >= 0 ? 1 : -1;
    const lateral = (ball.x - blocker.x) * perpX + (ball.y - blocker.y) * perpY;
    if (Math.abs(lateral) > 12) side = lateral > 0 ? 1 : -1;
  } else if (ball.y > 0) {
    side = -1;
  }
  const reach = ball.x < -100 ? 150 : 110;
  return {
    x: clamp(ball.x + forward.x * reach + perpX * side * 110, -390, 390),
    y: clamp(ball.y + forward.y * reach + perpY * side * 110, -165, 165),
    goal: false,
    clearance: shot.clearance
  };
}

function kickDirection(state, target) {
  const ball = state.ball;
  const direction = unit(target.x - ball.x, target.y - ball.y, 1, 0);
  const vx = ball.vx;
  const vy = ball.vy;
  const along = vx * direction.x + vy * direction.y;
  const speed2 = vx * vx + vy * vy;
  const discriminant = along * along - speed2 + 25;
  if (discriminant >= 0) {
    const finalSpeed = along + Math.sqrt(discriminant);
    if (finalSpeed > 1e-6) {
      const nx = (finalSpeed * direction.x - vx) / 5;
      const ny = (finalSpeed * direction.y - vy) / 5;
      const length = hypot(nx, ny);
      if (length > 1e-6) return { x: nx / length, y: ny / length };
    }
  }
  // Too much sideways velocity for a five-unit kick to fully correct. Cancel
  // as much of it as possible while still nudging the ball forward.
  const perpX = -direction.y;
  const perpY = direction.x;
  const sideways = vx * perpX + vy * perpY;
  const cancel = clamp(-sideways / 5, -1, 1);
  const forward = Math.sqrt(Math.max(0, 1 - cancel * cancel));
  return unit(
    direction.x * forward + perpX * cancel,
    direction.y * forward + perpY * cancel,
    direction.x,
    direction.y
  );
}

function escapeAim(ball, aim) {
  const result = { x: aim.x, y: aim.y };
  const nearTop = ball.y > 150;
  const nearBottom = ball.y < -150;
  if (nearTop) result.y = -130;
  if (nearBottom) result.y = 130;
  if (ball.x < -340) result.x = ball.x + 190;
  if (ball.x > 340) result.x = 420;
  if (Math.abs(ball.y) > 150 && ball.x < 340 && ball.x > -340) {
    result.x = ball.x + 120;
  }
  return result;
}

function sideWaypoint(ball, n, you) {
  const perpX = -n.y;
  const perpY = n.x;
  const lateral = (you.x - ball.x) * perpX + (you.y - ball.y) * perpY;
  const ballDistance = hypot(ball.x, ball.y);
  const centerDir = ballDistance > 30 ?
    unit(-ball.x, -ball.y, 0, 0) : { x: 0, y: 0 };
  const candidates = [
    { x: ball.x + perpX * 54, y: ball.y + perpY * 54, side: 1, center: false },
    { x: ball.x - perpX * 54, y: ball.y - perpY * 54, side: -1, center: false }
  ];
  if (ballDistance > 30) {
    candidates.push({
      x: ball.x + centerDir.x * 56,
      y: ball.y + centerDir.y * 56,
      side: 0,
      center: true
    });
  }
  let best = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const outside = Math.max(0, Math.abs(candidate.x) - 424) +
      Math.max(0, Math.abs(candidate.y) - 204);
    let score = -outside * 1000;
    if (candidate.center) {
      score += 40;
    } else if (lateral !== 0 && Math.sign(lateral) === candidate.side) {
      score += 30;
    }
    if (!candidate.center && Math.abs(lateral) < 5) {
      if (Math.abs(candidate.y) < Math.abs(ball.y)) score += 20;
      if (Math.abs(candidate.x) < Math.abs(ball.x)) score += 10;
    }
    if (!best || score > best.score) best = { x: candidate.x, y: candidate.y, score: score };
  }
  return best;
}

function pursueBall(state, aim, options) {
  const you = state.you;
  const ball = state.ball;
  const d0 = dist(you, ball);
  const nearWall = ball.x < -345 || ball.x > 345 || Math.abs(ball.y) > 152;
  const effectiveAim = nearWall ? escapeAim(ball, aim) : aim;
  const n = kickDirection(state, effectiveAim);

  const closing = ball.vx * (ball.x - you.x) + ball.vy * (ball.y - you.y);
  const lead = closing > 0 ? clamp((d0 - 24) / 3, 0, 10) : 0;
  const predicted = predictBall(ball, lead);

  const relX = ball.x - you.x;
  const relY = ball.y - you.y;
  const relDot = relX * n.x + relY * n.y;
  const lateral = relX * -n.y + relY * n.x;

  const offset = options.offset || 21;
  const behindX = predicted.x - n.x * offset;
  const behindY = predicted.y - n.y * offset;

  let targetX = behindX;
  let targetY = behindY;

  const goalMouthDanger = ball.x < -355 && Math.abs(ball.y) < 70 &&
    you.x > ball.x - 2;
  if (goalMouthDanger) {
    const waypoint = sideWaypoint(ball, n, you);
    targetX = waypoint.x;
    targetY = waypoint.y;
  } else if (options.push && !options.canKick && relDot > 8 && d0 < 48) {
    targetX = predicted.x + n.x * 30;
    targetY = predicted.y + n.y * 30;
  }

  let kick = false;
  if (d0 <= 29) {
    const rel = unit(relX, relY, n.x, n.y);
    const alignment = rel.x * n.x + rel.y * n.y;
    const finalX = ball.vx + rel.x * 5;
    const finalY = ball.vy + rel.y * 5;
    let shotOnGoal = false;
    if (finalX > 0.2) {
      const steps = (420 - ball.x) / finalX;
      if (steps > 0) {
        const crossingY = ball.y + finalY * steps;
        if (Math.abs(crossingY) < 46) {
          const lane = segmentClearance(
            ball,
            { x: 420, y: crossingY },
            state.opponents
          );
          if (lane > 24) shotOnGoal = true;
        }
      }
    }
    if (options.canKick && shotOnGoal) {
      kick = true;
    } else if (ball.x < 0 && rel.x > 0.3 && (nearWall || options.canKick)) {
      const pressured = state.opponents.some(function (opponent) {
        return dist(opponent, ball) < 34;
      });
      if (alignment > (pressured ? 0.25 : 0.55)) kick = true;
    } else if (nearWall && d0 < 45 && alignment > 0.5) {
      kick = true;
    }
  }

  return moveTo(state, targetX, targetY, kick);
}

function protectGoal(state) {
  const you = state.you;
  const ball = state.ball;
  const goalSide = you.x <= ball.x - 3;

  let goalLineY = ball.y;
  if (ball.vx < -0.05) {
    const steps = (-420 - ball.x) / ball.vx;
    if (Number.isFinite(steps) && steps > 0 && steps < 180) {
      goalLineY = predictBall(ball, steps).y;
    }
  }
  const goalThreat = ball.x < -290 && Math.abs(goalLineY) < 62;
  if (goalThreat) {
    return moveTo(
      state,
      -404,
      clamp(goalLineY, -58, 58),
      false
    );
  }

  let side = you.y >= ball.y ? 1 : -1;
  if (ball.y + side * 70 > 195) side = -1;
  if (ball.y + side * 70 < -195) side = 1;
  const lateral = Math.abs(you.y - ball.y);

  if (!goalSide && you.x > ball.x - 10) {
    if (lateral < 55) {
      return moveTo(
        state,
        clamp(ball.x + 42, -430, 430),
        clamp(ball.y + side * 70, -205, 205),
        false
      );
    }
    return moveTo(
      state,
      clamp(ball.x - 46, -432, 430),
      clamp(ball.y + side * 70, -205, 205),
      false
    );
  }

  let targetX = clamp(Math.min(ball.x - 38, -400), -432, -400);
  let targetY = clamp(ball.y, -62, 62);
  if (ball.vx < -0.4) {
    const steps = (targetX - ball.x) / ball.vx;
    if (Number.isFinite(steps) && steps > 0 && steps < 55) {
      const crossing = predictBall(ball, steps);
      targetY = clamp(crossing.y, -62, 62);
    }
  }
  return moveTo(state, targetX, targetY, false);
}

function interceptPoint(state) {
  const you = state.you;
  const ball = state.ball;
  for (let t = 0; t <= 36; t += 2) {
    const predicted = predictBall(ball, t);
    if (dist(you, predicted) <= 2.35 * t + 26) return predicted;
  }
  return predictBall(ball, 36);
}

function defendBall(state) {
  const you = state.you;
  const ball = state.ball;
  const d0 = dist(you, ball);
  const toGoal = unit(-420 - ball.x, -ball.y, -1, 0);
  let targetX;
  let targetY;

  if (ball.x > -50) {
    const intercept = interceptPoint(state);
    targetX = intercept.x;
    targetY = intercept.y;
  } else {
    const standDistance = clamp(62 + Math.max(0, d0 - 30) * 0.22, 62, 110);
    targetX = ball.x + toGoal.x * standDistance;
    targetY = ball.y + toGoal.y * standDistance;
    if (ball.x < -378) {
      targetX = clamp(ball.x - 18, -432, -400);
      targetY = clamp(ball.y, -54, 54);
    } else if (ball.vx < -1) {
      const steps = (targetX - ball.x) / ball.vx;
      if (Number.isFinite(steps) && steps > 0 && steps < 55) {
        const crossing = predictBall(ball, steps);
        targetY = clamp(crossing.y, -62, 62);
      }
    }
  }
  targetX = clamp(targetX, -432, 430);
  targetY = clamp(targetY, -205, 205);

  const goalSide = you.x <= ball.x + 4;
  const rel = unit(ball.x - you.x, ball.y - you.y, 1, 0);
  const aim = escapeAim(ball, { x: 420, y: clamp(ball.y * 0.3, -40, 40) });
  const n = kickDirection(state, aim);
  const alignment = rel.x * n.x + rel.y * n.y;

  if (d0 < 42 && goalSide && rel.x > 0.05) {
    targetX = ball.x + n.x * 30;
    targetY = ball.y + n.y * 30;
  } else if (d0 < 55 && !goalSide && ball.x < -150) {
    const side = ball.y > 0 ? -1 : 1;
    targetX = clamp(ball.x + toGoal.x * 38, -432, 300);
    targetY = clamp(ball.y + toGoal.y * 38 + side * 58, -200, 200);
  }

  let kick = false;
  if (d0 <= 29 && alignment > 0.25) {
    if (ball.x > -180 || rel.x > 0.1) kick = true;
  }
  return moveTo(state, targetX, targetY, kick);
}

function supportTarget(state, index) {
  const ball = state.ball;
  const you = state.you;
  const opponents = state.opponents;
  const attacking = ball.x > -40;
  if (attacking) {
    const spread = index % 2 === 0 ? -1 : 1;
    const depth = 120 + Math.floor(index / 2) * 70;
    let tx = clamp(ball.x + depth, -120, 345);
    let ty = spread * (95 + Math.floor(index / 2) * 35);
    // Drift toward a useful rebound / passing lane.
    if (ball.y * spread > 0) ty *= 0.55;
    return { x: tx, y: ty };
  }
  let tx = clamp(ball.x - 90 - index * 45, -380, 180);
  let ty = clamp(ball.y + (index % 2 === 0 ? -85 : 85), -170, 170);
  // Mark the nearest opponent in the defensive third.
  let mark = null;
  let markGap = Infinity;
  for (let i = 0; i < opponents.length; i += 1) {
    const gap = dist(opponents[i], { x: tx, y: ty });
    if (gap < markGap) {
      markGap = gap;
      mark = opponents[i];
    }
  }
  if (mark && markGap < 130) {
    tx = clamp(mark.x - 20, -390, 220);
    ty = clamp(mark.y, -170, 170);
  }
  return { x: tx, y: ty };
}

function keeperTarget(state) {
  const ball = state.ball;
  const goalSideX = clamp(Math.min(ball.x - 20, -400), -432, -400);
  let steps = 0;
  if (ball.vx < -0.15) {
    steps = (goalSideX - ball.x) / ball.vx;
    if (!Number.isFinite(steps) || steps < 0) steps = 0;
    steps = clamp(steps, 0, 55);
  }
  const crossing = predictBall(ball, steps);
  const targetY = clamp(crossing.y, -52, 52);
  return { x: goalSideX, y: targetY };
}

function keeperAction(state) {
  const ball = state.ball;
  const you = state.you;
  const target = keeperTarget(state);
  const aim = { x: 420, y: clamp(ball.y * 0.4, -42, 42) };
  const n = kickDirection(state, aim);
  const d = dist(you, ball);
  const relX = ball.x - you.x;
  const relY = ball.y - you.y;
  const relDot = relX * n.x + relY * n.y;

  let targetX = target.x;
  let targetY = target.y;
  if (d < 46 && relDot > 4) {
    // Goal-side of the ball: drive through it to clear.
    targetX = ball.x + n.x * 28;
    targetY = ball.y + n.y * 28;
  } else if (relDot < 0 && d < 70) {
    const side = (relX * -n.y + relY * n.x) >= 0 ? 1 : -1;
    targetX = ball.x - n.y * side * 46;
    targetY = ball.y + n.x * side * 46;
  }

  let kick = false;
  if (d <= 29 && relDot > 2) {
    const rel = unit(relX, relY, n.x, n.y);
    if (rel.x * n.x + rel.y * n.y > 0.4) kick = true;
  }
  return moveTo(state, targetX, targetY, kick);
}

function idleLevel(state) {
  if (state.phase !== 'play') {
    memory.idle = 0;
    memory.step = state.step;
    memory.ballX = state.ball.x;
    memory.ballY = state.ball.y;
    return 0;
  }
  if (state.step <= memory.step) return memory.idle;
  const moved = hypot(state.ball.x - memory.ballX, state.ball.y - memory.ballY);
  if (moved < 4) memory.idle += 1;
  else memory.idle = 0;
  memory.step = state.step;
  memory.ballX = state.ball.x;
  memory.ballY = state.ball.y;
  return memory.idle;
}

function decide(state) {
  if (!state || !state.you || !state.ball) return { x: 0, y: 0, kick: false };
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };

  const idle = idleLevel(state);
  if (idle >= 3) {
    const squadNow = [state.you].concat(state.teammates);
    const closest = squadNow.slice().sort(function (a, b) {
      return dist(a, state.ball) - dist(b, state.ball) || compareIds(a, b);
    })[0];
    if (sameId(closest.id, state.you.id)) {
      if (state.ball.x < -220 && state.you.x > state.ball.x - 3) {
        return protectGoal(state);
      }
      const shot = chooseAttackTarget(state);
      const aim = escapeAim(state.ball, { x: 420, y: shot.y });
      return pursueBall(state, aim, {
        canKick: true,
        push: true,
        offset: 20
      });
    }
  }

  const squad = [state.you].concat(state.teammates).sort(compareIds);
  const size = squad.length;
  const lastTouch = state.lastTouches.length ?
    state.lastTouches[state.lastTouches.length - 1] : null;
  let wePossess = Boolean(lastTouch && lastTouch.team === state.team);
  if (state.phase === 'kickoff') wePossess = state.kickoffTeam === state.team;

  const pressure = state.opponents.some(function (opponent) {
    return dist(opponent, state.ball) < 32;
  });
  const shot = chooseAttackTarget(state);
  const aim = chooseDribbleTarget(state, shot);
  let canKick = shot.clearance > 28 &&
    (state.ball.x > 170 || (pressure && state.ball.x < -80 && shot.clearance > 34));
  if (state.ball.x > 320) canKick = shot.clearance > 15;

  if (size === 1) {
    if (state.ball.x < -220 && state.you.x > state.ball.x - 3) {
      return protectGoal(state);
    }
    const wideDefensive = state.ball.x < -80 &&
      Math.abs(state.ball.y) > 70 &&
      state.you.x <= state.ball.x - 3;
    if (wideDefensive) {
      const clearAim = escapeAim(state.ball, { x: 420, y: 0 });
      return pursueBall(state, clearAim, {
        canKick: true,
        push: true,
        offset: 20
      });
    }
    if (wePossess) {
      return pursueBall(state, aim, { canKick: canKick, push: true, offset: 21 });
    }
    return defendBall(state);
  }

  const byBall = squad.slice().sort(function (a, b) {
    return dist(a, state.ball) - dist(b, state.ball) || compareIds(a, b);
  });
  const chaser = byBall[0];
  const rest = byBall.slice(1);
  const keeper = rest.slice().sort(function (a, b) {
    return a.x - b.x || compareIds(a, b);
  })[0];
  const supporters = rest.filter(function (player) {
    return player !== keeper;
  });

  const isChaser = sameId(chaser.id, state.you.id);
  const isKeeper = sameId(keeper.id, state.you.id);

  if (isChaser) {
    if (state.ball.x < -240 && state.you.x > state.ball.x - 3) {
      return protectGoal(state);
    }
    if (wePossess) {
      return pursueBall(state, aim, { canKick: canKick, push: true, offset: 21 });
    }
    return defendBall(state);
  }

  if (isKeeper) {
    // A trailing team can push the keeper up very late; otherwise hold shape.
    const late = state.timeLeft < 18 && state.score[state.team] < state.score[state.team === 'red' ? 'blue' : 'red'];
    if (late && state.ball.x > 80) {
      const shot = chooseAttackTarget(state);
      const aim = chooseDribbleTarget(state, shot);
      return pursueBall(state, aim, { canKick: shot.clearance > 30, push: true, offset: 22 });
    }
    return keeperAction(state);
  }

  const index = supporters.findIndex(function (player) {
    return sameId(player.id, state.you.id);
  });
  const target = supportTarget(state, index < 0 ? 0 : index);
  return moveTo(state, target.x, target.y, false);
}

module.exports = {
  botName: 'DeepSeek Tiki-Taka',
  name: 'DeepSeek Tiki-Taka',
  decide: decide
};
