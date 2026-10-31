'use strict';

// botName: SparkTactician
// Strategy: iterative-deepening negamax with alpha-beta + PVS, quiescence,
// MVV-LVA/killer/history ordering, transposition table, tapered PST eval
// (material + piece-square + pawn structure + rook files + king safety),
// mate-distance scoring, immediate-draw avoidance at root, strict time guard.

function move(state) {
  try {
    return searchRoot(state);
  } catch (e) {
    try {
      if (state && Array.isArray(state.legalMoves) && state.legalMoves.length) {
        return state.legalMoves[0];
      }
    } catch (e2) {}
    return undefined;
  }
}
move.botName = 'SparkTactician';
move.move = move;
move.bot_name = 'SparkTactician';
module.exports = move;

// ---------------- evaluation ----------------
var VAL = [0, 100, 320, 330, 500, 900, 0];

// Tables listed rank 8 first (a8..h8, ..., a1..h1).
var PST_P = [
  0,  0,  0,  0,  0,  0,  0,  0,
 50, 50, 50, 50, 50, 50, 50, 50,
 10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];
var PST_N = [
-50,-40,-30,-30,-30,-30,-40,-50,
-40,-20,  0,  0,  0,  0,-20,-40,
-30,  0, 10, 15, 15, 10,  0,-30,
-30,  5, 15, 20, 20, 15,  5,-30,
-30,  0, 15, 20, 20, 15,  0,-30,
-30,  5, 10, 15, 15, 10,  5,-30,
-40,-20,  0,  5,  5,  0,-20,-40,
-50,-40,-30,-30,-30,-30,-40,-50
];
var PST_B = [
-20,-10,-10,-10,-10,-10,-10,-20,
-10,  0,  0,  0,  0,  0,  0,-10,
-10,  0,  5, 10, 10,  5,  0,-10,
-10,  5,  5, 10, 10,  5,  5,-10,
-10,  0, 10, 10, 10, 10,  0,-10,
-10, 10, 10, 10, 10, 10, 10,-10,
-10,  5,  0,  0,  0,  0,  5,-10,
-20,-10,-10,-10,-10,-10,-10,-20
];
var PST_R = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
 -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0
];
var PST_Q = [
-20,-10,-10, -5, -5,-10,-10,-20,
-10,  0,  0,  0,  0,  0,  0,-10,
-10,  0,  5,  5,  5,  5,  0,-10,
 -5,  0,  5,  5,  5,  5,  0, -5,
  0,  0,  5,  5,  5,  5,  0, -5,
-10,  5,  5,  5,  5,  5,  0,-10,
-10,  0,  5,  0,  0,  0,  0,-10,
-20,-10,-10, -5, -5,-10,-10,-20
];
var PST_KMG = [
-30,-40,-40,-50,-50,-40,-40,-30,
-30,-40,-40,-50,-50,-40,-40,-30,
-30,-40,-40,-50,-50,-40,-40,-30,
-30,-40,-40,-50,-50,-40,-40,-30,
-20,-30,-30,-40,-40,-30,-30,-20,
-10,-20,-20,-20,-20,-20,-20,-10,
 20, 20,  0,  0,  0,  0, 20, 20,
 20, 30, 10,  0,  0, 10, 30, 20
];
var PST_KEG = [
-50,-40,-30,-20,-20,-30,-40,-50,
-30,-20,-10,  0,  0,-10,-20,-30,
-30,-10, 20, 30, 30, 20,-10,-30,
-30,-10, 30, 40, 40, 30,-10,-30,
-30,-10, 30, 40, 40, 30,-10,-30,
-30,-10, 20, 30, 30, 20,-10,-30,
-30,-30,  0,  0,  0,  0,-30,-30,
-50,-30,-30,-30,-30,-30,-30,-50
];
var PSTS = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, null];
// passed pawn bonus by square rank index (0=rank1). White uses PASS[r].
var PASS = [0, 6, 14, 26, 48, 90, 150, 0];

var MATE = 1000000;
var INF = 3000000;
var TIMEUP = { timeout: true };

// persistent transposition table across moves in this worker
var TT = typeof Map !== 'undefined' ? new Map() : null;
var TT_CAP = 32768;

var nodes = 0;
var deadline = 0;
var maxPlyCap = 400;

function idxWhite(rank, file) { return (7 - rank) * 8 + file; }
function idxBlack(rank, file) { return rank * 8 + file; }

function checkTime() {
  if (((nodes++) & 31) === 0 && Date.now() >= deadline) throw TIMEUP;
}

// Fast static eval, side-to-move perspective, centipawns.
function evaluate(game) {
  var b = game._board;
  var score = 0;
  var total = 0;
  var queens = 0;
  var wb = 0, bb = 0;
  var wk = -1, bk = -1;
  var s, piece, type, white, file, rank, tab;
  for (s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    piece = b[s];
    if (!piece) continue;
    type = piece < 0 ? -piece : piece;
    white = piece > 0;
    file = s & 7;
    rank = s >> 4;
    if (type === 6) {
      if (white) wk = s; else bk = s;
      continue;
    }
    if (type === 5) queens++;
    else if (type !== 1) total += VAL[type];
    else total += 0;
    if (type === 3) { if (white) wb++; else bb++; }
    tab = PSTS[type];
    if (tab) {
      if (white) score += VAL[type] + tab[(7 - rank) * 8 + file];
      else score -= VAL[type] + tab[rank * 8 + file];
    } else {
      if (white) score += VAL[type];
      else score -= VAL[type];
    }
    if (type === 1) {
      // pawn structure + passed, inline board scans (no allocation)
      var dir = white ? 1 : -1;
      var r, f2;
      var doubled = false, isolated = true;
      for (r = 1; r <= 6; r++) {
        if (r !== rank && b[r * 16 + file] === (white ? 1 : -1)) { doubled = true; break; }
      }
      for (f2 = file - 1; f2 <= file + 1; f2 += 2) {
        if (f2 < 0 || f2 > 7) continue;
        for (r = 1; r <= 6; r++) {
          if (b[r * 16 + f2] === (white ? 1 : -1)) { isolated = false; break; }
        }
        if (!isolated) break;
      }
      // passed: no enemy pawn same/adjacent file ahead
      var blocked = false;
      for (f2 = file - 1; f2 <= file + 1; f2++) {
        if (f2 < 0 || f2 > 7) continue;
        if (white) {
          for (r = rank + 1; r <= 6; r++) {
            if (b[r * 16 + f2] === -1) { blocked = true; break; }
          }
        } else {
          for (r = rank - 1; r >= 1; r--) {
            if (b[r * 16 + f2] === 1) { blocked = true; break; }
          }
        }
        if (blocked) break;
      }
      var passed = !blocked;
      var adj = 0;
      if (doubled) adj -= 16;
      if (isolated) adj -= 10;
      if (passed) adj += white ? PASS[rank] : PASS[7 - rank];
      // connected / defended bonus: friendly pawn diagonally behind
      var br = rank - dir;
      if (br >= 0 && br <= 7) {
        if ((file > 0 && b[br * 16 + file - 1] === (white ? 1 : -1)) ||
            (file < 7 && b[br * 16 + file + 1] === (white ? 1 : -1))) adj += 8;
      }
      if (white) score += adj; else score -= adj;
    } else if (type === 4) {
      // rook on open / semi-open file, rook on 7th
      var hasFriend = false, hasAny = false;
      var rr;
      for (rr = 1; rr <= 6; rr++) {
        var p = b[rr * 16 + file];
        if (p === 1 || p === -1) {
          hasAny = true;
          if ((white && p === 1) || (!white && p === -1)) hasFriend = true;
        }
      }
      // also count edge ranks pawns
      if (b[file] === 1 || b[file] === -1 || b[7 * 16 + file] === 1 || b[7 * 16 + file] === -1) {
        hasAny = true;
        var pe = white ? b[file] === 1 || b[7*16+file] === 1 : b[file] === -1 || b[7*16+file] === -1;
        if (pe) hasFriend = true;
      }
      var rb = 0;
      if (!hasAny) rb += 22;
      else if (!hasFriend) rb += 12;
      if (white && rank === 6) rb += 20;
      if (!white && rank === 1) rb += 20;
      if (white) score += rb; else score -= rb;
    } else if (type === 2) {
      // knight: penalize corner/rim slightly extra beyond PST
      if (file === 0 || file === 7 || rank === 0 || rank === 7) {
        if (white) score -= 8; else score += 8;
      }
    }
  }
  if (wb >= 2) score += 32;
  if (bb >= 2) score -= 32;
  var endgame = (queens === 0) || (total <= 2600);
  var ktab = endgame ? PST_KEG : PST_KMG;
  if (wk >= 0) {
    var wf = wk & 7, wr = wk >> 4;
    score += ktab[(7 - wr) * 8 + wf];
  }
  if (bk >= 0) {
    var bf = bk & 7, br2 = bk >> 4;
    score -= ktab[br2 * 8 + bf];
  }
  if (!endgame) {
    // king pawn shelter (encourages castled, intact shelter)
    score += shelterBonus(b, wk, true) - shelterBonus(b, bk, false);
  } else {
    // in endgame, centralize handled by table; add small tempo-independent nothing
  }
  var stm = game._side;
  var out = stm === 1 ? score : -score;
  return out + 8; // tempo
}

function shelterBonus(b, ksq, white) {
  if (ksq < 0) return 0;
  var kf = ksq & 7, kr = ksq >> 4;
  var fr = white ? kr + 1 : kr - 1;
  if (fr < 0 || fr > 7) return -25;
  var shield = 0, open = 0;
  for (var df = -1; df <= 1; df++) {
    var f = kf + df;
    if (f < 0 || f > 7) continue;
    var p = b[fr * 16 + f];
    if (p === (white ? 1 : -1)) shield++;
    else if (!p) {
      // open if no friendly pawn anywhere on that file ahead
      var found = false;
      if (white) { for (var r = kr + 1; r <= 6; r++) if (b[r * 16 + f] === 1) { found = true; break; } }
      else { for (var r2 = kr - 1; r2 >= 1; r2--) if (b[r2 * 16 + f] === -1) { found = true; break; } }
      if (!found) open++;
    }
  }
  return shield * 12 - open * 14 - (shield === 0 ? 20 : 0);
}

function sqName(idx) {
  return String.fromCharCode(97 + (idx & 7)) + ((idx >> 4) + 1);
}
function moveUci(m) {
  var u = sqName(m.f) + sqName(m.t);
  if (m.p) u += m.p === 5 ? 'q' : m.p === 4 ? 'r' : m.p === 3 ? 'b' : 'n';
  return u;
}
function moveKey(m) { return m.f * 128 + m.t; }

function ttKey(game) {
  var b = game._board;
  var s = game._side === 1 ? 'w' : 'b';
  s += game._ep + ',';
  var rights = game._rights;
  for (var i = 0; i < rights.length; i++) s += rights[i].k + ':' + rights[i].r + ';';
  s += '|';
  for (var q = 0; q < 128; q++) {
    if (q & 0x88) { q += 7; continue; }
    s += String.fromCharCode(68 + b[q]);
  }
  return s;
}

function isCapture(game, m) {
  return m.ep ? true : game._board[m.t] !== 0;
}
function victimValue(game, m) {
  if (m.ep) return VAL[1];
  var p = game._board[m.t];
  if (!p) return 0;
  return VAL[p < 0 ? -p : p];
}
function attackerValue(game, m) {
  var p = game._board[m.f];
  return VAL[p < 0 ? -p : p];
}

function scoreMoves(game, moves, hashKey, killers, history, ply) {
  var b = game._board;
  var k1 = killers ? killers[ply << 1] : -1;
  var k2 = killers ? killers[(ply << 1) + 1] : -1;
  var out = new Array(moves.length);
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    var key = m.f * 128 + m.t;
    var sc = 0;
    if (key === hashKey && (m.p || 0) === (hashP || 0)) sc = 2000000;
    else {
      var cap = m.ep ? true : b[m.t] !== 0;
      var promo = m.p || 0;
      if (cap) {
        var vv = m.ep ? VAL[1] : VAL[b[m.t] < 0 ? -b[m.t] : b[m.t]];
        var av = VAL[b[m.f] < 0 ? -b[m.f] : b[m.f]];
        sc = 1000000 + vv * 16 - av + (promo ? VAL[promo] * 16 : 0);
      } else if (promo) {
        sc = 900000 + VAL[promo] * 16;
      } else if (key === k1) sc = 800000;
      else if (key === k2) sc = 790000;
      else {
        if (m.castle) sc = 60000;
        else sc = history ? history[key & 16383] : 0;
      }
    }
    // tiny random tiebreak to vary paired series
    out[i] = { m: m, key: key, s: sc + Math.random() };
  }
  out.sort(function (a, c) { return c.s - a.s; });
  return out;
}
var hashP = 0;

function quiescence(game, alpha, beta, ply, killers, history, premoves, inChk) {
  checkTime();
  if (game._halfmove >= 100) return 0;
  if (game._ply + ply >= maxPlyCap) return 0;
  if (ply >= 64) return evaluate(game);
  var moves = premoves || game._legal();
  var chk = (inChk !== undefined) ? inChk : game.inCheck();
  if (!moves.length) {
    return chk ? -MATE + ply : 0;
  }
  if (!chk) {
    var stand = evaluate(game);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  } else {
    // check evasion: search all moves, no stand pat
  }
  var ordered;
  if (!chk) {
    // captures + promotions only, MVV-LVA ordered, delta pruning
    var caps = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (m.ep || game._board[m.t] !== 0 || m.p) caps.push(m);
    }
    if (!caps.length) return alpha;
    hashP = 0;
    ordered = scoreMoves(game, caps, -1, null, null, 0);
    for (var j = 0; j < ordered.length; j++) {
      var mv = ordered[j].m;
      // delta pruning: stand + gain + margin < alpha skip (not for promotions/checks)
      if (!mv.p) {
        var gain = victimValue(game, mv);
        if (stand + gain + 220 < alpha) continue;
      }
      var undo = game._make(mv);
      var sc;
      try {
        sc = -quiescence(game, -beta, -alpha, ply + 1, killers, history, null, undefined);
      } finally {
        game._unmake(undo);
      }
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  hashP = 0;
  ordered = scoreMoves(game, moves, -1, killers, history, Math.min(ply, 63));
  for (var k = 0; k < ordered.length; k++) {
    var mv2 = ordered[k].m;
    var undo2 = game._make(mv2);
    var sc2;
    try {
      sc2 = -quiescence(game, -beta, -alpha, ply + 1, killers, history, null, undefined);
    } finally {
      game._unmake(undo2);
    }
    if (sc2 >= beta) return beta;
    if (sc2 > alpha) alpha = sc2;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, ply, killers, history) {
  checkTime();
  if (game._halfmove >= 100) return 0;
  if (game._ply + ply >= maxPlyCap) return 0;
  // mate distance pruning
  var mated = -MATE + ply;
  if (mated > alpha) {
    alpha = mated;
    if (alpha >= beta) return alpha;
  }
  var moves = game._legal();
  if (!moves.length) {
    return game.inCheck() ? -MATE + ply : 0;
  }
  var inChk = game.inCheck();
  if (depth <= 0) return quiescence(game, alpha, beta, ply, killers, history, moves, inChk);
  if (inChk) depth++; // check extension

  var alphaOrig = alpha;
  var hashMoveKey = -1, hashMoveP = 0;
  var ttEntry = null, tkey = null;
  if (TT && depth >= 3) {
    tkey = ttKey(game);
    ttEntry = TT.get(tkey);
    if (ttEntry && ttEntry.d >= depth) {
      if (ttEntry.f === 0) return ttEntry.s;
      if (ttEntry.f === 1 && ttEntry.s >= beta) return ttEntry.s;
      if (ttEntry.f === 2 && ttEntry.s <= alpha) return ttEntry.s;
    }
    if (ttEntry) { hashMoveKey = ttEntry.k; hashMoveP = ttEntry.p || 0; }
  }

  // futility: static eval bound for shallow quiet-only pruning
  var useFutility = (depth === 1 && !inChk);
  var futBase = 0;
  if (useFutility) { futBase = evaluate(game); if (futBase + 140 <= alpha) useFutility = true; else useFutility = false; }

  hashP = hashMoveP;
  var ordered = scoreMoves(game, moves, hashMoveKey, killers, history, Math.min(ply, 63));
  var best = -INF;
  var bestKey = -1, bestP = 0;
  var searchedQuiet = 0;
  for (var i = 0; i < ordered.length; i++) {
    var mv = ordered[i].m;
    var cap = mv.ep || game._board[mv.t] !== 0 || mv.p;
    if (useFutility && i > 0 && !cap) continue; // prune late quiets at depth 1
    var undo = game._make(mv);
    var sc;
    var reduce = 0;
    var isQuiet = !cap;
    if (depth >= 3 && i >= 4 && isQuiet && !inChk) {
      reduce = 1 + (depth > 5 && i > 10 ? 1 : 0);
    }
    try {
      if (i === 0) {
        sc = -negamax(game, depth - 1, -beta, -alpha, ply + 1, killers, history);
      } else {
        if (reduce > 0) {
          sc = -negamax(game, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, killers, history);
          if (sc > alpha) sc = -negamax(game, depth - 1, -beta, -alpha, ply + 1, killers, history);
        } else {
          sc = -negamax(game, depth - 1, -alpha - 1, -alpha, ply + 1, killers, history);
          if (sc > alpha && sc < beta) sc = -negamax(game, depth - 1, -beta, -alpha, ply + 1, killers, history);
        }
      }
    } finally {
      game._unmake(undo);
    }
    if (sc > best) {
      best = sc;
      bestKey = ordered[i].key; bestP = mv.p || 0;
      if (sc > alpha) {
        alpha = sc;
        if (alpha >= beta) {
          // killer + history update (quiets only)
          if (isQuiet && ply < 64) {
            var o = ply << 1;
            if (killers[o] !== bestKey) { killers[o + 1] = killers[o]; killers[o] = bestKey; }
            var h = history[bestKey & 16383] + depth * depth;
            if (h > 1000000) h = 1000000;
            history[bestKey & 16383] = h;
          }
          break;
        }
      }
    }
    if (isQuiet) searchedQuiet++;
  }

  if (TT && depth >= 3 && tkey !== null) {
    var flag = best <= alphaOrig ? 2 : (best >= beta ? 1 : 0);
    if (TT.size > TT_CAP) TT.clear();
    TT.set(tkey, { s: best, d: depth, f: flag, k: bestKey, p: bestP });
  }
  return best;
}

function searchRoot(state) {
  var legal = state.legalMoves;
  if (!legal || !legal.length) return undefined;
  if (legal.length === 1) return legal[0];
  var Eng = globalThis.ChessEngine;
  if (!Eng || !Eng.fromBotState) return legal[Math.floor(Math.random() * legal.length)];

  var t0 = Date.now();
  var limit = state.timeLimitMs || 1000;
  var budget = Math.min(550, Math.max(60, limit - 300));
  deadline = t0 + budget;
  nodes = 0;

  var root;
  try {
    root = Eng.fromBotState(state);
  } catch (e) {
    return legal[Math.floor(Math.random() * legal.length)];
  }
  maxPlyCap = root.maxPlies || state.maxPlies || 400;

  var inChkRoot = root.inCheck();
  var internal = root._legal();
  var uciOf = {};
  for (var i = 0; i < internal.length; i++) uciOf[moveUci(internal[i])] = internal[i];

  // immediate-draw / mate-aware root list via one clone per move (cheap)
  var rms = [];
  for (var li = 0; li < legal.length; li++) {
    var u = legal[li];
    var im = uciOf[u];
    if (!im) continue; // should not happen; skip stale
    var sc0 = 0;
    var cap = root._board[im.t] !== 0 || im.ep;
    if (cap) sc0 += (victimValue(root, im)) * 2 - attackerValue(root, im) * 0.1;
    if (im.p) sc0 += 800;
    if (root.inCheck()) sc0 += 50;
    sc0 += Math.random();
    rms.push({ uci: u, m: im, s: sc0 });
  }
  if (!rms.length) return legal[0];
  rms.sort(function (a, b) { return b.s - a.s; });

  // fast path: if reconstruction ate most of the budget, play best shallow move
  var spent = Date.now() - t0;
  var killers = new Array(128);
  for (var k = 0; k < 128; k++) killers[k] = -1;
  var history = new Array(16384);
  for (var h = 0; h < 16384; h++) history[h] = 0;

  // immediate mate in 1 / stalemate-aware pick: test each move quickly
  var best = rms[0].uci;
  var bestScore = -INF;

  // If very low on time, do a 1-ply + quiescence selection only.
  var maxDepth = 64;
    try {
    for (var depth = 1; depth <= maxDepth; depth++) {
      if (Date.now() >= deadline - 25) break;
      var alpha = -INF;
      var iterBest = best;
      var iterBestScore = -INF;
      var scores = [];
      for (var ri = 0; ri < rms.length; ri++) {
        if (Date.now() >= deadline - 5) throw TIMEUP;
        var rm = rms[ri];
        var undo = root._make(rm.m);
        var sc;
        try {
          // adjust for immediate terminal via clone status only once at depth 1
          if (depth === 1) {
            var st = root.status();
            if (st.over) {
              if (st.reason === 'checkmate') sc = MATE - 1;
              else sc = 0;
            } else {
              sc = -negamax(root, 0, -INF, -alpha, 1, killers, history);
            }
          } else {
            if (ri === 0) sc = -negamax(root, depth - 1, -INF, -alpha, 1, killers, history);
            else {
              sc = -negamax(root, depth - 1, -alpha - 1, -alpha, 1, killers, history);
              if (sc > alpha) sc = -negamax(root, depth - 1, -INF, -alpha, 1, killers, history);
            }
          }
        } finally {
          root._unmake(undo);
        }
        rm._tmp = sc;
        scores.push(sc);
        if (sc > alpha) { alpha = sc; iterBest = rm.uci; iterBestScore = sc; }
        if (sc >= MATE - 100) { best = rm.uci; bestScore = sc; break; }
      }
      // commit iteration (dropping a timed-out partial iteration is handled by catch)
      rms.sort(function (a, b) { return b._tmp - a._tmp; });
      best = iterBest;
      bestScore = iterBestScore;
      if (bestScore >= MATE - 100 || bestScore <= -MATE + 100) break;
      // early exit: tiny movecount or forced
      if (rms.length <= 2 && depth >= 6) break;
      // stop if next iteration likely blows budget (simple scaling guard)
      var elapsed = Date.now() - t0;
      if (depth >= 4 && elapsed > budget * 0.55 && depth >= 5) {
        // allow one more only if score is unstable (close top moves)
        if (rms.length > 1 && Math.abs(rms[0]._tmp - rms[1]._tmp) < 15) {
          if (elapsed > budget * 0.8) break;
        } else break;
      }
      if (Date.now() >= deadline - 25) break;
    }
  } catch (e) {
    if (e !== TIMEUP) throw e;
    // keep previous best
  }

  // Draw-avoidance at root: if we are clearly winning, avoid moves that
  // immediately allow threefold/stalemate/fifty when an alternative exists.
  // Skipped when low on time.
  try {
    if (bestScore > 150 && rms.length > 1 && Date.now() < deadline - 40) {
      var alt = null;
      var ukey = {};
      // current best immediate status
      var g1 = root.clone();
      if (g1.move(best).ok) {
        var s1 = g1.status();
        if (s1.over && s1.reason !== 'checkmate') {
          for (var ai = 0; ai < rms.length; ai++) {
            if (rms[ai].uci === best) continue;
            var g2 = root.clone();
            if (!g2.move(rms[ai].uci).ok) continue;
            var s2 = g2.status();
            if (!s2.over) { alt = rms[ai].uci; break; }
          }
          if (alt) return alt;
        } else {
          // avoid giving immediate threefold repetition counts
          var rep = 0;
          try { rep = g1._repetitions.get(g1._key()) || 0; } catch (ee) { rep = 0; }
          if (rep >= 3 || (s1.over && s1.reason === 'threefold')) {
            for (var bi = 0; bi < rms.length; bi++) {
              if (rms[bi].uci === best) continue;
              var g3 = root.clone();
              if (!g3.move(rms[bi].uci).ok) continue;
              if (!g3.status().over) { alt = rms[bi].uci; break; }
            }
            if (alt) return alt;
          }
        }
      }
    }
  } catch (e) { /* ignore draw-avoidance errors */ }

  for (var vi = 0; vi < legal.length; vi++) if (legal[vi] === best) return best;
  return best && uciOf[best] ? best : rms[0].uci;
}
