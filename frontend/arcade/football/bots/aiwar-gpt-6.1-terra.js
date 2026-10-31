'use strict';

// TerraPress: role-split pressing bot (ID-sorted keeper + closest-chaser),
// behind-ball shadow play, pulsed kicks, interception, corner-aware finishing.

function cmpId(a, b) {
  if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
  var x = String(a.id), y = String(b.id);
  return x < y ? -1 : (x > y ? 1 : 0);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function goTo(you, tx, ty) {
  var dx = (tx - you.x) * 0.14 - you.vx * 0.75;
  var dy = (ty - you.y) * 0.14 - you.vy * 0.75;
  if (!isFinite(dx) || !isFinite(dy)) return { x: 0, y: 0 };
  // Steer around teammates (not when already parking) so opposing runs
  // (e.g. retreating keeper vs advancing chaser) cannot deadlock head-on.
  // AVOID is set by decide() on every call; single-threaded, no reentrancy.
  var tdist = Math.hypot(tx - you.x, ty - you.y);
  if (AVOID && tdist > 14) {
    for (var i = 0; i < AVOID.length; i++) {
      var ox = you.x - AVOID[i].x, oy = you.y - AVOID[i].y;
      var od = Math.hypot(ox, oy);
      if (od > 0.01 && od < 45) {
        var w = (45 - od) / 45 * 2.5;
        dx += ox / od * w;
        dy += oy / od * w;
      }
    }
  }
  var m = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
  if (m < 0.03) return { x: 0, y: 0 };
  if (m > 1) { dx /= m; dy /= m; }
  return { x: dx, y: dy };
}

// Releasing while held-and-cooling gives a rising edge next decision,
// which kicks sooner than waiting out the 10-step held cooldown.
function pulseOk(you) {
  if (you.heldKick && you.kickCooldown > 0) return false;
  return true;
}

function pickCorner(state) {
  var up = 0, dn = 0;
  var opps = state.opponents;
  for (var i = 0; i < opps.length; i++) {
    if (opps[i].x > 120) {
      if (opps[i].y >= 0) up++;
      else dn++;
    }
  }
  if (up !== dn) return up < dn ? 48 : -48;
  return state.ball.y >= 0 ? -48 : 48;
}

var AVOID = null;

function decide(state) {
  try {
    AVOID = state.teammates;
    if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
    var you = state.you;
    var ball = state.ball;

    var squad = [you].concat(state.teammates);
    squad.sort(cmpId);
    var n = squad.length;
    var myIdx = -1;
    for (var s = 0; s < squad.length; s++) {
      if (squad[s].id === you.id) { myIdx = s; break; }
    }
    if (myIdx < 0) myIdx = 0;

    var myScore = state.team === 'red' ? state.score.red : state.score.blue;
    var opScore = state.team === 'red' ? state.score.blue : state.score.red;
    var diff = myScore - opScore;
    var lateWin = state.timeLeft < 20 && diff > 0;
    var lateLoss = state.timeLeft < 12 && diff < 0;

    // Deterministic chaser: closest OUTFIELDER to ball, id tiebreak. The
    // keeper (sort index 0) never chases, or kickoffs go uncontested while
    // everyone waits. All teammates compute the same ranking, so they agree.
    var chaserId = null;
    var secondId = null;
    var chaserDist = Infinity;
    var secondDist = Infinity;
    for (var c = (n > 1 ? 1 : 0); c < squad.length; c++) {
      var d = dist(squad[c].x, squad[c].y, ball.x, ball.y);
      var isChaser = d < chaserDist - 1e-9 ||
        (Math.abs(d - chaserDist) <= 1e-9 && (chaserId === null || cmpId(squad[c], { id: chaserId }) < 0));
      if (isChaser) {
        secondDist = chaserDist;
        secondId = chaserId;
        chaserDist = d;
        chaserId = squad[c].id;
      } else {
        var isSecond = d < secondDist - 1e-9 ||
          (Math.abs(d - secondDist) <= 1e-9 && (secondId === null || cmpId(squad[c], { id: secondId }) < 0));
        if (isSecond) {
          secondDist = d;
          secondId = squad[c].id;
        }
      }
    }
    if (chaserId === null) { chaserId = squad[0].id; chaserDist = 0; }

    // Double-team the break: fast ball into our half gets a presser (rank 0
    // goes straight at it) plus a goal-side cover (rank 1 cuts the lane).
    var press2 = n > 2 && ball.x < -50 && ball.vx < -0.5;

    var corner = pickCorner(state);
    var aimX = 420, aimY = corner;
    // Tight angle deep in enemy corner: dribble back into shooting shape first.
    if (ball.x > 290 && Math.abs(ball.y) > 95) {
      aimX = 180;
      aimY = (ball.y > 0 ? -60 : 60);
    } else if (ball.x < -260) {
      // Clearing from deep: aim upfield at the open side, still attacking.
      aimX = 420;
      aimY = corner;
    }

    var abx = aimX - ball.x, aby = aimY - ball.y;
    var abLen = Math.hypot(abx, aby) || 1;
    var nx = abx / abLen, ny = aby / abLen;

    var mdx = ball.x - you.x, mdy = ball.y - you.y;
    var meDist = Math.hypot(mdx, mdy) || 0.0001;
    var kx = mdx / meDist, ky = mdy / meDist;
    var dot = kx * nx + ky * ny;

    var iAmChaser = (chaserId === you.id);
    var iAmKeeper = (n > 1 && myIdx === 0);

    // Not our kickoff: stay legal, wait at own half edge.
    if (state.phase === 'kickoff' && state.kickoffTeam !== state.team) {
      if (iAmKeeper) {
        var k = goTo(you, -385, clamp(ball.y * 0.3, -50, 50));
        k.kick = false;
        return k;
      }
      if (iAmChaser) {
        var w = goTo(you, -95, clamp(ball.y * 0.4, -80, 80));
        w.kick = false;
        return w;
      }
      var hx = clamp(ball.x - 160, -330, -110);
      var hy = clamp(ball.y * 0.3 + (myIdx % 2 === 0 ? 60 : -60), -150, 150);
      var h = goTo(you, hx, hy);
      h.kick = false;
      return h;
    }

    // ---- Keeper ----
    if (iAmKeeper && !(n === 1)) {
      // Our kickoff: hold still so the advancing chaser passes without a
      // head-on jam; retreat once play starts.
      if (state.phase === 'kickoff' && state.kickoffTeam === state.team) {
        return { x: 0, y: 0, kick: false };
      }
      var ballThreat = ball.x < -140 || (ball.x < 40 && ball.vx < -1.2);
      var keeperClose = meDist < 70;
      if ((ballThreat && meDist < 55) || (ball.x < -260 && keeperClose && meDist <= chaserDist + 30)) {
        // Attack the ball like a chaser (emergency clear).
        return attackBall(state, you, ball, nx, ny, mdx, mdy, meDist, dot, corner, false);
      }
      if (lateLoss) {
        var up = goTo(you, -240, clamp(ball.y * 0.5, -120, 120));
        up.kick = meDist <= 29 && dot > 0.5 && pulseOk(you);
        return up;
      }
      var tArr = ball.vx < -0.05 ? clamp((-385 - ball.x) / ball.vx, 0, 90) : 0;
      var predY = clamp(ball.y + ball.vy * tArr, -50, 50);
      var gx = -385, gy = predY * 0.85 + ball.y * 0.15;
      gy = clamp(gy, -60, 60);
      if (ball.x < -300 && meDist < 90) {
        // Sweep: meet the ball just in front of goal.
        var sx = clamp(ball.x + 14, -410, -300);
        var sw = goTo(you, sx, ball.y);
        sw.kick = meDist <= 29 && (kx * nx + ky * ny) > 0.1 && pulseOk(you);
        return sw;
      }
      var g = goTo(you, gx, gy);
      g.kick = false;
      if (meDist <= 29 && dot > 0.6 && pulseOk(you)) g.kick = true;
      return g;
    }

    // ---- Chaser (or solo) ----
    if (iAmChaser || n === 1) {
      return attackBall(state, you, ball, nx, ny, mdx, mdy, meDist, dot, corner, press2);
    }

    // ---- Second defender: cut the lane goal-side while rank 0 presses. ----
    if (press2 && secondId === you.id) {
      var cx = clamp(ball.x - 70, -405, -180);
      var cy = clamp(ball.y * 0.6, -130, 130);
      var cd = goTo(you, cx, cy);
      cd.kick = meDist <= 29 && dot > 0.3 && pulseOk(you);
      return cd;
    }

    // ---- Support ----
    // Opportunistic finish if ball falls to us well-aligned.
    if (meDist <= 26 && dot > 0.55 && ball.x > -120) {
      var fin = goTo(you, ball.x + nx * 22, ball.y + ny * 22);
      fin.kick = pulseOk(you);
      return fin;
    }
    var baseX = clamp(ball.x - 150, -330, 210);
    if (lateLoss) baseX = clamp(ball.x - 40, -200, 300);
    if (lateWin) baseX = clamp(ball.x - 200, -350, 100);
    var lane = (myIdx % 2 === 0 ? 1 : -1);
    var supY = clamp(ball.y * 0.3 + lane * (70 + 25 * myIdx), -175, 175);
    // Attack: crash the box for rebounds instead of loitering behind play.
    var attacking = ball.x > 80 && ball.x < 430;
    var supX = baseX;
    if (attacking && !lateWin) {
      supX = clamp(ball.x + 40, 180, 360);
      supY = clamp(lane * 110 + ball.y * 0.2, -170, 170);
    }
    if (Math.abs(supX - ball.x) < 50 && Math.abs(supY - ball.y) < 50) supX -= 60;
    var sup = goTo(you, clamp(supX, -400, 400), supY);
    sup.kick = false;
    if (meDist <= 29 && dot > 0.7 && pulseOk(you)) sup.kick = true;
    return sup;
  } catch (e) {
    return { x: 0, y: 0, kick: false };
  }
}

function attackBall(state, you, ball, nx, ny, mdx, mdy, meDist, dot, corner, press) {
  // Intercept prediction.
  var bs = Math.hypot(ball.vx, ball.vy);
  var t = bs > 0.4 ? clamp(meDist / 2.6, 0, 30) : 0;
  var pbx = ball.x + ball.vx * t;
  var pby = ball.y + ball.vy * t;
  pbx = clamp(pbx, -430, 430);
  pby = clamp(pby, -210, 210);

  // Corner extraction: deep corners break kick geometry (walls/posts).
  // Walk the ball out toward the mouth instead of smashing it around.
  if (Math.abs(ball.y) > 62 && Math.abs(ball.x) > 365) {
    var exx = ball.x > 0 ? 300 : -300;
    var eyy = ball.y > 0 ? -40 : 40;
    var evx = exx - ball.x, evy = eyy - ball.y;
    var evl = Math.hypot(evx, evy) || 1;
    var shx2 = clamp(ball.x - evx / evl * 24, -430, 430);
    var shy2 = clamp(ball.y - evy / evl * 24, -205, 205);
    var g0 = goTo(you, shx2, shy2);
    g0.kick = false;
    // Already between ball and the exit: nudge it out with the body.
    var mdx2 = ball.x - you.x, mdy2 = ball.y - you.y;
    var meD2 = Math.hypot(mdx2, mdy2) || 1;
    if ((mdx2 / meD2) * (evx / evl) + (mdy2 / meD2) * (evy / evl) > 0.3) {
      g0 = goTo(you, ball.x + evx / evl * 22, ball.y + evy / evl * 22);
      g0.kick = false;
    }
    return g0;
  }

  // Recovery run: ball attacking our goal while we trail upfield. A straight
  // chase kicks from behind and feeds the attack — arc to the goal side first.
  // (Skipped when double-pressing: rank 1 already covers goal-side.)
  if (!press && ball.x < 100 && ball.vx < -1.5 && you.x > ball.x + 10 && meDist > 40) {
    var s = you.y >= ball.y ? 1 : -1;
    var rcx = clamp(ball.x - 20, -430, 430);
    var rcy = clamp(ball.y + s * 75, -205, 205);
    if (dist(you.x, you.y, rcx, rcy) > 25) {
      var gr = goTo(you, rcx, rcy);
      gr.kick = false;
      return gr;
    }
  }

  var defensive = ball.x < -120;
  var oppD = Infinity;
  var opps = state.opponents;
  for (var i = 0; i < opps.length; i++) {
    var od = dist(opps[i].x, opps[i].y, ball.x, ball.y);
    if (od < oppD) oppD = od;
  }
  var contested = oppD < 75;

  var nearGoal = ball.x > 350 && Math.abs(ball.y) < 75;
  var forward = mdx / (meDist || 1);
  // Kick only when it helps: shoot in range, clear deep, keep possession mid.
  var canKick;
  if (nearGoal) canKick = meDist <= 29 && forward > 0;
  else if (ball.x > 200) canKick = meDist <= 29 && dot > 0.15;
  else if (ball.x < -150) canKick = meDist <= 29 && dot > 0.1;
  else canKick = meDist <= 29 && dot > 0.3;

  // Aligned (or desperate near their goal): drive through, kicking if useful.
  if (meDist <= 29 && (nearGoal ? forward > 0 : dot > 0.15)) {
    var g4 = goTo(you, pbx + nx * 22, pby + ny * 22);
    g4.kick = canKick && pulseOk(you);
    return g4;
  }
  // Roughly goal-side of the ball: walk into it. Contact dribbles the right
  // way; never run through the ball from the wrong side (own-goal risk).
  if (dot > 0.05) {
    var gd = goTo(you, pbx, pby);
    gd.kick = canKick && pulseOk(you);
    return gd;
  }
  // Uncontested and mis-shaped: get behind the ball without shoving it wrong-way.
  var shx = clamp(pbx - nx * 24, -430, 430);
  var shy = clamp(pby - ny * 24, -205, 205);
  if (meDist < 55 && dot < 0.25) {
      // Loop around via the open side.
      var cross = mdx * ny - mdy * nx;
      var side = (you.y >= ball.y ? 1 : -1);
      if (cross !== 0) side = cross > 0 ? 1 : -1;
      var give = ball.x < -100 ? 58 : 38;
      var wx = clamp(ball.x - nx * 30 - ny * side * give, -430, 430);
      var wy = clamp(ball.y - ny * 30 + nx * side * give, -205, 205);
      // If waypoint is basically where we are, head to shadow directly.
      if (dist(you.x, you.y, wx, wy) < 12) {
        var g1 = goTo(you, shx, shy);
        g1.kick = false;
        return g1;
      }
      var g2 = goTo(you, wx, wy);
      g2.kick = false;
      return g2;
    }
    var g3 = goTo(you, shx, shy);
    g3.kick = false;
    return g3;
  // In shape: drive through the ball and shoot.
  var g5 = goTo(you, pbx + nx * 22, pby + ny * 22);
  g5.kick = meDist <= 29 && dot > 0.35 && pulseOk(you);
  return g5;
}

decide.botName = 'TerraPress';
module.exports = decide;
