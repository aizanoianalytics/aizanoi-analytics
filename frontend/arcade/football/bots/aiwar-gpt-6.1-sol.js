'use strict';

// ArasPress — first-touch racing, exact ray-gated placed shots, safe spoil
// pokes under pressure, lane-blocking recovery, keeper + roles by team size.
function cmpId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  var s1 = String(a), s2 = String(b);
  return s1 < s2 ? -1 : (s1 > s2 ? 1 : 0);
}
function clamp1(v) { return v > 1 ? 1 : (v < -1 ? -1 : v); }
function ctrl(you, tx, ty, kick) {
  return {
    x: clamp1((tx - you.x) * 0.12 - you.vx * 0.65),
    y: clamp1((ty - you.y) * 0.12 - you.vy * 0.65),
    kick: kick === true
  };
}
function dh(ax, ay, bx, by) {
  var dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
var MEM = {};
function myMem(id, step) {
  var key = String(id);
  var m = MEM[key];
  if (!m || step < m.step) m = MEM[key] = { k: -1, rec: -1, step: 0 };
  m.step = step;
  return m;
}

function decide(state) {
  var you = state.you, ball = state.ball;
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };

  var mates = [you].concat(state.teammates);
  mates.sort(function (a, b) { return cmpId(a.id, b.id); });
  var myRank = 0, i;
  for (i = 0; i < mates.length; i++) {
    if (mates[i].id === you.id) { myRank = i; break; }
  }
  var teamSize = mates.length;
  var isKeeper = teamSize >= 3 && myRank === 0;

  var mine = state.team === 'red' ? state.score.red : state.score.blue;
  var oppS = state.team === 'red' ? state.score.blue : state.score.red;
  var diff = mine - oppS;
  var urgent = diff < 0 && state.timeLeft < 25;
  var stall = diff > 0 && state.timeLeft < 20;

  // After I kick, fall back goalside briefly — my shot/clear may come back.
  var mm = myMem(you.id, state.step);
  if (mm.k !== -1 && you.kicks !== mm.k) mm.rec = state.step + 50;
  mm.k = you.kicks;

  var myD = dh(you.x, you.y, ball.x, ball.y);
  var oppD = 1e9, k;
  for (k = 0; k < state.opponents.length; k++) {
    var e0 = state.opponents[k];
    var d0 = dh(e0.x, e0.y, ball.x, ball.y);
    if (d0 < oppD) oppD = d0;
  }

  // Aim at enemy goal, away from enemy keeper.
  var aimY = 0, bk = null, bd = 1e9;
  for (k = 0; k < state.opponents.length; k++) {
    var op = state.opponents[k];
    var dd = dh(op.x, op.y, 420, 0);
    if (dd < bd) { bd = dd; bk = op; }
  }
  if (bk && bd < 260) {
    if (bk.y > 12) aimY = -38;
    else if (bk.y < -12) aimY = 38;
    else aimY = ball.y >= 0 ? -38 : 38;
  } else {
    var up = 0, dn = 0;
    for (k = 0; k < state.opponents.length; k++) {
      var e2 = state.opponents[k];
      if (e2.x > 150) { if (e2.y >= 0) up++; else dn++; }
    }
    if (ball.y > 20) aimY = -30;
    else if (ball.y < -20) aimY = 30;
    else aimY = up > dn ? -30 : 30;
  }

  function pulse(dist) {
    if (dist > 29) return false;
    if (you.heldKick && you.kickCooldown > 0) return false;
    return true;
  }

  // Kick direction is (ball - you): dirx must be clearly forward, and for
  // shots the ray must hit the mouth (|yh| <= 50 at x = 430).
  var dirx = myD > 1e-9 ? (ball.x - you.x) / myD : 1;
  var diry = myD > 1e-9 ? (ball.y - you.y) / myD : 0;
  var yhHit = 1e9;
  if (dirx > 1e-6) yhHit = ball.y + diry * ((430 - ball.x) / dirx);
  function shotOK() {
    return myD <= 29 && dirx > 0.35 && yhHit > -50 && yhHit < 50;
  }
  function spoilOK() {
    return myD <= 29 && dirx > 0.45;
  }

  // Win the ball and send it toward (ax,ay). Pressure => deny with a
  // forward poke; space => place the shot (post-aware ray gate) or carry.
  function attackBall(ax, ay, canKick, forGoal) {
    // Ball rolling at my goal and they get there first: block the shooting
    // lane goalside instead of racing to a lost first touch.
    if (canKick && ball.vx < -0.5 && oppD < myD - 10 && you.x > ball.x - 120) {
      var lk = spoilOK() ? pulse(myD) : false;
      return ctrl(you, ball.x - 50, ball.y * 0.85, lk);
    }
    var avx = ax - ball.x, avy = ay - ball.y;
    var alen = Math.sqrt(avx * avx + avy * avy) || 1;
    var nx = avx / alen, ny = avy / alen;
    var dx = ball.x - you.x, dy = ball.y - you.y;
    var behind = dx * nx + dy * ny;
    var cross = dx * ny - dy * nx;
    var axc = cross < 0 ? -cross : cross;
    var tm = 0;
    if (myD > 1e-6) tm = -(ball.vx * dx / myD + ball.vy * dy / myD);
    var space = oppD > myD + 60;
    var slow = Math.hypot(ball.vx, ball.vy) < 1.0;

    if (canKick && myD <= 29 && dirx > 0.35) {
      if (forGoal && space && slow) {
        // Placed shot only: ray must clear the posts at x = 420,
        // otherwise carry the ball to a better angle.
        var y420 = ball.y + diry * ((420 - ball.x) / (dirx || 1e-6));
        if (y420 > -42 && y420 < 42) {
          return ctrl(you, ball.x + nx * 24, ball.y + ny * 24, pulse(myD));
        }
        return ctrl(you, ball.x + nx * 12, ball.y + ny * 12, false);
      }
      return ctrl(you, ball.x + nx * 24, ball.y + ny * 24, pulse(myD));
    }
    // Wrong side of a slow ball: circle around (wide + goalside if contested).
    if (behind < 6 && tm < 0.8) {
      var side = you.y >= ball.y ? 1 : -1;
      if (!space && ball.x < 150) {
        return ctrl(you, ball.x - 80, ball.y + side * 80, false);
      }
      var detour = behind < 8 && axc < 42;
      return ctrl(you, ball.x - nx * 36, ball.y - ny * 36 + (detour ? side * 55 : 0), false);
    }
    // Dead ball with plenty of space: line up behind it for a placed shot.
    if (space && slow && behind < 20) {
      return ctrl(you, ball.x - nx * 28, ball.y - ny * 28, false);
    }
    // Otherwise: sprint at the intercept point, shortest path, no stalking.
    var bs = Math.hypot(ball.vx, ball.vy);
    var lead = 0;
    if (bs > 1.5) {
      lead = myD / 2.6;
      if (lead > 50) lead = 50;
    }
    var ix = ball.x + ball.vx * lead * 0.85;
    var iy = ball.y + ball.vy * lead * 0.85;
    if (ix > 425) ix = 425; else if (ix < -425) ix = -425;
    if (iy > 200) iy = 200; else if (iy < -200) iy = -200;
    return ctrl(you, ix, iy, false);
  }

  var notOurKickoff = state.phase === 'kickoff' && state.kickoffTeam !== state.team;

  // ---- Keeper ----
  if (isKeeper && !urgent) {
    var goalX = -385;
    var predY = ball.y * 0.5;
    if (ball.vx < -0.05) {
      var arr = (goalX - ball.x) / ball.vx;
      if (arr < 0) arr = 0; else if (arr > 90) arr = 90;
      predY = ball.y + ball.vy * arr;
      if (predY > 48) predY = 48; else if (predY < -48) predY = -48;
    } else if (predY > 60) predY = 60; else if (predY < -60) predY = -60;
    var dg = myD;
    if (ball.x < -250 && ball.x > you.x - 10 && dg < 95) {
      var cu = 0, cd = 0, q;
      for (q = 0; q < state.opponents.length; q++) {
        var w = state.opponents[q];
        if (w.x < 100) { if (w.y >= 0) cu++; else cd++; }
      }
      var cy = cu > cd ? -110 : 110;
      var best = null;
      for (q = 0; q < state.teammates.length; q++) {
        var m = state.teammates[q];
        if (m.x > -50 && (best === null || m.x > best.x)) best = m;
      }
      var cx = 300;
      if (best && dh(ball.x, ball.y, best.x, best.y) < 330) { cx = best.x; cy = best.y; }
      return attackBall(cx, cy, true, false);
    }
    var hold = dg <= 29 && ball.x < -300 && dirx > 0.3;
    return ctrl(you, goalX, predY, hold ? pulse(dg) : false);
  }

  // ---- Field roles: closest presses, next contains, rest support ----
  var pool = (isKeeper && !urgent) ? mates.slice(1) : mates;
  var order = pool.slice().sort(function (a, b) {
    var da = dh(a.x, a.y, ball.x, ball.y), db = dh(b.x, b.y, ball.x, ball.y);
    if (da !== db) return da - db;
    return cmpId(a.id, b.id);
  });
  var amChaser = order.length > 0 && order[0].id === you.id;
  var amSecond = order.length > 1 && order[1].id === you.id;

  if (amChaser) {
    if (notOurKickoff) {
      if (ball.x < -60) return attackBall(420, aimY, true, true);
      // Counter-post: centered in 1v1 (straight counter at empty net),
      // off-center in multi (deflect the blast away from their numbers).
      var postY = ball.y * 0.2;
      if (teamSize > 2) {
        var upC = 0, dnC = 0, z;
        for (z = 0; z < state.opponents.length; z++) {
          var oz = state.opponents[z];
          if (oz.x < 150) { if (oz.y >= 0) upC++; else dnC++; }
        }
        postY = upC >= dnC ? 28 : -28;
      }
      return ctrl(you, -90, postY, false);
    }
    if (stall) return attackBall(350, ball.y >= 0 ? 160 : -160, false, false);
    // Post-kick recovery: get goalside only if the ball is coming back
    // at me (or stuck on my half for the taking). Follow shots upfield.
    if (state.step < mm.rec && (ball.vx < -1.2 || (ball.x < 0 && oppD < myD + 10))) {
      var rk = (shotOK() || spoilOK()) ? pulse(myD) : false;
      return ctrl(you, (ball.x - 330) / 2, ball.y / 2, rk);
    }
    if (ball.x < -120 && ball.vx < -0.5 && ball.x < you.x - 20 && oppD < myD) {
      var tx = ball.x - 80;
      if (tx < -380) tx = -380;
      return ctrl(you, tx, ball.y * 0.75, false);
    }
    if (state.phase === 'kickoff' && state.kickoffTeam === state.team && oppD < 130) {
      return attackBall(420, aimY, false, true);
    }
    return attackBall(420, aimY, true, true);
  }

  if (amSecond && !notOurKickoff) {
    // Far-post run: poach rebounds when the ball is upfield (3v3/4v4 only).
    if (teamSize >= 3 && ball.x > 150) {
      var fpY = aimY === 0 ? (ball.y >= 0 ? -30 : 30) : aimY;
      return ctrl(you, 360, fpY, false);
    }
    if (ball.x >= 150) {
      // Upfield second-man: press only with a keeper behind; else hold shape.
      if (teamSize < 3) return ctrl(you, (ball.x - 330) / 2, ball.y / 2, false);
      var chD2 = dh(order[0].x, order[0].y, ball.x, ball.y);
      if (myD < chD2 + 80) return attackBall(420, aimY, true, true);
      return ctrl(you, (ball.x - 330) / 2, ball.y / 2, false);
    }
    if (ball.x < -120) {
      var chD = dh(order[0].x, order[0].y, ball.x, ball.y);
      if (myD < chD + 80) return attackBall(420, aimY, true, true);
    } else if (teamSize <= 2) {
      // 1v1/2v2: second man presses high too — numbers at the ball win.
      return attackBall(420, aimY, true, true);
    }
    return ctrl(you, (ball.x - 330) / 2, ball.y / 2, false);
  }

  var sx = -150 + (ball.x + 420) * 0.35;
  if (sx < -300) sx = -300; else if (sx > 170) sx = 170;
  var slots = [-120, 120, -55, 55];
  var sy = slots[myRank % slots.length] + ball.y * 0.25;
  if (sy > 170) sy = 170; else if (sy < -170) sy = -170;
  if (urgent) { sx += 80; if (sx > 220) sx = 220; }
  if (notOurKickoff) {
    if (sx > -100) sx = -100;
    if (sx * sx + sy * sy < 95 * 95) { sx = -120; sy = myRank % 2 === 0 ? 80 : -80; }
  }
  return ctrl(you, sx, sy, false);
}
decide.botName = 'ArasPress';
module.exports = decide;
