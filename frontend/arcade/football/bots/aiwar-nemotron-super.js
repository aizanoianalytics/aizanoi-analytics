'use strict';

// AI Football tournament entry: Nemotron Super.
//
// Strategy (all coordinates are observed: every team attacks +x):
//
//   * Roles: the teammate (incl. self) closest to the ball is the attacker;
//     everyone else defends.
//   * Attacker: dribbles by staying in contact just behind the ball (toward
//     the own goal), pushing it forward. It passes to a clearly upfield
//     teammate, or shoots at the side of the enemy goal away from the nearest
//     defender once close (ball.x > 220). In its own third it clears
//     goal-side of the ball so contacts and kicks never send it toward its
//     own net. Kick cadence is gated by step parity (~every 6 steps).
//   * Defenders: in our half the closest defender clears; the other(s) guard
//     the goal mouth at the predicted shot height. In the enemy half they
//     hold a spread midfield block and slide toward balls heading at our
//     goal.

module.exports = function decide(state) {
  const you = state.you;
  const ball = state.ball;
  const f = state.field;
  const EG = f.enemyGoalX;
  const OG = f.ownGoalX;
  const kickRange = f.kickRange;
  const urgentClear = ball.x < -60;
  const canShoot = ball.x > 180;
  const kickWindow = (state.step % 6) < 3;

  if (state.phase === 'goal') {
    return { x: 0, y: 0, kick: false };
  }

  const dx = ball.x - you.x;
  const dy = ball.y - you.y;
  const dist = Math.hypot(dx, dy);

  const mates = state.teammates;
  let best = dist;
  let amClosest = true;
  for (let i = 0; i < mates.length; i++) {
    const m = mates[i];
    const d = Math.hypot(ball.x - m.x, ball.y - m.y);
    if (d < best) { best = d; amClosest = false; }
  }

  function steer(tx, ty) {
    const sx = tx - you.x - you.vx * 0.5;
    const sy = ty - you.y - you.vy * 0.5;
    const d = Math.hypot(sx, sy);
    return d > 0 ? { x: sx / d, y: sy / d } : { x: 0, y: 0 };
  }

  function clamp(v) {
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  // Predicted ball height at my goal line (for covering shots).
  let coverY = ball.y;
  if (ball.vx < -0.1 && ball.x > OG + 40) {
    const t = (ball.x - (OG + 40)) / (-ball.vx);
    if (t > 0 && t < 300) coverY = ball.y + ball.vy * t;
  }
  coverY = Math.max(-58, Math.min(58, coverY));

  // Base upfield direction (goal centre), biased sideways when clearing.
  let gnx = (EG - ball.x);
  let gny = -ball.y;
  if (urgentClear) {
    let nearD = 1e9;
    let nearY = 0;
    for (let i = 0; i < state.opponents.length; i++) {
      const o = state.opponents[i];
      const d = Math.hypot(o.x - ball.x, o.y - ball.y);
      if (d < nearD) { nearD = d; nearY = o.y; }
    }
    gny = nearY >= 0 ? -34 - ball.y : 34 - ball.y;
  }
  const gLen = Math.hypot(gnx, gny) || 1;

  if (amClosest) {
    // Attacker: choose where to play the ball.
    let ax = gnx;
    let ay = gny;
    let isPass = false;
    if (!urgentClear) {
      let bestScore = -1e9;
      for (let i = 0; i < mates.length; i++) {
        const m = mates[i];
        const d = Math.hypot(m.x - ball.x, m.y - ball.y);
        if (d < 26 || d > 200) continue;
        if (m.x <= ball.x + 70) continue;
        const s = (m.x - ball.x) - d * 0.4;
        if (s > bestScore) { bestScore = s; ax = m.x - ball.x; ay = m.y - ball.y; isPass = true; }
      }
    }
    if (!isPass && ball.x > 220) {
      // Shoot at the side of the goal away from the nearest defender.
      let nearD = 260;
      let nearY = 0;
      let hasNear = false;
      for (let i = 0; i < state.opponents.length; i++) {
        const o = state.opponents[i];
        const d = Math.hypot(o.x - EG, o.y);
        if (d < nearD) { nearD = d; nearY = o.y; hasNear = true; }
      }
      if (hasNear) ay = (nearY >= 0 ? -44 : 44) - ball.y;
      ax = EG - ball.x;
    }
    const aLen = Math.hypot(ax, ay) || 1;
    const anx = ax / aLen;
    const any = ay / aLen;

    // Stay goal-side of the ball (between it and my own goal).
    const tx = ball.x - anx * (urgentClear ? 13 : 20);
    const ty = ball.y - any * (urgentClear ? 13 : 20);
    const s = steer(tx, ty);
    const behind = dx * anx + dy * any;
    const cross = dx * any - dy * anx;
    const inRange = dist <= kickRange - 2;
    const kick = inRange && dx > 6 && behind > 6 &&
      kickWindow && (urgentClear || canShoot || isPass) &&
      (urgentClear || Math.abs(cross) < 18);
    return { x: clamp(s.x), y: clamp(s.y), kick: kick };
  }

  // Defender
  let tx, ty, dkick = false;
  const bnx = gnx / gLen;
  const bny = gny / gLen;
  const behind = dx * bnx + dy * bny;
  const cross = dx * bny - dy * bnx;
  const inRange = dist <= kickRange - 2;

  if (ball.x < -90) {
    let amPressure = true;
    let pd = dist;
    for (let i = 0; i < mates.length; i++) {
      const m = mates[i];
      const d = Math.hypot(ball.x - m.x, ball.y - m.y);
      if (d < pd) { pd = d; amPressure = false; }
    }
    if (amPressure) {
      const s = steer(ball.x - bnx * (urgentClear ? 13 : 20), ball.y - bny * (urgentClear ? 13 : 20));
      dkick = inRange && dx > 6 && behind > 6 && (urgentClear || Math.abs(cross) < 18) &&
        (kickWindow || urgentClear);
      return { x: clamp(s.x), y: clamp(s.y), kick: dkick };
    }
    tx = OG + 30;
    ty = coverY;
  } else {
    // Hold a midfield block, spread across the width; slide toward balls
    // heading at our goal so we can intercept early.
    tx = -160;
    let rank = 0;
    for (let i = 0; i < mates.length; i++) {
      if (String(mates[i].id) < String(you.id)) rank += 1;
    }
    ty = -35 + rank * 25;
    if (ball.vx < -1 && ball.x > -300 && Math.abs(ball.y) < 70) {
      tx = Math.max(-250, Math.min(-100, ball.x - 35));
      ty = Math.max(-55, Math.min(55, ball.y));
    }
    if (ty < -55) ty = -55;
    if (ty > 55) ty = 55;
  }
  const s = steer(tx, ty);
  return { x: clamp(s.x), y: clamp(s.y), kick: false };
};
module.exports.botName = 'Nemotron Super';
