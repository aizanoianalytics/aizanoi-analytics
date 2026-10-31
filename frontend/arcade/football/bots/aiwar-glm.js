'use strict';

// GLM Ballistic — physics-aware chaser/keeper hybrid.
// Predicts the ball's damped trajectory, drives to intercept it from the
// correct side, pushes and kicks it toward the enemy goal corner, and
// covers its own goal otherwise.

var MAX_SPEED = 2.64;

function norm(x, y) {
  var d = Math.hypot(x, y);
  return d > 1e-9 ? [x / d, y / d] : [0, 0];
}

// Steering: accelerate along (target - pos) with velocity damping, then
// normalize so we always use full 0.11 acceleration.
function steer(pos, vel, tx, ty) {
  var dx = tx - pos.x, dy = ty - pos.y;
  var l = Math.hypot(dx, dy);
  if (l < 1e-9) {
    var s = Math.hypot(vel.vx, vel.vy);
    if (s < 0.05) return { x: 0, y: 0 };
    return { x: -vel.vx / s, y: -vel.vy / s };
  }
  var ax = dx / l - vel.vx * 0.22;
  var ay = dy / l - vel.vy * 0.22;
  var al = Math.hypot(ax, ay);
  if (al < 1e-9) return { x: 0, y: 0 };
  return { x: ax / al, y: ay / al };
}

// Rough ball path prediction with wall bounces, up to `horizon` steps.
function predictBall(ball, horizon) {
  var x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  var path = [[x, y]];
  for (var t = 1; t <= horizon; t++) {
    vx *= 0.99; vy *= 0.99;
    x += vx; y += vy;
    if (y > 190) { y = 190; if (vy > 0) vy = -vy * 0.5; }
    else if (y < -190) { y = -190; if (vy < 0) vy = -vy * 0.5; }
    if (Math.abs(x) > 410 && Math.abs(y) > 55) {
      if (x > 410) { x = 410; if (vx > 0) vx = -vx * 0.5; }
      else { x = -410; if (vx < 0) vx = -vx * 0.5; }
    }
    if (Math.abs(x) > 430) break;
    path.push([x, y]);
  }
  return path;
}

function decide(state) {
  var f = state.field;
  var me = state.you;
  var ball = state.ball;

  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };

  var attackX = f.enemyGoalX;   // +420 in observation space
  var ownGoalX = f.ownGoalX;    // -420

  // --- role assignment ---------------------------------------------------
  var all = state.teammates.concat([me]);
  var chaser = all[0], best = Infinity;
  for (var i = 0; i < all.length; i++) {
    var p = all[i];
    var d = Math.hypot(p.x - ball.x, p.y - ball.y) - (p.x < ball.x ? 40 : 0);
    if (d < best) { best = d; chaser = p; }
  }
  var iAmChaser = chaser.id === me.id && me.team === chaser.team;

  var v = { vx: me.vx, vy: me.vy };

  // --- kickoff: opponent serves, hold our half line -----------------------
  if (state.phase === 'kickoff' && state.kickoffTeam !== state.team) {
    var tx = Math.min(me.x, -90);
    var ty = ball.y * 0.5;
    return steer(me, v, tx, ty);
  }

  // --- goalkeeper for non-chasers ----------------------------------------
  if (!iAmChaser) {
    var gx = ownGoalX + 50;
    var gy = Math.max(-45, Math.min(45, ball.y * 0.6));
    if (Math.hypot(ball.x - ownGoalX, ball.y) < 300) { gx = ball.x - 40; gy = ball.y; }
    var out = steer(me, v, gx, gy);
    var bdx = ball.x - me.x, bdy = ball.y - me.y;
    if (Math.hypot(bdx, bdy) <= f.kickRange - 1 && ball.x < -220) out.kick = true;
    else out.kick = false;
    out.kick = Boolean(out.kick);
    return out;
  }

  // --- interception -------------------------------------------------------
  var path = predictBall(ball, 40);
  var target = path[path.length - 1];
  for (var t = 0; t < path.length; t++) {
    var bp = path[t];
    var reach = Math.hypot(bp[0] - me.x, bp[1] - me.y) / MAX_SPEED + 1;
    if (reach <= t) { target = bp; break; }
  }
  var bx = target[0], by = target[1];

  // aim for the enemy goal corner away from the nearest opponent
  var aimY = 0;
  for (var k = 0; k < state.opponents.length; k++) {
    var o = state.opponents[k];
    if (o.x > bx - 80) aimY = o.y > 0 ? -35 : 35;
  }
  var gd = norm(attackX - bx, aimY - by);

  // decide where to stand: goal-side behind the ball
  var apx, apy;
  if (me.x < bx - 5) {
    // already behind the ball: drive straight through it toward the goal
    apx = bx - gd[0] * 4;
    apy = by - gd[1] * 4;
  } else {
    // ball is goal-side of me: circle around it on my current side
    var side = (me.y - by) * gd[0] - (me.x - bx) * gd[1];
    var perp = side >= 0 ? -1 : 1;
    apx = bx - gd[0] * 30 + gd[1] * perp * 34;
    apy = by - gd[1] * 30 - gd[0] * perp * 34;
    // if we are already off the shoot line, slip directly behind the ball
    var offLine = Math.abs((me.x - bx) * gd[1] - (me.y - by) * gd[0]);
    if (offLine > 40) { apx = bx - gd[0] * 20; apy = by - gd[1] * 20; }
  }

  var out2 = steer(me, v, apx, apy);

  // --- kicking ------------------------------------------------------------
  var bdx = ball.x - me.x, bdy = ball.y - me.y;
  var bdist = Math.hypot(bdx, bdy);
  out2.kick = false;
  if (bdist <= f.kickRange - 1) {
    var dir = norm(bdx, bdy);
    var forward = dir[0] * gd[0] + dir[1] * gd[1];
    if (forward > 0.3 && me.x < ball.x) out2.kick = true;
    else if (ball.x < -240 && bdx > 4) out2.kick = true; // panic clear
  }

  // do not chase the ball into our own goal mouth: if the ball is drifting
  // toward our goal and we are ahead of it heading in, cut the angle instead
  if (ball.x < -300 && Math.abs(ball.y) < 90 && ball.vx < -0.8 && me.x > ball.x + 10) {
    // we cannot get behind the ball in time: block between ball and goal
    var bt = Math.abs((ownGoalX - ball.x) / (ball.vx || -0.001));
    if (bt < 30 && Math.abs(ball.y + ball.vy * bt) < 70) {
      var px = ball.x + ball.vx * bt - 18, py = ball.y + ball.vy * bt;
      out2 = steer(me, v, px, py);
      out2.kick = false;
    }
  }
  out2.x = Math.max(-1, Math.min(1, out2.x));
  out2.y = Math.max(-1, Math.min(1, out2.y));
  out2.kick = Boolean(out2.kick);
  return out2;
};

decide.botName = 'GLM Ballistic';
module.exports = decide;
