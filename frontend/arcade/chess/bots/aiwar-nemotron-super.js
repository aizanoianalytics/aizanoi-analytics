'use strict';

const MATE = 1000000;
const INF = 10000000;
const MAX_DEPTH = 64;
const NODE_CHECK = 256;
const DEADLINE_MS = 450;
const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const PVALUE = { q: 900, r: 500, b: 330, n: 320 };
const PASSED = [0, 0, 0, 0, 12, 24, 48, 96];

const TABLES = {};
(function () {
  for (let i = 0; i < 64; i++) {
    const rank = Math.floor(i / 8);
    const file = i % 8;
    const center = 7 - Math.abs(file * 2 - 7) - Math.abs(rank * 2 - 7);
    TABLES.P = TABLES.P || [];
    TABLES.N = TABLES.N || [];
    TABLES.B = TABLES.B || [];
    TABLES.R = TABLES.R || [];
    TABLES.Q = TABLES.Q || [];
    TABLES.K = TABLES.K || [];
    TABLES.P[i] = rank * 8 + center * 2;
    TABLES.N[i] = center * 8;
    TABLES.B[i] = center * 5;
    TABLES.R[i] = rank * 3 + center;
    TABLES.Q[i] = center * 2;
    TABLES.K[i] = (7 - rank) * 10;
  }
})();

function isPassed(board, white, file, row) {
  const enemy = white ? 'b' : 'w';
  const ep = enemy + 'P';
  if (white) {
    for (let r = row - 1; r >= 0; r--) if (board[r][file] === ep) return false;
    for (let r = 0; r <= row; r++) {
      if (file > 0 && board[r][file - 1] === ep) return false;
      if (file < 7 && board[r][file + 1] === ep) return false;
    }
  } else {
    for (let r = row + 1; r < 8; r++) if (board[r][file] === ep) return false;
    for (let r = row; r < 8; r++) {
      if (file > 0 && board[r][file - 1] === ep) return false;
      if (file < 7 && board[r][file + 1] === ep) return false;
    }
  }
  return true;
}

function evaluate(game) {
  const board = game.board();
  const meWhite = game.turn === 'w';
  let score = 16;
  let wB = 0;
  let bB = 0;
  for (let row = 0; row < 8; row++) {
    const prow = board[row];
    for (let file = 0; file < 8; file++) {
      const piece = prow[file];
      if (!piece) continue;
      const white = piece[0] === 'w';
      const type = piece[1];
      const rank = white ? 7 - row : row;
      let v = VALUES[type] + TABLES[type][rank * 8 + file];
      if (type === 'P') {
        if (isPassed(board, white, file, row)) v += PASSED[rank];
      } else if (type === 'R') {
        if (rank >= 6) v += 12;
      } else if (type === 'B') {
        if (white) wB++; else bB++;
      }
      score += white === meWhite ? v : -v;
    }
  }
  if (wB >= 2) score += meWhite ? 40 : -40;
  if (bB >= 2) score += meWhite ? -40 : 40;
  return score;
}

module.exports = function move(state) {
  if (!state || !Array.isArray(state.legalMoves) || state.legalMoves.length === 0) {
    return undefined;
  }
  const engine = globalThis.ChessEngine;
  if (!engine || typeof engine.fromBotState !== 'function') {
    return state.legalMoves[0];
  }
  let best = state.legalMoves[0];
  let nodes = 0;
  const TIMEOUT = {};
  try {
    const root = engine.fromBotState(state);
    const deadline = Date.now() + DEADLINE_MS;
    const killers = new Array(1024);
    const hist = new Int32Array(4096);

    function checkTime() {
      if ((++nodes & NODE_CHECK) === 0 && Date.now() >= deadline) throw TIMEOUT;
    }

    function sqIdxOf(uci) {
      return ((uci.charCodeAt(1) - 49) * 8 + (uci.charCodeAt(0) - 97)) * 64 +
        ((uci.charCodeAt(3) - 49) * 8 + (uci.charCodeAt(2) - 97));
    }

    function orderMoves(game, moves, ttUci, ply) {
      const board = game.board();
      const turn = game.turn;
      const out = new Array(moves.length);
      let n = 0;
      for (const uci of moves) {
        let score = 0;
        if (uci === ttUci) score += 20000000;
        const f = uci.charCodeAt(0) - 97;
        const fr = uci.charCodeAt(1) - 49;
        const t = uci.charCodeAt(2) - 97;
        const tr = uci.charCodeAt(3) - 49;
        const attacker = board[7 - fr][f];
        const target = board[7 - tr][t];
        if (target && target[0] !== turn) {
          score += 1000000 + VALUES[target[1]] * 10 - (attacker ? VALUES[attacker[1]] : 0);
        } else if (!target && attacker && attacker[1] === 'P' && f !== t) {
          score += 1000000 + 900;
        }
        if (uci.length === 5) score += 900000 + PVALUE[uci[4]];
        const k1 = killers[ply * 2];
        const k2 = killers[ply * 2 + 1];
        if (k1 === uci) score += 800000;
        else if (k2 === uci) score += 700000;
        score += hist[sqIdxOf(uci)];
        out[n++] = { uci: uci, score: score };
      }
      out.length = n;
      out.sort(function (a, b) { return b.score - a.score; });
      for (let i = 0; i < n; i++) out[i] = out[i].uci;
      out.length = n;
      return out;
    }

    function quiesce(game, alpha, beta, ply) {
      checkTime();
      if (ply > 128) return evaluate(game);
      const moves = game.legalMoves();
      if (!moves.length) return game.inCheck() ? -MATE + ply : 0;
      let score = evaluate(game);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
      let filtered;
      if (game.inCheck()) filtered = moves;
      else filtered = moves.filter(function (uci) {
        const f = uci.charCodeAt(0) - 97;
        const fr = uci.charCodeAt(1) - 49;
        const t = uci.charCodeAt(2) - 97;
        const tr = uci.charCodeAt(3) - 49;
        const board = game.board();
        const attacker = board[7 - fr][f];
        const target = board[7 - tr][t];
        return Boolean(target || uci.length === 5 || (attacker && attacker[1] === 'P' && f !== t));
      });
      const ordered = orderMoves(game, filtered, null, ply);
      for (const uci of ordered) {
        const child = game.clone();
        if (!child.move(uci).ok) continue;
        const s = -quiesce(child, -beta, -alpha, ply + 1);
        if (s > alpha) {
          alpha = s;
          if (s >= beta) break;
        }
      }
      return alpha;
    }

    function search(game, depth, alpha, beta, ply) {
      checkTime();
      if (ply > 128) return evaluate(game);
      const moves = game.legalMoves();
      if (!moves.length) return game.inCheck() ? -MATE + ply : 0;
      if (depth <= 0 && !game.inCheck()) return quiesce(game, alpha, beta, ply);
      if (depth <= 0) depth = 1;
      const ordered = orderMoves(game, moves, null, ply);
      let best = -INF;
      let moveIndex = 0;
      const inCheck = game.inCheck();
      for (const uci of ordered) {
        checkTime();
        moveIndex++;
        const child = game.clone();
        if (!child.move(uci).ok) continue;
        let s;
        const quiet = uci.length === 4;
        const reduce =
          depth >= 3 && !inCheck && quiet && moveIndex > 4
            ? Math.min(depth - 1, 1 + Math.floor(Math.log(depth)) + Math.floor(Math.log(moveIndex)))
            : 0;
        if (reduce > 0 && !child.inCheck()) {
          s = -search(child, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1);
          if (s > alpha) {
            if (s >= beta) {
              s = -search(child, depth - 1, -INF, INF, ply + 1);
            } else {
              s = -search(child, depth - 1, -beta, -alpha, ply + 1);
            }
          }
        } else {
          s = -search(child, depth - 1, -beta, -alpha, ply + 1);
        }
        if (s > best) best = s;
        if (s > alpha) {
          alpha = s;
          if (alpha >= beta) {
            if (quiet) {
              const board = game.board();
              const fr = uci.charCodeAt(1) - 49;
              const f = uci.charCodeAt(0) - 97;
              if (!board[7 - fr][f]) {
                killers[ply * 2 + 1] = killers[ply * 2];
                killers[ply * 2] = uci;
              }
              hist[sqIdxOf(uci)] += depth * depth;
            }
            break;
          }
        }
      }
      return best;
    }

    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      let iterBest = best;
      let alpha = -INF;
      const moves = root.legalMoves();
      const ordered = orderMoves(root, moves, depth > 1 ? best : null, 0);
      let mateFound = false;
      for (const uci of ordered) {
        checkTime();
        const child = root.clone();
        if (!child.move(uci).ok) continue;
        let s = -search(child, depth - 1, -INF, INF, 1);
        if (s > alpha) { alpha = s; iterBest = uci; }
        if (s >= MATE - 1000) { mateFound = true; break; }
      }
      best = iterBest;
      if (mateFound) break;
      if (Date.now() >= deadline - 25) break;
    }
  } catch (err) {
    if (err !== TIMEOUT) throw err;
  }
  move.nodes = nodes;
  return best;
};
