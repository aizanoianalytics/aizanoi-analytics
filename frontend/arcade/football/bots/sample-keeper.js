(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootballSampleKeeper = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, limit) {
    return Math.max(-limit, Math.min(limit, value));
  }

  function move(you, x, y, kick) {
    return {
      x: clamp((x - you.x) * 0.12 - you.vx * 0.65, 1),
      y: clamp((y - you.y) * 0.12 - you.vy * 0.65, 1),
      kick: kick
    };
  }

  function compareIds(a, b) {
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    const first = String(a.id);
    const second = String(b.id);
    return first < second ? -1 : (first > second ? 1 : 0);
  }

  function distance(player, ball) {
    return Math.hypot(player.x - ball.x, player.y - ball.y);
  }

  function striker(state) {
    const you = state.you;
    const ball = state.ball;
    const attackers = [you].concat(state.teammates).sort(compareIds).slice(1);
    attackers.sort(function (a, b) {
      return distance(a, ball) - distance(b, ball) || compareIds(a, b);
    });
    if (attackers[0].id !== you.id) {
      return move(you, Math.max(-330, Math.min(-90, ball.x - 140)), clamp(ball.y, 100), false);
    }
    const length = Math.hypot(420 - ball.x, -ball.y) || 1;
    const nx = (420 - ball.x) / length;
    const ny = -ball.y / length;
    const dx = ball.x - you.x;
    const dy = ball.y - you.y;
    const behind = dx * nx + dy * ny;
    const cross = dx * ny - dy * nx;
    if (behind > 0 && Math.abs(cross) < 12) {
      return move(you, ball.x + nx * 12, ball.y + ny * 12, distance(you, ball) <= 31);
    }
    const detour = behind < 8 && Math.abs(cross) < 42;
    const side = you.y >= ball.y ? 1 : -1;
    return move(you, ball.x - nx * 36, ball.y - ny * 36 + (detour ? side * 55 : 0), false);
  }

  return function decide(state) {
    const squad = [state.you].concat(state.teammates).sort(compareIds);
    if (squad[0].id !== state.you.id) return striker(state);
    const you = state.you;
    const ball = state.ball;
    const goalX = state.field.ownGoalX + 35;
    const arrival = ball.vx < -0.05 ? clamp((goalX - ball.x) / ball.vx, 90) : 0;
    const predictedY = clamp(ball.y + ball.vy * Math.max(0, arrival), 48);
    if (ball.x < -290 && ball.x > you.x && distance(you, ball) < 85) {
      return move(you, ball.x + 10, ball.y, distance(you, ball) <= state.field.kickRange + 2);
    }
    return move(you, goalX, predictedY, false);
  };
}));
