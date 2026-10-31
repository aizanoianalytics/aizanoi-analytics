'use strict';
// Opus Gambit: 0x88 alpha-beta engine (PVS, TT, null move, LMR, quiescence) with tapered eval.

const BOT_NAME = 'Opus Gambit';
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const VAL_MG = [0, 82, 337, 365, 477, 1025, 0];
const VAL_EG = [0, 94, 281, 297, 512, 936, 0];
const SEE_V = [0, 100, 320, 330, 500, 900, 20000];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
const KNIGHT_D = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_D = [17, 15, -17, -15];
const ROOK_D = [16, -16, 1, -1];
const KING_D = [17, 15, -17, -15, 16, -16, 1, -1];
const MATE = 30000, INF = 32000;

// Tables written rank 8 first (white's view)
const PST_MG = [null,
  [0,0,0,0,0,0,0,0, 98,134,61,95,68,126,34,-11, -6,7,26,31,65,56,25,-20, -14,13,6,21,23,12,17,-23, -27,-2,-5,12,17,6,10,-25, -26,-4,-4,-10,3,3,33,-12, -35,-1,-20,-23,-15,24,38,-22, 0,0,0,0,0,0,0,0],
  [-167,-89,-34,-49,61,-97,-15,-107, -73,-41,72,36,23,62,7,-17, -47,60,37,65,84,129,73,44, -9,17,19,53,37,69,18,22, -13,4,16,13,28,19,21,-8, -23,-9,12,10,19,17,25,-16, -29,-53,-12,-3,-1,18,-14,-19, -105,-21,-58,-33,-17,-28,-19,-23],
  [-29,4,-82,-37,-25,-42,7,-8, -26,16,-18,-13,30,59,18,-47, -16,37,43,40,35,50,37,-2, -4,5,19,50,37,37,7,-2, -6,13,13,26,34,12,10,4, 0,15,15,15,14,27,18,10, 4,15,16,0,7,21,33,1, -33,-3,-14,-21,-13,-12,-39,-21],
  [32,42,32,51,63,9,31,43, 27,32,58,62,80,67,26,44, -5,19,26,36,17,45,61,16, -24,-11,7,26,24,35,-8,-20, -36,-26,-12,-1,9,-7,6,-23, -45,-25,-16,-17,3,0,-5,-33, -44,-16,-20,-9,-1,11,-6,-71, -19,-13,1,17,16,7,-37,-26],
  [-28,0,29,12,59,44,43,45, -24,-39,-5,1,-16,57,28,54, -13,-17,7,8,29,56,47,57, -27,-27,-16,-16,-1,17,-2,1, -9,-26,-9,-10,-2,-4,3,-3, -14,2,-11,-2,-5,2,14,5, -35,-8,11,2,8,15,-3,1, -1,-18,-9,10,-15,-25,-31,-50],
  [-65,23,16,-15,-56,-34,2,13, 29,-1,-20,-7,-8,-4,-38,-29, -9,24,2,-16,-20,6,22,-22, -17,-20,-12,-27,-30,-25,-14,-36, -49,-1,-27,-39,-46,-44,-33,-51, -14,-14,-22,-46,-44,-30,-15,-27, 1,7,-8,-64,-43,-16,9,8, -15,36,12,-54,8,-28,24,14]
];
const PST_EG = [null,
  [0,0,0,0,0,0,0,0, 178,173,158,134,147,132,165,187, 94,100,85,67,56,53,82,84, 32,24,13,5,-2,4,17,17, 13,9,-3,-7,-7,-8,3,-1, 4,7,-6,1,0,-5,-1,-8, 13,8,8,10,13,0,2,-7, 0,0,0,0,0,0,0,0],
  [-58,-38,-13,-28,-31,-27,-63,-99, -25,-8,-25,-2,-9,-25,-24,-52, -24,-20,10,9,-1,-9,-19,-41, -17,3,22,22,22,11,8,-18, -18,-6,16,25,16,17,4,-18, -23,-3,-1,15,10,-3,-20,-22, -42,-20,-10,-5,-2,-20,-23,-44, -29,-51,-23,-15,-22,-18,-50,-64],
  [-14,-21,-11,-8,-7,-9,-17,-24, -8,-4,7,-12,-3,-13,-4,-14, 2,-8,0,-1,-2,6,0,4, -3,9,12,9,14,10,3,2, -6,3,13,19,7,10,-3,-9, -12,-3,8,10,13,3,-7,-15, -14,-18,-7,-1,4,-9,-15,-27, -23,-9,-23,-5,-9,-16,-5,-17],
  [13,10,18,15,12,12,8,5, 11,13,13,11,-3,3,8,3, 7,7,7,5,4,-3,-5,-3, 4,3,13,1,2,1,-1,2, 3,5,8,4,-5,-6,-8,-11, -4,0,-5,-1,-7,-12,-8,-16, -6,-6,0,2,-9,-9,-11,-3, -9,2,3,-1,-5,-13,4,-20],
  [-9,22,22,27,27,19,10,20, -17,20,32,41,58,25,30,0, -20,6,9,49,47,35,19,9, 3,22,24,45,57,40,57,36, -18,28,19,47,31,34,39,23, -16,-27,15,6,9,17,10,5, -22,-23,-30,-16,-16,-23,-36,-32, -33,-28,-22,-43,-5,-32,-20,-41],
  [-74,-35,-18,-18,-11,15,4,-17, -12,17,14,17,17,38,23,11, 10,17,23,15,20,45,44,13, -8,22,24,27,26,33,26,3, -18,-4,21,24,27,23,9,-11, -19,-3,11,21,23,16,7,-9, -27,-11,4,13,14,4,-5,-17, -53,-34,-21,-11,-28,-14,-24,-43]
];
// Combined tables indexed [color][piece][sq0x88] incl. material
const MG = [[], []], EG = [[], []];
for (let c = 0; c < 2; c++) {
  for (let p = 0; p <= 6; p++) {
    MG[c][p] = new Int16Array(128); EG[c][p] = new Int16Array(128);
    if (!p) continue;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const rank = sq >> 4, file = sq & 7;
      const idx = c === 0 ? (7 - rank) * 8 + file : rank * 8 + file;
      MG[c][p][sq] = VAL_MG[p] + PST_MG[p][idx];
      EG[c][p][sq] = VAL_EG[p] + PST_EG[p][idx];
    }
  }
}
const PASSED_MG = [0, 0, 5, 10, 20, 35, 60, 0];
const PASSED_EG = [0, 0, 15, 25, 45, 75, 120, 0];

// Zobrist
let seed = 0x9e3779b9 | 0;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
const ZL = new Int32Array(16 * 128), ZH = new Int32Array(16 * 128);
for (let i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
const ZSIDE_L = rnd(), ZSIDE_H = rnd();
const ZCAS_L = new Int32Array(16), ZCAS_H = new Int32Array(16);
for (let i = 0; i < 16; i++) { ZCAS_L[i] = rnd(); ZCAS_H[i] = rnd(); }
const ZEP_L = new Int32Array(8), ZEP_H = new Int32Array(8);
for (let i = 0; i < 8; i++) { ZEP_L[i] = rnd(); ZEP_H[i] = rnd(); }

// Board state (piece = color*8 + type; color 0 white, 1 black)
const board = new Int8Array(128);
let side = 0, ep = -1, castle = 0, halfmove = 0, hashL = 0, hashH = 0;
const kingSq = [0, 0];
const castleRook = [-1, -1, -1, -1];
const castleKing = [-1, -1, -1, -1];
const castleClear = new Int8Array(128);

// Undo stacks
const MAXS = 1024;
const uCap = new Int8Array(MAXS), uEp = new Int16Array(MAXS), uCas = new Int8Array(MAXS),
  uHm = new Int16Array(MAXS), uHL = new Int32Array(MAXS), uHH = new Int32Array(MAXS);
let sp = 0;
// position history for repetition
const histL = new Int32Array(2048), histH = new Int32Array(2048);
let histN = 0;

function epHashable() {
  // en passant square counts only if an enemy pawn could capture
  if (ep < 0) return false;
  const pawn = side * 8 + P;
  const from = side === 0 ? ep - 16 : ep + 16;
  return (!((from - 1) & 0x88) && board[from - 1] === pawn) || (!((from + 1) & 0x88) && board[from + 1] === pawn);
}

function computeHash() {
  let l = 0, h = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const pc = board[sq];
    if (pc) { l ^= ZL[pc * 128 + sq]; h ^= ZH[pc * 128 + sq]; }
  }
  if (side) { l ^= ZSIDE_L; h ^= ZSIDE_H; }
  l ^= ZCAS_L[castle]; h ^= ZCAS_H[castle];
  if (ep >= 0) { l ^= ZEP_L[ep & 7]; h ^= ZEP_H[ep & 7]; }
  hashL = l; hashH = h;
}

function attacked(sq, by) {
  // is sq attacked by color `by`
  const base = by * 8;
  // pawns
  if (by === 0) {
    let s = sq - 15; if (!(s & 0x88) && board[s] === P) return true;
    s = sq - 17; if (!(s & 0x88) && board[s] === P) return true;
  } else {
    let s = sq + 15; if (!(s & 0x88) && board[s] === 8 + P) return true;
    s = sq + 17; if (!(s & 0x88) && board[s] === 8 + P) return true;
  }
  for (let i = 0; i < 8; i++) {
    const s = sq + KNIGHT_D[i];
    if (!(s & 0x88) && board[s] === base + N) return true;
  }
  for (let i = 0; i < 8; i++) {
    const s = sq + KING_D[i];
    if (!(s & 0x88) && board[s] === base + K) return true;
  }
  for (let i = 0; i < 4; i++) {
    const d = BISHOP_D[i];
    for (let s = sq + d; !(s & 0x88); s += d) {
      const pc = board[s];
      if (pc) { if (pc === base + B || pc === base + Q) return true; break; }
    }
  }
  for (let i = 0; i < 4; i++) {
    const d = ROOK_D[i];
    for (let s = sq + d; !(s & 0x88); s += d) {
      const pc = board[s];
      if (pc) { if (pc === base + R || pc === base + Q) return true; break; }
    }
  }
  return false;
}

// move: from | to<<7 | promo<<14 | flag<<17 ; flag 1 castle, 2 ep, 4 double
function mv(f, t, pr, fl) { return f | (t << 7) | (pr << 14) | (fl << 17); }

function genMoves(list, capsOnly) {
  let n = 0;
  const us = side, them = side ^ 1, base = us * 8;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = board[sq];
    if (!pc || (pc >> 3) !== us) continue;
    const t = pc & 7;
    if (t === P) {
      const step = us === 0 ? 16 : -16;
      const promoRank = us === 0 ? 7 : 0;
      const to = sq + step;
      if (!(to & 0x88) && !board[to]) {
        if ((to >> 4) === promoRank) {
          list[n++] = mv(sq, to, Q, 0);
          if (!capsOnly) { list[n++] = mv(sq, to, N, 0); list[n++] = mv(sq, to, R, 0); list[n++] = mv(sq, to, B, 0); }
        } else if (!capsOnly) {
          list[n++] = mv(sq, to, 0, 0);
          const startRank = us === 0 ? 1 : 6;
          if ((sq >> 4) === startRank && !board[to + step]) list[n++] = mv(sq, to + step, 0, 4);
        }
      }
      for (let k = -1; k <= 1; k += 2) {
        const c = to + k;
        if (c & 0x88) continue;
        const tp = board[c];
        if (tp && (tp >> 3) === them && (tp & 7) !== K) {
          if ((c >> 4) === promoRank) {
            list[n++] = mv(sq, c, Q, 0);
            if (!capsOnly) { list[n++] = mv(sq, c, N, 0); list[n++] = mv(sq, c, R, 0); list[n++] = mv(sq, c, B, 0); }
          } else list[n++] = mv(sq, c, 0, 0);
        } else if (c === ep && !tp && board[c - step] === them * 8 + P) {
          list[n++] = mv(sq, c, 0, 2);
        }
      }
      continue;
    }
    let dirs, slide;
    if (t === N) { dirs = KNIGHT_D; slide = false; }
    else if (t === B) { dirs = BISHOP_D; slide = true; }
    else if (t === R) { dirs = ROOK_D; slide = true; }
    else if (t === Q) { dirs = KING_D; slide = true; }
    else { dirs = KING_D; slide = false; }
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      for (let to = sq + d; !(to & 0x88); to += d) {
        const tp = board[to];
        if (tp) {
          if ((tp >> 3) === them && (tp & 7) !== K) list[n++] = mv(sq, to, 0, 0);
          break;
        }
        if (!capsOnly) list[n++] = mv(sq, to, 0, 0);
        if (!slide) break;
      }
    }
  }
  if (!capsOnly) {
    for (let s = us * 2; s < us * 2 + 2; s++) {
      if (!(castle & (1 << s))) continue;
      const k = castleKing[s], r = castleRook[s];
      if (board[k] !== base + K || board[r] !== base + R) continue;
      const rowBase = us === 0 ? 0 : 112;
      const kt = rowBase + (r > k ? 6 : 2), rt = rowBase + (r > k ? 5 : 3);
      let ok = true;
      let a = Math.min(k, kt), b = Math.max(k, kt);
      for (let x = a; x <= b && ok; x++) if (x !== k && x !== r && board[x]) ok = false;
      a = Math.min(r, rt); b = Math.max(r, rt);
      for (let x = a; x <= b && ok; x++) if (x !== k && x !== r && board[x]) ok = false;
      if (!ok) continue;
      if (attacked(k, them)) continue;
      board[k] = 0;
      const stp = Math.sign(kt - k);
      if (stp) for (let x = k + stp; x !== kt; x += stp) if (attacked(x, them)) { ok = false; break; }
      board[k] = base + K;
      if (ok) list[n++] = mv(k, r, 0, 1);
    }
  }
  return n;
}

function makeMove(m) {
  const f = m & 127, t = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
  const us = side, pc = board[f];
  uEp[sp] = ep; uCas[sp] = castle; uHm[sp] = halfmove; uHL[sp] = hashL; uHH[sp] = hashH;
  let l = hashL, h = hashH;
  if (ep >= 0) { l ^= ZEP_L[ep & 7]; h ^= ZEP_H[ep & 7]; }
  l ^= ZCAS_L[castle]; h ^= ZCAS_H[castle];
  let cap = 0;
  if (fl & 1) {
    const rowBase = us === 0 ? 0 : 112;
    const kt = rowBase + (t > f ? 6 : 2), rt = rowBase + (t > f ? 5 : 3);
    const kp = us * 8 + K, rp = us * 8 + R;
    board[f] = 0; board[t] = 0; board[kt] = kp; board[rt] = rp;
    l ^= ZL[kp * 128 + f] ^ ZL[rp * 128 + t] ^ ZL[kp * 128 + kt] ^ ZL[rp * 128 + rt];
    h ^= ZH[kp * 128 + f] ^ ZH[rp * 128 + t] ^ ZH[kp * 128 + kt] ^ ZH[rp * 128 + rt];
    kingSq[us] = kt;
    castle &= ~(us === 0 ? 3 : 12);
    halfmove++;
  } else {
    cap = board[t];
    if (cap) { l ^= ZL[cap * 128 + t]; h ^= ZH[cap * 128 + t]; }
    if (fl & 2) {
      const cs = us === 0 ? t - 16 : t + 16;
      cap = board[cs]; board[cs] = 0;
      l ^= ZL[cap * 128 + cs]; h ^= ZH[cap * 128 + cs];
    }
    const np = pr ? us * 8 + pr : pc;
    board[f] = 0; board[t] = np;
    l ^= ZL[pc * 128 + f] ^ ZL[np * 128 + t];
    h ^= ZH[pc * 128 + f] ^ ZH[np * 128 + t];
    if ((pc & 7) === K) kingSq[us] = t;
    castle &= castleClear[f] & castleClear[t];
    halfmove = ((pc & 7) === P || cap) ? 0 : halfmove + 1;
  }
  uCap[sp] = cap;
  sp++;
  ep = (fl & 4) ? (f + t) >> 1 : -1;
  if (ep >= 0) { l ^= ZEP_L[ep & 7]; h ^= ZEP_H[ep & 7]; }
  l ^= ZCAS_L[castle] ^ ZSIDE_L; h ^= ZCAS_H[castle] ^ ZSIDE_H;
  side = us ^ 1;
  hashL = l; hashH = h;
  histL[histN] = l; histH[histN] = h; histN++;
}

function unmakeMove(m) {
  const f = m & 127, t = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
  sp--; histN--;
  side ^= 1;
  const us = side;
  ep = uEp[sp]; castle = uCas[sp]; halfmove = uHm[sp]; hashL = uHL[sp]; hashH = uHH[sp];
  if (fl & 1) {
    const rowBase = us === 0 ? 0 : 112;
    const kt = rowBase + (t > f ? 6 : 2), rt = rowBase + (t > f ? 5 : 3);
    board[kt] = 0; board[rt] = 0; board[f] = us * 8 + K; board[t] = us * 8 + R;
    kingSq[us] = f;
  } else {
    const np = board[t];
    const pc = pr ? us * 8 + P : np;
    board[f] = pc;
    if (fl & 2) {
      board[t] = 0;
      board[us === 0 ? t - 16 : t + 16] = uCap[sp];
    } else board[t] = uCap[sp];
    if ((pc & 7) === K) kingSq[us] = f;
  }
}

function makeNull() {
  uEp[sp] = ep; uCas[sp] = castle; uHm[sp] = halfmove; uHL[sp] = hashL; uHH[sp] = hashH; uCap[sp] = 0;
  sp++;
  if (ep >= 0) { hashL ^= ZEP_L[ep & 7]; hashH ^= ZEP_H[ep & 7]; }
  ep = -1; hashL ^= ZSIDE_L; hashH ^= ZSIDE_H; side ^= 1; halfmove++;
  histL[histN] = hashL; histH[histN] = hashH; histN++;
}
function unmakeNull() {
  sp--; histN--; side ^= 1;
  ep = uEp[sp]; castle = uCas[sp]; halfmove = uHm[sp]; hashL = uHL[sp]; hashH = uHH[sp];
}

function sqName(s) { return String.fromCharCode(97 + (s & 7)) + String.fromCharCode(49 + (s >> 4)); }
function uciOf(m) {
  const pr = (m >> 14) & 7;
  return sqName(m & 127) + sqName((m >> 7) & 127) + (pr ? ' pnbrqk'[pr] : '');
}
function parseSq(s) { return (s.charCodeAt(0) - 97) + 16 * (s.charCodeAt(1) - 49); }

function setFen(fen) {
  const parts = fen.trim().split(/\s+/);
  board.fill(0);
  let rank = 7, file = 0;
  for (const ch of parts[0]) {
    if (ch === '/') { rank--; file = 0; continue; }
    if (ch >= '1' && ch <= '8') { file += +ch; continue; }
    const lower = ch.toLowerCase();
    const t = 'pnbrqk'.indexOf(lower) + 1;
    const c = ch === lower ? 1 : 0;
    const sq = rank * 16 + file;
    board[sq] = c * 8 + t;
    if (t === K) kingSq[c] = sq;
    file++;
  }
  side = parts[1] === 'b' ? 1 : 0;
  castle = 0;
  for (let i = 0; i < 4; i++) { castleRook[i] = -1; castleKing[i] = -1; }
  const cr = parts[2] || '-';
  if (cr !== '-') {
    for (const ch of cr) {
      const c = ch === ch.toUpperCase() ? 0 : 1;
      const up = ch.toUpperCase();
      const k = kingSq[c];
      const rowBase = c === 0 ? 0 : 112;
      let rf;
      if (up === 'K' || up === 'Q') {
        rf = -1;
        if (up === 'K') { for (let f = 7; f > (k & 7); f--) if (board[rowBase + f] === c * 8 + R) { rf = f; break; } }
        else { for (let f = 0; f < (k & 7); f++) if (board[rowBase + f] === c * 8 + R) { rf = f; break; } }
        if (rf < 0) continue;
      } else rf = up.charCodeAt(0) - 65;
      const r = rowBase + rf;
      const slot = c * 2 + (r > k ? 0 : 1);
      castleRook[slot] = r; castleKing[slot] = k; castle |= 1 << slot;
    }
  }
  castleClear.fill(15);
  for (let s = 0; s < 4; s++) {
    if (castleRook[s] < 0) continue;
    castleClear[castleRook[s]] &= ~(1 << s);
    castleClear[castleKing[s]] &= ~(s < 2 ? 3 : 12);
  }
  ep = parts[3] && parts[3] !== '-' ? parseSq(parts[3]) : -1;
  halfmove = +(parts[4] || 0);
  sp = 0; histN = 0;
  computeHash();
  histL[histN] = hashL; histH[histN] = hashH; histN++;
}

const tmpList = new Int32Array(256);
function legalList() {
  const n = genMoves(tmpList, false);
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = tmpList[i];
    makeMove(m);
    if (!attacked(kingSq[side ^ 1], side)) out.push(m);
    unmakeMove(m);
  }
  return out;
}

// ---------------- Evaluation ----------------
const pawnMaxW = new Int8Array(10), pawnMinW = new Int8Array(10), pawnMaxB = new Int8Array(10), pawnMinB = new Int8Array(10);
const pawnCntW = new Int8Array(10), pawnCntB = new Int8Array(10);
const pawnSqs = new Int16Array(32);

function evaluate() {
  let mg = 0, eg = 0, phase = 0;
  let bishopsW = 0, bishopsB = 0, npW = 0, npB = 0, pawnsW = 0, pawnsB = 0;
  let minorsW = 0, minorsB = 0;
  pawnCntW.fill(0); pawnCntB.fill(0);
  pawnMaxW.fill(-1); pawnMaxB.fill(-1); pawnMinW.fill(8); pawnMinB.fill(8);
  let np = 0;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = board[sq];
    if (!pc) continue;
    const c = pc >> 3, t = pc & 7;
    if (c === 0) { mg += MG[0][t][sq]; eg += EG[0][t][sq]; }
    else { mg -= MG[1][t][sq]; eg -= EG[1][t][sq]; }
    phase += PHASE_W[t];
    if (t === P) {
      const f = (sq & 7) + 1, r = sq >> 4;
      pawnSqs[np++] = sq;
      if (c === 0) { pawnsW++; pawnCntW[f]++; if (r > pawnMaxW[f]) pawnMaxW[f] = r; if (r < pawnMinW[f]) pawnMinW[f] = r; }
      else { pawnsB++; pawnCntB[f]++; if (r > pawnMaxB[f]) pawnMaxB[f] = r; if (r < pawnMinB[f]) pawnMinB[f] = r; }
    } else if (t !== K) {
      if (c === 0) { npW += SEE_V[t]; if (t <= B) minorsW++; } else { npB += SEE_V[t]; if (t <= B) minorsB++; }
      if (t === B) { if (c === 0) bishopsW++; else bishopsB++; }
      // mobility
      if (t !== N) {
        let mob = 0;
        const dirs = t === B ? BISHOP_D : t === R ? ROOK_D : KING_D;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i];
          for (let s = sq + d; !(s & 0x88); s += d) {
            const x = board[s];
            if (x) { if ((x >> 3) !== c) mob++; break; }
            mob++;
          }
        }
        const w = t === B ? 4 : t === R ? 3 : 1;
        const base = t === B ? 6 : t === R ? 6 : 12;
        const sc = (mob - base) * w;
        if (c === 0) { mg += sc; eg += sc; } else { mg -= sc; eg -= sc; }
      } else {
        let mob = 0;
        for (let i = 0; i < 8; i++) {
          const s = sq + KNIGHT_D[i];
          if (!(s & 0x88) && (!board[s] || (board[s] >> 3) !== c)) mob++;
        }
        const sc = (mob - 4) * 4;
        if (c === 0) { mg += sc; eg += sc; } else { mg -= sc; eg -= sc; }
      }
      if (t === R) {
        const f = (sq & 7) + 1;
        // filled later after pawns known: store
      }
    }
  }
  // Rook file bonuses (second pass over rooks quickly)
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = board[sq];
    if ((pc & 7) !== R) continue;
    const f = (sq & 7) + 1;
    const own = pc >> 3 ? pawnCntB[f] : pawnCntW[f];
    const opp = pc >> 3 ? pawnCntW[f] : pawnCntB[f];
    let sc = 0;
    if (!own) sc = opp ? 12 : 25;
    if (pc >> 3) { mg -= sc; eg -= sc >> 1; } else { mg += sc; eg += sc >> 1; }
  }
  // Pawn structure
  for (let i = 0; i < np; i++) {
    const sq = pawnSqs[i], c = board[sq] >> 3, f = (sq & 7) + 1, r = sq >> 4;
    let smg = 0, seg = 0;
    if (c === 0) {
      if (pawnCntW[f] > 1) { smg -= 8; seg -= 18; }
      if (!pawnCntW[f - 1] && !pawnCntW[f + 1]) { smg -= 10; seg -= 12; }
      if (pawnMaxB[f] <= r && pawnMaxB[f - 1] <= r && pawnMaxB[f + 1] <= r && pawnMaxW[f] === r) {
        smg += PASSED_MG[r]; seg += PASSED_EG[r];
        const front = sq + 16;
        if (!(front & 0x88) && board[front]) seg -= PASSED_EG[r] >> 2;
        // king proximity in endgame
        const kd = dist(kingSq[1], front) - dist(kingSq[0], front);
        seg += kd * 4 * (r >= 3 ? r - 1 : 1);
      }
      mg += smg; eg += seg;
    } else {
      const rr = 7 - r;
      if (pawnCntB[f] > 1) { smg -= 8; seg -= 18; }
      if (!pawnCntB[f - 1] && !pawnCntB[f + 1]) { smg -= 10; seg -= 12; }
      if (pawnMinW[f] >= r && pawnMinW[f - 1] >= r && pawnMinW[f + 1] >= r && pawnMinB[f] === r) {
        smg += PASSED_MG[rr]; seg += PASSED_EG[rr];
        const front = sq - 16;
        if (!(front & 0x88) && board[front]) seg -= PASSED_EG[rr] >> 2;
        const kd = dist(kingSq[0], front) - dist(kingSq[1], front);
        seg += kd * 4 * (rr >= 3 ? rr - 1 : 1);
      }
      mg -= smg; eg -= seg;
    }
  }
  if (bishopsW >= 2) { mg += 30; eg += 50; }
  if (bishopsB >= 2) { mg -= 30; eg -= 50; }
  // King shield (middlegame)
  mg += kingShield(0) - kingShield(1);
  if (phase > 24) phase = 24;
  let score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
  // mop-up for winning endgames without pawns on losing side
  if (phase <= 8) {
    const diff = (npW + pawnsW * 100) - (npB + pawnsB * 100);
    if (diff > 250 && pawnsB === 0) score += mopUp(kingSq[1], kingSq[0]);
    else if (diff < -250 && pawnsW === 0) score -= mopUp(kingSq[0], kingSq[1]);
  }
  // draw scaling
  if (pawnsW === 0 && npW <= 330 && score > 0) score >>= 3;
  if (pawnsB === 0 && npB <= 330 && score < 0) score >>= 3;
  if (pawnsW === 0 && pawnsB === 0 && npW <= 330 && npB <= 330) return 0;
  score += side === 0 ? 10 : -10;
  return side === 0 ? score : -score;
}

function dist(a, b) {
  return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4)));
}
function mopUp(loserK, winnerK) {
  const lf = loserK & 7, lr = loserK >> 4;
  const cd = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4);
  return cd * 12 + (14 - 2 * dist(loserK, winnerK)) * 6;
}
function kingShield(c) {
  const k = kingSq[c];
  const kr = k >> 4;
  if (c === 0 ? kr > 1 : kr < 6) return -15;
  const fwd = c === 0 ? 16 : -16;
  const pawn = c * 8 + P;
  let s = 0;
  for (let df = -1; df <= 1; df++) {
    const f = (k & 7) + df;
    if (f < 0 || f > 7) continue;
    const s1 = k + df + fwd, s2 = s1 + fwd;
    if (board[s1] === pawn) s += 12;
    else if (!(s2 & 0x88) && board[s2] === pawn) s += 6;
    else s -= 8;
  }
  return s;
}

// ---------------- Search ----------------
const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);
const killers = new Int32Array(256 * 2);
const historyT = new Int32Array(16 * 128);
const moveLists = []; const scoreLists = [];
for (let i = 0; i < 128; i++) { moveLists.push(new Int32Array(256)); scoreLists.push(new Int32Array(256)); }

let nodes = 0, deadline = 0, stopped = false, rootPlyGame = 0, maxPlies = 400;

function timeUp() {
  if ((++nodes & 1023) === 0 && Date.now() >= deadline) stopped = true;
  return stopped;
}

function isRepetition() {
  // compare current hash with previous same-side positions within halfmove window
  const lim = Math.max(0, histN - 1 - halfmove);
  for (let i = histN - 3; i >= lim; i -= 2) {
    if (histL[i] === hashL && histH[i] === hashH) return true;
  }
  return false;
}

function scoreMoves(list, scores, n, ttm, ply) {
  const k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
  for (let i = 0; i < n; i++) {
    const m = list[i];
    if (m === ttm) { scores[i] = 10000000; continue; }
    const f = m & 127, t = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
    const victim = (fl & 1) ? 0 : (fl & 2) ? P : board[t] & 7;
    if (victim || pr === Q) {
      scores[i] = 1000000 + SEE_V[victim] * 10 - (board[f] & 7) + (pr === Q ? 9000 : 0);
    } else if (m === k1) scores[i] = 900000;
    else if (m === k2) scores[i] = 800000;
    else scores[i] = historyT[board[f] * 128 + t] + (pr ? -5000 : 0);
  }
}
function pickNext(list, scores, n, i) {
  let bi = i, bs = scores[i];
  for (let j = i + 1; j < n; j++) if (scores[j] > bs) { bs = scores[j]; bi = j; }
  if (bi !== i) {
    const tm = list[i]; list[i] = list[bi]; list[bi] = tm;
    const ts = scores[i]; scores[i] = scores[bi]; scores[bi] = ts;
  }
  return list[i];
}

function quiesce(alpha, beta, ply) {
  if (timeUp()) return 0;
  const stand = evaluate();
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (ply >= 120) return stand;
  const list = moveLists[ply], scores = scoreLists[ply];
  const n = genMoves(list, true);
  scoreMoves(list, scores, n, 0, ply);
  const us = side;
  for (let i = 0; i < n; i++) {
    const m = pickNext(list, scores, n, i);
    const t = (m >> 7) & 127, fl = m >> 17, pr = (m >> 14) & 7;
    const victim = (fl & 2) ? P : board[t] & 7;
    // delta pruning
    if (!pr && stand + SEE_V[victim] + 200 < alpha) continue;
    // skip obviously losing captures: big piece takes defended small piece
    const att = board[m & 127] & 7;
    if (!pr && SEE_V[att] > SEE_V[victim] + 50 && pawnDefended(t, us ^ 1)) continue;
    makeMove(m);
    if (attacked(kingSq[us], side)) { unmakeMove(m); continue; }
    const sc = -quiesce(-beta, -alpha, ply + 1);
    unmakeMove(m);
    if (stopped) return 0;
    if (sc > alpha) { alpha = sc; if (sc >= beta) return sc; }
  }
  return alpha;
}
function pawnDefended(sq, c) {
  // is sq defended by pawn of color c
  if (c === 0) {
    let s = sq - 15; if (!(s & 0x88) && board[s] === P) return true;
    s = sq - 17; if (!(s & 0x88) && board[s] === P) return true;
  } else {
    let s = sq + 15; if (!(s & 0x88) && board[s] === 8 + P) return true;
    s = sq + 17; if (!(s & 0x88) && board[s] === 8 + P) return true;
  }
  return false;
}

function hasNonPawn(c) {
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = board[sq];
    if (pc && (pc >> 3) === c) { const t = pc & 7; if (t !== P && t !== K) return true; }
  }
  return false;
}

function search(depth, alpha, beta, ply, allowNull) {
  if (timeUp()) return 0;
  if (ply > 0) {
    if (halfmove >= 100 || isRepetition()) return 0;
    if (rootPlyGame + ply >= maxPlies) return 0;
    // mate distance pruning
    const ma = -MATE + ply, mb = MATE - ply - 1;
    if (alpha < ma) alpha = ma;
    if (beta > mb) beta = mb;
    if (alpha >= beta) return alpha;
  }
  const us = side;
  const inCheck = attacked(kingSq[us], us ^ 1);
  if (inCheck) depth++;
  if (depth <= 0) return quiesce(alpha, beta, ply);
  if (ply >= 120) return evaluate();

  const idx = hashL & TT_MASK;
  let ttm = 0;
  const pv = beta - alpha > 1;
  if (ttKey[idx] === hashH) {
    ttm = ttMove[idx];
    if (ttDepth[idx] >= depth && ply > 0) {
      let s = ttScore[idx];
      if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
      const fl = ttFlag[idx];
      if (!pv && (fl === 0 || (fl === 1 && s >= beta) || (fl === 2 && s <= alpha))) return s;
    }
  }

  let staticEval = 0;
  if (!inCheck && !pv) {
    staticEval = evaluate();
    // reverse futility
    if (depth <= 3 && staticEval - 120 * depth >= beta && Math.abs(beta) < MATE - 200) return staticEval;
    // null move
    if (allowNull && depth >= 3 && staticEval >= beta && hasNonPawn(us)) {
      makeNull();
      const Rd = 3 + (depth >> 2);
      const sc = -search(depth - 1 - Rd, -beta, -beta + 1, ply + 1, false);
      unmakeNull();
      if (stopped) return 0;
      if (sc >= beta) return sc >= MATE - 200 ? beta : sc;
    }
  }
  // internal iterative deepening substitute
  if (!ttm && pv && depth >= 5) {
    search(depth - 2, alpha, beta, ply, true);
    if (stopped) return 0;
    if (ttKey[idx] === hashH) ttm = ttMove[idx];
  }

  const list = moveLists[ply], scores = scoreLists[ply];
  const n = genMoves(list, false);
  scoreMoves(list, scores, n, ttm, ply);
  let best = -INF, bestMove = 0, legal = 0;
  const origAlpha = alpha;
  const futile = !inCheck && !pv && depth <= 2 && (staticEval + 150 * depth <= alpha);
  for (let i = 0; i < n; i++) {
    const m = pickNext(list, scores, n, i);
    const t = (m >> 7) & 127, fl = m >> 17, pr = (m >> 14) & 7;
    const isCap = (fl & 2) || (!(fl & 1) && board[t]);
    const quiet = !isCap && !pr;
    makeMove(m);
    if (attacked(kingSq[us], side)) { unmakeMove(m); continue; }
    legal++;
    const givesCheck = attacked(kingSq[side], us);
    if (futile && quiet && legal > 1 && !givesCheck) { unmakeMove(m); continue; }
    let sc;
    if (legal === 1) {
      sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
    } else {
      let red = 0;
      if (depth >= 3 && quiet && !inCheck && !givesCheck && legal > 3) {
        red = 1 + ((legal > 8) ? 1 : 0) + (depth >= 8 ? 1 : 0);
        if (pv) red--;
        if (red > depth - 2) red = depth - 2;
        if (red < 0) red = 0;
      }
      sc = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (sc > alpha && red) sc = -search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (sc > alpha && sc < beta) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
    }
    unmakeMove(m);
    if (stopped) return 0;
    if (sc > best) {
      best = sc; bestMove = m;
      if (sc > alpha) {
        alpha = sc;
        if (ply === 0) rootBest = m;
        if (sc >= beta) {
          if (quiet) {
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            const hi = board[m & 127] * 128 + t;
            historyT[hi] += depth * depth;
            if (historyT[hi] > 400000) for (let j = 0; j < historyT.length; j++) historyT[j] >>= 1;
          }
          break;
        }
      }
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  let st = best;
  if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
  ttKey[idx] = hashH; ttMove[idx] = bestMove; ttScore[idx] = st; ttDepth[idx] = depth;
  ttFlag[idx] = best >= beta ? 1 : best > origAlpha ? 0 : 2;
  return best;
}

let rootBest = 0;
let rootMoves = null;

function searchRoot(depth, alpha, beta) {
  // root search restricted to rootMoves, ordered
  const us = side;
  let best = -INF, legal = 0;
  for (let i = 0; i < rootMoves.length; i++) {
    const m = rootMoves[i];
    makeMove(m);
    legal++;
    let sc;
    if (legal === 1) sc = -search(depth - 1, -beta, -alpha, 1, true);
    else {
      sc = -search(depth - 1, -alpha - 1, -alpha, 1, true);
      if (sc > alpha && sc < beta) sc = -search(depth - 1, -beta, -alpha, 1, true);
    }
    unmakeMove(m);
    if (stopped) return best;
    if (sc > best) {
      best = sc;
      if (sc > alpha) {
        alpha = sc; rootBest = m;
        // move to front
        rootMoves.splice(i, 1); rootMoves.unshift(m);
      }
    }
    if (alpha >= beta) break;
  }
  void us;
  return best;
}

function chooseMove(state) {
  const start = Date.now();
  const limit = Math.min(600, Math.max(50, (state.timeLimitMs || 1000) * 0.6));
  maxPlies = state.maxPlies || 400;
  // setup position: replay history from initialFen
  let ok = true;
  try {
    setFen(state.initialFen);
    for (const u of state.history) {
      const lm = legalList();
      let found = 0;
      for (const m of lm) if (uciOf(m) === u) { found = m; break; }
      if (!found) { ok = false; break; }
      makeMove(found);
      if (halfmove === 0) {
        // keep history but it's fine; repetition scan limited by halfmove
      }
    }
  } catch (e) { ok = false; }
  if (!ok) setFen(state.fen);
  // reset stacks base so search can use full depth (history kept in histL)
  sp = 0;
  rootPlyGame = state.ply || 0;

  const legalSet = new Set(state.legalMoves);
  const mine = legalList().filter(m => legalSet.has(uciOf(m)));
  if (!mine.length) return null;
  if (mine.length === 1) return uciOf(mine[0]);
  // order root moves initially by quick score
  const sc = new Map();
  for (const m of mine) {
    makeMove(m);
    sc.set(m, -quiesceSafe());
    unmakeMove(m);
  }
  rootMoves = mine.sort((a, b) => sc.get(b) - sc.get(a));
  rootBest = rootMoves[0];
  let best = rootBest;
  deadline = start + limit;
  stopped = false; nodes = 0;
  killers.fill(0);
  for (let i = 0; i < historyT.length; i++) historyT[i] >>= 2;
  let lastScore = 0;
  for (let depth = 1; depth <= 64; depth++) {
    let alpha = -INF, beta = INF;
    if (depth >= 4) { alpha = lastScore - 40; beta = lastScore + 40; }
    let s = searchRoot(depth, alpha, beta);
    if (!stopped && (s <= alpha || s >= beta)) {
      s = searchRoot(depth, -INF, INF);
    }
    if (stopped) { if (rootBest) best = rootBest; break; }
    best = rootBest; lastScore = s; if (globalThis.__DBG) console.log("d", depth, s, uciOf(best), nodes, Date.now() - start);
    if (Math.abs(s) > MATE - 100 && depth > 6) break;
    const el = Date.now() - start;
    if (el > limit * 0.5) break;
  }
  return uciOf(best);
}
function quiesceSafe() {
  deadline = Date.now() + 1000; stopped = false;
  return quiesce(-INF, INF, 1);
}

function move(state) {
  let res = null;
  try { res = chooseMove(state); } catch (e) { res = null; }
  if (!res || state.legalMoves.indexOf(res) < 0) {
    res = state.legalMoves[0];
  }
  return res;
}

module.exports = move;
module.exports.botName = BOT_NAME;
try { Object.defineProperty(move, "name", { value: BOT_NAME }); } catch (e) { /* ignore */ }
module.exports._perft = function (fen, depth) {
  setFen(fen);
  function visit(d) {
    const ms = legalList();
    if (d === 1) return ms.length;
    let c = 0;
    for (const m of ms) { makeMove(m); c += visit(d - 1); unmakeMove(m); }
    return c;
  }
  return visit(depth);
};
