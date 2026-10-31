'use strict';

// ============================================================================
// Argon Chess Bot - High Performance 0x88 Search Engine for Standard & Chess960
// ============================================================================

const LETTERS = ' PNBRQK';
const KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_DIRS = [-17, -15, 15, 17];
const ROOK_DIRS = [-16, -1, 1, 16];
const KING_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];

const MATE_SCORE = 30000;
const INF = 32000;
const CONTEMPT = 20;

// PeSTO Tapered Evaluation Tables (from White's perspective, rank 8 (row 0) to rank 1 (row 7))
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 20000];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 20000];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const SEE_VALUE = [0, 100, 325, 335, 500, 975, 20000];

const MG_PAWN_TABLE = [
    0,   0,   0,   0,   0,   0,   0,   0,
   98, 134,  61,  95,  68, 126,  34, -11,
   -6,   7,  26,  31,  65,  56,  25, -20,
  -14,  13,   6,  21,  23,  12,  17, -23,
  -27,  -2,  -5,  12,  17,   6,  10, -25,
  -26,  -4,  -4, -10,   3,   3,  33, -12,
  -35,  -1, -20, -23, -15,  24,  38, -22,
    0,   0,   0,   0,   0,   0,   0,   0
];

const EG_PAWN_TABLE = [
    0,   0,   0,   0,   0,   0,   0,   0,
  178, 173, 158, 134, 147, 132, 165, 187,
   94, 100,  85,  67,  56,  53,  82,  84,
   32,  24,  13,   5,  -2,   4,  17,  17,
   13,   9,  -3,  -7,  -7,  -8,   3,  -1,
    4,   7,  -6,   1,   0,  -5,  -1,  -8,
   13,   8,   8,  10,  13,   0,   2,  -7,
    0,   0,   0,   0,   0,   0,   0,   0
];

const MG_KNIGHT_TABLE = [
  -167, -89, -34, -49,  61, -97, -15, -107,
   -73, -41,  72,  36,  23,  62,   7,  -17,
   -47,  60,  37,  65,  84, 129,  73,   44,
    -9,  17,  19,  53,  37,  69,  18,   22,
   -13,   4,  16,  13,  28,  19,  21,   -8,
   -23,  -9,  12,  10,  19,  17,  25,  -16,
   -29, -53, -12,  -3,  -1,  18, -14,  -19,
  -105, -21, -58, -33, -17, -28, -19,  -23
];

const EG_KNIGHT_TABLE = [
  -58, -38, -13, -28, -31, -27, -63, -99,
  -25,  -8, -25,  -2,  -9, -25, -24, -52,
  -24, -20,  10,   9,  -1,  -9, -19, -41,
  -17,   3,  22,  22,  22,  11,   8, -18,
  -18,  -6,  16,  25,  16,  17,   4, -18,
  -23,  -3,  -1,  15,  10,  -3, -20, -22,
  -42, -20, -10,  -5,  -2, -20, -23, -44,
  -29, -51, -23, -15, -22, -18, -50, -64
];

const MG_BISHOP_TABLE = [
  -29,   4, -82, -37, -25, -42,   7,  -8,
  -26,  16, -18, -13,  30,  59,  18, -47,
  -16,  37,  43,  40,  35,  50,  37,  -2,
   -4,   5,  19,  50,  37,  37,   7,  -2,
   -6,  13,  13,  26,  34,  12,  10,   4,
    0,  15,  15,  15,  14,  27,  18,  10,
    4,  15,  16,   0,   7,  21,  33,   1,
  -33,  -3, -14, -21, -13, -12, -39, -21
];

const EG_BISHOP_TABLE = [
  -14, -21, -11,  -8,  -7,  -9, -17, -24,
   -8,  -4,   7, -12,  -3, -13,  -4, -14,
    2,  -8,   0,  -1,  -2,   6,   0,   4,
   -3,   9,  12,   9,  14,  10,   3,   2,
   -6,   3,  13,  19,   7,  10,  -3,  -9,
  -12,  -3,   8,  10,  13,   3,  -7, -15,
  -14, -18,  -7,  -1,   4,  -9, -15, -27,
  -23,  -9, -23,  -5,  -9, -16,  -5, -17
];

const MG_ROOK_TABLE = [
   32,  42,  32,  51,  63,   9,  31,  43,
   27,  32,  58,  62,  80,  67,  26,  44,
   -5,  19,  26,  36,  17,  45,  61,  16,
  -24, -11,   7,  26,  24,  35,  -8, -20,
  -36, -26, -12,  -1,   9,  -7,   6, -23,
  -45, -25, -16, -17,   3,   0,  -5, -33,
  -44, -16, -20,  -9,  -1,  11,  -6, -71,
  -19, -13,   1,  17,  16,   7, -37, -26
];

const EG_ROOK_TABLE = [
   13,  10,  18,  15,  12,  12,   8,   5,
   11,  13,  13,  11,  -3,   3,   8,   3,
    7,   7,   7,   5,   4,  -3,  -5,  -3,
    4,   3,  13,   1,   2,   1,  -1,   2,
    3,   5,   8,   4,  -5,  -6,  -8, -11,
   -4,   0,  -5,  -1,  -7, -12,  -8, -16,
   -6,  -6,   0,   2,  -9,  -9, -11,  -3,
   -9,   2,   3,  -1,  -5, -13,   4, -20
];

const MG_QUEEN_TABLE = [
  -28,   0,  29,  12,  59,  44,  43,  45,
  -24, -39,  -5,   1, -16,  57,  28,  54,
  -13, -17,   7,   8,  29,  56,  47,  57,
  -27, -27, -16, -16,  -1,  17,  -2,   1,
   -9, -26,  -9, -10,  -2,  -4,   3,  -3,
  -14,   2, -11,  -2,  -5,   2,  14,   5,
  -35,  -8,  11,   2,   8,  15,  -3,   1,
   -1, -18,  -9,  10, -15, -25, -31, -50
];

const EG_QUEEN_TABLE = [
   -9,  22,  22,  27,  27,  19,  10,  20,
  -17,  20,  32,  41,  58,  25,  30,   0,
  -20,   6,   9,  49,  47,  35,  19,   9,
    3,  22,  24,  45,  57,  40,  57,  36,
  -18,  28,  19,  47,  31,  34,  39,  23,
  -16, -27,  15,   6,   9,  17,  10,   5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43,  -5, -32, -20, -41
];

const MG_KING_TABLE = [
  -65,  23,  16, -15, -56, -34,   2,  13,
   29,  -1, -20,  -7,  -8,  -4, -38, -29,
   -9,  24,   2, -16, -20,   6,  22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49,  -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
    1,   7,  -8, -64, -43, -16,   9,   8,
  -15,  36,  12, -54,   8, -28,  24,  14
];

const EG_KING_TABLE = [
  -74, -35, -18, -18, -11,  15,   4, -17,
  -12,  17,  14,  17,  17,  38,  23,  11,
   10,  17,  23,  15,  20,  45,  44,  13,
   -8,  22,  24,  27,  26,  33,  26,   3,
  -18,  -4,  21,  24,  27,  23,   9, -11,
  -19,  -3,  11,  21,  23,  16,   7,  -9,
  -27, -11,   4,  13,  14,   4,  -5, -17,
  -53, -34, -21, -11, -28, -14, -24, -43
];

const MG_TABLES = [null, MG_PAWN_TABLE, MG_KNIGHT_TABLE, MG_BISHOP_TABLE, MG_ROOK_TABLE, MG_QUEEN_TABLE, MG_KING_TABLE];
const EG_TABLES = [null, EG_PAWN_TABLE, EG_KNIGHT_TABLE, EG_BISHOP_TABLE, EG_ROOK_TABLE, EG_QUEEN_TABLE, EG_KING_TABLE];

// Precompute 0x88 PST tables for piece +6 ( index = (piece + 6) * 128 + sq0x88 )
const PST_MG = new Int32Array(13 * 128);
const PST_EG = new Int32Array(13 * 128);

for (let p = 1; p <= 6; p++) {
  const mgTab = MG_TABLES[p];
  const egTab = EG_TABLES[p];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq88 = rank * 16 + file;
      const wIdx = (7 - rank) * 8 + file;
      const bIdx = rank * 8 + file;

      PST_MG[(p + 6) * 128 + sq88] = MG_VALUE[p] + mgTab[wIdx];
      PST_EG[(p + 6) * 128 + sq88] = EG_VALUE[p] + egTab[wIdx];

      PST_MG[(-p + 6) * 128 + sq88] = -(MG_VALUE[p] + mgTab[bIdx]);
      PST_EG[(-p + 6) * 128 + sq88] = -(EG_VALUE[p] + egTab[bIdx]);
    }
  }
}

// Zobrist Hashing (64-bit split into two 32-bit unsigned ints: hi, lo)
const Z_PIECE_HI = new Uint32Array(13 * 128);
const Z_PIECE_LO = new Uint32Array(13 * 128);
const Z_CASTLE_HI = new Uint32Array(16);
const Z_CASTLE_LO = new Uint32Array(16);
const Z_EP_HI = new Uint32Array(128);
const Z_EP_LO = new Uint32Array(128);
let Z_SIDE_HI = 0, Z_SIDE_LO = 0;

(function initZobrist() {
  let seed = 0x7A4E9B13;
  function rand32() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }
  for (let i = 0; i < 13 * 128; i++) {
    Z_PIECE_HI[i] = rand32();
    Z_PIECE_LO[i] = rand32();
  }
  for (let i = 0; i < 16; i++) {
    Z_CASTLE_HI[i] = rand32();
    Z_CASTLE_LO[i] = rand32();
  }
  for (let i = 0; i < 128; i++) {
    Z_EP_HI[i] = rand32();
    Z_EP_LO[i] = rand32();
  }
  Z_SIDE_HI = rand32();
  Z_SIDE_LO = rand32();
})();

// Transposition Table (1M entries = 1 << 20)
const TT_SIZE = 1 << 20;
const TT_MASK = TT_SIZE - 1;
const ttKeyHi = new Uint32Array(TT_SIZE);
const ttKeyLo = new Uint32Array(TT_SIZE);
const ttScore = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE); // 0: empty, 1: exact, 2: lowerbound(beta), 3: upperbound(alpha)
const ttMove = new Uint32Array(TT_SIZE);

// Move encoding into 32-bit int:
// bits 0-6: from (0..127)
// bits 7-13: to (0..127)
// bits 14-16: promo (0..6)
// bit 17: ep (0 or 1)
// bit 18-20: castle index + 1 (0 = no castle, 1..4 = right index + 1)
function encodeMove(f, t, p, ep, castleIdx) {
  return f | (t << 7) | ((p || 0) << 14) | (ep ? (1 << 17) : 0) | ((castleIdx + 1) << 18);
}

function sqName(sq) {
  return String.fromCharCode(97 + (sq & 7)) + ((sq >> 4) + 1);
}

function moveToUci(m) {
  const f = m & 0x7F;
  const t = (m >> 7) & 0x7F;
  const p = (m >> 14) & 7;
  return sqName(f) + sqName(t) + (p ? LETTERS[p].toLowerCase() : '');
}

// Passed Pawn & Structural bonuses
const PASSED_BONUS_MG = [0, 8, 15, 28, 50, 85, 135, 0];
const PASSED_BONUS_EG = [0, 14, 26, 48, 82, 140, 220, 0];

// Killer, Countermove, and History heuristics
const MAX_PLY = 128;
const killers1 = new Uint32Array(MAX_PLY);
const killers2 = new Uint32Array(MAX_PLY);
const counterMoves = new Uint32Array(2 * 128 * 128);
const historyTable = new Int32Array(2 * 128 * 128); // [sideIdx][from][to]

// Pre-allocated typed arrays per ply to eliminate GC pressure during search
const plyMoves = Array.from({ length: MAX_PLY }, () => new Int32Array(256));
const plyScores = Array.from({ length: MAX_PLY }, () => new Int32Array(256));

// Pre-allocated evaluation scratch arrays
const wPawnFiles = new Uint8Array(8);
const bPawnFiles = new Uint8Array(8);
const wPawnMaxRank = new Int8Array(8);
const bPawnMinRank = new Int8Array(8);
const wPawnMinRank = new Int8Array(8);
const bPawnMaxRank = new Int8Array(8);

function ageHeuristics() {
  killers1.fill(0);
  killers2.fill(0);
  for (let i = 0; i < historyTable.length; i++) {
    historyTable[i] >>= 2;
  }
}

// Fast Internal Board State
class FastBoard {
  constructor() {
    this.board = new Int8Array(128);
    this.kings = new Int32Array(2); // [0] = black (-1), [1] = white (+1) -> index = (color + 1) >> 1
    this.side = 1;
    this.ep = -1;
    this.halfmove = 0;
    this.ply = 0;
    this.maxPlies = 400;
    this.rights = [];
    this.castleMask = 0;
    this.hashHi = 0;
    this.hashLo = 0;
    this.mg = 0;
    this.eg = 0;
    this.phase = 0;
    this.undoStack = [];
    for (let i = 0; i < 600; i++) {
      this.undoStack.push({
        m: 0, cap: 0, ep: -1, halfmove: 0, castleMask: 0,
        hashHi: 0, hashLo: 0, mg: 0, eg: 0, phase: 0,
        kSq: 0
      });
    }
    this.repHistoryHi = new Uint32Array(1024);
    this.repHistoryLo = new Uint32Array(1024);
    this.repPly = 0;
  }

  hasLegalEpCapture(epSq, byColor) {
    if (epSq < 0) return false;
    const step = byColor * 16;
    const b = this.board;
    if (b[epSq] !== 0 || b[epSq - step] !== -byColor) return false;
    const sideIdx = (byColor + 1) >> 1;

    for (let dIdx = 0; dIdx < 2; dIdx++) {
      const from = epSq - step + (dIdx === 0 ? -1 : 1);
      if (!(from & 0x88) && b[from] === byColor) {
        // Test legality of this en-passant capture
        const capSq = epSq - step;
        b[from] = 0;
        b[capSq] = 0;
        b[epSq] = byColor;
        const safe = !this.isAttacked(this.kings[sideIdx], -byColor);
        b[from] = byColor;
        b[capSq] = -byColor;
        b[epSq] = 0;
        if (safe) return true;
      }
    }
    return false;
  }

  initFromEngineGame(engineGame) {
    const initGame = globalThis.ChessEngine.create({
      fen: engineGame._initialFen,
      variant: engineGame.variant,
      maxPlies: engineGame.maxPlies
    });

    this._loadStateFromGame(initGame);
    this.repPly = 0;
    this.repHistoryHi[this.repPly] = this.hashHi;
    this.repHistoryLo[this.repPly] = this.hashLo;
    this.repPly++;

    const buf = new Int32Array(256);
    for (const entry of engineGame._history) {
      const uci = entry.uci;
      const count = this.generateLegalMovesInto(buf, false);
      let found = 0;
      for (let i = 0; i < count; i++) {
        if (moveToUci(buf[i]) === uci) {
          found = buf[i];
          break;
        }
      }
      if (found) {
        this.makeMove(found);
      } else {
        this._loadStateFromGame(engineGame);
        break;
      }
    }
  }

  _loadStateFromGame(g) {
    this.board.fill(0);
    this.mg = 0;
    this.eg = 0;
    this.phase = 0;
    this.hashHi = 0;
    this.hashLo = 0;

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = g._board[sq];
      this.board[sq] = p;
      if (p !== 0) {
        const idx = (p + 6) * 128 + sq;
        this.mg += PST_MG[idx];
        this.eg += PST_EG[idx];
        this.phase += PHASE_WEIGHT[Math.abs(p)];
        this.hashHi = (this.hashHi ^ Z_PIECE_HI[idx]) >>> 0;
        this.hashLo = (this.hashLo ^ Z_PIECE_LO[idx]) >>> 0;
      }
    }
    this.kings[0] = g._kings[-1];
    this.kings[1] = g._kings[1];
    this.side = g._side;
    if (this.side === -1) {
      this.hashHi = (this.hashHi ^ Z_SIDE_HI) >>> 0;
      this.hashLo = (this.hashLo ^ Z_SIDE_LO) >>> 0;
    }
      this.ep = g._ep;
      if (this.ep >= 0 && this.hasLegalEpCapture(this.ep, this.side)) {
        this.hashHi = (this.hashHi ^ Z_EP_HI[this.ep]) >>> 0;
        this.hashLo = (this.hashLo ^ Z_EP_LO[this.ep]) >>> 0;
      } else {
        this.ep = -1;
      }
    this.halfmove = g._halfmove;
    this.ply = g._ply;
    this.maxPlies = g.maxPlies;

    this.rights = g._rights.map((r, i) => ({
      color: r.color,
      k: r.k,
      r: r.r,
      bit: 1 << i
    }));
    this.castleMask = (1 << this.rights.length) - 1;
    this.hashHi = (this.hashHi ^ Z_CASTLE_HI[this.castleMask]) >>> 0;
    this.hashLo = (this.hashLo ^ Z_CASTLE_LO[this.castleMask]) >>> 0;
  }

  isAttacked(target, byColor) {
    const b = this.board;
    const pawnStep = byColor * 16;
    const p1 = target - (pawnStep - 1);
    if (!(p1 & 0x88) && b[p1] === byColor) return true;
    const p2 = target - (pawnStep + 1);
    if (!(p2 & 0x88) && b[p2] === byColor) return true;

    const knightPiece = byColor * 2;
    for (let i = 0; i < 8; i++) {
      const from = target + KNIGHT_DIRS[i];
      if (!(from & 0x88) && b[from] === knightPiece) return true;
    }

    const bishopPiece = byColor * 3;
    const queenPiece = byColor * 5;
    const kingPiece = byColor * 6;
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_DIRS[i];
      let from = target + d;
      if (!(from & 0x88)) {
        const p = b[from];
        if (p !== 0) {
          if (p === bishopPiece || p === queenPiece || p === kingPiece) return true;
          continue;
        }
        from += d;
        while (!(from & 0x88)) {
          const p2 = b[from];
          if (p2 !== 0) {
            if (p2 === bishopPiece || p2 === queenPiece) return true;
            break;
          }
          from += d;
        }
      }
    }

    const rookPiece = byColor * 4;
    for (let i = 0; i < 4; i++) {
      const d = ROOK_DIRS[i];
      let from = target + d;
      if (!(from & 0x88)) {
        const p = b[from];
        if (p !== 0) {
          if (p === rookPiece || p === queenPiece || p === kingPiece) return true;
          continue;
        }
        from += d;
        while (!(from & 0x88)) {
          const p2 = b[from];
          if (p2 !== 0) {
            if (p2 === rookPiece || p2 === queenPiece) return true;
            break;
          }
          from += d;
        }
      }
    }

    return false;
  }

  inCheck() {
    const kSq = this.kings[(this.side + 1) >> 1];
    return this.isAttacked(kSq, -this.side);
  }

  canCastle(right) {
    const b = this.board;
    const { k, r, color } = right;
    const base = color === 1 ? 0 : 112;
    const kt = base + (r > k ? 6 : 2);
    const rt = base + (r > k ? 5 : 3);
    if (b[k] !== color * 6 || b[r] !== color * 4 || this.isAttacked(k, -color)) return false;

    const min1 = k < kt ? k : kt, max1 = k > kt ? k : kt;
    for (let s = min1; s <= max1; s++) {
      if (s !== k && s !== r && b[s] !== 0) return false;
    }
    const min2 = r < rt ? r : rt, max2 = r > rt ? r : rt;
    for (let s = min2; s <= max2; s++) {
      if (s !== k && s !== r && b[s] !== 0) return false;
    }

    b[k] = 0;
    let safe = true;
    const step = kt > k ? 1 : kt < k ? -1 : 0;
    if (step !== 0) {
      for (let s = k + step; s !== kt; s += step) {
        if (this.isAttacked(s, -color)) { safe = false; break; }
      }
    }
    b[k] = color * 6;
    return safe;
  }

  generatePseudoMovesInto(buf, capturesOnly) {
    let count = 0;
    const b = this.board;
    const color = this.side;

    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const piece = b[from];
      if (piece === 0 || (piece > 0 ? 1 : -1) !== color) continue;
      const type = piece > 0 ? piece : -piece;

      if (type === 1) {
        const step = color * 16;
        const to = from + step;
        if (!(to & 0x88) && b[to] === 0) {
          const toRank = to >> 4;
          if (toRank === 0 || toRank === 7) {
            buf[count++] = encodeMove(from, to, 5, false, -1);
            if (!capturesOnly) {
              buf[count++] = encodeMove(from, to, 4, false, -1);
              buf[count++] = encodeMove(from, to, 3, false, -1);
              buf[count++] = encodeMove(from, to, 2, false, -1);
            }
          } else if (!capturesOnly) {
            buf[count++] = encodeMove(from, to, 0, false, -1);
            if ((from >> 4) === (color === 1 ? 1 : 6) && b[to + step] === 0) {
              buf[count++] = encodeMove(from, to + step, 0, false, -1);
            }
          }
        }
        for (let dIdx = 0; dIdx < 2; dIdx++) {
          const dest = from + step + (dIdx === 0 ? -1 : 1);
          if (dest & 0x88) continue;
          const target = b[dest];
          if (target !== 0 && (target > 0 ? 1 : -1) === -color && Math.abs(target) !== 6) {
            const toRank = dest >> 4;
            if (toRank === 0 || toRank === 7) {
              buf[count++] = encodeMove(from, dest, 5, false, -1);
              if (!capturesOnly) {
                buf[count++] = encodeMove(from, dest, 4, false, -1);
                buf[count++] = encodeMove(from, dest, 3, false, -1);
                buf[count++] = encodeMove(from, dest, 2, false, -1);
              }
            } else {
              buf[count++] = encodeMove(from, dest, 0, false, -1);
            }
          } else if (dest === this.ep && target === 0 && b[dest - step] === -color) {
            buf[count++] = encodeMove(from, dest, 0, true, -1);
          }
        }
        continue;
      }

      const dirs = type === 2 ? KNIGHT_DIRS : type === 3 ? BISHOP_DIRS : type === 4 ? ROOK_DIRS : KING_DIRS;
      const isSlider = type === 3 || type === 4 || type === 5;
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        let to = from + d;
        while (!(to & 0x88)) {
          const target = b[to];
          if (target !== 0) {
            if ((target > 0 ? 1 : -1) !== color && Math.abs(target) !== 6) {
              buf[count++] = encodeMove(from, to, 0, false, -1);
            }
            break;
          }
          if (!capturesOnly) {
            buf[count++] = encodeMove(from, to, 0, false, -1);
          }
          if (!isSlider) break;
          to += d;
        }
      }
    }

    if (!capturesOnly && this.castleMask !== 0) {
      for (let i = 0; i < this.rights.length; i++) {
        const right = this.rights[i];
        if ((this.castleMask & right.bit) && right.color === color && this.canCastle(right)) {
          buf[count++] = encodeMove(right.k, right.r, 0, false, i);
        }
      }
    }

    return count;
  }

  makeMove(m) {
    const b = this.board;
    const f = m & 0x7F;
    const t = (m >> 7) & 0x7F;
    const p = (m >> 14) & 7;
    const ep = (m >> 17) & 1;
    const castleIdx = ((m >> 18) & 7) - 1;

    const color = this.side;
    const sideIdx = (color + 1) >> 1;
    const piece = b[f];
    const absPiece = piece > 0 ? piece : -piece;

    const u = this.undoStack[this.repPly];
    u.m = m;
    u.ep = this.ep;
    u.halfmove = this.halfmove;
    u.castleMask = this.castleMask;
    u.hashHi = this.hashHi;
    u.hashLo = this.hashLo;
    u.mg = this.mg;
    u.eg = this.eg;
    u.phase = this.phase;
    u.kSq = this.kings[sideIdx];
    u.cap = 0;

    let hh = this.hashHi;
    let hl = this.hashLo;

    if (this.ep >= 0) {
      hh ^= Z_EP_HI[this.ep];
      hl ^= Z_EP_LO[this.ep];
    }
    hh ^= Z_CASTLE_HI[this.castleMask];
    hl ^= Z_CASTLE_LO[this.castleMask];

    if (castleIdx >= 0) {
      const base = color === 1 ? 0 : 112;
      const kingside = t > f;
      const kt = base + (kingside ? 6 : 2);
      const rt = base + (kingside ? 5 : 3);
      const kPiece = color * 6;
      const rPiece = color * 4;

      const kfIdx = (kPiece + 6) * 128 + f;
      const rfIdx = (rPiece + 6) * 128 + t;
      this.mg -= PST_MG[kfIdx] + PST_MG[rfIdx];
      this.eg -= PST_EG[kfIdx] + PST_EG[rfIdx];
      hh ^= Z_PIECE_HI[kfIdx] ^ Z_PIECE_HI[rfIdx];
      hl ^= Z_PIECE_LO[kfIdx] ^ Z_PIECE_LO[rfIdx];

      b[f] = 0;
      b[t] = 0;
      b[kt] = kPiece;
      b[rt] = rPiece;
      this.kings[sideIdx] = kt;

      const ktIdx = (kPiece + 6) * 128 + kt;
      const rtIdx = (rPiece + 6) * 128 + rt;
      this.mg += PST_MG[ktIdx] + PST_MG[rtIdx];
      this.eg += PST_EG[ktIdx] + PST_EG[rtIdx];
      hh ^= Z_PIECE_HI[ktIdx] ^ Z_PIECE_HI[rtIdx];
      hl ^= Z_PIECE_LO[ktIdx] ^ Z_PIECE_LO[rtIdx];
    } else {
      const fIdx = (piece + 6) * 128 + f;
      this.mg -= PST_MG[fIdx];
      this.eg -= PST_EG[fIdx];
      hh ^= Z_PIECE_HI[fIdx];
      hl ^= Z_PIECE_LO[fIdx];
      b[f] = 0;

      if (ep) {
        const capSq = t - color * 16;
        const capPiece = b[capSq];
        u.cap = capPiece;
        const capIdx = (capPiece + 6) * 128 + capSq;
        this.mg -= PST_MG[capIdx];
        this.eg -= PST_EG[capIdx];
        hh ^= Z_PIECE_HI[capIdx];
        hl ^= Z_PIECE_LO[capIdx];
        b[capSq] = 0;
      } else {
        const capPiece = b[t];
        if (capPiece !== 0) {
          u.cap = capPiece;
          const capIdx = (capPiece + 6) * 128 + t;
          this.mg -= PST_MG[capIdx];
          this.eg -= PST_EG[capIdx];
          this.phase -= PHASE_WEIGHT[capPiece > 0 ? capPiece : -capPiece];
          hh ^= Z_PIECE_HI[capIdx];
          hl ^= Z_PIECE_LO[capIdx];
        }
      }

      const placedPiece = p ? color * p : piece;
      b[t] = placedPiece;
      const tIdx = (placedPiece + 6) * 128 + t;
      this.mg += PST_MG[tIdx];
      this.eg += PST_EG[tIdx];
      if (p) {
        this.phase += PHASE_WEIGHT[p];
      }
      hh ^= Z_PIECE_HI[tIdx];
      hl ^= Z_PIECE_LO[tIdx];

      if (absPiece === 6) {
        this.kings[sideIdx] = t;
      }
    }

    if (this.castleMask !== 0) {
      for (let i = 0; i < this.rights.length; i++) {
        const r = this.rights[i];
        if (this.castleMask & r.bit) {
          if ((r.color === color && absPiece === 6) || r.r === f || r.r === t) {
            this.castleMask &= ~r.bit;
          }
        }
      }
    }
    hh ^= Z_CASTLE_HI[this.castleMask];
    hl ^= Z_CASTLE_LO[this.castleMask];

    this.side = -color;
    hh ^= Z_SIDE_HI;
    hl ^= Z_SIDE_LO;

    // Only set ep and hash it if an en-passant capture is actually legal! (Matches BOT_API.md)
    if (absPiece === 1 && (t - f === 32 || f - t === 32)) {
      const candEp = (f + t) >> 1;
      if (this.hasLegalEpCapture(candEp, this.side)) {
        this.ep = candEp;
        hh ^= Z_EP_HI[candEp];
        hl ^= Z_EP_LO[candEp];
      } else {
        this.ep = -1;
      }
    } else {
      this.ep = -1;
    }

    this.halfmove = (absPiece === 1 || u.cap !== 0) ? 0 : this.halfmove + 1;
    this.ply++;

    this.hashHi = hh >>> 0;
    this.hashLo = hl >>> 0;

    this.repPly++;
    this.repHistoryHi[this.repPly] = this.hashHi;
    this.repHistoryLo[this.repPly] = this.hashLo;
  }

  unmakeMove() {
    this.repPly--;
    const u = this.undoStack[this.repPly];
    const m = u.m;
    const f = m & 0x7F;
    const t = (m >> 7) & 0x7F;
    const p = (m >> 14) & 7;
    const ep = (m >> 17) & 1;
    const castleIdx = ((m >> 18) & 7) - 1;

    const color = -this.side;
    const sideIdx = (color + 1) >> 1;
    const b = this.board;

    this.side = color;
    this.ply--;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.castleMask = u.castleMask;
    this.hashHi = u.hashHi;
    this.hashLo = u.hashLo;
    this.mg = u.mg;
    this.eg = u.eg;
    this.phase = u.phase;
    this.kings[sideIdx] = u.kSq;

    if (castleIdx >= 0) {
      const base = color === 1 ? 0 : 112;
      const kingside = t > f;
      const kt = base + (kingside ? 6 : 2);
      const rt = base + (kingside ? 5 : 3);
      b[kt] = 0;
      b[rt] = 0;
      b[f] = color * 6;
      b[t] = color * 4;
    } else {
      const movedPiece = p ? color : b[t];
      b[f] = movedPiece;
      if (ep) {
        b[t] = 0;
        b[t - color * 16] = u.cap;
      } else {
        b[t] = u.cap;
      }
    }
  }

  makeNullMove() {
    const u = this.undoStack[this.repPly];
    u.m = 0;
    u.ep = this.ep;
    u.halfmove = this.halfmove;
    u.castleMask = this.castleMask;
    u.hashHi = this.hashHi;
    u.hashLo = this.hashLo;

    let hh = this.hashHi;
    let hl = this.hashLo;
    if (this.ep >= 0) {
      hh ^= Z_EP_HI[this.ep];
      hl ^= Z_EP_LO[this.ep];
      this.ep = -1;
    }
    this.side = -this.side;
    hh ^= Z_SIDE_HI;
    hl ^= Z_SIDE_LO;
    this.hashHi = hh >>> 0;
    this.hashLo = hl >>> 0;

    this.repPly++;
    this.repHistoryHi[this.repPly] = this.hashHi;
    this.repHistoryLo[this.repPly] = this.hashLo;
  }

  unmakeNullMove() {
    this.repPly--;
    const u = this.undoStack[this.repPly];
    this.side = -this.side;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.castleMask = u.castleMask;
    this.hashHi = u.hashHi;
    this.hashLo = u.hashLo;
  }

  generateLegalMovesInto(buf, capturesOnly) {
    const pseudoCount = this.generatePseudoMovesInto(buf, capturesOnly);
    let writeIdx = 0;
    const color = this.side;
    const sideIdx = (color + 1) >> 1;
    for (let i = 0; i < pseudoCount; i++) {
      const m = buf[i];
      this.makeMove(m);
      if (!this.isAttacked(this.kings[sideIdx], -color)) {
        buf[writeIdx++] = m;
      }
      this.unmakeMove();
    }
    return writeIdx;
  }

  countRepetitions() {
    let count = 1;
    const hi = this.hashHi;
    const lo = this.hashLo;
    const limit = Math.max(0, this.repPly - this.halfmove);
    for (let i = this.repPly - 2; i >= limit; i -= 2) {
      if (this.repHistoryHi[i] === hi && this.repHistoryLo[i] === lo) {
        count++;
      }
    }
    return count;
  }

  isInsufficientMaterial() {
    if (this.phase > 2) return false;
    const b = this.board;
    let minors = 0;
    let firstBishopColor = -1;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = Math.abs(b[s]);
      if (p === 0 || p === 6) continue;
      if (p === 1 || p === 4 || p === 5) return false;
      minors++;
      if (p === 2) {
        if (minors >= 2) return false;
      } else if (p === 3) {
        const sqCol = ((s & 7) + (s >> 4)) & 1;
        if (firstBishopColor === -1) firstBishopColor = sqCol;
        else if (firstBishopColor !== sqCol) return false;
      }
    }
    return true;
  }

  evaluate() {
    const b = this.board;
    let mg = this.mg;
    let eg = this.eg;

    let wBishops = 0, bBishops = 0;
    for (let i = 0; i < 8; i++) {
      wPawnFiles[i] = 0;
      bPawnFiles[i] = 0;
      wPawnMaxRank[i] = -1;
      bPawnMinRank[i] = 8;
      wPawnMinRank[i] = 8;
      bPawnMaxRank[i] = -1;
    }

    const wk = this.kings[1];
    const bk = this.kings[0];

    // Scan board for pawns, bishops, rooks, knights, queens
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p === 0) continue;

      if (p === 1) {
        const f = s & 7, r = s >> 4;
        wPawnFiles[f]++;
        if (r > wPawnMaxRank[f]) wPawnMaxRank[f] = r;
        if (r < wPawnMinRank[f]) wPawnMinRank[f] = r;
        // Pawn phalanx & defended bonus
        if (f < 7 && b[s + 1] === 1) { mg += 7; eg += 5; }
        if ((f > 0 && b[s - 17] === 1) || (f < 7 && b[s - 15] === 1)) { mg += 9; eg += 6; }
      } else if (p === -1) {
        const f = s & 7, r = s >> 4;
        bPawnFiles[f]++;
        if (r < bPawnMinRank[f]) bPawnMinRank[f] = r;
        if (r > bPawnMaxRank[f]) bPawnMaxRank[f] = r;
        if (f < 7 && b[s + 1] === -1) { mg -= 7; eg -= 5; }
        if ((f > 0 && b[s + 15] === -1) || (f < 7 && b[s + 17] === -1)) { mg -= 9; eg -= 6; }
      } else if (p === 3) {
        wBishops++;
        // Mobility along diagonals
        for (let d = 0; d < 4; d++) {
          const dir = BISHOP_DIRS[d];
          for (let sq = s + dir; !(sq & 0x88); sq += dir) {
            mg += 3; eg += 3;
            if (b[sq] !== 0) break;
          }
        }
      } else if (p === -3) {
        bBishops++;
        for (let d = 0; d < 4; d++) {
          const dir = BISHOP_DIRS[d];
          for (let sq = s + dir; !(sq & 0x88); sq += dir) {
            mg -= 3; eg -= 3;
            if (b[sq] !== 0) break;
          }
        }
      } else if (p === 2) {
        // Knight mobility & king tropism
        for (let d = 0; d < 8; d++) {
          const sq = s + KNIGHT_DIRS[d];
          if (!(sq & 0x88) && b[sq] <= 0) {
            mg += 3; eg += 2;
          }
        }
      } else if (p === -2) {
        for (let d = 0; d < 8; d++) {
          const sq = s + KNIGHT_DIRS[d];
          if (!(sq & 0x88) && b[sq] >= 0) {
            mg -= 3; eg -= 2;
          }
        }
      } else if (p === 4) {
        // Rook on 7th rank & mobility
        if ((s >> 4) === 6 && (bk >> 4) >= 6) { mg += 22; eg += 30; }
        for (let d = 0; d < 4; d++) {
          const dir = ROOK_DIRS[d];
          for (let sq = s + dir; !(sq & 0x88); sq += dir) {
            mg += 2; eg += 3;
            if (b[sq] !== 0) break;
          }
        }
      } else if (p === -4) {
        if ((s >> 4) === 1 && (wk >> 4) <= 1) { mg -= 22; eg -= 30; }
        for (let d = 0; d < 4; d++) {
          const dir = ROOK_DIRS[d];
          for (let sq = s + dir; !(sq & 0x88); sq += dir) {
            mg -= 2; eg -= 3;
            if (b[sq] !== 0) break;
          }
        }
      }
    }

    // Second pass for rooks on open/semi-open files (now that wPawnFiles/bPawnFiles are populated)
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p === 4) {
        const f = s & 7;
        if (wPawnFiles[f] === 0) {
          if (bPawnFiles[f] === 0) { mg += 24; eg += 14; }
          else { mg += 12; eg += 8; }
        }
      } else if (p === -4) {
        const f = s & 7;
        if (bPawnFiles[f] === 0) {
          if (wPawnFiles[f] === 0) { mg -= 24; eg -= 14; }
          else { mg -= 12; eg -= 8; }
        }
      }
    }

    if (wBishops >= 2) { mg += 32; eg += 52; }
    if (bBishops >= 2) { mg -= 32; eg -= 52; }

    // Pawn structure: doubled, isolated, passed, blocked passed
    for (let f = 0; f < 8; f++) {
      const wc = wPawnFiles[f];
      if (wc > 0) {
        if (wc > 1) { mg -= (wc - 1) * 12; eg -= (wc - 1) * 20; }
        const left = f > 0 ? wPawnFiles[f - 1] : 0;
        const right = f < 7 ? wPawnFiles[f + 1] : 0;
        if (left === 0 && right === 0) { mg -= 12; eg -= 16; }
        const maxR = wPawnMaxRank[f];
        const bLeft = f > 0 ? bPawnMaxRank[f - 1] : -1;
        const bMid = bPawnMaxRank[f];
        const bRight = f < 7 ? bPawnMaxRank[f + 1] : -1;
        if (bLeft <= maxR && bMid <= maxR && bRight <= maxR) {
          let bonusMg = PASSED_BONUS_MG[maxR];
          let bonusEg = PASSED_BONUS_EG[maxR];
          // Check if square in front is empty
          const frontSq = (maxR + 1) * 16 + f;
          if (!(frontSq & 0x88) && b[frontSq] === 0) {
            bonusMg += (bonusMg >> 2);
            bonusEg += (bonusEg >> 2);
          }
          mg += bonusMg;
          eg += bonusEg;
        }
      }
      const bc = bPawnFiles[f];
      if (bc > 0) {
        if (bc > 1) { mg += (bc - 1) * 12; eg += (bc - 1) * 20; }
        const left = f > 0 ? bPawnFiles[f - 1] : 0;
        const right = f < 7 ? bPawnFiles[f + 1] : 0;
        if (left === 0 && right === 0) { mg += 12; eg += 16; }
        const minR = bPawnMinRank[f];
        const wLeft = f > 0 ? wPawnMinRank[f - 1] : 8;
        const wMid = wPawnMinRank[f];
        const wRight = f < 7 ? wPawnMinRank[f + 1] : 8;
        if (wLeft >= minR && wMid >= minR && wRight >= minR) {
          let bonusMg = PASSED_BONUS_MG[7 - minR];
          let bonusEg = PASSED_BONUS_EG[7 - minR];
          const frontSq = (minR - 1) * 16 + f;
          if (!(frontSq & 0x88) && b[frontSq] === 0) {
            bonusMg += (bonusMg >> 2);
            bonusEg += (bonusEg >> 2);
          }
          mg -= bonusMg;
          eg -= bonusEg;
        }
      }
    }

    // King pawn shield in middlegame
    const wkf = wk & 7, wkr = wk >> 4;
    if (wkr <= 1) {
      for (let df = -1; df <= 1; df++) {
        const sf = wkf + df;
        if (sf >= 0 && sf <= 7) {
          if (b[16 + sf] === 1) mg += 14;
          else if (b[32 + sf] === 1) mg += 7;
          else if (wPawnFiles[sf] === 0) mg -= 15;
        }
      }
    }
    const bkf = bk & 7, bkr = bk >> 4;
    if (bkr >= 6) {
      for (let df = -1; df <= 1; df++) {
        const sf = bkf + df;
        if (sf >= 0 && sf <= 7) {
          if (b[96 + sf] === -1) mg -= 14;
          else if (b[80 + sf] === -1) mg -= 7;
          else if (bPawnFiles[sf] === 0) mg += 15;
        }
      }
    }

    const ph = this.phase > 24 ? 24 : this.phase;
    let score = ((mg * ph + eg * (24 - ph)) / 24) | 0;

    // Endgame Mop-up evaluation when one side is clearly winning
    if (ph <= 8 && Math.abs(score) > 300) {
      const kingDist = Math.abs(wkf - bkf) + Math.abs(wkr - bkr);
      if (score > 300) {
        const bCenterDist = Math.abs(bkf * 2 - 7) + Math.abs(bkr * 2 - 7);
        score += bCenterDist * 10 + (14 - kingDist) * 6;
      } else {
        const wCenterDist = Math.abs(wkf * 2 - 7) + Math.abs(wkr * 2 - 7);
        score -= wCenterDist * 10 + (14 - kingDist) * 6;
      }
    }

    return (this.side === 1 ? score : -score) + 12;
  }
}

const searchBoard = new FastBoard();

function scoreMove(b, m, ttBest, ply, prevMove) {
  if (m === ttBest) return 2000000;
  const f = m & 0x7F;
  const t = (m >> 7) & 0x7F;
  const p = (m >> 14) & 7;
  const ep = (m >> 17) & 1;

  const victim = ep ? 1 : Math.abs(b.board[t]);
  const attacker = Math.abs(b.board[f]);

  if (victim !== 0 || p !== 0) {
    // Winning/equal captures above killers, losing captures still high
    const gain = SEE_VALUE[victim] + (p ? SEE_VALUE[p] - 100 : 0) - SEE_VALUE[attacker];
    if (gain >= -50) {
      return 1000000 + victim * 100 + p * 90 - attacker;
    }
    // Potentially losing capture (e.g. QxP defended by pawn): check if square is defended
    return 100000 + victim * 100 + p * 90 - attacker;
  }
  if (ply < MAX_PLY) {
    if (m === killers1[ply]) return 900000;
    if (m === killers2[ply]) return 850000;
  }
  if (prevMove) {
    const pf = prevMove & 0x7F;
    const pt = (prevMove >> 7) & 0x7F;
    const sideIdx = (b.side + 1) >> 1;
    if (m === counterMoves[(sideIdx << 14) | (pf << 7) | pt]) return 800000;
  }
  const sideIdx = (b.side + 1) >> 1;
  return historyTable[(sideIdx << 14) | (f << 7) | t];
}

function pickNextMove(moves, scores, count, startIdx) {
  let bestIdx = startIdx;
  let bestScore = scores[startIdx];
  for (let i = startIdx + 1; i < count; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIdx = i;
    }
  }
  if (bestIdx !== startIdx) {
    const tmpM = moves[startIdx]; moves[startIdx] = moves[bestIdx]; moves[bestIdx] = tmpM;
    const tmpS = scores[startIdx]; scores[startIdx] = scores[bestIdx]; scores[bestIdx] = tmpS;
  }
  return moves[startIdx];
}

const TIMEOUT_TOKEN = { timeout: true };
let nodes = 0;
let deadline = 0;

function qsearch(b, alpha, beta, qply) {
  if ((++nodes & 1023) === 0 && Date.now() >= deadline) throw TIMEOUT_TOKEN;

  const inChk = b.inCheck();
  let standPat = -INF;
  if (!inChk) {
    standPat = b.evaluate();
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (qply >= 10) return alpha;
  }

  const plyIdx = Math.min( MAX_PLY - 1, 64 + qply );
  const moves = plyMoves[plyIdx];
  const scores = plyScores[plyIdx];
  const count = b.generateLegalMovesInto(moves, !inChk);

  if (count === 0) {
    return inChk ? -MATE_SCORE + qply + 32 : standPat;
  }

  for (let i = 0; i < count; i++) {
    scores[i] = scoreMove(b, moves[i], 0, MAX_PLY, 0);
  }

  for (let i = 0; i < count; i++) {
    const m = pickNextMove(moves, scores, count, i);

    // Delta pruning in qsearch when not in check and not promoting
    if (!inChk && ((m >> 14) & 7) === 0 && b.phase > 4) {
      const t = (m >> 7) & 0x7F;
      const ep = (m >> 17) & 1;
      const victim = ep ? 1 : Math.abs(b.board[t]);
      if (standPat + SEE_VALUE[victim] + 180 < alpha) continue;
    }

    b.makeMove(m);
    const score = -qsearch(b, -beta, -alpha, qply + 1);
    b.unmakeMove();

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function pvs(b, depth, alpha, beta, ply, allowNull, prevMove) {
  if ((++nodes & 1023) === 0 && Date.now() >= deadline) throw TIMEOUT_TOKEN;

  if (ply > 0) {
    if (b.halfmove >= 100 || b.ply >= b.maxPlies || b.isInsufficientMaterial()) return 0;
    const reps = b.countRepetitions();
    if (reps >= 3) return 0;
    if (reps >= 2) return -CONTEMPT;

    const rAlpha = Math.max(alpha, -MATE_SCORE + ply);
    const rBeta = Math.min(beta, MATE_SCORE - ply - 1);
    if (rAlpha >= rBeta) return rAlpha;
  }

  const inChk = b.inCheck();
  if (inChk) depth++;

  if (depth <= 0 || ply >= 62) {
    return qsearch(b, alpha, beta, 0);
  }

  const isPV = (beta - alpha) > 1;
  const origAlpha = alpha;
  const ttIdx = b.hashLo & TT_MASK;
  let ttBest = 0;

  if (ttFlag[ttIdx] !== 0 && ttKeyHi[ttIdx] === b.hashHi && ttKeyLo[ttIdx] === b.hashLo) {
    ttBest = ttMove[ttIdx];
    if (!isPV && ply > 0 && ttDepth[ttIdx] >= depth) {
      let score = ttScore[ttIdx];
      if (score > MATE_SCORE - 500) score -= ply;
      else if (score < -MATE_SCORE + 500) score += ply;
      const flag = ttFlag[ttIdx];
      if (flag === 1) return score;
      if (flag === 2 && score >= beta) return score;
      if (flag === 3 && score <= alpha) return score;
    }
  }

  let staticEval = -INF;
  if (!inChk && !isPV && ply > 0 && Math.abs(beta) < MATE_SCORE - 500) {
    staticEval = b.evaluate();

    // Reverse Futility Pruning (Static Null Move Pruning)
    if (depth <= 4 && staticEval - 85 * depth >= beta) {
      return staticEval - 85 * depth;
    }

    // Null Move Pruning (only when non-pawn material exists)
    if (allowNull && depth >= 3 && b.phase >= 4 && staticEval >= beta) {
      const R = depth >= 6 ? 3 : 2;
      b.makeNullMove();
      const nullScore = -pvs(b, depth - 1 - R, -beta, -beta + 1, ply + 1, false, 0);
      b.unmakeNullMove();
      if (nullScore >= beta) {
        return nullScore >= MATE_SCORE - 500 ? beta : nullScore;
      }
    }
  }

  const moves = plyMoves[ply];
  const scores = plyScores[ply];
  const count = b.generateLegalMovesInto(moves, false);

  if (count === 0) {
    return inChk ? -MATE_SCORE + ply : 0;
  }

  for (let i = 0; i < count; i++) {
    scores[i] = scoreMove(b, moves[i], ttBest, ply, prevMove);
  }

  let bestMove = moves[0];
  let bestScore = -INF;

  for (let i = 0; i < count; i++) {
    const m = pickNextMove(moves, scores, count, i);
    const f = m & 0x7F;
    const t = (m >> 7) & 0x7F;
    const p = (m >> 14) & 7;
    const ep = (m >> 17) & 1;
    const isCapture = ep || b.board[t] !== 0 || p !== 0;

    // Futility pruning & Late Move Pruning at shallow depths
    if (!isPV && !inChk && !isCapture && depth <= 2 && i >= 4 && Math.abs(alpha) < MATE_SCORE - 500) {
      if (staticEval === -INF) staticEval = b.evaluate();
      if (staticEval + 130 * depth <= alpha) continue;
    }

    b.makeMove(m);
    const givesCheck = b.inCheck();

    let score;
    if (i === 0) {
      score = -pvs(b, depth - 1, -beta, -alpha, ply + 1, true, m);
    } else {
      let reduction = 0;
      if (depth >= 3 && i >= 3 && !inChk && !givesCheck && !isCapture) {
        reduction = 1;
        if (depth >= 5 && i >= 8) reduction = 2;
        if (depth >= 8 && i >= 16) reduction = 3;
        if (isPV) reduction = Math.max(0, reduction - 1);
      }
      score = -pvs(b, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true, m);
      if (score > alpha && reduction > 0) {
        score = -pvs(b, depth - 1, -alpha - 1, -alpha, ply + 1, true, m);
      }
      if (score > alpha && score < beta) {
        score = -pvs(b, depth - 1, -beta, -alpha, ply + 1, true, m);
      }
    }

    b.unmakeMove();

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) {
        if (!isCapture && ply < MAX_PLY) {
          if (killers1[ply] !== m) {
            killers2[ply] = killers1[ply];
            killers1[ply] = m;
          }
          const sideIdx = (b.side + 1) >> 1;
          const hIdx = (sideIdx << 14) | (f << 7) | t;
          historyTable[hIdx] = Math.min(100000, historyTable[hIdx] + depth * depth);
          if (prevMove) {
            const pf = prevMove & 0x7F;
            const pt = (prevMove >> 7) & 0x7F;
            counterMoves[(sideIdx << 14) | (pf << 7) | pt] = m;
          }
        }
        break;
      }
    }
  }

  ttKeyHi[ttIdx] = b.hashHi;
  ttKeyLo[ttIdx] = b.hashLo;
  let storedScore = bestScore;
  if (storedScore > MATE_SCORE - 500) storedScore += ply;
  else if (storedScore < -MATE_SCORE + 500) storedScore -= ply;
  ttScore[ttIdx] = storedScore;
  ttDepth[ttIdx] = depth;
  ttFlag[ttIdx] = bestScore <= origAlpha ? 3 : bestScore >= beta ? 2 : 1;
  ttMove[ttIdx] = bestMove;

  return bestScore;
}

function chooseMove(state) {
  try {
    if (!state || !Array.isArray(state.legalMoves) || state.legalMoves.length === 0) {
      return undefined;
    }
    if (state.legalMoves.length === 1) {
      return state.legalMoves[0];
    }

    const startTime = Date.now();
    const limitMs = state.timeLimitMs || 1000;
    deadline = startTime + Math.min(550, Math.max(50, limitMs - 380));

    const rootEngineGame = globalThis.ChessEngine.fromBotState(state);
    searchBoard.initFromEngineGame(rootEngineGame);
    ageHeuristics();
    nodes = 0;

    const rootBuf = new Int32Array(256);
    const rootCount = searchBoard.generateLegalMovesInto(rootBuf, false);
    const legalSet = new Set(state.legalMoves);
    const validMoves = [];
    for (let i = 0; i < rootCount; i++) {
      const uci = moveToUci(rootBuf[i]);
      if (legalSet.has(uci)) {
        validMoves.push({ m: rootBuf[i], uci, score: 0 });
      }
    }
    if (validMoves.length === 0) {
      return state.legalMoves[0];
    }

    let bestMoveUci = validMoves[0].uci;
    let bestMoveEncoded = validMoves[0].m;
    const childBuf = new Int32Array(256);

    try {
      for (let depth = 1; depth <= 32; depth++) {
        let iterBestUci = bestMoveUci;
        let iterBestEncoded = bestMoveEncoded;
        let alpha = -INF;
        const beta = INF;

        validMoves.sort((a, b) => {
          if (a.m === bestMoveEncoded) return -1;
          if (b.m === bestMoveEncoded) return 1;
          return scoreMove(searchBoard, b.m, 0, 0, 0) - scoreMove(searchBoard, a.m, 0, 0, 0);
        });

        for (let i = 0; i < validMoves.length; i++) {
          if (Date.now() >= deadline) throw TIMEOUT_TOKEN;
          const item = validMoves[i];
          searchBoard.makeMove(item.m);

          let score;
          const childCount = searchBoard.generateLegalMovesInto(childBuf, false);
          if (childCount === 0) {
            score = searchBoard.inCheck() ? MATE_SCORE - 1 : 0;
          } else if (
            searchBoard.halfmove >= 100 ||
            searchBoard.ply >= searchBoard.maxPlies ||
            searchBoard.countRepetitions() >= 3 ||
            searchBoard.isInsufficientMaterial()
          ) {
            score = 0;
          } else {
            if (i === 0) {
              score = -pvs(searchBoard, depth - 1, -beta, -alpha, 1, true, item.m);
            } else {
              score = -pvs(searchBoard, depth - 1, -alpha - 1, -alpha, 1, true, item.m);
              if (score > alpha) {
                score = -pvs(searchBoard, depth - 1, -beta, -alpha, 1, true, item.m);
              }
            }
          }

          searchBoard.unmakeMove();
          item.score = score;

          if (score > alpha) {
            alpha = score;
            iterBestUci = item.uci;
            iterBestEncoded = item.m;
          }
          if (score >= MATE_SCORE - 1) {
            return item.uci;
          }
        }

        bestMoveUci = iterBestUci;
        bestMoveEncoded = iterBestEncoded;

        if (alpha >= MATE_SCORE - 100 || alpha <= -MATE_SCORE + 100) {
          break;
        }
        if (Date.now() - startTime > (deadline - startTime) * 0.62) {
          break;
        }
      }
    } catch (e) {
      if (e !== TIMEOUT_TOKEN) throw e;
    }

    return legalSet.has(bestMoveUci) ? bestMoveUci : state.legalMoves[0];
  } catch (err) {
    return state && state.legalMoves && state.legalMoves.length ? state.legalMoves[0] : undefined;
  }
}

chooseMove.botName = 'Argon';
Object.defineProperty(chooseMove, 'name', { value: 'Argon', configurable: true });
module.exports = chooseMove;
