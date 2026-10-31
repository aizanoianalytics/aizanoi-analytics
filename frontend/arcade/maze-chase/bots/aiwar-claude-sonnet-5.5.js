'use strict';
// Maze Chase bot. Runner: safe-BFS using worst-case ghost arrival times, hunts pellets / edible ghosts.
// Ghost: pincer chase (direct, ambush ahead, power-pellet intercept); flees when frightened.
var __cache = null;

function build(state) {
  var W = state.width, H = state.height;
  var sig = state.grid[0] + '|' + state.grid[H >> 1] + '|' + state.tunnelRow;
  if (__cache && __cache.W === W && __cache.H === H && __cache.sig === sig) return __cache;
  var N = W * H, rAdj = new Array(N), gAdj = new Array(N);
  var D = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var i = y * W + x, c = state.grid[y][x];
    rAdj[i] = []; gAdj[i] = [];
    if (c === '#') continue;
    for (var k = 0; k < 4; k++) {
      var nx = x + D[k][1], ny = y + D[k][2];
      if (y === state.tunnelRow) nx = (nx + W) % W;
      if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
      var n = state.grid[ny][nx];
      if (n === '#') continue;
      var j = ny * W + nx;
      var cPen = (c === 'G' || c === '-'), nPen = (n === 'G' || n === '-');
      if (!cPen && !nPen) rAdj[i].push([j, D[k][0]]);
      var ok = true;
      if (c === 'G' && n !== 'G' && n !== '-') ok = false;
      if (n === 'G' && c !== 'G' && c !== '-') ok = false;
      if (ok) gAdj[i].push([j, D[k][0]]);
    }
  }
  __cache = { W: W, H: H, N: N, rAdj: rAdj, gAdj: gAdj, sig: sig };
  return __cache;
}

function bfs(adj, N, srcs) {
  var d = new Int32Array(N).fill(-1), q = [], h = 0;
  for (var s = 0; s < srcs.length; s++) if (d[srcs[s]] < 0) { d[srcs[s]] = 0; q.push(srcs[s]); }
  while (h < q.length) {
    var u = q[h++], a = adj[u];
    for (var k = 0; k < a.length; k++) { var v = a[k][0]; if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } }
  }
  return d;
}
var INF = 100000;

function runnerMove(state, G) {
  var W = G.W, N = G.N, me = state.you, adj = G.rAdj;
  var ms = me.y * W + me.x;
  var A = new Int32Array(N).fill(INF);
  state.ghosts.forEach(function (g) {
    var d = bfs(G.gAdj, N, [g.y * W + g.x]);
    var F = g.frightened ? state.frightTicksLeft : 0;
    var off = g.inPen ? Math.max(0, g.releaseIn - 1) : 0;
    for (var c = 0; c < N; c++) {
      if (d[c] < 0) continue;
      var e = d[c] + off;
      if (F > 0) e = F + Math.max(0, e - (F >> 1));
      if (e < A[c]) A[c] = e;
    }
  });
  var mates = state.runners.filter(function (r) { return r.id !== me.id && r.alive && !r.respawnIn; });
  var mateD = mates.map(function (r) { return bfs(adj, N, [r.y * W + r.x]); });
  var inv = me.invulnerable ? me.invulnerableTicksLeft : 0;
  function safe(c, t) { return t < inv || t < A[c]; }

  var val = new Float32Array(N);
  for (var y = 0; y < state.height; y++) for (var x = 0; x < W; x++) {
    var ch = state.grid[y][x], i = y * W + x;
    if (ch === '.') val[i] = 10;
    else if (ch === 'o') {
      var v = 50;
      if (state.frightTicksLeft < 15 && A[i] < 14) v += 150;
      else if (state.frightTicksLeft < 15) v += 20;
      val[i] = v;
    }
  }
  var edible = state.ghosts.filter(function (g) { return g.frightened && !g.frightImmune && !g.inPen; });
  var dens = new Float32Array(N);
  for (var c0 = 0; c0 < N; c0++) if (val[c0] > 0) {
    var a0 = adj[c0];
    for (var k0 = 0; k0 < a0.length; k0++) if (val[a0[k0][0]] > 0) dens[c0] += 1;
  }
  var cand = [['stay', ms]];
  adj[ms].forEach(function (e) { cand.push([e[1], e[0]]); });
  var best = null, bestS = -1e9;
  for (var ci = 0; ci < cand.length; ci++) {
    var mv = cand[ci][0], c1 = cand[ci][1];
    if (!safe(c1, 1)) continue;
    var dist = new Int32Array(N).fill(-1), q = [c1], h = 0;
    dist[c1] = 1;
    var bs = 0, area = 0;
    while (h < q.length) {
      var u = q[h++], t = dist[u];
      area++;
      var s = 0;
      if (val[u] > 0) {
        s = val[u] / (t + 1.5) + dens[u] * 0.8 / (t + 2);
        for (var m = 0; m < mates.length; m++) {
          var md = mateD[m][u];
          if (md >= 0 && md < t - 1) { s *= 0.35; break; }
        }
      }
      for (var ei = 0; ei < edible.length; ei++) {
        var g = edible[ei];
        if (g.y * W + g.x === u && t < state.frightTicksLeft - 1) s = Math.max(s, state.nextGhostPoints / (t + 1.2));
      }
      if (s > bs) bs = s;
      if (t > 60) continue;
      var nb = adj[u];
      for (var k2 = 0; k2 < nb.length; k2++) {
        var v2 = nb[k2][0];
        if (dist[v2] < 0 && safe(v2, t + 1)) { dist[v2] = t + 1; q.push(v2); }
      }
    }
    var score = bs + Math.min(area, 80) * 0.03;
    if (mv === 'stay') score -= 0.5;
    if (mv === me.dir) score += 0.05;
    score += Math.min(A[c1], 12) * 0.05;
    if (score > bestS) { bestS = score; best = mv; }
  }
  if (best) return best;
  var bm = 'stay', ba = -1;
  cand.forEach(function (cd) { var a2 = A[cd[1]]; if (a2 > ba) { ba = a2; bm = cd[0]; } });
  return bm;
}

function ghostMove(state, G) {
  var W = G.W, N = G.N, me = state.you, adj = G.gAdj;
  var ms = me.y * W + me.x;
  var legal = adj[ms].filter(function (e) {
    if (me.inPen && me.releaseIn > 1) {
      return state.grid[(e[0] / W) | 0][e[0] % W] === 'G';
    }
    return true;
  });
  if (!legal.length) return 'stay';
  var rs = state.runners.filter(function (r) { return r.alive && !r.respawnIn; });
  function pick(distMap) {
    var bd = null, bv = 1e9;
    legal.forEach(function (e) {
      var v = distMap[e[0]];
      if (v < 0) v = 9999;
      if (e[1] === me.dir) v -= 0.01;
      if (v < bv) { bv = v; bd = e[1]; }
    });
    return bd || 'stay';
  }
  if (me.frightened && !me.inPen) {
    var srcs = rs.map(function (r) { return r.y * W + r.x; });
    if (!srcs.length) return 'stay';
    var rd = bfs(adj, N, srcs);
    var bd2 = 'stay', bv2 = rd[ms] + adj[ms].length * 0.3 - 0.5;
    legal.forEach(function (e) {
      var v = rd[e[0]] + adj[e[0]].length * 0.3;
      if (v > bv2) { bv2 = v; bd2 = e[1]; }
    });
    return bd2;
  }
  if (me.inPen && me.releaseIn > 1) {
    var doors = [];
    for (var y = 0; y < state.height; y++) for (var x = 0; x < W; x++) if (state.grid[y][x] === '-') doors.push(y * W + x);
    return pick(bfs(adj, N, doors));
  }
  var targetCell;
  if (!rs.length) {
    var rr = state.runners.filter(function (r) { return r.alive; });
    if (!rr.length) return 'stay';
    targetCell = rr[0].spawn.y * W + rr[0].spawn.x;
  } else {
    var myD = bfs(adj, N, [ms]);
    var idx = state.ghosts.findIndex(function (g) { return g.id === me.id; });
    var scored = rs.map(function (r) {
      var d = myD[r.y * W + r.x]; if (d < 0) d = 999;
      var pen = (r.invulnerable && r.invulnerableTicksLeft > d) ? 40 : 0;
      return { r: r, d: d + pen };
    }).sort(function (a, b) { return a.d - b.d; });
    var pickR = scored[0];
    if (scored.length > 1 && idx % 2 === 1 && scored[0].d < 900) pickR = scored[1];
    var r0 = pickR.r;
    targetCell = r0.y * W + r0.x;
    var mode = idx % 2;
    if (mode === 1 && pickR.d > 5 && pickR.d < 900) {
      var cur = targetCell, pd = r0.dir, steps = 0, prev = -1, rAdj = G.rAdj;
      while (steps < 6) {
        var opts = rAdj[cur].filter(function (e) { return e[0] !== prev; });
        if (!opts.length) break;
        var nx = opts.filter(function (e) { return e[1] === pd; })[0] || opts[0];
        prev = cur; cur = nx[0]; pd = nx[1]; steps++;
      }
      targetCell = cur;
    } else if (mode === 2 && state.powerPellets.length && state.frightTicksLeft === 0 && pickR.d > 6) {
      var bp = null, bpd = 1e9, rd2 = bfs(adj, N, [targetCell]);
      state.powerPellets.forEach(function (p) {
        var dd = rd2[p.y * W + p.x]; if (dd >= 0 && dd < bpd) { bpd = dd; bp = p; }
      });
      if (bp && bpd < 12) targetCell = bp.y * W + bp.x;
    }
  }
  return pick(bfs(adj, N, [targetCell]));
}

function move(state) {
  try {
    var me = state.you;
    if (!me.alive || me.respawnIn) return 'stay';
    var G = build(state);
    var r = me.role === 'runner' ? runnerMove(state, G) : ghostMove(state, G);
    return r || 'stay';
  } catch (e) { return 'stay'; }
}
module.exports = { name: 'SonnetHunter', move: move };
