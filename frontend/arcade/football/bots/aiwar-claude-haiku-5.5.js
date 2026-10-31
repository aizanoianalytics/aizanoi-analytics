'use strict';

const GOAL_X = 420;
const OWN_GOAL_X = -420;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Steer toward a point with a bounded, damped controller. Input is a direction
// (normalized by the engine), so we command the direction of the velocity error.
function steer(you, tx, ty, kick, gain) {
  const k = gain === undefined ? 0.25 : gain;
  const ex = tx - you.x;
  const ey = ty - you.y;
  const d = Math.hypot(ex, ey);
  const vmax = 2.4;
  const want = Math.min(vmax, d * k);
  const vdx = d > 0 ? ex / d * want : 0;
  const vdy = d > 0 ? ey / d * want : 0;
  const ax = vdx - you.vx;
  const ay = vdy - you.vy;
  const al = Math.hypot(ax, ay);
  if (al < 0.05) return { x: 0, y: 0, kick };
  return { x: ax / al, y: ay / al, kick };
}

let lastKick = false;

function decide(state) {
  const out = decideRaw(state);
  // Pulse kicks: a held kick only repeats after the cooldown, so release between decisions.
  if (out.kick && lastKick) out.kick = false;
  lastKick = out.kick;
  return out;
}

function decideRaw(state) {
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
  const you = state.you;
  const ball = state.ball;
  const mates = state.teammates;
  const opps = state.opponents;

  // Role: closest teammate to the ball attacks; others support or defend.
  let closest = true;
  const myD = dist(you.x, you.y, ball.x, ball.y);
  for (const m of mates) {
    const d = dist(m.x, m.y, ball.x, ball.y);
    if (d < myD - 1e-9 || (Math.abs(d - myD) < 1e-9 && String(m.id) < String(you.id))) {
      closest = false;
      break;
    }
  }

  if (closest || mates.length === 0) {
    return attack(state, you, ball, opps);
  }

  // Keeper/support when a teammate is closer to the ball.
  if (ball.x < -120) {
    const gx = OWN_GOAL_X + 40;
    const gy = clamp(ball.y * 0.6, -50, 50);
    return steer(you, gx, gy, false);
  }
  // Support: sit behind the ball on the side away from the opponent nearest the ball.
  const sx = clamp(ball.x - 110, -330, 330);
  const sy = ball.y >= 0 ? clamp(ball.y - 90, -150, 150) : clamp(ball.y + 90, -150, 150);
  return steer(you, sx, sy, false);
}

function attack(state, you, ball, opps) {
  // Aim at the open part of the goal, away from the nearest keeper.
  let ty = 0;
  for (const o of opps) {
    if (o.x > 300) { ty = -Math.sign(o.y || 1) * 35; break; }
  }
  const aimX = GOAL_X + 5 - ball.x;
  const aimY = ty - ball.y;
  const L = Math.hypot(aimX, aimY) || 1;
  const nx = aimX / L;
  const ny = aimY / L;
  const px = -ny; // perpendicular to shot line
  const py = nx;

  const dx = ball.x - you.x;
  const dy = ball.y - you.y;
  const d = Math.hypot(dx, dy) || 1;
  const align = (dx / d) * nx + (dy / d) * ny; // +1: we push straight at goal
  const rx = you.x - ball.x;
  const ry = you.y - ball.y;
  const back = rx * nx + ry * ny; // >0: we are on the goal side of the ball
  const lat = rx * px + ry * py;

  if (d <= 27 && (align > 0.8 || (ball.x > 250 && align > 0.3))) {
    return { x: dx / d, y: dy / d, kick: true };
  }
  // Strike position: 24 units behind the ball on the shot line.
  const sx = ball.x - nx * 24;
  const sy = ball.y - ny * 24;
  if (back < 0 && Math.abs(lat) < 30) {
    // Already lined up behind the ball: close in and keep pushing.
    const hold = d <= 29 && align > 0.2;
    return steer(you, sx, sy, hold, 0.3);
  }
  // Route around the ball to the side we are on, then come in from behind.
  const s = lat >= 0 ? 1 : -1;
  const wx = ball.x + px * s * 50 - nx * 25;
  const wy = ball.y + py * s * 50 - ny * 25;
  if (Math.hypot(wx - you.x, wy - you.y) > 12 || back > 0) {
    return steer(you, wx, wy, false, 0.25);
  }
  return steer(you, sx, sy, false, 0.3);
}

module.exports = decide;
