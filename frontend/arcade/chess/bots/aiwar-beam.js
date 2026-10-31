'use strict';

const MATE = 1000000;
const TIMEOUT = {};
const VAL = [0, 100, 320, 330, 500, 900, 20000];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

function center(f, r) {
  return 7 - Math.abs(f * 2 - 7) - Math.abs(r * 2 - 7);
}

const MG = [];
const EG = [];
for (let t = 0; t <= 6; t++) {
  const mg = new Int16Array(64);
  const eg = new Int16Array(64);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const c = center(f, r);
      let v = 0;
      if (t === 1) v = r * 8 + c * 2;
      else if (t === 2) v = c * 8;
      else if (t === 3) v = c * 5;
      else if (t === 4) v = r * 3 + c;
      else if (t === 5) v = c * 2;
      else if (t === 6) v = r < 2 ? -c * 3 : -r * 10;
      mg[r * 8 + f] = v;
      // endgame
      let e = 0;
      if (t === 1) e = r * 12 + c * 2;
      else if (t === 2) e = c * 6;
      else if (t === 3) e = c * 4;
      else if (t === 4) e = r * 2 + c;
      else if (t === 5) e = c * 2;
      else if (t === 6) e = c * 10 + (r >= 3 && r <= 4 ? 5 : 0);
      eg[r * 8 + f] = e;
    }
  }
  MG.push(mg);
  EG.push(eg);
}

let TT = new Map();

function checkTime(deadline) {
  if (Date.now() >= deadline) throw TIMEOUT;
}

function nonPawnMaterial(game, side) {
  const board = game._board;
  let m = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (!p) continue;
    const owner = p > 0 ? 1 : -1;
    if (owner !== side) continue;
    const t = Math.abs(p);
    if (t === 1 || t === 6) continue;
    m += VAL[t];
  }
  return m;
}

function evaluate(game) {
  const board = game._board;
  const side = game._side;
  let mg = 0, eg = 0, phase = 0;
  let bishopsW = 0, bishopsB = 0;
  const pawnsW = new Array(8).fill(0);
  const pawnsB = new Array(8).fill(0);
  const kingSq = { 1: -1, '-1': -1 };

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (!p) continue;
    const owner = p > 0 ? 1 : -1;
    const t = Math.abs(p);
    const row = sq >> 4;
    const file = sq & 7;
    const rankOwner = owner === 1 ? 7 - row : row;
    const psq = rankOwner * 8 + file;
    const sign = owner;
    mg += sign * (VAL[t] + MG[t][psq]);
    eg += sign * (VAL[t] + EG[t][psq]);
    phase += PHASE_W[t];
    if (t === 3) {
      if (owner === 1) bishopsW++; else bishopsB++;
    }
    if (t === 1) {
      if (owner === 1) pawnsW[file]++; else pawnsB[file]++;
    }
    if (t === 6) kingSq[owner] = sq;
  }

  // bishop pair
  if (bishopsW >= 2) { mg += 30; eg += 30; }
  if (bishopsB >= 2) { mg -= 30; eg -= 30; }

  // doubled pawns
  for (let f = 0; f < 8; f++) {
    if (pawnsW[f] > 1) { mg -= 12 * (pawnsW[f] - 1); eg -= 15 * (pawnsW[f] - 1); }
    if (pawnsB[f] > 1) { mg += 12 * (pawnsB[f] - 1); eg += 15 * (pawnsB[f] - 1); }
  }
  // isolated pawns
  for (let f = 0; f < 8; f++) {
    if (pawnsW[f] > 0) {
      const left = f > 0 ? pawnsW[f - 1] : 0;
      const right = f < 7 ? pawnsW[f + 1] : 0;
      if (left === 0 && right === 0) { mg -= 15; eg -= 20; }
    }
    if (pawnsB[f] > 0) {
      const left = f > 0 ? pawnsB[f - 1] : 0;
      const right = f < 7 ? pawnsB[f + 1] : 0;
      if (left === 0 && right === 0) { mg += 15; eg += 20; }
    }
  }

  // passed pawns
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (p !== 1) continue; // white pawn
    const row = sq >> 4;
    const file = sq & 7;
    let passed = true;
    for (let ff = Math.max(0, file - 1); ff <= Math.min(7, file + 1); ff++) {
      for (let rr = 0; rr < row; rr++) {
        if (board[rr * 16 + ff] === -1) { passed = false; break; }
      }
      if (!passed) break;
    }
    if (passed) {
      const rankFromBottom = 7 - row;
      const bonus = 10 + rankFromBottom * 15;
      mg += bonus;
      eg += bonus * 2;
    }
  }
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (p !== -1) continue; // black pawn
    const row = sq >> 4;
    const file = sq & 7;
    let passed = true;
    for (let ff = Math.max(0, file - 1); ff <= Math.min(7, file + 1); ff++) {
      for (let rr = row + 1; rr < 8; rr++) {
        if (board[rr * 16 + ff] === 1) { passed = false; break; }
      }
      if (!passed) break;
    }
    if (passed) {
      const rankFromTop = row; // black's advancement
      const bonus = 10 + rankFromTop * 15;
      mg -= bonus;
      eg -= bonus * 2;
    }
  }

  // rooks: open/semi-open files, 7th rank
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (Math.abs(p) !== 4) continue;
    const owner = p > 0 ? 1 : -1;
    const file = sq & 7;
    const row = sq >> 4;
    const ownPawns = owner === 1 ? pawnsW[file] : pawnsB[file];
    const oppPawns = owner === 1 ? pawnsB[file] : pawnsW[file];
    let bonus = 0;
    if (ownPawns === 0) {
      bonus += oppPawns === 0 ? 20 : 10;
    }
    // 7th rank
    const seventh = owner === 1 ? 1 : 6; // row index from top for 7th rank? white 7th rank is row1
    if (row === (owner === 1 ? 1 : 6)) bonus += 15;
    if (owner === 1) { mg += bonus; eg += bonus; }
    else { mg -= bonus; eg -= bonus; }
  }

  // king safety
  for (const owner of [1, -1]) {
    const ks = kingSq[owner];
    if (ks < 0) continue;
    const opp = -owner;
    let penalty = 0;
    let shield = 0;
    const step = owner === 1 ? -16 : 16;
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const s = ks + dr * 16 + df;
        if (s & 0x88) continue;
        if (game._attacked(s, opp)) penalty += 12;
      }
    }
    for (let df = -1; df <= 1; df++) {
      for (let i = 1; i <= 2; i++) {
        const s = ks + df + i * step;
        if (s & 0x88) continue;
        if (board[s] === owner * 1) shield++;
      }
    }
    const safety = shield * 8 - penalty;
    if (owner === 1) { mg += safety; eg += safety / 2; }
    else { mg -= safety; eg -= safety / 2; }
  }

  // mobility
  const savedSide = game._side;
  game._side = 1;
  const movesW = game._pseudo().length;
  game._side = -1;
  const movesB = game._pseudo().length;
  game._side = savedSide;
  const mobility = (movesW - movesB) * 2;
  mg += mobility;
  eg += mobility;

  const totalPhase = Math.min(24, phase);
  const ph = totalPhase / 24;
  let score = mg * ph + eg * (1 - ph);

  // convert to side to move
  return side === 1 ? score : -score;
}

function isCapture(m, game) {
  return !!m.ep || !!game._board[m.t] || !!m.p;
}

function orderMoves(game, preferredUci, deadline) {
  const moves = game._legal();
  const board = game._board;
  const arr = moves.map(m => {
    const uci = game._uci(m);
    let score = 0;
    if (preferredUci && uci === preferredUci) score += 1000000;
    const victim = m.ep ? 1 : (board[m.t] ? Math.abs(board[m.t]) : 0);
    const attacker = Math.abs(board[m.f]);
    if (victim) score += victim * 100 - attacker + 10000;
    if (m.p) score += 9000 + VAL[m.p];
    // center bonus for to-square
    const toFile = m.t & 7;
    const toRank = m.t >> 4;
    const centerBonus = 7 - Math.abs(toFile * 2 - 7) - Math.abs(toRank * 2 - 7);
    score += centerBonus * 2;
    return { m, uci, score };
  });
  arr.sort((a, b) => b.score - a.score);
  return arr;
}

function quiesce(game, alpha, beta, ply, inCheck, deadline, qdepth) {
  checkTime(deadline);
  const moves = game._legal();
  if (!moves.length) {
    return game.inCheck() ? -MATE + ply : 0;
  }
  // draws
  if ((game._repetitions.get(game._key()) || 0) >= 3) return 0;
  if (game._halfmove >= 100) return 0;
  if (game._ply >= game.maxPlies) return 0;
  if (game._insufficient()) return 0;

  if (!inCheck) {
    const standPat = evaluate(game);
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
  }
  if (qdepth > 8) return alpha;

  const candidates = inCheck ? moves : moves.filter(m => isCapture(m, game));
  const ordered = candidates.map(m => {
    const victim = m.ep ? 1 : (game._board[m.t] ? Math.abs(game._board[m.t]) : 0);
    const attacker = Math.abs(game._board[m.f]);
    let s = victim ? victim * 100 - attacker : 0;
    if (m.p) s += 9000;
    return { m, s };
  }).sort((a, b) => b.s - a.s);

  for (const { m } of ordered) {
    checkTime(deadline);
    const undo = game._make(m);
    const moveKey = game._key();
    game._repetitions.set(moveKey, (game._repetitions.get(moveKey) || 0) + 1);
    game._ply++;
    const childInCheck = game.inCheck();
    const score = -quiesce(game, -beta, -alpha, ply + 1, childInCheck, deadline, qdepth + 1);
    game._unmake(undo);
    game._ply--;
    const c = game._repetitions.get(moveKey) - 1;
    if (c <= 0) game._repetitions.delete(moveKey); else game._repetitions.set(moveKey, c);

    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(game, depth, alpha, beta, ply, inCheck, deadline) {
  checkTime(deadline);
  const key = game._key();
  const entry = TT.get(key);
  if (entry && entry.depth >= depth) {
    if (entry.flag === 0) return entry.score;
    if (entry.flag === 1 && entry.score >= beta) return entry.score;
    if (entry.flag === 2 && entry.score <= alpha) return entry.score;
  }

  const moves = game._legal();
  if (!moves.length) {
    return game.inCheck() ? -MATE + ply : 0;
  }
  if ((game._repetitions.get(key) || 0) >= 3) return 0;
  if (game._halfmove >= 100) return 0;
  if (game._ply >= game.maxPlies) return 0;
  if (game._insufficient()) return 0;

  if (depth <= 0) {
    return quiesce(game, alpha, beta, ply, inCheck, deadline, 0);
  }

  // null move pruning
  if (!inCheck && depth >= 3 && nonPawnMaterial(game, game._side) >= 400) {
    const savedSide = game._side;
    const savedEp = game._ep;
    const savedHalf = game._halfmove;
    const savedPly = game._ply;
    const nullKey = game._key(); // current key before switch? need after
    // switch side
    game._side = -game._side;
    game._ep = -1;
    game._halfmove = game._halfmove + 1;
    game._ply = game._ply + 1;
    const newNullKey = game._key();
    game._repetitions.set(newNullKey, (game._repetitions.get(newNullKey) || 0) + 1);
    let nullScore = -search(game, depth - 3, -beta, -beta + 1, ply + 1, false, deadline);
    game._side = savedSide;
    game._ep = savedEp;
    game._halfmove = savedHalf;
    game._ply = savedPly;
    const c = game._repetitions.get(newNullKey) - 1;
    if (c <= 0) game._repetitions.delete(newNullKey); else game._repetitions.set(newNullKey, c);
    if (nullScore >= beta) return nullScore;
  }

  const preferred = entry ? entry.best : null;
  const ordered = orderMoves(game, preferred, deadline);

  let bestScore = -Infinity;
  let bestUci = ordered.length ? ordered[0].uci : null;
  let alphaOrig = alpha;
  let movesSearched = 0;

  for (const { m, uci } of ordered) {
    checkTime(deadline);
    const isCap = isCapture(m, game) || !!m.p;
    const undo = game._make(m);
    const moveKey = game._key();
    game._repetitions.set(moveKey, (game._repetitions.get(moveKey) || 0) + 1);
    game._ply++;
    const childInCheck = game.inCheck();

    let ext = childInCheck ? 1 : 0;
    let score;
    if (movesSearched === 0) {
      score = -search(game, depth - 1 + ext, -beta, -alpha, ply + 1, childInCheck, deadline);
    } else {
      let reduction = 0;
      if (depth >= 3 && !isCap && !childInCheck && movesSearched > 2) {
        reduction = 1;
        if (depth >= 6 && movesSearched > 4) reduction = 2;
      }
      const lmrDepth = depth - 1 + ext - reduction;
      score = -search(game, lmrDepth, -alpha - 1, -alpha, ply + 1, childInCheck, deadline);
      if (score > alpha && score < beta && reduction > 0) {
        score = -search(game, depth - 1 + ext, -beta, -alpha, ply + 1, childInCheck, deadline);
      }
      if (score > alpha && score < beta) {
        score = -search(game, depth - 1 + ext, -beta, -alpha, ply + 1, childInCheck, deadline);
      }
    }

    game._unmake(undo);
    game._ply--;
    const c = game._repetitions.get(moveKey) - 1;
    if (c <= 0) game._repetitions.delete(moveKey); else game._repetitions.set(moveKey, c);

    movesSearched++;
    if (score > bestScore) {
      bestScore = score;
      bestUci = uci;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  // store TT
  let flag = 0;
  if (bestScore <= alphaOrig) flag = 2; // upper bound
  else if (bestScore >= beta) flag = 1; // lower bound
  else flag = 0;
  // manage TT size
  if (TT.size > 200000) {
    // delete oldest
    const firstKey = TT.keys().next().value;
    TT.delete(firstKey);
  }
  TT.set(key, { depth, score: bestScore, flag, best: bestUci });

  return bestScore;
}

function rootSearch(game, deadline) {
  const legalMoves = game.legalMoves();
  if (legalMoves.length === 1) return legalMoves[0];
  TT = new Map();

  let bestMove = legalMoves[0];
  let bestScore = 0;

  // iterative deepening
  for (let depth = 1; depth <= 64; depth++) {
    try {
      checkTime(deadline);
      let iterationBestMove = bestMove;
      let alpha = -Infinity;
      let beta = Infinity;
      // aspiration window after depth 4
      if (depth >= 4) {
        alpha = bestScore - 50;
        beta = bestScore + 50;
      }
      let failed = false;
      // try moves
      const ordered = orderMoves(game, bestMove, deadline);
      let curBestScore = -Infinity;
      let curBestMove = ordered.length ? ordered[0].uci : legalMoves[0];
      for (const { m, uci } of ordered) {
        checkTime(deadline);
        const undo = game._make(m);
        const moveKey = game._key();
        game._repetitions.set(moveKey, (game._repetitions.get(moveKey) || 0) + 1);
        game._ply++;
        const childInCheck = game.inCheck();
        let score = -search(game, depth - 1, -beta, -alpha, 1, childInCheck, deadline);
        // aspiration re-search
        if ((score <= alpha || score >= beta) && depth >= 4) {
          // full window
          game._unmake(undo);
          game._ply--;
          const c = game._repetitions.get(moveKey) - 1;
          if (c <= 0) game._repetitions.delete(moveKey); else game._repetitions.set(moveKey, c);
          // redo with full window
          const undo2 = game._make(m);
          const mk2 = game._key();
          game._repetitions.set(mk2, (game._repetitions.get(mk2) || 0) + 1);
          game._ply++;
          const cic2 = game.inCheck();
          score = -search(game, depth - 1, -Infinity, Infinity, 1, cic2, deadline);
          game._unmake(undo2);
          game._ply--;
          const c2 = game._repetitions.get(mk2) - 1;
          if (c2 <= 0) game._repetitions.delete(mk2); else game._repetitions.set(mk2, c2);
        } else {
          game._unmake(undo);
          game._ply--;
          const c = game._repetitions.get(moveKey) - 1;
          if (c <= 0) game._repetitions.delete(moveKey); else game._repetitions.set(moveKey, c);
        }
        if (score > curBestScore) {
          curBestScore = score;
          curBestMove = uci;
        }
        if (score > alpha) alpha = score;
        if (score === MATE - 1) {
          // immediate mate
          bestMove = uci;
          bestScore = score;
          throw TIMEOUT; // break out to return? We'll handle
        }
      }
      bestMove = curBestMove;
      bestScore = curBestScore;
      if (Math.abs(bestScore) >= MATE - 100) break;
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
  }

  // ensure root state restored? search restores. 
  return bestMove;
}

function move(state) {
  const root = globalThis.ChessEngine.fromBotState(state);
  const deadline = Date.now() + Math.min(700, Math.max(1, (state.timeLimitMs || 1000) - 200));
  try {
    const best = rootSearch(root, deadline);
    if (best && state.legalMoves.indexOf(best) >= 0) return best;
  } catch (e) {
    // ignore
  }
  return state.legalMoves && state.legalMoves.length ? state.legalMoves[0] : undefined;
}

module.exports = function (state) { return move(state); };
module.exports.move = move;
