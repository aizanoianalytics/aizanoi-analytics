'use strict';

// Aras: role-based football bot.
// - Closest to ball attacks (behind-ball approach, gated kicks, corner shots).
// - Farthest back defends goal (predictive keeper, upfield clearances).
// - Others take support lanes. Kicks are pulsed (release/press) so every
//   kick is a rising edge and fires instead of waiting out the held cooldown.
// - Never kicks when in front of the ball relative to the target, so no
//   own-goal gifts. Dribbles with body contact, shoots only with a lane.

function Aras(state) {
  try {
    return decide(state);
  } catch (e) {
    return { x: 0, y: 0, kick: false };
  }
}

var PULSE = {};

function clamp(v, lo, hi) {
  if (v !== v) return 0;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function idStr(id) {
  return String(id);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function go(you, tx, ty, kick) {
  var dx = tx - you.x;
  var dy = ty - you.y;
  var ox = dx * 0.12 - you.vx * 0.65;
  var oy = dy * 0.12 - you.vy * 0.65;
  ox = clamp(ox, -1, 1);
  oy = clamp(oy, -1, 1);
  if (ox === 0 && oy === 0 && (dx !== 0 || dy !== 0)) {
    var L = Math.hypot(dx, dy);
    ox = dx / L;
    oy = dy / L;
  }
  return { x: ox, y: oy, kick: kick === true };
}

function pulsedKick(key, want) {
  if (!want) {
    PULSE[key] = false;
    return false;
  }
  var k = !PULSE[key];
  PULSE[key] = k;
  return k;
}

function predictBall(ball, t) {
  if (t <= 0) return { x: ball.x, y: ball.y };
  var f = (1 - Math.pow(0.99, t)) / 0.01;
  return { x: ball.x + ball.vx * f, y: ball.y + ball.vy * f };
}

function laneOpen(fromX, fromY, nx, ny, range, bodies, skipId) {
  for (var i = 0; i < bodies.length; i++) {
    var b = bodies[i];
    if (skipId !== undefined && idStr(b.id) === skipId) continue;
    var rx = b.x - fromX;
    var ry = b.y - fromY;
    var s = rx * nx + ry * ny;
    if (s > 12 && s < range) {
      var p = rx * -ny + ry * nx;
      if (p > -26 && p < 26) return false;
    }
  }
  return true;
}

function closestTo(bodies, x, y, skipId) {
  var best = null;
  var bestD = Infinity;
  for (var i = 0; i < bodies.length; i++) {
    var b = bodies[i];
    if (skipId !== undefined && idStr(b.id) === skipId) continue;
    var d = dist(b.x, b.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return { body: best, d: bestD };
}

// True when a kick from here cannot send the ball toward our own goal.
// Own-half kicks need a neutral-or-better direction; deep ones must go
// clearly upfield. Coincident centers fall back to the attacking goal.
function kickDirOk(you, ball, myD) {
  if (myD <= 0.5) return true;
  if (ball.x >= 100) return true;
  var kdx = (ball.x - you.x) / myD;
  if (ball.x <= -350) return kdx >= 0;
  if (ball.x <= -250) return kdx >= 0.3;
  return kdx >= -0.15;
}

// Shortest distance from point P to segment AB.
function segDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax;
  var dy = by - ay;
  var L2 = dx * dx + dy * dy;
  var t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Waypoint behind the ball relative to direction n, swinging wide
// instead of shoving the ball the wrong way.
function approachBehind(you, ball, nx, ny, side) {
  var relx = you.x - ball.x;
  var rely = you.y - ball.y;
  var behind = -(relx * nx + rely * ny);
  var cross = relx * -ny + rely * nx;
  var wx, wy;
  if (behind > 4 && cross > -16 && cross < 16) {
    wx = ball.x + nx * 20;
    wy = ball.y + ny * 20;
  } else {
    wx = ball.x - nx * 32;
    wy = ball.y - ny * 32;
    if (behind < 10 && cross > -48 && cross < 48) {
      wx += -ny * side * 60;
      wy += nx * side * 60;
    }
  }
  return { x: wx, y: wy, behind: behind, cross: cross };
}

function attacker(state, you, ball, opps, key) {
  var EGX = 420;
  var myD = dist(you.x, you.y, ball.x, ball.y);
  var oc = closestTo(opps, ball.x, ball.y, undefined);
  var oppD = oc.d;

  // Pick a corner away from both the keeper and the ball side.
  var gk = closestTo(opps, EGX, 0, undefined);
  var gkY = gk.body && gk.body.x > 200 ? gk.body.y : 0;
  var goalDist = dist(ball.x, ball.y, EGX, 0);
  var ty;
  if (goalDist < 70) {
    ty = 0;
  } else {
    var lean = gkY + ball.y * 0.4;
    if (lean > 12) ty = -30;
    else if (lean < -12) ty = 30;
    else ty = ball.y >= 0 ? -30 : 30;
  }
  var tx = EGX;
  var L = Math.hypot(tx - ball.x, ty - ball.y) || 1;
  var nx = (tx - ball.x) / L;
  var ny = (ty - ball.y) / L;
  var side = you.y >= ball.y ? 1 : -1;

  var wantKick = false;
  var wp;

  // Incoming: ball on our half/midfield moving toward our goal, at any
  // pace. Stage goal-side and wide, then step in and contest. Never run
  // straight through the ball near our goal: that shoves it in.
  if (ball.x < 150 && ball.vx < -0.5) {
    var it = 90;
    for (var s = 0; s <= 90; s += 2) {
      var q = predictBall(ball, s);
      if (dist(you.x, you.y, q.x, q.y) <= 2.6 * s + 25) {
        it = s;
        break;
      }
    }
    var pb = predictBall(ball, it);
    // Stage goal-side and wide, then step in. Never run straight through
    // the ball near our goal: that shoves it in with body contact.
    if (myD > 32) {
      wp = { x: pb.x - 20, y: pb.y + side * 45 };
    } else {
      wp = { x: ball.x, y: ball.y };
    }
    wantKick = myD <= 29 && you.x <= ball.x;
  } else {
  // Fast ball elsewhere: run to meet it from the attacking side first.
  // Never pre-position past a fast ball: the far-side waypoint concedes
  // the re-kick race to whoever already waits behind it.
  var ballSpeed = Math.hypot(ball.vx, ball.vy);
  if (oppD < 45 && myD < 80 && ballSpeed < 2.5 && ball.x < 60 &&
             you.x < ball.x + 15) {
    // Defensive press only on our half: their carrier is close and the
    // ball is slow. Step in and take it; never poke at it upfield.
    wp = { x: ball.x, y: ball.y };
    wantKick = myD <= 29 && you.x <= ball.x + 2;
  } else if (ballSpeed > 2 && myD > 25) {
    var ct = clamp(myD / 2.75 * 0.4, 2, 20);
    var cp = predictBall(ball, ct);
    wp = { x: cp.x - nx * 10, y: cp.y - ny * 10 };
    wantKick = false;
  } else {
  if (ball.x < -240) {
    // Danger zone: clear upfield toward the emptier flank.
    var up = 0, down = 0;
    for (var i = 0; i < opps.length; i++) {
      if (opps[i].y >= 0) up++;
      else down++;
    }
    var cy = up > down ? -140 : 140;
    var cx = 320;
    var cl = Math.hypot(cx - ball.x, cy - ball.y) || 1;
    var cnx = (cx - ball.x) / cl;
    var cny = (cy - ball.y) / cl;
    var ap = approachBehind(you, ball, cnx, cny, side);
    wp = ap;
    if (ap.behind > 2 && ap.cross > -18 && ap.cross < 18) {
      wp = { x: ball.x + cnx * 20, y: ball.y + cny * 20 };
      wantKick = myD <= 29;
    }
  } else if (ball.x > -120 && goalDist < 380 &&
             (laneOpen(ball.x, ball.y, nx, ny, goalDist, opps, undefined) || goalDist < 150)) {
    // Shooting lane: get behind, then finish.
    var sh = approachBehind(you, ball, nx, ny, side);
    if (sh.behind > 4 && sh.cross > -16 && sh.cross < 16) {
      wp = { x: ball.x + nx * 20, y: ball.y + ny * 20 };
      wantKick = myD <= 29;
    } else {
      wp = sh;
    }
  } else {
    // Dribble: stay behind and push with the body, keep the kick loaded.
    var dr = approachBehind(you, ball, nx, ny, side);
    if (dr.behind > -6 && dr.cross > -26 && dr.cross < 26) {
      wp = { x: ball.x + nx * 22, y: ball.y + ny * 22 };
      // Poke past a tight marker only when already behind the ball.
      if (oppD < 48 && myD <= 29 && dr.behind > 4) wantKick = true;
    } else {
      wp = dr;
    }
  } // close R + B + A (dribble else, fast-ball else, no-emergency else)
  }
  }

  // Deep on our side, only a safe kick direction may fire.
  if (wantKick && !kickDirOk(you, ball, myD)) wantKick = false;

  return go(you, wp.x, wp.y, pulsedKick(key, wantKick));
}

function keeper(state, you, ball, opps, key) {
  var gx = -380;
  var myD = dist(you.x, you.y, ball.x, ball.y);
  var t = 0;
  if (ball.vx < -0.05) t = clamp((gx - ball.x) / ball.vx, 0, 80);
  var py = clamp(ball.y + ball.vy * t, -50, 50);

  if (ball.x < -200 && myD < 150) {
    // Engage: get goal-side of the ball and clear upfield.
    var up = 0;
    for (var i = 0; i < opps.length; i++) {
      if (opps[i].y >= 0) up++;
    }
    var cy = up > opps.length / 2 ? -140 : 140;
    var cx = 320;
    var cl = Math.hypot(cx - ball.x, cy - ball.y) || 1;
    var nx = (cx - ball.x) / cl;
    var ny = (cy - ball.y) / cl;
    var side = you.y >= ball.y ? 1 : -1;
    var ap = approachBehind(you, ball, nx, ny, side);
    if (ap.behind > 2 && ap.cross > -18 && ap.cross < 18) {
      var kw = myD <= 29 && kickDirOk(you, ball, myD);
      return go(you, ball.x + nx * 20, ball.y + ny * 20,
        pulsedKick(key, kw));
    }
    return go(you, ap.x, ap.y, pulsedKick(key, false));
  }
  return go(you, gx, py, pulsedKick(key, false));
}

function support(state, you, ball, rank) {
  var tx, ty;
  var key = idStr(you.id);
  var myD = dist(you.x, you.y, ball.x, ball.y);
  if (myD < 60) {
    // Loose ball right next to us: help out instead of holding formation.
    // Clear it upfield on our half, shoot it on theirs.
    var opps = state.opponents;
    var up = 0;
    for (var i = 0; i < opps.length; i++) {
      if (opps[i].y >= 0) up++;
    }
    var attack = ball.x >= 100;
    var gx = attack ? 420 : 320;
    var gy = attack ? (ball.y >= 0 ? -30 : 30) :
      (up > opps.length / 2 ? -140 : 140);
    var gL = Math.hypot(gx - ball.x, gy - ball.y) || 1;
    var gnx = (gx - ball.x) / gL;
    var gny = (gy - ball.y) / gL;
    var ap = approachBehind(you, ball, gnx, gny, you.y >= ball.y ? 1 : -1);
    if (ap.behind > 2 && ap.cross > -18 && ap.cross < 18) {
      return go(you, ball.x + gnx * 20, ball.y + gny * 20,
        pulsedKick(key, myD <= 29 && kickDirOk(you, ball, myD)));
    }
    return go(you, ap.x, ap.y, pulsedKick(key, false));
  }
  if (rank === 1) {
    if (ball.x < -50) {
      // Collapse goal-side while the ball is deep in our half.
      tx = -240;
      ty = clamp(ball.y * 0.6, -90, 90);
    } else {
      tx = clamp(ball.x - 70, -260, 230);
      ty = ball.y >= 0 ? -115 : 115;
    }
  } else if (rank === 2) {
    tx = -200;
    ty = ball.y >= 0 ? 90 : -90;
  } else {
    tx = -320;
    ty = ball.y >= 0 ? -60 : 60;
  }
  if (state.phase === 'kickoff') tx = Math.min(tx, -95);
  return go(you, tx, ty, pulsedKick(idStr(you.id), false));
}

function decide(state) {
  var you = state.you;
  var ball = state.ball;
  var key = idStr(you.id);

  if (state.phase === 'goal') {
    PULSE = {};
    return { x: 0, y: 0, kick: false };
  }

  var mates = [you].concat(state.teammates);
  var opps = state.opponents;
  var n = mates.length;
  var myD = dist(you.x, you.y, ball.x, ball.y);

  // Rank by distance to ball, deterministic id tiebreak.
  var rank = 0;
  for (var i = 0; i < mates.length; i++) {
    var m = mates[i];
    if (idStr(m.id) === key) continue;
    var d = dist(m.x, m.y, ball.x, ball.y);
    if (d < myD - 1e-9) rank++;
    else if (Math.abs(d - myD) <= 1e-9 && idStr(m.id) < key) rank++;
  }

  var ours = state.team === 'red' ? state.score.red : state.score.blue;
  var theirs = state.team === 'red' ? state.score.blue : state.score.red;
  var losingLate = ours < theirs && state.timeLeft < 25;
  var winningLate = ours > theirs && state.timeLeft < 15;

  if (n === 1) {
    var oc = closestTo(opps, ball.x, ball.y, undefined);
    var threat = ball.x < -120 && (oc.d < myD || ball.vx < -1);
    if (threat && ball.x < you.x + 40) {
      return keeper(state, you, ball, opps, key);
    }
    if (winningLate && ball.x > 200) {
      // Kill the clock in the corner.
      var cy2 = ball.y >= 0 ? 150 : -150;
      return go(you, 390, cy2, pulsedKick(key, false));
    }
    return attacker(state, you, ball, opps, key);
  }

  if (n >= 2) {
    // Fixed keeper: smallest id on the team. Never rotates, so the goal
    // is always minded and nobody chases back from the wrong side.
    var keeperId = key;
    for (var k = 0; k < mates.length; k++) {
      if (idStr(mates[k].id) < keeperId) keeperId = idStr(mates[k].id);
    }
    if (key === keeperId) {
      if (losingLate && ball.x > 60) {
        // Chase half-way when desperate, don't stay glued to the line.
        return go(you, clamp(ball.x - 120, -260, -60), clamp(ball.y * 0.6, -80, 80),
          pulsedKick(key, false));
      }
      if (ball.x < 150) return keeper(state, you, ball, opps, key);
      if (ball.x < 250) {
        // Sweeper: hold a goal-side line while the attack develops.
        return go(you, -240, clamp(ball.y * 0.4, -90, 90),
          pulsedKick(key, false));
      }
      return go(you, -220, clamp(ball.y * 0.3, -60, 60),
        pulsedKick(key, false));
    }
    // Field players: closest non-keeper attacks, rest support.
    var nkRank = 0;
    for (var j = 0; j < mates.length; j++) {
      var om = mates[j];
      if (idStr(om.id) === key || idStr(om.id) === keeperId) continue;
      var od = dist(om.x, om.y, ball.x, ball.y);
      if (od < myD - 1e-9) nkRank++;
      else if (Math.abs(od - myD) <= 1e-9 && idStr(om.id) < key) nkRank++;
    }
    if (nkRank === 0) {
      if (winningLate && ball.x > 200) {
        var cyy = ball.y >= 0 ? 150 : -150;
        return go(you, 390, cyy, pulsedKick(key, false));
      }
      return attacker(state, you, ball, opps, key);
    }
    return support(state, you, ball, nkRank);
  }

  return support(state, you, ball, rank);
}

module.exports = Aras;
module.exports.botName = 'Aras';
module.exports.decide = Aras;
