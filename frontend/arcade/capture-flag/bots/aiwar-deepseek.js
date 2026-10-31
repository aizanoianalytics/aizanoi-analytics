'use strict';

/*
 * Aegis
 *
 * The rules make a team's own half a true fortress: tagging requires both
 * agents to be inside the tagger's half, so an agent standing in its own
 * half can never be tagged by an enemy.  Also, a defender sitting on its
 * own flag tags any raider that arrives there before the pickup phase, so
 * the flag cannot be taken while a guard remains on it.
 *
 * Strategy: one guard holds our flag forever; every other agent hunts down
 * intruders inside our half.  We never cross into the enemy half.  Hence we
 * can never be tagged, our flag can never be captured, and each enemy
 * incursion into our half is converted into a tag (which decides the time
 * limit tiebreak).  The result is a guaranteed win whenever the opponent
 * contests, and a draw against a purely passive opponent - never a loss.
 */

var STEPS = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0]
];

var heapC = new Float64Array(256);
var heapI = new Int32Array(256);
var heapN = 0;
var popC = 0;
var popI = 0;

function heapGrow() {
  var nc = new Float64Array(heapC.length * 2);
  nc.set(heapC);
  heapC = nc;
  var ni = new Int32Array(heapI.length * 2);
  ni.set(heapI);
  heapI = ni;
}

function heapPush(cost, idx) {
  if (heapN + 1 > heapC.length) heapGrow();
  var i = heapN++;
  heapC[i] = cost;
  heapI[i] = idx;
  while (i > 0) {
    var p = (i - 1) >> 1;
    if (heapC[p] < heapC[i] || (heapC[p] === heapC[i] && heapI[p] <= heapI[i])) break;
    var tc = heapC[p]; heapC[p] = heapC[i]; heapC[i] = tc;
    var ti = heapI[p]; heapI[p] = heapI[i]; heapI[i] = ti;
    i = p;
  }
}

function heapPop() {
  if (heapN === 0) return false;
  popC = heapC[0];
  popI = heapI[0];
  heapN--;
  if (heapN === 0) return true;
  var lastC = heapC[heapN];
  var lastI = heapI[heapN];
  var i = 0;
  while (true) {
    var l = i * 2 + 1;
    if (l >= heapN) break;
    var r = l + 1;
    var c = l;
    if (r < heapN && (heapC[r] < heapC[l] || (heapC[r] === heapC[l] && heapI[r] < heapI[l]))) c = r;
    if (heapC[c] > lastC || (heapC[c] === lastC && heapI[c] >= lastI)) break;
    heapC[i] = heapC[c];
    heapI[i] = heapI[c];
    i = c;
  }
  heapC[i] = lastC;
  heapI[i] = lastI;
  return true;
}

var scratch = null;

function scratchFor(N) {
  if (!scratch || scratch.N !== N) {
    scratch = {
      N: N,
      dist: new Float64Array(N),
      depth: new Int32Array(N),
      prev: new Int32Array(N),
      seen: new Uint8Array(N)
    };
  }
  return scratch;
}

function directionOf(sx, sy, tx, ty) {
  if (tx === sx && ty === sy) return 'stay';
  if (tx === sx) return ty < sy ? 'up' : 'down';
  if (ty === sy) return tx < sx ? 'left' : 'right';
  if (tx < sx) return 'left';
  if (tx > sx) return 'right';
  return ty < sy ? 'up' : 'down';
}

/*
 * A* over open cells.  goal(x, y, index) decides completion; allow(x)
 * optionally restricts the traversable region; hfn(x, y) is admissible.
 * Returns { cost, steps, first } or null.
 */
function solve(state, sx, sy, goal, allow, hfn) {
  var W = state.width;
  var H = state.height;
  var N = W * H;
  var grid = state.grid;
  var S = scratchFor(N);
  var dist = S.dist;
  var depth = S.depth;
  var prev = S.prev;
  var seen = S.seen;
  dist.fill(Infinity);
  seen.fill(0);
  var start = sy * W + sx;
  if (goal(sx, sy, start)) return { cost: 0, steps: 0, first: 'stay' };
  dist[start] = 0;
  depth[start] = 0;
  prev[start] = -1;
  heapN = 0;
  heapPush(hfn(sx, sy), start);
  while (heapN > 0) {
    heapPop();
    var u = popI;
    if (seen[u]) continue;
    seen[u] = 1;
    var ux = u % W;
    var uy = (u / W) | 0;
    if (goal(ux, uy, u)) {
      var node = u;
      while (prev[node] !== start) {
        if (prev[node] === -1) return null;
        node = prev[node];
      }
      var nx = node % W;
      var ny = (node / W) | 0;
      return { cost: dist[u], steps: depth[u], first: directionOf(sx, sy, nx, ny) };
    }
    for (var d = 0; d < 4; d++) {
      var ax = ux + STEPS[d][1];
      var ay = uy + STEPS[d][2];
      if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
      if (grid[ay].charAt(ax) === '#') continue;
      if (allow && !allow(ax, ay, ay * W + ax)) continue;
      var v = ay * W + ax;
      if (seen[v]) continue;
      var nd = dist[u] + 1;
      if (nd < dist[v] - 1e-9) {
        dist[v] = nd;
        depth[v] = depth[u] + 1;
        prev[v] = u;
        heapPush(nd + hfn(ax, ay), v);
      }
    }
  }
  return null;
}

function hTo(gx, gy) {
  return function (x, y) { return Math.abs(x - gx) + Math.abs(y - gy); };
}

function isActive(a) {
  return !!a && !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null;
}

function byId(a, b) {
  var x = String(a.id);
  var y = String(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sameId(a, b) {
  return String(a) === String(b);
}

/* Nearest open cell to (x, y) satisfying the predicate. */
function nearestOpen(state, x, y, predicate) {
  var W = state.width;
  var H = state.height;
  if (x >= 0 && y >= 0 && x < W && y < H && predicate(x, y) && state.grid[y].charAt(x) !== '#') {
    return { x: x, y: y };
  }
  for (var r = 1; r < Math.max(W, H); r++) {
    var best = null;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        var nx = x + dx;
        var ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (state.grid[ny].charAt(nx) === '#') continue;
        if (!predicate(nx, ny)) continue;
        if (!best || Math.abs(nx - x) + Math.abs(ny - y) < Math.abs(best.x - x) + Math.abs(best.y - y) ||
            (nx === best.x && ny < best.y)) {
          best = { x: nx, y: ny };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function idlePost(state, team, border, ownHalf, index, count) {
  var flag = state.flags[team];
  var ring = [
    [0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];
  var offset = ring[index % ring.length];
  var p = nearestOpen(state, flag.x + offset[0], flag.y + offset[1], function (x) {
    return ownHalf(x);
  });
  if (p) return p;
  p = nearestOpen(state, flag.x, flag.y, function (x) { return ownHalf(x); });
  return p || { x: flag.x, y: flag.y };
}

function move(state) {
  var you = state.you;
  if (!isActive(you) || !state || !state.grid) return 'stay';

  var team = state.team;
  var border = state.border;
  var W = state.width;
  var H = state.height;

  var ownHalf = function (x) {
    return team === 'west' ? x < border : x > border;
  };
  var safeZone = function (x) {
    return x === border || ownHalf(x);
  };

  var allTeam = [you].concat(state.teammates).sort(byId);
  var activeTeam = allTeam.filter(isActive);
  if (!activeTeam.length) return 'stay';

  var designated = allTeam[0];
  var guard = isActive(designated) ? designated : activeTeam[0];
  var ownFlag = state.flags[team];

  if (sameId(guard.id, you.id)) {
    var tx = ownFlag.x;
    var ty = ownFlag.y;
    if (ownFlag.carrier !== null && ownFlag.carrier !== undefined && !ownHalf(tx)) {
      tx = ownFlag.home.x;
      ty = ownFlag.home.y;
    }
    var guardPlan = solve(state, you.x, you.y, function (x, y) {
      return x === tx && y === ty;
    }, safeZone, hTo(tx, ty));
    return guardPlan ? guardPlan.first : 'stay';
  }

  var hunters = activeTeam.filter(function (a) {
    return !sameId(a.id, guard.id);
  });
  var intruders = state.enemies.filter(function (a) {
    return isActive(a) && ownHalf(a.x);
  });

  var target = null;

  if (intruders.length) {
    /* Greedy closest-pair assignment so hunters spread across intruders. */
    var pairs = [];
    for (var h = 0; h < hunters.length; h++) {
      for (var e = 0; e < intruders.length; e++) {
        pairs.push({ h: hunters[h], e: intruders[e], d: manhattan(hunters[h], intruders[e]) });
      }
    }
    pairs.sort(function (a, b) {
      return a.d - b.d || byId(a.h, b.h) || byId(a.e, b.e);
    });
    var usedH = {};
    var usedE = {};
    for (var p = 0; p < pairs.length; p++) {
      var pair = pairs[p];
      var hk = String(pair.h.id);
      var ek = String(pair.e.id);
      if (usedH[hk] || usedE[ek]) continue;
      usedH[hk] = true;
      usedE[ek] = true;
      if (sameId(pair.h.id, you.id)) target = pair.e;
    }
  }

  if (!target) {
    var myIndex = 0;
    for (var k = 0; k < hunters.length; k++) {
      if (sameId(hunters[k].id, you.id)) { myIndex = k; break; }
    }
    var jailedFoes = state.enemies.some(function (a) { return a.jailed; });
    var post;
    if (jailedFoes) {
      var jail = state.zones[team].jail;
      var jc = jail[myIndex % jail.length];
      post = nearestOpen(state, jc.x + (team === 'west' ? 2 : -2), jc.y + 2, ownHalf);
    } else {
      post = idlePost(state, team, border, ownHalf, myIndex, hunters.length);
    }
    if (!post) return 'stay';
    var idlePlan = solve(state, you.x, you.y, function (x, y) {
      return x === post.x && y === post.y;
    }, safeZone, hTo(post.x, post.y));
    return idlePlan ? idlePlan.first : 'stay';
  }

  var huntPlan = solve(state, you.x, you.y, function (x, y) {
    return x === target.x && y === target.y;
  }, safeZone, hTo(target.x, target.y));
  return huntPlan ? huntPlan.first : 'stay';
}

module.exports = {
  name: 'Aegis',
  move: move
};
