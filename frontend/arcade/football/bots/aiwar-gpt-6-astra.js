'use strict';
// Ares FC - tournament bot.
module.exports = function decide(state) {
  try {
    var you = state.you, ball = state.ball, F = state.field;
    if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
    var EGX = 420, OGX = -420;
    function clamp(v, l) { return v < -l ? -l : (v > l ? l : v); }
    function clamp3(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function ctrl(tx, ty, kick) {
      var dx = tx - you.x, dy = ty - you.y;
      return {
        x: clamp(dx * 0.14 - you.vx * 0.70, 1),
        y: clamp(dy * 0.14 - you.vy * 0.70, 1),
        kick: kick === true
      };
    }
    function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
    function cmpId(a, b) {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      var s1 = String(a), s2 = String(b);
      return s1 < s2 ? -1 : (s1 > s2 ? 1 : 0);
    }
    // Scores from my perspective (coords already oriented).
    var myScore = state.team === 'red' ? state.score.red : state.score.blue;
    var opScore = state.team === 'red' ? state.score.blue : state.score.red;
    var diff = myScore - opScore;
    var timeLeft = state.timeLeft;

    // Squad in canonical id order; my slot decides keeper duty.
    var squad = [you].concat(state.teammates).slice().sort(function (a, b) { return cmpId(a.id, b.id); });
    var myIdx = 0;
    for (var i = 0; i < squad.length; i++) if (squad[i].id === you.id) { myIdx = i; break; }
    var n = squad.length;
    var isKeeper = (n > 1 && myIdx === 0);

    // Late-game urgency overrides.
    var desperate = (diff < 0 && timeLeft < 25);
    var protect = (diff > 0 && timeLeft < 12);
    if (desperate) isKeeper = false;

    // Ball prediction (linear + damping approx).
    function predictBall(t) {
      t = Math.max(0, Math.min(60, t));
      var f = (1 - Math.pow(0.99, t)) / 0.01;
      var px = ball.x + ball.vx * f, py = ball.y + ball.vy * f;
      if (py > 190) py = 190; else if (py < -190) py = -190;
      if (px > 410) px = 410; else if (px < -410) px = -410;
      return { x: px, y: py };
    }

    // Aim: shoot away from the opponent guarding the goal.
    var goalY = 0;
    var best = null, bestD = 1e9;
    for (var o = 0; o < state.opponents.length; o++) {
      var op = state.opponents[o];
      var d = dist(op.x, op.y, EGX - 40, ball.y * 0.5);
      if (d < bestD) { bestD = d; best = op; }
    }
    if (best && best.x > 200) goalY = best.y > 0 ? -42 : 42;
    else goalY = ball.y > 60 ? -38 : (ball.y < -60 ? 38 : (ball.y >= 0 ? -30 : 30));
    if (ball.y > 130) goalY = -15;
    else if (ball.y < -130) goalY = 15;
    if (goalY > 48) goalY = 48; else if (goalY < -48) goalY = -48;
    var agx = EGX - ball.x, agy = goalY - ball.y;
    var agl = Math.hypot(agx, agy) || 1;
    var aimX = agx / agl, aimY = agy / agl;

    // Who chases? Nearest teammate to (predicted) ball.
    function teamBallDist(p) {
      var t = clamp3(dist(p.x, p.y, ball.x, ball.y) / 2.5, 0, 30);
      var pr = predictBall(t);
      return dist(p.x, p.y, pr.x, pr.y);
    }
    var mates = [you].concat(state.teammates);
    var closestId = you.id, closestD = 1e18;
    for (var m = 0; m < mates.length; m++) {
      var dd = teamBallDist(mates[m]);
      if (dd < closestD || (dd === closestD && cmpId(mates[m].id, closestId) < 0)) { closestD = dd; closestId = mates[m].id; }
    }
    var iAmClosest = (closestId === you.id);

    // Kickoff waiting (non-kickoff team must stay home).
    var myKickoff = (state.kickoffTeam === state.team);
    if (state.phase === 'kickoff' && !myKickoff) {
      if (isKeeper) return ctrl(-385, clamp(ball.y * 0.3, 48), false);
      var wx = -140 - myIdx * 40, wy = (myIdx % 2 === 0 ? -45 : 45);
      return ctrl(wx, wy, false);
    }

    // Keeper logic.
    if (isKeeper && !desperate) {
      var dBall = dist(you.x, you.y, ball.x, ball.y);
      var danger = ball.x < -140;
      if (dBall < 45 && ball.x < -200) {
        // Point-blank loose ball: smother and clear upfield.
        return attackBall(true);
      }
      var gx = -385;
      var predY;
      if (ball.x < -378) {
        // Ball between keeper and the line: go at it and clear.
        var kd = dist(you.x, you.y, ball.x, ball.y);
        var kickNow = false;
        if (kd <= 29) {
          var kkx = ball.x - you.x, kky = ball.y - you.y;
          var kkl = Math.hypot(kkx, kky) || 1;
          if (kkx / kkl > 0.05) kickNow = you.kickCooldown === 0 ? true : !you.heldKick;
        }
        return ctrl(ball.x - 6, ball.y, kickNow);
      }
      if (ball.vx < -0.3) {
        // Track the arrival point with a capped lead; long horizons phantom.
        // Shade wider when the ball is in our box.
        var lim = ball.x < -250 ? 65 : 50;
        predY = clamp3(ball.y + clamp3(ball.vy * 8, -25, 25), -lim, lim);
      } else {
        predY = clamp3(ball.y * 0.5, -48, 48);
      }
      var gx = -385;
      if (dBall < 26 && ball.x < -300) {
        // Emergency clear: stay goal-side of the ball and boot it upfield.
        var kickNow = false;
        if (ball.x > you.x) kickNow = you.kickCooldown === 0 ? true : !you.heldKick;
        return ctrl(ball.x - 14, ball.y, kickNow);
      }
      return ctrl(gx, predY, false);
    }

    // Fielders: closest presses, others support.
    // Rank among teammates by ball distance.
    var order = mates.slice().sort(function (a, b) {
      var d = teamBallDist(a) - teamBallDist(b);
      return d !== 0 ? d : cmpId(a.id, b.id);
    });
    var myRank = 0;
    for (var r = 0; r < order.length; r++) if (order[r].id === you.id) { myRank = r; break; }
    var secondPress = (n > 1 && myRank === 1 && ball.x < -60 && !protect);
    var lastT = state.lastTouches.length ? state.lastTouches[state.lastTouches.length - 1] : null;
    var possession = Boolean(lastT && lastT.team === state.team);
    if (!iAmClosest && n > 1 && !desperate && !secondPress) {
      if (ball.x < -280) {
        // Ball in our box: stay out of the play, hold shape. Chasing
        // crosses deflect balls into our own net.
        return ctrl(you.x, you.y, false);
      }
      // Support position: stay goal-side-ish but useful, spread by slot.
      var lane = (myIdx % 2 === 0) ? 1 : -1;
      var spX, spY;
      if (protect) {
        // Kill time: get between ball and enemy, offer outlet.
        spX = clamp3(ball.x - 90, -330, 200);
        spY = clamp(ball.y * 0.5 + lane * 80, 190);
      } else if (myRank === 1 && (ball.x > 60 || (possession && ball.x > -100))) {
        // Attack: crash far-post / penalty spot lane.
        spX = clamp3(ball.x + 80, 120, 370);
        spY = clamp(ball.y * 0.3 + lane * 90, 175);
      } else if (myRank > 1 && ball.x > -40 && (possession || desperate)) {
        // Attack: second wave arrives as outlet, still goal-side of the ball.
        spX = clamp3(ball.x - 40, -200, 260);
        spY = clamp(ball.y * 0.4 + lane * 120, 185);
      } else if (ball.x > 200) {
        // Ball deep, no possession: one stays back as safety.
        spX = clamp3(ball.x - 160, -200, 180);
        spY = clamp(ball.y * 0.4 + lane * 95, 185);
      } else {
        spX = clamp3(ball.x - 120, -330, 180);
        spY = clamp(ball.y * 0.45 + lane * 85, 185);
      }
      // Avoid standing inside teammate chase line: keep distance from ball.
      if (dist(spX, spY, ball.x, ball.y) < 70) { spX -= 60; spY += lane * 40; spX = clamp(spX, -360); spY = clamp(spY, 190); }
      // Never stand inside own net mouth.
      if (spX < -365 && Math.abs(spY) < 80) spY = 110 * lane;
      return ctrl(spX, spY, false);
    }

    return attackBall(false);

    function attackBall(clearing) {
      var ballSpeed = Math.hypot(ball.vx, ball.vy);
      var t = clamp3(dist(you.x, you.y, ball.x, ball.y) / (2.0 + ballSpeed * 0.8), 0, 35);
      var pr = predictBall(clearing ? 0 : t);
      var tx = pr.x, ty = pr.y;
      var dNow = dist(you.x, you.y, ball.x, ball.y);
      // Time-wasting: carry to corner instead of shooting.
      if (protect && dNow < 40 && ball.x > 150) {
        var cy = ball.y >= 0 ? 165 : -165;
        var dotC = (ball.x - you.x) * 1 + (ball.y - you.y) * 0;
        var kickC = false;
        if (dNow <= 29 && dotC > 0) kickC = you.kickCooldown === 0 ? true : !you.heldKick;
        return ctrl(360, cy, kickC);
      }
      var lax = clearing ? 1 : aimX, lay = clearing ? 0 : aimY;
      var ll = Math.hypot(lax, lay) || 1; lax /= ll; lay /= ll;
      var goalDist = Math.hypot(EGX - ball.x, goalY - ball.y);
      var passed = false;
      var blocked = false;
      // Pass under pressure or when the shooting lane is clogged.
      if (!clearing && !protect) {
        var press = false;
        for (var p = 0; p < state.opponents.length; p++) {
          if (dist(state.opponents[p].x, state.opponents[p].y, ball.x, ball.y) < 42) { press = true; break; }
        }
        if (!press && goalDist > 180) {
          for (var b = 0; b < state.opponents.length; b++) {
            var ox = state.opponents[b].x - ball.x, oy = state.opponents[b].y - ball.y;
            var tt = ox * lax + oy * lay;
            if (tt < 30 || tt > goalDist) continue;
            var pp = Math.abs(ox * lay - oy * lax);
            if (pp < 45) { blocked = true; break; }
          }
        }
        if ((press || blocked) && state.teammates.length) {
          var bestMate = null, bestOpen = 60;
          for (var mi = 0; mi < state.teammates.length; mi++) {
            var mate = state.teammates[mi];
            var mx = mate.x - ball.x, my = mate.y - ball.y;
            var md = Math.hypot(mx, my);
            if (md < 40 || md > 330 || mate.x < ball.x - 60) continue;
            var open = 1e9;
            for (var q2 = 0; q2 < state.opponents.length; q2++) {
              var od = dist(state.opponents[q2].x, state.opponents[q2].y, mate.x, mate.y);
              if (od < open) open = od;
            }
            open -= md * 0.15;
            if (open > bestOpen) { bestOpen = open; bestMate = mate; }
          }
          if (bestMate) {
            var px = bestMate.x + bestMate.vx * 8 - ball.x;
            var py = bestMate.y + bestMate.vy * 8 - ball.y;
            var pl = Math.hypot(px, py) || 1;
            lax = px / pl; lay = py / pl;
            passed = true;
          }
        }
        // No outlet and lane clogged from range: carry, don't donate.
        if (!passed && blocked && goalDist > 220) {
          return ctrl(ball.x + lax * 20, ball.y + lay * 20, false);
        }
      }
      // Point just behind the ball along the aim line.
      var bx = ball.x - lax * 22, by = ball.y - lay * 22;
      var dx = ball.x - you.x, dy = ball.y - you.y;
      var along = dx * lax + dy * lay;   // >0 means I am behind the ball
      var cross = dx * lay - dy * lax;
      var close = dNow <= 31;
      var ownLine = ball.x + 420; // observed distance to our goal line
      var lineTol = ownLine < 150 ? 8 : 15;
      if (along > 0 && Math.abs(cross) < lineTol) {
        // Lined up: drive through the ball toward target.
        tx = ball.x + lax * 30; ty = ball.y + lay * 30;
      } else if (ball.x < -250 && along < -5) {
        // Enemy-side of a dangerous ball: never chase through it.
        if (Math.abs(cross) < 60) {
          // No lateral separation: peel off to the side first.
          tx = you.x - 15;
          ty = ball.y + (you.y >= ball.y ? 75 : -75);
          ty = clamp3(ty, -190, 190);
        } else if (ball.vx < -2 && ball.x > -350) {
          // Fast break: sprint to the mouth to cut the angle.
          tx = -380; ty = clamp(ball.y * 0.5, 42);
        } else {
          // Have separation: drop in goal-side of the ball.
          tx = ball.x - 25; ty = ball.y;
        }
        lax = 1; lay = 0;
      } else {
        // Go around: swing wide to the ball's far side.
        var side = (cross >= 0 && cross < 60) ? 1 : (cross < 0 ? -1 : (you.y >= ball.y ? 1 : -1));
        var detour = (along < 10 && Math.abs(cross) < 55);
        tx = bx; ty = by;
        if (detour) { tx -= lax * 14; ty += side * (ownLine < 150 ? 30 : 48); }
      }
      // Kick gating: boot only if contact sends ball roughly toward target.
      var kick = false;
      if (dNow <= 29) {
        var kx = ball.x - you.x, ky = ball.y - you.y;
        var kl = Math.hypot(kx, ky);
        var dot;
        if (kl < 1e-6) dot = 1;
        else dot = (kx * lax + ky * lay) / kl;
        // Contest scrambles far from our goal; stay strict near it.
        // A kick adds ~5*|dot| velocity (~500*|dot| travel): keep negative
        // kicks short of our line.
        var ownDist = ball.x + 420;
        var gate = ownDist > 150 ? -0.2 : (ownDist > 50 ? 0.1 : 0.5);
        if (dot > gate) {
          kick = (you.kickCooldown === 0) ? true : !you.heldKick;
        }
      } else if (dNow <= 33 && close) {
        kick = false;
      }
      // Don't carry kick=true while sprinting (slower accel 0.07).
      if (dNow > 29) kick = false;
      return ctrl(tx, ty, kick);
    }
  } catch (e) {
    return { x: 0, y: 0, kick: false };
  }
};
