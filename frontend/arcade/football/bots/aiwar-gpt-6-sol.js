'use strict';
// HexPress - oriented-attack football bot.
// Roles by canonical ID order: slot 0 keeps goal (2v2+), other field players
// elect a chaser (closest to ball) with the rest in support lanes. All kicks
// are behind-ball aimed (far-post/away-from-keeper), wrong-side kicks are
// suppressed to avoid own goals, and kick output is pulsed so every press is
// a rising edge (faster re-kicks + faster movement between presses).

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function cmpId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  var x = String(a), y = String(b);
  return x < y ? -1 : (x > y ? 1 : 0);
}

var pulse = false;

function norm(x, y) {
  var l = Math.hypot(x, y);
  if (l > 1e-9) return { x: x / l, y: y / l, l: l };
  return { x: 0, y: 0, l: 0 };
}

// Ball prediction with 0.99/step decay and one wall reflection pass.
function predictBall(ball, steps) {
  var n = steps > 0 ? steps : 0;
  var k = n === 0 ? 0 : (1 - Math.pow(0.99, n)) / 0.01;
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
  return { x: px, y: py };
}

function chooseAim(ball, opponents, pinCorner) {
  if (pinCorner) return { x: 430, y: ball.y >= 0 ? 150 : -150 };
  var ty = 0;
  if (Math.abs(ball.y) > 25) ty = ball.y > 0 ? -30 : 30;
  var gk = null, gd = 1e9;
  for (var i = 0; i < opponents.length; i++) {
    var o = opponents[i];
    var d = Math.hypot(o.x - 395, o.y);
    if (d < gd) { gd = d; gk = o; }
  }
  if (gk && gd < 130 && gk.x > 280) ty = gk.y >= 0 ? -38 : 38;
  if (Math.abs(ball.y) > 160) ty = 0;
  return { x: 445, y: clamp(ty, -42, 42) };
}

function drive(you, tx, ty) {
  var dx = tx - you.x, dy = ty - you.y;
  if (Math.abs(dx) < 3 && Math.abs(dy) < 3 &&
      Math.hypot(you.vx, you.vy) < 0.25) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp(dx * 0.14 - you.vx * 0.7, -1, 1),
    y: clamp(dy * 0.14 - you.vy * 0.7, -1, 1)
  };
}

// Stance-model attack: take a stance on the far side of the ball along the
// chosen shot line and kick only when aligned with it, so shots bend around
// lane blockers instead of ramming straight down the axis. Own-goal-safe by
// construction: never kick from the wrong side. Returns {x, y, want}.
function attackBall(you, ball, opponents, pinCorner, wingTouch) {
  var aim;
  if (pinCorner) aim = { x: 430, y: ball.y >= 0 ? 150 : -150 };
  else if (wingTouch) {
    // Kickoff: first touch into wing space, away from staged defenders.
    var up = 0, dn = 0, w;
    for (w = 0; w < opponents.length; w++) {
      if (opponents[w].y >= ball.y) up++; else dn++;
    }
    var sideY = up <= dn ? 150 : -150;
    if (you.y >= ball.y + 40) sideY = 150;
    else if (you.y <= ball.y - 40) sideY = -150;
    aim = { x: 180, y: sideY };
  } else aim = chooseAim(ball, opponents);
  var g = norm(aim.x - ball.x, aim.y - ball.y);
  var rx = ball.x - you.x, ry = ball.y - you.y;
  var dist = Math.hypot(rx, ry);
  var behind = rx * g.x + ry * g.y;

  var steps = clamp(dist / 2.4, 0, 80);
  var pb = predictBall(ball, steps);

  // Lane blockage: nearest opponent inside the corridor to goal.
  var blockerLat = 0, blockerAlong = 1e9, found = false, i, o;
  for (i = 0; i < opponents.length; i++) {
    o = opponents[i];
    var ox = o.x - ball.x, oy = o.y - ball.y;
    var along = ox * g.x + oy * g.y;
    if (along > -15 && along < 430 && along < blockerAlong) {
      var lat = ox * g.y - oy * g.x;
      var halfW = 30 + Math.max(0, along) * 0.12;
      if (Math.abs(lat) < halfW) {
        blockerAlong = along; blockerLat = lat; found = true;
      }
    }
  }

  // Shot line: straight when the lane is open, angled around the blocker.
  var sx = g.x, sy = g.y;
  if (found && blockerAlong < 340 && blockerAlong > 5) {
    var px0 = -g.y, py0 = g.x;
    var wantSide = blockerLat >= 0 ? -1 : 1;
    if (Math.abs(ball.y) > 140) wantSide = ball.y > 0 ? -1 : 1;
    var cands = [wantSide, -wantSide];
    for (var c = 0; c < 2; c++) {
      var sd = cands[c], ang = 0.48;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      var qx = g.x * ca + px0 * sa * sd;
      var qy = g.y * ca + py0 * sa * sd;
      if (qx < 0.25) continue;
      var tGoal = (432 - ball.x) / qx;
      if (tGoal < 0) continue;
      var yGoal = ball.y + qy * tGoal;
      if (Math.abs(yGoal) > 50) continue;
      if (qy > 1e-6 && (188 - ball.y) / qy < tGoal) continue;
      if (qy < -1e-6 && (-188 - ball.y) / qy < tGoal) continue;
      sx = qx; sy = qy;
      break;
    }
  }

  var px1 = -sy, py1 = sx;
  var toSide = (you.x - ball.x) * px1 + (you.y - ball.y) * py1;
  var mySide = toSide >= 0 ? 1 : -1;

  var tx, ty;
  // Emergency: ball rolling at our goal — sprint straight at its path and
  // body-block; the wide detour would concede for sure.
  var emergency = ball.vx < -1 && ball.x < -50;
  if (emergency) {
    tx = pb.x; ty = pb.y;
  } else if (behind < -5 && dist > 34) {
    // In front of the ball: swing wide around it, never through it.
    tx = pb.x - sx * 10 + px1 * mySide * 58;
    ty = pb.y - sy * 10 + py1 * mySide * 58;
  } else {
    var stx = pb.x - sx * 24, sty = pb.y - sy * 24;
    var ds = Math.hypot(stx - you.x, sty - you.y);
    if (ds < 16 || dist <= 24) {
      // In the stance: drive through along the shot line.
      tx = ball.x + sx * 22; ty = ball.y + sy * 22;
    } else {
      tx = stx; ty = sty;
    }
  }
  var want = false;
  if (dist <= 29 && dist > 1e-6) {
    var al = (rx / dist) * sx + (ry / dist) * sy;
    var spd = Math.hypot(ball.vx, ball.vy);
    // Net empty (no opponent guarding their goal)? Shoot on sight.
    var guarded = false, j;
    for (j = 0; j < opponents.length; j++) {
      var gj = opponents[j];
      if (gj.x > 280 && Math.hypot(gj.x - 400, gj.y) < 130) { guarded = true; break; }
    }
    // Urgent in our own half or against a fast ball (clear/deflect anything
    // enemy-ward); patient in midfield; aggressive inside the enemy box where
    // rebounds fall to us and turnovers are harmless.
    var gate = ball.x > 250 ? 0.35 : (ball.x > 0 ? 0.7 : 0.1);
    if (!guarded && ball.x > 150) gate = 0.3;
    // Emergency blocks are body-first: only a clean facing may kick.
    var emerg = ball.vx < -1 && ball.x < -50;
    if (emerg) gate = Math.max(gate, 0.5);
    else if (spd > 4 && al > 0) gate = 0;
    if (al > gate) want = true;
  }
  var mv = drive(you, tx, ty);
  return { x: mv.x, y: mv.y, want: want };
}

function myScore(state) {
  return state.team === 'red' ? state.score.red : state.score.blue;
}
function oppScore(state) {
  return state.team === 'red' ? state.score.blue : state.score.red;
}

function think(state) {
  if (state.phase === 'goal') { pulse = false; return { x: 0, y: 0, kick: false }; }
  var you = state.you, ball = state.ball;
  var teammates = state.teammates || [], opponents = state.opponents || [];
  if (!you || !ball) return { x: 0, y: 0, kick: false };

  var squad = [you].concat(teammates).slice().sort(function (a, b) {
    return cmpId(a.id, b.id);
  });
  var myIdx = 0;
  for (var i = 0; i < squad.length; i++) {
    if (squad[i].id === you.id) { myIdx = i; break; }
  }
  var n = squad.length;
  var mine = state.kickoffTeam === state.team;
  var tLeft = typeof state.timeLeft === 'number' ? state.timeLeft : 60;
  var diff = myScore(state) - oppScore(state);
  var winning = diff > 0;
  var desperate = tLeft < 15 && !winning;

  function finish(mv, want) {
    var kick = false;
    if (want) { pulse = !pulse; kick = pulse; }
    else pulse = false;
    return { x: mv.x, y: mv.y, kick: kick };
  }

  // Kickoff stanza.
  if (state.phase === 'kickoff') {
    if (!mine) {
      // Hold just outside the restraining circle, ready to spring.
      var sx = -110 - myIdx * 25;
      var sy = myIdx % 2 === 0 ? 35 + myIdx * 12 : -35 - myIdx * 12;
      if (myIdx === 0 && n > 1) { sx = -385; sy = 0; }
      var mv0 = drive(you, sx, sy);
      return finish(mv0, false);
    }
    // Our kickoff: closest FIELD player rushes (keeper holds), others shape.
    var order = squad.filter(function (p, k) { return n === 1 || k !== 0; })
      .sort(function (a, b) {
        var da = Math.hypot(a.x - ball.x, a.y - ball.y);
        var db = Math.hypot(b.x - ball.x, b.y - ball.y);
        if (da !== db) return da - db;
        return cmpId(a.id, b.id);
      });
    if (order.length && order[0].id === you.id) {
      var atk = attackBall(you, ball, opponents, false, true);
      return finish({ x: atk.x, y: atk.y }, atk.want);
    }
    var kx = clamp(ball.x - 120, -260, -60);
    var ky = (myIdx % 2 === 0 ? 70 : -70);
    var mv1 = drive(you, myIdx === 0 && n > 1 ? -385 : kx, myIdx === 0 && n > 1 ? 0 : ky);
    return finish(mv1, false);
  }

  // Goalkeeper (multi-player only).
  var isKeeper = n > 1 && myIdx === 0;
  if (isKeeper && !desperate) {
    var dMe = Math.hypot(you.x - ball.x, you.y - ball.y);
    var closest = true;
    for (var q = 0; q < squad.length; q++) {
      if (q === myIdx) continue;
      var p = squad[q];
      var dp = Math.hypot(p.x - ball.x, p.y - ball.y);
      if (dp < dMe - 1e-9) { closest = false; break; }
    }
    if (ball.x < -280 && dMe < 95 && closest) {
      var clr = attackBall(you, ball, opponents, false);
      return finish({ x: clr.x, y: clr.y }, clr.want);
    }
    var gtx = -385, gty = 0;
    if (ball.x < -80) {
      var t = ball.vx < -0.05 ? clamp((-385 - ball.x) / ball.vx, 0, 120) : 0;
      var kk = t === 0 ? 0 : (1 - Math.pow(0.99, t)) / 0.01;
      gty = clamp(ball.y + ball.vy * kk, -52, 52);
    } else if (ball.x < 150) { gtx = -360; gty = clamp(ball.y * 0.4, -40, 40); }
 else { gtx = -370; gty = clamp(ball.y * 0.35, -35, 35); }
    if (winning && tLeft < 20) { gtx = -395; gty = clamp(ball.y * 0.3, -45, 45); }
    var gm = drive(you, gtx, gty);
    var gw = dMe <= 29 && ball.x < -330;
    if (gw) {
      var al = norm(445 - ball.x, 0 - ball.y);
      var rl = norm(ball.x - you.x, ball.y - you.y);
      gw = (rl.x * al.x + rl.y * al.y) > 0.3;
    } else gw = false;
    return finish(gm, gw);
  }
  if (isKeeper && desperate) {
    var up = drive(you, -200, clamp(ball.y * 0.3, -60, 60));
    var near = Math.hypot(you.x - ball.x, you.y - ball.y) < 60;
    if (near) {
      var atk2 = attackBall(you, ball, opponents, false);
      return finish({ x: atk2.x, y: atk2.y }, atk2.want);
    }
    return finish(up, false);
  }

  // Field players: closest (excluding keeper) chases.
  var pool = [];
  for (var f = 0; f < squad.length; f++) {
    if (n > 1 && f === 0) continue;
    pool.push(squad[f]);
  }
  pool.sort(function (a, b) {
    var da = Math.hypot(a.x - ball.x, a.y - ball.y);
    var db = Math.hypot(b.x - ball.x, b.y - ball.y);
    if (da !== db) return da - db;
    return cmpId(a.id, b.id);
  });
  var chaserId = pool.length ? pool[0].id : you.id;
  // Deep in the enemy box, send the second-closest field player in as well.
  var crashBox = ball.x > 280 && pool.length > 1 && !desperate;
  var secondId = crashBox ? pool[1].id : null;

  if (chaserId === you.id) {
    var pin = winning && tLeft < 20 && ball.x > 200;
    var ch = attackBall(you, ball, opponents, pin);
    return finish({ x: ch.x, y: ch.y }, ch.want);
  }
  if (secondId === you.id) {
    var ch2 = attackBall(you, ball, opponents, false);
    return finish({ x: ch2.x, y: ch2.y }, ch2.want);
  }

  // Support runner.
  var rank = 0;
  for (var s2 = 0; s2 < pool.length; s2++) {
    if (pool[s2].id === you.id) { rank = s2; break; }
  }
  var r = rank - 1; // 0-based among supporters
  var tx2, ty2;
  // Threat read: ball here/coming fast overrides nominal attacking shape.
  var threat = ball.x < 40 || (ball.vx < -1 && ball.x < 220);
  if (desperate) {
    var pbd = predictBall(ball, clamp(Math.hypot(you.x - ball.x, you.y - ball.y) / 2.4, 0, 60));
    tx2 = pbd.x + (r % 2 === 0 ? 18 : -18);
    ty2 = pbd.y + (r % 2 === 0 ? 30 : -30);
  } else if (threat) {
    tx2 = clamp(ball.x - 70 - r * 50, -385, 60);
    ty2 = clamp((r % 2 === 0 ? 70 : -70) + ball.y * 0.25, -175, 175);
  } else {
    if (r === 0) {
      tx2 = clamp(ball.x + 120, -120, 335);
      var lane = Math.abs(ball.y) < 30 ? (myIdx % 2 === 0 ? 80 : -80) : (ball.y >= 0 ? -80 : 80);
      ty2 = lane;
    } else {
      tx2 = clamp(ball.x - 40 - (r - 1) * 40, -260, 220);
      ty2 = clamp((r % 2 === 0 ? 90 : -90) + ball.y * 0.2, -175, 175);
    }
  }
  var sm = drive(you, tx2, ty2);
  return finish(sm, false);
}

function decide(state) {
  try {
    var a = think(state);
    var x = typeof a.x === 'number' && isFinite(a.x) ? clamp(a.x, -1, 1) : 0;
    var y = typeof a.y === 'number' && isFinite(a.y) ? clamp(a.y, -1, 1) : 0;
    return { x: x, y: y, kick: a.kick === true };
  } catch (e) {
    pulse = false;
    return { x: 0, y: 0, kick: false };
  }
}
decide.botName = 'HexPress';
decide.decide = decide;
module.exports = decide;
