'use strict';
// Aras-Ctf v5: clamped stand-anchor; striker/decoy/wave attack split with
// kiting decoy; sprint + lurk pounce; class-aware dodge; 1v1 anchor-then-race.
module.exports = { name: 'Aras', move: move };

var MEM = { key: null, stuck: 0, lx: null, ly: null };

function idLess(a, b) { var sa = String(a), sb = String(b); return sa < sb ? -1 : sa > sb ? 1 : 0; }
function idHash(id) { var s = String(id), h = 0; for (var i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0; return h >>> 0; }
function man(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

function heapPush(h, node) {
  h.push(node);
  var i = h.length - 1;
  while (i > 0) {
    var p = (i - 1) >> 1;
    if (h[p].c <= h[i].c) break;
    var t = h[p]; h[p] = h[i]; h[i] = t; i = p;
  }
}
function heapPop(h) {
  var top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    var i = 0;
    for (;;) {
      var l = i * 2 + 1, r = l + 1, m = i;
      if (l < h.length && h[l].c < h[m].c) m = l;
      if (r < h.length && h[r].c < h[m].c) m = r;
      if (m === i) break;
      var t = h[m]; h[m] = h[i]; h[i] = t; i = m;
    }
  }
  return top;
}

function route(sx, sy, W, H, grid, goal, pass, danger) {
  var N = W * H;
  var dist = new Float64Array(N);
  for (var i = 0; i < N; i++) dist[i] = Infinity;
  var act = new Int8Array(N);
  var DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0];
  var start = sy * W + sx;
  dist[start] = 0;
  if (goal(sx, sy)) return 'stay';
  var heap = [{ k: start, x: sx, y: sy, c: 0 }];
  while (heap.length) {
    var cur = heapPop(heap);
    var ck = cur.k;
    if (cur.c !== dist[ck]) continue;
    var cx = cur.x, cy = cur.y;
    var first = act[ck];
    for (var d = 0; d < 4; d++) {
      var nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grid[ny][nx] === '#') continue;
      if (!pass(nx, ny)) continue;
      var nk = ny * W + nx;
      var nc = cur.c + 1 + danger(nx, ny);
      if (nc >= dist[nk]) continue;
      dist[nk] = nc;
      act[nk] = (ck === start) ? (d + 1) : first;
      if (goal(nx, ny)) {
        var code = act[nk];
        return code === 1 ? 'up' : code === 2 ? 'down' : code === 3 ? 'left' : 'right';
      }
      heapPush(heap, { k: nk, x: nx, y: ny, c: nc });
    }
  }
  return 'stay';
}

function anchorIdOf(list) {
  for (var j = 0; j < list.length; j++) {
    var q = list[j];
    if (!q.jailed && q.respawnIn === 0 && !q.carrying && q.x !== null) return String(q.id);
  }
  return null;
}

function move(state) {
  try {
    var you = state.you;
    if (!you || you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';
    var W = state.width, H = state.height, grid = state.grid, border = state.border;
    var team = state.team, enemy = team === 'west' ? 'east' : 'west';
    var inOwn = function (x) { return team === 'west' ? x < border : x > border; };
    var foeOwn = function (x) { return team === 'west' ? x > border : x < border; };

    var gk = W + 'x' + H + ':' + border + ':' + grid[0] + ':' + grid[H - 1];
    if (MEM.key !== gk) { MEM.key = gk; MEM.stuck = 0; MEM.lx = null; MEM.ly = null; }

    var all = [you].concat(state.teammates);
    all.sort(function (a, b) { return idLess(a.id, b.id); });
    var n = all.length, myIdx = 0, i, a;
    for (i = 0; i < n; i++) if (String(all[i].id) === String(you.id)) myIdx = i;
    var active = [], foes = [];
    for (i = 0; i < all.length; i++) { a = all[i]; if (!a.jailed && a.respawnIn === 0 && a.x !== null) active.push(a); }
    for (i = 0; i < state.enemies.length; i++) { a = state.enemies[i]; if (!a.jailed && a.respawnIn === 0 && a.x !== null) foes.push(a); }
    var defenders = [], ecar = [], intruders = [];
    for (i = 0; i < foes.length; i++) {
      if (foes[i].carrying) ecar.push(foes[i]);
      else if (foeOwn(foes[i].x)) defenders.push(foes[i]);
      if (inOwn(foes[i].x)) intruders.push(foes[i]);
    }
    var myCarrier = null, foeCarrier = null;
    for (i = 0; i < active.length; i++) if (active[i].carrying) myCarrier = active[i];
    for (i = 0; i < foes.length; i++) if (foes[i].carrying) foeCarrier = foes[i];
    var jailedMates = [], raceWindow = false;
    for (i = 0; i < all.length; i++) if (all[i].jailed) jailedMates.push(all[i]);

    var homeStand = state.flags[team].home;
    var foeStand = state.flags[enemy].home;
    var foeJail = state.zones[enemy].jail;
    var jailCx = 0, jailCy = 0;
    for (i = 0; i < foeJail.length; i++) { jailCx += foeJail[i].x; jailCy += foeJail[i].y; }
    jailCx /= foeJail.length; jailCy /= foeJail.length;

    for (i = 0; i < state.enemies.length; i++) {
      var fe = state.enemies[i];
      if (fe.jailed && fe.jailTicks <= 38 &&
          man(you.x, you.y, foeStand.x, foeStand.y) + 2 < 40 - fe.jailTicks) raceWindow = true;
    }

    var scoreUs = team === 'west' ? state.score.west : state.score.east;
    var scoreThem = team === 'west' ? state.score.east : state.score.west;
    var ticksLeft = state.maxTicks - state.tick;
    var carryMode = !!you.carrying;

    function danger(x, y) {
      if (inOwn(x) || x === border) return 0;
      var cost = 0, best = 999;
      for (var j = 0; j < defenders.length; j++) {
        var d = man(x, y, defenders[j].x, defenders[j].y) - (carryMode ? 2 : 1);
        if (d < best) best = d;
      }
      if (best <= 0) cost += 150;
      else if (best === 1) cost += 50;
      else if (best === 2) cost += 12;
      else if (best === 3) cost += 4;
      for (var k = 0; k < ecar.length; k++) {
        if (man(x, y, ecar[k].x, ecar[k].y) <= 2) cost += 40;
      }
      return cost;
    }
    var passAll = function () { return true; };
    var passHome = function (x) { return inOwn(x) || x === border; };
    var passAnchor = function (x, y) { return (inOwn(x) || x === border) && man(x, y, homeStand.x, homeStand.y) <= 2; };

    function gapTo(list, x, y) {
      var g = 999;
      for (var j = 0; j < list.length; j++) {
        var d = man(x, y, list[j].x, list[j].y);
        if (d < g) g = d;
      }
      return g;
    }
    function chooseMove(best, bonus) {
      var DX = [0, 0, -1, 1, 0], DY = [-1, 1, 0, 0, 0];
      var AN = ['up', 'down', 'left', 'right', 'stay'];
      var bestScore = -Infinity, bestAn = 'stay';
      for (var k = 0; k < 5; k++) {
        var nx = you.x + DX[k], ny = you.y + DY[k];
        if (k !== 4 && (nx < 0 || ny < 0 || nx >= W || ny >= H || grid[ny][nx] === '#')) continue;
        var cx = (k === 4) ? you.x : nx, cy = (k === 4) ? you.y : ny;
        var sc = (AN[k] === best ? 10 : 0) + (bonus ? bonus(cx, cy) : 0);
        if (foeOwn(cx) && cx !== border) {
          var gD = gapTo(defenders, cx, cy), gC = gapTo(ecar, cx, cy);
          if (gD <= 1) sc -= 10000;
          else if (gD === 2) sc -= 200;
          if (gC <= 1) sc -= 5000;
          else if (gC === 2) sc -= 20;
        }
        if (sc > bestScore) { bestScore = sc; bestAn = AN[k]; }
      }
      return bestAn;
    }
    // Kite step: keep gap ~2.5 from nearest defender while drifting from flag.
    function kiteStep(fx, fy) {
      var DX = [0, 0, -1, 1, 0], DY = [-1, 1, 0, 0, 0];
      var AN = ['up', 'down', 'left', 'right', 'stay'];
      var bestScore = -Infinity, bestAn = 'stay';
      for (var k = 0; k < 5; k++) {
        var nx = you.x + DX[k], ny = you.y + DY[k];
        if (k !== 4 && (nx < 0 || ny < 0 || nx >= W || ny >= H || grid[ny][nx] === '#')) continue;
        var cx = (k === 4) ? you.x : nx, cy = (k === 4) ? you.y : ny;
        var g = gapTo(defenders, cx, cy);
        if (foeOwn(cx) && cx !== border && g <= 1) continue; // never suicide
        var sc = man(cx, cy, fx, fy) * 2 - (g - 2.5) * (g - 2.5) * 8;
        if (sc > bestScore) { bestScore = sc; bestAn = AN[k]; }
      }
      return bestAn;
    }

    var me = String(you.id);
    var anchorId = n > 1 ? anchorIdOf(all) : me;

    var chasers = [];
    if (foeCarrier && (inOwn(foeCarrier.x) || foeCarrier.x === border)) {
      var cand = [];
      for (i = 0; i < active.length; i++) {
        a = active[i];
        if (!a.carrying && !foeOwn(a.x)) cand.push(a);
      }
      cand.sort(function (p, q) {
        return (man(p.x, p.y, foeCarrier.x, foeCarrier.y) - man(q.x, q.y, foeCarrier.x, foeCarrier.y)) || idLess(p.id, q.id);
      });
      for (i = 0; i < Math.min(2, cand.length); i++) chasers.push(String(cand[i].id));
    }
    var rescuer = null;
    if (jailedMates.length && !(myCarrier && String(myCarrier.id) === me)) {
      var maxJail = 0;
      for (i = 0; i < jailedMates.length; i++) if (jailedMates[i].jailTicks > maxJail) maxJail = jailedMates[i].jailTicks;
      var remain = 40 - maxJail;
      var rc = [];
      for (i = 0; i < active.length; i++) {
        a = active[i];
        if (a.carrying || chasers.indexOf(String(a.id)) >= 0) continue;
        if (intruders.length && n <= 3 && String(a.id) === anchorId) continue;
        rc.push(a);
      }
      rc.sort(function (p, q) {
        return (man(p.x, p.y, jailCx, jailCy) - man(q.x, q.y, jailCx, jailCy)) || idLess(p.id, q.id);
      });
      if (rc.length) {
        var rd = man(rc[0].x, rc[0].y, jailCx, jailCy);
        if (jailedMates.length >= 2 || rd + 8 < remain || (remain > 30 && !intruders.length)) rescuer = String(rc[0].id);
      }
    }

    var role;
    var endTurtle = scoreUs > scoreThem && ticksLeft < 100;
    var endRush = scoreUs < scoreThem && ticksLeft < 150;
    if (you.carrying) role = 'return';
    else if (chasers.indexOf(me) >= 0) role = 'chaseCarrier';
    else if (rescuer === me && !(endRush && ticksLeft < 30)) role = 'rescue';
    else if (n === 1 && raceWindow && !foeCarrier) role = 'attack';
    else if (endTurtle) role = intruders.length ? 'chaseNear' : 'stand';
    else if (endRush) role = 'attack';
    else if (anchorId === me) role = 'anchor';
    else if (myCarrier) role = 'screen';
    else role = 'attack';

    // Attack index among attack-role teammates (shared knowledge).
    var atkOrder = [];
    if (role === 'attack') {
      for (i = 0; i < n; i++) {
        a = all[i];
        if (a.jailed || a.respawnIn > 0 || a.x === null) continue;
        if (String(a.id) === anchorId && !(endRush || (n === 1))) continue;
        // reproduce base-role test cheaply: skip known non-attackers
        if (chasers.indexOf(String(a.id)) >= 0) continue;
        if (rescuer !== null && String(a.id) === rescuer) continue;
        if (a.carrying) continue;
        if (myCarrier && !(endRush)) continue; // screeners
        atkOrder.push(String(a.id));
      }
      atkOrder.sort(idLess);
    }
    var atkIdx = atkOrder.indexOf(me);

    var ans = 'stay', t, goalFn;
    var holding = false;

    if (role === 'return') {
      goalFn = function (x) { return inOwn(x); };
      ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger),
        function (x) { return inOwn(x) ? 10000 : 0; });
    } else if (!inOwn(you.x) && you.x !== border &&
               (role === 'anchor' || role === 'stand' || role === 'chaseCarrier' || role === 'chaseNear')) {
      goalFn = function (x) { return inOwn(x); };
      ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger),
        function (x) { return inOwn(x) ? 10000 : 0; });
    } else if (role === 'chaseCarrier') {
      t = foeCarrier;
      if (inOwn(you.x) && man(you.x, you.y, t.x, t.y) <= 1) { ans = 'stay'; holding = true; }
      else {
        goalFn = (function (tx, ty) {
          return function (x, y) { return inOwn(x) && man(x, y, tx, ty) <= 1; };
        })(t.x, t.y);
        ans = route(you.x, you.y, W, H, grid, goalFn, passHome, function () { return 0; });
      }
    } else if (role === 'anchor' || role === 'stand') {
      var near = null, nv = Infinity;
      for (i = 0; i < intruders.length; i++) {
        var ds = man(intruders[i].x, intruders[i].y, homeStand.x, homeStand.y);
        if (ds > 4) continue;
        var vv = ds * 100 + man(intruders[i].x, intruders[i].y, you.x, you.y);
        if (vv < nv) { nv = vv; near = intruders[i]; }
      }
      if (near) {
        if (man(you.x, you.y, near.x, near.y) <= 1) { ans = 'stay'; holding = true; }
        else {
          goalFn = (function (tx, ty) {
            return function (x, y) { return man(x, y, tx, ty) <= 1 && man(x, y, homeStand.x, homeStand.y) <= 2; };
          })(near.x, near.y);
          var stepA = route(you.x, you.y, W, H, grid, goalFn, passAnchor, function () { return 0; });
          ans = stepA;
        }
      } else if (you.x === homeStand.x && you.y === homeStand.y) {
        var opts = [[homeStand.x, homeStand.y]];
        var nbA = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (i = 0; i < 4; i++) {
          var ox = homeStand.x + nbA[i][0], oy = homeStand.y + nbA[i][1];
          if (ox >= 0 && oy >= 0 && ox < W && oy < H && grid[oy][ox] !== '#') opts.push([ox, oy]);
        }
        var pick = opts[(Math.floor(state.tick / 9) + idHash(you.id)) % opts.length];
        ans = (pick[0] === you.x && pick[1] === you.y) ? 'stay' :
          (pick[0] > you.x ? 'right' : pick[0] < you.x ? 'left' : pick[1] > you.y ? 'down' : 'up');
        holding = true;
      } else {
        // Far from stand: travel home first (clamp applies once close).
        goalFn = (function (tx, ty) {
          return function (x, y) { return x === tx && y === ty; };
        })(homeStand.x, homeStand.y);
        ans = route(you.x, you.y, W, H, grid, goalFn,
          man(you.x, you.y, homeStand.x, homeStand.y) > 2 ? passHome : passAnchor,
          function () { return 0; });
      }
    } else if (role === 'chaseNear') {
      intruders.sort(function (p, q) {
        var kp = p.carrying ? -10000 : 0, kq = q.carrying ? -10000 : 0;
        return (kp + man(you.x, you.y, p.x, p.y)) - (kq + man(you.x, you.y, q.x, q.y)) || idLess(p.id, q.id);
      });
      t = intruders[0];
      if (man(you.x, you.y, t.x, t.y) <= 1 && inOwn(you.x)) { ans = 'stay'; holding = true; }
      else {
        goalFn = (function (tx, ty) {
          return function (x, y) { return inOwn(x) && man(x, y, tx, ty) <= 1; };
        })(t.x, t.y);
        ans = route(you.x, you.y, W, H, grid, goalFn, passHome, function () { return 0; });
      }
    } else if (role === 'screen') {
      var bx = team === 'west' ? border - 1 : border + 1;
      var atkRankS = 0;
      for (i = 0; i < n; i++) {
        if (String(all[i].id) === anchorId) continue;
        if (all[i].jailed || all[i].respawnIn > 0 || all[i].carrying) continue;
        if (i < myIdx) atkRankS++;
      }
      var spreadS = Math.max(2, Math.floor(H / 5));
      var syT = Math.floor(H / 2) + (atkRankS - 1) * spreadS + ((idHash(you.id) % 3) - 1);
      syT = Math.min(H - 2, Math.max(1, syT + laneJitter()));
      var foundS = null;
      outerS: for (var radS = 0; radS < H; radS++) {
        var rowsS = radS === 0 ? [syT] : [syT + radS, syT - radS];
        for (var c2 = 0; c2 < rowsS.length; c2++) {
          var yy2 = rowsS[c2];
          if (yy2 < 1 || yy2 > H - 2) continue;
          if (grid[yy2][bx] !== '#') { foundS = [bx, yy2]; break outerS; }
        }
      }
      if (!foundS) foundS = [bx, Math.floor(H / 2)];
      if (you.x === foundS[0] && you.y === foundS[1]) { ans = 'stay'; holding = true; }
      else {
        goalFn = (function (tx, ty) {
          return function (x, y) { return x === tx && y === ty; };
        })(foundS[0], foundS[1]);
        ans = route(you.x, you.y, W, H, grid, goalFn, passAll, function () { return 0; });
      }
    } else if (role === 'rescue') {
      var jailSet = {};
      var nb2 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var q2 = 0; q2 < foeJail.length; q2++) {
        var jp = foeJail[q2];
        jailSet[jp.y * W + jp.x] = 1;
        for (var n2 = 0; n2 < 4; n2++) {
          var qx = jp.x + nb2[n2][0], qy = jp.y + nb2[n2][1];
          if (qx >= 0 && qy >= 0 && qx < W && qy < H && grid[qy][qx] !== '#') jailSet[qy * W + qx] = 1;
        }
      }
      goalFn = function (x, y) { return jailSet[y * W + x] === 1; };
      ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
    } else { // attack: striker (idx 0), decoy (idx 1), wave (rest)
      var fx = foeStand.x, fy = foeStand.y;
      var isDecoy = (atkIdx === 1 && defenders.length > 0 && foeOwn(you.x));
      if (isDecoy) {
        // Kite the nearest camper off the flag; pounce if it leaves.
        var dMinD = 999;
        for (var td = 0; td < defenders.length; td++) {
          var ddf = man(defenders[td].x, defenders[td].y, fx, fy);
          if (ddf < dMinD) dMinD = ddf;
        }
        if (dMinD >= 3) {
          goalFn = function (x, y) { return x === fx && y === fy; };
          ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
        } else {
          ans = kiteStep(fx, fy);
          holding = false;
        }
      } else if (!foeOwn(you.x)) {
        if (n >= 3) {
          var atkRank = 0, atkCount = 0;
          for (i = 0; i < n; i++) {
            if (String(all[i].id) === anchorId) continue;
            if (all[i].jailed || all[i].respawnIn > 0 || all[i].carrying) continue;
            if (i < myIdx) atkRank++;
            atkCount++;
          }
          var spread = Math.max(2, Math.floor(H / 6));
          var cyT = Math.floor(H / 2) + (atkRank - (Math.max(1, atkCount) - 1) / 2) * spread + ((idHash(you.id) % 3) - 1);
          cyT = Math.min(H - 2, Math.max(1, Math.round(cyT) + laneJitter()));
          var found = null;
          outer2: for (var rad = 0; rad < H; rad++) {
            var rows = rad === 0 ? [cyT] : [cyT + rad, cyT - rad];
            for (var ri = 0; ri < rows.length; ri++) {
              var yy = rows[ri];
              if (yy < 0 || yy >= H) continue;
              if (grid[yy][border] !== '#') { found = [border, yy]; break outer2; }
            }
          }
          if (!found) found = [border, Math.floor(H / 2)];
          var onCross = (you.x === found[0] && you.y === found[1]);
          goalFn = (function (tx, ty) {
            return function (x, y) { return x === tx && y === ty; };
          })(onCross ? fx : found[0], onCross ? fy : found[1]);
          ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
        } else {
          goalFn = function (x, y) { return x === fx && y === fy; };
          ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
        }
      } else {
        var dMin = 999;
        for (var ti = 0; ti < defenders.length; ti++) {
          var ddt0 = man(defenders[ti].x, defenders[ti].y, fx, fy);
          if (ddt0 < dMin) dMin = ddt0;
        }
        var meDist = man(you.x, you.y, fx, fy);
        if (dMin >= 3 || meDist + 1 < dMin || meDist > 8 || defenders.length === 0) {
          goalFn = function (x, y) { return x === fx && y === fy; };
          ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
        } else {
          var bestLurk = null, bestScore = Infinity;
          for (var ly = Math.max(0, fy - 4); ly <= Math.min(H - 1, fy + 4); ly++) {
            for (var lx = Math.max(0, fx - 4); lx <= Math.min(W - 1, fx + 4); lx++) {
              if (grid[ly][lx] === '#') continue;
              if (!foeOwn(lx) && lx !== border) continue;
              var df = man(lx, ly, fx, fy);
              if (df === 0 || df > 4) continue;
              var dt2 = gapTo(defenders, lx, ly);
              if (dt2 < 2) continue;
              var sc = df * 10 + man(you.x, you.y, lx, ly) * 0.5 + (dt2 === 2 ? 25 : 0);
              if (sc < bestScore) { bestScore = sc; bestLurk = [lx, ly]; }
            }
          }
          if (!bestLurk) {
            goalFn = function (x, y) { return x === fx && y === fy; };
            ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
          } else if (you.x === bestLurk[0] && you.y === bestLurk[1]) {
            if (gapTo(defenders, you.x, you.y) <= 1) ans = kiteStep(fx, fy);
            else { ans = 'stay'; holding = true; }
          } else {
            goalFn = (function (tx, ty) {
              return function (x, y) { return x === tx && y === ty; };
            })(bestLurk[0], bestLurk[1]);
            ans = chooseMove(route(you.x, you.y, W, H, grid, goalFn, passAll, danger), null);
          }
        }
      }
    }

    function laneJitter() {
      return MEM.stuck > 8 ? ((MEM.stuck + idHash(you.id)) % 7) - 3 : 0;
    }

    var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], stay: [0, 0] };
    var dd = D[ans] || D.stay;
    var ex = you.x + dd[0], ey = you.y + dd[1];
    if (ex < 0 || ey < 0 || ex >= W || ey >= H || grid[ey][ex] === '#') return 'stay';
    if (!holding) {
      if (ex === MEM.lx && ey === MEM.ly) MEM.stuck++;
      else { MEM.stuck = 0; MEM.lx = ex; MEM.ly = ey; }
    } else { MEM.stuck = 0; MEM.lx = ex; MEM.ly = ey; }
    return ans || 'stay';
  } catch (e) { return 'stay'; }
}

// Import-time JIT warmup: compile the hot path on a dummy field so the
// first live decision never pays compile cost. Deterministic, no randomness.
(function () {
  var g = [];
  for (var y = 0; y < 21; y++) {
    var row = '';
    for (var x = 0; x < 33; x++) row += (x === 10 && y > 2 && y < 18) ? '#' : '.';
    g.push(row);
  }
  var no = function () { return 0; };
  for (var k = 0; k < 3; k++) {
    route(1, 10, 33, 21, g, function (x) { return x > 16; }, function () { return true; }, no);
    route(30, 10, 33, 21, g, function (x, y) { return x === 29 && y === 10; }, function () { return true; }, no);
  }
})();
