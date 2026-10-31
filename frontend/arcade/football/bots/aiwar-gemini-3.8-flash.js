/**
 * AI Football Bot: Titan
 *
 * Strategy Overview:
 * Titan combines exact forward simulation of pitch ball physics (damping, wall/post bounces,
 * and goal mouth detection) with analytical linear reachability prediction to execute lethal
 * offensive strikes and impenetrable defensive positioning. In attack, it computes dynamic
 * angle bisectors and clearance rays across enemy defenders to fire high-speed corner shots,
 * while seamlessly coordinating multi-player squads into dedicated goalkeeper, sweeper, and
 * striker roles across 1v1, 2v2, 3v3, and 4v4 matches.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Titan = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Physics constants and precomputed reachability tables
  const STEPS = 120;
  const DAMP_PLAYER = 0.96;
  const ACCEL_NORM = 0.11;
  const C_TABLE = new Float64Array(STEPS + 1);
  const D_TABLE = new Float64Array(STEPS + 1);

  (function initPhysicsTables() {
    let cvx = 0;
    let cx = 0;
    for (let t = 0; t <= STEPS; t++) {
      C_TABLE[t] = 24 * (1 - Math.pow(DAMP_PLAYER, t));
      D_TABLE[t] = cx;
      cvx = (cvx + ACCEL_NORM) * DAMP_PLAYER;
      cx += cvx;
    }
  })();

  const POSTS = [[-420, -65], [-420, 65], [420, -65], [420, 65]];

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function sanitizeNum(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function compareIds(a, b) {
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    const left = String(a.id);
    const right = String(b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  // Exact forward physics simulation of ball trajectory
  function simulateBall(ball0, maxSteps) {
    let x = ball0.x;
    let y = ball0.y;
    let vx = ball0.vx;
    let vy = ball0.vy;
    const traj = [{ x, y, vx, vy, goal: 0 }];
    const limit = maxSteps || 120;

    for (let s = 1; s <= limit; s++) {
      vx *= 0.99;
      vy *= 0.99;
      let remaining = 1;
      let goal = 0;

      while (remaining > 1e-12 && goal === 0) {
        const speed = Math.hypot(vx, vy);
        const frac = Math.min(remaining, 4 / Math.max(4, speed));
        x += vx * frac;
        y += vy * frac;

        // Post collisions
        for (let p = 0; p < 4; p++) {
          const px = POSTS[p][0];
          const py = POSTS[p][1];
          const dx = x - px;
          const dy = y - py;
          const d = Math.hypot(dx, dy);
          if (d <= 18) {
            const nx = d > 0 ? dx / d : 1;
            const ny = d > 0 ? dy / d : 0;
            x = px + nx * 18;
            y = py + ny * 18;
            const vDot = vx * nx + vy * ny;
            if (vDot < 0) {
              vx -= 1.5 * vDot * nx;
              vy -= 1.5 * vDot * ny;
            }
          }
        }

        // Walls
        if (Math.abs(y) >= 65) {
          if (x > 410) { x = 410; if (vx > 0) vx *= -0.5; }
          else if (x < -410) { x = -410; if (vx < 0) vx *= -0.5; }
        }
        if (Math.abs(x) <= 420) {
          if (y > 190) { y = 190; if (vy > 0) vy *= -0.5; }
          else if (y < -190) { y = -190; if (vy < 0) vy *= -0.5; }
        } else {
          if (y > 55) { y = 55; if (vy > 0) vy *= -0.5; }
          else if (y < -55) { y = -55; if (vy < 0) vy *= -0.5; }
          if (x > 450) { x = 450; if (vx > 0) vx *= -0.5; }
          else if (x < -450) { x = -450; if (vx < 0) vx *= -0.5; }
        }

        // Goal triggers
        if (x > 430 && Math.abs(y) <= 55) goal = 1;
        else if (x < -430 && Math.abs(y) <= 55) goal = -1;

        remaining -= frac;
      }

      traj.push({ x, y, vx, vy, goal });
      if (goal !== 0) break;
    }
    return traj;
  }

  // Earliest reachable step for a player along ball trajectory
  function findArrival(player, traj, reachRadius) {
    const maxT = Math.min(STEPS, traj.length - 1);
    for (let t = 1; t <= maxT; t++) {
      const C = C_TABLE[t];
      const driftX = player.x + player.vx * C;
      const driftY = player.y + player.vy * C;
      const d = Math.hypot(traj[t].x - driftX, traj[t].y - driftY);
      if (d <= D_TABLE[t] + reachRadius) {
        return { t, x: traj[t].x, y: traj[t].y };
      }
    }
    const last = traj[traj.length - 1];
    return { t: 999, x: last.x, y: last.y };
  }

  // Find best intercept point when ball is actively flying towards own net
  function findEmergencyIntercept(you, traj, scoreStep) {
    let bestStep = 1;
    let minGap = 9999;
    for (let s = 1; s < scoreStep; s++) {
      const C = C_TABLE[s];
      const driftX = you.x + you.vx * C;
      const driftY = you.y + you.vy * C;
      const d = Math.hypot(traj[s].x - driftX, traj[s].y - driftY);
      const gap = d - (D_TABLE[s] + 28);
      if (gap <= 0) {
        return { step: s, pt: traj[s] };
      }
      if (gap < minGap) {
        minGap = gap;
        bestStep = s;
      }
    }
    return { step: bestStep, pt: traj[bestStep] || traj[0] };
  }

  // Evaluates enemy goal mouth rays and selects opening with maximal clearance from defenders
  function selectBestTarget(ballPos, opponents) {
    const yCandidates = [-42, -30, -18, 0, 18, 30, 42];
    let bestTarget = { x: 420, y: 0 };
    let maxClearance = -1;

    for (const yt of yCandidates) {
      let minOppDist = 9999;
      for (let i = 0; i < opponents.length; i++) {
        const opp = opponents[i];
        const d = distToSegment(opp.x, opp.y, ballPos.x, ballPos.y, 420, yt);
        if (d < minOppDist) minOppDist = d;
      }
      if (minOppDist > maxClearance) {
        maxClearance = minOppDist;
        bestTarget = { x: 420, y: yt };
      }
    }

    // Bank shot consideration when direct goal mouth is congested
    if (maxClearance < 20) {
      for (const wallY of [-190, 190]) {
        const dy1 = Math.abs(wallY - ballPos.y);
        const dy2 = 0.5 * Math.abs(wallY);
        const totalDx = 420 - ballPos.x;
        if (totalDx > 60) {
          const dx1 = totalDx * dy1 / (dy1 + dy2);
          const xw = ballPos.x + dx1;
          if (xw > ballPos.x + 25 && xw < 390) {
            let clear = 9999;
            for (let i = 0; i < opponents.length; i++) {
              const opp = opponents[i];
              const d1 = distToSegment(opp.x, opp.y, ballPos.x, ballPos.y, xw, wallY);
              const d2 = distToSegment(opp.x, opp.y, xw, wallY, 420, 0);
              clear = Math.min(clear, d1, d2);
            }
            if (clear > maxClearance + 8) {
              return { target: { x: xw, y: wallY }, clearance: clear };
            }
          }
        }
      }
    }

    return { target: bestTarget, clearance: maxClearance };
  }

  // Analytical pursuit guidance towards target point at future time step t
  function guideToPoint(you, targetX, targetY, tStep) {
    const t = Math.max(1, Math.min(STEPS, Math.round(tStep || 15)));
    const C = C_TABLE[t];
    const driftX = you.x + you.vx * C;
    const driftY = you.y + you.vy * C;
    const dx = targetX - driftX;
    const dy = targetY - driftY;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  // Proportional-derivative holding position for goalkeepers and defenders
  function parkAtPoint(you, targetX, targetY) {
    const dx = targetX - you.x;
    const dy = targetY - you.y;
    const ux = dx * 0.15 - you.vx * 0.70;
    const uy = dy * 0.15 - you.vy * 0.70;
    const len = Math.hypot(ux, uy);
    if (len < 0.001) return { x: 0, y: 0 };
    return { x: ux / len, y: uy / len };
  }

  function decide(state) {
    try {
      if (!state || state.phase === 'goal') {
        return { x: 0, y: 0, kick: false };
      }

      const you = state.you;
      const ball = state.ball;
      const teammates = state.teammates || [];
      const opponents = state.opponents || [];
      const squad = [you].concat(teammates).sort(compareIds);

      // 1. Simulate pitch ball trajectory up to 120 steps ahead
      const ballTraj = simulateBall(ball, 120);

      let scoresForUs = false;
      let scoresAgainstUs = false;
      let scoreStep = 999;
      for (let s = 1; s < ballTraj.length; s++) {
        if (ballTraj[s].goal === 1) {
          scoresForUs = true;
          scoreStep = s;
          break;
        } else if (ballTraj[s].goal === -1) {
          scoresAgainstUs = true;
          scoreStep = s;
          break;
        }
      }

      // 2. Compute arrival times
      const myArrival = findArrival(you, ballTraj, 28);
      let oppMinArrival = { t: 999 };
      for (let i = 0; i < opponents.length; i++) {
        const arr = findArrival(opponents[i], ballTraj, 28);
        if (arr.t < oppMinArrival.t) oppMinArrival = arr;
      }

      // 3. Multi-player role assignment
      const squadArrivals = squad.map(p => ({ p, arr: findArrival(p, ballTraj, 28) }));
      squadArrivals.sort((a, b) => {
        if (Math.abs(a.arr.t - b.arr.t) > 2) return a.arr.t - b.arr.t;
        const distA = Math.hypot(a.p.x - ball.x, a.p.y - ball.y);
        const distB = Math.hypot(b.p.x - ball.x, b.p.y - ball.y);
        if (Math.abs(distA - distB) > 5) return distA - distB;
        return compareIds(a.p, b.p);
      });

      const isStriker = squadArrivals[0].p.id === you.id;

      let keeperPlayer = null;
      let supportPlayer = null;
      if (squad.length >= 2) {
        const nonStrikers = squadArrivals.slice(1).map(item => item.p);
        nonStrikers.sort((a, b) => Math.hypot(a.x - (-420), a.y) - Math.hypot(b.x - (-420), b.y));
        keeperPlayer = nonStrikers[0];
        if (nonStrikers.length >= 2) supportPlayer = nonStrikers[1];
      }

      const isKeeper = keeperPlayer && keeperPlayer.id === you.id;
      const isSupport = supportPlayer && supportPlayer.id === you.id;

      // Escort ball into enemy net if it is already scoring and safe
      if (scoresForUs && oppMinArrival.t >= scoreStep) {
        return { x: 0.5, y: 0, kick: false };
      }

      // EMERGENCY DEFENSE: Incoming shot on our net
      if (scoresAgainstUs) {
        const intercept = findEmergencyIntercept(you, ballTraj, scoreStep);
        const distToIntercept = Math.hypot(you.x - intercept.pt.x, you.y - intercept.pt.y);
        const move = guideToPoint(you, intercept.pt.x, intercept.pt.y, intercept.step);
        // Only kick when strictly between own goal and ball pushing outward
        const canKick = distToIntercept <= 28.5 && (ball.x - you.x) > 3;
        return {
          x: clamp(sanitizeNum(move.x, 0), -1, 1),
          y: clamp(sanitizeNum(move.y, 0), -1, 1),
          kick: canKick
        };
      }

      // KICKOFF TACTICS
      if (state.phase === 'kickoff') {
        if (state.kickoffTeam !== state.team) {
          // Defend center circle perimeter cleanly
          const targetX = -85;
          const targetY = clamp(ball.y, -30, 30);
          const move = parkAtPoint(you, targetX, targetY);
          return {
            x: clamp(sanitizeNum(move.x, 0), -1, 1),
            y: clamp(sanitizeNum(move.y, 0), -1, 1),
            kick: false
          };
        }
        // Our kickoff: bypass initial midfield opponent via targeted flank shot
        if (isStriker) {
          const aimTarget = { x: 160, y: 110 };
          const dx = aimTarget.x - ball.x;
          const dy = aimTarget.y - ball.y;
          const aimLen = Math.hypot(dx, dy) || 1;
          const nx = dx / aimLen;
          const ny = dy / aimLen;
          const strikePos = { x: ball.x - nx * 18, y: ball.y - ny * 18 };
          const dist = Math.hypot(you.x - ball.x, you.y - ball.y);
          const move = guideToPoint(you, strikePos.x, strikePos.y, myArrival.t);
          return {
            x: clamp(sanitizeNum(move.x, 0), -1, 1),
            y: clamp(sanitizeNum(move.y, 0), -1, 1),
            kick: dist <= 28.5
          };
        }
      }

      // 4. GOALKEEPER ROLE (squad >= 2)
      if (isKeeper) {
        let gx;
        if (squad.length === 2) {
          gx = clamp(ball.x - 260, -385, -280);
        } else {
          gx = clamp(ball.x - 300, -390, -340);
        }
        const gy = clamp((ball.y * (gx + 420)) / Math.max(1, ball.x + 420), -50, 50);
        const distToBall = Math.hypot(you.x - ball.x, you.y - ball.y);

        // Clear loose ball inside penalty box if safe
        if (ball.x < -240 && myArrival.t <= oppMinArrival.t + 1) {
          const clearTarget = { x: 380, y: you.y >= 0 ? 110 : -110 };
          const cdx = clearTarget.x - ball.x;
          const cdy = clearTarget.y - ball.y;
          const clen = Math.hypot(cdx, cdy) || 1;
          const cnx = cdx / clen;
          const cny = cdy / clen;
          const strikePos = { x: ball.x - cnx * 18, y: ball.y - cny * 18 };
          const move = guideToPoint(you, strikePos.x, strikePos.y, myArrival.t);
          const kick = distToBall <= 28.5 && (ball.x - you.x) > 3;
          return {
            x: clamp(sanitizeNum(move.x, 0), -1, 1),
            y: clamp(sanitizeNum(move.y, 0), -1, 1),
            kick
          };
        }

        const move = parkAtPoint(you, gx, gy);
        const kick = distToBall <= 28 && (ball.x - you.x) > 3;
        return {
          x: clamp(sanitizeNum(move.x, 0), -1, 1),
          y: clamp(sanitizeNum(move.y, 0), -1, 1),
          kick
        };
      }

      // 5. SUPPORT / MIDFIELDER (squad >= 3)
      if (isSupport) {
        const supX = clamp(ball.x - 120, -250, 180);
        const supY = clamp(-ball.y * 0.5, -110, 110);
        const distToBall = Math.hypot(you.x - ball.x, you.y - ball.y);
        const move = parkAtPoint(you, supX, supY);
        const kick = distToBall <= 28 && (ball.x - you.x) > 3;
        return {
          x: clamp(sanitizeNum(move.x, 0), -1, 1),
          y: clamp(sanitizeNum(move.y, 0), -1, 1),
          kick
        };
      }

      // 6. STRIKER / PRIMARY ATTACKER
      if (isStriker || squad.length === 1) {
        // In 1v1: retreat to shot-blocking line only when opponent has immediate threatening breakaway in our half
        if (squad.length === 1 && ball.x < 0 && oppMinArrival.t < myArrival.t - 8 && oppMinArrival.t < 25) {
          const guardX = clamp(ball.x - 140, -370, -120);
          const guardY = clamp((ball.y * (guardX + 420)) / Math.max(1, ball.x + 420), -55, 55);
          const move = parkAtPoint(you, guardX, guardY);
          const distToBall = Math.hypot(you.x - ball.x, you.y - ball.y);
          return {
            x: clamp(sanitizeNum(move.x, 0), -1, 1),
            y: clamp(sanitizeNum(move.y, 0), -1, 1),
            kick: distToBall <= 28 && (ball.x - you.x) > 3
          };
        }

        const interceptStep = Math.min(myArrival.t, ballTraj.length - 1);
        const interceptPos = ballTraj[interceptStep] || ball;

        const shotInfo = selectBestTarget(interceptPos, opponents);
        const target = shotInfo.target;

        const aimDx = target.x - interceptPos.x;
        const aimDy = target.y - interceptPos.y;
        const aimLen = Math.hypot(aimDx, aimDy) || 1;
        const aimNx = aimDx / aimLen;
        const aimNy = aimDy / aimLen;

        const perpNx = -aimNy;
        const perpNy = aimNx;

        const relX = you.x - ball.x;
        const relY = you.y - ball.y;
        const alongAim = relX * aimNx + relY * aimNy;
        const perpAim = relX * perpNx + relY * perpNy;

        let steerTarget;
        // Detour only when ahead of the ball, obstructing the shot line, and in attacking territory
        if (alongAim > 2 && Math.abs(perpAim) < 32 && ball.x > 0) {
          const detourSide = perpAim >= 0 ? 1 : -1;
          steerTarget = {
            x: ball.x + perpNx * detourSide * 42 - aimNx * 20,
            y: ball.y + perpNy * detourSide * 40 - aimNy * 20
          };
        } else {
          steerTarget = {
            x: interceptPos.x - aimNx * 18,
            y: interceptPos.y - aimNy * 18
          };
        }

        const move = guideToPoint(you, steerTarget.x, steerTarget.y, myArrival.t);

        const distToBall = Math.hypot(you.x - ball.x, you.y - ball.y);
        const hitDx = ball.x - you.x;
        const hitDy = ball.y - you.y;
        const hitLen = Math.hypot(hitDx, hitDy) || 1;
        const hitNx = hitDx / hitLen;
        const hitNy = hitDy / hitLen;

        const alignment = hitNx * aimNx + hitNy * aimNy;

        const inRange = distToBall <= 29;
        const wellAligned = alignment > 0.65;
        const safePushForward = (ball.x - you.x) > 2;

        const kick = inRange && wellAligned && safePushForward;

        return {
          x: clamp(sanitizeNum(move.x, 0), -1, 1),
          y: clamp(sanitizeNum(move.y, 0), -1, 1),
          kick
        };
      }

      return { x: 0, y: 0, kick: false };
    } catch (err) {
      return { x: 0, y: 0, kick: false };
    }
  }

  decide.botName = 'Titan';
  decide.decide = decide;
  return decide;
}));
