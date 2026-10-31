'use strict';

// Aras: role-based football bot (works 1v1 through 4v4, either color).
// Oriented coords: attack +x (own goal -420, enemy +420).
// Plan: sort-squad roles (idx0 striker ... last keeper), predicted intercepts,
// behind-ball shooting/passing/clearing with kick-pulse (rising edge every
// other decision beats 10-step held cooldown), PD steering, kickoff discipline.

var prevKick = false;
var guardHold = false; // 1v1 mouth-guard hysteresis
var detSide = 0; // sticky detour side

function cmpId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  var x = String(a), y = String(b);
  return x < y ? -1 : (x > y ? 1 : 0);
}
function clamp(v, l) { return v < -l ? -l : (v > l ? v : v); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Predict ball position t steps ahead with simple wall bounces (friction .99).
function predictY(ball, t) {
  var x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  for (var i = 0; i < t; i++) {
    vx *= 0.99; vy *= 0.99;
    x += vx; y += vy;
    if (Math.abs(x) <= 420) {
      if (y > 190) { y = 190; if (vy > 0) vy *= -0.5; }
      else if (y < -190) { y = -190; if (vy < 0) vy *= -0.5; }
    } else {
      if (y > 55) { y = 55; if (vy > 0) vy *= -0.5; }
      else if (y < -55) { y = -55; if (vy < 0) vy *= -0.5; }
      if (x > 410) { x = 410; if (vx > 0) vx *= -0.5; }
      else if (x < -410) { x = -410; if (vx < 0) vx *= -0.5; }
    }
  }
  return { x: x, y: y, vx: vx, vy: vy };
}

function move(you, tx, ty, kick) {
  return {
    x: clamp((tx - you.x) * 0.12 - you.vx * 0.65, 1),
    y: clamp((ty - you.y) * 0.12 - you.vy * 0.65, 1),
    kick: kick === true
  };
}

// Pulsed kicking: rising edge re-arms every other decision, kicking every
// ~6 steps instead of every 10 while held. Call with want=true only when
// aligned & in range; it toggles. Call with false to re-arm.
function pulse(want) {
  if (!want) { prevKick = false; return false; }
  var k = !prevKick;
  prevKick = k;
  return k;
}

function decide(state) {
  try {
    if (state.phase === 'goal') { prevKick = false; guardHold = false; detSide = 0; return { x: 0, y: 0, kick: false }; }
    var you = state.you, ball = state.ball, F = state.field;
    var squad = [you].concat(state.teammates).sort(function (a, b) { return cmpId(a.id, b.id); });
    var n = squad.length, myIdx = -1, i;
    for (i = 0; i < n; i++) if (squad[i].id === you.id) { myIdx = i; break; }
    var keeperIdx = n - 1;
    var isKeeper = n > 1 && myIdx === keeperIdx;

    // Score context: protect lead late, chase when behind.
    var myScore = state.team === 'red' ? state.score.red : state.score.blue;
    var opScore = state.team === 'red' ? state.score.blue : state.score.red;
    var stall = (myScore > opScore) && state.timeLeft < 15 && state.phase === 'play';
    var chaseAll = (myScore < opScore) && state.timeLeft < 20;

    // ---- kickoff (opponent's): hold disciplined own-half shape ----
    if (state.phase === 'kickoff' && state.kickoffTeam !== state.team) {
      var sx = isKeeper ? -385 : (-170 - myIdx * 25);
      var sy = isKeeper ? clamp(ball.y * 0.2, 48) : (myIdx - (n - 1) / 2) * 85;
      if (Math.hypot(sx, sy) < 95) { sx = -150; sy = sy >= 0 ? 70 : -70; }
      prevKick = false;
      return move(you, sx, clamp(sy, 190), false);
    }

    // ---- goalkeeper ----
    if (isKeeper && !chaseAll) {
      var goalX = -385;
      var tHit = ball.vx < -0.05 ? clamp((goalX - ball.x) / ball.vx, 90) : 0;
      var py = clamp(ball.y + ball.vy * Math.max(0, tHit), 48);
      var dKB = dist(you.x, you.y, ball.x, ball.y);
      // Engage only when the keeper is clearly closest AND near enough to
      // reach: otherwise HOLD the goal. A wandering keeper concedes.
      var mine = false;
      if (ball.x < -180 && dKB < 95) {
        mine = true;
        for (i = 0; i < n; i++) {
          if (i === keeperIdx) continue;
          if (dist(squad[i].x, squad[i].y, ball.x, ball.y) < dKB + 5) { mine = false; break; }
        }
      }
      if (mine) {
        // Block: stand between ball and goal mouth, clear when it arrives.
        // Never route wide — the keeper must not leave the mouth.
        var blkX = Math.max(ball.x - 18, -400);
        var blkY = clamp(ball.y, 50);
        if (dKB <= F.kickRange + 2) {
          var k = pulse(true);
          return move(you, ball.x + 60, ball.y, k);
        }
        pulse(false);
        return move(you, blkX, blkY, false);
      }
      prevKick = false;
      // Slightly out to cut angle; never chase past the spot.
      var gx = ball.x < -120 ? goalX : goalX - 15;
      return move(you, gx, py, false);
    }

    // ---- field players: closest (non-keeper) chases ----
    var chaser = null, chaserD = 1e18;
    var pool = n > 1 ? squad.filter(function (_, k) { return k !== keeperIdx; }) : squad;
    for (i = 0; i < pool.length; i++) {
      var d = dist(pool[i].x, pool[i].y, ball.x, ball.y);
      if (d < chaserD - 1e-9 || (Math.abs(d - chaserD) < 1e-9 && chaser && cmpId(pool[i].id, chaser.id) < 0)) {
        chaserD = d; chaser = pool[i];
      }
    }
    var iChase = chaser && chaser.id === you.id;

    if (!iChase) {
      // Support shape: goalside-ish, wide, staggered by index. Late chase-all: push up.
      var bxRaw = (ball.x - 120) / 2 - 40;
      var bx = Math.max(chaseAll ? -80 : -330, Math.min(chaseAll ? 260 : 140, bxRaw));
      var side = (myIdx % 2 === 0) ? 1 : -1;
      var byy = clamp(ball.y * 0.25 + side * 95, 185);
      // Second supporter takes opposite half-width when 3+ outfield.
      if (pool.length > 2 && myIdx > 1) byy = clamp(ball.y * 0.2 - side * 60, 185);
      prevKick = false;
      // If ball rolls at us, still take it on arrival (chaser race re-runs each tick).
      if (dist(you.x, you.y, ball.x, ball.y) < 26) {
        var gk = pickTarget(state, you, ball, stall);
        return playBall(state, you, ball, gk, 29, true);
      }
      return move(you, bx, byy, false);
    }

    // ---- chaser: pick target then play ball ----
    var target = pickTarget(state, you, ball, stall);
    return playBall(state, you, ball, target, chaseAll ? 30 : 29, false);

  } catch (e) {
    prevKick = false;
    return { x: 0, y: 0, kick: false };
  }
}

// Choose where the ball should go: goal shot, pass to open teammate, corner
// stall, or safe carry. Returns {x,y} target point.
function pickTarget(state, you, ball, stall) {
  if (stall) return { x: 320, y: (you.y >= 0 ? 165 : -165) }; // pin in corner
  // Goal aim: shoot away from enemy keeper.
  var gy = 0, gd = 1e18, i;
  for (i = 0; i < state.opponents.length; i++) {
    var o = state.opponents[i];
    if (o.x > 250) { var d = Math.abs(o.x - 420) + Math.abs(o.y) * 0.5; if (d < gd) { gd = d; gy = o.y; } }
  }
  var aimY = gd < 1e17 ? (gy >= 0 ? -38 : 38) : clamp(-ball.y * 0.4, 38);
  if (Math.abs(ball.y) > 120) aimY = ball.y > 0 ? -34 : 34; // tight angle -> far post
  var goal = { x: 420, y: clamp(aimY, 42) };

  // Only consider shooting from midfield up; else carry or pass.
  var laneBlocked = false;
  for (i = 0; i < state.opponents.length; i++) {
    var p = state.opponents[i];
    // Opponent inside corridor ball->goal?
    var dx = goal.x - ball.x, dy = goal.y - ball.y;
    var L = Math.hypot(dx, dy) || 1;
    var t = ((p.x - ball.x) * dx + (p.y - ball.y) * dy) / (L * L);
    if (t > 0.05 && t < 0.95) {
      var cx = ball.x + dx * t - p.x, cy = ball.y + dy * t - p.y;
      if (Math.hypot(cx, cy) < 34) { laneBlocked = true; break; }
    }
  }
  // Pass to most open teammate ahead when lane blocked or teammate free.
  if (laneBlocked || ball.x < 40) {
    var bestT = null, bestS = ball.x > 60 ? 60 : 30; // bar: must be worth it
    for (i = 0; i < state.teammates.length; i++) {
      var m = state.teammates[i];
      if (m.x < ball.x - 60) continue; // no back passes into pressure
      var opD = 1e18, k;
      for (k = 0; k < state.opponents.length; k++)
        opD = Math.min(opD, dist(m.x, m.y, state.opponents[k].x, state.opponents[k].y));
      var s = opD + (m.x - ball.x) * 0.5;
      if (s > bestS) { bestS = s; bestT = m; }
    }
    if (bestT) return { x: bestT.x + bestT.vx * 8, y: bestT.y + bestT.vy * 8 };
  }
  if (ball.x < -30) {
    // Carry upfield. With teammates around, dodge a stacked central lane up
    // the emptier wing (also the kickoff answer vs a set defense). Solo,
    // stay central where escape routes exist.
    if (state.teammates.length > 0) {
      var upN = 0, dnN = 0, pi;
      for (pi = 0; pi < state.opponents.length; pi++) {
        var po = state.opponents[pi];
        if (po.x > ball.x - 40 && po.x < ball.x + 160 && Math.abs(po.y) < 90) {
          if (po.y >= 0) upN++; else dnN++;
        }
      }
      if (upN + dnN > 0) {
        var wside = upN > dnN ? -1 : 1;
        if (upN === dnN) wside = you.y >= 0 ? 1 : -1;
        return { x: 180, y: wside * 150 };
      }
    }
    return { x: 200, y: clamp(ball.y * 0.5 + (ball.y >= 0 ? 40 : -40), 150) };
  }
  return goal;
}

// Chase via earliest intercept, get behind ball vs target, kick only when
// aligned (pulse). Keeper/clear mode kicks tighter through the ball.
function playBall(state, you, ball, target, kickRange, clearMode) {
  var dx = target.x - ball.x, dy = target.y - ball.y;
  var L = Math.hypot(dx, dy) || 1, nx = dx / L, ny = dy / L;

  // Earliest intercept of predicted ball path (player ~2.5 u/step).
  var ix = ball.x, iy = ball.y, t;
  var px = you.x, py = you.y;
  var bestT = 0, bd = dist(px, py, ball.x, ball.y);
  var pred = { x: ball.x, y: ball.y };
  for (t = 6; t <= 48; t += 6) {
    pred = predictY(ball, t);
    var d = dist(px, py, pred.x, pred.y) - 2.5 * t;
    if (d < bd) { bd = d; ix = pred.x; iy = pred.y; bestT = t; }
  }
  // Ball heading into our goal behind us: cut it off goalside.
  if (ball.vx < -1.5 && ball.x < -60 && ball.x < you.x) {
    var gx = Math.max(-385, ball.x - 25);
    var tt = ball.vx !== 0 ? (gx - ball.x) / ball.vx : 0;
    if (tt > 0 && tt < 40) { var cut = predictY(ball, tt); ix = cut.x; iy = cut.y; }
  }
  // In a scrum stay glued to the live ball; prediction overshoots jitter.
  if (Math.hypot(ball.x - px, ball.y - py) < 60) { ix = ball.x; iy = ball.y; }

  var toBX = ball.x - you.x, toBY = ball.y - you.y;
  var dBall = Math.hypot(toBX, toBY);
  // Behind-ball geometry: b = (you-ball) . n; want b<0 (behind), small cross.
  var vx = you.x - ball.x, vy = you.y - ball.y;
  var behind = -(vx * nx + vy * ny); // >0 means correctly behind ball
  var cross = vx * ny - vy * nx;

  var close = dBall <= kickRange + 2;
  var danger = ball.x < -150;
  var aligned = behind > -4 && Math.abs(cross) < (clearMode ? 22 : 16);
  var wellSet = behind > (danger ? 6 : 2) && Math.abs(cross) < (clearMode ? 16 : 10);

  if (close && wellSet) {
    // Drive through the ball toward target while pulsing the kick.
    var k = pulse(true);
    return move(you, ball.x + nx * 26, ball.y + ny * 26, k);
  }
  // Contest kicks: drive through when set; otherwise toe-poke whenever close
  // unless the kick would fly at our own goal from deep. No yielding.
  if (!danger && dBall <= kickRange + 1 && !clearMode) {
    var kdx = (ball.x - you.x) / (dBall || 1);
    if (!(ball.x < 60 && kdx < -0.45)) {
      var k2 = pulse(true);
      return move(you, ball.x + nx * 26, ball.y + ny * 26, k2);
    }
  }
  pulse(false);
  var nTeam = state.teammates.length + 1;
  var inControl = dBall < 45 && behind > -2;
  var ballGoalward = ball.vx < -0.7 && ball.x > -395;
  // Mouth guard with hysteresis: once committed, hold until the danger
  // passes (ball out of the box) or we take control. This beats flip-flop.
  if (guardHold) {
    var slowFar = Math.hypot(ball.vx, ball.vy) < 0.6 && dBall > 70;
    if (ball.x > -250 || (dBall < 30 && behind > 0) || slowFar) guardHold = false;
    else {
      var gyH = clamp(ball.y + ball.vy * 20, 48);
      return move(you, -390, gyH, false);
    }
  }
  if (!clearMode && ballGoalward && !inControl && nTeam === 1) {
    var tG = (-390 - ball.x) / ball.vx;
    if (tG > 0 && tG < 150) {
      var gyR = clamp(ball.y + ball.vy * Math.min(tG, 60), 48);
      var loose = true, qo;
      if (ball.vx >= -2.2 && ball.x < -300 && behind < 0) {
        // Beaten inside the box: only yield the mouth for a LOOSE ball.
        // Against a carrier keep contesting.
        for (qo = 0; qo < state.opponents.length; qo++)
          if (dist(state.opponents[qo].x, state.opponents[qo].y, ball.x, ball.y) <= 50) { loose = false; break; }
        if (!loose) { /* fall through to contest */ }
        else { guardHold = true; return move(you, -390, gyR, false); }
      } else if (ball.vx < -2.2) { guardHold = true; return move(you, -390, gyR, false); }
      else if (you.x > ball.x - 5) {
        // Slow ball and beaten: get AHEAD of it via the side (never straight
        // through it), then hold the lane as it arrives.
        if (you.x > ball.x + 15) {
          var as = (you.y >= ball.y) ? 1 : -1;
          return move(you, ball.x + 10, clamp(ball.y + as * 70, 170), false);
        }
        return move(you, ball.x - 70, clamp(ball.y, 150), false);
      }
    }
  }
  // Carrier pressure: nearest opponent owns the ball and we're not set —
  // bump the CARRIER (player contact can't score on us), not the ball.
  // Only the chaser does this (support uses clearMode); keeper never.
  if (!inControl && behind < 4 && !clearMode) {
    var car = null, carD = 1e18, ci;
    for (ci = 0; ci < state.opponents.length; ci++) {
      var co = state.opponents[ci];
      var cd = dist(co.x, co.y, ball.x, ball.y);
      if (cd < carD) { carD = cd; car = co; }
    }
    if (car && carD < 35 && dBall > 28 && dBall < 60) {
      return move(you, car.x + car.vx * 4, car.y + car.vy * 4, false);
    }
  }
  // Reset stored detour side once re-engaged or out of danger.
  if (behind > 12 || ball.x > -100) detSide = 0;
  if (danger && behind < 8 && Math.abs(cross) < 42) {
    // Head-on wrong-side: tight loop around the ball, no touch. Sticky side
    // so we don't wobble. (Quick re-engage, no free runs conceded.)
    if (detSide === 0) detSide = cross >= 0 ? 1 : -1;
    if (danger && dBall < 50 && behind < 0) {
      // Close behind with momentum: brake into a sidestep first so we don't
      // plow through the ball's back before the curve clears.
      return move(you, you.x + 20, clamp(you.y + detSide * 80, 185), false);
    }
    return move(you, ball.x - nx * 36, ball.y - ny * 36 + detSide * 55, false);
  }
  // Otherwise always contest: run at (slightly past) the intercept.
  detSide = 0;
  return move(you, ix + nx * 16, iy + ny * 16, false);
}

module.exports = decide;
module.exports.botName = 'Aras';
