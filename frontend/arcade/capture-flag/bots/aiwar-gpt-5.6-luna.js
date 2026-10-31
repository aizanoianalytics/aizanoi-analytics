'use strict';

module.exports = {
  name: 'Luna',
  move: function (state) {
    try {
      return decide(state);
    } catch (err) {
      return 'stay';
    }
  }
};

var DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

function decide(state) {
  var you = state.you;
  if (!you || you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';
  var W = state.width, H = state.height, grid = state.grid, border = state.border;
  var team = state.team, enemy = team === 'west' ? 'east' : 'west';
  var midY = Math.floor(H / 2);

  function ownHalf(x) { return team === 'west' ? x < border : x > border; }
  function homeOnly(x) { return ownHalf(x) || x === border; }
  function foeHalf(x) { return enemy === 'west' ? x < border : x > border; }
  function isActive(a) { return a && !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null; }
  function man(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
  function open(x, y) {
    return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] === '.';
  }

  var mates = [you].concat(state.teammates || []);
  mates.sort(function (a, b) {
    var A = String(a.id), B = String(b.id);
    return A < B ? -1 : A > B ? 1 : 0;
  });
  var n = mates.length;
  var myIdx = 0;
  for (var i = 0; i < n; i++) {
    if (mates[i].id === you.id) { myIdx = i; break; }
  }

  var foes = state.enemies || [];
  var intruders = [];
  var foeDefs = [];
  var foeCarrier = null;
  var home = state.flags[team].home;
  for (var e = 0; e < foes.length; e++) {
    var f = foes[e];
    if (!isActive(f)) continue;
    if (f.carrying) {
      if (!foeCarrier || man(f.x, f.y, home.x, home.y) < man(foeCarrier.x, foeCarrier.y, home.x, home.y)) foeCarrier = f;
    }
    if (ownHalf(f.x)) intruders.push(f);
    else if (f.x !== border) foeDefs.push(f);
  }

  var mateCarrier = null;
  for (var m = 0; m < mates.length; m++) {
    if (mates[m].id !== you.id && isActive(mates[m]) && mates[m].carrying) { mateCarrier = mates[m]; break; }
  }

  // Solo: no teammate can cover, and a symmetric opening race is decided
  // by id order (east wins ties), so the solo seat always guards its flag,
  // tags the attacker, and only attacks with a lead while the foe is jailed.
  var defCount = n <= 1 ? 1 : n === 2 ? 1 : n === 3 ? 1 : 2;
  var designated = myIdx < defCount;

  function riskFn(weight) {
    return function (x, y) {
      if (ownHalf(x) || x === border) return 0;
      var c = 0;
      for (var k = 0; k < foeDefs.length; k++) {
        var d = Math.abs(x - foeDefs[k].x) + Math.abs(y - foeDefs[k].y);
        if (d <= 1) c += 6;
        else if (d === 2) c += 2;
        else if (d === 3) c += 0.5;
        if (c >= 8) break;
      }
      return c * weight;
    };
  }
  function noRisk() { return 0; }

  function pushHeap(hk, hg, hx, hy, ha, f, g, x, y, a) {
    var idx = hk.length;
    hk.push(f); hg.push(g); hx.push(x); hy.push(y); ha.push(a);
    while (idx > 0) {
      var p = (idx - 1) >> 1;
      if (hk[p] <= f) break;
      hk[idx] = hk[p]; hg[idx] = hg[p]; hx[idx] = hx[p]; hy[idx] = hy[p]; ha[idx] = ha[p];
      idx = p;
    }
    hk[idx] = f; hg[idx] = g; hx[idx] = x; hy[idx] = y; ha[idx] = a;
  }

  function popHeap(hk, hg, hx, hy, ha) {
    var tf = hk[0], tg = hg[0], tx = hx[0], ty = hy[0], ta = ha[0];
    var lf = hk.pop(), lg = hg.pop(), lx = hx.pop(), ly = hy.pop(), la = ha.pop();
    if (hk.length > 0) {
      var idx = 0;
      for (;;) {
        var l = idx * 2 + 1, r = l + 1, s = idx;
        var bv = lf;
        if (l < hk.length && hk[l] < bv) { s = l; bv = hk[l]; }
        if (r < hk.length && hk[r] < bv) { s = r; bv = hk[r]; }
        if (s === idx) break;
        hk[idx] = hk[s]; hg[idx] = hg[s]; hx[idx] = hx[s]; hy[idx] = hy[s]; ha[idx] = ha[s];
        idx = s;
      }
      hk[idx] = lf; hg[idx] = lg; hx[idx] = lx; hy[idx] = ly; ha[idx] = la;
    }
    return { f: tf, cost: tg, x: tx, y: ty, a: ta };
  }

  // A* first-step search. On small fields the hint is ignored (plain
  // Dijkstra); on huge fields the admissible manhattan hint directs the
  // search so the 150ms budget holds. First action is optimal either way.
  function route(sx, sy, goal, risk, restrict, rot, hx, hy, adj) {
    if (goal(sx, sy)) return 'stay';
    var useH = (W * H > 9000) && (hx !== undefined);
    function h(x, y) {
      if (!useH) return 0;
      var d = Math.abs(x - hx) + Math.abs(y - hy) - (adj || 0);
      return d > 0 ? d : 0;
    }
    var dist = new Float64Array(W * H);
    for (var i = 0; i < dist.length; i++) dist[i] = Infinity;
    var hk = [], hg = [], qx = [], qy = [], ha = [];
    dist[sy * W + sx] = 0;
    pushHeap(hk, hg, qx, qy, ha, h(sx, sy), 0, sx, sy, 'stay');
    var order = ((rot % 4) + 4) % 4;
    var guard = 0;
    var maxExpand = W * H;
    while (hk.length > 0) {
      var cur = popHeap(hk, hg, qx, qy, ha);
      var ci = cur.y * W + cur.x;
      if (cur.cost !== dist[ci]) continue;
      if (goal(cur.x, cur.y)) return cur.a;
      if (++guard > maxExpand) break;
      for (var d = 0; d < 4; d++) {
        var dd = DIRS[(d + order) % 4];
        var nx = cur.x + dd[1], ny = cur.y + dd[2];
        if (!open(nx, ny)) continue;
        if (restrict && !restrict(nx)) continue;
        var nc = cur.cost + 1 + risk(nx, ny);
        var ni = ny * W + nx;
        if (nc >= dist[ni]) continue;
        dist[ni] = nc;
        pushHeap(hk, hg, qx, qy, ha, nc + h(nx, ny), nc, nx, ny, cur.a === 'stay' ? dd[0] : cur.a);
      }
    }
    return 'stay';
  }

  function snap(tx, ty, allow) {
    if (tx >= 0 && ty >= 0 && tx < W && ty < H && open(tx, ty) && (!allow || allow(tx))) {
      return { x: tx, y: ty };
    }
    for (var r = 1; r <= 8; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (open(x, y) && (!allow || allow(x))) return { x: x, y: y };
        }
      }
    }
    return { x: you.x, y: you.y };
  }

  function bfs(sx, sy, allow, limit) {
    var dist = new Int32Array(W * H).fill(-1);
    var parent = new Int32Array(W * H).fill(-1);
    var qx = [sx], qy = [sy], head = 0;
    dist[sy * W + sx] = 0;
    var cap = limit || (W * H);
    while (head < qx.length && head < cap) {
      var x = qx[head], y = qy[head]; head++;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][1], ny = y + DIRS[d][2];
        if (!open(nx, ny)) continue;
        if (allow && !allow(nx)) continue;
        var ni = ny * W + nx;
        if (dist[ni] !== -1) continue;
        dist[ni] = dist[y * W + x] + 1;
        parent[ni] = y * W + x;
        qx.push(nx); qy.push(ny);
      }
    }
    return { dist: dist, parent: parent };
  }

  // Path-prediction interception: meet the foe at a cell in our half on
  // its shortest route that we reach no later than it does. Falls back to chase.
  // On huge fields the dual flood fill is skipped (direct chase instead).
  function interceptMove(target) {
    var tx0 = target.x, ty0 = target.y;
    function chase() {
      var tx = tx0, ty = ty0;
      return route(you.x, you.y, function (x, y) { return x === tx && y === ty; }, noRisk, homeOnly, myIdx, tx, ty, 0);
    }
    if (W * H > 9000) return chase();
    var isCarrier = !!target.carrying;
    var fx = home.x, fy = home.y;
    function isGoal(x, y) {
      if (isCarrier) return foeHalf(x);
      return x === fx && y === fy;
    }
    var me = bfs(you.x, you.y, homeOnly);
    var foe = bfs(target.x, target.y, null);
    var best = -1, bd = Infinity;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (!isGoal(x, y) || !open(x, y)) continue;
        var d = foe.dist[y * W + x];
        if (d >= 0 && d < bd) { bd = d; best = y * W + x; }
      }
    }
    var foeStart = target.y * W + target.x;
    if (best >= 0) {
      var path = [];
      var cur = best, guard = 0;
      while (cur !== -1 && guard <= foe.dist[best] + 1) {
        path.push(cur);
        if (cur === foeStart) break;
        cur = foe.parent[cur];
        guard++;
      }
      if (path.length > 0 && path[path.length - 1] === foeStart) {
        for (var i = path.length - 1; i >= 0; i--) {
          var cell = path[i];
          var foeSteps = (path.length - 1) - i;
          var cx = cell % W, cy = (cell / W) | 0;
          if (!ownHalf(cx)) continue;
          var md = me.dist[cell];
          if (md >= 0 && md <= foeSteps && !(md === 0 && foeSteps === 0)) {
            var ax = cx, ay = cy;
            return route(you.x, you.y, function (x, y) { return x === ax && y === ay; }, noRisk, homeOnly, myIdx, ax, ay, 0);
          }
        }
      }
    }
    var tx = target.x, ty = target.y;
    return route(you.x, you.y, function (x, y) { return x === tx && y === ty; }, noRisk, homeOnly, myIdx, tx, ty, 0);
  }

  function cmpIntruder(a, b) {
    if (!!a.carrying !== !!b.carrying) return a.carrying ? -1 : 1;
    var da = man(a.x, a.y, home.x, home.y), db = man(b.x, b.y, home.x, home.y);
    if (da !== db) return da - db;
    var A = String(a.id), B = String(b.id);
    return A < B ? -1 : 1;
  }

  function defendMove() {
    // Phase 0: outside home -> travel back risk-aware first.
    if (!homeOnly(you.x)) {
      var hbx = border, hby = you.y;
      return route(you.x, you.y, function (x) { return homeOnly(x); }, riskFn(1), null, myIdx, hbx, hby, 0);
    }
    var defs = [];
    for (var i = 0; i < defCount; i++) {
      if (isActive(mates[i]) && !mates[i].carrying) defs.push(mates[i]);
    }
    var myOrder = -1;
    for (var k = 0; k < defs.length; k++) {
      if (defs[k].id === you.id) { myOrder = k; break; }
    }
    var sorted = intruders.slice().sort(cmpIntruder);
    var pick = myOrder < 0 ? 0 : myOrder;
    var mine = sorted.length ? sorted[Math.min(pick, sorted.length - 1)] : null;
    if (mine) return interceptMove(mine);
    if (foeCarrier) {
      var ix = team === 'west' ? border - 1 : border + 1;
      var cy = foeCarrier.y < 0 ? 0 : foeCarrier.y >= H ? H - 1 : foeCarrier.y;
      var post = snap(ix, cy, homeOnly);
      var px = post.x, py = post.y;
      return route(you.x, you.y, function (x, y) { return x === px && y === py; }, noRisk, homeOnly, myIdx, px, py, 0);
    }
    var flagPost = snap(home.x, home.y, homeOnly);
    var step = team === 'west' ? 3 : -3;
    var midPost = snap(border - step, midY, homeOnly);
    var gx, gy;
    if (myOrder === 0) { gx = flagPost.x; gy = flagPost.y; }
    else { gx = midPost.x; gy = midPost.y; }
    return route(you.x, you.y, function (x, y) { return x === gx && y === gy; }, noRisk, homeOnly, myIdx, gx, gy, 0);
  }

  function wantsRescue() {
    var pris = false;
    for (var i = 0; i < mates.length; i++) {
      if (mates[i].jailed && mates[i].jailTicks < 32) { pris = true; break; }
    }
    if (!pris || mateCarrier) return false;
    if (state.maxTicks - state.tick < 40) return false;
    var ef = state.flags[enemy];
    if (man(you.x, you.y, ef.x, ef.y) <= 3) return false;
    var jail = state.zones[enemy].jail;
    function jd(a) {
      var best = 1e9;
      for (var j = 0; j < jail.length; j++) {
        var d = man(a.x, a.y, jail[j].x, jail[j].y);
        if (d < best) best = d;
      }
      return best;
    }
    var bestId = null, bestD = Infinity, tie = null;
    for (var c = defCount; c < n; c++) {
      var a = mates[c];
      if (!isActive(a) || a.carrying) continue;
      var d = jd(a);
      var key = String(a.id);
      if (d < bestD || (d === bestD && (tie === null || key < tie))) {
        bestD = d; bestId = a.id; tie = key;
      }
    }
    return bestId !== null && bestId === you.id;
  }

  // Enemy carrier already home (or on border): chasing there is suicide.
  // Come home and prepare instead.
  var foeGone = foeCarrier && !ownHalf(foeCarrier.x) && foeCarrier.x !== border;

  var mode;
  if (you.carrying) {
    mode = 'return';
  } else if (n === 1) {
    var lead1 = (state.score[team] || 0) - (state.score[enemy] || 0);
    var foeOut = false;
    for (var s = 0; s < foes.length; s++) {
      if (isActive(foes[s])) { foeOut = true; break; }
    }
    if (lead1 > 0) {
      mode = foeOut ? 'defend' : 'attack';
    } else if (lead1 < 0) {
      mode = (intruders.length > 0 || (foeCarrier && ownHalf(foeCarrier.x))) ? 'defend' : 'attack';
    } else {
      mode = 'defend';
    }
  } else if (mateCarrier) {
    mode = homeOnly(you.x) ? 'defend' : 'pressure';
  } else if (designated) {
    mode = 'defend';
  } else if (foeGone) {
    mode = 'defend';
  } else {
    var homeThreat = intruders.length > 0 || (foeCarrier && ownHalf(foeCarrier.x));
    var cover = false;
    if (homeThreat) {
      cover = true;
      for (var c = 0; c < defCount; c++) {
        if (isActive(mates[c]) && !mates[c].carrying) { cover = false; break; }
      }
    }
    if (cover) {
      var tgt = (foeCarrier && ownHalf(foeCarrier.x)) ? foeCarrier : intruders.slice().sort(cmpIntruder)[0];
      var myD = man(you.x, you.y, tgt.x, tgt.y);
      var mine2 = true;
      for (var q = 0; q < n; q++) {
        if (q === myIdx) continue;
        var o = mates[q];
        if (q < defCount || !isActive(o) || o.carrying) continue;
        var od = man(o.x, o.y, tgt.x, tgt.y);
        if (od < myD || (od === myD && String(o.id) < String(you.id))) { mine2 = false; break; }
      }
      mode = mine2 ? 'defend' : (wantsRescue() ? 'rescue' : 'attack');
    } else {
      mode = wantsRescue() ? 'rescue' : 'attack';
    }
  }

  var ticksLeft = state.maxTicks - state.tick;
  var lead = (state.score[team] || 0) - (state.score[enemy] || 0);
  var foeMatch = (state.score[enemy] || 0) >= state.capturesToWin - 1;
  if (!you.carrying && n > 1 && ticksLeft < 200) {
    if (lead > 0 && (mode === 'attack' || mode === 'pressure' || mode === 'rescue')) {
      mode = 'defend';
    } else if (lead < 0 && !foeMatch && mode === 'defend' && !(foeCarrier && ownHalf(foeCarrier.x))) {
      mode = 'attack';
    }
  }
  // Scoreless stalemate: nobody can break through. If we hold the tag
  // tiebreak (or share it), lock the game down: worst case a draw, best
  // case a time-limit win as the foe keeps feeding our guards. Only attack
  // from here when losing the tiebreak and needing variance.
  if (!you.carrying && n > 1 && lead === 0 &&
      (state.score[team] || 0) === 0 && ticksLeft < 300 &&
      (mode === 'attack' || mode === 'pressure' || mode === 'rescue')) {
    var myTags = 0, foeTags = 0;
    for (var t = 0; t < mates.length; t++) myTags += (mates[t].tags || 0);
    for (var g = 0; g < foes.length; g++) foeTags += (foes[g].tags || 0);
    if (myTags >= foeTags) mode = 'defend';
  }

  if (mode === 'return') {
    var rx = team === 'west' ? border - 1 : border + 1, ry = you.y;
    return route(you.x, you.y, function (x) { return ownHalf(x); }, riskFn(1.6), null, myIdx, rx, ry, 0);
  }
  if (mode === 'defend') return defendMove();
  if (mode === 'rescue') {
    var jail = state.zones[enemy].jail;
    var jx = jail[0].x, jy = jail[0].y, jm = man(you.x, you.y, jx, jy);
    for (var j = 1; j < jail.length; j++) {
      var jd0 = man(you.x, you.y, jail[j].x, jail[j].y);
      if (jd0 < jm) { jm = jd0; jx = jail[j].x; jy = jail[j].y; }
    }
    return route(you.x, you.y, function (x, y) {
      for (var k = 0; k < jail.length; k++) {
        if (man(x, y, jail[k].x, jail[k].y) <= 1) return true;
      }
      return false;
    }, riskFn(1.1), null, myIdx, jx, jy, 1);
  }
  if (mode === 'pressure') {
    var hs = state.flags[enemy].home;
    return route(you.x, you.y, function (x, y) { return x === hs.x && y === hs.y; }, riskFn(1), null, myIdx, hs.x, hs.y, 0);
  }
  var ef = state.flags[enemy];
  var fx = ef.x, fy = ef.y;
  // Futility hold: scoreless level game, past the opening, foe flag home
  // and camped. Running in just feeds tags; stage safely at our border and
  // pounce only if the camp breaks. Re-evaluated every tick, so reversible.
  // (Behind/ahead: normal play, variance is needed or affordable.)
  if (mode === 'attack' && (state.score[team] || 0) === 0 && (state.score[enemy] || 0) === 0 &&
      state.tick > 60 && ef.carrier === null) {
    var camped = false;
    for (var cf = 0; cf < foes.length; cf++) {
      var fa = foes[cf];
      if (isActive(fa) && !fa.carrying && man(fa.x, fa.y, ef.home.x, ef.home.y) <= 2) { camped = true; break; }
    }
    if (camped) {
      var hx0 = team === 'west' ? border - 1 : border + 1;
      var hold = snap(hx0, midY, homeOnly);
      var ox = hold.x, oy = hold.y;
      if (!homeOnly(you.x)) {
        return route(you.x, you.y, function (x) { return homeOnly(x); }, riskFn(1), null, myIdx, ox, oy, 0);
      }
      return route(you.x, you.y, function (x, y) { return x === ox && y === oy; }, noRisk, homeOnly, myIdx, ox, oy, 0);
    }
  }
  return route(you.x, you.y, function (x, y) { return x === fx && y === fy; }, riskFn(1), null, myIdx, fx, fy, 0);
}
