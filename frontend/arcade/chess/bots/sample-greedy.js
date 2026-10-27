'use strict';

const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

function material(board, you) {
  let score = 0;
  for (const row of board) {
    for (const piece of row) {
      if (piece) score += VALUES[piece[1]] * (piece[0] === you ? 1 : -1);
    }
  }
  return score;
}

module.exports = function move(state) {
  let best = -Infinity;
  let choices = [];
  for (const uci of state.legalMoves) {
    const game = globalThis.ChessEngine.create({ fen: state.fen, variant: state.variant });
    const result = game.move(uci);
    if (!result.ok) continue;
    const status = game.status();
    const score = result.mate ? 1000000 : status.over ? 0 : material(game.board(), state.you) + (result.check ? 25 : 0);
    if (score > best) {
      best = score;
      choices = [uci];
    } else if (score === best) choices.push(uci);
  }
  return choices.length ? choices[Math.floor(Math.random() * choices.length)] : state.legalMoves[0];
};
