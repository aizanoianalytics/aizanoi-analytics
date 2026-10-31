'use strict';

// Bot name: claude-haiku-5.5
// Strategy: iterative-deepening negamax with alpha-beta, quiescence search on
// captures/promotions, MVV-LVA + killer + history move ordering, and a
// material + piece-square evaluation (king table switches to endgame style).
// Legality and draw/mate rules come from the engine's own move generator.

const BOT_NAME = 'claude-haiku-5.5';
const MATE = 100000;
const INF = 1000000;
const SEARCH_MS = 550;
const MAX_DEPTH = 64;
const VALUE = [0, 100, 320, 330, 500, 900, 0];
const BISHOP_PAIR = 30;

// Piece-square tables written top-down (index 0 = a8), from the owner's view.
const PST = {
  1: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ],
  2: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ],
  3: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ],
  4: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0
  ],
  5: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20
  ],
  6: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20
  ]
};
const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50
];

// Evaluation from the perspective of the side to move (positive = good).
function evaluate(game) {
  const board = game._board;
  let score = 0;
  let minorsAndMajors = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const sq = row * 16 + file;
      const piece = board[sq];
      if (!piece) continue;
      const type = piece > 0 ? piece : -piece;
      const color = piece > 0 ? 1 : -1;
      if (type >= 2 && type <= 5) minorsAndMajors++;
      if (type === 3) {
        if (color === 1) whiteBishops++; else blackBishops++;
      }
      // Index into the top-down table from the owner's point of view.
      const idx = color === 1 ? (7 - row) * 8 + file : row * 8 + file;
      const pst = type === 6 && minorsAndMajors <= 3 ? KING_END[idx] : PST[type][idx];
      score += color * (VALUE[type] + pst);
    }
  }
  if (whiteBishops >= 2) score += BISHOP_PAIR;
  if (blackBishops >= 2) score -= BISHOP_PAIR;
  return game._side === 1 ? score : -score;
}

function isCapture(game, move) {
  return Boolean(game._board[move.t]) || Boolean(move.ep);
}

function moveValue(game, move) {
  const board = game._board;
  const attacker = Math.abs(board[move.f]);
  const victim = board[move.t] ? Math.abs(board[move.t]) : (move.ep ? 1 : 0);
  return victim * 10 - attacker + (move.p ? VALUE[move.p] / 10 : 0);
}

function makeContext(deadline) {
  return {
    deadline,
    nodes: 0,
    killers: [],
    history: new Int32Array(128 * 128),
    stopped: false
  };
}

const STOP = { stop: true };

function checkTime(ctx) {
  if ((++ctx.nodes & 15) === 0 && Date.now() >= ctx.deadline) throw STOP;
}

function orderMoves(game, moves, ctx, ply, first) {
  const killers = ctx.killers[ply] || [];
  const scored = moves.map(move => {
    let s;
    if (first && move.f === first.f && move.t === first.t && move.p === first.p) {
      s = 1e9;
    } else if (isCapture(game, move) || move.p) {
      s = 1e6 + moveValue(game, move) * 100;
    } else if (killers[0] && sameMove(killers[0], move)) {
      s = 9e5;
    } else if (killers[1] && sameMove(killers[1], move)) {
      s = 8e5;
    } else {
      s = ctx.history[move.f * 128 + move.t];
    }
    return { move, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map(entry => entry.move);
}

function sameMove(a, b) {
  return a.f === b.f && a.t === b.t && (a.p || 0) === (b.p || 0);
}

function quiesce(game, alpha, beta, ply, ctx) {
  checkTime(ctx);
  const inCheck = game.inCheck();
  const all = game._legal();
  if (!all.length) return inCheck ? -MATE + ply : 0;
  if (game._halfmove >= 100) return 0;
  let best;
  if (!inCheck) {
    best = evaluate(game);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
  } else {
    best = -INF;
  }
  if (ply > 64) return best === -INF ? evaluate(game) : best;
  const moves = inCheck ? all : all.filter(m => m.p || isCapture(game, m));
  moves.sort((a, b) => moveValue(game, b) - moveValue(game, a));
  for (const move of moves) {
    const undo = game._make(move);
    let score;
    try {
      score = -quiesce(game, -beta, -alpha, ply + 1, ctx);
    } finally {
      game._unmake(undo);
    }
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(game, depth, alpha, beta, ply, ctx) {
  checkTime(ctx);
  if (ply > 0 && game._halfmove >= 100) return 0;
  const inCheck = game.inCheck();
  if (inCheck && ply < 60) depth++;
  if (depth <= 0) return quiesce(game, alpha, beta, ply, ctx);
  const moves = orderMoves(game, game._legal(), ctx, ply, null);
  if (!moves.length) return inCheck ? -MATE + ply : 0;
  let best = -INF;
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const quietMove = !isCapture(game, move) && !move.p;
    const undo = game._make(move);
    let score;
    try {
      score = -negamax(game, depth - 1, -beta, -alpha, ply + 1, ctx);
    } finally {
      game._unmake(undo);
    }
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (quietMove) {
        const k = ctx.killers[ply] || (ctx.killers[ply] = []);
        if (!k[0] || !sameMove(k[0], move)) {
          k[1] = k[0];
          k[0] = { f: move.f, t: move.t, p: move.p };
        }
        ctx.history[move.f * 128 + move.t] += depth * depth;
      }
      break;
    }
  }
  return best;
}

function searchRoot(root, moves, depth, ctx, previous) {
  const ordered = orderMoves(root, moves, ctx, 0, previous);
  let alpha = -INF;
  let bestMove = null;
  let bestScore = -INF;
  for (const move of ordered) {
    const undo = root._make(move);
    let score;
    try {
      score = -negamax(root, depth - 1, -INF, -alpha, 1, ctx);
    } finally {
      root._unmake(undo);
    }
    if (bestMove === null || score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }
  return { move: bestMove, score: bestScore };
}

function chooseMove(state) {
  const legal = state.legalMoves;
  if (!legal || !legal.length) return undefined;
  if (legal.length === 1) return legal[0];
  const start = Date.now();
  const root = globalThis.ChessEngine.fromBotState(state);
  const rootMoves = root._legal();
  if (!rootMoves.length) return legal[0];
  const ctx = makeContext(start + SEARCH_MS);
  let best = null;
  let previous = null;
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    try {
      const result = searchRoot(root, rootMoves, depth, ctx, previous);
      if (result.move) {
        best = result.move;
        previous = best;
      }
      if (result.score >= MATE - 100) break;
    } catch (error) {
      if (error === STOP) break;
      throw error;
    }
  }
  if (!best) return legal[0];
  const uci = root._uci(best);
  return legal.includes(uci) ? uci : legal[0];
}

function move(state) {
  try {
    return chooseMove(state);
  } catch (error) {
    return state && state.legalMoves ? state.legalMoves[0] : undefined;
  }
}

module.exports = move;
module.exports.botName = BOT_NAME;
