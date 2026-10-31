(function () {
'use strict';
// Opus Striker: intercept-prediction football bot.

var BOT_NAME = 'Opus Striker';
var GX = 420;
var lastKick = false;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function hyp(x, y) { return Math.sqrt(x * x + y * y); }

// Simulate ball one step (approximate engine walls/posts).
function ballStep(b) {
  b.vx *= 0.99; b.vy *= 0.99;
  b.x += b.vx; b.y += b.vy;
  for (var i = 0; i < 4; i++) {
    var px = i < 2 ? -420 : 420, py = (i % 2) ? 65 : -65;
    var dx = b.x - px, dy = b.y - py, d = hyp(dx, dy);
    if (d < 18 && d > 0) {
      var nx = dx / d, ny = dy / d;
      b.x = px + nx * 18; b.y = py + ny * 18;
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
    }
  }
  if (Math.abs(b.y) >= 65) {
    if (b.x > 410) { b.x = 410; if (b.vx > 0) b.vx *= -0.5; }
    else if (b.x < -410) { b.x = -410; if (b.vx < 0) b.vx *= -0.5; }
  }
  if (Math.abs(b.x) <= 420) {
    if (b.y > 190) { b.y = 190; if (b.vy > 0) b.vy *= -0.5; }
    else if (b.y < -190) { b.y = -190; if (b.vy < 0) b.vy *= -0.5; }
  } else {
    if (b.y > 55) { b.y = 55; if (b.vy > 0) b.vy *= -0.5; }
    else if (b.y < -55) { b.y = -55; if (b.vy < 0) b.vy *= -0.5; }
  }
  if (b.x > 430 && Math.abs(b.y) <= 55) return 1;
  if (b.x < -430 && Math.abs(b.y) <= 55) return -1;
  return 0;
}

var N = 120;
var traj = [];
function predict(ball) {
  var b = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
  traj.length = 0;
  traj.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, g: 0 });
  var g = 0;
  for (var t = 1; t <= N; t++) {
    if (!g) g = ballStep(b);
    traj.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, g: g });
  }
  return traj;
}

// Distance a player can cover in t steps from rest (approx) plus drift of current velocity.
var reachTab = [];
(function () {
  var v = 0, d = 0;
  for (var t = 0; t <= N + 5; t++) { reachTab.push(d); v = (v + 0.11) * 0.96; d += v; }
})();
var driftTab = [];
(function () { for (var t = 0; t <= N + 5; t++) driftTab.push(0.96 * (1 - Math.pow(0.96, t)) / 0.04); })();
function driftFactor(t) { return t > N + 5 ? 24 : driftTab[t]; }

function timeToReach(p, x, y, radius) {
  for (var t = 0; t <= N; t++) {
    var f = driftFactor(t);
    var dx = x - (p.x + p.vx * f), dy = y - (p.y + p.vy * f);
    if (hyp(dx, dy) - radius <= reachTab[t]) return t;
  }
  return N + 10;
}

// Earliest time a player can get to the predicted ball.
function interceptTime(p, tr, radius) {
  for (var t = 0; t <= N; t++) {
    var f = driftFactor(t);
    var b = tr[t];
    var dx = b.x - (p.x + p.vx * f), dy = b.y - (p.y + p.vy * f);
    if (hyp(dx, dy) - radius <= reachTab[t]) return t;
  }
  return N + 10;
}

function steer(you, tx, ty, arrive) {
  var dx = tx - you.x, dy = ty - you.y;
  var d = hyp(dx, dy);
  var desired = arrive ? Math.min(2.64, d * 0.09) : 2.64;
  var dvx = d > 0 ? dx / d * desired : 0, dvy = d > 0 ? dy / d * desired : 0;
  var ax = dvx - you.vx * 0.96, ay = dvy - you.vy * 0.96;
  var a = hyp(ax, ay);
  if (a < 0.02) return { x: 0, y: 0 };
  return { x: ax / a, y: ay / a };
}

// Evaluate a ball state after a kick: positive good.
function evalBall(b0, opps, mates, you) {
  var b = { x: b0.x, y: b0.y, vx: b0.vx, vy: b0.vy };
  var oppBest = 1e9, mateBest = 1e9;
  for (var t = 1; t <= 120; t++) {
    var g = ballStep(b);
    if (g === 1) return oppBest < t - 2 ? 600 : 1000 - t;
    if (g === -1) return -2000;
    if (t % 3 === 0) {
      for (var i = 0; i < opps.length; i++) {
        var o = opps[i];
        var f = driftFactor(t);
        var d = hyp(b.x - (o.x + o.vx * f), b.y - (o.y + o.vy * f)) - 22;
        if (d <= reachTab[t] && oppBest > t) oppBest = t;
      }
      for (var j = 0; j < mates.length; j++) {
        var m = mates[j];
        var f2 = driftFactor(t);
        var d2 = hyp(b.x - (m.x + m.vx * f2), b.y - (m.y + m.vy * f2)) - 22;
        if (d2 <= reachTab[t] && mateBest > t) mateBest = t;
      }
    }
    if (oppBest < 1e9 && mateBest < 1e9) break;
    if (Math.abs(b.vx) + Math.abs(b.vy) < 0.3) break;
  }
  var v = b.x * 0.5;
  if (b.x < -280 && Math.abs(b.y) < 130) v -= 250;
  if (oppBest < mateBest) v -= 120 + (b.x < 0 ? 100 : 0);
  return v;
}

// Simulate me + ball for up to 3 steps with action; return post-kick ball if kick fires.
function simKick(you, ball, mx, my) {
  var p = { x: you.x, y: you.y, vx: you.vx, vy: you.vy };
  var b = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
  var held = you.heldKick, cd = you.kickCooldown;
  for (var s = 0; s < 3; s++) {
    p.vx = (p.vx + mx * 0.07) * 0.96; p.vy = (p.vy + my * 0.07) * 0.96;
    cd = Math.max(0, cd - 1);
    p.x += p.vx; p.y += p.vy;
    ballStep(b);
    var dx = b.x - p.x, dy = b.y - p.y, d = hyp(dx, dy);
    if (d < 25 && d > 0) {
      var nx = dx / d, ny = dy / d, ov = 25 - d;
      p.x -= nx * ov / 3; p.y -= ny * ov / 3; b.x += nx * ov * 2 / 3; b.y += ny * ov * 2 / 3;
      var rv = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (rv < 0) { var imp = -1.5 * rv / 1.5; p.vx -= imp * nx * 0.5; p.vy -= imp * ny * 0.5; b.vx += imp * nx; b.vy += imp * ny; }
      dx = b.x - p.x; dy = b.y - p.y; d = hyp(dx, dy);
    }
    var ready = !held || cd === 0;
    if (ready && d <= 28.5) {
      var kx = d > 0 ? dx / d : 1, ky = d > 0 ? dy / d : 0;
      return { x: b.x, y: b.y, vx: b.vx + kx * 5, vy: b.vy + ky * 5, step: s };
    }
    held = true;
  }
  return null;
}

function idCmp(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  var l = String(a.id), r = String(b.id);
  return l < r ? -1 : (l > r ? 1 : 0);
}

function attack(state, tr, myT) {
  var you = state.you;
  // Target point: predicted ball at intercept time (bounded).
  var t = Math.min(myT, N);
  var bp = tr[t];
  // Aim: enemy goal, choose y within mouth away from goalkeeper-ish.
  var aimY = clamp(bp.y * 0.3, -35, 35);
  var opps = state.opponents;
  // If an opponent sits in front of goal, aim at the far side.
  var keeper = null, kd = 1e9;
  for (var i = 0; i < opps.length; i++) {
    var dd = hyp(opps[i].x - GX, opps[i].y);
    if (dd < kd) { kd = dd; keeper = opps[i]; }
  }
  if (keeper && kd < 120) aimY = keeper.y > 0 ? -38 : 38;
  var ax = GX + 15 - bp.x, ay = aimY - bp.y;
  var al = hyp(ax, ay) || 1;
  var nx = ax / al, ny = ay / al;
  // Blocker directly in front of ball: rotate aim to go around it.
  for (var k = 0; k < opps.length; k++) {
    var ox = opps[k].x - bp.x, oy = opps[k].y - bp.y, od = hyp(ox, oy);
    if (od < 60 && od > 0) {
      var fwd = (ox * nx + oy * ny) / od, crs = ox * ny - oy * nx;
      if (fwd > 0.6) {
        var sg = crs > 0 ? 1 : (crs < 0 ? -1 : (bp.y > 0 ? 1 : -1));
        if (Math.abs(bp.y) > 150) sg = (bp.y > 0) === (nx > 0) ? -1 : 1;
        var ang = 0.9 * sg, c = Math.cos(ang), sn = Math.sin(ang);
        var nnx = nx * c - ny * sn, nny = nx * sn + ny * c;
        nx = nnx; ny = nny;
        break;
      }
    }
  }
  // Relative position of me w.r.t. ball (at predicted point).
  var rx = bp.x - you.x, ry = bp.y - you.y;
  var behind = rx * nx + ry * ny;
  var cross = rx * ny - ry * nx;
  var tx, ty, arrive = false;
  if (behind > 5 && Math.abs(cross) < 14 + behind * 0.25) {
    tx = bp.x + nx * 20; ty = bp.y + ny * 20;
  } else {
    var back = 28;
    tx = bp.x - nx * back; ty = bp.y - ny * back;
    if (behind < 12 && Math.abs(cross) < 40) {
      // go around: offset perpendicular, toward side we are on
      var side = cross > 0 ? -1 : 1;
      var px = -ny * side, py = nx * side;
      tx = bp.x - nx * 30 + px * 40; ty = bp.y - ny * 30 + py * 40;
    }
  }
  tx = clamp(tx, -432, 432); ty = clamp(ty, -212, 212);
  return steer(you, tx, ty, arrive);
}

function decideKick(state, mv) {
  var you = state.you, ball = state.ball;
  var d = hyp(ball.x - you.x, ball.y - you.y);
  if (d > 29 + 3 * 8) return false;
  var kb = simKick(you, ball, mv.x, mv.y);
  if (!kb) return false;
  var opps = state.opponents, mates = state.teammates;
  var kv = evalBall(kb, opps, mates, you);
  if (kv <= -1000) return false;
  if (kv >= 900) return true;
  // baseline: keep dribbling
  var nearOpp = 1e9;
  for (var i = 0; i < opps.length; i++) nearOpp = Math.min(nearOpp, hyp(opps[i].x - ball.x, opps[i].y - ball.y));
  var base = ball.x * 0.5 + 40 + (nearOpp < 60 ? -150 : 0) + (ball.x < -250 ? -100 : 0);
  return kv > base + 20;
}

function defendPoint(state, tr) {
  var ball = state.ball;
  // look a bit ahead
  var b = tr[Math.min(20, tr.length - 1)];
  var gx = -420, gy = 0;
  var dx = b.x - gx, dy = b.y - gy, d = hyp(dx, dy) || 1;
  var r = Math.min(45, d * 0.5);
  return { x: gx + dx / d * r + 12, y: clamp(gy + dy / d * r, -60, 60) };
}

function decide(state) {
  if (!state || state.phase === 'goal' || !state.you) return { x: 0, y: 0, kick: false };
  var you = state.you, ball = state.ball;
  if (state.phase === 'kickoff' && state.kickoffTeam === state.team) {
    var mine = state.score[state.team], theirs = state.score[state.team === 'red' ? 'blue' : 'red'];
    if (mine > theirs) return { x: clamp(-0.5 - you.vx, -1, 1) * 0 + (you.x > -120 ? -1 : 0), y: you.y > 5 ? -1 : (you.y < -5 ? 1 : 0), kick: false };
  }
  var tr = predict(ball);
  var squad = [you].concat(state.teammates);
  var times = [];
  for (var i = 0; i < squad.length; i++) times.push({ p: squad[i], t: interceptTime(squad[i], tr, 18) });
  times.sort(function (a, b) { return (a.t - b.t) || idCmp(a.p, b.p); });
  var myT = 0;
  for (i = 0; i < times.length; i++) if (times[i].p.id === you.id) myT = times[i].t;
  var oppT = 1e9;
  for (i = 0; i < state.opponents.length; i++) oppT = Math.min(oppT, interceptTime(state.opponents[i], tr, 18));

  var role = 'attack';
  if (times[0].p.id !== you.id) {
    // keeper: the non-attacker closest to own goal
    var rest = times.slice(1).map(function (e) { return e.p; });
    rest.sort(function (a, b) { return (a.x - b.x) || idCmp(a, b); });
    role = rest[0].id === you.id ? 'keeper' : 'support';
    // second chaser if 3+ players and opponent is clearly faster
  }

  var mv, kick = false;
  if (role === 'attack') {
    mv = attack(state, tr, myT);
    // In 1-player teams defend when opponent wins ball race deep in our half
    kick = decideKick(state, mv);
  } else if (role === 'keeper') {
    var dp = defendPoint(state, tr);
    var danger = ball.x < -250 && hyp(ball.x - you.x, ball.y - you.y) < 90;
    if (danger) { mv = attack(state, tr, myT); kick = decideKick(state, mv); }
    else mv = steer(you, dp.x, dp.y, true);
  } else {
    // support: position for a pass / rebound
    var sx = clamp(ball.x + 110, -150, 330);
    var sy = ball.y > 0 ? -80 : 80;
    var mi = 0;
    for (i = 0; i < times.length; i++) if (times[i].p.id === you.id) mi = i;
    if (mi >= 3) { sx = clamp(ball.x - 120, -300, 150); sy = -sy * 0.5; }
    mv = steer(you, sx, sy, true);
    var dB = hyp(ball.x - you.x, ball.y - you.y);
    if (dB < 60) { mv = attack(state, tr, myT); kick = decideKick(state, mv); }
  }
  if (state.phase === 'kickoff' && state.kickoffTeam !== state.team) kick = false;
  var x = mv.x, y = mv.y;
  if (!isFinite(x) || !isFinite(y)) { x = 0; y = 0; }
  // Ensure a fresh rising edge: if we were holding kick and cooldown active, release.
  lastKick = kick;
  return { x: x, y: y, kick: kick === true };
}

module.exports = { name: BOT_NAME, botName: BOT_NAME, decide: decide };
})();
