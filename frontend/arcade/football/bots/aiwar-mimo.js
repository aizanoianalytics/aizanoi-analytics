'use strict';

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function clamp1(v) { return clamp(v, -1, 1); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function moveToward(you, tx, ty, kick) {
  tx = clamp(tx, -420, 420);
  ty = clamp(ty, -180, 180);
  return {
    x: clamp1((tx - you.x) * 0.15 - you.vx * 0.6),
    y: clamp1((ty - you.y) * 0.15 - you.vy * 0.6),
    kick: kick === true
  };
}

function distToSeg(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  var t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function timeToReach(p, tx, ty) {
  var dx = tx - p.x, dy = ty - p.y;
  var d = Math.hypot(dx, dy);
  if (d < 1e-3) return 0;
  var vStar = 2.64;
  var v0 = (p.vx * dx + p.vy * dy) / d;
  function covered(t) {
    return vStar * t + (v0 - vStar) * 0.96 * (1 - Math.pow(0.96, t)) / 0.04;
  }
  var lo = 0, hi = 180;
  if (covered(hi) < d) return hi;
  for (var i = 0; i < 20; i++) {
    var mid = (lo + hi) / 2;
    if (covered(mid) >= d) hi = mid; else lo = mid;
  }
  return hi + 4;
}

function predictBall(ball, maxT) {
  var xs = new Array(maxT + 1), ys = new Array(maxT + 1);
  var x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  xs[0] = x; ys[0] = y;
  for (var t = 1; t <= maxT; t++) {
    x += vx; y += vy;
    vx *= 0.99; vy *= 0.99;
    if (Math.abs(x) <= 420) {
      if (y > 190) { y = 190; vy = -vy * 0.5; }
      else if (y < -190) { y = -190; vy = -vy * 0.5; }
      if (Math.abs(y) >= 65) {
        if (x > 410) { x = 410; vx = -vx * 0.5; }
        else if (x < -410) { x = -410; vx = -vx * 0.5; }
      }
    } else {
      if (y > 55) { y = 55; vy = -vy * 0.5; }
      else if (y < -55) { y = -55; vy = -vy * 0.5; }
      if (x > 450) { x = 450; vx = -vx * 0.5; }
      else if (x < -450) { x = -450; vx = -vx * 0.5; }
    }
    xs[t] = x; ys[t] = y;
  }
  return { xs: xs, ys: ys };
}

function findIntercept(player, pred, maxT) {
  for (var t = 0; t <= maxT; t++) {
    var tx = pred.xs[t], ty = pred.ys[t];
    if (tx > 434 || tx < -434) continue;
    if (timeToReach(player, tx, ty) <= t + 2) return { t: t, x: tx, y: ty };
  }
  return { t: maxT, x: pred.xs[maxT], y: pred.ys[maxT] };
}

function goalLineClear(state, ax, ay) {
  var minClear = 1e9;
  var opps = state.opponents;
  for (var j = 0; j < opps.length; j++) {
    var d = distToSeg(opps[j].x, opps[j].y, state.ball.x, state.ball.y, 440, ay);
    if (d < minClear) minClear = d;
  }
  return minClear;
}

function chooseAim(state, kickPower) {
  var ball = state.ball;
  var opps = state.opponents;
  var keeper = null;
  var bestK = -1e9;
  for (var k = 0; k < opps.length; k++) {
    if (opps[k].x > bestK) { bestK = opps[k].x; keeper = opps[k]; }
  }
  var parked = keeper && keeper.x > 250 &&
    Math.abs(keeper.y - ball.y) < 85 && ball.x < 200;
  var cands = [0, -40, 40, -22, 22, -48, 48, -12, 12];
  if (parked && kickPower !== false) {
    var bounceSide = keeper.y >= 0 ? -1 : 1;
    cands = [bounceSide * 48, bounceSide * 40, -keeper.y * 0.5, 0].concat(cands);
  }
  var best = 0, bestScore = -1e9;
  for (var i = 0; i < cands.length; i++) {
    var ay = clamp(cands[i], -50, 50);
    var score = goalLineClear(state, 440, ay);
    if (parked) {
      score -= Math.abs(ay - keeper.y) * 0.35;
      var bounceBonus = (ay * keeper.y < 0 || Math.abs(ay) > 45) ? 12 : 0;
      score += bounceBonus;
    }
    if (score > bestScore) { bestScore = score; best = ay; }
  }
  return best;
}

function behindPoint(ball, nx, ny, you, opps, spacing) {
  var toBX = ball.x - you.x, toBY = ball.y - you.y;
  var side = toBX * nx + toBY * ny;
  if (side >= 5) {
    return { x: ball.x - nx * spacing, y: ball.y - ny * spacing };
  }
  var px = -ny, py = nx;
  var sideSign = 1, bestSpace = -1;
  var signs = [1, -1];
  for (var s = 0; s < 2; s++) {
    var sg = signs[s];
    var mx = ball.x + px * sg * 40 - nx * 26;
    var my = ball.y + py * sg * 40 - ny * 26;
    var minD = 1e9;
    for (var j = 0; j < opps.length; j++) {
      var dd = dist(opps[j].x, opps[j].y, mx, my);
      if (dd < minD) minD = dd;
    }
    if (minD > bestSpace) { bestSpace = minD; sideSign = sg; }
  }
  return {
    x: clamp(ball.x + px * sideSign * 45 - nx * 28, -410, 410),
    y: clamp(ball.y + py * sideSign * 45 - ny * 28, -170, 170)
  };
}

function kickDirectionSafe(you, ball) {
  var dx = ball.x - you.x, dy = ball.y - you.y;
  var d = Math.hypot(dx, dy);
  if (d < 1e-4) return true;
  var ux = dx / d, uy = dy / d;
  if (ux > 0.2) return true;
  if (Math.abs(uy) > 0.85) return ball.x > 0;
  return false;
}

var toggle = 0;

function decideInner(state) {
  toggle = (toggle + 1) & 1;
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
  var you = state.you;
  var ball = state.ball;
  var field = state.field;
  var squad = [you].concat(state.teammates);
  var opps = state.opponents;
  var n = squad.length;
  var maxT = 90;
  var pred = predictBall(ball, maxT);

  var ranks = [];
  for (var i = 0; i < squad.length; i++) {
    var m = squad[i];
    var ic = findIntercept(m, pred, maxT);
    ranks.push({ p: m, t: ic.t, ix: ic.x, iy: ic.y });
  }
  ranks.sort(function (a, b) {
    if (a.t !== b.t) return a.t - b.t;
    var sa = String(a.p.id), sb = String(b.p.id);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  var myRank = 0;
  for (var r = 0; r < ranks.length; r++) {
    if (String(ranks[r].p.id) === String(you.id)) { myRank = r; break; }
  }

  var oppBest = 1e9;
  for (var j = 0; j < opps.length; j++) {
    var ot = timeToReach(opps[j], ball.x, ball.y);
    if (ot < oppBest) oppBest = ot;
  }
  var myNow = timeToReach(you, ball.x, ball.y);
  var opponentWillGetThere = oppBest < myNow - 8;
  var goalDiff = state.team === 'red'
    ? state.score.red - state.score.blue
    : state.score.blue - state.score.red;
  var late = state.timeLeft < 25;
  var leadingLate = late && goalDiff > 0;
  var trailingLate = late && goalDiff < 0;

  if (state.phase === 'kickoff') {
    if (state.kickoffTeam === state.team) {
      if (myRank === 0) {
        var ka = chooseAim(state);
        var kx = 430 - ball.x, ky = ka - ball.y;
        var kl = Math.hypot(kx, ky) || 1;
        var knx = kx / kl, kny = ky / kl;
        var bd = dist(you.x, you.y, ball.x, ball.y);
        if (bd <= 29 && knx > 0.3) {
          return moveToward(you, ball.x + knx * 14, ball.y + kny * 14, !you.heldKick || toggle === 0);
        }
        var bp0 = behindPoint(ball, knx, kny, you, opps, 24);
        if (bd < 60) return moveToward(you, bp0.x, bp0.y, false);
        return moveToward(you, ball.x, ball.y, false);
      }
      return moveToward(you, -160 - myRank * 40, clamp((myRank - (n - 1) / 2) * 80, -140, 140), false);
    }
    var spotX = myRank === 0 ? -95 : -180 - myRank * 30;
    var spotY = clamp(ball.y * (myRank === 0 ? 0.5 : 0.7) + (myRank - (n - 1) / 2) * 50, -150, 150);
    if (Math.hypot(spotX, spotY) < 90) spotX = -110;
    return moveToward(you, spotX, spotY, false);
  }

  var isChaser = myRank === 0;
  if (leadingLate && myRank === 0 && ball.x > 140) isChaser = false;
  if (trailingLate && myRank <= Math.min(1, n - 1)) isChaser = true;

  if (isChaser) {
    var target = ranks[myRank];
    var bd2 = dist(you.x, you.y, ball.x, ball.y);
    if (bd2 > 55) {
      return moveToward(you, target.ix, target.iy, false);
    }
    var aimY = chooseAim(state, true);
    var wallBounce = false;
    var keeper = null;
    var bestK = -1e9;
    for (var k = 0; k < opps.length; k++) {
      if (opps[k].x > bestK) { bestK = opps[k].x; keeper = opps[k]; }
    }
    if (keeper && keeper.x > 260 && Math.abs(keeper.y - ball.y) < 80 && ball.x < 150) {
      wallBounce = true;
      var bside = keeper.y >= 0 ? -1 : 1;
      aimY = bside * 50;
    }
    var sx, sy;
    if (wallBounce) {
      sx = (field.enemyGoalX - 40) - ball.x;
      sy = aimY * 3.2 - ball.y;
    } else {
      sx = 430 - ball.x;
      sy = aimY - ball.y;
    }
    var sl = Math.hypot(sx, sy) || 1;
    var nx = sx / sl, ny = sy / sl;
    var toBX = ball.x - you.x, toBY = ball.y - you.y;
    var bd3 = Math.hypot(toBX, toBY) || 1;
    var align = (toBX * nx + toBY * ny) / bd3;
    var closing = (you.vx - ball.vx) * (toBX / bd3) + (you.vy - ball.vy) * (toBY / bd3);
    var kickDist = 27 + Math.max(0, closing) * 2.5;
    var alignNeed = wallBounce ? 0.55 : (ball.x > 150 ? 0.6 : 0.5);
    if (align > alignNeed && bd3 <= kickDist && kickDirectionSafe(you, ball)) {
      return moveToward(you, ball.x + nx * 14, ball.y + ny * 14, !you.heldKick || you.kickCooldown === 0);
    }
    var wideTarget = null;
    if (keeper && keeper.x > 250 && Math.abs(aimY - keeper.y) < 20 && !wallBounce) {
      var wideSide = ball.y >= keeper.y ? 1 : -1;
      if (Math.abs(ball.y) < 120) wideTarget = { x: ball.x + 30, y: ball.y + wideSide * 90 };
    }
    if (wideTarget) return moveToward(you, wideTarget.x, wideTarget.y, false);
    var bp = behindPoint(ball, nx, ny, you, opps, 25);
    return moveToward(you, bp.x, bp.y, false);
  }

  var lastMan = myRank === n - 1;
  if (lastMan || (n === 2 && myRank === 1)) {
    var gx = field.ownGoalX, gy = 0;
    var dxg = ball.x - gx, dyg = ball.y - gy;
    var dg = Math.hypot(dxg, dyg) || 1;
    var standX = gx + (dxg / dg) * (leadingLate ? 50 : 75);
    var standY = clamp((dyg / dg) * (leadingLate ? 50 : 75), -160, 160);
    standX = clamp(standX, -400, -80);
    var bd4 = dist(you.x, you.y, ball.x, ball.y);
    if (bd4 <= 32 && kickDirectionSafe(you, ball)) {
      var cdx = ball.x - you.x, cdy = ball.y - you.y;
      var cl = Math.hypot(cdx, cdy) || 1;
      return moveToward(you, ball.x + (cdx / cl) * 14, ball.y + (cdy / cl) * 14, !you.heldKick || you.kickCooldown === 0);
    }
    if (bd4 <= 60 && ball.x < -180 && (ball.x - you.x) < 5) {
      var bp3 = behindPoint(ball, 1, 0, you, opps, 22);
      return moveToward(you, bp3.x, bp3.y, false);
    }
    return moveToward(you, standX, standY, false);
  }

  var sideOff = (myRank % 2 === 1 ? 60 : -60);
  var supX, supY;
  if (trailingLate) {
    supX = clamp(ball.x - 50, -200, 250);
    supY = clamp(ball.y * 0.55 + sideOff, -160, 160);
  } else if (leadingLate || (goalDiff > 0 && state.timeLeft < 40)) {
    supX = clamp(ball.x - 130, -360, -40);
    supY = clamp(ball.y * 0.6 + sideOff * 0.5, -150, 150);
  } else {
    supX = clamp(ball.x - 90, -350, 140);
    supY = clamp(ball.y * 0.65 + sideOff, -160, 160);
  }
  if (opponentWillGetThere && ball.x < 40) {
    supX = clamp(ball.x - 50, -380, -20);
    supY = clamp(ball.y * 0.85, -160, 160);
  }
  var bd5 = dist(you.x, you.y, ball.x, ball.y);
  if (bd5 <= 32 && ball.x < 80 && kickDirectionSafe(you, ball)) {
    var adx = ball.x - you.x, ady = ball.y - you.y;
    var al = Math.hypot(adx, ady) || 1;
    return moveToward(you, ball.x + (adx / al) * 14, ball.y + (ady / al) * 14, !you.heldKick || you.kickCooldown === 0);
  }
  return moveToward(you, supX, supY, false);
}

module.exports = function decide(state) {
  try {
    var out = decideInner(state);
    var ox = Number(out.x), oy = Number(out.y);
    if (!Number.isFinite(ox)) ox = 0;
    if (!Number.isFinite(oy)) oy = 0;
    return { x: clamp1(ox), y: clamp1(oy), kick: out.kick === true };
  } catch (e) {
    return { x: 0, y: 0, kick: false };
  }
};
