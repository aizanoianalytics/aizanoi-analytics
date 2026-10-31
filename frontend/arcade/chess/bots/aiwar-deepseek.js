'use strict';

const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const WHITE = 1, BLACK = -1;
const PIECE_CHARS = ' PNBRQK';
const PROMO_CHARS = ['', '', 'n', 'b', 'r', 'q'];
const PROMO_TYPES = [Q, R, B, N];
const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_OFFSETS = [-17, -15, 15, 17];
const ROOK_OFFSETS = [-16, -1, 1, 16];
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];
const VALUE = [0, 100, 325, 335, 500, 975, 0];
const PASSED_BONUS = [0, 5, 10, 20, 35, 60, 100, 0];
const MATE = 1000000;
const INF = 2000000;
const MATE_THRESHOLD = MATE - 1000;
const MAX_PLY = 96;
const TEST_SLOT = MAX_PLY + 2;
const TIMEOUT = {};
const MOVE_MASK = (1 << 19) - 1;
const SCORE_SHIFT = 19;
const EP_FLAG = 1 << 17;
const CASTLE_FLAG = 1 << 18;
const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_MISS = INF + 1;
const MAX_DEPTH = 64;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(0x5EED1234);
function rnd32() {
  return (random() * 4294967296) | 0;
}

const Z1 = [];
const Z2 = [];
for (let p = 0; p < 12; p++) {
  Z1.push(new Int32Array(128));
  Z2.push(new Int32Array(128));
  for (let s = 0; s < 128; s++) {
    Z1[p][s] = rnd32();
    Z2[p][s] = rnd32();
  }
}
const ZSIDE1 = rnd32();
const ZSIDE2 = rnd32();
const ZEP1 = new Int32Array(8);
const ZEP2 = new Int32Array(8);
for (let f = 0; f < 8; f++) {
  ZEP1[f] = rnd32();
  ZEP2[f] = rnd32();
}
const ZC1 = new Int32Array(128);
const ZC2 = new Int32Array(128);
for (let s = 0; s < 128; s++) {
  ZC1[s] = rnd32();
  ZC2[s] = rnd32();
}

const PAWN_PST = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];
const KNIGHT_PST = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50
];
const BISHOP_PST = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20
];
const ROOK_PST = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0
];
const QUEEN_PST = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20
];
const KING_MID_PST = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];
const KING_END_PST = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50
];
const PST = [null, PAWN_PST, KNIGHT_PST, BISHOP_PST, ROOK_PST, QUEEN_PST, null];

const board = new Int8Array(128);
const cntW = new Int8Array(7);
const cntB = new Int8Array(7);
const moveBuf = [];
for (let i = 0; i < MAX_PLY + 4; i++) moveBuf.push([]);
const undoStack = [];
const killer1 = new Int32Array(MAX_PLY + 4);
const killer2 = new Int32Array(MAX_PLY + 4);
const historyTable = new Int32Array(128 * 128);
const repH1 = new Int32Array(2048);
const repH2 = new Int32Array(2048);
const repHm = new Int16Array(2048);
const wPawns = new Int16Array(16);
const bPawns = new Int16Array(16);
const wPawnMask = new Int16Array(8);
const bPawnMask = new Int16Array(8);
const wFileCount = new Int8Array(8);
const bFileCount = new Int8Array(8);

const ttKey = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);

let variant = 'standard';
let side = WHITE;
let rights = [];
let epSq = -1;
let halfmove = 0;
let fullmove = 1;
let gamePly = 0;
let maxPlies = 400;
let kingW = -1;
let kingB = -1;
let h1 = 0;
let h2 = 0;
let repLen = 0;
let nodes = 0;
let deadline = 0;
let ttMoveOut = 0;
let lastInfo = {};

function squareName(s) {
  return String.fromCharCode(97 + (s & 7)) + ((s >> 4) + 1);
}

function pieceIndex(piece) {
  return piece > 0 ? piece - 1 : 6 + (-piece - 1);
}

function xorPiece(piece, s) {
  const i = pieceIndex(piece);
  h1 ^= Z1[i][s];
  h2 ^= Z2[i][s];
}

function xorSide() {
  h1 ^= ZSIDE1;
  h2 ^= ZSIDE2;
}

function xorEpFile(f) {
  h1 ^= ZEP1[f];
  h2 ^= ZEP2[f];
}

function xorRights(rs) {
  for (let i = 0; i < rs.length; i++) {
    const s = (rs[i] >> 8) & 127;
    h1 ^= ZC1[s];
    h2 ^= ZC2[s];
  }
}

function epIsRelevant(sq) {
  if (sq < 0) return false;
  const a = sq - 1;
  const b = sq + 1;
  const pawn = side * P;
  if (!(a & 0x88) && board[a] === pawn) return true;
  if (!(b & 0x88) && board[b] === pawn) return true;
  return false;
}

function computeHash() {
  h1 = 0;
  h2 = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = board[s];
    if (p) xorPiece(p, s);
  }
  if (side === BLACK) xorSide();
  xorRights(rights);
  if (epIsRelevant(epSq)) xorEpFile(epSq & 7);
}

function resetCounts() {
  cntW.fill(0);
  cntB.fill(0);
}

function addCount(piece) {
  if (piece > 0) cntW[piece]++;
  else cntB[-piece]++;
}

function decCount(piece) {
  if (piece > 0) cntW[piece]--;
  else cntB[-piece]--;
}

function incCount(piece) {
  addCount(piece);
}

function repPush() {
  repH1[repLen] = h1;
  repH2[repLen] = h2;
  repHm[repLen] = halfmove;
  repLen++;
}

function repPop() {
  repLen--;
}

function isRepetition() {
  let count = 0;
  for (let i = repLen - 1; i >= 0; i--) {
    if (repH1[i] === h1 && repH2[i] === h2) {
      count++;
      if (count >= 3) return true;
    }
    if (repHm[i] === 0) break;
  }
  return false;
}

function parseEp(text) {
  if (typeof text !== 'string' || !/^[a-h][1-8]$/.test(text)) return -1;
  return (Number(text[1]) - 1) * 16 + (text.charCodeAt(0) - 97);
}

function parseRights(text) {
  rights = [];
  if (typeof text !== 'string' || text === '-') return;
  for (const ch of text) {
    const color = ch === ch.toUpperCase() ? WHITE : BLACK;
    const upper = ch.toUpperCase();
    const k = color === WHITE ? kingW : kingB;
    if (k < 0) continue;
    let file;
    if (upper === 'K' || upper === 'Q') {
      if (variant === 'standard') {
        file = upper === 'K' ? 7 : 0;
      } else {
        const base = color === WHITE ? 0 : 112;
        const kf = k & 7;
        let found = -1;
        for (let f = 0; f < 8; f++) {
          if (board[base + f] !== color * R) continue;
          if (upper === 'K' ? f > kf : f < kf) {
            if (found < 0) found = f;
            else if (upper === 'K') found = Math.max(found, f);
            else found = Math.min(found, f);
          }
        }
        if (found < 0) continue;
        file = found;
      }
    } else {
      file = upper.charCodeAt(0) - 65;
      if (file < 0 || file > 7) continue;
    }
    const base = color === WHITE ? 0 : 112;
    const rs = base + file;
    if ((k >> 4) !== (color === WHITE ? 0 : 7)) continue;
    if (board[rs] !== color * R) continue;
    if (rs === k) continue;
    if (variant === 'standard' && (k & 7) !== 4) continue;
    const colorBit = color === WHITE ? 0 : 1;
    let duplicate = false;
    for (let i = 0; i < rights.length; i++) {
      const r = rights[i];
      if ((r & 1) === colorBit && (((r >> 8) & 127) > k) === (rs > k)) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) rights.push(colorBit | (k << 1) | (rs << 8));
  }
}

function isAttacked(target, by) {
  const pawn = by * P;
  let from = target - (by * 16 - 1);
  if (!(from & 0x88) && board[from] === pawn) return true;
  from = target - (by * 16 + 1);
  if (!(from & 0x88) && board[from] === pawn) return true;
  for (let i = 0; i < 8; i++) {
    from = target + KNIGHT_OFFSETS[i];
    if (!(from & 0x88) && board[from] === by * N) return true;
  }
  for (let i = 0; i < 8; i++) {
    from = target + KING_OFFSETS[i];
    if (!(from & 0x88) && board[from] === by * K) return true;
  }
  for (let i = 0; i < 4; i++) {
    const d = BISHOP_OFFSETS[i];
    let s = target + d;
    while (!(s & 0x88)) {
      const p = board[s];
      if (p) {
        if ((p > 0 ? 1 : -1) === by) {
          const t = p > 0 ? p : -p;
          if (t === B || t === Q) return true;
        }
        break;
      }
      s += d;
    }
  }
  for (let i = 0; i < 4; i++) {
    const d = ROOK_OFFSETS[i];
    let s = target + d;
    while (!(s & 0x88)) {
      const p = board[s];
      if (p) {
        if ((p > 0 ? 1 : -1) === by) {
          const t = p > 0 ? p : -p;
          if (t === R || t === Q) return true;
        }
        break;
      }
      s += d;
    }
  }
  return false;
}

function canCastle(k, rr, us) {
  const base = us === WHITE ? 0 : 112;
  const kingside = rr > k;
  const kt = base + (kingside ? 6 : 2);
  const rt = base + (kingside ? 5 : 3);
  if (isAttacked(k, -us)) return false;
  const a1 = Math.min(k, kt);
  const a2 = Math.max(k, kt);
  for (let s = a1; s <= a2; s++) {
    if (s !== k && s !== rr && board[s]) return false;
  }
  const b1 = Math.min(rr, rt);
  const b2 = Math.max(rr, rt);
  for (let s = b1; s <= b2; s++) {
    if (s !== k && s !== rr && board[s]) return false;
  }
  const step = kt > k ? 1 : kt < k ? -1 : 0;
  if (step) {
    const saved = board[k];
    board[k] = 0;
    let safe = true;
    for (let s = k + step; s !== kt; s += step) {
      if (isAttacked(s, -us)) {
        safe = false;
        break;
      }
    }
    board[k] = saved;
    if (!safe) return false;
  }
  return true;
}

function genMoves(out) {
  let n = 0;
  const us = side;
  const them = -us;
  for (let from = 0; from < 128; from++) {
    if (from & 0x88) {
      from += 7;
      continue;
    }
    const piece = board[from];
    if (!piece) continue;
    if ((piece > 0 ? 1 : -1) !== us) continue;
    const type = piece > 0 ? piece : -piece;
    if (type === P) {
      const step = us * 16;
      const startRank = us === WHITE ? 1 : 6;
      const promoRank = us === WHITE ? 7 : 0;
      const to = from + step;
      if (!(to & 0x88) && !board[to]) {
        if ((to >> 4) === promoRank) {
          for (let i = 0; i < 4; i++) out[n++] = from | (to << 7) | (PROMO_TYPES[i] << 14);
        } else {
          out[n++] = from | (to << 7);
          if ((from >> 4) === startRank && !board[to + step]) {
            out[n++] = from | ((to + step) << 7);
          }
        }
      }
      const d1 = step - 1;
      const d2 = step + 1;
      for (let i = 0; i < 2; i++) {
        const d = i === 0 ? d1 : d2;
        const dest = from + d;
        if (dest & 0x88) continue;
        const target = board[dest];
        if (target && (target > 0 ? 1 : -1) === them) {
          const tt = target > 0 ? target : -target;
          if (tt === K) continue;
          if ((dest >> 4) === promoRank) {
            for (let j = 0; j < 4; j++) out[n++] = from | (dest << 7) | (PROMO_TYPES[j] << 14);
          } else {
            out[n++] = from | (dest << 7);
          }
        } else if (dest === epSq && !target && board[dest - step] === them * P) {
          out[n++] = from | (dest << 7) | EP_FLAG;
        }
      }
      continue;
    }
    const dirs = type === N ? KNIGHT_OFFSETS : type === B ? BISHOP_OFFSETS :
      type === R ? ROOK_OFFSETS : KING_OFFSETS;
    const count = type === N || type === K || type === Q ? 8 : 4;
    for (let i = 0; i < count; i++) {
      const d = dirs[i];
      for (let to = from + d; !(to & 0x88); to += d) {
        const target = board[to];
        if (target && (target > 0 ? 1 : -1) === us) break;
        const tt = target > 0 ? target : -target;
        if (tt !== K) out[n++] = from | (to << 7);
        if (target || type === N || type === K) break;
      }
    }
  }
  for (let i = 0; i < rights.length; i++) {
    const r = rights[i];
    const rColor = (r & 1) === 0 ? WHITE : BLACK;
    if (rColor !== us) continue;
    const k = (r >> 1) & 127;
    const rr = (r >> 8) & 127;
    const cur = us === WHITE ? kingW : kingB;
    if (cur !== k) continue;
    if (board[k] !== us * K || board[rr] !== us * R) continue;
    if (canCastle(k, rr, us)) out[n++] = k | (rr << 7) | CASTLE_FLAG;
  }
  out.length = n;
  return n;
}

function moveToUci(m) {
  const f = m & 127;
  const t = (m >> 7) & 127;
  const p = (m >> 14) & 7;
  return squareName(f) + squareName(t) + (p ? PROMO_CHARS[p] : '');
}

function makeMove(move, ply) {
  const f = move & 127;
  const t = (move >> 7) & 127;
  const promo = (move >> 14) & 7;
  const flags = (move >> 17) & 3;
  const piece = board[f];
  const us = side;
  const ptype = piece > 0 ? piece : -piece;
  let u = undoStack[ply];
  if (!u) u = undoStack[ply] = {};
  u.ep = epSq;
  u.hm = halfmove;
  u.fm = fullmove;
  u.rights = rights;
  u.kingW = kingW;
  u.kingB = kingB;
  u.h1 = h1;
  u.h2 = h2;
  u.ply = gamePly;
  let captured = 0;

  if (epIsRelevant(epSq)) xorEpFile(epSq & 7);
  xorRights(rights);

  if (flags & 2) {
    const base = us === WHITE ? 0 : 112;
    const kingside = t > f;
    const kt = base + (kingside ? 6 : 2);
    const rt = base + (kingside ? 5 : 3);
    const rook = board[t];
    xorPiece(piece, f);
    xorPiece(rook, t);
    board[f] = 0;
    board[t] = 0;
    board[kt] = us * K;
    board[rt] = us * R;
    xorPiece(us * K, kt);
    xorPiece(us * R, rt);
    if (us === WHITE) kingW = kt;
    else kingB = kt;
    epSq = -1;
    halfmove++;
    if (us === BLACK) fullmove++;
  } else {
    if (flags & 1) {
      const capSq = t - us * 16;
      captured = board[capSq];
      board[capSq] = 0;
      xorPiece(captured, capSq);
    } else if (board[t]) {
      captured = board[t];
      xorPiece(captured, t);
    }
    xorPiece(piece, f);
    board[f] = 0;
    const newPiece = promo ? us * promo : piece;
    board[t] = newPiece;
    xorPiece(newPiece, t);
    if (ptype === K) {
      if (us === WHITE) kingW = t;
      else kingB = t;
    }
    if (ptype === P && (t - f === us * 32)) {
      epSq = (f + t) >> 1;
    } else {
      epSq = -1;
    }
    if (ptype === P || captured) halfmove = 0;
    else halfmove++;
    if (us === BLACK) fullmove++;
    if (captured) decCount(captured);
    if (promo) {
      decCount(us * P);
      incCount(us * promo);
    }
  }

  const colorBit = us === WHITE ? 0 : 1;
  let changed = false;
  const nr = [];
  for (let i = 0; i < rights.length; i++) {
    const r = rights[i];
    const rColor = r & 1;
    const rs = (r >> 8) & 127;
    if ((rColor === colorBit && ptype === K) || rs === f || rs === t) {
      changed = true;
      continue;
    }
    nr.push(r);
  }
  if (changed) rights = nr;

  xorRights(rights);
  side = -us;
  xorSide();
  gamePly++;
  if (epIsRelevant(epSq)) xorEpFile(epSq & 7);
  u.captured = captured;
  repPush();
}

function unmakeMove(move, ply) {
  const u = undoStack[ply];
  const f = move & 127;
  const t = (move >> 7) & 127;
  const promo = (move >> 14) & 7;
  const flags = (move >> 17) & 3;
  const us = -side;
  side = us;
  if (flags & 2) {
    const base = us === WHITE ? 0 : 112;
    const kingside = t > f;
    const kt = base + (kingside ? 6 : 2);
    const rt = base + (kingside ? 5 : 3);
    board[kt] = 0;
    board[rt] = 0;
    board[f] = us * K;
    board[t] = us * R;
  } else {
    const piece = promo ? us * promo : board[t];
    board[t] = 0;
    board[f] = promo ? us * P : piece;
    if (flags & 1) {
      const capSq = t - us * 16;
      board[capSq] = u.captured;
    } else if (u.captured) {
      board[t] = u.captured;
    }
    if (u.captured) incCount(u.captured);
    if (promo) {
      decCount(us * promo);
      incCount(us * P);
    }
  }
  epSq = u.ep;
  halfmove = u.hm;
  fullmove = u.fm;
  rights = u.rights;
  kingW = u.kingW;
  kingB = u.kingB;
  h1 = u.h1;
  h2 = u.h2;
  gamePly = u.ply;
  repPop();
}

function makeNull(ply) {
  let u = undoStack[ply];
  if (!u) u = undoStack[ply] = {};
  u.ep = epSq;
  u.hm = halfmove;
  u.fm = fullmove;
  u.rights = rights;
  u.kingW = kingW;
  u.kingB = kingB;
  u.h1 = h1;
  u.h2 = h2;
  u.ply = gamePly;
  u.captured = 0;
  if (epIsRelevant(epSq)) xorEpFile(epSq & 7);
  epSq = -1;
  halfmove++;
  side = -side;
  xorSide();
  gamePly++;
  repH1[repLen] = 0x7f7f7f7f;
  repH2[repLen] = 0x7f7f7f7f;
  repHm[repLen] = 0;
  repLen++;
}

function unmakeNull(ply) {
  const u = undoStack[ply];
  side = -side;
  epSq = u.ep;
  halfmove = u.hm;
  fullmove = u.fm;
  rights = u.rights;
  kingW = u.kingW;
  kingB = u.kingB;
  h1 = u.h1;
  h2 = u.h2;
  gamePly = u.ply;
  repLen--;
}

function loadFen(fen, clearRep) {
  board.fill(0);
  resetCounts();
  kingW = -1;
  kingB = -1;
  rights = [];
  const fields = fen.trim().split(/\s+/);
  const rows = fields[0].split('/');
  if (rows.length !== 8) throw new Error('bad fen');
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
      } else {
        const type = PIECE_CHARS.indexOf(ch.toUpperCase());
        if (type < 1) throw new Error('bad piece');
        const color = ch === ch.toUpperCase() ? WHITE : BLACK;
        const s = (7 - r) * 16 + file;
        file++;
        const piece = color * type;
        board[s] = piece;
        if (type === K) {
          if (color === WHITE) kingW = s;
          else kingB = s;
        }
        addCount(piece);
      }
    }
  }
  side = fields[1] === 'w' ? WHITE : BLACK;
  halfmove = Number(fields[4]);
  fullmove = Number(fields[5]);
  parseRights(fields[2]);
  epSq = parseEp(fields[3]);
  computeHash();
  gamePly = 0;
  if (clearRep) {
    repLen = 0;
    repPush();
  }
}

function loadStateBoard(state) {
  board.fill(0);
  resetCounts();
  kingW = -1;
  kingB = -1;
  rights = [];
  const b = state.board;
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const label = b[row][file];
      if (!label) continue;
      const color = label[0] === 'w' ? WHITE : BLACK;
      const type = PIECE_CHARS.indexOf(label[1]);
      if (type < 1) continue;
      const s = (7 - row) * 16 + file;
      const piece = color * type;
      board[s] = piece;
      if (type === K) {
        if (color === WHITE) kingW = s;
        else kingB = s;
      }
      addCount(piece);
    }
  }
  const fields = state.fen.split(/\s+/);
  side = state.turn === 'w' ? WHITE : BLACK;
  halfmove = state.halfmoveClock;
  fullmove = state.moveNumber;
  parseRights(fields[2]);
  epSq = parseEp(fields[3]);
  computeHash();
  gamePly = 0;
}

function findMoveByUci(uci) {
  const list = [];
  const n = genMoves(list);
  for (let i = 0; i < n; i++) {
    if (moveToUci(list[i]) === uci) return list[i];
  }
  return 0;
}

function setupPosition(state) {
  variant = state.variant === 'chess960' ? 'chess960' : 'standard';
  let seeded = false;
  let replayH1 = 0;
  let replayH2 = 0;
  let replayHm = 0;
  try {
    loadFen(state.initialFen, true);
    let ok = true;
    for (let i = 0; i < state.history.length; i++) {
      const m = findMoveByUci(state.history[i]);
      if (!m) {
        ok = false;
        break;
      }
      makeMove(m, TEST_SLOT);
    }
    if (ok) {
      replayH1 = h1;
      replayH2 = h2;
      replayHm = halfmove;
      seeded = true;
    }
  } catch (e) {
    seeded = false;
  }
  loadStateBoard(state);
  if (!seeded || h1 !== replayH1 || h2 !== replayH2 || halfmove !== replayHm) {
    repLen = 0;
    repPush();
  }
  gamePly = state.ply;
  maxPlies = state.maxPlies;
}

function insufficient() {
  if (cntW[P] | cntW[R] | cntW[Q] | cntB[P] | cntB[R] | cntB[Q]) return false;
  const minors = cntW[N] + cntW[B] + cntB[N] + cntB[B];
  if (minors < 2) return true;
  if (cntW[N] + cntB[N] > 0) return false;
  let color = -1;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const p = board[s];
    if (p === B || p === -B) {
      const c = ((s & 7) + (s >> 4)) & 1;
      if (color < 0) color = c;
      else if (color !== c) return false;
    }
  }
  return true;
}

function hasNonPawnMaterial(color) {
  if (color === WHITE) return cntW[N] + cntW[B] + cntW[R] + cntW[Q] > 0;
  return cntB[N] + cntB[B] + cntB[R] + cntB[Q] > 0;
}

function hasLegalMove() {
  const list = [];
  const n = genMoves(list);
  for (let i = 0; i < n; i++) {
    const m = list[i];
    const us = side;
    makeMove(m, TEST_SLOT);
    const legal = !isAttacked(us === WHITE ? kingW : kingB, -us);
    unmakeMove(m, TEST_SLOT);
    if (legal) return true;
  }
  return false;
}

function kingShield(k, color) {
  if (k < 0) return 0;
  const rank = k >> 4;
  const file = k & 7;
  if (rank !== (color === WHITE ? 0 : 7)) return 0;
  let score = 0;
  for (let df = -1; df <= 1; df++) {
    const f = file + df;
    if (f < 0 || f > 7) continue;
    if (color === WHITE) {
      if (board[16 + f] === P) score += 10;
      else if (board[32 + f] === P) score += 5;
    } else {
      if (board[96 + f] === -P) score += 10;
      else if (board[80 + f] === -P) score += 5;
    }
  }
  return score;
}

function evaluate() {
  let score = 0;
  let wP = 0;
  let bP = 0;
  wPawnMask.fill(0);
  bPawnMask.fill(0);
  wFileCount.fill(0);
  bFileCount.fill(0);
  const phase = Math.min(24,
    4 * (cntW[Q] + cntB[Q]) + 2 * (cntW[R] + cntB[R]) +
    cntW[N] + cntB[N] + cntW[B] + cntB[B]);

  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const piece = board[s];
    if (!piece) continue;
    const white = piece > 0;
    const type = white ? piece : -piece;
    const rank = s >> 4;
    const file = s & 7;
    const idx = white ? (7 - rank) * 8 + file : rank * 8 + file;
    let v;
    if (type === K) {
      v = ((KING_MID_PST[idx] * phase + KING_END_PST[idx] * (24 - phase)) / 24) | 0;
    } else {
      v = VALUE[type] + PST[type][idx];
    }
    if (white) score += v;
    else score -= v;
    if (type === P) {
      if (white) {
        wPawns[wP++] = s;
        wPawnMask[file] |= 1 << rank;
        wFileCount[file]++;
      } else {
        bPawns[bP++] = s;
        bPawnMask[file] |= 1 << rank;
        bFileCount[file]++;
      }
    }
  }

  for (let i = 0; i < wP; i++) {
    const s = wPawns[i];
    const f = s & 7;
    const r = s >> 4;
    if (wFileCount[f] > 1) score -= 8;
    const adj = (f > 0 ? wFileCount[f - 1] : 0) + (f < 7 ? wFileCount[f + 1] : 0);
    if (adj === 0) score -= 14;
    let bits = 1 << r;
    if (r > 0) bits |= 1 << (r - 1);
    if (r < 7) bits |= 1 << (r + 1);
    let connected = false;
    if (f > 0 && (wPawnMask[f - 1] & bits)) connected = true;
    if (f < 7 && (wPawnMask[f + 1] & bits)) connected = true;
    if (connected) score += 5;
    let blocked = false;
    for (let df = -1; df <= 1; df++) {
      const ff = f + df;
      if (ff < 0 || ff > 7) continue;
      if (bPawnMask[ff] >> (r + 1)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) score += PASSED_BONUS[r];
  }

  for (let i = 0; i < bP; i++) {
    const s = bPawns[i];
    const f = s & 7;
    const r = s >> 4;
    if (bFileCount[f] > 1) score += 8;
    const adj = (f > 0 ? bFileCount[f - 1] : 0) + (f < 7 ? bFileCount[f + 1] : 0);
    if (adj === 0) score += 14;
    let bits = 1 << r;
    if (r > 0) bits |= 1 << (r - 1);
    if (r < 7) bits |= 1 << (r + 1);
    let connected = false;
    if (f > 0 && (bPawnMask[f - 1] & bits)) connected = true;
    if (f < 7 && (bPawnMask[f + 1] & bits)) connected = true;
    if (connected) score -= 5;
    let blocked = false;
    for (let df = -1; df <= 1; df++) {
      const ff = f + df;
      if (ff < 0 || ff > 7) continue;
      if (wPawnMask[ff] & ((1 << r) - 1)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) score -= PASSED_BONUS[7 - r];
  }

  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const piece = board[s];
    if (!piece) continue;
    const white = piece > 0;
    const type = white ? piece : -piece;
    const color = white ? WHITE : BLACK;
    const f = s & 7;
    const rank = s >> 4;
    let mob = 0;
    if (type === N) {
      for (let i = 0; i < 8; i++) {
        const to = s + KNIGHT_OFFSETS[i];
        if (to & 0x88) continue;
        const q = board[to];
        if (!q || (q > 0 ? WHITE : BLACK) !== color) mob++;
      }
    } else if (type === B || type === R || type === Q) {
      const dirs = type === B ? BISHOP_OFFSETS : type === R ? ROOK_OFFSETS : KING_OFFSETS;
      const count = type === Q ? 8 : 4;
      for (let i = 0; i < count; i++) {
        const d = dirs[i];
        for (let to = s + d; !(to & 0x88); to += d) {
          const q = board[to];
          if (!q) {
            mob++;
            continue;
          }
          if ((q > 0 ? WHITE : BLACK) !== color) mob++;
          break;
        }
      }
    }
    const weight = type === N ? 3 : type === B ? 3 : type === R ? 2 : type === Q ? 1 : 0;
    if (white) score += mob * weight;
    else score -= mob * weight;
    if (type === R) {
      if (white) {
        if ((wPawnMask[f] | bPawnMask[f]) === 0) score += 20;
        else if (wPawnMask[f] === 0) score += 10;
        if (rank === 6) score += 15;
      } else {
        if ((wPawnMask[f] | bPawnMask[f]) === 0) score -= 20;
        else if (bPawnMask[f] === 0) score -= 10;
        if (rank === 1) score -= 15;
      }
    }
  }

  if (cntW[B] >= 2) score += 30;
  if (cntB[B] >= 2) score -= 30;

  if (phase > 0) {
    score += (kingShield(kingW, WHITE) * phase / 24) | 0;
    score -= (kingShield(kingB, BLACK) * phase / 24) | 0;
  }

  return score * side + 8;
}

function checkTime() {
  if (Date.now() >= deadline) throw TIMEOUT;
}

function ttProbe(depth, alpha, beta, ply) {
  const idx = (h1 >>> 0) & TT_MASK;
  ttMoveOut = 0;
  if (ttFlag[idx] === 0 || ttKey[idx] !== h2) return TT_MISS;
  ttMoveOut = ttMove[idx];
  if (ttDepth[idx] >= depth) {
    let score = ttScore[idx];
    if (score > MATE_THRESHOLD) score -= ply;
    else if (score < -MATE_THRESHOLD) score += ply;
    const flag = ttFlag[idx];
    if (flag === 1) return score;
    if (flag === 2 && score >= beta) return score;
    if (flag === 3 && score <= alpha) return score;
  }
  return TT_MISS;
}

function ttStore(depth, score, flag, move, ply) {
  const idx = (h1 >>> 0) & TT_MASK;
  if (ttFlag[idx] !== 0 && ttDepth[idx] > depth + 2) return;
  let s = score;
  if (s > MATE_THRESHOLD) s += ply;
  else if (s < -MATE_THRESHOLD) s -= ply;
  ttKey[idx] = h2;
  ttDepth[idx] = depth;
  ttFlag[idx] = flag;
  ttScore[idx] = s;
  ttMove[idx] = move;
}

function orderPacked(list, n, preferred, ply) {
  for (let i = 0; i < n; i++) {
    const m = list[i];
    let s = 0;
    if (m === preferred) {
      s = 4000;
    } else {
      const f = m & 127;
      const t = (m >> 7) & 127;
      const promo = (m >> 14) & 7;
      const flags = (m >> 17) & 3;
      let victimType = 0;
      if (flags & 1) victimType = P;
      else if (board[t]) victimType = board[t] > 0 ? board[t] : -board[t];
      if (victimType) {
        const atk = board[f] > 0 ? board[f] : -board[f];
        s = 1000 + VALUE[victimType] - ((VALUE[atk] / 10) | 0);
      }
      if (promo) s += 800 + VALUE[promo];
      if (!victimType && !promo) {
        if (m === killer1[ply]) s = 700;
        else if (m === killer2[ply]) s = 600;
        else {
          const idx = f * 128 + t;
          s = historyTable[idx] > 400 ? 400 : historyTable[idx];
        }
      }
    }
    if (s > 4000) s = 4000;
    list[i] = m | (s << SCORE_SHIFT);
  }
  list.length = n;
  list.sort((a, b) => b - a);
}

function quiesce(alpha, beta, ply) {
  nodes++;
  if ((nodes & 1023) === 0) checkTime();
  if (ply >= MAX_PLY - 4) return evaluate();

  const inCheck = isAttacked(kingSq(), -side);
  if (halfmove >= 100 || gamePly >= maxPlies || insufficient()) {
    if (hasLegalMove()) return 0;
    return inCheck ? -MATE + ply : 0;
  }
  if (halfmove >= 4 && isRepetition()) return 0;

  if (!inCheck) {
    let stand = evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const list = moveBuf[ply];
    const n = genMoves(list);
    let qn = 0;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      const t = (m >> 7) & 127;
      const promo = (m >> 14) & 7;
      const flags = (m >> 17) & 3;
      if ((flags & 1) || board[t] || promo) list[qn++] = m;
    }
    orderPacked(list, qn, 0, ply);
    for (let i = 0; i < qn; i++) {
      const move = list[i] & MOVE_MASK;
      const t = (move >> 7) & 127;
      const promo = (move >> 14) & 7;
      const flags = (move >> 17) & 3;
      const victim = (flags & 1) ? P : (board[t] ? (board[t] > 0 ? board[t] : -board[t]) : 0);
      if (!promo && victim && stand + VALUE[victim] + 200 < alpha) continue;
      const us = side;
      makeMove(move, ply);
      if (isAttacked(us === WHITE ? kingW : kingB, -us)) {
        unmakeMove(move, ply);
        continue;
      }
      const score = -quiesce(-beta, -alpha, ply + 1);
      unmakeMove(move, ply);
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) return beta;
      }
    }
    return alpha;
  }

  const list = moveBuf[ply];
  const n = genMoves(list);
  orderPacked(list, n, 0, ply);
  let best = -INF;
  let legalCount = 0;
  for (let i = 0; i < n; i++) {
    const move = list[i] & MOVE_MASK;
    const us = side;
    makeMove(move, ply);
    if (isAttacked(us === WHITE ? kingW : kingB, -us)) {
      unmakeMove(move, ply);
      continue;
    }
    legalCount++;
    const score = -quiesce(-beta, -alpha, ply + 1);
    unmakeMove(move, ply);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) return beta;
  }
  if (legalCount === 0) return -MATE + ply;
  return best;
}

function kingSq() {
  return side === WHITE ? kingW : kingB;
}

function negamax(depth, alpha, beta, ply, canNull) {
  nodes++;
  if ((nodes & 1023) === 0) checkTime();
  if (ply >= MAX_PLY - 4) return evaluate();

  if (halfmove >= 4 && isRepetition()) return 0;
  const inCheck = isAttacked(kingSq(), -side);
  if (halfmove >= 100 || gamePly >= maxPlies) {
    if (hasLegalMove()) return 0;
    return inCheck ? -MATE + ply : 0;
  }
  if (insufficient()) return 0;
  if (depth <= 0) return quiesce(alpha, beta, ply);
  if (inCheck) depth++;

  const ttVal = ttProbe(depth, alpha, beta, ply);
  const ttBest = ttMoveOut;
  if (ttVal !== TT_MISS) return ttVal;

  if (canNull && !inCheck && depth >= 3 && hasNonPawnMaterial(side) &&
      gamePly < maxPlies - 8) {
    const reduction = depth >= 6 ? 3 : 2;
    makeNull(ply);
    const score = -negamax(depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
    unmakeNull(ply);
    if (score >= beta) return beta;
  }

  const list = moveBuf[ply];
  const n = genMoves(list);
  if (n === 0) return inCheck ? -MATE + ply : 0;
  orderPacked(list, n, ttBest, ply);

  const alphaOrig = alpha;
  let best = -INF;
  let bestMove = 0;
  let legalCount = 0;

  for (let i = 0; i < n; i++) {
    const packed = list[i];
    const move = packed & MOVE_MASK;
    const f = move & 127;
    const t = (move >> 7) & 127;
    const promo = (move >> 14) & 7;
    const flags = (move >> 17) & 3;
    const isQuiet = !(flags & 1) && !board[t] && !promo;
    const us = side;
    makeMove(move, ply);
    if (isAttacked(us === WHITE ? kingW : kingB, -us)) {
      unmakeMove(move, ply);
      continue;
    }
    legalCount++;
    let score;
    if (legalCount === 1) {
      score = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
    } else {
      let reduction = 0;
      if (depth >= 3 && legalCount > 4 && isQuiet && !inCheck) {
        reduction = 1;
        if (depth >= 6 && legalCount > 10) reduction = 2;
      }
      score = -negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && reduction) {
        score = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
      }
      if (score > alpha && score < beta) {
        score = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
    }
    unmakeMove(move, ply);
    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (isQuiet) {
        if (move !== killer1[ply]) {
          killer2[ply] = killer1[ply];
          killer1[ply] = move;
        }
        const idx = f * 128 + t;
        historyTable[idx] += depth * depth;
        if (historyTable[idx] > 100000) historyTable[idx] = 100000;
      }
      break;
    }
  }

  if (legalCount === 0) return inCheck ? -MATE + ply : 0;
  const flag = best <= alphaOrig ? 3 : best >= beta ? 2 : 1;
  ttStore(depth, best, flag, bestMove, ply);
  return best;
}

function perft(depth, ply) {
  if (depth === 0) return 1;
  const list = [];
  const n = genMoves(list);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const m = list[i];
    const us = side;
    makeMove(m, ply);
    if (!isAttacked(us === WHITE ? kingW : kingB, -us)) {
      count += perft(depth - 1, ply + 1);
    }
    unmakeMove(m, ply);
  }
  return count;
}

function legalUcis() {
  const list = [];
  const n = genMoves(list);
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = list[i];
    const us = side;
    makeMove(m, TEST_SLOT);
    const legal = !isAttacked(us === WHITE ? kingW : kingB, -us);
    unmakeMove(m, TEST_SLOT);
    if (legal) out.push(moveToUci(m));
  }
  return out;
}

function chooseMove(state) {
  const start = Date.now();
  const limit = state.timeLimitMs || 1000;
  const budget = Math.min(700, Math.max(50, limit - 250));
  deadline = start + budget;
  nodes = 0;

  try {
    setupPosition(state);
  } catch (e) {
    return state.legalMoves[0];
  }

  for (let i = 0; i < MAX_PLY + 4; i++) {
    killer1[i] = 0;
    killer2[i] = 0;
  }
  for (let i = 0; i < historyTable.length; i++) historyTable[i] >>= 1;

  let bestMove = 0;
  const rootIdx = (h1 >>> 0) & TT_MASK;
  const rootTT = (ttFlag[rootIdx] !== 0 && ttKey[rootIdx] === h2) ? ttMove[rootIdx] : 0;

  try {
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const list = [];
      const n = genMoves(list);
      if (n === 0) break;
      orderPacked(list, n, bestMove || rootTT, 0);
      let alpha = -INF;
      const beta = INF;
      let iterBest = 0;
      let iterScore = -INF;
      let legalCount = 0;
      for (let i = 0; i < n; i++) {
        const move = list[i] & MOVE_MASK;
        const us = side;
        makeMove(move, 0);
        if (isAttacked(us === WHITE ? kingW : kingB, -us)) {
          unmakeMove(move, 0);
          continue;
        }
        legalCount++;
        let score;
        if (legalCount === 1) {
          score = -negamax(depth - 1, -beta, -alpha, 1, true);
        } else {
          score = -negamax(depth - 1, -alpha - 1, -alpha, 1, true);
          if (score > alpha && score < beta) {
            score = -negamax(depth - 1, -beta, -alpha, 1, true);
          }
        }
        unmakeMove(move, 0);
        if (score > iterScore) {
          iterScore = score;
          iterBest = move;
          bestMove = move;
        }
        if (score > alpha) alpha = score;
      }
      if (legalCount === 0) break;
      bestMove = iterBest;
      lastInfo = { depth, score: iterScore, nodes, time: Date.now() - start };
      if (iterScore > MATE_THRESHOLD || iterScore < -MATE_THRESHOLD) break;
      if (Date.now() >= deadline) break;
    }
  } catch (e) {
    if (e !== TIMEOUT) {
      if (bestMove) {
        const uci = moveToUci(bestMove);
        for (let i = 0; i < state.legalMoves.length; i++) {
          if (state.legalMoves[i] === uci) return uci;
        }
      }
      return state.legalMoves[0];
    }
  }

  if (bestMove) {
    const uci = moveToUci(bestMove);
    for (let i = 0; i < state.legalMoves.length; i++) {
      if (state.legalMoves[i] === uci) return uci;
    }
  }
  return state.legalMoves[0];
}

function move(state) {
  if (!state || !state.legalMoves || state.legalMoves.length === 0) return undefined;
  try {
    return chooseMove(state);
  } catch (e) {
    return state.legalMoves[0];
  }
}

module.exports = {
  name: 'Aizanoi-DeepSeek',
  botName: 'Aizanoi-DeepSeek',
  move,
  _test: {
    setVariant(v) { variant = v; },
    loadFen,
    loadStateBoard,
    perft,
    moveToUci,
    evaluate,
    genMoves,
    legalUcis,
    makeMove,
    unmakeMove,
    debugState() {
      return {
        board: Array.from(board),
        cntW: Array.from(cntW),
        cntB: Array.from(cntB),
        side,
        halfmove,
        fullmove,
        gamePly,
        h1,
        h2,
        rights: rights.slice(),
        kingW,
        kingB,
        epSq
      };
    },
    setupPosition,
    chooseMove,
    lastInfo() { return lastInfo; }
  }
};
