'use strict';
// Claude Sonnet 5.5 chess bot: iterative deepening PVS alpha-beta + TT + quiescence,
// running on the engine's internal make/unmake for speed.
const NAME = 'claude-sonnet-5.5';
const MATE = 100000, INF = 1000000;
const VAL = [0, 100, 320, 335, 500, 900, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const PST = {
  1: [0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0, 5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0],
  2: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,5,10,15,15,10,5,-30, -30,0,15,20,20,15,0,-30, -30,5,15,20,20,15,5,-30, -30,0,10,15,15,10,0,-30, -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  3: [-20,-10,-10,-10,-10,-10,-10,-20, -10,5,0,0,0,0,5,-10, -10,10,10,10,10,10,10,-10, -10,0,10,10,10,10,0,-10, -10,5,5,10,10,5,5,-10, -10,0,5,10,10,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  4: [0,0,0,5,5,0,0,0, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 5,10,10,10,10,10,10,5, 0,0,0,0,0,0,0,0],
  5: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,5,0,0,0,0,-10, -10,5,5,5,5,5,0,-10, 0,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5, -10,0,5,5,5,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  6: [20,30,10,0,0,10,30,20, 20,20,0,0,0,0,20,20, -10,-20,-20,-20,-20,-20,-20,-10, -20,-30,-30,-40,-40,-30,-30,-20, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30],
};
const KEG = [-50,-30,-30,-30,-30,-30,-30,-50, -30,-30,0,0,0,0,-30,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-20,-10,0,0,-10,-20,-30, -50,-40,-30,-20,-20,-30,-40,-50];
const PEG = [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 5,5,5,5,5,5,5,5, 10,10,10,10,10,10,10,10, 20,20,20,20,20,20,20,20, 35,35,35,35,35,35,35,35, 60,60,60,60,60,60,60,60, 0,0,0,0,0,0,0,0];

let seed = 123456789;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
const Z1 = new Int32Array(13 * 128), Z2 = new Int32Array(13 * 128);
for (let i = 0; i < Z1.length; i++) { Z1[i] = rnd(); Z2[i] = rnd(); }
const ZS = rnd();

class Timeout {}
let deadline, nodes, tt, killers, hist, repCount, pathH;

function hash(game) {
  const b = game._board; let h1 = game._side === 1 ? 0 : ZS, h2 = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (p) { const k = (p + 6) * 128 + s; h1 ^= Z1[k]; h2 ^= Z2[k]; }
  }
  if (game._ep >= 0) h1 ^= Z1[game._ep];
  return h1 + ':' + h2;
}

function evaluate(game) {
  const b = game._board; let mg = 0, ph = 0, eg = 0, wb = 0, bb = 0;
  const pf = [new Int8Array(8), new Int8Array(8)];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if (!p) continue;
    const t = p > 0 ? p : -p, w = p > 0;
    const f = s & 7, r = s >> 4;
    const idx = w ? (r * 8 + f) : ((7 - r) * 8 + f);
    let m = VAL[t], e = VAL[t];
    if (t === 6) { m += PST[6][idx]; e += KEG[idx]; }
    else if (t === 1) { m += PST[1][idx]; e += PEG[idx]; pf[w ? 0 : 1][f]++; }
    else { m += PST[t][idx]; e += PST[t][idx]; if (t === 3) { if (w) wb++; else bb++; } }
    ph += PHASE[t];
    if (w) { mg += m; eg += e; } else { mg -= m; eg -= e; }
  }
  if (wb > 1) { mg += 30; eg += 40; }
  if (bb > 1) { mg -= 30; eg -= 40; }
  for (let c = 0; c < 2; c++) {
    let sc = 0;
    for (let f = 0; f < 8; f++) {
      const n = pf[c][f]; if (!n) continue;
      if (n > 1) sc -= 12 * (n - 1);
      if ((f === 0 || !pf[c][f - 1]) && (f === 7 || !pf[c][f + 1])) sc -= 12;
    }
    if (c === 0) { mg += sc; eg += sc; } else { mg -= sc; eg -= sc; }
  }
  if (ph > 24) ph = 24;
  const sc = (mg * ph + eg * (24 - ph)) / 24;
  return (game._side === 1 ? sc : -sc) + 8;
}

function mscore(game, m, ttMove, ply) {
  const b = game._board;
  if (ttMove && m.f === ttMove.f && m.t === ttMove.t && m.p === ttMove.p) return 1e7;
  const cap = m.castle ? 0 : (m.ep ? 1 : Math.abs(b[m.t]));
  if (cap || m.p) {
    const att = Math.abs(b[m.f]);
    return 1e6 + (cap ? VAL[cap] * 10 - VAL[att] : 0) + (m.p ? VAL[m.p] : 0);
  }
  const k = killers[ply];
  if (k) {
    if (k[0] && k[0].f === m.f && k[0].t === m.t) return 9e5;
    if (k[1] && k[1].f === m.f && k[1].t === m.t) return 8e5;
  }
  return hist[(game._side === 1 ? 0 : 1) * 16384 + m.f * 128 + m.t] | 0;
}

function order(game, moves, ttMove, ply) {
  const sc = moves.map(m => mscore(game, m, ttMove, ply));
  return moves.map((_, i) => i).sort((a, b) => sc[b] - sc[a]).map(i => moves[i]);
}

function checkTime() { if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout(); }

function qsearch(game, alpha, beta, ply) {
  checkTime();
  const inChk = game.inCheck();
  let best;
  if (!inChk) {
    best = evaluate(game);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
  } else best = -MATE + ply;
  const color = game._side, b = game._board;
  const list = [];
  for (const m of game._pseudo()) {
    if (m.castle) continue;
    const cap = m.ep ? 1 : Math.abs(b[m.t]);
    if (!inChk) {
      if (!cap && m.p !== 5) continue;
      if (cap && !m.p && best + VAL[cap] + 200 < alpha) continue;
    }
    list.push(m);
  }
  const sc = list.map(m => mscore(game, m, null, 0));
  const ord = list.map((_, i) => i).sort((x, y) => sc[y] - sc[x]);
  for (const i of ord) {
    const m = list[i];
    const u = game._make(m);
    if (game._attacked(game._kings[color], -color)) { game._unmake(u); continue; }
    let s;
    try { s = -qsearch(game, -beta, -alpha, ply + 1); } finally { game._unmake(u); }
    if (s > best) { best = s; if (s > alpha) { alpha = s; if (s >= beta) break; } }
  }
  return best;
}

function search(game, depth, alpha, beta, ply, nullOk) {
  checkTime();
  if (game._halfmove >= 100) return 0;
  const hk = hash(game);
  if (ply > 0) {
    const rc = repCount.get(hk) || 0;
    if (pathH.has(hk) || rc >= 2) return 0;
  }
  const inChk = game.inCheck();
  if (inChk) depth++;
  if (depth <= 0) return qsearch(game, alpha, beta, ply);
  const origAlpha = alpha;
  const e = tt.get(hk);
  let ttMove = null;
  if (e) {
    ttMove = e.m;
    if (e.d >= depth && ply > 0) {
      if (e.f === 0) return e.s;
      if (e.f === 1 && e.s >= beta) return e.s;
      if (e.f === 2 && e.s <= alpha) return e.s;
    }
  }
  const color = game._side;
  const pv = beta - alpha > 1;
  if (nullOk && !inChk && !pv && depth >= 3) {
    let np = 0; const b = game._board;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s] * color; if (p > 1 && p < 6) np++;
    }
    if (np >= 2) {
      const oldEp = game._ep; game._ep = -1; game._side = -color;
      let s;
      try { s = -search(game, depth - 1 - (depth >= 6 ? 3 : 2), -beta, -beta + 1, ply + 1, false); }
      finally { game._side = color; game._ep = oldEp; }
      if (s >= beta) return beta;
    }
  }
  const sm = (!inChk && !pv && depth <= 2) ? evaluate(game) : null;
  const moves = order(game, game._pseudo(), ttMove, ply);
  let best = -INF, bestM = null, n = 0;
  pathH.add(hk);
  try {
    for (const m of moves) {
      const b = game._board;
      const isCap = m.castle ? false : (m.ep || b[m.t] !== 0);
      const u = game._make(m);
      if (game._attacked(game._kings[color], -color)) { game._unmake(u); continue; }
      n++;
      const quiet = !isCap && !m.p;
      if (sm !== null && quiet && n > 1 && sm + 150 * depth < alpha && !game.inCheck()) { game._unmake(u); continue; }
      let s;
      try {
        if (n === 1) s = -search(game, depth - 1, -beta, -alpha, ply + 1, true);
        else {
          let red = 0;
          if (depth >= 3 && quiet && n > 4 && !inChk) red = n > 8 ? 2 : 1;
          s = -search(game, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && red) s = -search(game, depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (s > alpha && s < beta) s = -search(game, depth - 1, -beta, -alpha, ply + 1, true);
        }
      } finally { game._unmake(u); }
      if (s > best) { best = s; bestM = m; }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (quiet) {
          const k = killers[ply] || (killers[ply] = [null, null]);
          if (!(k[0] && k[0].f === m.f && k[0].t === m.t)) { k[1] = k[0]; k[0] = m; }
          hist[(color === 1 ? 0 : 1) * 16384 + m.f * 128 + m.t] += depth * depth;
        }
        break;
      }
    }
  } finally { pathH.delete(hk); }
  if (n === 0) return inChk ? -MATE + ply : 0;
  tt.set(hk, { d: depth, s: best, f: best <= origAlpha ? 2 : best >= beta ? 1 : 0, m: bestM });
  return best;
}

function pick(state) {
  const start = Date.now();
  const legal = state.legalMoves;
  if (legal.length === 1) return legal[0];
  const root = globalThis.ChessEngine.fromBotState(state);
  repCount = new Map(); pathH = new Set();
  {
    const rg = globalThis.ChessEngine.create({ fen: state.initialFen, variant: state.variant, maxPlies: state.maxPlies });
    repCount.set(hash(rg), 1);
    for (const u of state.history) {
      rg.move(u);
      const k = hash(rg);
      repCount.set(k, (repCount.get(k) || 0) + 1);
    }
  }
  deadline = start + 550;
  nodes = 0; tt = new Map(); killers = []; hist = new Int32Array(2 * 16384);
  const side = root._side;
  let rootMoves = [];
  for (const m of root._pseudo()) {
    const u = root._make(m);
    const ok = !root._attacked(root._kings[side], -side);
    root._unmake(u);
    if (ok) rootMoves.push(m);
  }
  rootMoves = order(root, rootMoves, null, 0);
  let bestM = rootMoves[0];
  const rootKey = hash(root);
  try {
    for (let depth = 1; depth <= 40; depth++) {
      let alpha = -INF, iterBest = null, iterScore = -INF;
      pathH.add(rootKey);
      for (const m of rootMoves) {
        const u = root._make(m);
        let s;
        try {
          if (!iterBest) s = -search(root, depth - 1, -INF, -alpha, 1, true);
          else {
            s = -search(root, depth - 1, -alpha - 1, -alpha, 1, true);
            if (s > alpha) s = -search(root, depth - 1, -INF, -alpha, 1, true);
          }
        } finally { root._unmake(u); }
        if (s > iterScore) { iterScore = s; iterBest = m; }
        if (s > alpha) alpha = s;
      }
      pathH.clear();
      bestM = iterBest;
      rootMoves = [iterBest].concat(rootMoves.filter(x => x !== iterBest));
      if (iterScore > MATE - 100) break;
      if (Date.now() - start > 330) break;
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  }
  const res = root._uci(bestM);
  return legal.includes(res) ? res : legal[0];
}

function move(state) {
  try { return pick(state); }
  catch (e) { return state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)]; }
}
module.exports = move;
module.exports.botName = NAME;
