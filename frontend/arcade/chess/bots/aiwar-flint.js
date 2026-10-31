'use strict';

const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const MATE = 100000;
const ABORT = { aborted: true };
const LETTERS = ['P', 'N', 'B', 'R', 'Q', 'K'];

const PST = {
  P: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ],
  N: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
  ],
  B: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
  ],
  R: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0]
  ],
  Q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20]
  ],
  K: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20]
  ]
};

function boardArray(game) {
  const arr = new Int8Array(128);
  const rows = game.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const label = rows[r][f];
      if (!label) continue;
      const color = label[0] === 'w' ? 1 : -1;
      const type = ' PNBRQK'.indexOf(label[1]);
      arr[(7 - r) * 16 + f] = color * type;
    }
  }
  return arr;
}

function evaluate(game) {
  const board = game.board();
  const us = game.turn === 'w' ? 1 : -1;
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const label = board[r][f];
      if (!label) continue;
      const color = label[0] === 'w' ? 1 : -1;
      const typeNum = ' PNBRQK'.indexOf(label[1]);
      const letter = LETTERS[typeNum - 1];
      const v = VALUES[letter] + PST[letter][r][f];
      score += (color === us ? v : -v);
    }
  }
  return score;
}

function sqIndex(name) {
  return (Number(name[1]) - 1) * 16 + (name.charCodeAt(0) - 97);
}

function moveScore(arr, uci, preferred) {
  const from = sqIndex(uci.slice(0, 2));
  const to = sqIndex(uci.slice(2, 4));
  const piece = arr[from];
  const captured = arr[to];
  let s = 0;
  if (uci.length > 4) s += VALUES[uci[4].toUpperCase()] * 10;
  const victimLetter = LETTERS[Math.abs(captured) - 1];
  const attackerLetter = LETTERS[Math.abs(piece) - 1];
  if (captured) s += 10 * VALUES[victimLetter] - VALUES[attackerLetter];
  if (uci === preferred) s += 100000;
  return s;
}

function isCapture(arr, uci) {
  const from = sqIndex(uci.slice(0, 2));
  const to = sqIndex(uci.slice(2, 4));
  if (arr[to]) return true;
  const piece = arr[from];
  if (Math.abs(piece) === 1 && (from & 7) !== (to & 7)) return true;
  return false;
}

function orderedMoves(game, preferred) {
  const arr = boardArray(game);
  const moves = game.legalMoves();
  const scored = moves.map(uci => ({ uci: uci, s: moveScore(arr, uci, preferred) }));
  scored.sort((a, b) => b.s - a.s);
  const out = new Array(moves.length);
  for (let i = 0; i < scored.length; i++) out[i] = scored[i].uci;
  return out;
}

function negamax(game, depth, alpha, beta, ply, deadline) {
  if (Date.now() > deadline) throw ABORT;
  const status = game.status();
  if (status.over) {
    if (status.reason === 'checkmate') return -MATE + ply;
    return 0;
  }
  if (depth <= 0) return quiesce(game, alpha, beta, ply, deadline, 8);
  const moves = orderedMoves(game, null);
  let best = -Infinity;
  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i];
    const child = game.clone();
    const res = child.move(uci);
    if (!res.ok) continue;
    const score = -negamax(child, depth - 1, -beta, -alpha, ply + 1, deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function quiesce(game, alpha, beta, ply, deadline, qdepth) {
  if (Date.now() > deadline) throw ABORT;
  const status = game.status();
  if (status.over) {
    if (status.reason === 'checkmate') return -MATE + ply;
    return 0;
  }
  const arr = boardArray(game);
  const stand = evaluate(game);
  let best = stand;
  const moves = game.legalMoves().filter(uci => uci.length > 4 || isCapture(arr, uci));
  const scored = moves.map(uci => ({ uci: uci, s: moveScore(arr, uci, null) }));
  scored.sort((a, b) => b.s - a.s);
  for (let i = 0; i < scored.length; i++) {
    if (qdepth <= 0) break;
    const child = game.clone();
    const res = child.move(scored[i].uci);
    if (!res.ok) continue;
    const score = -quiesce(child, -beta, -alpha, ply + 1, deadline, qdepth - 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

module.exports = function move(state) {
  const fallback = (state.legalMoves && state.legalMoves.length)
    ? state.legalMoves[0]
    : 'a1a1';
  const legal = state.legalMoves;
  if (!legal || !legal.length) return fallback;
  const deadline = Date.now() + 700;
  const root = globalThis.ChessEngine.fromBotState(state);
  const rootMoves = root.legalMoves();
  if (!rootMoves.length) return fallback;
  let bestMove = rootMoves[0];
  let prevMove = rootMoves[0];
  for (let depth = 1; depth <= 40; depth++) {
    let iterBest = prevMove;
    let iterBestScore = -Infinity;
    let alpha = -Infinity;
    let aborted = false;
    const ordered = orderedMoves(root, prevMove);
    for (let i = 0; i < ordered.length; i++) {
      const uci = ordered[i];
      const child = root.clone();
      const res = child.move(uci);
      if (!res.ok) continue;
      let score;
      try {
        score = -negamax(child, depth - 1, -Infinity, -alpha, 1, deadline);
      } catch (error) {
        if (error === ABORT) { aborted = true; break; }
        throw error;
      }
      if (score > iterBestScore) { iterBestScore = score; iterBest = uci; }
      if (score > alpha) alpha = score;
      if (Date.now() > deadline) { aborted = true; break; }
    }
    if (aborted) break;
    bestMove = iterBest;
    prevMove = iterBest;
    if (iterBestScore > MATE - 20) break;
  }
  return legal.includes(bestMove) ? bestMove : fallback;
};
Object.defineProperty(module.exports, 'name', { value: 'Phoenix', configurable: true });
