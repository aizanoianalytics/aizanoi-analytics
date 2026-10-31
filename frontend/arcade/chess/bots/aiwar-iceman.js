'use strict';

const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
const MATE = 1000000;
const TIMEOUT = Symbol('search timeout');

// Simple piece-square tables
const PST = {};
for (const type of ['P','N','B','R','Q','K']) {
  PST[type] = Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    const rank = Math.floor(i / 8);
    const file = i % 8;
    const center = 7 - Math.abs(file * 2 - 7) - Math.abs(rank * 2 - 7);
    if (type === 'P') PST[type][i] = rank * 6 + center * 1;
    else if (type === 'N') PST[type][i] = center * 10 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
    else if (type === 'B') PST[type][i] = center * 4 + (rank === file || rank + file === 7 ? 2 : 0);
    else if (type === 'R') PST[type][i] = center * 1 + Math.min(rank, 7 - rank);
    else if (type === 'Q') PST[type][i] = center * 2;
    else if (type === 'K') PST[type][i] = (rank < 2 ? -center * 2 : rank > 5 ? -center * 2 : center * 1);
  }
}

function at(board, square) {
  if (typeof square !== 'string' || square.length < 2) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - Number(square[1]);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return board[rank] ? board[rank][file] : null;
}

function squareIndex(square) {
  if (typeof square !== 'string' || square.length < 2) return -1;
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - Number(square[1]);
  return rank * 8 + file;
}

function evaluate(game) {
  const board = game.board();
  const turn = game.turn;
  let score = 0;
  const pawnCount = { w: 0, b: 0 };
  
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file];
      if (!piece) continue;
      const color = piece[0];
      const type = piece[1];
      const idx = (color === 'w' ? (7 - row) : row) * 8 + (color === 'w' ? file : 7 - file);
      let val = VALUES[type] + (PST[type][color === 'w' ? idx : 63 - idx] || 0);
      if (type === 'P') {
        pawnCount[color]++;
        // Bonus for passed pawns
        let passed = true;
        const dr = color === 'w' ? -1 : 1;
        for (let r = row + dr; r >= 0 && r < 8; r += dr) {
          if (board[r][file] && board[r][file][1] === 'P') { passed = false; break; }
        }
        if (passed) val += (color === 'w' ? (7 - row) : row) * 15;
      }
      score += color === turn ? val : -val;
    }
  }
  
  // Mobility bonus
  try {
    const legal = game.legalMoves();
    const mob = legal.length;
    score += (game.turn === turn) ? mob * 0.5 : -mob * 0.5;
  } catch (e) {}
  
  return score;
}

function ordered(game, preferred, ttMove) {
  const board = game.board();
  const moves = [];
  for (const uci of game.legalMoves()) {
    const attacker = at(board, uci.slice(0, 2));
    const target = at(board, uci.slice(2, 4));
    let score = 0;
    if (uci === preferred) score += MATE;
    if (ttMove && uci === ttMove) score += MATE / 2;
    if (attacker) {
      const victim = target && target[0] !== attacker[0] ? VALUES[target[1]] : 0;
      if (victim) score += victim * 10 - VALUES[attacker[1]] * 0.1;
      else if (!target && attacker[1] === 'P' && uci[0] !== uci[2]) score += VALUES['P'] * 8; // en passant
    }
    if (uci[4]) score += VALUES[uci[4].toUpperCase()] * 5;
    // Castling bonus
    if (uci.length >= 4 && ((uci.slice(0,2) === 'e1' && (uci.slice(2,4) === 'g1' || uci.slice(2,4) === 'c1')) ||
        (uci.slice(0,2) === 'e8' && (uci.slice(2,4) === 'g8' || uci.slice(2,4) === 'c8')))) {
      score += 50;
    }
    moves.push({ uci, score, r: Math.random() });
  }
  moves.sort((a, b) => b.score - a.score || a.r - b.r);
  return moves.map(m => m.uci);
}

module.exports = function move(state) {
  if (!state.legalMoves || !state.legalMoves.length) return state.legalMoves ? state.legalMoves[0] : undefined;
  
  const timeLimit = state.timeLimitMs || 1000;
  const deadline = Date.now() + Math.min(850, Math.max(50, timeLimit - 150));
  
  let ChessEngine;
  try {
    ChessEngine = globalThis.ChessEngine;
  } catch (e) {
    return state.legalMoves[0];
  }
  
  let root;
  try {
    root = ChessEngine.fromBotState(state);
  } catch (e) {
    return state.legalMoves[0];
  }
  
  const tt = new Map();
  let bestMove = state.legalMoves[0];
  
  function ttKey(game) {
    try {
      return game.fen();
    } catch (e) {
      return null;
    }
  }
  
  function checkTime() {
    if (Date.now() >= deadline) throw TIMEOUT;
  }
  
  function quiesce(game, alpha, beta, ply) {
    checkTime();
    const status = game.status();
    if (status.over) {
      if (status.reason === 'checkmate') return -MATE + ply;
      return 0;
    }
    let standPat = evaluate(game);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;
    
    // Only consider captures and checks
    const board = game.board();
    const candidates = [];
    for (const uci of game.legalMoves()) {
      const attacker = at(board, uci.slice(0, 2));
      const target = at(board, uci.slice(2, 4));
      const givesCheck = false;
      if (target && attacker && target[0] !== attacker[0]) {
        candidates.push({ uci, score: VALUES[target[1]] - VALUES[attacker[1]] * 0.01 });
      } else if (uci[4]) {
        candidates.push({ uci, score: VALUES[uci[4].toUpperCase()] * 5 });
      }
    }
    if (candidates.length === 0) return standPat;
    candidates.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < candidates.length && i < 8; i++) {
      checkTime();
      const child = game.clone();
      if (!child.move(candidates[i].uci).ok) continue;
      const score = -quiesce(child, -beta, -alpha, ply + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
  
  function search(game, depth, alpha, beta, ply, isPv) {
    checkTime();
    const status = game.status();
    if (status.over) {
      if (status.reason === 'checkmate') return -MATE + ply;
      if (status.reason === 'stalemate' || status.reason === 'threefold' || 
          status.reason === 'fifty-move' || status.reason === 'insufficient') return 0;
      return 0;
    }
    if (ply > 80) return quiesce(game, alpha, beta, ply);
    
    const key = ttKey(game);
    if (key && depth <= 3) {
      const cached = tt.get(key + ':' + depth);
      if (cached !== undefined) {
        if (cached.flag === 0) return cached.score; // exact
        if (cached.flag === 1 && cached.score >= beta) return cached.score;
        if (cached.flag === 2 && cached.score <= alpha) return cached.score;
      }
    }
    
    if (depth <= 0) {
      return quiesce(game, alpha, beta, ply);
    }
    
    let ttMove = null;
    if (key) {
      const cached = tt.get(key);
      if (cached && cached.best) ttMove = cached.best;
    }
    
    const moves = ordered(game, null, ttMove);
    if (moves.length === 0) {
      if (game.inCheck && game.inCheck()) return -MATE + ply;
      return 0;
    }
    
    let bestScore = -Infinity;
    let localBest = moves[0];
    let origAlpha = alpha;
    
    for (let i = 0; i < moves.length; i++) {
      checkTime();
      const uci = moves[i];
      const child = game.clone();
      const res = child.move(uci);
      if (!res.ok) continue;
      
      let score;
      if (i === 0 || isPv) {
        score = -search(child, depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        score = -search(child, depth - 1, -alpha - 1, -alpha, ply + 1, false);
        if (score > alpha) {
          score = -search(child, depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        localBest = uci;
        if (score > alpha) alpha = score;
      }
      if (alpha >= beta) break;
    }
    
    if (key) {
      const flag = bestScore >= beta ? 1 : (bestScore <= origAlpha ? 2 : 0);
      tt.set(key, { best: localBest, score: bestScore, flag, depth });
      if (depth <= 3) tt.set(key + ':' + depth, { score: bestScore, flag });
    }
    
    return bestScore;
  }
  
  try {
    for (let depth = 1; depth <= 6; depth++) {
      checkTime();
      let alpha = -Infinity;
      let beta = Infinity;
      let iterationBest = bestMove;
      const moves = ordered(root, bestMove, null);
      
      for (let i = 0; i < moves.length; i++) {
        checkTime();
        const uci = moves[i];
        const child = root.clone();
        if (!child.move(uci).ok) continue;
        let score = -search(child, depth - 1, -beta, -alpha, 1, i === 0);
        if (score > alpha) {
          alpha = score;
          iterationBest = uci;
          if (score >= MATE - 50) break;
        }
      }
      bestMove = iterationBest;
      if (alpha >= MATE - 100 || alpha <= -MATE + 100) break;
    }
  } catch (error) {
    if (error !== TIMEOUT) {
      // fall through to bestMove
    }
  }
  
  if (state.legalMoves.includes(bestMove)) {
    return bestMove;
  }
  return state.legalMoves[0];
};
