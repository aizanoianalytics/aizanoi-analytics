'use strict';

function cmpId(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

module.exports = function decide(state) {
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };

  const you = state.you;
  const ball = state.ball;
  const field = state.field;
  const teamPlayers = [you].concat(state.teammates).slice().sort(function (a, b) {
    return cmpId(a.id, b.id);
  });

  const n = teamPlayers.length;
  const keeper = n >= 2 ? teamPlayers[0] : null;
  const isKeeper = keeper && you.id === keeper.id && cmpId(you.id, keeper.id) === 0;

  let primaryAttacker = null;
  if (n === 1) {
    primaryAttacker = you;
  } else {
    const candidates = teamPlayers.slice(1);
    primaryAttacker = candidates.slice().sort(function (a, b) {
      const da = dist(a.x, a.y, ball.x, ball.y);
      const db = dist(b.x, b.y, ball.x, ball.y);
      if (da !== db) return da - db;
      return cmpId(a.id, b.id);
    })[0];
  }
  const isAttacker = primaryAttacker && you.id === primaryAttacker.id && cmpId(you.id, primaryAttacker.id) === 0;

  let tx = you.x;
  let ty = you.y;
  let doKick = false;

  // opponent keeper (closest to enemy goal in observed coords)
  let oppKeeper = null;
  if (state.opponents.length) {
    oppKeeper = state.opponents.slice().sort(function (a, b) {
      if (b.x !== a.x) return b.x - a.x;
      return cmpId(a.id, b.id);
    })[0];
  }

  const kickoffTeam = state.kickoffTeam;
  const myKickoff = kickoffTeam === state.team;

  if (isKeeper) {
    if (state.phase === 'kickoff') {
      if (myKickoff) { tx = -95; ty = 80; }
      else { tx = -330; ty = 0; }
    } else {
      const goalX = field.ownGoalX + 35;
      let arrival = 0;
      if (ball.vx < -0.05) {
        arrival = clamp((goalX - ball.x) / ball.vx, 0, 90);
      }
      const predictedY = clamp(ball.y + ball.vy * Math.max(0, arrival), -48, 48);
      if (ball.x > -150) { tx = -330; ty = 0; }
      else { tx = goalX; ty = predictedY; }
      // clear if ball has passed keeper
      if (ball.x > you.x && dist(you.x, you.y, ball.x, ball.y) <= field.kickRange + 2) {
        doKick = true;
      }
      if (ball.x < -290 && ball.x > you.x && dist(you.x, you.y, ball.x, ball.y) < 85) {
        tx = ball.x + 10;
        ty = ball.y;
        doKick = dist(you.x, you.y, ball.x, ball.y) <= field.kickRange + 2;
      }
    }
  } else if (isAttacker) {
    if (n === 1 && state.opponents.length) {
      const oppD = Math.min.apply(null, state.opponents.map(function (o) { return dist(o.x, o.y, ball.x, ball.y); }));
      const myD = dist(you.x, you.y, ball.x, ball.y);
      if (ball.x < 50 && oppD + 5 < myD) {
        tx = -360;
        ty = clamp(ball.y, -60, 60);
        if (ball.x > you.x && dist(you.x, you.y, ball.x, ball.y) <= field.kickRange + 2) doKick = true;
      } else {
        // rush during kickoff if my team
        if (state.phase === 'kickoff' && !myKickoff) {
          tx = -95;
          ty = 0;
        } else {
          const aimY = 0;
          const ax = field.enemyGoalX - ball.x;
          const ay = aimY - ball.y;
          const len = Math.hypot(ax, ay) || 1;
          const nx = ax / len;
          const ny = ay / len;
          const dx = ball.x - you.x;
          const dy = ball.y - you.y;
          const behind = dx * nx + dy * ny;
          const cross = dx * ny - dy * nx;
          const d = Math.hypot(dx, dy);
          if (behind > 0 && Math.abs(cross) < 20) {
            tx = ball.x - nx * 18;
            ty = ball.y - ny * 18;
            doKick = d <= field.kickRange + 2 && (Math.abs(ball.vx) < 2.5 || ball.x > 300);
          } else {
            const detour = behind < 10 && Math.abs(cross) < 45;
            const side = you.y >= ball.y ? 1 : -1;
            tx = ball.x - nx * 36;
            ty = ball.y - ny * 36 + (detour ? side * 55 : 0);
            doKick = false;
          }
        }
        if (myKickoff && state.phase === 'kickoff') {
          tx = ball.x;
          ty = ball.y;
          doKick = dist(you.x, you.y, ball.x, ball.y) <= field.kickRange + 2;
        }
      }
    } else {
      // rush during kickoff if my team
      if (state.phase === 'kickoff' && !myKickoff) {
        tx = -95;
        ty = 0;
      } else {
        const aimY = 0;
        const ax = field.enemyGoalX - ball.x;
        const ay = aimY - ball.y;
        const len = Math.hypot(ax, ay) || 1;
        const nx = ax / len;
        const ny = ay / len;
        const dx = ball.x - you.x;
        const dy = ball.y - you.y;
        const behind = dx * nx + dy * ny;
        const cross = dx * ny - dy * nx;
        const d = Math.hypot(dx, dy);
        if (behind > 0 && Math.abs(cross) < 20) {
          tx = ball.x - nx * 18;
          ty = ball.y - ny * 18;
          doKick = d <= field.kickRange + 2 && (Math.abs(ball.vx) < 2.5 || ball.x > 300);
        } else {
          const detour = behind < 10 && Math.abs(cross) < 45;
          const side = you.y >= ball.y ? 1 : -1;
          tx = ball.x - nx * 36;
          ty = ball.y - ny * 36 + (detour ? side * 55 : 0);
          doKick = false;
        }
      }
      if (myKickoff && state.phase === 'kickoff') {
        tx = ball.x;
        ty = ball.y;
        doKick = dist(you.x, you.y, ball.x, ball.y) <= field.kickRange + 2;
      }
    }
  } else {
    // support / midfielder
    if (state.phase === 'kickoff' && !myKickoff) {
      tx = -95;
      ty = 0;
    } else {
      if (ball.x < 0) {
        tx = -180;
        ty = clamp(ball.y, -120, 120);
      } else {
        tx = clamp(ball.x - 140, -250, 50);
        ty = clamp(ball.y * 0.4, -100, 100);
      }
    }
  }

  // kickoff rush for attacker/keeper on kickoff team
  if (myKickoff && state.phase === 'kickoff' && isAttacker) {
    const dx = ball.x - you.x;
    const dy = ball.y - you.y;
    const d = Math.hypot(dx, dy);
    tx = ball.x;
    ty = ball.y;
    doKick = d <= field.kickRange + 2 && (Math.abs(ball.vx) < 2.5 || ball.x > 300);
  }

  // clamp targets to field-ish
  tx = clamp(tx, -400, 400);
  ty = clamp(ty, -180, 180);

  // kickoff restriction for non-kickoff: keep own half
  if (!myKickoff && state.phase === 'kickoff') {
    if (tx > -15) tx = -15;
  }

  const pdx = tx - you.x;
  const pdy = ty - you.y;
  const mx = clamp(pdx * 0.14 - you.vx * 0.6, -1, 1);
  const my = clamp(pdy * 0.14 - you.vy * 0.6, -1, 1);

  // kick toggle exploitation
  let kick = false;
  if (doKick) {
    const phase = Math.floor(state.step / 3) % 2;
    kick = phase === 0;
  }

  if (!Number.isFinite(mx) || !Number.isFinite(my)) {
    return { x: 0, y: 0, kick: false };
  }
  return { x: mx, y: my, kick: kick === true };
};
