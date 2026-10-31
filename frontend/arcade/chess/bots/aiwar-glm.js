'use strict';

/* Self-contained fast chess engine for the AI Chess Arena.
   Own 0x88 board, make/unmake, iterative deepening alpha-beta with TT,
   quiescence, null move, killers/history. Deadline-aware. */

const MATE = 100000;
const INF = 1000000;

// idx = rank*16 + file, rank 0 = rank 1 (white's back rank)
const WP = 1, WN = 2, WB = 3, WR = 4, WQ = 5, WK = 6;
const BP = 7, BN = 8, BB = 9, BR = 10, BQ = 11, BK = 12;
const IS_WHITE = p => p >= 1 && p <= 6;
const TYPE = p => (p <= 6 ? p : p - 6);

// move = from | to<<7 | promo<<14 | flag<<17 ; flag: 0 quiet, 1 capture, 2 ep, 3 castle
const FLAG_EP = 2, FLAG_CASTLE = 3;
const mFrom = m => m & 127;
const mTo = m => (m >> 7) & 127;
const mPromo = m => (m >> 14) & 7;
const mFlag = m => (m >> 17) & 3;

const SQ_NAMES = [];
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) SQ_NAMES[r * 16 + f] = String.fromCharCode(97 + f) + (r + 1);
const NAME_TO_SQ = {};
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) NAME_TO_SQ[SQ_NAMES[r * 16 + f]] = r * 16 + f;
const fileOf = s => s & 15;
const rankOf = s => s >> 4;

const KNIGHT_DELTAS = [31, 33, 14, 18, -31, -33, -14, -18];
const KING_DELTAS = [15, 16, 17, 1, -15, -16, -17, -1];
const BISHOP_DIRS = [15, 17, -15, -17];
const ROOK_DIRS = [16, -16, 1, -1];

// ---------- zobrist ----------
let zobSeed = 0x1a2b3c4d;
function rnd32() {
  zobSeed ^= zobSeed << 13; zobSeed |= 0; zobSeed ^= zobSeed >>> 17; zobSeed ^= zobSeed << 5; zobSeed |= 0;
  return zobSeed | 0;
}
const ZOB = new Int32Array(15 * 128 + 128);
const ZSIDE = 13 * 128, ZNULL = 14 * 128; // ep keys at 15*128+sq
for (let i = 0; i < ZOB.length; i++) ZOB[i] = rnd32();
const CASTLE_ZOB = new Int32Array(16);
for (let i = 0; i < 16; i++) CASTLE_ZOB[i] = rnd32();

// ---------- evaluation ----------
const VAL_MG = [0, 82, 337, 365, 477, 1025, 0, 82, 337, 365, 477, 1025, 0];
const VAL_EG = [0, 94, 281, 297, 512, 936, 0, 94, 281, 297, 512, 936, 0];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

const PST_MG = [], PST_EG = [];
(function buildPst() {
  for (let t = 1; t <= 6; t++) {
    const mg = new Int16Array(64), eg = new Int16Array(64);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rf = Math.abs(2 * r - 7), ff = Math.abs(2 * f - 7);
        const dist = (7 - rf) + (7 - ff); // 15 at corner? 14 at center
        let mgv = 0, egv = 0;
        if (t === 1) {
          if (r >= 1) {
            mgv = (r - 1) * 7 + Math.max(0, 3 - rf) * 3 + Math.max(0, 2 - ff) * 2;
            egv = (r - 1) * 13;
          }
        } else if (t === 2) {
          mgv = dist - 26 + (r === 0 ? -30 : 0) + (r === 1 && f >= 3 && f <= 4 ? 10 : 0);
          egv = dist - 18;
        } else if (t === 3) {
          mgv = Math.round(dist * 1.4) - 25 + (r === 0 ? -10 : 0) + (f === 2 || f === 5 ? 6 : 0);
          egv = dist - 15;
        } else if (t === 4) {
          mgv = (r === 6 ? 25 : r === 7 ? 10 : 0) + (f >= 3 && f <= 4 ? 5 : 0) - 10;
          egv = (r === 6 ? 25 : r === 7 ? 14 : 0) + (f >= 3 && f <= 4 ? 6 : 0) - 5;
        } else if (t === 5) {
          mgv = Math.round(dist * 0.8) - 28 + (r === 0 ? -30 : 0);
          egv = Math.round(dist * 0.8) - 8;
        } else {
          if (r <= 1) mgv = (f >= 2 && f <= 6 ? 12 : -25) + (r === 0 && (f === 6 || f === 2) ? 25 : 0) - dist;
          else mgv = -30 - dist * 2;
          egv = 25 - dist * 2 + (r >= 3 ? 10 : 0);
        }
        mg[r * 8 + f] = mgv | 0;
        eg[r * 8 + f] = egv | 0;
      }
    }
    PST_MG[t] = mg; PST_EG[t] = eg;
  }
})();

const PASSED_MG = [0, 0, 10, 20, 38, 62, 100, 0];
const PASSED_EG = [0, 10, 16, 30, 55, 85, 130, 0];

// ---------- state ----------
function newState() {
  return {
    board: new Int8Array(128),
    whiteToMove: true,
    ep: -1,
    wRooks: [-1, -1],
    bRooks: [-1, -1],
    halfmove: 0,
    key: 0,
    keyStack: [],
    kingW: -1, kingB: -1,
    kingWStack: [], kingBStack: [],
    epStack: [], halfStack: [], rookStack: [], capStack: []
  };
}

function findKing(b, king) {
  for (let idx = 0; idx < 128; idx++) {
    if (idx & 0x88) { idx += 7; continue; }
    if (b[idx] === king) return idx;
  }
  return -1;
}

function castleIdx(s) {
  return (s.wRooks[0] >= 0 ? 1 : 0) | (s.wRooks[1] >= 0 ? 2 : 0) | (s.bRooks[0] >= 0 ? 4 : 0) | (s.bRooks[1] >= 0 ? 8 : 0);
}

function computeKey(s) {
  let key = 0;
  const b = s.board;
  for (let idx = 0; idx < 128; idx++) {
    if (idx & 0x88) { idx += 7; continue; }
    const p = b[idx];
    if (p) key ^= ZOB[(p - 1) * 128 + idx] | 0;
  }
  if (!s.whiteToMove) key ^= ZOB[ZSIDE] | 0;
  key ^= CASTLE_ZOB[castleIdx(s)];
  if (s.ep >= 0) key ^= ZOB[15 * 128 + s.ep] | 0;
  return key | 0;
}

function parseFen(fen) {
  const s = newState();
  const b0 = s.board;
  const parts = fen.split(/\s+/);
  const rows = parts[0].split('/');
  const map = { P: WP, N: WN, B: WB, R: WR, Q: WQ, K: WK, p: BP, n: BN, b: BB, r: BR, q: BQ, k: BK };
  for (let r = 0; r < 8; r++) {
    const row = rows[7 - r];
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { f += Number(ch); continue; }
      s.board[r * 16 + f] = map[ch] || 0; f++;
    }
  }
  s.whiteToMove = parts[1] !== 'b';
  s.ep = (parts[3] && parts[3] !== '-' && NAME_TO_SQ[parts[3]] !== undefined) ? NAME_TO_SQ[parts[3]] : -1;
  s.kingW = findKing(s.board, WK);
  s.kingB = findKing(s.board, BK);
  if (parts[2] && parts[2] !== '-') {
    const kwf = s.kingW >= 0 ? fileOf(s.kingW) : 4;
    const kbf = s.kingB >= 0 ? fileOf(s.kingB) : 4;
    for (const ch of parts[2]) {
      const white = ch >= 'A' && ch <= 'Z';
      const c = ch.toLowerCase();
      let file = c === 'k' ? 7 : c === 'q' ? 0 : c.charCodeAt(0) - 97;
      if (file < 0 || file > 7) continue;
      const kingFile = white ? kwf : kbf;
      if (file === kingFile) continue;
      (white ? s.wRooks : s.bRooks)[file > kingFile ? 0 : 1] = (white ? 0 : 7) * 16 + file;
    }
  }
  s.halfmove = Number(parts[4]) || 0;
  s.key = computeKey(s);
  return s;
}

// byWhite: attacked by white?
function isAttacked(b, sq, byWhite) {
  if (byWhite) {
    if (!((sq - 15) & 0x88) && b[sq - 15] === WP) return true;
    if (!((sq - 17) & 0x88) && b[sq - 17] === WP) return true;
  } else {
    if (!((sq + 15) & 0x88) && b[sq + 15] === BP) return true;
    if (!((sq + 17) & 0x88) && b[sq + 17] === BP) return true;
  }
  const kn = byWhite ? WN : BN;
  for (let i = 0; i < 8; i++) {
    const t = sq + KNIGHT_DELTAS[i];
    if (!(t & 0x88) && b[t] === kn) return true;
  }
  const kg = byWhite ? WK : BK;
  for (let i = 0; i < 8; i++) {
    const t = sq + KING_DELTAS[i];
    if (!(t & 0x88) && b[t] === kg) return true;
  }
  const bish = byWhite ? WB : BB, rook = byWhite ? WR : BR, queen = byWhite ? WQ : BQ;
  for (let i = 0; i < 4; i++) {
    let t = sq + BISHOP_DIRS[i];
    while (!(t & 0x88)) {
      const p = b[t];
      if (p) { if (p === bish || p === queen) return true; break; }
      t += BISHOP_DIRS[i];
    }
  }
  for (let i = 0; i < 4; i++) {
    let t = sq + ROOK_DIRS[i];
    while (!(t & 0x88)) {
      const p = b[t];
      if (p) { if (p === rook || p === queen) return true; break; }
      t += ROOK_DIRS[i];
    }
  }
  return false;
}

function inCheck(s) {
  return isAttacked(s.board, s.whiteToMove ? s.kingW : s.kingB, !s.whiteToMove);
}

// after makeMove: is the piece that just moved (opposite of s.whiteToMove) in check?
function moverInCheck(s) {
  return isAttacked(s.board, s.whiteToMove ? s.kingB : s.kingW, s.whiteToMove);
}

function pushState(s, cap) {
  s.epStack.push(s.ep);
  s.halfStack.push(s.halfmove);
  s.rookStack.push(s.wRooks[0], s.wRooks[1], s.bRooks[0], s.bRooks[1]);
  s.kingWStack.push(s.kingW);
  s.kingBStack.push(s.kingB);
  s.keyStack.push(s.key);
  s.capStack.push(cap | 0);
}
function popState(s) {
  s.key = s.keyStack.pop();
  s.kingB = s.kingBStack.pop();
  s.kingW = s.kingWStack.pop();
  s.bRooks[1] = s.rookStack.pop();
  s.bRooks[0] = s.rookStack.pop();
  s.wRooks[1] = s.rookStack.pop();
  s.wRooks[0] = s.rookStack.pop();
  s.halfmove = s.halfStack.pop();
  s.ep = s.epStack.pop();
  return s.capStack.pop();
}

function makeMove(s, m) {
  const b = s.board;
  const from = mFrom(m), to = mTo(m), flag = mFlag(m), promo = mPromo(m);
  let p = b[from];
  const white = s.whiteToMove;
  const cap = b[to];
  const ciOld = castleIdx(s);
  pushState(s, cap);
  let key = (s.key ^ ZOB[(p - 1) * 128 + from]) | 0;
  b[from] = 0;
  if (cap) key ^= ZOB[(cap - 1) * 128 + to];
  b[to] = p;
  key ^= ZOB[(p - 1) * 128 + to];

  if (flag === FLAG_EP) {
    const capSq = to + (white ? -16 : 16);
    const cp = white ? BP : WP;
    key ^= ZOB[(cp - 1) * 128 + capSq];
    b[capSq] = 0;
  } else if (flag === FLAG_CASTLE) {
    const rfile = fileOf(to), kfile = fileOf(from);
    const kingside = rfile > kfile;
    const kdest = rankOf(to) * 16 + (kingside ? 6 : 2);
    const rdest = rankOf(to) * 16 + (kingside ? 5 : 3);
    const rook = white ? WR : BR;
    b[to] = 0;
    key ^= ZOB[(p - 1) * 128 + to];
    b[kdest] = p;
    key ^= ZOB[(p - 1) * 128 + kdest];
    b[rdest] = rook;
    key ^= ZOB[(rook - 1) * 128 + rdest];
    if (white) s.kingW = kdest; else s.kingB = kdest;
    if (white) { s.wRooks[0] = -1; s.wRooks[1] = -1; } else { s.bRooks[0] = -1; s.bRooks[1] = -1; }
    p = 0;
  }
  if (promo) {
    const pt = white ? promo : promo + 6;
    key ^= ZOB[(b[to] - 1) * 128 + to];
    b[to] = pt;
    key ^= ZOB[(pt - 1) * 128 + to];
  }
  if (p === WK) { s.kingW = to; s.wRooks[0] = -1; s.wRooks[1] = -1; }
  else if (p === BK) { s.kingB = to; s.bRooks[0] = -1; s.bRooks[1] = -1; }
  else if (p === WR) {
    if (from === s.wRooks[0]) s.wRooks[0] = -1;
    if (from === s.wRooks[1]) s.wRooks[1] = -1;
  } else if (p === BR) {
    if (from === s.bRooks[0]) s.bRooks[0] = -1;
    if (from === s.bRooks[1]) s.bRooks[1] = -1;
  }
  if (s.wRooks[0] >= 0 && s.wRooks[0] === to && p !== WR) s.wRooks[0] = -1;
  if (s.wRooks[1] >= 0 && s.wRooks[1] === to && p !== WR) s.wRooks[1] = -1;
  if (s.bRooks[0] >= 0 && s.bRooks[0] === to && p !== BR) s.bRooks[0] = -1;
  if (s.bRooks[1] >= 0 && s.bRooks[1] === to && p !== BR) s.bRooks[1] = -1;

  s.ep = -1;
  if (p === WP || p === BP) {
    if (Math.abs(to - from) === 32) s.ep = from + (white ? 16 : -16);
    s.halfmove = 0;
  } else s.halfmove++;

  key ^= CASTLE_ZOB[ciOld] ^ CASTLE_ZOB[castleIdx(s)];
  if (white) key ^= ZOB[ZSIDE] | 0;
  if (s.ep >= 0) key ^= ZOB[15 * 128 + s.ep];
  s.key = key | 0;
  s.whiteToMove = !white;
}

function unmakeMove(s, m) {
  s.whiteToMove = !s.whiteToMove;
  const cap = popState(s);
  const b = s.board;
  const from = mFrom(m), to = mTo(m), flag = mFlag(m);
  const white = s.whiteToMove;
  if (flag === FLAG_CASTLE) {
    const rfile = fileOf(to), kfile = fileOf(from);
    const kingside = rfile > kfile;
    const kdest = rankOf(to) * 16 + (kingside ? 6 : 2);
    const rdest = rankOf(to) * 16 + (kingside ? 5 : 3);
    b[kdest] = 0; b[rdest] = 0;
    b[from] = white ? WK : BK;
    b[to] = white ? WR : BR;
    if (white) s.kingW = from; else s.kingB = from;
  } else {
    const p = b[to];
    b[to] = 0;
    b[from] = mPromo(m) ? (white ? WP : BP) : p;
    if (flag === FLAG_EP) {
      const capSq = to + (white ? -16 : 16);
      b[capSq] = white ? BP : WP;
    } else if (cap) {
      b[to] = cap;
    }
    if (p === WK) s.kingW = from; else if (p === BK) s.kingB = from;
  }
}

// ---------- movegen ----------
function genMoves(s, capturesOnly) {
  const moves = [];
  const b = s.board;
  const white = s.whiteToMove;
  for (let idx = 0; idx < 128; idx++) {
    if (idx & 0x88) { idx += 7; continue; }
    const p = b[idx];
    if (!p || IS_WHITE(p) !== white) continue;
    const t = TYPE(p);
    if (t === 1) {
      const fwd = white ? 16 : -16;
      const promoRank = white ? 6 : 1;
      const startRank = white ? 1 : 6;
      const r = rankOf(idx);
      const one = idx + fwd;
      if (!(one & 0x88) && !b[one]) {
        if (r === promoRank) {
          for (let pIdx = 0; pIdx < 4; pIdx++) moves.push(idx | (one << 7) | ((5 - pIdx) << 14));
        } else if (!capturesOnly) {
          moves.push(idx | (one << 7));
          const two = one + fwd;
          if (r === startRank && !b[two]) moves.push(idx | (two << 7));
        } else {
          moves.push(idx | (one << 7) | (5 << 14));
        }
      }
      for (let dc = fwd - 1; dc <= fwd + 1; dc += 2) {
        const t2 = idx + dc;
        if (t2 & 0x88) continue;
        const target = b[t2];
        if (target && IS_WHITE(target) !== white) {
          if (r === promoRank) {
            for (let pIdx = 0; pIdx < 4; pIdx++) {
              const pr = 5 - pIdx;
              moves.push(idx | (t2 << 7) | (pr << 14) | (1 << 17));
            }
          } else moves.push(idx | (t2 << 7) | (1 << 17));
        } else if (!target && t2 === s.ep) {
          moves.push(idx | (t2 << 7) | (FLAG_EP << 17));
        }
      }
    } else if (t === 2 || t === 6) {
      const deltas = t === 2 ? KNIGHT_DELTAS : KING_DELTAS;
      for (let i = 0; i < 8; i++) {
        const t2 = idx + deltas[i];
        if (t2 & 0x88) continue;
        const target = b[t2];
        if (!target) { if (!capturesOnly) moves.push(idx | (t2 << 7)); }
        else if (IS_WHITE(target) !== white) moves.push(idx | (t2 << 7) | (1 << 17));
      }
      if (t === 6 && !capturesOnly) {
        const rights = white ? s.wRooks : s.bRooks;
        for (let ri = 0; ri < 2; ri++) {
          const rookSq = rights[ri];
          if (rookSq < 0 || b[rookSq] !== (white ? WR : BR)) continue;
          if (rankOf(rookSq) !== rankOf(idx) || rookSq === idx) continue;
          const rfile = fileOf(rookSq), kfile = fileOf(idx);
          const kingside = rfile > kfile;
          const kdest = rankOf(idx) * 16 + (kingside ? 6 : 2);
          const rdest = rankOf(idx) * 16 + (kingside ? 5 : 3);
          const kMin = Math.min(idx, kdest), kMax = Math.max(idx, kdest);
          const rMin = Math.min(rookSq, rdest), rMax = Math.max(rookSq, rdest);
          let clear = true;
          for (let t3 = kMin; t3 <= kMax && clear; t3++) if (t3 !== idx && t3 !== rookSq && b[t3]) clear = false;
          for (let t3 = rMin; t3 <= rMax && clear; t3++) if (t3 !== idx && t3 !== rookSq && b[t3]) clear = false;
          if (!clear) continue;
          b[idx] = 0; b[rookSq] = 0;
          let ok = true;
          for (let t3 = kMin; t3 <= kMax && ok; t3++) if (isAttacked(b, t3, !white)) ok = false;
          b[idx] = white ? WK : BK; b[rookSq] = white ? WR : BR;
          if (!ok) continue;
          moves.push(idx | (rookSq << 7) | (FLAG_CASTLE << 17));
        }
      }
    } else {
      const dirs = t === 3 ? BISHOP_DIRS : t === 4 ? ROOK_DIRS : null;
      if (dirs) {
        slide(moves, b, idx, dirs, white, capturesOnly);
      } else {
        slide(moves, b, idx, BISHOP_DIRS, white, capturesOnly);
        slide(moves, b, idx, ROOK_DIRS, white, capturesOnly);
      }
    }
  }
  return moves;
}

function slide(moves, b, idx, dirs, white, capturesOnly) {
  for (let i = 0; i < dirs.length; i++) {
    let t2 = idx + dirs[i];
    while (!(t2 & 0x88)) {
      const target = b[t2];
      if (!target) { if (!capturesOnly) moves.push(idx | (t2 << 7)); }
      else { if (IS_WHITE(target) !== white) moves.push(idx | (t2 << 7) | (1 << 17)); break; }
      t2 += dirs[i];
    }
  }
}

// ---------- evaluation ----------
const EVAL_W_PF = new Int8Array(8), EVAL_B_PF = new Int8Array(8);
const EVAL_W_PR = new Int8Array(64), EVAL_B_PR = new Int8Array(64);
const EVAL_W_ROOK = new Int8Array(8), EVAL_B_ROOK = new Int8Array(8), EVAL_Q = new Int8Array(8), EVAL_KNIGHT = new Int8Array(8), EVAL_BISHOP = new Int8Array(8);
function evaluate(s) {
  const b = s.board;
  const wPF = EVAL_W_PF, bPF = EVAL_B_PF, wPR = EVAL_W_PR, bPR = EVAL_B_PR;
  const wRK = EVAL_W_ROOK, bRK = EVAL_B_ROOK, qFiles = EVAL_Q, nFiles = EVAL_KNIGHT, bFiles = EVAL_BISHOP;
  wPF.fill(0); bPF.fill(0);
  wRK.fill(-1); bRK.fill(-1); qFiles.fill(-1); nFiles.fill(-1); bFiles.fill(-1);
  let mg = 0, eg = 0, phase = 0;
  let wBish = 0, bBish = 0;
  let wkf = -1, bkf = -1;
  for (let idx = 0; idx < 128; idx++) {
    if (idx & 0x88) { idx += 7; continue; }
    const p = b[idx];
    if (!p) continue;
    const t = TYPE(p);
    const f = fileOf(idx), r = rankOf(idx);
    const white = IS_WHITE(p);
    if (t === 6) { if (white) wkf = f; else bkf = f; continue; }
    const r8 = white ? r : 7 - r;
    const pst8 = r8 * 8 + f;
    mg += (VAL_MG[t] + PST_MG[t][pst8]) * (white ? 1 : -1);
    eg += (VAL_EG[t] + PST_EG[t][pst8]) * (white ? 1 : -1);
    phase += PHASE_W[t];
    if (t === 1) {
      if (white) { wPF[f]++; wPR[r * 8 + f] = r; }
      else { bPF[f]++; bPR[(7 - r) * 8 + f] = 7 - r; }
    } else if (t === 3) {
      if (white) { wBish++; bFiles[f] = 1; } else { bBish++; bFiles[f] = -1; }
    } else if (t === 4) {
      if (white) wRK[f] = 1; else bRK[f] = 1;
    } else if (t === 5) {
      if (white) qFiles[f] = 1; else qFiles[f] = -1;
    } else if (t === 2) {
      if (white) nFiles[f] = 1; else nFiles[f] = -1;
    }
  }
  if (phase > 24) phase = 24;
  let structMg = 0, structEg = 0;
  for (let f = 0; f < 8; f++) {
    const wHas = wPF[f], bHas = bPF[f];
    if (wHas > 1) { structMg -= 10 * (wHas - 1); structEg -= 24 * (wHas - 1); }
    if (bHas > 1) { structMg += 10 * (bHas - 1); structEg += 24 * (bHas - 1); }
    const wAdj = (f > 0 ? wPF[f - 1] : 0) + (f < 7 ? wPF[f + 1] : 0);
    const bAdj = (f > 0 ? bPF[f - 1] : 0) + (f < 7 ? bPF[f + 1] : 0);
    if (wHas && !wAdj) { structMg -= 14; structEg -= 18; }
    if (bHas && !bAdj) { structMg += 14; structEg += 18; }
  }
  // passed pawns
  for (let pr = 1; pr < 7; pr++) {
    for (let f = 0; f < 8; f++) {
      if (wPR[pr * 8 + f]) {
        let passed = true;
        for (let df = -1; df <= 1 && passed; df++) {
          const ff = f + df; if (ff < 0 || ff > 7) continue;
          for (let rr = pr + 1; rr < 7; rr++) if (bPR[rr * 8 + ff]) { passed = false; break; }
        }
        if (passed) { structMg += PASSED_MG[pr]; structEg += PASSED_EG[pr]; }
      }
      if (bPR[pr * 8 + f]) {
        let passed = true;
        for (let df = -1; df <= 1 && passed; df++) {
          const ff = f + df; if (ff < 0 || ff > 7) continue;
          for (let rr = 1; rr < pr; rr++) if (wPR[rr * 8 + ff]) { passed = false; break; }
        }
        if (passed) { structMg -= PASSED_MG[7 - pr]; structEg -= PASSED_EG[7 - pr]; }
      }
    }
  }
  let evalScore = ((mg + structMg) * phase + (eg + structEg) * (24 - phase)) / 24;
  if (wBish >= 2) evalScore += 30;
  if (bBish >= 2) evalScore -= 30;
  // rook files (from wRK/bRK marks), queen-file alignment
  for (let f = 0; f < 8; f++) {
    const wHas = wPF[f], bHas = bPF[f];
    if (wRK[f] === 1) {
      if (!wHas && !bHas) evalScore += 18;
      else if (!bHas) evalScore += 9;
    }
    if (bRK[f] === 1) {
      if (!wHas && !bHas) evalScore -= 18;
      else if (!wHas) evalScore -= 9;
    }
  }
  if (wkf >= 0) {
    let sh = 0;
    for (let df = -1; df <= 1; df++) {
      const ff = wkf + df; if (ff < 0 || ff > 7) continue;
      sh += wPF[ff] ? 8 : -10;
    }
    evalScore += sh * phase / 24;
  }
  if (bkf >= 0) {
    let sh = 0;
    for (let df = -1; df <= 1; df++) {
      const ff = bkf + df; if (ff < 0 || ff > 7) continue;
      sh += bPF[ff] ? -8 : 10;
    }
    evalScore += sh * phase / 24;
  }
  evalScore += s.whiteToMove ? 12 : -12;
  return (evalScore | 0) * (s.whiteToMove ? 1 : -1);
}

// ---------- search ----------
const TT_SIZE = 1 << 19;
const TT_KEY = new Int32Array(TT_SIZE);
const TT_MOVE = new Int32Array(TT_SIZE);
const TT_SCORE = new Int32Array(TT_SIZE);
const TT_DT = new Int32Array(TT_SIZE);

const MAX_PLY = 64;
const killers = new Int32Array(MAX_PLY * 2);
const QS_BUF = new Int32Array(384);
const ORD_BUF = new Int32Array(384);
const histTable = new Int32Array(13 * 128);

let nodeCount = 0, hardDeadline = 0, timeUp = false;

const PIECE_VAL = [0, 100, 320, 330, 500, 900, 0, 100, 320, 330, 500, 900, 0];

function mvvLva(b, m) {
  const victim = b[mTo(m)] ? PIECE_VAL[TYPE(b[mTo(m)])] : (mFlag(m) === FLAG_EP ? 100 : 0);
  return victim * 16 - Math.round(PIECE_VAL[TYPE(b[mFrom(m)])] / 100) + (mPromo(m) ? 850 : 0);
}

const INS_SIZE = 1 << 16;
const INS_KEY = new Int32Array(INS_SIZE);
const INS_VAL = new Int8Array(INS_SIZE);
function insufficientMaterialFast(s, key) {
  const k = (key >>> 16) & (INS_SIZE - 1);
  if (INS_KEY[k] === (key | 0) + 1) return INS_VAL[k] === 1;
  const r = insufficientMaterial(s);
  INS_KEY[k] = (key | 0) + 1;
  INS_VAL[k] = r ? 1 : 0;
  return r;
}
function insufficientMaterial(s) {
  const b = s.board;
  let total = 0, knights = 0, bcol = -1, diffCol = false;
  for (let idx = 0; idx < 128; idx++) {
    if (idx & 0x88) { idx += 7; continue; }
    const p = b[idx];
    if (!p) continue;
    const t = TYPE(p);
    if (t === 6) continue;
    if (t === 1 || t === 4 || t === 5) return false;
    total++;
    if (t === 2) knights++;
    else {
      const col = (rankOf(idx) + fileOf(idx)) & 1;
      if (bcol === -1) bcol = col; else if (col !== bcol) diffCol = true;
    }
  }
  if (total <= 1) return true;
  if (diffCol) return false;
  return knights === 0 && bcol !== -1;
}

function qsearch(s, alpha, beta, ply) {
  nodeCount++;
  if ((nodeCount & 2047) === 0 && Date.now() >= hardDeadline) { timeUp = true; return 0; }
  if (ply >= 60) return evaluate(s);
  const b = s.board;
  const inChk = inCheck(s);
  let best = -INF;
  if (!inChk) {
    const stand = evaluate(s);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    best = stand;
  }
  const moves = genMoves(s, !inChk);
  const n = moves.length;
  const buf = QS_BUF;
  for (let i = 0; i < n; i++) buf[i] = mvvLva(b, moves[i]) * 256 + i;
  buf.subarray(0, n).sort();
  for (let oi = n - 1; oi >= 0; oi--) {
    if (timeUp) return best > -INF ? best : 0;
    const m = moves[buf[oi] & 255];
    if (!inChk) {
      const victim = b[mTo(m)] ? PIECE_VAL[TYPE(b[mTo(m)])] : 100;
      if (!mPromo(m) && best + victim + 190 <= alpha) continue;
    }
    makeMove(s, m);
    if (moverInCheck(s)) { unmakeMove(s, m); continue; }
    const score = -qsearch(s, -beta, -alpha, ply + 1);
    unmakeMove(s, m);
    if (timeUp) return best > -INF ? best : 0;
    if (score > best) {
      best = score;
      if (score > alpha) {
        alpha = score;
        if (score >= beta) return score;
      }
    }
  }
  if (inChk && best === -INF) return -(MATE - ply);
  return best;
}

function search(s, depth, alpha, beta, ply, allowNull) {
  nodeCount++;
  if ((nodeCount & 2047) === 0 && Date.now() >= hardDeadline) { timeUp = true; return 0; }

  const myKey = s.key;
  const stack = s.keyStack;
  const scanMin = Math.max(0, stack.length - 180);
  for (let i = stack.length - 2; i >= scanMin; i -= 1) {
    if (stack[i] === myKey) return 0;
  }
  if (s.halfmove >= 100) return 0;
  if (insufficientMaterialFast(s, myKey)) return 0;

  const inChk = inCheck(s);
  if (inChk && ply < 32) depth++;

  const probeIdx = myKey & (TT_SIZE - 1);
  let ttMove = 0;
  if (TT_KEY[probeIdx] === myKey) {
    ttMove = TT_MOVE[probeIdx];
    const dt = TT_DT[probeIdx], d2 = dt >> 2, tFlag = dt & 3;
    if (d2 >= depth && ply > 0) {
      let sc = TT_SCORE[probeIdx];
      if (sc > MATE - 1000) sc -= ply; else if (sc < -(MATE - 1000)) sc += ply;
      if (tFlag === 0) return sc;
      if (tFlag === 1 && sc >= beta) return sc;
      if (tFlag === 2 && sc <= alpha) return sc;
    }
  }

  if (depth <= 0) return qsearch(s, alpha, beta, ply);

  const b = s.board;
  if (allowNull && !inChk && depth >= 3 && ply > 0) {
    let hasPieces = false;
    for (let idx = 0; idx < 128; idx++) {
      if (idx & 0x88) { idx += 7; continue; }
      const p2 = b[idx];
      if (p2 && IS_WHITE(p2) === s.whiteToMove) {
        const t2 = TYPE(p2);
        if (t2 !== 1 && t2 !== 6) { hasPieces = true; break; }
      }
    }
    if (hasPieces) {
      pushState(s);
      if (s.ep >= 0) s.key ^= ZOB[15 * 128 + s.ep] | 0;
      s.ep = -1;
      s.key = (s.key ^ ZOB[ZNULL]) | 0;
      s.whiteToMove = !s.whiteToMove;
      const score = -search(s, depth - 3, -beta, -beta + 1, ply + 1, false);
      s.whiteToMove = !s.whiteToMove;
      popState(s);
      if (timeUp) return 0;
      if (score >= beta) return beta;
    }
  }

  const gen = genMoves(s, false);
  const genLen = gen.length;
  const obuf = ORD_BUF;
  for (let i = 0; i < genLen; i++) {
    const m = gen[i];
    let sc;
    if (m === ttMove) sc = 1 << 20;
    else {
      const fl = mFlag(m);
      if (fl === 1 || fl === FLAG_EP || mPromo(m)) sc = ((1 << 19) + mvvLva(b, m)) << 3;
      else if (m === killers[ply * 2]) sc = (1 << 18) << 3;
      else if (m === killers[ply * 2 + 1]) sc = (((1 << 18) - 1) << 3);
      else sc = (histTable[TYPE(b[mFrom(m)]) * 128 + mTo(m)] | 0) << 3;
    }
    obuf[i] = (sc * 256 + i) | 0;
  }
  obuf.subarray(0, genLen).sort();

  let bestScore = -INF, bestMove = 0, legalCount = 0;
  const origAlpha = alpha;
  for (let i = genLen - 1; i >= 0; i--) {
    const m = gen[obuf[i] & 255];
    const quiet = mFlag(m) === 0 && !mPromo(m);
    makeMove(s, m);
    if (moverInCheck(s)) { unmakeMove(s, m); continue; }
    legalCount++;
    const givesCheck = isAttacked(b, s.whiteToMove ? s.kingB : s.kingW, s.whiteToMove);
    let score;
    if (legalCount === 1) {
      score = -search(s, depth - 1, -beta, -alpha, ply + 1, true);
    } else {
      let reduce = 0;
      if (depth >= 3 && legalCount > 3 && quiet && !inChk && !givesCheck) reduce = depth > 6 ? 2 : 1;
      score = -search(s, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha) score = -search(s, depth - 1, -beta, -alpha, ply + 1, true);
    }
    unmakeMove(s, m);
    if (timeUp) return bestScore > -INF ? bestScore : 0;
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
      if (score > alpha) {
        alpha = score;
        if (score >= beta) {
          if (quiet) {
            const ki = TYPE(b[mFrom(m)]) * 128 + mTo(m);
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            histTable[ki] += depth * depth;
            if (histTable[ki] > (1 << 20)) for (let j = 0; j < histTable.length; j++) histTable[j] = histTable[j] >> 1;
          }
          break;
        }
      }
    }
  }
  if (legalCount === 0) return inChk ? -(MATE - ply) : 0;

  let storeScore = bestScore;
  if (storeScore > MATE - 1000) storeScore += ply; else if (storeScore < -(MATE - 1000)) storeScore -= ply;
  if (TT_KEY[probeIdx] !== myKey || (TT_DT[probeIdx] >> 2) <= depth) {
    TT_KEY[probeIdx] = myKey;
    TT_MOVE[probeIdx] = bestMove;
    TT_SCORE[probeIdx] = storeScore;
    const tFlag = bestScore >= beta ? 1 : (bestScore <= origAlpha ? 2 : 0);
    TT_DT[probeIdx] = (depth << 2) | tFlag;
  }
  return bestScore;
}

// ---------- bot entry ----------
module.exports = function move(state) {
  const legal = state.legalMoves || [];
  if (!legal.length) return undefined;
  if (legal.length === 1) return legal[0];
  const t0 = Date.now();
  const limit = state.timeLimitMs || 1000;
  hardDeadline = t0 + Math.min(700, limit * 0.72);
  const softDeadline = t0 + Math.min(240, limit * 0.24);
  timeUp = false;
  nodeCount = 0;
  killers.fill(0);
  histTable.fill(0);

  const s = parseFen(state.fen);

  const keyList = [];
  try {
    const base = parseFen(state.initialFen || state.fen);
    keyList.push(base.key);
    for (const uci of (state.history || [])) {
      const found = findMoveByUci(base, uci);
      if (found === null) { keyList.length = 0; break; }
      makeMove(base, found);
      keyList.push(base.key);
    }
  } catch (e) { keyList.length = 0; }
  if (keyList.length) keyList[keyList.length - 1] = s.key; else keyList.push(s.key);
  s.keyStack = keyList;

  const uciByMove = new Map();
  for (const uci of legal) {
    const found = findMoveByUci(s, uci);
    if (found !== null) uciByMove.set(found, uci);
  }
  if (!uciByMove.size) return legal[0];
  const rootMoves = Array.from(uciByMove.keys());
  const b = s.board;
  const ttIdx = (s.key & (TT_SIZE - 1)) >>> 0;
  const hasTT = TT_KEY[ttIdx] === s.key;
  rootMoves.sort((m1, m2) => scoreMoveInit(m1) - scoreMoveInit(m2) * -1);

  function scoreMoveInit(m) {
    if (hasTT && TT_MOVE[ttIdx] === m) return (1 << 20);
    const fl = mFlag(m);
    if (fl === 1 || fl === FLAG_EP || mPromo(m)) return (1 << 19) + mvvLva(b, m);
    return 0;
  }

  let bestMove = rootMoves[0];
  const iterScores = new Map();
  try {
    for (let depth = 2; depth <= 40; depth++) {
      if (depth > 4 && Date.now() >= softDeadline) break;
      rootMoves.sort((m1, m2) => ((iterScores.get(m2) | 0) - (iterScores.get(m1) | 0)));
      let alpha = -INF;
      let iterBestMove = 0, iterBestScore = -INF;
      let clean = true;
      for (let i = 0; i < rootMoves.length; i++) {
        const m = rootMoves[i];
        makeMove(s, m);
        let score;
        if (i === 0) score = -search(s, depth - 1, -INF, -alpha, 1, true);
        else {
          score = -search(s, depth - 1, -alpha - 1, -alpha, 1, true);
          if (score > alpha) score = -search(s, depth - 1, -INF, -alpha, 1, true);
        }
        unmakeMove(s, m);
        if (timeUp) { clean = false; break; }
        iterScores.set(m, score);
        if (score > iterBestScore) { iterBestScore = score; iterBestMove = m; }
        if (score > alpha) alpha = score;
        if (score >= MATE - 300) break;
      }
      if (clean && iterBestMove) bestMove = iterBestMove;
      if (timeUp) break;
      if (iterBestScore >= MATE - 300) break;
    }
  } catch (e) {
    let bi = 0, bs = -Infinity;
    for (let i = 0; i < rootMoves.length; i++) {
      const sc = mvvLva(s.board, rootMoves[i]);
      if (sc > bs) { bs = sc; bi = i; }
    }
    return uciByMove.get(rootMoves[bi]);
  }
  return uciByMove.get(bestMove) || legal[0];
};

function findMoveByUci(s, uci) {
  const from = NAME_TO_SQ[uci.slice(0, 2)], to = NAME_TO_SQ[uci.slice(2, 4)];
  if (from === undefined || to === undefined) return null;
  const promoCh = uci.length > 4 ? uci[4] : '';
  const list = genMoves(s, false);
  for (const m of list) {
    if (mFrom(m) !== from || mTo(m) !== to) continue;
    if (promoCh) {
      if (mPromo(m) !== { n: 2, b: 3, r: 4, q: 5 }[promoCh]) continue;
    } else if (mPromo(m)) continue;
    return m;
  }
  return null;
}
