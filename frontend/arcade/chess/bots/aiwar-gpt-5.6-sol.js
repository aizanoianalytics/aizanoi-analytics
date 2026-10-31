'use strict';

// Aegis: a time-managed alpha-beta engine using the arena engine's reversible core.
const NAME = 'Aegis';
const INF = 2000000;
const MATE = 1000000;
const TIMEOUT = {};
const TT_SIZE = 1 << 18;
const TT_MASK = TT_SIZE - 1;
const ttKey = new Int32Array(TT_SIZE);
const ttLock = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE); // 1 exact, 2 lower, 3 upper
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttAge = new Uint8Array(TT_SIZE);
let generation = 0;
let cached = null;
let cachedInitial = '';
let cachedVariant = '';
let cachedHistory = [];

const V = [0, 100, 325, 335, 510, 950, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const killers = Array.from({ length: 96 }, () => [0, 0]);
const hist = new Int32Array(2 * 128 * 128);

function code(m) { return (m.f << 11) | (m.t << 4) | (m.p || 0); }
function sameCode(m, c) { return c && code(m) === c; }
function histIndex(side, m) { return (side < 0 ? 16384 : 0) + m.f * 128 + m.t; }

function sync(state) {
  const CE = globalThis.ChessEngine;
  let ok = cached && cachedInitial === state.initialFen && cachedVariant === state.variant &&
    cachedHistory.length <= state.history.length;
  if (ok) {
    for (let i = 0; i < cachedHistory.length; i++) {
      if (cachedHistory[i] !== state.history[i]) { ok = false; break; }
    }
  }
  if (!ok) {
    cached = CE.fromBotState(state);
  } else {
    for (let i = cachedHistory.length; i < state.history.length; i++) {
      if (!cached.move(state.history[i]).ok) { ok = false; break; }
    }
    if (!ok || cached.fen() !== state.fen) cached = CE.fromBotState(state);
  }
  cachedInitial = state.initialFen;
  cachedVariant = state.variant;
  cachedHistory = state.history.slice();
  return cached;
}

// Compact opening repertoire. It is deliberately bypassed in Chess960.
const BOOK = (() => {
  const b = Object.create(null);
  const add = (h, moves) => { b[h.join(' ')] = moves; };
  add([], ['e2e4', 'd2d4']);
  add(['e2e4', 'e7e5'], ['g1f3']);
  add(['e2e4', 'c7c5'], ['g1f3']);
  add(['e2e4', 'e7e6'], ['d2d4']);
  add(['e2e4', 'c7c6'], ['d2d4']);
  add(['e2e4', 'd7d5'], ['e4d5']);
  add(['d2d4', 'd7d5'], ['c2c4']);
  add(['d2d4', 'g8f6'], ['c2c4']);
  add(['e2e4', 'e7e5', 'g1f3', 'b8c6'], ['f1b5', 'f1c4']);
  add(['e2e4', 'c7c5', 'g1f3', 'd7d6'], ['d2d4']);
  add(['e2e4', 'c7c5', 'g1f3', 'b8c6'], ['d2d4']);
  add(['e2e4', 'c7c5', 'g1f3', 'e7e6'], ['d2d4']);
  add(['d2d4', 'd7d5', 'c2c4', 'e7e6'], ['b1c3', 'g1f3']);
  add(['d2d4', 'g8f6', 'c2c4', 'e7e6'], ['b1c3', 'g1f3']);
  add(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'], ['b5a4']);
  add(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'], ['d2d3', 'f3g5']);
  add(['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'], ['f3d4']);
  return b;
})();

function bookMove(state) {
  if (state.variant !== 'standard') return null;
  const choices = BOOK[state.history.join(' ')];
  if (!choices) return null;
  const legal = choices.filter(x => state.legalMoves.includes(x));
  return legal.length ? legal[Math.floor(Math.random() * legal.length)] : null;
}

function hashPosition(g) {
  let h = 0x811c9dc5 | 0, l = 0x9e3779b9 | 0;
  const b = g._board;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (p) {
      const x = ((p + 7) * 131 + s * 17) | 0;
      h = Math.imul(h ^ x, 16777619);
      l = Math.imul(l + x + (l << 6), 0x85ebca6b);
    }
  }
  h ^= g._side > 0 ? 0x13579bdf : 0x2468ace0;
  l ^= (g._ep + 2) * 0x45d9f3b;
  for (const r of g._rights) {
    h = Math.imul(h ^ (r.r + 3 * r.k + (r.color > 0 ? 71 : 193)), 16777619);
  }
  h ^= g._halfmove * 977;
  return [h | 0, l | 0];
}

function repKey(g, legal) {
  const f = g.fen().split(' ');
  if (f[3] !== '-' && !legal.some(m => m.ep)) f[3] = '-';
  return f.slice(0, 4).join(' ');
}

function insufficient(g) {
  let count = 0, allBishops = true, color = -1;
  const b = g._board;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const t = Math.abs(b[s]);
    if (!t || t === 6) continue;
    count++;
    if (t !== 3) allBishops = false;
    if (t !== 2 && t !== 3) return false;
    if (t === 3) {
      const c = ((s & 7) + (s >> 4)) & 1;
      if (color < 0) color = c;
      else if (color !== c) allBishops = false;
    }
  }
  return count < 2 || allBishops;
}

function evaluate(g) {
  const b = g._board;
  let mg = 0, eg = 0, phase = 0;
  const pawnsW = new Int8Array(8), pawnsB = new Int8Array(8);
  let bishopsW = 0, bishopsB = 0;
  let kingW = -1, kingB = -1;

  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if (!p) continue;
    const side = p > 0 ? 1 : -1, t = Math.abs(p), f = s & 7, r = s >> 4;
    const rr = side > 0 ? r : 7 - r;
    const center = 7 - Math.abs(2 * f - 7) - Math.abs(2 * r - 7);
    let pm = 0, pe = 0;
    if (t === 1) { pm = rr * 7 + center * 2; pe = rr * 12 + center; (side > 0 ? pawnsW : pawnsB)[f]++; }
    else if (t === 2) { pm = center * 8 - (rr === 0 ? 18 : 0); pe = center * 5; }
    else if (t === 3) { pm = center * 5 + rr * 2; pe = center * 4; side > 0 ? bishopsW++ : bishopsB++; }
    else if (t === 4) { pm = rr * 3 + (f === 0 || f === 7 ? -2 : 0); pe = center * 2 + rr * 4; }
    else if (t === 5) { pm = center * 2; pe = center * 3; }
    else {
      if (side > 0) kingW = s; else kingB = s;
      pm = -center * 7 - rr * 3;
      pe = center * 9 + rr * 2;
    }
    mg += side * (V[t] + pm);
    eg += side * (V[t] + pe);
    phase += PHASE[t];
  }
  if (bishopsW >= 2) { mg += 32; eg += 45; }
  if (bishopsB >= 2) { mg -= 32; eg -= 45; }

  for (let f = 0; f < 8; f++) {
    if (pawnsW[f] > 1) { mg -= 13 * (pawnsW[f] - 1); eg -= 18 * (pawnsW[f] - 1); }
    if (pawnsB[f] > 1) { mg += 13 * (pawnsB[f] - 1); eg += 18 * (pawnsB[f] - 1); }
    if (pawnsW[f] && !(pawnsW[f - 1] || pawnsW[f + 1])) { mg -= 11; eg -= 8; }
    if (pawnsB[f] && !(pawnsB[f - 1] || pawnsB[f + 1])) { mg += 11; eg += 8; }
  }

  // Passed pawns and rook files, kept in one cheap second scan.
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if (!p) continue;
    const side = p > 0 ? 1 : -1, t = Math.abs(p), f = s & 7, r = s >> 4;
    if (t === 1) {
      let passed = true;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && passed; ff++) {
        for (let rr = r + side; rr >= 0 && rr < 8; rr += side) {
          if (b[rr * 16 + ff] === -side) { passed = false; break; }
        }
      }
      if (passed) {
        const adv = side > 0 ? r : 7 - r, bonus = adv * adv * 3;
        mg += side * (bonus >> 1); eg += side * bonus;
      }
    } else if (t === 4) {
      const own = side > 0 ? pawnsW[f] : pawnsB[f], opp = side > 0 ? pawnsB[f] : pawnsW[f];
      mg += side * (!own ? (!opp ? 20 : 10) : 0);
    }
  }

  // Generic king shelter works in standard and Chess960.
  for (const pair of [[kingW, 1], [kingB, -1]]) {
    const k = pair[0], side = pair[1]; if (k < 0) continue;
    const f = k & 7, r = k >> 4, front = r + side;
    let shelter = 0;
    if (front >= 0 && front < 8) for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
      if (b[front * 16 + ff] === side) shelter += 9;
    }
    mg += side * shelter;
  }

  phase = Math.min(24, phase);
  const score = (mg * phase + eg * (24 - phase)) / 24;
  return (g._side > 0 ? score : -score) + 8;
}

function isCapture(g, m) {
  if (m.castle) return false;
  const target = g._board[m.t];
  return Boolean(m.ep || (target && (target > 0) !== (g._side > 0)));
}

function moveScore(g, m, tt, ply) {
  const c = code(m);
  if (c === tt) return 2000000000;
  if (m.p) return 900000 + V[m.p] * 20 + (isCapture(g, m) ? 20000 : 0);
  if (isCapture(g, m)) {
    const victim = m.ep ? 1 : Math.abs(g._board[m.t]);
    const attacker = Math.abs(g._board[m.f]);
    return 700000 + V[victim] * 16 - V[attacker];
  }
  if (m.castle) return 500000;
  if (killers[ply][0] === c) return 400000;
  if (killers[ply][1] === c) return 399000;
  return hist[histIndex(g._side, m)];
}

function orderMoves(g, moves, tt, ply) {
  const a = moves.map(m => [m, moveScore(g, m, tt, ply)]);
  a.sort((x, y) => y[1] - x[1]);
  return a.map(x => x[0]);
}

function moveBot(state) {
  if (!state.legalMoves || !state.legalMoves.length) return undefined;
  let answer = state.legalMoves[0];
  if (state.legalMoves.length === 1) return answer;
  const bm = bookMove(state);
  if (bm) return bm;

  const started = Date.now();
  const budget = Math.max(70, Math.min(800, (state.timeLimitMs || 1000) - 180));
  const deadline = started + budget;
  let g;
  try { g = sync(state); } catch (_) { return answer; }
  if (Date.now() >= deadline - 20) return answer;

  generation = (generation + 1) & 255;
  const reps = new Map(g._repetitions);
  let nodes = 0;
  const rootPly = state.ply;
  function checkTime() {
    if ((++nodes & 127) === 0 && Date.now() >= deadline) throw TIMEOUT;
  }

  function drawAfterLegal(legal, sp) {
    if (g._halfmove >= 100 || rootPly + sp >= state.maxPlies || insufficient(g)) return true;
    if (g._halfmove >= 4) {
      const k = repKey(g, legal);
      if ((reps.get(k) || 0) >= 3) return true;
    }
    return false;
  }

  function pushRep(legal) {
    if (g._halfmove < 4) return null;
    const k = repKey(g, legal);
    reps.set(k, (reps.get(k) || 0) + 1);
    return k;
  }
  function popRep(k) {
    if (!k) return;
    const n = reps.get(k) || 0;
    if (n <= 1) reps.delete(k); else reps.set(k, n - 1);
  }

  function qsearch(alpha, beta, ply, qdepth) {
    checkTime();
    const inCheck = g.inCheck();
    const legal = g._legal();
    if (!legal.length) return inCheck ? -MATE + ply : 0;
    if (drawAfterLegal(legal, ply)) return 0;
    let stand = evaluate(g);
    if (!inCheck) {
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (qdepth <= 0) return stand;
    }
    const tactical = inCheck ? legal : legal.filter(m => isCapture(g, m) || m.p);
    if (!tactical.length) return stand;
    const ordered = orderMoves(g, tactical, 0, ply);
    for (const m of ordered) {
      if (!inCheck && !m.p) {
        const victim = m.ep ? 100 : V[Math.abs(g._board[m.t])];
        if (stand + victim + 120 < alpha) continue;
      }
      const undo = g._make(m);
      let key = null, score;
      try {
        const childLegal = g._legal();
        key = pushRep(childLegal);
        score = -qsearch(-beta, -alpha, ply + 1, qdepth - 1);
      } finally { popRep(key); g._unmake(undo); }
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply, pvNode) {
    checkTime();
    const alphaOrig = alpha;
    const inCheck = g.inCheck();
    const legal = g._legal();
    if (!legal.length) return inCheck ? -MATE + ply : 0;
    if (drawAfterLegal(legal, ply)) return 0;
    if (depth <= 0) return qsearch(alpha, beta, ply, 5);
    if (inCheck && depth < 7) depth++;

    const h = hashPosition(g), idx = h[0] & TT_MASK;
    let ttBest = 0;
    if (ttAge[idx] === generation && ttKey[idx] === h[0] && ttLock[idx] === h[1]) {
      ttBest = ttMove[idx];
      if (ttDepth[idx] >= depth) {
        let s = ttScore[idx];
        if (s > MATE - 1000) s -= ply;
        else if (s < -MATE + 1000) s += ply;
        if (ttFlag[idx] === 1) return s;
        if (ttFlag[idx] === 2 && s >= beta) return s;
        if (ttFlag[idx] === 3 && s <= alpha) return s;
      }
    }

    const ordered = orderMoves(g, legal, ttBest, ply);
    let best = -INF, bestCode = 0, count = 0;
    for (const m of ordered) {
      count++;
      const quiet = !isCapture(g, m) && !m.p && !m.castle;
      const undo = g._make(m);
      let key = null, score;
      try {
        const givesCheck = g.inCheck();
        const childLegal = g._legal();
        key = pushRep(childLegal);
        let reduction = 0;
        if (depth >= 3 && count > (pvNode ? 5 : 3) && quiet && !inCheck && !givesCheck) {
          reduction = depth >= 6 && count > 8 ? 2 : 1;
        }
        if (count === 1) {
          score = -search(depth - 1, -beta, -alpha, ply + 1, pvNode);
        } else {
          score = -search(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, false);
          if (score > alpha && reduction) score = -search(depth - 1, -alpha - 1, -alpha, ply + 1, false);
          if (score > alpha && score < beta) score = -search(depth - 1, -beta, -alpha, ply + 1, pvNode);
        }
      } finally { popRep(key); g._unmake(undo); }
      if (score > best) { best = score; bestCode = code(m); }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (quiet) {
          const c = code(m);
          if (killers[ply][0] !== c) { killers[ply][1] = killers[ply][0]; killers[ply][0] = c; }
          const hi = histIndex(g._side, m);
          hist[hi] = Math.min(200000, hist[hi] + depth * depth * 8);
        }
        break;
      }
    }

    let stored = best;
    if (stored > MATE - 1000) stored += ply;
    else if (stored < -MATE + 1000) stored -= ply;
    if (ttAge[idx] !== generation || depth >= ttDepth[idx]) {
      ttKey[idx] = h[0]; ttLock[idx] = h[1]; ttDepth[idx] = depth;
      ttScore[idx] = stored; ttMove[idx] = bestCode; ttAge[idx] = generation;
      ttFlag[idx] = best <= alphaOrig ? 3 : best >= beta ? 2 : 1;
    }
    return best;
  }

  let previousScore = 0;
  try {
    for (let depth = 1; depth <= 32; depth++) {
      const rootMoves = orderMoves(g, g._legal(), 0, 0);
      let alpha = depth >= 3 ? previousScore - 45 : -INF;
      let beta = depth >= 3 ? previousScore + 45 : INF;
      let iterationMove = answer, iterationScore = -INF;

      const runRoot = (a, b) => {
        let bestScore = -INF, bestMove = iterationMove, n = 0;
        for (const m of rootMoves) {
          checkTime(); n++;
          const u = g._uci(m);
          const undo = g._make(m);
          let key = null, score;
          try {
            const childLegal = g._legal();
            key = pushRep(childLegal);
            if (n === 1) score = -search(depth - 1, -b, -a, 1, true);
            else {
              score = -search(depth - 1, -a - 1, -a, 1, false);
              if (score > a && score < b) score = -search(depth - 1, -b, -a, 1, true);
            }
          } finally { popRep(key); g._unmake(undo); }
          if (score > bestScore) { bestScore = score; bestMove = u; }
          if (score > a) a = score;
        }
        return [bestScore, bestMove];
      };

      let result = runRoot(alpha, beta);
      if (result[0] <= alpha || result[0] >= beta) result = runRoot(-INF, INF);
      iterationScore = result[0]; iterationMove = result[1];
      if (state.legalMoves.includes(iterationMove)) answer = iterationMove;
      previousScore = iterationScore;
      if (Math.abs(iterationScore) > MATE - 100) break;
      if (Date.now() >= deadline - 15) break;
    }
  } catch (e) {
    if (e !== TIMEOUT) return state.legalMoves.includes(answer) ? answer : state.legalMoves[0];
  }
  return state.legalMoves.includes(answer) ? answer : state.legalMoves[0];
}

module.exports = { name: NAME, move: moveBot };
