'use strict';

// Terra Blade - orient-agnostic (attacks +x in observation space).
// Roles: id-sorted idx0 = keeper (when team size >= 2), else closest field player
// chases, rest support. Chaser uses behind-ball geometry + pulsed kicking
// (rising edge every other decision => kick every ~6 steps instead of 10).
// Keeper holds goal line with velocity-predicted Y and clears upfield.
// Kicks only when kick direction agrees with target (no own goals).

var pulse = 0;

function clamp(v, l) {
  return v < -l ? -l : (v > l ? l : v);
}

function cmpId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  var x = String(a), y = String(b);
  return x < y ? -1 : (x > y ? 1 : 0);
}

function move(you, tx, ty, kick) {
  return {
    x: clamp((tx - you.x) * 0.12 - you.vx * 0.65, 1),
    y: clamp((ty - you.y) * 0.12 - you.vy * 0.65, 1),
    kick: kick === true
  };
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Aim point in enemy goal: pick side away from nearest opponent near goal.
function pickAim(ball, opponents) {
  var best = null, bd = Infinity, i, o, d;
  for (i = 0; i < opponents.length; i++) {
    o = opponents[i];
    d = dist(o.x, o.y, 420, ball.y * 0.5);
    if (d < bd) { bd = d; best = o; }
  }
  var aimY = -ball.y * 0.3;
  if (best) {
    aimY = best.y >= 0 ? -42 : 42;
    if (Math.abs(ball.y) > 90) aimY = ball.y > 0 ? 40 : -40;
  } else {
    aimY = ball.y >= 0 ? -35 : 35;
  }
  if (aimY > 48) aimY = 48;
  if (aimY < -48) aimY = -48;
  return { x: 420, y: aimY };
}

// Should we kick from current geometry? kickDir=(ball-me), wantDir=(aim-ball).
function kickOK(me, ball, aimX, aimY, range, nearOwn) {
  var dx = ball.x - me.x, dy = ball.y - me.y;
  var dd = Math.hypot(dx, dy);
  if (dd > range) return false;
  if (dd < 1e-9) return true;
  var ax = aimX - ball.x, ay = aimY - ball.y;
  var al = Math.hypot(ax, ay);
  if (al < 1e-9) return true;
  var dot = (dx * ax + dy * ay) / (dd * al);
  // Near own goal demand clean alignment; elsewhere allow ~40 deg error.
  return nearOwn ? dot > 0.5 : dot > 0.35;
}

// Converging arc to the goal-side of the ball: wide when far off-line,
// tightening as we line up, so we never stall at a fixed waypoint and never
// cut straight through the ball (own-goal risk). No kick while arcing.
function arcTarget(you, ball) {
  var lat = Math.abs(you.y - ball.y);
  var off = lat * 0.5;
  if (off < 20) off = 20; else if (off > 60) off = 60;
  if (you.y < ball.y) off = -off;
  return { x: ball.x - 20, y: ball.y + off };
}

// Sidestep teammates blocking our path so two roles never jaw-lock
// (e.g. keeper retreating through the chaser's lane at kickoff).
function laneFree(you, tx, ty, mates) {
  var dx = tx - you.x, dy = ty - you.y;
  var l = Math.hypot(dx, dy);
  if (l < 1e-9 || !mates || mates.length === 0) return { x: tx, y: ty };
  var nx = dx / l, ny = dy / l;
  var ox = 0, oy = 0;
  for (var i = 0; i < mates.length; i++) {
    var m = mates[i];
    var mx = m.x - you.x, my = m.y - you.y;
    var d = Math.hypot(mx, my);
    if (d < 50 && d > 1e-9 && (mx * nx + my * ny) / d > 0.65) {
      var side = (you.y >= m.y) ? 1 : -1;
      ox += -ny * side * 70;
      oy += nx * side * 70;
    }
  }
  return { x: tx + ox, y: ty + oy };
}

function keeperDecide(state, you, ball, mates, opponents, range) {
  var goalX = -388;
  var predY = ball.y;
  if (ball.vx < -0.05) {
    var t = (goalX - ball.x) / ball.vx;
    if (t < 0) t = 0; else if (t > 90) t = 90;
    predY = ball.y + ball.vy * t;
  }
  if (predY > 48) predY = 48; else if (predY < -48) predY = -48;
  var dBall = dist(you.x, you.y, ball.x, ball.y);
  var mine = state.kickoffTeam === state.team && state.phase === 'kickoff';
  // Never enter our own net chasing the ball; hold the line instead.
  // Attack loose ball only if clearly mine to get and goal is not exposed.
  if (ball.x < -250 && ball.x > -395 && dBall < 100 && !mine && ball.vx < 1.5) {
    var aim = { x: 420, y: ball.y > 0 ? -120 : 120 };
    if ((you.x - ball.x) > 2) {
      // Enemy-side of the ball: arc around, never cross the ball line.
      var w0 = arcTarget(you, ball);
      w0 = laneFree(you, w0.x, w0.y, mates);
      return move(you, w0.x, w0.y, false);
    }
    var ok = kickOK(you, ball, aim.x, aim.y, range, true);
    // Only kick upfield, never sideways into own net.
    if (dBall <= range && (ball.x - you.x) < -4) {
      var g1 = laneFree(you, ball.x + 14, ball.y, mates);
      return move(you, g1.x, g1.y, false);
    }
    var g2 = laneFree(you, ball.x + 8, ball.y, mates);
    return move(you, g2.x, g2.y, ok && (pulse % 2 === 0));
  }
  var g = laneFree(you, goalX, predY, mates);
  if (g.x < -395) g.x = -395;
  return move(you, g.x, g.y, false);
}

function chaserDecide(state, you, ball, mates, opponents, range) {
  var dMe = dist(you.x, you.y, ball.x, ball.y);
  // Stall with lead in attacking corner when winning late.
  var myScore = state.team === 'red' ? state.score.red : state.score.blue;
  var opScore = state.team === 'red' ? state.score.blue : state.score.red;
  var stall = (myScore > opScore) && state.timeLeft < 10 && ball.x > 250;
  var aim = stall ? { x: 420, y: ball.y >= 0 ? 185 : -185 } : pickAim(ball, opponents);
  var ax = aim.x - ball.x, ay = aim.y - ball.y;
  var al = Math.hypot(ax, ay) || 1;
  var nx = ax / al, ny = ay / al;
  var wantPulse = (pulse % 2 === 0);
  // Far: sprint toward a goal-side intercept. Full speed, no kick.
  if (dMe > 48 && !stall) {
    var lead = dMe / 3;
    if (lead > 30) lead = 30;
    var tx = ball.x + ball.vx * lead, ty = ball.y + ball.vy * lead;
    if (ball.x < 150) tx -= 24;
    if (tx > 430) tx = 430; else if (tx < -430) tx = -430;
    if (ty > 200) ty = 200; else if (ty < -200) ty = -200;
    var f = laneFree(you, tx, ty, mates);
    return move(you, f.x, f.y, false);
  }
  var dx = ball.x - you.x, dy = ball.y - you.y;
  var dd = Math.hypot(dx, dy) || 1;
  // Goal-side (own-half side of the ball): every touch drives the ball toward
  // the enemy goal, so drive through and kick. Enemy-side: arc around wide to
  // get goal-side first - never touch or kick from there (own-goal risk).
  if (you.x < ball.x - 2) {
    var dot = (dx * ax + dy * ay) / (dd * al);
    var need = ball.x > -150 ? -1 : (ball.x > -250 ? 0.2 : 0.5);
    var ok = (dd <= range) && (dot > need);
    var q = laneFree(you, ball.x + nx * 30, ball.y + ny * 30, mates);
    return move(you, q.x, q.y, ok && wantPulse);
  }
  var w;
  if (stall) {
    w = laneFree(you, ball.x + nx * 30, ball.y + ny * 30, mates);
    return move(you, w.x, w.y, false);
  }
  w = arcTarget(you, ball);
  w = laneFree(you, w.x, w.y, mates);
  return move(you, w.x, w.y, false);
}

function supportDecide(state, you, ball, mates, idx, range) {
  var dBall = dist(you.x, you.y, ball.x, ball.y);
  // If ball is loose right next to me and clearly goal-side, poke it upfield.
  if (dBall <= range && ball.x < -200 && (ball.x - you.x) > 10) {
    return move(you, ball.x + 10, ball.y, (pulse % 2 === 0));
  }
  var sx = ball.x - 150;
  if (sx < -330) sx = -330; else if (sx > 280) sx = 280;
  var lane = (idx % 2 === 0) ? 110 : -110;
  var sy = ball.y * 0.25 + lane * 0.75;
  if (sy > 170) sy = 170; else if (sy < -170) sy = -170;
  // Push up when attacking so extra bodies crash the box from wide.
  if (ball.x > 80) {
    sx = ball.x - 90;
    if (sx > 320) sx = 320;
    if (sx < -80) sx = -80;
  }
  var s = laneFree(you, sx, sy, mates);
  return move(you, s.x, s.y, false);
}

function decide(state) {
  pulse++;
  try {
    if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
    var you = state.you, ball = state.ball;
    var range = (state.field && state.field.kickRange) || 29;
    var squad = [you].concat(state.teammates);
    squad.sort(function (a, b) { return cmpId(a.id, b.id); });
    var myIdx = 0, i;
    for (i = 0; i < squad.length; i++) {
      if (squad[i].id === you.id) { myIdx = i; break; }
    }
    var n = squad.length;
    // Kickoff waiting positions for non-kickoff team (engine enforces zone).
    if (state.phase === 'kickoff' && state.kickoffTeam !== state.team) {
      if (n >= 2 && myIdx === 0) return move(you, -388, 0, false);
      return move(you, -95 - myIdx * 25, (myIdx % 2 === 0 ? 1 : -1) * 40 * myIdx, false);
    }
    if (n === 1) {
      // Solo: always pressure; chaser geometry keeps us goal-side near own net.
      return chaserDecide(state, you, ball, null, state.opponents, range);
    }
    if (myIdx === 0) {
      return keeperDecide(state, you, ball, state.teammates, state.opponents, range);
    }
    // Closest field player (idx>=1) chases; others support from wide lanes.
    var best = null, bd = Infinity, d;
    for (i = 1; i < n; i++) {
      d = dist(squad[i].x, squad[i].y, ball.x, ball.y);
      if (best === null || d < bd - 8 || (Math.abs(d - bd) <= 8 && cmpId(squad[i].id, best.id) < 0)) {
        bd = d; best = squad[i];
      }
    }
    var myD = dist(you.x, you.y, ball.x, ball.y);
    if (best && best.id === you.id) {
      return chaserDecide(state, you, ball, state.teammates, state.opponents, range);
    }
    // Emergency: ball behind our defence and keeper beaten -> nearest helps.
    if (ball.x < -320 && myD < 70 && you.x < ball.x) {
      return chaserDecide(state, you, ball, state.teammates, state.opponents, range);
    }
    return supportDecide(state, you, ball, state.teammates, myIdx, range);
  } catch (e) {
    return { x: 0, y: 0, kick: false };
  }
}

decide.botName = 'Terra Blade';
module.exports = decide;
