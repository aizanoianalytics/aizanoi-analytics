'use strict';
// Snake Royale bot "Voronoi Viper": simultaneous-move minimax (iterative deepening, pessimistic opponents)
// over an exact copy of the engine rules, evaluated by Voronoi territory, length, food need and storm position.
var DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], DN = ['up', 'down', 'left', 'right'];
var TIME_MS = 80;

function move(state) {
  var t0 = Date.now();
  var W = state.width, H = state.height, N = W * H;
  var cap = Math.floor(Math.min(W, H) / 2) - 1;
  var ring0 = 0;
  for (var r = 1; r <= cap; r++) { for (var h = 0; h < state.hazards.length; h++) { var p = state.hazards[h]; if (p.x === r - 1 && p.y === r - 1) { ring0 = r; break; } } }
  var meId = state.you.id;
  var snakes = state.snakes.map(function (s) {
    return { id: s.id, body: s.body.map(function (b) { return b.x + b.y * W; }), health: s.health, alive: true };
  });
  var meIdx = 0;
  snakes.forEach(function (s, i) { if (s.id === meId) meIdx = i; });
  var food = state.food.map(function (f) { return f.x + f.y * W; });
  var S0 = { sn: snakes, food: food, ring: ring0, turn: state.turn - 1 };

  function inRing(x, y, k) { return x < k || y < k || x >= W - k || y >= H - k; }

  // ---- simulation of one engine turn. moves[i] = dir index or -1 (dead / not moving)
  function sim(S, moves) {
    var n = S.sn.length;
    var turn = S.turn + 1;
    var ns = new Array(n);
    var heads = new Array(n), wall = new Array(n);
    for (var i = 0; i < n; i++) {
      var s = S.sn[i];
      if (!s.alive) { ns[i] = s; continue; }
      var hd = s.body[0], hx = hd % W, hy = (hd / W) | 0;
      var nx = hx + DX[moves[i]], ny = hy + DY[moves[i]];
      var b = s.body.slice();
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) { wall[i] = true; heads[i] = -1; b.unshift(-1); }
      else { heads[i] = nx + ny * W; b.unshift(heads[i]); }
      ns[i] = { id: s.id, body: b, health: s.health - 1, alive: true };
    }
    var eaten = null;
    for (i = 0; i < n; i++) {
      s = ns[i];
      if (!S.sn[i].alive) continue;
      var ate = false;
      if (heads[i] >= 0) {
        for (var f = 0; f < S.food.length; f++) if (S.food[f] === heads[i]) { ate = true; (eaten = eaten || []).push(f); break; }
      }
      if (ate) s.health = 100; else s.body.pop();
    }
    var food2 = S.food;
    if (eaten) food2 = S.food.filter(function (_, k) { return eaten.indexOf(k) < 0; });
    var dead = [];
    for (i = 0; i < n; i++) {
      if (!S.sn[i].alive) continue;
      s = ns[i];
      var hh = s.body[0], cause = false;
      if (wall[i]) cause = true;
      else if (inRing(hh % W, (hh / W) | 0, S.ring)) cause = true;
      else if (s.health <= 0) cause = true;
      else {
        for (var j = 0; j < n && !cause; j++) {
          if (!S.sn[j].alive) continue;
          var bj = ns[j].body;
          for (var k = 1; k < bj.length; k++) if (bj[k] === hh) { cause = true; break; }
        }
        if (!cause) for (j = 0; j < n; j++) {
          if (j === i || !S.sn[j].alive) continue;
          if (ns[j].body[0] === hh && ns[j].body.length >= s.body.length) { cause = true; break; }
        }
      }
      if (cause) dead.push(i);
    }
    for (i = 0; i < dead.length; i++) { var o = ns[dead[i]]; ns[dead[i]] = { id: o.id, body: o.body, health: o.health, alive: false }; }
    var ring = S.ring;
    if (turn >= 150 && (turn - 150) % 20 === 0 && ring < cap) {
      ring++;
      food2 = food2.filter(function (c) { return !inRing(c % W, (c / W) | 0, ring); });
    }
    return { sn: ns, food: food2, ring: ring, turn: turn };
  }

  // ---- evaluation
  var cx0 = (W - 1) / 2, cy0 = (H - 1) / 2;
  var blockT = new Int16Array(N), own = new Int8Array(N), dist = new Int16Array(N), q = new Int16Array(N);
  function evaluate(S, depthLeft) {
    var me = S.sn[meIdx];
    var n = S.sn.length, i, aliveEn = 0;
    if (!me.alive) return -100000 - depthLeft * 10;
    for (i = 0; i < n; i++) if (i !== meIdx && S.sn[i].alive) aliveEn++;
    if (n > 1 && aliveEn === 0) return 100000 + depthLeft * 10;
    blockT.fill(0); own.fill(-1); dist.fill(-1);
    var qt = 0, qh = 0;
    for (i = 0; i < n; i++) {
      var s = S.sn[i]; if (!s.alive) continue;
      var L = s.body.length;
      for (var k = 1; k < L; k++) { var c = s.body[k]; if (c >= 0) { var t = L - k; if (t > blockT[c]) blockT[c] = t; } }
    }
    // multi-source BFS; ties between different owners: longer wins, equal -> contested (-2)
    var starts = [];
    for (i = 0; i < n; i++) {
      s = S.sn[i]; if (!s.alive) continue;
      var hc = s.body[0]; if (hc < 0) continue;
      if (own[hc] === -1) { own[hc] = i; dist[hc] = 0; q[qt++] = hc; }
      else own[hc] = -2;
    }
    var counts = new Array(n).fill(0);
    var ring = S.ring;
    while (qh < qt) {
      var cur = q[qh++];
      var o = own[cur], d = dist[cur] + 1, x = cur % W, y = (cur / W) | 0;
      for (var dd = 0; dd < 4; dd++) {
        var nx = x + DX[dd], ny = y + DY[dd];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || inRing(nx, ny, ring)) continue;
        var ni = nx + ny * W;
        if (blockT[ni] > d - 0 && blockT[ni] > 0 && d < blockT[ni]) continue;
        if (dist[ni] === -1) { dist[ni] = d; own[ni] = o; q[qt++] = ni; }
        else if (dist[ni] === d && own[ni] !== o && own[ni] !== -2) {
          // tie: longer snake takes it, equal -> nobody
          var a = own[ni], b = o;
          if (o === -2) { own[ni] = -2; continue; }
          var la = S.sn[a].body.length, lb = S.sn[b].body.length;
          if (la === lb) own[ni] = -2; else if (lb > la) own[ni] = b;
        }
      }
    }
    var mine = 0, theirs = 0;
    for (var c2 = 0; c2 < N; c2++) { var oo = own[c2]; if (oo === meIdx) mine++; else if (oo >= 0) theirs++; }
    var score = (mine - theirs) * 6 + mine * 3;
    // length advantage
    var maxEn = 0;
    for (i = 0; i < n; i++) if (i !== meIdx && S.sn[i].alive && S.sn[i].body.length > maxEn) maxEn = S.sn[i].body.length;
    var myL = me.body.length;
    score += (myL - maxEn) * 40;
    score += myL * 15;
    // food: distance to nearest owned/reachable food
    var fd = 99;
    for (var f = 0; f < S.food.length; f++) { var fc = S.food[f]; if (own[fc] === meIdx && dist[fc] < fd) fd = dist[fc]; }
    var hungry = me.health < 45 ? 3 : (myL < 12 ? 2 : 0.6);
    if (fd < 99) score -= fd * hungry * 4;
    else if (me.health < 50) score -= 60;
    if (me.health < 25) score -= (25 - me.health) * 6;
    if (fd < 99 && me.health <= fd) score -= 5000;
    // storm: stay near centre late
    var hx = me.body[0] % W, hy = (me.body[0] / W) | 0;
    var cd = Math.abs(hx - cx0) + Math.abs(hy - cy0);
    var turn = S.turn;
    if (turn >= 110) score -= cd * (turn >= 150 ? 10 : 4);
    else score -= cd * 0.5;
    // upcoming ring danger
    if (S.ring < cap && turn >= 130) {
      var nxt = turn < 150 ? 150 : 150 + Math.ceil((turn - 150 + 1) / 20) * 20;
      var left = nxt - turn;
      if (left <= 10 && inRing(hx, hy, S.ring + 1)) score -= (11 - left) * 14;
    }
    return score;
  }

  // ---- legal move generation (per snake, rough pruning of suicidal moves)
  function moveOptions(S, i) {
    var s = S.sn[i], hd = s.body[0], hx = hd % W, hy = (hd / W) | 0, res = [];
    for (var d = 0; d < 4; d++) {
      var nx = hx + DX[d], ny = hy + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || inRing(nx, ny, S.ring)) continue;
      res.push(d);
    }
    return res;
  }

  // adversary selection: nearest enemies are searched, others use a simple heuristic move
  var advList = [];
  (function () {
    var hd = snakes[meIdx].body[0], hx = hd % W, hy = (hd / W) | 0, arr = [];
    snakes.forEach(function (s, i) {
      if (i === meIdx) return;
      var c = s.body[0];
      arr.push({ i: i, d: Math.abs(c % W - hx) + Math.abs(((c / W) | 0) - hy) });
    });
    arr.sort(function (a, b) { return a.d - b.d; });
    advList = arr.slice(0, 2).map(function (a) { return a.i; });
  })();

  function simpleMove(S, i) {
    // keep going straight if free, else any open cell not occupied
    var s = S.sn[i], opts = moveOptions(S, i), best = -1, bs = -1e9;
    var occ = {};
    S.sn.forEach(function (o) { if (o.alive) for (var k = 0; k < o.body.length - 1; k++) occ[o.body[k]] = 1; });
    var hd = s.body[0], hx = hd % W, hy = (hd / W) | 0;
    var neck = s.body.length > 1 ? s.body[1] : -2;
    for (var oi = 0; oi < opts.length; oi++) {
      var d = opts[oi], c = (hx + DX[d]) + (hy + DY[d]) * W, sc = 0;
      if (occ[c]) sc -= 100;
      if (c === neck && neck !== hd) sc -= 50;
      for (var f = 0; f < S.food.length; f++) if (S.food[f] === c) sc += 20;
      sc += Math.random() * 0.1;
      if (sc > bs) { bs = sc; best = d; }
    }
    return best < 0 ? 0 : best;
  }

  var timeUp = false;
  var nodes = 0;

  function search(S, depth, alpha, beta, maxDepth) {
    // S: me alive. Returns value of best move for me (pessimistic over adversaries).
    if (depth === 0) return evaluate(S, 0);
    if ((++nodes & 7) === 0 && Date.now() - t0 > TIME_MS) { timeUp = true; }
    if (timeUp) return 0;
    var best = -Infinity;
    var myOpts = moveOptions(S, meIdx);
    if (!myOpts.length) myOpts = [0];
    for (var mi = 0; mi < myOpts.length; mi++) {
      var v = minNode(S, myOpts[mi], depth, best > alpha ? best : alpha, beta, maxDepth);
      if (timeUp) return 0;
      if (v > best) best = v;
      if (best >= beta) break;
    }
    return best;
  }

  function minNode(S, myMove, depth, alpha, beta, maxDepth) {
    var n = S.sn.length;
    var moves = new Array(n).fill(-1);
    moves[meIdx] = myMove;
    var advs = [];
    for (var i = 0; i < n; i++) {
      if (i === meIdx || !S.sn[i].alive) continue;
      if (advList.indexOf(i) >= 0) advs.push(i); else moves[i] = simpleMove(S, i);
    }
    var worst = Infinity;
    var optsPer = advs.map(function (i) { var o = moveOptions(S, i); return o.length ? o : [0]; });
    var idx = new Array(advs.length).fill(0);
    while (true) {
      for (var a = 0; a < advs.length; a++) moves[advs[a]] = optsPer[a][idx[a]];
      var S2 = sim(S, moves);
      var v;
      if (!S2.sn[meIdx].alive) v = -100000 - (depth - 1) * 10;
      else {
        var anyEn = false;
        for (var j = 0; j < n; j++) if (j !== meIdx && S2.sn[j].alive) anyEn = true;
        if (n > 1 && !anyEn) v = 100000 + (depth - 1) * 10;
        else v = search(S2, depth - 1, alpha, worst < beta ? worst : beta, maxDepth);
      }
      if (timeUp) return 0;
      if (v < worst) worst = v;
      if (worst <= alpha) break;
      // advance odometer
      var p2 = advs.length - 1;
      while (p2 >= 0) { idx[p2]++; if (idx[p2] < optsPer[p2].length) break; idx[p2] = 0; p2--; }
      if (p2 < 0) break;
    }
    return worst;
  }

  // ---- iterative deepening at the root
  var rootOpts = moveOptions(S0, meIdx);
  if (!rootOpts.length) return 'up';
  var bestMove = rootOpts[0], bestVal = -Infinity;
  var order = rootOpts.slice();
  var maxD = N > 150 ? 3 : 5;
  for (var depth = 1; depth <= maxD; depth++) {
    var curBest = -1, curVal = -Infinity;
    var alpha = -Infinity;
    for (var oi = 0; oi < order.length; oi++) {
      var mvv = order[oi];
      var val = minNode(S0, mvv, depth, alpha, Infinity, depth);
      if (timeUp) break;
      if (val > curVal) { curVal = val; curBest = mvv; }
      if (val > alpha) alpha = val;
    }
    if (timeUp) break;
    bestMove = curBest; bestVal = curVal;
    order.sort(function (a, b) { return a === bestMove ? -1 : b === bestMove ? 1 : 0; });
    if (Date.now() - t0 > TIME_MS * 0.5) break;
  }
  return DN[bestMove];
}

module.exports = function (state) {
  try { return move(state); } catch (e) {
    try {
      // emergency: any in-bounds direction not into own body
      var h = state.you.head, occ = {};
      state.snakes.forEach(function (s) { s.body.forEach(function (b, i) { if (i < s.body.length - 1) occ[b.x + ',' + b.y] = 1; }); });
      for (var d = 0; d < 4; d++) {
        var nx = h.x + DX[d], ny = h.y + DY[d];
        if (nx >= 0 && ny >= 0 && nx < state.width && ny < state.height && !occ[nx + ',' + ny]) return DN[d];
      }
    } catch (e2) {}
    return 'up';
  }
};
module.exports.botName = 'Voronoi Viper';
