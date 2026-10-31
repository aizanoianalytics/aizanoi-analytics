'use strict';

const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
const MATE = 1000000;
const TIMEOUT = Symbol('search timeout');
const TABLES = {};

for (const type of Object.keys(VALUES)) {
  TABLES[type] = Array.from({ length: 64 }, (_, index) => {
    const rank = Math.floor(index / 8);
    const file = index % 8;
    const center = 7 - Math.abs(file * 2 - 7) - Math.abs(rank * 2 - 7);
    if (type === 'P') return rank * 8 + center * 2;
    if (type === 'N') return center * 8;
    if (type === 'B') return center * 5;
    if (type === 'R') return rank * 3 + center;
    if (type === 'Q') return center * 2;
    return rank < 2 ? -center * 3 : -rank * 10;
  });
}

function evaluate(game) {
  let score = 0;
  const board = game.board();
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file];
      if (!piece) continue;
      const rank = piece[0] === 'w' ? 7 - row : row;
      const value = VALUES[piece[1]] + TABLES[piece[1]][rank * 8 + file];
      score += piece[0] === game.turn ? value : -value;
    }
  }
  return score;
}

function at(board, square) {
  return board[8 - Number(square[1])][square.charCodeAt(0) - 97];
}

function ordered(game, preferred) {
  const board = game.board();
  return game.legalMoves().map(uci => {
    const attacker = at(board, uci.slice(0, 2));
    const target = at(board, uci.slice(2, 4));
    const victim = target && target[0] !== attacker[0]
      ? VALUES[target[1]]
      : !target && attacker[1] === 'P' && uci[0] !== uci[2] ? VALUES.P : 0;
    const promotion = uci[4] ? VALUES[uci[4].toUpperCase()] : 0;
    return {
      uci,
      score: (uci === preferred ? MATE : 0) +
        (victim ? victim * 10 - VALUES[attacker[1]] : 0) + promotion,
      tie: Math.random()
    };
  }).sort((a, b) => b.score - a.score || a.tie - b.tie)
    .map(entry => entry.uci);
}

module.exports = function move(state) {
  if (!state.legalMoves.length) return undefined;
  const deadline = Date.now() +
    Math.min(300, Math.max(1, (state.timeLimitMs || 1000) - 100));
  const root = globalThis.ChessEngine.fromBotState(state);
  let best = state.legalMoves[0];

  function checkTime() {
    if (Date.now() >= deadline) throw TIMEOUT;
  }

  function search(game, depth, alpha, beta, ply) {
    checkTime();
    const status = game.status();
    if (status.over) return status.reason === 'checkmate' ? -MATE + ply : 0;
    if (!depth) return evaluate(game);
    let value = -Infinity;
    for (const uci of ordered(game)) {
      checkTime();
      const child = game.clone();
      if (!child.move(uci).ok) continue;
      const score = -search(child, depth - 1, -beta, -alpha, ply + 1);
      value = Math.max(value, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return value;
  }

  try {
    for (let depth = 1; depth <= 64; depth++) {
      let iterationBest = best;
      let alpha = -Infinity;
      for (const uci of ordered(root, best)) {
        checkTime();
        const child = root.clone();
        if (!child.move(uci).ok) continue;
        const score = -search(child, depth - 1, -Infinity, -alpha, 1);
        if (score > alpha) {
          alpha = score;
          iterationBest = uci;
        }
        if (score === MATE - 1) return uci;
      }
      best = iterationBest;
      if (alpha >= MATE - 100 || alpha <= -MATE + 100) break;
    }
  } catch (error) {
    if (error !== TIMEOUT) throw error;
  }
  return best;
};
