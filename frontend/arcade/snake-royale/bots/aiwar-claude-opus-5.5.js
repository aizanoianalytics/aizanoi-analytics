'use strict';
// Opus Constrictor: simultaneous-move paranoid alpha-beta search with exact engine rules,
// iterative deepening, tail-aware Voronoi territory evaluation, food/health and storm awareness.

var DNAMES = ['up', 'down', 'left', 'right'];
var DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0];
var TIME_BUDGET = 140; // ms, well under the 400 ms limit

var W = 11, H = 11, N = 121;
var ringCap = 4, r0 = 0, nextShrink = 150, shrinkEvery = 20;
var deadline = 0, nodes = 0, myIdx = 0, oppIdxs = [], nOpp = 0;
var startHealth = 100;

function TimeUp() {}

function ringFor(t) {
  // storm ring active when the move of turn t is resolved
  var r = r0;
  if (t > nextShrink) r += 1 + Math.floor((t - 1 - nextShrink) / shrinkEvery);
  return r > ringCap ? ringCap : r;
}
function inRing(x, y, r) {
  return x < r || y < r || x >= W - r || y >= H - r;
}

function cloneState(st) {
  var s = new Array(st.s.length);
  for (var i = 0; i < st.s.length; i++) {
    var o = st.s[i];
    s[i] = { b: o.b, len: o.len, hp: o.hp, alive: o.alive };
  }
  return { t: st.t, s: s, food: st.food };
}

// Apply joint moves (dir index per snake). Mirrors engine resolution.
function step(st, mv) {
  var ns = cloneState(st);
  var S = ns.s, n = S.length, i, j, k;
  var nx = new Int32Array(n), ny = new Int32Array(n), nh = new Int32Array(n);
  var ring = ringFor(st.t);
  var ate = [];
  for (i = 0; i < n; i++) {
    var sn = S[i];
    if (!sn.alive) continue;
    var h = sn.b[0], hx = h % W, hy = (h - hx) / W;
    var d = mv[i] < 0 ? 0 : mv[i];
    nx[i] = hx + DX[d]; ny[i] = hy + DY[d];
    var inb = nx[i] >= 0 && ny[i] >= 0 && nx[i] < W && ny[i] < H;
    nh[i] = inb ? ny[i] * W + nx[i] : -1;
    sn.hp -= 1;
    var grow = inb && st.food[nh[i]] === 1;
    var nb = new Int16Array(grow ? sn.len + 1 : sn.len);
    nb[0] = inb ? nh[i] : 0;
    var lim = grow ? sn.len : sn.len - 1;
    for (k = 0; k < lim; k++) nb[k + 1] = sn.b[k];
    sn.b = nb;
    if (grow) { sn.len += 1; sn.hp = startHealth; ate.push(nh[i]); }
  }
  if (ate.length) {
    var f = new Uint8Array(st.food);
    for (i = 0; i < ate.length; i++) f[ate[i]] = 0;
    ns.food = f;
  }
  var dead = [];
  for (i = 0; i < n; i++) {
    var a = S[i];
    if (!a.alive) continue;
    var die = false;
    if (nh[i] < 0) die = true;
    else if (inRing(nx[i], ny[i], ring)) die = true;
    else if (a.hp <= 0) die = true;
    else {
      var c = nh[i];
      for (j = 0; j < n && !die; j++) {
        var o = S[j];
        if (!o.alive) continue;
        var ob = o.b;
        for (k = 1; k < o.len; k++) if (ob[k] === c) { die = true; break; }
      }
      if (!die) for (j = 0; j < n; j++) {
        if (j === i || !S[j].alive) continue;
        if (nh[j] === c && S[j].len >= a.len) { die = true; break; }
      }
    }
    if (die) dead.push(i);
  }
  for (i = 0; i < dead.length; i++) S[dead[i]].alive = false;
  ns.t = st.t + 1;
  return ns;
}

// Plausible moves for snake i: in bounds, not storm, not into a body segment that cannot vacate.
function genMoves(st, i) {
  var sn = st.s[i];
  var h = sn.b[0], hx = h % W, hy = (h - hx) / W;
  var ring = ringFor(st.t);
  var res = [], fallback = [];
  for (var d = 0; d < 4; d++) {
    var x = hx + DX[d], y = hy + DY[d];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (inRing(x, y, ring)) continue;
    var c = y * W + x;
    var hit = false;
    for (var j = 0; j < st.s.length && !hit; j++) {
      var o = st.s[j];
      if (!o.alive) continue;
      var end = o.len - 1; // tail vacates unless stacked
      if (o.len >= 2 && o.b[end] === o.b[end - 1]) end = o.len;
      for (var k = 0; k < end; k++) if (o.b[k] === c) { hit = true; break; }
    }
    if (hit) { fallback.push(d); continue; }
    res.push(d);
  }
  if (!res.length) res = fallback.length ? fallback : [0];
  return res;
}

var distA = new Int32Array(0), owner = new Int32Array(0), freeAt = new Int32Array(0), queue = new Int32Array(0);
var NB = [], nbW = -1, nbH = -1;
function ensure() {
  if (distA.length !== N) {
    distA = new Int32Array(N); owner = new Int32Array(N); freeAt = new Int32Array(N); queue = new Int32Array(N * 2);
  }
  if (nbW === W && nbH === H) return;
  nbW = W; nbH = H;
  NB = new Array(N);
  for (var c = 0; c < N; c++) {
    var x = c % W, y = (c - x) / W, l = [];
    if (y > 0) l.push(c - W);
    if (y < H - 1) l.push(c + W);
    if (x > 0) l.push(c - 1);
    if (x < W - 1) l.push(c + 1);
    NB[c] = l;
  }
}

var WIN = 1e7;
var INFD = 0x3fffffff;

function evaluate(st, ply) {
  var S = st.s, me = S[myIdx];
  var i, k, c, o;
  var anyOpp = false;
  for (i = 0; i < nOpp; i++) if (S[oppIdxs[i]].alive) anyOpp = true;
  if (!me.alive) {
    if (!anyOpp) {
      var bestO = 0;
      for (i = 0; i < nOpp; i++) if (S[oppIdxs[i]].len > bestO) bestO = S[oppIdxs[i]].len;
      if (me.len > bestO) return WIN / 2 - ply * 1000;
      if (me.len === bestO) return -WIN / 4 + ply * 1000;
      return -WIN / 2 + ply * 1000;
    }
    return -WIN + ply * 1000;
  }
  if (!anyOpp && nOpp > 0) return WIN - ply * 1000;

  freeAt.fill(0);
  for (i = 0; i < S.length; i++) {
    var sn = S[i];
    if (!sn.alive) continue;
    for (k = 0; k < sn.len; k++) {
      c = sn.b[k];
      var ft = sn.len - k;
      if (ft > freeAt[c]) freeAt[c] = ft;
    }
  }
  distA.fill(INFD);
  owner.fill(-1);
  var qh = 0, qt = 0;
  for (i = 0; i < S.length; i++) {
    if (!S[i].alive) continue;
    c = S[i].b[0];
    if (distA[c] === 0) { owner[c] = -2; continue; }
    distA[c] = 0; owner[c] = i; queue[qt++] = c;
  }
  var t0 = st.t;
  var counts = new Int32Array(S.length);
  var foodD = new Int32Array(S.length).fill(999);
  while (qh < qt) {
    c = queue[qh++];
    o = owner[c];
    if (o === -2) continue;
    var d = distA[c] + 1;
    var ring = ringFor(t0 + d - 1);
    var nb = NB[c];
    for (k = 0; k < nb.length; k++) {
      var n2 = nb[k];
      if (freeAt[n2] > d) continue;
      if (ring > 0) {
        var x = n2 % W, y = (n2 - x) / W;
        if (inRing(x, y, ring)) continue;
      }
      if (distA[n2] === INFD) {
        distA[n2] = d; owner[n2] = o; queue[qt++] = n2;
      } else if (distA[n2] === d && owner[n2] !== o && owner[n2] >= 0) {
        var on = owner[n2];
        if (S[o].len > S[on].len) owner[n2] = o;
        else if (S[o].len === S[on].len) owner[n2] = -2;
      }
    }
  }
  for (c = 0; c < N; c++) {
    o = owner[c];
    if (o >= 0) {
      counts[o]++;
      if (st.food[c] === 1 && distA[c] < foodD[o]) foodD[o] = distA[c];
    }
  }
  var myCnt = counts[myIdx];
  var oppCnt = 0, oppLen = 0;
  for (i = 0; i < nOpp; i++) {
    var oi = oppIdxs[i];
    if (!S[oi].alive) continue;
    if (counts[oi] > oppCnt) oppCnt = counts[oi];
    if (S[oi].len > oppLen) oppLen = S[oi].len;
  }
  var score = 0;
  score += (myCnt - oppCnt) * 10;
  if (myCnt < me.len) score -= (me.len - myCnt) * 40 + 300;
  for (i = 0; i < nOpp; i++) {
    var oo = S[oppIdxs[i]];
    if (oo.alive && counts[oppIdxs[i]] < oo.len) score += 150 + (oo.len - counts[oppIdxs[i]]) * 15;
  }
  var ld = me.len - oppLen;
  score += Math.max(-8, Math.min(ld, 8)) * 40 + ld * 8;
  var fd = foodD[myIdx];
  var hp = me.hp;
  if (fd < 999) {
    var hunger = hp < 30 ? 6 : (hp < 60 ? 2.5 : 1);
    if (ld < 3) hunger *= 2.5;
    if (me.len > 25 && hp > 40) hunger *= 0.3;
    score -= fd * hunger * 2;
    if (fd > hp) score -= 500;
  } else if (hp < 25) {
    score -= (25 - hp) * 30;
  }
  score += hp * 0.3;
  var hh = me.b[0], hx = hh % W, hy = (hh - hx) / W;
  var edge = Math.min(hx, hy, W - 1 - hx, H - 1 - hy);
  var ringSoon = ringFor(st.t + 12);
  if (edge < ringSoon + 1) score -= (ringSoon + 1 - edge) * 20;
  return score;
}

function oppCombos(st) {
  var S = st.s;
  var lists = [], idxs = [];
  for (var i = 0; i < nOpp; i++) {
    var oi = oppIdxs[i];
    if (!S[oi].alive) continue;
    idxs.push(oi);
    lists.push(genMoves(st, oi));
  }
  var combos = [[]];
  for (i = 0; i < lists.length; i++) {
    var nc = [];
    for (var a = 0; a < combos.length; a++) for (var b = 0; b < lists[i].length; b++) nc.push(combos[a].concat([lists[i][b]]));
    combos = nc;
  }
  return { idxs: idxs, combos: combos };
}

function fillPassive(st, mv) {
  var S = st.s;
  for (var i = 0; i < S.length; i++) {
    if (i === myIdx || !S[i].alive || mv[i] >= 0) continue;
    mv[i] = genMoves(st, i)[0];
  }
}

function makeMv(st, m, oc, b) {
  var mv = new Int32Array(st.s.length).fill(-1);
  mv[myIdx] = m;
  var cb = oc.combos[b];
  for (var k = 0; k < cb.length; k++) mv[oc.idxs[k]] = cb[k];
  fillPassive(st, mv);
  return mv;
}

function search(st, depth, ply, alpha, beta) {
  if ((++nodes & 31) === 0 && Date.now() > deadline) throw new TimeUp();
  var me = st.s[myIdx];
  var anyOpp = false;
  for (var i = 0; i < nOpp; i++) if (st.s[oppIdxs[i]].alive) anyOpp = true;
  if (depth === 0 || !me.alive || !anyOpp) return evaluate(st, ply);
  var myMoves = genMoves(st, myIdx);
  var oc = oppCombos(st);
  var best = -Infinity;
  for (var a = 0; a < myMoves.length; a++) {
    var worst = Infinity;
    for (var b = 0; b < oc.combos.length; b++) {
      var child = step(st, makeMv(st, myMoves[a], oc, b));
      var v = search(child, depth - 1, ply + 1, Math.max(alpha, best), Math.min(beta, worst));
      if (v < worst) worst = v;
      if (worst <= Math.max(alpha, best)) break;
    }
    if (worst > best) best = worst;
    if (best >= beta) break;
  }
  return best;
}

function buildState(state) {
  var food = new Uint8Array(N);
  var i, k;
  for (i = 0; i < state.food.length; i++) {
    var f = state.food[i];
    if (f.x >= 0 && f.y >= 0 && f.x < W && f.y < H) food[f.y * W + f.x] = 1;
  }
  var s = [];
  myIdx = -1;
  for (i = 0; i < state.snakes.length; i++) {
    var sn = state.snakes[i];
    var b = new Int16Array(sn.body.length);
    for (k = 0; k < sn.body.length; k++) b[k] = sn.body[k].y * W + sn.body[k].x;
    s.push({ b: b, len: sn.body.length, hp: sn.health, alive: true });
    if (sn.id === state.you.id) myIdx = i;
  }
  if (myIdx < 0) {
    var y = state.you, bb = new Int16Array(y.body.length);
    for (k = 0; k < y.body.length; k++) bb[k] = y.body[k].y * W + y.body[k].x;
    s.push({ b: bb, len: y.body.length, hp: y.health, alive: true });
    myIdx = s.length - 1;
  }
  return { t: state.turn, s: s, food: food };
}

function decide(state) {
  var t0 = Date.now();
  deadline = t0 + TIME_BUDGET;
  W = state.width; H = state.height; N = W * H;
  ensure();
  ringCap = Math.floor(Math.min(W, H) / 2) - 1;
  nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : 150;
  var hz = {};
  var i;
  for (i = 0; i < (state.hazards || []).length; i++) hz[state.hazards[i].y * W + state.hazards[i].x] = 1;
  r0 = 0;
  var midY = Math.floor(H / 2);
  while (r0 < W && hz[midY * W + r0]) r0++;
  var st = buildState(state);
  var me = st.s[myIdx];
  var hh = me.b[0], hx = hh % W, hy = (hh - hx) / W;

  var others = [];
  for (i = 0; i < st.s.length; i++) {
    if (i === myIdx) continue;
    var oh = st.s[i].b[0], ox = oh % W, oy = (oh - ox) / W;
    others.push({ i: i, d: Math.abs(ox - hx) + Math.abs(oy - hy) });
  }
  others.sort(function (a, b) { return a.d - b.d; });
  oppIdxs = [];
  var maxOpp = others.length > 3 ? 1 : 2;
  for (i = 0; i < others.length && oppIdxs.length < maxOpp; i++) {
    if (oppIdxs.length === 0 || others[i].d <= 6) oppIdxs.push(others[i].i);
  }
  nOpp = oppIdxs.length;

  var order = genMoves(st, myIdx).slice();
  var bestMove = order[0];
  if (nOpp === 0) {
    var bv = -Infinity;
    for (i = 0; i < order.length; i++) {
      var mv = new Int32Array(st.s.length).fill(-1); mv[myIdx] = order[i];
      var v = evaluate(step(st, mv), 1);
      if (v > bv) { bv = v; bestMove = order[i]; }
    }
    return DNAMES[bestMove];
  }
  if (order.length === 1) return DNAMES[order[0]];
  for (var depth = 1; depth <= 40; depth++) {
    try {
      var iterBest = -Infinity, iterMove = order[0];
      var sc = [];
      var oc = oppCombos(st);
      for (var a = 0; a < order.length; a++) {
        var m = order[a];
        var worst = Infinity;
        for (var b = 0; b < oc.combos.length; b++) {
          var child = step(st, makeMv(st, m, oc, b));
          var val = search(child, depth - 1, 1, iterBest, worst);
          if (val < worst) worst = val;
          if (worst <= iterBest) break;
        }
        sc.push({ m: m, v: worst });
        if (worst > iterBest) { iterBest = worst; iterMove = m; }
      }
      bestMove = iterMove;
      sc.sort(function (p, q) { return q.v - p.v; });
      order = sc.map(function (p) { return p.m; });
      if (iterBest >= WIN / 2) break;
      if (Date.now() - t0 > TIME_BUDGET * 0.45) break;
    } catch (e) {
      if (e instanceof TimeUp) break;
      throw e;
    }
  }
  return DNAMES[bestMove];
}

function move(state) {
  try {
    var r = decide(state);
    if (typeof r === 'string') return r;
  } catch (e) {}
  try {
    var me = state.you, Wd = state.width, Hd = state.height;
    var occ = {};
    for (var i = 0; i < state.snakes.length; i++) for (var k = 0; k < state.snakes[i].body.length - 1; k++) occ[state.snakes[i].body[k].x + ',' + state.snakes[i].body[k].y] = 1;
    for (var h = 0; h < (state.hazards || []).length; h++) occ[state.hazards[h].x + ',' + state.hazards[h].y] = 1;
    for (var d = 0; d < 4; d++) {
      var x = me.head.x + DX[d], y = me.head.y + DY[d];
      if (x >= 0 && y >= 0 && x < Wd && y < Hd && !occ[x + ',' + y]) return DNAMES[d];
    }
  } catch (e2) {}
  return 'up';
}

module.exports = { name: 'Opus Constrictor', move: move };
