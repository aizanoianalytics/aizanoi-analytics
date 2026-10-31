'use strict';

const KNIGHT_D = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_D = [-17, -15, 15, 17];
const ROOK_D = [-16, -1, 1, 16];
const KING_D = [-17, -15, 15, 17, -16, -1, 1, 16];

const MG_VAL = [0, 100, 320, 330, 500, 900, 0];
const EG_VAL = [0, 115, 315, 340, 545, 950, 0];
const PHASE_VAL = [0, 0, 1, 1, 2, 4, 0];
const MATE = 100000;
const MATE_BOUND = MATE - 500;
const INF = 1 << 30;

const MG_P = [
  0, 0, 0, 0, 0, 0, 0, 0,
  98, 134, 61, 95, 68, 126, 34, -11,
  -6, 7, 26, 31, 65, 56, 25, -20,
  -14, 13, 6, 21, 23, 12, 17, -23,
  -27, -2, -5, 12, 17, 6, 10, -25,
  -26, -4, -4, -10, 3, 3, 33, -12,
  -35, -1, -20, -23, -15, 24, 38, -22,
  0, 0, 0, 0, 0, 0, 0, 0
];
const EG_P = [
  0, 0, 0, 0, 0, 0, 0, 0,
  178, 173, 158, 134, 147, 132, 165, 187,
  94, 100, 85, 67, 56, 53, 82, 84,
  32, 24, 13, 5, -2, 4, 17, 17,
  13, 9, -3, -7, -7, -8, 3, -1,
  4, 7, -3, -10, -5, -4, 8, 3,
  -6, 5, 4, -11, -12, -3, 5, 1,
  0, 0, 0, 0, 0, 0, 0, 0
];
const MG_N = [
  -105, -21, -58, -33, -17, -28, -19, -23,
  -29, -53, -12, -3, -1, 18, -14, -19,
  -23, -9, 12, 10, 19, 17, 25, -16,
  -13, 4, 16, 13, 28, 19, 21, -8,
  -9, 17, 19, 53, 37, 69, 18, 22,
  -47, 60, 37, 65, 84, 129, 73, 44,
  -73, -41, 72, 36, 23, 62, 7, -17,
  -167, -89, -34, -49, 61, -97, -15, -107
];
const EG_N = [
  -29, -51, -23, -15, -22, -18, -50, -64,
  -42, -20, -10, -5, -2, -20, -23, -44,
  -23, -3, -1, 15, 10, -3, -20, -22,
  -18, -6, 16, 25, 16, 17, 4, -18,
  -17, 3, 22, 22, 22, 11, 8, -18,
  -24, -20, 10, 9, -1, -9, -19, -41,
  -25, -8, -25, -2, -9, -25, -24, -52,
  -58, -38, -13, -28, -31, -27, -63, -99
];
const MG_B = [
  -33, -3, -14, -21, -13, -12, -39, -21,
  4, 15, 16, 0, 7, 21, 33, 1,
  0, 15, 15, 15, 14, 27, 18, 10,
  -6, 13, 13, 26, 34, 12, 10, 4,
  -4, 5, 19, 50, 37, 37, 7, -2,
  -16, 37, 43, 40, 35, 50, 37, -2,
  -26, 16, -18, -13, 30, 59, 18, -47,
  -29, 4, -82, -37, -25, -42, 7, -8
];
const EG_B = [
  -14, -21, -11, -8, -7, -9, -17, -24,
  -8, -4, 7, -12, -3, -13, -4, -14,
  2, -8, 0, -1, -2, 6, 0, 4,
  -3, 9, 12, 9, 14, 10, 3, 2,
  -6, 3, 13, 19, 7, 10, -3, -9,
  -12, -3, 8, 10, 13, 3, -7, -15,
  -14, -18, -7, -1, 4, -9, -15, -27,
  -23, -9, -23, -5, -9, -16, -5, -17
];
const MG_R = [
  32, 42, 32, 51, 63, 9, 31, 43,
  27, 32, 58, 62, 80, 67, 26, 44,
  -5, 19, 26, 36, 17, 45, 61, 16,
  -24, -11, 7, 26, 24, 35, -8, -20,
  -36, -26, -12, -1, 9, -7, 6, -23,
  -45, -25, -16, -17, 3, 0, -5, -33,
  -44, -16, -20, -9, -1, 11, -6, -71,
  -19, -13, 1, 17, 16, 7, -37, -26
];
const EG_R = [
  13, 10, 18, 15, 12, 12, 8, 5,
  11, 13, 13, 11, -3, 3, 8, 3,
  7, 7, 7, 5, 4, -3, -5, -3,
  4, 3, 13, 1, 2, 1, -1, 2,
  3, 5, 8, 4, -5, -6, -8, -11,
  -4, 0, -5, -1, -7, -12, -8, -16,
  -6, -6, 0, 2, -9, -9, -11, -3,
  -9, 2, 3, -1, -5, -13, 4, -20
];
const MG_Q = [
  -28, 0, 29, 12, 59, 44, 43, 45,
  -24, -39, -5, 1, -16, 57, 28, 54,
  -13, -17, 7, 8, 29, 56, 47, 57,
  -27, -27, -16, -16, -1, 17, -2, 1,
  -9, -26, -9, -10, -2, -4, 3, -3,
  -14, 2, -11, -2, -5, 2, 14, 5,
  -35, -8, 11, 2, 8, 15, -3, 1,
  -1, -18, -9, 10, -15, -25, -31, -50
];
const EG_Q = [
  -9, 22, 22, 27, 27, 19, 10, 20,
  -17, 20, 32, 41, 58, 25, 30, 0,
  -20, 6, 9, 49, 47, 35, 19, 9,
  3, 22, 24, 45, 57, 40, 57, 36,
  -18, 28, 19, 47, 31, 34, 39, 23,
  -16, -27, 15, 6, 9, 17, 10, 5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43, -5, -32, -20, -41
];
const MG_K = [
  65, 23, 16, -15, -56, -34, 2, 13,
  29, -1, -20, -7, -8, -4, -38, -29,
  -9, 24, 2, -16, -20, 6, 22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49, -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
  1, 7, -8, -64, -43, -16, 9, 8,
  15, 17, 4, 17, 16, 5, -3, 11
];
const EG_K = [
  -74, -35, -18, -18, -11, 15, 4, -17,
  -12, 17, 14, 17, 17, 38, 23, 11,
  10, 17, 23, 15, 20, 45, 44, 13,
  -8, 22, 24, 27, 26, 33, 26, 3,
  -18, -4, 21, 24, 27, 23, 9, -11,
  -19, -3, 11, 21, 23, 16, 7, -9,
  -27, -11, 4, 13, 14, 4, -5, -17,
  -53, -34, -21, -11, -28, -14, -24, -43
];

const MG_PST = [null, MG_P, MG_N, MG_B, MG_R, MG_Q, MG_K];
const EG_PST = [null, EG_P, EG_N, EG_B, EG_R, EG_Q, EG_K];
const PASSED = [0, 8, 14, 26, 48, 82, 130, 0];
const PROMO_CH = ['n', 'n', 'n', 'b', 'r', 'q'];

const FLAG_EP = 1;
const FLAG_CASTLE = 2;
const FLAG_DOUBLE = 4;

function sqName(s) {
  return String.fromCharCode(97 + (s & 7)) + String.fromCharCode(49 + (s >> 4));
}

function uciOf(move) {
  const promo = (move >> 14) & 7;
  return sqName(move & 127) + sqName((move >> 7) & 127) +
    (promo ? PROMO_CH[promo] : '');
}

const Z_PIECE = [];
const Z_SIDE = 0x1a2b3c4d | 0;
const Z_RW = new Int32Array(8);
const Z_RB = new Int32Array(8);
const Z_EP = new Int32Array(8);
(function initZobrist() {
  let s = 0x9e3779b9 | 0;
  function rnd() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return s;
  }
  for (let p = 0; p < 13; p++) {
    const row = new Int32Array(128);
    for (let i = 0; i < 128; i++) row[i] = rnd();
    Z_PIECE.push(row);
  }
  for (let f = 0; f < 8; f++) {
    Z_RW[f] = rnd();
    Z_RB[f] = rnd();
    Z_EP[f] = rnd();
  }
})();

function zIdx(piece) { return piece + 6; }

class Position {
  constructor() {
    this.board = new Int8Array(128);
    this.kings = new Int32Array(2);
    this.side = 1;
    this.rightsW = 0;
    this.rightsB = 0;
    this.ep = -1;
    this.epKey = -1;
    this.halfmove = 0;
    this.ply = 0;
    this.maxPlies = 400;
    this.baseHash = 0;
    this.repCounts = new Map();
    this.path = new Int32Array(512);
    this.pc = new Int8Array(14);
    this.undoStack = [];
    for (let i = 0; i < 512; i++) {
      this.undoStack.push({
        cap: 0, capSq: -1, rw: 0, rb: 0, ep: -1, epKey: -1,
        half: 0, hash: 0, ply: 0, kw: 0, kb: 0
      });
    }
  }

  key() {
    return (this.baseHash ^ (this.epKey >= 0 ? Z_EP[this.epKey] : 0)) | 0;
  }

  load(fen, maxPlies) {
    const b = this.board;
    b.fill(0);
    this.kings[0] = -1;
    this.kings[1] = -1;
    this.pc.fill(0);
    const fields = fen.trim().split(/\s+/);
    const rows = fields[0].split('/');
    for (let r = 0; r < 8; r++) {
      let file = 0;
      const rank = 7 - r;
      for (let i = 0; i < rows[r].length; i++) {
        const ch = rows[r][i];
        if (ch >= '1' && ch <= '8') file += ch.charCodeAt(0) - 48;
        else {
          const type = ' PNBRQK'.indexOf(ch.toUpperCase());
          const piece = (ch === ch.toUpperCase() ? 1 : -1) * type;
          const idx = rank * 16 + file++;
          b[idx] = piece;
          if (type === 6) this.kings[piece > 0 ? 0 : 1] = idx;
          this.pc[zIdx(piece)]++;
        }
      }
    }
    this.side = fields[1] === 'w' ? 1 : -1;
    this.halfmove = Number(fields[4]);
    this.ply = 0;
    this.maxPlies = maxPlies;
    this.rightsW = 0;
    this.rightsB = 0;
    if (fields[2] !== '-') {
      for (const ch of fields[2]) {
        const white = ch === ch.toUpperCase();
        const upper = ch.toUpperCase();
        let file;
        if (upper === 'K') file = 7;
        else if (upper === 'Q') file = 0;
        else file = upper.charCodeAt(0) - 65;
        if (white) this.rightsW |= 1 << file;
        else this.rightsB |= 1 << file;
      }
    }
    this.ep = fields[3] === '-' ? -1 :
      (Number(fields[3][1]) - 1) * 16 + (fields[3].charCodeAt(0) - 97);
    this.baseHash = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p) this.baseHash ^= Z_PIECE[zIdx(p)][s];
    }
    if (this.side === -1) this.baseHash ^= Z_SIDE;
    for (let f = 0; f < 8; f++) {
      if (this.rightsW & (1 << f)) this.baseHash ^= Z_RW[f];
      if (this.rightsB & (1 << f)) this.baseHash ^= Z_RB[f];
    }
    this.epKey = -1;
    if (this.ep >= 0 && this.hasEpAttacker()) this.epKey = this.ep & 7;
    this.repCounts = new Map();
    this.repCounts.set(this.key(), 1);
    this.path.fill(0);
  }

  hasEpAttacker() {
    const mid = this.ep;
    const them = this.side;
    const victimSq = mid - them * 16;
    if (mid & 0x88) return false;
    if (this.board[victimSq] !== -them) return false;
    for (let i = 0; i < 2; i++) {
      const from = mid + (i === 0 ? -1 : 1);
      if (from & 0x88) continue;
      if (this.board[from] !== them) continue;
      this.board[from] = 0;
      this.board[mid] = them;
      this.board[victimSq] = 0;
      const ok = !this.isAttacked(this.kings[them === 1 ? 0 : 1], -them);
      this.board[from] = them;
      this.board[mid] = 0;
      this.board[victimSq] = -them;
      if (ok) return true;
    }
    return false;
  }

  inCheck() {
    return this.isAttacked(this.kings[this.side === 1 ? 0 : 1], -this.side);
  }

  isAttacked(sq, by) {
    const b = this.board;
    let from;
    const pawn = by;
    from = sq - (by === 1 ? 15 : -15);
    if (!(from & 0x88) && b[from] === pawn) return true;
    from = sq - (by === 1 ? 17 : -17);
    if (!(from & 0x88) && b[from] === pawn) return true;
    const kn = by * 2, kg = by * 6;
    for (let i = 0; i < 8; i++) {
      from = sq + KNIGHT_D[i];
      if (!(from & 0x88) && b[from] === kn) return true;
    }
    for (let i = 0; i < 8; i++) {
      from = sq + KING_D[i];
      if (!(from & 0x88) && b[from] === kg) return true;
    }
    const bq = by * 3, rq = by * 4, qu = by * 5;
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_D[i];
      from = sq + d;
      while (!(from & 0x88)) {
        const p = b[from];
        if (p) { if (p === bq || p === qu) return true; break; }
        from += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ROOK_D[i];
      from = sq + d;
      while (!(from & 0x88)) {
        const p = b[from];
        if (p) { if (p === rq || p === qu) return true; break; }
        from += d;
      }
    }
    return false;
  }

  insufficient() {
    if (this.pc[1 + 6] || this.pc[-1 + 6]) return false;
    if (this.pc[4 + 6] || this.pc[-4 + 6]) return false;
    if (this.pc[5 + 6] || this.pc[-5 + 6]) return false;
    let minors = 0, bishops = 0, light = 0, dark = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.board[s];
      if (!p || Math.abs(p) === 6) continue;
      if (Math.abs(p) !== 2 && Math.abs(p) !== 3) return false;
      minors++;
      if (Math.abs(p) === 3) {
        bishops++;
        if ((((s & 7) + (s >> 4)) & 1) === 0) light = 1; else dark = 1;
      }
    }
    if (minors < 2) return true;
    return bishops === minors && (light === 0 || dark === 0);
  }

  make(move) {
    const from = move & 127;
    const to = (move >> 7) & 127;
    const promo = (move >> 14) & 7;
    const flags = (move >> 17) & 7;
    const b = this.board;
    const us = this.side;
    const them = -us;
    const piece = b[from];
    const type = Math.abs(piece);
    const u = this.undoStack[this.ply];
    u.cap = 0;
    u.capSq = -1;
    u.rw = this.rightsW;
    u.rb = this.rightsB;
    u.ep = this.ep;
    u.epKey = this.epKey;
    u.half = this.halfmove;
    u.hash = this.baseHash;
    u.ply = this.ply;
    u.kw = this.kings[0];
    u.kb = this.kings[1];
    let cap = 0, capSq = -1;
    if (flags & FLAG_CASTLE) {
      const base = us === 1 ? 0 : 112;
      const kingside = to > from;
      const kt = base + (kingside ? 6 : 2);
      const rt = base + (kingside ? 5 : 3);
      b[from] = 0;
      b[to] = 0;
      b[kt] = us * 6;
      b[rt] = us * 4;
      this.kings[us === 1 ? 0 : 1] = kt;
      this.baseHash ^= Z_PIECE[zIdx(us * 6)][from];
      this.baseHash ^= Z_PIECE[zIdx(us * 6)][kt];
      this.baseHash ^= Z_PIECE[zIdx(us * 4)][to];
      this.baseHash ^= Z_PIECE[zIdx(us * 4)][rt];
    } else {
      if (flags & FLAG_EP) {
        capSq = to - us * 16;
        cap = b[capSq];
        b[capSq] = 0;
        this.baseHash ^= Z_PIECE[zIdx(cap)][capSq];
        this.pc[zIdx(cap)]--;
      } else {
        cap = b[to];
        capSq = to;
        if (cap) {
          this.baseHash ^= Z_PIECE[zIdx(cap)][to];
          this.pc[zIdx(cap)]--;
        }
      }
      u.cap = cap;
      u.capSq = capSq;
      b[from] = 0;
      const placed = promo ? us * promo : piece;
      b[to] = placed;
      this.baseHash ^= Z_PIECE[zIdx(piece)][from];
      this.baseHash ^= Z_PIECE[zIdx(placed)][to];
      this.pc[zIdx(piece)]--;
      this.pc[zIdx(placed)]++;
      if (type === 6) this.kings[us === 1 ? 0 : 1] = to;
    }
    if (type === 6) {
      if (us === 1) {
        for (let f = 0; f < 8; f++) {
          if (this.rightsW & (1 << f)) this.baseHash ^= Z_RW[f];
        }
        this.rightsW = 0;
      } else {
        for (let f = 0; f < 8; f++) {
          if (this.rightsB & (1 << f)) this.baseHash ^= Z_RB[f];
        }
        this.rightsB = 0;
      }
    }
    const homeRank = us === 1 ? 0 : 112;
    if ((from & 0x70) === homeRank) {
      const bit = 1 << (from & 7);
      if (us === 1) {
        if (this.rightsW & bit) { this.rightsW &= ~bit; this.baseHash ^= Z_RW[from & 7]; }
      } else {
        if (this.rightsB & bit) { this.rightsB &= ~bit; this.baseHash ^= Z_RB[from & 7]; }
      }
    }
    if ((to & 0x70) === homeRank) {
      const bit = 1 << (to & 7);
      if (us === 1) {
        if (this.rightsW & bit) { this.rightsW &= ~bit; this.baseHash ^= Z_RW[to & 7]; }
      } else {
        if (this.rightsB & bit) { this.rightsB &= ~bit; this.baseHash ^= Z_RB[to & 7]; }
      }
    }
    this.ep = (flags & FLAG_DOUBLE) ? ((from + to) >> 1) : -1;
    this.epKey = -1;
    if (this.ep >= 0 && this.hasEpAttacker()) this.epKey = this.ep & 7;
    this.halfmove = (type === 1 || cap) ? 0 : this.halfmove + 1;
    this.baseHash ^= Z_SIDE;
    this.side = them;
    this.ply++;
  }

  unmake(move) {
    const u = this.undoStack[this.ply - 1];
    const mover = -this.side;
    const b = this.board;
    const from = move & 127;
    const to = (move >> 7) & 127;
    const promo = (move >> 14) & 7;
    const flags = (move >> 17) & 7;
    if (flags & FLAG_CASTLE) {
      const base = mover === 1 ? 0 : 112;
      const kingside = to > from;
      const kt = base + (kingside ? 6 : 2);
      const rt = base + (kingside ? 5 : 3);
      b[kt] = 0;
      b[rt] = 0;
      b[from] = mover * 6;
      b[to] = mover * 4;
    } else {
      const piece = b[to];
      b[to] = 0;
      b[from] = promo ? mover * 1 : piece;
      if (u.cap) b[u.capSq] = u.cap;
    }
    this.rightsW = u.rw;
    this.rightsB = u.rb;
    this.ep = u.ep;
    this.epKey = u.epKey;
    this.halfmove = u.half;
    this.baseHash = u.hash;
    this.kings[0] = u.kw;
    this.kings[1] = u.kb;
    this.side = -this.side;
    this.ply = u.ply;
  }

  makeNull() {
    const u = this.undoStack[this.ply];
    u.cap = 0; u.capSq = -1; u.rw = this.rightsW; u.rb = this.rightsB;
    u.ep = this.ep; u.epKey = this.epKey; u.half = this.halfmove;
    u.hash = this.baseHash; u.ply = this.ply;
    u.kw = this.kings[0]; u.kb = this.kings[1];
    this.baseHash ^= Z_SIDE;
    this.ep = -1;
    this.epKey = -1;
    this.halfmove++;
    this.side = -this.side;
    this.ply++;
  }

  unmakeNull() {
    const u = this.undoStack[this.ply - 1];
    this.side = -this.side;
    this.ply = u.ply;
    this.rightsW = u.rw;
    this.rightsB = u.rb;
    this.ep = u.ep;
    this.epKey = u.epKey;
    this.halfmove = u.half;
    this.baseHash = u.hash;
    this.kings[0] = u.kw;
    this.kings[1] = u.kb;
  }

  genPseudo(capturesOnly) {
    const out = [];
    const b = this.board;
    const us = this.side;
    const them = -us;
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const piece = b[from];
      if (!piece || (piece > 0 ? 1 : -1) !== us) continue;
      const type = Math.abs(piece);
      if (type === 1) {
        const step = us * 16;
        const to = from + step;
        if (!(to & 0x88) && !b[to]) {
          if (!capturesOnly) {
            if ((to >> 4) === 0 || (to >> 4) === 7) {
              for (let p = 5; p >= 2; p--) out.push(from | (to << 7) | (p << 14));
            } else {
              out.push(from | (to << 7));
              if ((from >> 4) === (us === 1 ? 1 : 6) && !b[to + step]) {
                out.push(from | ((to + step) << 7) | (FLAG_DOUBLE << 17));
              }
            }
          }
        }
        for (let i = 0; i < 2; i++) {
          const d = step + (i === 0 ? -1 : 1);
          const dest = from + d;
          if (dest & 0x88) continue;
          const target = b[dest];
          if (target && (target > 0 ? 1 : -1) === them && Math.abs(target) !== 6) {
            if ((dest >> 4) === 0 || (dest >> 4) === 7) {
              for (let p = 5; p >= 2; p--) out.push(from | (dest << 7) | (p << 14));
            } else {
              out.push(from | (dest << 7));
            }
          } else if (!target && dest === this.ep && b[dest - step] === them) {
            out.push(from | (dest << 7) | (FLAG_EP << 17));
          }
        }
        continue;
      }
      const dirs = type === 2 ? KNIGHT_D : type === 3 ? BISHOP_D :
        type === 4 ? ROOK_D : KING_D;
      const slide = type >= 3 && type <= 5;
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        let to = from + d;
        while (!(to & 0x88)) {
          const target = b[to];
          if (target && (target > 0 ? 1 : -1) === us) break;
          if (target) {
            if (Math.abs(target) !== 6) out.push(from | (to << 7));
            break;
          }
          if (!capturesOnly) out.push(from | (to << 7));
          if (!slide) break;
          to += d;
        }
      }
    }
    if (!capturesOnly) {
      const rights = us === 1 ? this.rightsW : this.rightsB;
      if (rights) {
        const base = us === 1 ? 0 : 112;
        const k = this.kings[us === 1 ? 0 : 1];
        if ((k & 0x70) === base && b[k] === us * 6) {
          const kf = k & 7;
          for (let f = 0; f < 8; f++) {
            if (!(rights & (1 << f))) continue;
            const r = base + f;
            if (b[r] !== us * 4 || r === k) continue;
            const kingside = f > kf;
            const kt = base + (kingside ? 6 : 2);
            const rt = base + (kingside ? 5 : 3);
            let ok = true;
            const pairs = [[k, kt], [r, rt]];
            for (let pi = 0; pi < 2; pi++) {
              const lo = Math.min(pairs[pi][0], pairs[pi][1]);
              const hi = Math.max(pairs[pi][0], pairs[pi][1]);
              for (let s = lo; s <= hi; s++) {
                if (s !== k && s !== r && b[s]) { ok = false; break; }
              }
              if (!ok) break;
            }
            if (!ok) continue;
            if (this.isAttacked(k, them)) continue;
            b[k] = 0;
            const step = Math.sign(kt - k);
            let safe = true;
            if (step) {
              for (let s = k + step; s !== kt; s += step) {
                if (this.isAttacked(s, them)) { safe = false; break; }
              }
            }
            b[k] = us * 6;
            if (safe) out.push(k | (r << 7) | (FLAG_CASTLE << 17));
          }
        }
      }
    }
    return out;
  }

  legalMoves() {
    const legal = [];
    const pseudo = this.genPseudo(false);
    const us = this.side;
    const kidx = us === 1 ? 0 : 1;
    for (let i = 0; i < pseudo.length; i++) {
      const move = pseudo[i];
      this.make(move);
      if (!this.isAttacked(this.kings[kidx], -us)) legal.push(move);
      this.unmake(move);
    }
    return legal;
  }
}

const pawnWCount = new Int8Array(8);
const pawnBCount = new Int8Array(8);
const pawnWMin = new Int8Array(8);
const pawnWMax = new Int8Array(8);
const pawnBMin = new Int8Array(8);
const pawnBMax = new Int8Array(8);
const rookWFiles = new Int8Array(8);
const rookBFiles = new Int8Array(8);

function evaluate(pos) {
  const b = pos.board;
  let mg = 0, eg = 0, phase = 0;
  pawnWCount.fill(0); pawnBCount.fill(0);
  pawnWMin.fill(7); pawnWMax.fill(0);
  pawnBMin.fill(7); pawnBMax.fill(0);
  rookWFiles.fill(0); rookBFiles.fill(0);
  let wBishops = 0, bBishops = 0;
  let wkSq = 0, bkSq = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p) continue;
    const white = p > 0;
    const t = white ? p : -p;
    const file = s & 7;
    const rank = s >> 4;
    const idx = white ? (7 - rank) * 8 + file : rank * 8 + file;
    const sv = white ? 1 : -1;
    mg += sv * (MG_VAL[t] + MG_PST[t][idx]);
    eg += sv * (EG_VAL[t] + EG_PST[t][idx]);
    phase += PHASE_VAL[t];
    if (t === 1) {
      if (white) {
        pawnWCount[file]++;
        if (rank < pawnWMin[file]) pawnWMin[file] = rank;
        if (rank > pawnWMax[file]) pawnWMax[file] = rank;
      } else {
        pawnBCount[file]++;
        if (rank < pawnBMin[file]) pawnBMin[file] = rank;
        if (rank > pawnBMax[file]) pawnBMax[file] = rank;
      }
    } else if (t === 3) {
      if (white) wBishops++; else bBishops++;
    } else if (t === 4) {
      if (white) rookWFiles[file]++; else rookBFiles[file]++;
    } else if (t === 6) {
      if (white) wkSq = s; else bkSq = s;
    }
  }
  if (wBishops >= 2) { mg += 28; eg += 48; }
  if (bBishops >= 2) { mg -= 28; eg -= 48; }
  for (let f = 0; f < 8; f++) {
    if (rookWFiles[f]) {
      if (!pawnWCount[f] && !pawnBCount[f]) { mg += 22; eg += 12; }
      else if (!pawnWCount[f]) { mg += 11; eg += 6; }
    }
    if (rookBFiles[f]) {
      if (!pawnWCount[f] && !pawnBCount[f]) { mg -= 22; eg -= 12; }
      else if (!pawnBCount[f]) { mg -= 11; eg -= 6; }
    }
    const wc = pawnWCount[f];
    if (wc > 1) { mg -= 12 * (wc - 1); eg -= 20 * (wc - 1); }
    const bc = pawnBCount[f];
    if (bc > 1) { mg += 12 * (bc - 1); eg += 20 * (bc - 1); }
  }
  for (let f = 0; f < 8; f++) {
    if (pawnWCount[f]) {
      const iso = (f === 0 || !pawnWCount[f - 1]) && (f === 7 || !pawnWCount[f + 1]);
      if (iso) { mg -= 14; eg -= 16; }
      const r = pawnWMax[f];
      const fL = f > 0 ? f - 1 : 0, fH = f < 7 ? f + 1 : 7;
      let passed = true;
      for (let ff = fL; ff <= fH; ff++) {
        if (pawnBCount[ff] && pawnBMax[ff] > r) { passed = false; break; }
      }
      if (passed) { const bns = PASSED[r]; mg += bns; eg += bns * 2; }
    }
    if (pawnBCount[f]) {
      const iso = (f === 0 || !pawnBCount[f - 1]) && (f === 7 || !pawnBCount[f + 1]);
      if (iso) { mg += 14; eg += 16; }
      const r = pawnBMin[f];
      const fL = f > 0 ? f - 1 : 0, fH = f < 7 ? f + 1 : 7;
      let passed = true;
      for (let ff = fL; ff <= fH; ff++) {
        if (pawnWCount[ff] && pawnWMin[ff] < r) { passed = false; break; }
      }
      if (passed) { const bns = PASSED[7 - r]; mg -= bns; eg -= bns * 2; }
    }
  }
  let wShield = 0, bShield = 0;
  {
    const kf = wkSq & 7, kr = wkSq >> 4;
    if (kr <= 1) {
      for (let df = -1; df <= 1; df++) {
        const ff = kf + df;
        if (ff < 0 || ff > 7) continue;
        if (pawnWCount[ff] && pawnWMin[ff] <= kr + 2) wShield++;
      }
      mg += wShield * 11;
    }
    const bf = bkSq & 7, br = bkSq >> 4;
    if (br >= 6) {
      for (let df = -1; df <= 1; df++) {
        const ff = bf + df;
        if (ff < 0 || ff > 7) continue;
        if (pawnBCount[ff] && pawnBMax[ff] >= br - 2) bShield++;
      }
      mg -= bShield * 11;
    }
  }
  if (phase > 24) phase = 24;
  const score = (mg * phase + eg * (24 - phase)) / 24;
  return (pos.side === 1 ? score : -score) | 0;
}

const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const ttKey = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);
const ttAge = new Uint8Array(TT_SIZE);
let ttAgeNow = 0;

const killers = new Int32Array(128 * 2);
const historyTab = new Int32Array(128 * 128);

let abortFlag = false;
let nodeCount = 0;
let searchDeadline = 0;
const ABORT = { aborted: true };

function checkTime() {
  if ((++nodeCount & 1023) === 0 && Date.now() >= searchDeadline) {
    abortFlag = true;
    throw ABORT;
  }
}

function countPath(pos, key) {
  let n = 0;
  const rootPly = pos.rootPly;
  for (let i = rootPly + 1; i <= pos.ply; i++) {
    if (pos.path[i] === key) n++;
  }
  return n;
}

function orderScore(pos, move, ttMove, ply) {
  const from = move & 127;
  const to = (move >> 7) & 127;
  const promo = (move >> 14) & 7;
  const flags = (move >> 17) & 7;
  if (move === ttMove) return 1 << 24;
  const b = pos.board;
  let victim = 0;
  if (flags & FLAG_EP) victim = MG_VAL[1];
  else {
    const t = b[to];
    if (t) victim = MG_VAL[Math.abs(t)];
  }
  if (victim) {
    const attacker = Math.abs(b[from]);
    return (1 << 20) + victim * 16 - attacker + (promo ? MG_VAL[promo] : 0);
  }
  if (promo) return (1 << 19) + MG_VAL[promo];
  if ((flags >> 1) & 1) return 1 << 18;
  const k2 = ply * 2;
  if (move === killers[k2]) return (1 << 17) + 1;
  if (move === killers[k2 + 1]) return 1 << 17;
  return historyTab[from * 128 + to];
}

function sortMoves(pos, moves, scores, n, ttMove, ply) {
  for (let i = 0; i < n; i++) scores[i] = orderScore(pos, moves[i], ttMove, ply);
  for (let i = 1; i < n; i++) {
    const m = moves[i], s = scores[i];
    let j = i - 1;
    while (j >= 0 && scores[j] < s) {
      moves[j + 1] = moves[j];
      scores[j + 1] = scores[j];
      j--;
    }
    moves[j + 1] = m;
    scores[j + 1] = s;
  }
}

const moveList = new Int32Array(256);
const scoreList = new Int32Array(256);

function qsearch(pos, alpha, beta, ply) {
  checkTime();
  if (pos.halfmove >= 100 || pos.ply >= pos.maxPlies) return 0;
  const stand = evaluate(pos);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (ply >= 60) return alpha;
  const pseudo = pos.genPseudo(true);
  const n = pseudo.length;
  if (!n) return alpha;
  sortMoves(pos, pseudo, scoreList, n, 0, ply);
  let best = stand;
  for (let i = 0; i < n; i++) {
    const move = pseudo[i];
    const victim = (move >> 17) & FLAG_EP ? MG_VAL[1] :
      (MG_VAL[Math.abs(pos.board[(move >> 7) & 127])] || 0);
    if (stand + victim + 180 < alpha) continue;
    pos.make(move);
    let score;
    try {
      score = -qsearch(pos, -beta, -alpha, ply + 1);
    } finally {
      pos.unmake(move);
    }
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(pos, depth, alpha, beta, ply, allowNull) {
  checkTime();
  pos.path[pos.ply] = pos.key();
  if (ply > 0 &&
      (pos.halfmove >= 100 || pos.ply >= pos.maxPlies || pos.insufficient())) {
    return 0;
  }
  const inCheck = pos.inCheck();
  const key = pos.key();
  let forcedDraw = false;
  if (ply > 0) {
    const rep = (pos.repCounts.get(key) | 0) + countPath(pos, key);
    if (rep >= 3) forcedDraw = true;
  }
  if (ply >= 100) return evaluate(pos);
  const dext = depth + (inCheck ? 1 : 0);
  if (dext <= 0) {
    return forcedDraw ? 0 : qsearch(pos, alpha, beta, ply);
  }
  const isMateNode = alpha < -MATE_BOUND + ply && beta > MATE_BOUND - ply;
  let ttm = 0;
  const idx = (key ^ (key >>> 20)) & TT_MASK;
  if (ttDepth[idx] !== 0 && ttKey[idx] === key) {
    ttm = ttMove[idx];
    const tScore = ttScore[idx];
    const tDepth = ttDepth[idx];
    const tFlag = ttFlag[idx];
    if (!isMateNode && tDepth >= dext) {
      if (tFlag === 0) return tScore;
      if (tFlag === 1 && tScore >= beta) return tScore;
      if (tFlag === 2 && tScore <= alpha) return tScore;
    }
  }
  const isRoot = ply === 0;
  if (!isRoot && !inCheck && allowNull && dext >= 3 &&
      pos.pc[(pos.side === 1 ? 2 : -2) + 6] + pos.pc[(pos.side === 1 ? 3 : -3) + 6] +
      pos.pc[(pos.side === 1 ? 4 : -4) + 6] + pos.pc[(pos.side === 1 ? 5 : -5) + 6] > 0) {
    const R = 2 + (dext >> 3);
    pos.makeNull();
    let score;
    try {
      score = -negamax(pos, dext - 1 - R, -beta, -beta + 1, ply + 1, false);
    } finally {
      pos.unmakeNull();
    }
    if (score >= beta) return beta;
  }
  const pseudo = pos.genPseudo(false);
  const n = pseudo.length;
  sortMoves(pos, pseudo, scoreList, n, ttm, ply);
  let legal = 0;
  let bestScore = -INF;
  let bestMove = 0;
  let flag = 2;
  for (let i = 0; i < n; i++) {
    const move = pseudo[i];
    const isQuiet = !(scoreList[i] >> 20) && !((move >> 14) & 7);
    pos.make(move);
    if (pos.insufficient()) {
      pos.unmake(move);
      legal++;
      if (0 > bestScore) { bestScore = 0; bestMove = move; if (0 > alpha) { alpha = 0; flag = 0; } if (alpha >= beta) break; }
      continue;
    }
    let score;
    try {
      if (legal === 0) {
        score = -negamax(pos, dext - 1, -beta, -alpha, ply + 1, true);
      } else {
        let reduction = 0;
        if (dext >= 3 && isQuiet && legal >= 3 && !inCheck) {
          reduction = 1 + ((legal >= 8 && dext >= 6) ? 1 : 0);
        }
        score = -negamax(pos, dext - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction) {
          score = -negamax(pos, dext - 1, -alpha - 1, -alpha, ply + 1, true);
        }
        if (score > alpha && score < beta) {
          score = -negamax(pos, dext - 1, -beta, -alpha, ply + 1, true);
        }
      }
    } finally {
      pos.unmake(move);
    }
    legal++;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
      flag = 0;
    }
    if (alpha >= beta) {
      flag = 1;
      if (isQuiet) {
        const k2 = ply * 2;
        if (killers[k2] !== move) {
          killers[k2 + 1] = killers[k2];
          killers[k2] = move;
        }
        const hIdx = (move & 127) * 128 + ((move >> 7) & 127);
        historyTab[hIdx] += dext * dext;
        if (historyTab[hIdx] > (1 << 24)) {
          for (let h = 0; h < historyTab.length; h++) historyTab[h] >>= 1;
        }
      }
      break;
    }
  }
  if (legal === 0) return inCheck ? -(MATE - ply) : 0;
  if (forcedDraw) return 0;
  if (Math.abs(bestScore) < MATE_BOUND) {
    ttKey[idx] = key;
    ttMove[idx] = bestMove;
    ttScore[idx] = bestScore;
    ttDepth[idx] = dext > 127 ? 127 : dext;
    ttFlag[idx] = flag;
    ttAge[idx] = ttAgeNow;
  }
  return bestScore;
}

function buildPosition(state) {
  const pos = new Position();
  pos.load(state.initialFen, state.maxPlies || 400);
  const rootPly = state.ply | 0;
  pos.rootPly = rootPly;
  const history = state.history || [];
  for (let i = 0; i < history.length; i++) {
    const uci = history[i];
    const legal = pos.legalMoves();
    let found = 0;
    for (let j = 0; j < legal.length; j++) {
      if (uciOf(legal[j]) === uci) { found = legal[j]; break; }
    }
    if (!found) return null;
    pos.make(found);
    pos.repCounts.set(pos.key(), (pos.repCounts.get(pos.key()) | 0) + 1);
  }
  pos.path[pos.ply] = pos.key();
  return pos;
}

function chooseMove(state) {
  const moves = state.legalMoves;
  if (!moves || !moves.length) return undefined;
  if (moves.length === 1) return moves[0];
  const timeLimit = state.timeLimitMs || 1000;
  searchDeadline = Date.now() + Math.max(100, Math.min(820, timeLimit - 180));
  abortFlag = false;
  nodeCount = 0;
  ttAgeNow = (ttAgeNow + 1) & 255;
  killers.fill(0);
  historyTab.fill(0);
  const pos = buildPosition(state);
  if (!pos) return moves[0];
  const legal = pos.legalMoves();
  if (!legal.length) return moves[0];
  const uciSet = new Set(moves);
  const candidates = [];
  for (let i = 0; i < legal.length; i++) {
    const u = uciOf(legal[i]);
    if (uciSet.has(u)) candidates.push(legal[i]);
  }
  if (!candidates.length) return moves[0];
  if (candidates.length === 1) return uciOf(candidates[0]);
  let bestMove = candidates[0];
  let bestScore = -INF;
  const rootScores = new Map();
  try {
    for (let depth = 1; depth <= 64; depth++) {
      rootScores.clear();
      let alpha = -INF;
      let iterBest = candidates[0];
      let iterScore = -INF;
      const order = candidates.slice();
      if (bestMove) {
        const bi = order.indexOf(bestMove);
        if (bi > 0) { order.splice(bi, 1); order.unshift(bestMove); }
      }
      for (let i = 0; i < order.length; i++) {
        const move = order[i];
        pos.make(move);
        let score;
        try {
          score = -negamax(pos, depth - 1, -INF, -alpha, 1, true);
        } finally {
          pos.unmake(move);
        }
        rootScores.set(move, score);
        if (score > alpha) alpha = score;
        if (score > iterScore) { iterScore = score; iterBest = move; }
      }
      bestMove = iterBest;
      bestScore = iterScore;
      if (bestScore >= MATE_BOUND) break;
      if (Date.now() >= searchDeadline) break;
      if (depth >= 2) {
        const pool = [];
        for (const [m, s] of rootScores) {
          if (s >= bestScore - 12) pool.push(m);
        }
        if (pool.length > 1) {
          bestMove = pool[(Math.random() * pool.length) | 0];
        }
      }
    }
  } catch (error) {
    if (error !== ABORT) throw error;
  }
  const result = uciOf(bestMove);
  return uciSet.has(result) ? result : moves[0];
}

const botMove = function move(state) {
  try {
    return chooseMove(state);
  } catch (error) {
    return state.legalMoves && state.legalMoves.length ? state.legalMoves[0] : undefined;
  }
};

Object.defineProperty(botMove, 'name', { value: 'terminus', configurable: true });
module.exports = botMove;
