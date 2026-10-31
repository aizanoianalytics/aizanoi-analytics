(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FootballSampleChaser = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return function decide(state) {
    const dx = state.ball.x - state.you.x;
    const dy = state.ball.y - state.you.y;
    const distance = Math.hypot(dx, dy);
    return {
      x: distance > 0 ? dx / distance : 0,
      y: distance > 0 ? dy / distance : 0,
      kick: distance <= state.field.kickRange + 3
    };
  };
}));
