'use strict';

// Tactician: orbit-behind geometry (never kick/push own-way), rising-edge
// kicks, intercept, open-post aim, keeper + support roles.
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function cmpId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  var x = String(a), y = String(b);
  return x < y ? -1 : (x > y ? 1 : 0);
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function go(you, tx, ty, kick) {
  return {
    x: clamp((tx - you.x) * 0.12 - you.vx * 0.65, -1, 1),
    y: clamp((ty - you.y) * 0.12 - you.vy * 0.65, -1, 1),
    kick: kick === true
  };
}

function wantKick(you, should) {
  // Rising edge every other decision (~6 steps) beats held-kick's 10-step repeat.
  return should === true && !you.heldKick;
}

function predict(ball, t) {
  t = Math.max(0, t);
  var k = t > 0 ? (1 - Math.pow(0.99, t)) / 0.01 : 0;
  var px = ball.x + ball.vx * k;
  var py = ball.y + ball.vy * k;
  if (py > 190) py = 380 - py;
  else if (py < -190) py = -380 - py;
  if (Math.abs(py) >= 65) {
    if (px > 410) px = 820 - px;
    else if (px < -410) px = -820 - px;
  } else {
    if (px > 450) px = 900 - px;
    else if (px < -450) px = -900 - px;
  }
  return { x: clamp(px, -450, 450), y: clamp(py, -190, 190) };
}

function pickAim(ball, opponents) {
  var cands = [-46, 0, 46];
  var best = 0, bestScore = -1e9;
  for (var i = 0; i < cands.length; i++) {
    var ty = cands[i];
    var dx = 425 - ball.x, dy = ty - ball.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = dx / len, ny = dy / len;
    var s = -Math.abs(ty) * 0.04;
    for (var j = 0; j < opponents.length; j++) {
      var o = opponents[j];
      var ox = o.x - ball.x, oy = o.y - ball.y;
      var along = ox * nx + oy * ny;
      var perp = Math.abs(ox * ny - oy * nx);
      if (along > 8 && along < len) s += Math.min(perp, 110) * (along < 180 ? 1.2 : 0.4);
      else s += 24;
    }
    if (s > bestScore) { bestScore = s; best = ty; }
  }
  return { x: 425, y: best };
}

function orbitSide(you, ball) {
  var side = you.y >= ball.y ? 1 : -1;
  if (ball.y > 135) side = -1;
  else if (ball.y < -135) side = 1;
  return side;
}

function decide(state) {
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
  var you = state.you, ball = state.ball;

  var squad = [you].concat(state.teammates).slice().sort(function (a, b) {
    return cmpId(a.id, b.id);
  });
  var myIdx = 0;
  for (var i = 0; i < squad.length; i++) {
    if (squad[i].id === you.id) { myIdx = i; break; }
  }
  var n = squad.length;
  var isKeeper = n > 1 && myIdx === 0;

  if (state.phase === 'kickoff') {
    var ours = state.kickoffTeam === state.team;
    if (!ours) {
      return go(you, -155 - myIdx * 50, (myIdx - (n - 1) / 2) * 90, false);
    }
    var taker = squad[n > 1 ? 1 : 0];
    if (taker.id === you.id) {
      var d0 = dist(you.x, you.y, ball.x, ball.y);
      return go(you, ball.x, ball.y, wantKick(you, d0 <= 29));
    }
    return go(you, -160 - myIdx * 40, (myIdx - (n - 1) / 2) * 95, false);
  }

  if (isKeeper) return keep(state, you, ball);

  var pressers = [];
  for (var p = 0; p < squad.length; p++) {
    if (n > 1 && p === 0) continue;
    pressers.push(squad[p]);
  }
  pressers.sort(function (a, b) {
    var d = dist(a.x, a.y, ball.x, ball.y) - dist(b.x, b.y, ball.x, ball.y);
    return d !== 0 ? d : cmpId(a.id, b.id);
  });
  var iAmChaser = !pressers.length || pressers[0].id === you.id;

  if (!iAmChaser) {
    var rank = 0;
    for (var r = 0; r < pressers.length; r++) {
      if (pressers[r].id === you.id) { rank = r; break; }
    }
    var side = (rank % 2 === 0) ? -1 : 1;
    var tx = clamp(ball.x * 0.4 - 90 + rank * 20, -320, 240);
    if (ball.x > 80) tx = clamp(ball.x - 55 + rank * 12, -320, 300);
    var ty = clamp(side * (70 + rank * 24) + ball.y * 0.28, -185, 185);
    var myScore = state.team === 'red' ? state.score.red : state.score.blue;
    var opScore = state.team === 'red' ? state.score.blue : state.score.red;
    if (state.timeLeft < 25 && myScore < opScore) tx = clamp(tx + 110, -320, 280);
    var dMe = dist(you.x, you.y, ball.x, ball.y);
    var dCh = dist(pressers[0].x, pressers[0].y, ball.x, ball.y);
    if (dMe + 50 < dCh) return chase(state, you, ball);
    return go(you, tx, ty, false);
  }

  return chase(state, you, ball);
}

function keep(state, you, ball) {
  var aim = pickAim(ball, state.opponents);
  var alen = Math.hypot(aim.x - ball.x, aim.y - ball.y) || 1;
  var nx = (aim.x - ball.x) / alen, ny = (aim.y - ball.y) / alen;
  var d = dist(you.x, you.y, ball.x, ball.y);
  var dx = ball.x - you.x, dy = ball.y - you.y;
  var behind = d > 0 ? (dx * nx + dy * ny) / d : 1;

  if (ball.x < -280 && d < 90) {
    if (d <= 29 && behind > 0.25) {
      return go(you, ball.x + nx * 24, ball.y + ny * 24, wantKick(you, true));
    }
    return go(you, ball.x - nx * 28, clamp(ball.y - ny * 28, -55, 55), false);
  }
  var goalX = ball.x > -80 ? -365 : -388;
  var t = 0;
  if (ball.vx < -0.08) t = clamp((goalX - ball.x) / ball.vx, 0, 80);
  var pr = predict(ball, t);
  return go(you, goalX, clamp(pr.y, -50, 50), false);
}

function chase(state, you, ball) {
  var aim = pickAim(ball, state.opponents);
  var alen = Math.hypot(aim.x - ball.x, aim.y - ball.y) || 1;
  var nx = (aim.x - ball.x) / alen, ny = (aim.y - ball.y) / alen;

  var dx = ball.x - you.x, dy = ball.y - you.y;
  var d = Math.hypot(dx, dy);
  var behind = d > 0 ? dx * nx + dy * ny : 1;
  var cross = d > 0 ? dx * ny - dy * nx : 0;
  var side = orbitSide(you, ball);

  if (d > 55) {
    var t = clamp(d / 2.7, 0, 40);
    var pr = predict(ball, t);
    // Approach the predicted ball, slightly behind it so we don't overshoot.
    return go(you, pr.x - nx * 18, pr.y - ny * 18, false);
  }

  var aligned = behind > -4 && Math.abs(cross) < 22;
  if (ball.x > 250 && behind > -10 && Math.abs(cross) < 28) aligned = true;
  // Own half, already goal-side: clear instead of orbiting into the net.
  if (ball.x < -240 && you.x < ball.x - 1 && d <= 40) aligned = true;
  if (aligned) {
    var inRange = d <= 31;
    var kickDirOk = d > 0 ? (dx / d) > 0.05 : true;
    if (ball.x < -240) kickDirOk = d > 0 ? (dx / d) > -0.05 : true;
    return go(
      you,
      ball.x + nx * 24,
      ball.y + ny * 24,
      wantKick(you, inRange && kickDirOk)
    );
  }

  var detour = behind < 10 && Math.abs(cross) < 48;
  return go(
    you,
    ball.x - nx * 36,
    clamp(ball.y - ny * 36 + (detour ? side * 55 : 0), -195, 195),
    false
  );
}

decide.botName = 'Tactician';
module.exports = decide;
