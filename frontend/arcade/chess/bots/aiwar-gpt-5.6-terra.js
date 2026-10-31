'use strict';

/* Arena Hawk: iterative-deepening alpha-beta using the supplied local engine. */
module.exports = function move(state) {
  const Engine = globalThis.ChessEngine;
  const root = Engine.fromBotState(state);
  const MATE = 1000000, INF = 10000000;
  const end = Date.now() + Math.max(120, Math.min(730, (state.timeLimitMs || 1000) - 220));
  let nodes = 0, stopped = false;
  const tt = new Map(), killers = Array.from({ length: 96 }, () => ['', '']);
  const history = Object.create(null);
  const V = [0, 100, 320, 335, 510, 950, 0];
  const PST = {
    1:[0,0,0,0,0,0,0,0, 5,8,8,-8,-8,8,8,5, 2,2,4,12,12,4,2,2, 1,1,3,14,18,4,1,1, 2,2,5,18,24,6,2,2, 8,10,14,24,30,16,10,8, 60,60,60,60,60,60,60,60, 0,0,0,0,0,0,0,0],
    2:[-45,-30,-20,-15,-15,-20,-30,-45, -25,-5,0,5,5,0,-5,-25, -15,5,12,16,16,12,5,-15, -12,4,17,22,22,17,4,-12, -12,5,18,24,24,18,5,-12, -15,4,12,18,18,12,4,-15, -25,-5,0,5,5,0,-5,-25, -45,-30,-20,-15,-15,-20,-30,-45],
    3:[-20,-10,-8,-8,-8,-8,-10,-20, -8,4,0,2,2,0,4,-8, -8,8,8,10,10,8,8,-8, -8,0,12,14,14,12,0,-8, -8,5,12,15,15,12,5,-8, -8,8,8,10,10,8,8,-8, -8,4,0,2,2,0,4,-8, -20,-10,-8,-8,-8,-8,-10,-20],
    4:[0,0,3,7,7,3,0,0, -4,0,0,0,0,0,0,-4, -4,0,0,0,0,0,0,-4, -4,0,0,0,0,0,0,-4, -4,0,0,0,0,0,0,-4, -4,0,0,0,0,0,0,-4, 5,10,10,10,10,10,10,5, 0,0,0,0,0,0,0,0],
    5:[-12,-8,-6,-3,-3,-6,-8,-12, -8,0,3,4,4,3,0,-8, -6,3,6,8,8,6,3,-6, -3,4,8,10,10,8,4,-3, -3,4,8,10,10,8,4,-3, -6,3,6,8,8,6,3,-6, -8,0,3,4,4,3,0,-8, -12,-8,-6,-3,-3,-6,-8,-12],
    6:[-20,-28,-35,-45,-45,-35,-28,-20, -18,-25,-30,-38,-38,-30,-25,-18, -14,-20,-25,-32,-32,-25,-20,-14, -10,-16,-20,-26,-26,-20,-16,-10, -5,-10,-14,-18,-18,-14,-10,-5, 4,2,-4,-8,-8,-4,2,4, 14,18,4,0,0,4,18,14, 18,28,12,0,0,12,28,18]
  };

  function key(g) { const f = g.fen().split(' '); return f[0] + ' ' + f[1] + ' ' + f[2] + ' ' + f[3]; }
  function uci(g, m) { return g._uci(m); }
  function isCapture(g, m) { return !!g._board[m.t] || !!m.ep; }
  function evaluate(g) {
    let score = 0, bishops = [0, 0], pawns = [[], []];
    const b = g._board;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s]; if (!p) continue;
      const c = p > 0 ? 1 : -1, t = Math.abs(p), file = s & 7, rank = s >> 4;
      const idx = (c === 1 ? rank : 7 - rank) * 8 + file;
      let val = V[t] + PST[t][idx];
      if (t === 3) bishops[c === 1 ? 0 : 1]++;
      if (t === 1) pawns[c === 1 ? 0 : 1].push([file, rank]);
      score += c * val;
    }
    if (bishops[0] >= 2) score += 28;
    if (bishops[1] >= 2) score -= 28;
    for (const side of [0, 1]) for (const pr of pawns[side]) {
      let same = 0, blocked = false;
      for (const q of pawns[side]) if (q[0] === pr[0]) same++;
      const enemy = pawns[1 - side];
      for (const q of enemy) if (Math.abs(q[0] - pr[0]) <= 1 && (side === 0 ? q[1] > pr[1] : q[1] < pr[1])) blocked = true;
      const sign = side === 0 ? 1 : -1;
      if (same > 1) score -= sign * 11;
      if (!blocked) score += sign * (10 + (side === 0 ? pr[1] : 7 - pr[1]) * 5);
    }
    return g._side === 1 ? score : -score;
  }
  function scoreMove(g, m, ply, hashMove) {
    const id = uci(g, m); if (id === hashMove) return 20000000;
    const piece = Math.abs(g._board[m.f]);
    let s = 0;
    if (isCapture(g, m)) s = 1000000 + V[Math.abs(g._board[m.t])] * 16 - V[piece];
    if (m.p) s += 900000 + V[m.p];
    if (id === killers[ply][0]) s += 800000; else if (id === killers[ply][1]) s += 700000;
    return s + (history[id] || 0);
  }
  function ordered(g, moves, ply, hashMove, capturesOnly) {
    const a = [];
    for (const m of moves) if (!capturesOnly || isCapture(g,m) || m.p) a.push(m);
    a.sort((x,y) => scoreMove(g,y,ply,hashMove) - scoreMove(g,x,ply,hashMove));
    return a;
  }
  function qsearch(g, alpha, beta, ply) {
    if ((++nodes & 127) === 0 && Date.now() >= end) { stopped = true; return 0; }
    const checked = g.inCheck();
    const moves = g._legal();
    if (!moves.length) return checked ? -MATE + ply : 0;
    let stand = evaluate(g);
    if (!checked) { if (stand >= beta) return beta; if (stand > alpha) alpha = stand; }
    const list = ordered(g, moves, ply, '', !checked);
    for (const m of list) {
      const undo = g._make(m);
      const v = -qsearch(g, -beta, -alpha, ply + 1);
      g._unmake(undo); if (stopped) return 0;
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function search(g, depth, alpha, beta, ply) {
    if ((++nodes & 127) === 0 && Date.now() >= end) { stopped = true; return 0; }
    const moves = g._legal();
    if (!moves.length) return g.inCheck() ? -MATE + ply : 0;
    if (depth <= 0) return qsearch(g, alpha, beta, ply);
    const k = key(g), old = tt.get(k), alpha0 = alpha;
    if (old && old.depth >= depth) {
      if (old.flag === 0) return old.value;
      if (old.flag < 0) alpha = Math.max(alpha, old.value); else beta = Math.min(beta, old.value);
      if (alpha >= beta) return old.value;
    }
    const list = ordered(g, moves, ply, old && old.best, false);
    let best = -INF, bestMove = list[0] ? uci(g,list[0]) : '';
    for (const m of list) {
      const id = uci(g,m), quiet = !isCapture(g,m) && !m.p;
      const undo = g._make(m);
      let v;
      if (best === -INF) v = -search(g, depth-1, -beta, -alpha, ply+1);
      else { v = -search(g, depth-1, -alpha-1, -alpha, ply+1); if (v > alpha && v < beta) v = -search(g, depth-1, -beta, -alpha, ply+1); }
      g._unmake(undo); if (stopped) return 0;
      if (v > best) { best = v; bestMove = id; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (quiet) { if (killers[ply][0] !== id) { killers[ply][1] = killers[ply][0]; killers[ply][0] = id; } history[id] = (history[id] || 0) + depth * depth; }
        break;
      }
    }
    if (tt.size > 90000) tt.clear();
    tt.set(k, { depth, value: best, best: bestMove, flag: best <= alpha0 ? -1 : best >= beta ? 1 : 0 });
    return best;
  }

  let best = state.legalMoves[0], lastScore = -INF;
  try {
    for (let depth = 1; depth <= 20; depth++) {
      stopped = false; nodes = 0;
      const moves = ordered(root, root._legal(), 0, best, false);
      let alpha = -INF, iterationBest = best, score = -INF;
      for (const m of moves) {
        const id = uci(root,m), undo = root._make(m);
        let v = -search(root, depth-1, -INF, -alpha, 1);
        root._unmake(undo); if (stopped) break;
        if (v > score) { score = v; iterationBest = id; }
        if (v > alpha) alpha = v;
      }
      if (stopped) break;
      best = iterationBest; lastScore = score;
      if (Math.abs(score) > MATE - 200) break;
    }
  } catch (_) { /* The preselected legal move remains safe. */ }
  return state.legalMoves.includes(best) ? best : state.legalMoves[0];
};
