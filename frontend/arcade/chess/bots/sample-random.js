'use strict';

module.exports = function move(state) {
  return state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];
};
