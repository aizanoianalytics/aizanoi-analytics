'use strict';

const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
const MATE = 100000;
const TIMEOUT = Symbol('search timeout');

const PSQ = {
  P: [  0,  0,  0,  0,  0,  0,  0,  0,
       50, 50, 50, 50, 50, 50, 50, 50,
       10,  5,  5, -5, -10,  5,  5, 10,
        5,  5,  5,  5,  5,  5,  5,  5,
        0,  0,  0,  0,  0,  0,  0,  0,
       -5, -5, -5, -5, -5, -5, -5, -5,
       -5, -5, -5, -5, -5, -5, -5, -5,
        0,  0,  0,  0,  0,  0,  0,  0 ],
  N: [ -50,-40,-30,-30,-30,-30,-40,-50,
       -40,-20,  0,  0,  0,  0,-20,-40,
       -30,  0, 10, 15, 15, 10,  0,-30,
       -30,  5, 15, 20, 20, 15,  5,-30,
       -30,  5, 15, 20, 20, 15,  5,-30,
       -30,  0, 10, 15, 15, 10,  0,-30,
       -40,-20,  0,  0,  0,  0,-20,-40,
       -50,-40,-30,-30,-30,-30,-40,-50 ],
  B: [ -20,-10,-10,-10,-10,-10,-10,-20,
       -10,  0,  0,  0,  0,  0,  0,-10,
       -10,  0, 10, 12, 12, 10,  0,-10,
       -10,  5, 12, 15, 15, 12,  5,-10,
       -10,  5, 12, 15, 15, 12,  5,-10,
       -10,  0, 10, 12, 12, 10,  0,-10,
       -10,  5, 12, 15, 15, 12,  5,-10,
       -20,-10,-10,-10,-10,-10,-10,-20 ],
  R: [   0,  0,  0,  5,  5,  0,  0,  0,
       -5,  0,  0,  0,  0,  0,  0, -5,
       -5,  0,  0,  0,  0,  0,  0, -5,
       -5,  0,  0,  0,  0,  0,  0, -5,
        5, 10, 10, 10, 10, 10,  10,  5,
        0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  5,  5,  0,  0,  0,
       10, 10, 10, 10, 10, 10, 10, 10 ],
  Q: [ -20,-10,-10, -5, -5,-10,-10,-20,
       -10,  0,  0,  0,  0,  0,  0,-10,
       -10,  0,  5,  5,  5,  5,  0,-10,
        -5,  0,  5,  5,  5,  5,  0, -5,
         0,  0,  5,  5,  5,  5,  0,  0,
        -5,  0,  5,  5,  5,  5,  0, -5,
       -10,  5,  5,  5,  5,  5,  0,-10,
       -20,-10,-10, -5, -5,-10,-10,-20 ],
  K: [ -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30,
       -20,-30,-30,-40,-40,-30,-30,-20,
       -10,-20,-20,-20,-20,-20,-20,-10,
        0,  0,  0,  0,  0,  0,  0,  0,
        5, 10, 10, 10, 10, 10, 10,  5 ]
};

function psqScore(piece, row, file) {
  const type = piece[1].toUpperCase();
  if (piece[0] === 'w') {
    return PSQ[type][row * 8 + file];
  } else {
    return PSQ[type][(7 - row) * 8 + (7 - file)];
  }
}

function evaluate(game) {
  const board = game.board();
  let score = 0;
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file];
      if (!piece) continue;
      const isWhite = piece[0] === 'w';
      const val = VALUES[piece[1]] + psqScore(piece, row, file);
      if (isWhite) score += val; else score -= val;
    }
  }
  return score;
}

function uciToRowFile(uci) {
  const fromFile = uci.charCodeAt(0) - 97;
  const fromRank = 8 - (uci.charCodeAt(1) - 48);
  const toFile = uci.charCodeAt(2) - 97;
  const toRank = 8 - (uci.charCodeAt(3) - 48);
  return { fromRow: fromRank, fromFile, toRow: toRank, toFile };
}

function isCaptureMove(uci, game) {
  const { toRow, toFile } = uciToRowFile(uci);
  const r = toRow;
  const f = toFile;
  if (r < 0 || r > 7 || f < 0 || f > 7) return false;
  const piece = game.board()[r][f];
  return piece && piece[0] !== 'w' && piece[0] !== 'b';
}

function isCheckMove(uci, game) {
  const child = game.clone();
  const result = child.move(uci);
  return result.ok && result.check;
}

function orderMoves(moves, game) {
  return moves.sort((a, b) => {
    const { fromRow: ra, fromFile: fa } = uciToRowFile(a);
    const { fromRow: rb, fromFile: fb } = uciToRowFile(b);

    // Captures first, sorted by victim value
    const capA = isCaptureMove(a, game);
    const capB = isCaptureMove(b, game);
    if (capA && !capB) return -1;
    if (!capA && capB) return 1;
    if (capA && capB) {
      const pieceA = game.board()[ra][fa];
      const pieceB = game.board()[rb][fb];
      const valA = pieceA ? VALUES[pieceA[1].toUpperCase()] : 0;
      const valB = pieceB ? VALUES[pieceB[1].toUpperCase()] : 0;
      return valB - valA;
    }

    // Checks next
    const checkA = isCheckMove(a, game);
    const checkB = isCheckMove(b, game);
    if (checkA && !checkB) return -1;
    if (!checkA && checkB) return 1;
    if (checkA && checkB) {
      const pieceA = game.board()[ra][fa];
      const pieceB = game.board()[rb][fb];
      const psqA = pieceA ? psqScore(pieceA, ra, fa) : 0;
      const psqB = pieceB ? psqScore(pieceB, rb, fb) : 0;
      return psqB - psqA;
    }

    // Quiet moves by PSQ
    const pieceA = game.board()[ra][fa];
    const pieceB = game.board()[rb][fb];
    const psqA = pieceA ? psqScore(pieceA, ra, fa) : 0;
    const psqB = pieceB ? psqScore(pieceB, rb, fb) : 0;
    return psqB - psqA;
  });
}

function search(game, depth, alpha, beta, ply) {
  if (depth === 0) return evaluate(game);

  const status = game.status();
  if (status.over) {
    return status.reason === 'checkmate' ? (game.turn === 'w' ? -MATE + ply : MATE - ply) : 0;
  }

  let legal = game.legalMoves();
  if (!legal.length) {
    return status.inCheck ? (game.turn === 'w' ? -MATE + ply : MATE - ply) : 0;
  }

  const ordered = orderMoves(legal, game);

  for (const move of ordered) {
    const child = game.clone();
    const result = child.move(move);
    if (!result.ok) continue;

    const score = -search(child, depth - 1, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

module.exports = function move(state) {
  const deadline = Date.now() + 900;
  const root = globalThis.ChessEngine.fromBotState(state);

  let bestMove = state.legalMoves[0];

  let alpha = -Infinity;
  let beta = Infinity;

  for (let depth = 1; depth <= 6; depth++) {
    if (Date.now() >= deadline) break;

    try {
      let iterationBest = bestMove;
      let newAlpha = -Infinity;

      const ordered = orderMoves(state.legalMoves, globalThis.ChessEngine.fromBotState(state));

      for (const uci of ordered) {
        if (Date.now() >= deadline) break;
        const child = root.clone();
        if (!child.move(uci).ok) continue;

        const score = -search(child, depth - 1, -beta, -alpha, 1);
        if (score > newAlpha) {
          newAlpha = score;
          iterationBest = uci;
        }
        if (score >= beta) break;
      }

      bestMove = iterationBest;
      alpha = newAlpha;

      if (alpha >= MATE - 100 || alpha <= -MATE + 100) break;
    } catch (e) {
      break;
    }
  }

  return bestMove || state.legalMoves[0];
};
