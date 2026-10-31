'use strict';
// SparkStrike v2 - direct predictive charger with own-goal guard + toggle kicks.
function decide(state) {
  try {
    var you = state.you, ball = state.ball;
    if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
    var teammates = state.teammates || [], opponents = state.opponents || [];
    var squad = [you].concat(teammates).slice().sort(cmpId);
    var n = squad.length, mySlot = 0;
    for (var s = 0; s < squad.length; s++) if (String(squad[s].id) === String(you.id)) { mySlot = s; break; }
    if (state.phase === 'kickoff') {
      if (state.kickoffTeam !== state.team) {
        var wy = (mySlot - (n - 1) / 2) * 90, wx = -115;
        if (Math.hypot(wx, wy) < 95) wx = -160;
        return moveTo(you, wx, wy, false);
      }
      var taker = closestTo(squad, 0, 0);
      if (taker && String(taker.id) !== String(you.id))
        return moveTo(you, clampTo(ball.x - 120, -330, -90), clampTo(ball.y * 0.4, -110, 110), false);
      return attack(state, you, ball, opponents);
    }
    if (n === 1) {
      // emergency recovery: ball streaming at our goal and we're beaten
      if (ball.vx < -1.2 && ball.x < 60 && ball.x < you.x && you.x > -350)
        return recover(state, you, ball);
      if (ball.x < -260) return defend(state, you, ball, opponents);
      return attack(state, you, ball, opponents);
    }
    if (mySlot === 0) return goalie(state, you, ball, opponents);
    var field = squad.slice(1);
    var pb = predictBall(ball, chaseTime(you, ball));
    var chaser = closestTo(field, pb.x, pb.y);
    if (chaser && String(chaser.id) === String(you.id)) {
      if (ball.vx < -1.2 && ball.x < 40 && ball.x < you.x - 20) return recover(state, you, ball);
      if (ball.x < -260 && ball.x < you.x) return defend(state, you, ball, opponents);
      return attack(state, you, ball, opponents);
    }
    return support(state, you, ball, opponents, field);
  } catch (e) { return { x: 0, y: 0, kick: false }; }
}
function cmpId(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  var x = String(a.id), y = String(b.id);
  return x < y ? -1 : (x > y ? 1 : 0);
}
function clampTo(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function closestTo(list, x, y) {
  var best = null, bd = Infinity;
  for (var i = 0; i < list.length; i++) {
    var d = Math.hypot(list[i].x - x, list[i].y - y);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && best && cmpId(list[i], best) < 0)) { bd = d; best = list[i]; }
  }
  return best;
}
function nearestOppD(opponents, x, y) {
  var bd = Infinity;
  for (var i = 0; i < opponents.length; i++) { var d = Math.hypot(opponents[i].x - x, opponents[i].y - y); if (d < bd) bd = d; }
  return bd;
}
function predictBall(ball, t) {
  var x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  var steps = Math.max(0, Math.min(80, Math.round(t)));
  for (var i = 0; i < steps; i++) {
    vx *= 0.99; vy *= 0.99; x += vx; y += vy;
    if (x > -410 && x < 410) { if (y > 190) { y = 190; vy *= -0.5; } else if (y < -190) { y = -190; vy *= -0.5; } }
    else { if (y > 55) { y = 55; vy *= -0.5; } else if (y < -55) { y = -55; vy *= -0.5; } }
    if (x > 450) { x = 450; vx *= -0.5; } else if (x < -450) { x = -450; vx *= -0.5; }
  }
  return { x: x, y: y };
}
function chaseTime(you, ball) { return clampTo(Math.hypot(ball.x - you.x, ball.y - you.y) / 2.4, 0, 40); }
function pickAimY(ball, opponents) {
  var gk = null, bd = Infinity;
  for (var i = 0; i < opponents.length; i++) {
    var d = Math.hypot(opponents[i].x - 385, opponents[i].y);
    if (d < bd) { bd = d; gk = opponents[i]; }
  }
  if (Math.abs(ball.y) > 150) return 0;
  var close = Math.hypot(420 - ball.x, ball.y) < 170;
  var MAG = close ? 24 : 34;
  if (gk && bd < 170) {
    if (gk.y > 10) return -34; if (gk.y < -10) return 34;
    return ball.y >= 0 ? -34 : 34;
  }
  if (Math.abs(ball.y) < 25) return ball.y >= 0 ? -30 : 30;
  return ball.y > 0 ? -20 : 20;
}
// Toggle kick every decision while in range: beats 10-step hold cooldown (kick every 6 steps).
function pulseKick(you, want) {
  if (!want) return false;
  return !you.kicking;
}
function moveTo(you, tx, ty, wantKick) {
  var dx = tx - you.x, dy = ty - you.y, d = Math.hypot(dx, dy);
  if (d < 2.5 && Math.hypot(you.vx, you.vy) < 0.6) return { x: 0, y: 0, kick: pulseKick(you, wantKick) };
  var sx = dx * 0.14 - you.vx * 0.75, sy = dy * 0.14 - you.vy * 0.75;
  var m = Math.hypot(sx, sy);
  if (m < 1e-9) {
    if (d <= 0) return { x: 0, y: 0, kick: false };
    sx = dx / d; sy = dy / d;
  } else { sx /= m; sy /= m; }
  if (!isFinite(sx) || !isFinite(sy)) return { x: 0, y: 0, kick: false };
  return { x: sx, y: sy, kick: pulseKick(you, wantKick) };
}
function goalDir(ball, opponents) {
  var ay = pickAimY(ball, opponents), gx = 420 - ball.x, gy = ay - ball.y;
  var l = Math.hypot(gx, gy) || 1;
  return { x: gx / l, y: gy / l };
}
function attack(state, you, ball, opponents) {
  var g = goalDir(ball, opponents);
  var dx = ball.x - you.x, dy = ball.y - you.y, d = Math.hypot(dx, dy) || 1e-4;
  var ux = dx / d, uy = dy / d;
  var behind = ux * g.x + uy * g.y; // 1 = squarely behind ball, -1 = ahead (danger)
  var cross = ux * g.y - uy * g.x;
  var spd = Math.hypot(ball.vx, ball.vy);
  // chase point: lead the ball when fast and far
  var tx = ball.x, ty = ball.y;
  if (spd > 1.4 && d > 45) { var pb = predictBall(ball, chaseTime(you, ball)); tx = pb.x; ty = pb.y; }
  if (d <= 30) {
    if (behind > -0.15) return moveTo(you, ball.x + g.x * 22, ball.y + g.y * 22, true);
    // ahead of ball: do NOT kick toward own goal; swing around (body-block only)
    var side = you.y >= ball.y ? 1 : -1;
    return moveTo(you, ball.x - g.x * 32, clampTo(ball.y - g.y * 32 + side * 34, -195, 195), false);
  }
  if (behind > -0.35) {
    // direct charge (fast approach, no kick slowdown until in range)
    return moveTo(you, tx, ty, d <= 33 && behind > 0);
  }
  // clearly ahead of play: loop around behind without kicking
  var s2 = you.y >= ball.y ? 1 : -1;
  return moveTo(you, clampTo(ball.x - g.x * 30, -430, 430), clampTo(ball.y - g.y * 30 + s2 * 46, -195, 195), false);
}
function defend(state, you, ball, opponents) {
  var upY = ball.y >= 0 ? -140 : 140, cx = 120, cy = upY;
  if (ball.x < -350) { cx = -60; cy = ball.y >= 0 ? -175 : 175; }
  var cdx = cx - ball.x, cdy = cy - ball.y, cl = Math.hypot(cdx, cdy) || 1; cdx /= cl; cdy /= cl;
  var dx = ball.x - you.x, dy = ball.y - you.y, d = Math.hypot(dx, dy) || 1e-4;
  var behind = (dx / d) * cdx + (dy / d) * cdy;
  if (d <= 30) {
    if (behind > -0.1) return moveTo(you, ball.x + cdx * 22, ball.y + cdy * 22, true);
    var side = you.y >= ball.y ? 1 : -1;
    return moveTo(you, clampTo(ball.x - cdx * 30, -430, 430), clampTo(ball.y - cdy * 30 + side * 34, -195, 195), false);
  }
  if (behind > -0.3) return moveTo(you, ball.x, ball.y, d <= 33 && behind > 0.1);
  var s2 = you.y >= ball.y ? 1 : -1;
  return moveTo(you, clampTo(ball.x - cdx * 30, -430, 430), clampTo(ball.y - cdy * 30 + s2 * 40, -195, 195), false);
}
function recover(state, you, ball) {
  // sprint to goal-line intercept point, body-block; kick only if cleanly clearing
  var t = ball.vx < -0.05 ? clampTo((-390 - ball.x) / ball.vx, 0, 80) : 0;
  var pb = predictBall(ball, t);
  var gy = clampTo(pb.y, -50, 50);
  var d = Math.hypot(ball.x - you.x, ball.y - you.y);
  // if we can reach ball before goal line, meet it goal-side
  var ix = clampTo(pb.x - 12, -400, 100);
  if (d < 32) {
    // clear upfield if facing that way, else just block without kicking
    var dx = ball.x - you.x, dy = ball.y - you.y, dd = Math.hypot(dx, dy) || 1e-4;
    if ((dx / dd) > -0.2) return moveTo(you, ball.x + 22, ball.y + (ball.y >= 0 ? -14 : 14), true);
    return moveTo(you, ball.x, ball.y, false);
  }
  return moveTo(you, ix, gy, false);
}
function goalie(state, you, ball, opponents) {
  var t = ball.vx < -0.05 ? clampTo((-385 - ball.x) / ball.vx, 0, 80) : 0;
  var pb = predictBall(ball, t), gy = clampTo(pb.y, -48, 48);
  var d = Math.hypot(ball.x - you.x, ball.y - you.y);
  if (ball.x < -230 && (d < 100 || (ball.x < -320 && d < 170))) return defend(state, you, ball, opponents);
  if (ball.x > 100 && d < 26) return attack(state, you, ball, opponents); // ball at feet: punt it
  return moveTo(you, -385 + (ball.x < -80 ? 10 : 0), gy * 0.9, false);
}
function support(state, you, ball, opponents, field) {
  var order = field.slice().sort(cmpId), rank = 0;
  for (var i = 0; i < order.length; i++) if (String(order[i].id) === String(you.id)) rank = i;
  var lanes = [-125, 125, -60, 60, 0];
  var lane = lanes[rank % lanes.length];
  var sx = clampTo(ball.x - 130, -330, 170);
  if (ball.x < -200) sx = clampTo(ball.x + 110, -350, -80);
  var sy = clampTo(lane * 0.9 + ball.y * 0.25, -170, 170);
  if (Math.hypot(sx - ball.x, sy - ball.y) < 55) sy += sy >= ball.y ? 75 : -75;
  sy = clampTo(sy, -185, 185);
  var d = Math.hypot(ball.x - you.x, ball.y - you.y);
  if (d < 24) { // ball came to us: take it
    if (ball.x < -260) return defend(state, you, ball, opponents);
    return attack(state, you, ball, opponents);
  }
  // poach: if ball loose near enemy goal and no opponent near, crash it
  if (ball.x > 250 && nearestOppD(opponents, ball.x, ball.y) > 70 && d < 150) return attack(state, you, ball, opponents);
  // numbers up: join the attack when ball is in enemy half
  if (ball.x > 60 && rank === 0 && d < 230) return attack(state, you, ball, opponents);
  if (ball.x > 220 && rank <= 1 && d < 260) return attack(state, you, ball, opponents);
  return moveTo(you, sx, sy, false);
}
decide.botName = 'SparkStrike';
module.exports = decide;
