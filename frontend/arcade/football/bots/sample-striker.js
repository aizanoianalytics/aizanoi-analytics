(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootballSampleStriker = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value) {
    return Math.max(-1, Math.min(1, value));
  }

  function move(you, x, y, kick) {
    return {
      x: clamp((x - you.x) * 0.12 - you.vx * 0.65),
      y: clamp((y - you.y) * 0.12 - you.vy * 0.65),
      kick: kick
    };
  }

  function distance(player, ball) {
    return Math.hypot(player.x - ball.x, player.y - ball.y);
  }

  return function decide(state) {
    const you = state.you;
    const ball = state.ball;
    const squad = [you].concat(state.teammates);
    squad.sort(function (a, b) {
      const order = distance(a, ball) - distance(b, ball);
      if (order !== 0) return order;
      return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    });
    if (squad[0].id !== you.id) {
      return move(you, Math.max(-330, Math.min(-90, ball.x - 140)), clamp(ball.y / 150) * 100, false);
    }
    const aimX = state.field.enemyGoalX - ball.x;
    const aimY = -ball.y;
    const length = Math.hypot(aimX, aimY) || 1;
    const nx = aimX / length;
    const ny = aimY / length;
    const dx = ball.x - you.x;
    const dy = ball.y - you.y;
    const behind = dx * nx + dy * ny;
    const cross = dx * ny - dy * nx;
    const close = Math.hypot(dx, dy) <= 31 /* hold for repeats */;
    if (behind > 0 && Math.abs(cross) < 18) {
      return move(you, ball.x + nx * 24, ball.y + ny * 24, close);
    }
    // Pass around the ball instead of pushing it towards the own goal.
    const detour = behind < 8 && Math.abs(cross) < 42;
    const side = you.y >= ball.y ? 1 : -1;
    return move(you, ball.x - nx * 36, ball.y - ny * 36 + (detour ? side * 55 : 0), false);
  };
}));
