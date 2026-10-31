(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArgonBot = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BOT_NAME = 'Argon';
  const POSTS = [[-420, -65], [-420, 65], [420, -65], [420, 65]];

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function compareIds(a, b) {
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    const sa = String(a.id);
    const sb = String(b.id);
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  }

  function collide(a, b, radius, inverseA, inverseB) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) return false;
    const nx = distance > 0 ? dx / distance : 1;
    const ny = distance > 0 ? dy / distance : 0;
    const inverse = inverseA + inverseB;
    const overlap = radius - distance;
    a.x -= nx * overlap * inverseA / inverse;
    a.y -= ny * overlap * inverseA / inverse;
    b.x += nx * overlap * inverseB / inverse;
    b.y += ny * overlap * inverseB / inverse;
    const velocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (velocity < 0) {
      const impulse = -1.5 * velocity / inverse;
      a.vx -= impulse * nx * inverseA;
      a.vy -= impulse * ny * inverseA;
      b.vx += impulse * nx * inverseB;
      b.vy += impulse * ny * inverseB;
    }
    return overlap > 0 || velocity < 0;
  }

  function wall(body, axis, limit, bounce) {
    const velocity = axis === 'x' ? 'vx' : 'vy';
    if (body[axis] > limit) {
      body[axis] = limit;
      if (body[velocity] > 0) body[velocity] *= -bounce;
    } else if (body[axis] < -limit) {
      body[axis] = -limit;
      if (body[velocity] < 0) body[velocity] *= -bounce;
    }
  }

  function stepFreeBall(b) {
    b.vx *= 0.99;
    b.vy *= 0.99;
    let remaining = 1;
    while (remaining > 1e-12) {
      const speed = Math.hypot(b.vx, b.vy);
      const fraction = Math.min(remaining, 4 / Math.max(4, speed));
      b.x += b.vx * fraction;
      b.y += b.vy * fraction;
      for (let i = 0; i < 4; i++) {
        const post = { x: POSTS[i][0], y: POSTS[i][1], vx: 0, vy: 0 };
        collide(post, b, 18, 0, 1);
      }
      if (Math.abs(b.y) >= 65) wall(b, 'x', 410, 0.5);
      if (Math.abs(b.x) <= 420) {
        wall(b, 'y', 190, 0.5);
      } else {
        wall(b, 'y', 55, 0.5);
        wall(b, 'x', 450, 0.5);
      }
      remaining -= fraction;
      if (Math.abs(b.x) > 430 && Math.abs(b.y) <= 55) break;
    }
  }

  function predictFreeBall(ball, maxSteps) {
    const b = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
    const traj = [{ x: b.x, y: b.y, vx: b.vx, vy: b.vy, goal: 0 }];
    for (let t = 1; t <= maxSteps; t++) {
      stepFreeBall(b);
      let g = 0;
      if (b.x > 430 && Math.abs(b.y) <= 55) g = 1;
      else if (b.x < -430 && Math.abs(b.y) <= 55) g = -1;
      traj.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, goal: g });
      if (g !== 0) {
        for (let k = t + 1; k <= maxSteps; k++) {
          traj.push({ x: b.x, y: b.y, vx: 0, vy: 0, goal: g });
        }
        break;
      }
    }
    return traj;
  }

  const POW96 = new Float64Array(121);
  const SUM_POW96 = new Float64Array(121);
  const ACCEL_DIST = new Float64Array(121);
  POW96[0] = 1;
  SUM_POW96[0] = 0;
  ACCEL_DIST[0] = 0;
  for (let i = 1; i <= 120; i++) {
    POW96[i] = POW96[i - 1] * 0.96;
    SUM_POW96[i] = SUM_POW96[i - 1] + POW96[i];
    ACCEL_DIST[i] = ACCEL_DIST[i - 1] + 0.11 * SUM_POW96[i];
  }

  function timeToReach(player, tx, ty, radius, maxSteps) {
    for (let t = 0; t <= maxSteps; t++) {
      const cx = player.x + player.vx * SUM_POW96[t];
      const cy = player.y + player.vy * SUM_POW96[t];
      if (Math.hypot(tx - cx, ty - cy) <= ACCEL_DIST[t] + radius) return t;
    }
    return maxSteps + 1;
  }

  function pdMove(you, tx, ty, kVel, kick) {
    const dx = tx - you.x - you.vx * kVel;
    const dy = ty - you.y - you.vy * kVel;
    const len = Math.hypot(dx, dy);
    if (len < 0.25) return { x: 0, y: 0, kick: Boolean(kick) };
    return {
      x: clamp(dx / len, -1, 1),
      y: clamp(dy / len, -1, 1),
      kick: Boolean(kick)
    };
  }

  function simulate3Steps(state, dirX, dirY, kickFlag) {
    const you0 = state.you;
    const ball0 = state.ball;
    const opps0 = state.opponents || [];
    const phase = state.phase;
    const myTeam = state.team;
    const kickoffAllowed = !(phase === 'kickoff' && state.kickoffTeam !== myTeam);

    const you = {
      x: you0.x, y: you0.y, vx: you0.vx, vy: you0.vy,
      kicking: false, heldKick: you0.heldKick, cooldown: you0.kickCooldown
    };
    const ball = { x: ball0.x, y: ball0.y, vx: ball0.vx, vy: ball0.vy };
    const nearbyOpps = [];
    for (let i = 0; i < opps0.length; i++) {
      const o = opps0[i];
      if (Math.hypot(o.x - ball0.x, o.y - ball0.y) < 130) {
        const odx = ball0.x - o.x;
        const ody = ball0.y - o.y;
        const olen = Math.hypot(odx, ody) || 1;
        nearbyOpps.push({
          x: o.x, y: o.y, vx: o.vx, vy: o.vy,
          ux: odx / olen, uy: ody / olen,
          canTouch: !(phase === 'kickoff' && state.kickoffTeam === myTeam)
        });
      }
    }

    const len = Math.hypot(dirX, dirY);
    const ux = len > 1e-6 ? dirX / len : 0;
    const uy = len > 1e-6 ? dirY / len : 0;
    const acc = kickFlag ? 0.07 : 0.11;

    let kicked = false;
    let touched = false;
    let oppTouched = false;
    let goalScored = 0;

    for (let s = 0; s < 3; s++) {
      you.vx = (you.vx + ux * acc) * 0.96;
      you.vy = (you.vy + uy * acc) * 0.96;
      you.kicking = kickFlag;
      you.cooldown = Math.max(0, you.cooldown - 1);
      wall(you, 'x', 435, 0.5);
      wall(you, 'y', 215, 0.5);

      for (let i = 0; i < nearbyOpps.length; i++) {
        const o = nearbyOpps[i];
        o.vx = (o.vx + o.ux * 0.11) * 0.96;
        o.vy = (o.vy + o.uy * 0.11) * 0.96;
        wall(o, 'x', 435, 0.5);
        wall(o, 'y', 215, 0.5);
      }

      ball.vx *= 0.99;
      ball.vy *= 0.99;

      let remaining = 1;
      while (remaining > 1e-12) {
        let maxSpd = Math.max(Math.hypot(ball.vx, ball.vy), Math.hypot(you.vx, you.vy));
        for (let i = 0; i < nearbyOpps.length; i++) {
          const os = Math.hypot(nearbyOpps[i].vx, nearbyOpps[i].vy);
          if (os > maxSpd) maxSpd = os;
        }
        const frac = Math.min(remaining, 4 / Math.max(4, maxSpd));
        you.x += you.vx * frac;
        you.y += you.vy * frac;
        wall(you, 'x', 435, 0.5);
        wall(you, 'y', 215, 0.5);
        for (let i = 0; i < nearbyOpps.length; i++) {
          const o = nearbyOpps[i];
          o.x += o.vx * frac;
          o.y += o.vy * frac;
          wall(o, 'x', 435, 0.5);
          wall(o, 'y', 215, 0.5);
        }
        ball.x += ball.vx * frac;
        ball.y += ball.vy * frac;

        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < nearbyOpps.length; i++) {
            collide(you, nearbyOpps[i], 30, 0.5, 0.5);
          }
          if (kickoffAllowed && collide(you, ball, 25, 0.5, 1)) {
            touched = true;
          }
          for (let i = 0; i < nearbyOpps.length; i++) {
            const o = nearbyOpps[i];
            if ((o.canTouch || touched || kicked) && collide(o, ball, 25, 0.5, 1)) {
              oppTouched = true;
            }
          }
        }

        for (let i = 0; i < 4; i++) {
          const post = { x: POSTS[i][0], y: POSTS[i][1], vx: 0, vy: 0 };
          collide(post, ball, 18, 0, 1);
        }
        if (Math.abs(ball.y) >= 65) wall(ball, 'x', 410, 0.5);
        if (Math.abs(ball.x) <= 420) {
          wall(ball, 'y', 190, 0.5);
        } else {
          wall(ball, 'y', 55, 0.5);
          wall(ball, 'x', 450, 0.5);
        }
        if (Math.abs(ball.x) > 430 && Math.abs(ball.y) <= 55) {
          goalScored = ball.x > 0 ? 1 : -1;
          break;
        }
        remaining -= frac;
      }

      if (goalScored !== 0) break;

      const rising = you.kicking && !you.heldKick;
      const ready = rising || you.cooldown === 0;
      if (you.kicking && ready && kickoffAllowed) {
        const dx = ball.x - you.x;
        const dy = ball.y - you.y;
        const d = Math.hypot(dx, dy);
        if (d <= 29) {
          const knx = d > 0 ? dx / d : 1;
          const kny = d > 0 ? dy / d : 0;
          ball.vx += knx * 5;
          ball.vy += kny * 5;
          you.cooldown = 10;
          kicked = true;
          touched = true;
        }
      }
      you.heldKick = you.kicking;
    }

    return { you, ball, kicked, touched, oppTouched, goalScored };
  }

  function sanitize(ans) {
    if (!ans || typeof ans !== 'object') return { x: 0, y: 0, kick: false };
    const x = typeof ans.x === 'number' && Number.isFinite(ans.x) ? clamp(ans.x, -1, 1) : 0;
    const y = typeof ans.y === 'number' && Number.isFinite(ans.y) ? clamp(ans.y, -1, 1) : 0;
    return { x, y, kick: ans.kick === true };
  }

  function decide(state) {
    if (!state || state.phase === 'goal') {
      return { x: 0, y: 0, kick: false };
    }
    const you = state.you;
    const ball = state.ball;
    const teammates = state.teammates || [];
    const opponents = state.opponents || [];
    const myTeam = [you].concat(teammates).sort(compareIds);
    const nTeam = myTeam.length;

    const traj = predictFreeBall(ball, 80);

    // Check if ball is heading into our own goal
    let ownGoalThreatStep = -1;
    let ownGoalCrossY = 0;
    for (let t = 1; t < traj.length; t++) {
      if (traj[t].x <= -412 && Math.abs(traj[t].y) <= 72) {
        ownGoalThreatStep = t;
        ownGoalCrossY = clamp(traj[t].y, -56, 56);
        break;
      }
    }

    function findIntercept(p, extraRadius) {
      const isNonKickoff = state.phase === 'kickoff' && state.kickoffTeam !== p.team;
      for (let t = 0; t < traj.length; t++) {
        const b = traj[t];
        if (Math.abs(b.x) > 425) break;
        if (isNonKickoff && (b.x > -15 || Math.hypot(b.x, b.y) < 85)) continue;
        const cx = p.x + p.vx * SUM_POW96[t];
        const cy = p.y + p.vy * SUM_POW96[t];
        if (Math.hypot(b.x - cx, b.y - cy) <= ACCEL_DIST[t] + extraRadius) {
          return { step: t, x: b.x, y: b.y, vx: b.vx, vy: b.vy };
        }
      }
      const last = traj[traj.length - 1];
      return { step: traj.length, x: last.x, y: last.y, vx: last.vx, vy: last.vy };
    }

    const myIntercepts = myTeam.map(p => ({ p, int: findIntercept(p, 21) }));
    const oppIntercepts = opponents.map(p => ({ p, int: findIntercept(p, 23) }));
    oppIntercepts.sort((a, b) => a.int.step - b.int.step);
    const bestOppStep = oppIntercepts.length ? oppIntercepts[0].int.step : 999;

    const sortedByInt = myIntercepts.slice().sort((a, b) => {
      // Penalize a teammate who is caught ahead of the ball (x > ball.x + 12) when another teammate is behind the ball
      const penA = a.p.x > ball.x + 12 ? 12 : 0;
      const penB = b.p.x > ball.x + 12 ? 12 : 0;
      const d = (a.int.step + penA) - (b.int.step + penB);
      if (Math.abs(d) > 2) return d;
      const da = Math.hypot(a.p.x - ball.x, a.p.y - ball.y);
      const db = Math.hypot(b.p.x - ball.x, b.p.y - ball.y);
      return da - db || compareIds(a.p, b.p);
    });

    const primaryId = sortedByInt[0].p.id;
    let keeperId = null;
    if (nTeam >= 2) {
      // Only keep a dedicated goalkeeper when nTeam >= 3, OR in 2v2 when the ball is in our defensive half or moving toward our goal!
      // In 2v2 when the ball is in the attacking half (x > 20) and not threatening our goal, the second player moves up to mid-attacking support!
      const others = myTeam.filter(p => p.id !== primaryId);
      others.sort((a, b) => a.x - b.x || compareIds(a, b));
      if (nTeam >= 3 || ball.x < 20 || ball.vx < -1.5 || ownGoalThreatStep > 0) {
        keeperId = others[0].id;
      }
    }

    const distToBall = Math.hypot(ball.x - you.x, ball.y - you.y);
    const shouldResetKickEdge = you.heldKick && you.kickCooldown > 2;

    // Choose best target in enemy goal (find the largest open gap past opponents near goal)
    let bestTargetY = 0;
    let maxGoalClearance = 999;
    if (opponents.length > 0) {
      const candYs = [-46, -32, -16, 0, 16, 32, 46];
      let bestGapScore = -1e9;
      for (let i = 0; i < candYs.length; i++) {
        const cy = candYs[i];
        const sdx = 425 - ball.x;
        const sdy = cy - ball.y;
        const slen = Math.hypot(sdx, sdy) || 1;
        const snx = sdx / slen;
        const sny = sdy / slen;
        let minClearance = 999;
        for (let j = 0; j < opponents.length; j++) {
          const op = opponents[j];
          const ox = (op.x + op.vx * 6) - ball.x;
          const oy = (op.y + op.vy * 6) - ball.y;
          const proj = ox * snx + oy * sny;
          if (proj > -10 && proj < slen + 15) {
            const perp = Math.abs(ox * sny - oy * snx);
            const effectiveClearance = perp - Math.max(0, (300 - proj) * 0.04);
            if (effectiveClearance < minClearance) minClearance = effectiveClearance;
          }
        }
        const anglePenalty = Math.abs(cy) * 0.08;
        const score = minClearance - anglePenalty;
        if (score > bestGapScore) {
          bestGapScore = score;
          bestTargetY = cy;
          maxGoalClearance = minClearance;
        }
      }
    }

    // Check if there is an open teammate in a much better scoring position (for passing / crossing)
    let passTarget = null;
    if (teammates.length > 0 && ball.x > -80) {
      for (let i = 0; i < teammates.length; i++) {
        const tm = teammates[i];
        if (tm.x > ball.x - 90 && tm.x > 60 && Math.abs(tm.y) < 125) {
          const dTm = Math.hypot(tm.x - ball.x, tm.y - ball.y);
          if (dTm > 60 && dTm < 320) {
            const weInCorner = ball.x > 290 && Math.abs(ball.y) > 85;
            if (weInCorner || (maxGoalClearance < 22 && tm.x > ball.x + 30)) {
              passTarget = { x: tm.x + 25, y: tm.y };
              break;
            }
          }
        }
      }
    }

    // Special Kickoff Routine when our team has kickoff and ball is stationary at (0,0)
    if (state.phase === 'kickoff' && state.kickoffTeam === state.team && you.id === primaryId) {
      let oppY = 0;
      let oppDist = 999;
      for (let i = 0; i < opponents.length; i++) {
        const d = Math.hypot(opponents[i].x, opponents[i].y);
        if (d < oppDist) {
          oppDist = d;
          oppY = opponents[i].y;
        }
      }
      const aimSide = oppY >= 0 ? -1 : 1;
      const targetY = -aimSide * 10;
      if (distToBall <= 28.5) {
        return sanitize({ x: 1, y: aimSide * 0.35, kick: !shouldResetKickEdge });
      }
      const dy = targetY - (you.y + you.vy * 4);
      return sanitize({ x: 1, y: clamp(dy * 0.15, -0.5, 0.5), kick: false });
    }

    // Non-kickoff team waiting for kickoff
    if (state.phase === 'kickoff' && state.kickoffTeam !== state.team && you.id === primaryId) {
      const targetX = -86;
      const targetY = clamp(ball.y, -15, 15);
      let minOppBall = 999;
      for (let i = 0; i < opponents.length; i++) {
        const d = Math.hypot(opponents[i].x - ball.x, opponents[i].y - ball.y);
        if (d < minOppBall) minOppBall = d;
      }
      if (minOppBall < 36) {
        return sanitize({ x: 1, y: clamp((ball.y - you.y) * 0.1, -0.5, 0.5), kick: false });
      }
      return sanitize(pdMove(you, targetX, targetY, 5, false));
    }

    // When within 65 units of the ball, run 3-step physics lookahead over candidate actions!
    // Important: in multi-player, if we are NOT primaryId, do NOT touch or kick the ball if primaryId is also within 55 units and behind the ball!
    const primaryPlayer = sortedByInt[0].p;
    const primaryCloseAndBehind = you.id !== primaryId &&
      Math.hypot(primaryPlayer.x - ball.x, primaryPlayer.y - ball.y) < 60 &&
      primaryPlayer.x < ball.x + 5;

    if (distToBall < 65 && !primaryCloseAndBehind && (you.id === primaryId || distToBall < 36)) {
      const baseAngle = Math.atan2(ball.y - you.y, ball.x - you.x);
      const goalAngle = Math.atan2(bestTargetY - ball.y, 425 - ball.x);
      const angles = [
        baseAngle,
        goalAngle,
        baseAngle + 0.28,
        baseAngle - 0.28,
        baseAngle + 0.6,
        baseAngle - 0.6,
        baseAngle + 1.05,
        baseAngle - 1.05,
        baseAngle + 1.57,
        baseAngle - 1.57,
        baseAngle + Math.PI,
        0
      ];
      if (passTarget) {
        angles.push(Math.atan2(passTarget.y - ball.y, passTarget.x - ball.x));
      }

      let bestAct = null;
      let bestScore = -1e12;

      for (let i = 0; i < angles.length; i++) {
        const ang = angles[i];
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const kickOptions = shouldResetKickEdge ? [false] : (distToBall <= 42 ? [false, true] : [false]);

        for (let k = 0; k < kickOptions.length; k++) {
          const kf = kickOptions[k];
          const sim = simulate3Steps(state, dx, dy, kf);
          const sb = sim.ball;
          const sy = sim.you;

          if (sim.goalScored === -1) continue;
          if (sim.goalScored === 1) {
            return sanitize({ x: dx, y: dy, kick: kf });
          }

          let score = 0;
          const futureTraj = predictFreeBall(sb, 50);
          let scoredStep = -1;
          let ownScoredStep = -1;
          for (let t = 1; t < futureTraj.length; t++) {
            if (futureTraj[t].goal === 1) { scoredStep = t; break; }
            if (futureTraj[t].goal === -1) { ownScoredStep = t; break; }
          }

          if (ownScoredStep > 0) {
            score -= 80000 - ownScoredStep * 200;
          } else if (scoredStep > 0) {
            let oppBlocks = false;
            for (let j = 0; j < opponents.length; j++) {
              const op = opponents[j];
              const midT = Math.max(1, scoredStep >> 1);
              const pMid = futureTraj[midT];
              const pEnd = futureTraj[Math.max(1, scoredStep - 2)];
              if (timeToReach(op, pMid.x, pMid.y, 22, midT + 3) <= midT + 3 ||
                  timeToReach(op, pEnd.x, pEnd.y, 22, scoredStep + 1) <= scoredStep + 1) {
                oppBlocks = true;
                break;
              }
            }
            if (!oppBlocks) {
              score += 35000 - scoredStep * 100;
            } else {
              score += 5500 - scoredStep * 25 + Math.hypot(sb.vx, sb.vy) * 120 + Math.abs(futureTraj[scoredStep].y) * 18;
            }
          } else {
            const bEnd = futureTraj[22] || futureTraj[futureTraj.length - 1];
            score += bEnd.x * 2.8 - Math.abs(bEnd.y) * 0.45;
            score += sb.vx * 22;

            // Bonus for centering the ball into the "danger box" (x in [250, 405], |y| < 65)
            if (bEnd.x > 250 && bEnd.x < 405 && Math.abs(bEnd.y) < 65) {
              score += 240 - Math.abs(bEnd.y) * 2.0;
            }
            // Penalty for trapping the ball in the dead outer corners (x > 340, |y| > 110)
            if (bEnd.x > 340 && Math.abs(bEnd.y) > 110) {
              score -= (Math.abs(bEnd.y) - 110) * 4.5;
            }

            const bCheck = futureTraj[12] || bEnd;
            let myNextT = timeToReach(sy, bCheck.x, bCheck.y, 22, 35);
            for (let j = 0; j < teammates.length; j++) {
              const tmT = timeToReach(teammates[j], bCheck.x, bCheck.y, 22, 35) + 3;
              if (tmT < myNextT) myNextT = tmT;
            }
            let oppNextT = 99;
            for (let j = 0; j < opponents.length; j++) {
              const opT = timeToReach(opponents[j], bCheck.x, bCheck.y, 23, 35) + 3;
              if (opT < oppNextT) oppNextT = opT;
            }

            score += (oppNextT - myNextT) * 50;

            if (sim.kicked) {
              if (oppNextT + 2 < myNextT && sb.x > -220) {
                score -= 900;
              } else if (ball.x < -180 && sb.vx > 2.5 && Math.abs(sb.vy) > 0.8) {
                score += 650;
              } else if (passTarget && Math.hypot(bCheck.x - passTarget.x, bCheck.y - passTarget.y) < 55 && myNextT < oppNextT) {
                score += 550;
              } else if (bEnd.x < ball.x + 55 && !(ball.x > 300 && Math.abs(bEnd.y) < Math.abs(ball.y) - 35)) {
                score -= 450;
              }
            }
          }

          if (scoredStep < 0 && sy.x > sb.x + 4) {
            score -= (sy.x - sb.x) * 45 + 300;
          }

          const inEnemyCorner = sb.x > 290 && Math.abs(sb.y) > 70;
          let fTargetX = 425;
          let fTargetY = bestTargetY;
          if (passTarget && inEnemyCorner) {
            fTargetX = passTarget.x;
            fTargetY = passTarget.y;
          } else if (inEnemyCorner) {
            fTargetX = sb.x > 375 ? 395 : 420;
            fTargetY = sb.y > 0 ? -15 : 15;
          }
          const fGx = fTargetX - sb.x;
          const fGy = fTargetY - sb.y;
          const fGLen = Math.hypot(fGx, fGy) || 1;
          const fnx = fGx / fGLen;
          const fny = fGy / fGLen;

          const idealPx = sb.x - fnx * 21;
          const idealPy = sb.y - fny * 21;
          const distToIdeal = Math.hypot(sy.x - idealPx, sy.y - idealPy);
          score -= distToIdeal * 3.8;

          const relX = sb.x - sy.x;
          const relY = sb.y - sy.y;
          const dotGoal = (relX * fnx + relY * fny) / (Math.hypot(relX, relY) || 1);
          score += dotGoal * 130;

          if (dotGoal > 0.65) {
            score += (sy.vx * fnx + sy.vy * fny) * 28;
          }

          if (score > bestScore) {
            bestScore = score;
            bestAct = { x: dx, y: dy, kick: kf };
          }
        }
      }

      if (bestAct && bestScore > -1e10) {
        return sanitize(bestAct);
      }
    }

    // ROLE: Goalkeeper (when assigned keeperId)
    if (you.id === keeperId && you.id !== primaryId) {
      if (ownGoalThreatStep > 0 && ownGoalThreatStep < 65) {
        const doKick = distToBall <= 30 && ball.x > you.x + 2 && !shouldResetKickEdge;
        return sanitize(pdMove(you, -405, ownGoalCrossY, 4, doKick));
      }
      const defendX = ball.x < -150 ? -400 : (ball.x < 100 ? -385 : -350);
      const targetY = clamp(ball.y * 0.42 + ball.vy * 5, -50, 50);
      return sanitize(pdMove(you, defendX, targetY, 6, false));
    }

    // ROLE: Support players (2nd attacker in 2v2 when attacking, or support in 3v3/4v4)
    if (you.id !== primaryId) {
      const nonPrimary = sortedByInt.filter(e => e.p.id !== primaryId && e.p.id !== keeperId);
      const supIdx = nonPrimary.findIndex(e => e.p.id === you.id);

      // If primary player is caught ahead of the ball (x > ball.x) or ball is in our half, first support player immediately challenges the ball!
      const primaryPlayer = sortedByInt[0].p;
      if (supIdx === 0 && (primaryPlayer.x > ball.x + 12 || (ball.x > 250 && distToBall < 140))) {
        const myInt = findIntercept(you, 20);
        const targetB = traj[Math.min(myInt.step, 30)];
        const gx = 425 - targetB.x;
        const gy = bestTargetY - targetB.y;
        const gLen = Math.hypot(gx, gy) || 1;
        return sanitize(pdMove(you, targetB.x - (gx / gLen) * 22, targetB.y - (gy / gLen) * 22, 3.5, false));
      }

      if (supIdx === 0) {
        // Poacher / Second Striker: position near the penalty spot / opposite post ready to one-timer any cross or rebound!
        const side = ball.y >= 0 ? -1 : 1;
        let supX = clamp(ball.x + (ball.x > 220 ? -45 : 55), -160, 340);
        let supY = clamp(ball.y * 0.25 + side * 60, -90, 90);
        if (ball.x > 260 && Math.abs(ball.y) > 65) {
          supX = 325;
          supY = side * 22;
        }
        return sanitize(pdMove(you, supX, supY, 5.0, false));
      } else if (supIdx === 1) {
        // Attacking Midfielder / Wing Support (in 4v4)
        const side = ball.y >= 0 ? 1 : -1;
        const amX = clamp(ball.x - 85, -220, 260);
        const amY = clamp(ball.y * 0.6 + side * 75, -145, 145);
        return sanitize(pdMove(you, amX, amY, 5.5, false));
      } else {
        // Midfield sweeper covering counter-attacks
        const midX = clamp(ball.x * 0.55 - 110, -320, 120);
        const midY = clamp(ball.y * 0.5, -110, 110);
        return sanitize(pdMove(you, midX, midY, 6, false));
      }
    }

    // ROLE: Primary ball player (or sole player in 1v1)
    const myInt = findIntercept(you, 20);

    // Emergency goal-line save
    if (ownGoalThreatStep > 0 && ownGoalThreatStep < 60) {
      const doKick = distToBall <= 30 && ball.x > you.x + 2 && !shouldResetKickEdge;
      return sanitize(pdMove(you, -410, ownGoalCrossY, 3.5, doKick));
    }

    // Defensive recovery: if opponent reaches the ball before or with us, or if we are ahead of the ball
    const oppBeat = bestOppStep + 2 < myInt.step;
    const caughtAhead = you.x > myInt.x - 5 && bestOppStep < myInt.step + 15;
    if (oppBeat || caughtAhead) {
      const refPt = oppBeat && oppIntercepts.length ? oppIntercepts[0].int : myInt;
      const gdx = -420 - refPt.x;
      const gdy = -refPt.y * 0.65;
      const glen = Math.hypot(gdx, gdy) || 1;
      const cushion = oppBeat ? 45 : 32;
      let blockX = clamp(refPt.x + (gdx / glen) * cushion, -408, 360);
      let blockY = clamp(refPt.y + (gdy / glen) * cushion, -180, 180);

      const toBallX = ball.x - you.x;
      const toBallY = ball.y - you.y;
      if (toBallX < 10 && Math.abs(toBallY) < 35 && distToBall < 75) {
        // Choose detour side away from our own goal center (y=0) if possible, or whichever side we are already on if clear
        let side = (you.y - ball.y) >= 0 ? 1 : -1;
        if (ball.y > 140) side = -1;
        else if (ball.y < -140) side = 1;
        blockY = clamp(ball.y + side * 48, -185, 185);
      }
      const doKick = distToBall <= 30 && ball.x > you.x + 4 && !shouldResetKickEdge;
      return sanitize(pdMove(you, blockX, blockY, 3.5, doKick));
    }

    const targetB = traj[Math.min(myInt.step, 36)];
    const inCorner = targetB.x > 290 && Math.abs(targetB.y) > 70;
    let aimTargetX = 425;
    let aimTargetY = bestTargetY;
    if (passTarget && inCorner) {
      aimTargetX = passTarget.x;
      aimTargetY = passTarget.y;
    } else if (inCorner) {
      aimTargetX = targetB.x > 375 ? 395 : 420;
      aimTargetY = targetB.y > 0 ? -15 : 15;
    }
    const gx = aimTargetX - targetB.x;
    const gy = aimTargetY - targetB.y;
    const gLen = Math.hypot(gx, gy) || 1;
    const nx = gx / gLen;
    const ny = gy / gLen;

    const dx = targetB.x - you.x;
    const dy = targetB.y - you.y;
    const behind = dx * nx + dy * ny;
    const lateral = dx * ny - dy * nx;

    if (behind > 8 && Math.abs(lateral) < 18 + Math.max(0, (behind - 20) * 0.25)) {
      const driveX = targetB.x + nx * 20;
      const driveY = targetB.y + ny * 20;
      return sanitize(pdMove(you, driveX, driveY, 2.5, false));
    }

    const approachDist = clamp(24 + myInt.step * 0.35, 22, 42);
    let aimX = targetB.x - nx * approachDist;
    let aimY = targetB.y - ny * approachDist;

    // Crucial: also check if the current ball is between us and our aim point (so we don't clip the ball while running to aimX, aimY!)
    const curDx = ball.x - you.x;
    const curDy = ball.y - you.y;
    const curBehind = curDx * nx + curDy * ny;
    const curLat = curDx * ny - curDy * nx;
    if ((behind < 14 && Math.abs(lateral) < 42) || (curBehind < 14 && Math.abs(curLat) < 38 && distToBall < 85)) {
      let side = (you.y - ball.y) >= 0 ? 1 : -1;
      if (ball.y > 135) side = -1;
      else if (ball.y < -135) side = 1;
      aimY = ball.y + side * 52;
      aimX = Math.min(aimX, ball.x - 28);
    }
    aimX = clamp(aimX, -425, 415);
    aimY = clamp(aimY, -185, 185);

    return sanitize(pdMove(you, aimX, aimY, 4.0, false));
  }

  decide.botName = BOT_NAME;
  decide.id = 'argon';
  return decide;
}));
