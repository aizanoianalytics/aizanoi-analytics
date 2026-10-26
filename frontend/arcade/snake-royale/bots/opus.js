// Ouroboros: time-aware Voronoi territory + paranoid alpha-beta search against the most relevant rival.
var __bot = (function () {
'use strict';

var TIME_BUDGET = 20;      // ms per move (arena limit 50)
var SHRINK_EVERY = 20;
var DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0];
var DNAME = ['up', 'down', 'left', 'right'];

var W, H, N, maxRing, ringOf, t0, deadline, timedOut, nodes;
var curRing, nextShrink, startTurn;
var lastMoveIdx = -1;
var allowTimeout = false;

function now() { return Date.now(); }

// ---------- helpers ----------
function ringIdx(i) {
  var x = i % W, y = (i / W) | 0;
  return Math.min(x, y, W - 1 - x, H - 1 - y);
}
// turn after which ring r becomes hazard (Infinity if never)
function ringCloseTurn(r) {
  if (r < curRing) return -1;
  if (r >= maxRing) return Infinity;
  return nextShrink + (r - curRing) * SHRINK_EVERY;
}
var closeTurnOfCell;
// is cell deadly to enter on game turn t (the turn number when the move is made)
function hazardAt(i, t) {
  return t > closeTurnOfCell[i];
}

function neighbor(i, d) {
  var x = i % W + DX[d], y = ((i / W) | 0) + DY[d];
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  return y * W + x;
}
var NB; // precomputed neighbours

// ---------- simulation ----------
// node: { turn, snakes:[{id, body:[idx], health, alive, searched}], food: Uint8Array, foodCount }
function cloneNode(n) {
  var s = new Array(n.snakes.length);
  for (var k = 0; k < n.snakes.length; k++) {
    var a = n.snakes[k];
    s[k] = { id: a.id, body: a.body.slice(), health: a.health, alive: a.alive, searched: a.searched, me: a.me };
  }
  return { turn: n.turn, snakes: s, food: n.food, foodShared: true };
}

// legal-ish moves of snake k in node (avoids walls, hazard, bodies that won't move)
function candMoves(n, k) {
  var sn = n.snakes[k];
  var head = sn.body[0];
  var res = [];
  for (var d = 0; d < 4; d++) {
    var c = NB[head * 4 + d];
    if (c < 0) continue;
    if (hazardAt(c, n.turn)) continue;
    if (sn.body.length > 1 && c === sn.body[1]) continue;
    var blocked = false;
    for (var j = 0; j < n.snakes.length && !blocked; j++) {
      var o = n.snakes[j];
      if (!o.alive) continue;
      var b = o.body, L = b.length;
      var lim = L - 1;
      // tail moves away unless the snake just ate (stacked tail) or is static
      if (!o.searched) lim = L;
      else if (L >= 2 && b[L - 1] === b[L - 2]) lim = L;
      for (var q = 0; q < lim; q++) if (b[q] === c) { blocked = true; break; }
    }
    if (!blocked) res.push(d);
  }
  return res;
}

// apply moves (array indexed by snake index; -1 for static snakes)
function step(n, moves) {
  var c = cloneNode(n);
  var S = c.snakes;
  var k, sn;
  var t = c.turn;
  var out = [];
  for (k = 0; k < S.length; k++) {
    sn = S[k]; out.push(false);
    if (!sn.alive || !sn.searched) continue;
    var nh = NB[sn.body[0] * 4 + moves[k]];
    sn.health -= 1;
    if (nh < 0) { out[k] = true; sn.body.unshift(sn.body[0]); continue; }
    sn.body.unshift(nh);
  }
  // eating (decide all eaters first, then remove food)
  var eaten = null;
  for (k = 0; k < S.length; k++) {
    sn = S[k];
    if (!sn.alive || !sn.searched) continue;
    var h = sn.body[0];
    if (!out[k] && c.food[h]) {
      sn.health = 100;
      (eaten || (eaten = [])).push(h);
    } else sn.body.pop();
  }
  if (eaten) {
    c.food = c.food.slice(); c.foodShared = false;
    for (k = 0; k < eaten.length; k++) c.food[eaten[k]] = 0;
  }
  var dead = [];
  for (k = 0; k < S.length; k++) {
    sn = S[k];
    if (!sn.alive || !sn.searched) { dead.push(false); continue; }
    var hd = sn.body[0], die = out[k];
    if (!die && hazardAt(hd, t)) die = true;
    if (!die && sn.health <= 0) die = true;
    if (!die) {
      for (var j = 0; j < S.length && !die; j++) {
        var o = S[j];
        if (!o.alive) continue;
        var b = o.body;
        var st = o.searched ? 1 : 0;
        for (var q = st; q < b.length; q++) if (b[q] === hd) { die = true; break; }
      }
    }
    if (!die) {
      for (j = 0; j < S.length; j++) {
        if (j === k) continue;
        var o2 = S[j];
        if (!o2.alive || !o2.searched) continue;
        if (o2.body[0] === hd && o2.body.length >= sn.body.length) { die = true; break; }
      }
    }
    dead.push(die);
  }
  for (k = 0; k < S.length; k++) if (dead[k]) { S[k].alive = false; S[k].deathTurn = t; }
  c.turn = t + 1;
  return c;
}

// ---------- evaluation ----------
var owner, claimT, freeAt, frontier, nfront;
function evaluate(n, meIdx, oppIdx, depth) {
  var S = n.snakes, me = S[meIdx];
  var k, i, q;
  // freeAt: number of turns until a body cell is vacated
  for (i = 0; i < N; i++) { freeAt[i] = 0; owner[i] = -1; claimT[i] = -1; }
  for (k = 0; k < S.length; k++) {
    var sn = S[k];
    if (!sn.alive) continue;
    var b = sn.body, L = b.length;
    for (q = 0; q < L; q++) {
      var f = L - q;
      if (f > freeAt[b[q]]) freeAt[b[q]] = f;
    }
  }
  var alive = [];
  for (k = 0; k < S.length; k++) if (S[k].alive) alive.push(k);
  var area = new Array(S.length).fill(0);
  var foodDist = new Array(S.length).fill(999);
  var fr = [];
  for (var a = 0; a < alive.length; a++) {
    k = alive[a];
    owner[S[k].body[0]] = k; claimT[S[k].body[0]] = 0;
    fr.push([S[k].body[0]]);
  }
  var turn0 = n.turn;
  for (var dist = 1; dist < 80; dist++) {
    var any = false;
    var nf = [];
    for (a = 0; a < alive.length; a++) {
      k = alive[a];
      var list = fr[a], out = [];
      for (var li = 0; li < list.length; li++) {
        var c = list[li];
        if (owner[c] !== k) continue; // stolen
        for (var d = 0; d < 4; d++) {
          var nb = NB[c * 4 + d];
          if (nb < 0) continue;
          if (freeAt[nb] > dist) continue;
          if (hazardAt(nb, turn0 + dist - 1)) continue;
          var ow = owner[nb];
          if (ow === -1) {
            owner[nb] = k; claimT[nb] = dist; out.push(nb);
          } else if (claimT[nb] === dist && ow !== k) {
            if (ow === -2) continue;
            var lk = S[k].body.length, lo = S[ow].body.length;
            if (lk > lo) { owner[nb] = k; out.push(nb); }
            else if (lk === lo) owner[nb] = -2;
          }
        }
      }
      nf.push(out);
    }
    for (a = 0; a < alive.length; a++) {
      k = alive[a];
      var lst = nf[a], cnt = 0;
      for (li = 0; li < lst.length; li++) {
        if (owner[lst[li]] === k) {
          cnt++;
          if (n.food[lst[li]] && foodDist[k] === 999) foodDist[k] = dist;
        }
      }
      area[k] += cnt;
      if (cnt) any = true;
      fr[a] = lst;
    }
    if (!any) break;
  }
  // contested cells count half for everyone? ignore

  var myLen = me.body.length, myA = area[meIdx];
  var score = 0;
  if (myA < myLen) score -= 3000 + (myLen - myA) * 150;
  var acap = myLen * 2 + 15;
  score += (myA <= acap ? myA : acap + (myA - acap) * 0.3) * 4;

  var nOpp = 0, maxOppLen = 0, oppAreaSum = 0;
  for (a = 0; a < alive.length; a++) {
    k = alive[a];
    if (k === meIdx) continue;
    nOpp++;
    var ol = S[k].body.length;
    if (ol > maxOppLen) maxOppLen = ol;
    oppAreaSum += area[k];
    if (k === oppIdx) {
      if (area[k] < ol) score += 1500 + (ol - area[k]) * 80;
      score -= area[k] * (nOpp && alive.length === 2 ? 4 : 1.5);
    }
  }
  // length advantage
  var diff = myLen - maxOppLen;
  if (nOpp > 0) {
    var cd = diff > 6 ? 6 + (diff - 6) * 0.3 : (diff < -6 ? -6 : diff);
    score += cd * 70;
    if (diff >= 1) score += 30;
  } else score += myLen * 10;

  // health / food
  var fd = foodDist[meIdx];
  var hp = me.health;
  if (fd < 999) {
    if (hp <= fd) score -= 2500;
    else if (hp - fd < 12) score -= (12 - (hp - fd)) * 25;
    var hunger = hp < 25 ? 12 : (hp < 50 ? 8 : (diff < 2 ? 7 : (diff < 5 ? 4 : 1.5)));
    if (turn0 > 140 && diff >= 2 && hp > 40) hunger = 0.3;
    score -= fd * hunger;
  } else {
    var md2 = 999, mh = me.body[0], mx = mh % W, my = (mh / W) | 0;
    for (i = 0; i < N; i++) if (n.food[i]) { var dm = Math.abs(i % W - mx) + Math.abs(((i / W) | 0) - my); if (dm < md2) md2 = dm; }
    score -= 40 + (md2 < 999 ? md2 : 20) * (hp < 30 ? 12 : (hp < 50 ? 5 : 2));
    if (md2 < 999 && hp <= md2) score -= 1500;
  }
  score += hp * 0.15;

  // storm: prefer inner rings when the shrink approaches
  var hr = ringOf[me.body[0]];
  var ct = closeTurnOfCell[me.body[0]];
  if (ct !== Infinity) {
    var left = ct - turn0;
    if (left < 25) score -= (25 - left) * 6;
  }
  if (turn0 > 100) score += hr * 3;
  // mild centre preference early to avoid walls
  score += hr * 2;
  return score;
}

// ---------- search ----------
var WIN = 1e6;
function terminal(n, meIdx, oppIdx, ply) {
  var me = n.snakes[meIdx];
  var aliveOthers = 0, othersLongestDeadNow = 0;
  for (var k = 0; k < n.snakes.length; k++) {
    if (k === meIdx) continue;
    if (n.snakes[k].alive) aliveOthers++;
  }
  if (!me.alive) {
    // both died at same time?
    var opp = oppIdx >= 0 ? n.snakes[oppIdx] : null;
    if (opp && !opp.alive && opp.deathTurn === me.deathTurn && aliveOthers === 0) {
      if (me.body.length > opp.body.length) return WIN * 0.5 - ply;
      if (me.body.length === opp.body.length) return -WIN * 0.3 + ply;
    }
    return -WIN + ply * 1000;
  }
  if (aliveOthers === 0 && n.snakes.length > 1) return WIN - ply * 1000;
  return null;
}

function search(n, meIdx, oppIdx, depth, ply, alpha, beta) {
  nodes++;
  var tv = terminal(n, meIdx, oppIdx, ply);
  if (tv !== null) return tv;
  var oppDead = oppIdx >= 0 && !n.snakes[oppIdx].alive;
  var bonus = oppDead && ply > 0 ? 200000 - ply * 1000 : 0;
  if (depth === 0) return evaluate(n, meIdx, oppDead ? -1 : oppIdx, ply) + bonus;
  if (allowTimeout && now() > deadline) { timedOut = true; return 0; }
  var myMoves = candMoves(n, meIdx);
  if (!myMoves.length) myMoves = [0];
  var oppMoves = (oppIdx >= 0 && !oppDead) ? candMoves(n, oppIdx) : [-1];
  if (!oppMoves.length) oppMoves = [0];
  var best = -Infinity;
  var moves = new Array(n.snakes.length).fill(-1);
  for (var i = 0; i < myMoves.length; i++) {
    var worst = Infinity;
    var b2 = beta;
    for (var j = 0; j < oppMoves.length; j++) {
      moves[meIdx] = myMoves[i];
      if (oppIdx >= 0 && !oppDead) moves[oppIdx] = oppMoves[j];
      var ch = step(n, moves);
      var v = search(ch, meIdx, oppIdx, depth - 1, ply + 1, alpha, b2);
      if (timedOut) return 0;
      if (v < worst) worst = v;
      if (worst < b2) b2 = worst;
      if (worst <= alpha) break;
    }
    if (worst > best) best = worst;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best + (ply > 0 ? 0 : 0);
}

// ---------- main ----------
function move(state) {
  t0 = now();
  deadline = t0 + TIME_BUDGET;
  timedOut = false; nodes = 0;
  W = state.width; H = state.height; N = W * H;
  maxRing = Math.floor(Math.min(W, H) / 2) - 1;
  if (!NB || NB.length !== N * 4) {
    NB = new Int32Array(N * 4);
    for (var i = 0; i < N; i++) for (var d = 0; d < 4; d++) NB[i * 4 + d] = neighbor(i, d);
    owner = new Int32Array(N); claimT = new Int32Array(N); freeAt = new Int32Array(N);
    ringOf = new Int32Array(N);
    for (i = 0; i < N; i++) ringOf[i] = ringIdx(i);
    closeTurnOfCell = new Float64Array(N);
  }
  // current hazard ring from hazards
  var hz = new Uint8Array(N);
  curRing = 0;
  for (var h = 0; h < state.hazards.length; h++) {
    var p = state.hazards[h];
    hz[p.y * W + p.x] = 1;
    var r = Math.min(p.x, p.y, W - 1 - p.x, H - 1 - p.y);
    if (r + 1 > curRing) curRing = r + 1;
  }
  nextShrink = state.nextShrinkTurn || 150;
  if (nextShrink < state.turn) nextShrink = state.turn;
  for (i = 0; i < N; i++) {
    if (hz[i]) { closeTurnOfCell[i] = -1; continue; }
    // closes after turn ringCloseTurn => deadly to enter on turns > that
    closeTurnOfCell[i] = ringCloseTurn(ringOf[i]);
  }

  var food = new Uint8Array(N);
  for (i = 0; i < state.food.length; i++) food[state.food[i].y * W + state.food[i].x] = 1;

  var snakes = [], meIdx = -1;
  for (i = 0; i < state.snakes.length; i++) {
    var s = state.snakes[i];
    var body = s.body.map(function (q) { return q.y * W + q.x; });
    var isMe = s.id === state.you.id;
    if (isMe) meIdx = snakes.length;
    snakes.push({ id: s.id, body: body, health: s.health, alive: true, searched: isMe, me: isMe });
  }
  if (meIdx < 0) return 'up';
  var me = snakes[meIdx];
  var myHead = me.body[0], myLen = me.body.length;

  // choose the rival to search against: closest head
  var oppIdx = -1, bestD = Infinity;
  var hx = myHead % W, hy = (myHead / W) | 0;
  for (i = 0; i < snakes.length; i++) {
    if (i === meIdx) continue;
    var oh = snakes[i].body[0];
    var dd = Math.abs(oh % W - hx) + Math.abs(((oh / W) | 0) - hy);
    if (dd < bestD) { bestD = dd; oppIdx = i; }
  }
  var nSn = snakes.length;
  if (oppIdx >= 0 && (nSn === 2 || bestD <= 10)) snakes[oppIdx].searched = true;
  else oppIdx = -1;

  var root = { turn: state.turn, snakes: snakes, food: food, foodShared: true };

  // danger from static (unsearched) snakes: cells their heads may reach next turn
  var danger = new Float64Array(N);
  for (i = 0; i < snakes.length; i++) {
    if (i === meIdx || snakes[i].searched) continue;
    var so = snakes[i];
    for (d = 0; d < 4; d++) {
      var c = NB[so.body[0] * 4 + d];
      if (c < 0) continue;
      if (so.body.length >= myLen) danger[c] += (so.body.length === myLen ? 150000 : 250000);
      else danger[c] -= 20;
    }
  }
  // static snakes' bodies: treat tails as moving for root move legality
  var rootMoves = [];
  for (d = 0; d < 4; d++) {
    c = NB[myHead * 4 + d];
    if (c < 0 || hz[c]) continue;
    if (me.body.length > 1 && c === me.body[1]) continue;
    var blocked = false;
    for (var j = 0; j < snakes.length && !blocked; j++) {
      var b = snakes[j].body, L = b.length;
      var lim = (L >= 2 && b[L - 1] === b[L - 2]) ? L : L - 1;
      for (var q = 0; q < lim; q++) if (b[q] === c) { blocked = true; break; }
      // opponent tail may stay if that snake eats this turn
      if (!blocked && j !== meIdx && b[L - 1] === c) {
        var oh2 = b[0];
        for (var e = 0; e < 4; e++) { var fc = NB[oh2 * 4 + e]; if (fc >= 0 && food[fc]) { danger[c] += 100000; break; } }
      }
    }
    if (!blocked) rootMoves.push(d);
  }
  if (!rootMoves.length) {
    // nothing safe: pick any in-bounds move
    for (d = 0; d < 4; d++) if (NB[myHead * 4 + d] >= 0 && NB[myHead * 4 + d] !== me.body[1]) return DNAME[d];
    return 'up';
  }
  if (rootMoves.length === 1) { lastMoveIdx = rootMoves[0]; return DNAME[rootMoves[0]]; }

  // make static snakes "searched=false" bodies static but drop their tail once (they will move)
  // iterative deepening
  var vals = {};
  var order = rootMoves.slice();
  var bestMove = order[0];
  var bestScores = null, prevBestV = -Infinity;
  for (var depth = 1; depth <= 30; depth++) {
    allowTimeout = depth > 1;
    var scores = [];
    var alpha = -Infinity;
    var curBest = -1, curBestV = -Infinity;
    for (var mi = 0; mi < order.length; mi++) {
      var md = order[mi];
      var v = rootValue(root, meIdx, oppIdx, md, depth, -Infinity);
      if (timedOut) break;
      v -= danger[NB[myHead * 4 + md]];
      scores.push([md, v]);
      if (v > curBestV) { curBestV = v; curBest = md; }
    }
    if (timedOut) break;
    // paranoid search says every move loses: trust the deepest depth where we still had a way out
    if (curBestV < -WIN / 2 && depth > 1 && prevBestV > -WIN / 2) break;
    prevBestV = curBestV;
    bestMove = curBest; bestScores = scores;
    scores.sort(function (x, y) { return y[1] - x[1]; });
    order = scores.map(function (x) { return x[0]; });
    if (curBestV > WIN / 2 || curBestV < -WIN * 0.9) {
      // decided; deeper search will not change much but let it continue if all lose (to find longest survival)
      if (curBestV > WIN / 2) break;
    }
    if (now() - t0 > TIME_BUDGET * 0.45) break;
  }
  lastMoveIdx = bestMove;
  return DNAME[bestMove];
}

function rootValue(root, meIdx, oppIdx, md, depth, alpha) {
  var moves = new Array(root.snakes.length).fill(-1);
  moves[meIdx] = md;
  var oppMoves = oppIdx >= 0 ? candMoves(root, oppIdx) : [-1];
  if (!oppMoves.length) oppMoves = [0];
  var worst = Infinity;
  for (var j = 0; j < oppMoves.length; j++) {
    if (oppIdx >= 0) moves[oppIdx] = oppMoves[j];
    var ch = step(root, moves);
    var v = search(ch, meIdx, oppIdx, depth - 1, 1, -Infinity, worst);
    if (timedOut) return 0;
    if (v < worst) worst = v;
  }
  return worst;
}

return move;
})();

function move(state) {
  try {
    var r = __bot(state);
    if (r === 'up' || r === 'down' || r === 'left' || r === 'right') return r;
  } catch (e) { /* fall through to emergency move */ }
  return emergencyMove(state);
}

// very simple safe-move picker used only if the main engine throws
function emergencyMove(state) {
  try {
    var W = state.width, H = state.height, me = state.you, occ = {};
    state.snakes.forEach(function (s) { s.body.slice(0, -1).forEach(function (p) { occ[p.x + ',' + p.y] = 1; }); });
    (state.hazards || []).forEach(function (p) { occ[p.x + ',' + p.y] = 1; });
    var dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }, best = 'up', bs = -1;
    for (var d in dirs) {
      var x = me.head.x + dirs[d][0], y = me.head.y + dirs[d][1];
      if (x < 0 || y < 0 || x >= W || y >= H || occ[x + ',' + y]) continue;
      var sc = Math.min(x, y, W - 1 - x, H - 1 - y) + 1;
      if (sc > bs) { bs = sc; best = d; }
    }
    return best;
  } catch (e) { return 'up'; }
}

module.exports = { name: 'Ouroboros', move };
