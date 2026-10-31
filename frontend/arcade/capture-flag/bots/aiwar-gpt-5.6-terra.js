'use strict';
// ApexFlag: role-based CTF bot.
// Roles by sorted id: seat 0 defends (when team > 1), others raid.
// Raiders: carrier returns, designated raider rescues, others hit flag / escort.
// Defender: hunts carriers then intruders, else patrols home. All paths risk-aware A*.
module.exports = { name: 'ApexFlag', move: move };

// One-tick foe position memory (per seat, persists within one game).
var _memTick = -1;
var _memPrev = {}; // foe id -> {x, y}

function move(state) {
  try {
    if (state.tick <= _memTick) _memPrev = {};
    _memTick = state.tick;
    var you = state.you;
    if (!you || you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';
    var W = state.width, H = state.height, border = state.border;
    var team = state.team;
    var enemy = team === 'west' ? 'east' : 'west';
    var west = team === 'west';
    var ownHalf = function (x) { return west ? x < border : x > border; };
    var foeHalf = function (x) { return west ? x > border : x < border; };

    var order = [you].concat(state.teammates).sort(function (a, b) {
      var sa = String(a.id), sb = String(b.id);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
    var idx = 0;
    for (var i = 0; i < order.length; i++) if (order[i].id === you.id) { idx = i; break; }
    var n = order.length;

    function active(a) { return !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null; }
    var foes = [];
    for (var e = 0; e < state.enemies.length; e++) if (active(state.enemies[e])) foes.push(state.enemies[e]);

    var myFlag = state.flags[team];
    var foeFlag = state.flags[enemy];
    var dist = function (a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); };

    // Threat model. A foe can only tag inside its own half.
    // - holder: stays near its flag home (not rapidly leaving it).
    //   Only holders shape our route from afar; a foe sprinting out
    //   will be long gone by the time we arrive.
    // - others: only matter if adjacent (collision bubble) or while we
    //   are exposed and they are near us or closing on us.
    var foeOwnHalf = function (f) { return enemy === 'west' ? f.x < border : f.x > border; };
    var foeHome = state.flags[enemy].home;
    var vuln = !ownHalf(you.x);
    var threats = [];
    for (var t = 0; t < foes.length; t++) {
      var f = foes[t];
      if (f.carrying) continue;
      if (!foeOwnHalf(f)) continue;
      var dh = Math.abs(f.x - foeHome.x) + Math.abs(f.y - foeHome.y);
      var dm = dist(f, you);
      var prev = _memPrev[String(f.id)];
      var pdh = (prev === undefined) ? dh : prev.dh;
      var holder = dh <= 6 && (dh - pdh) < 2;
      if (holder) { threats.push(f); continue; }
      if (dm <= 1) { threats.push(f); continue; }
      if (vuln && dm <= 4) { threats.push(f); continue; }
      if (vuln) {
        var dmPrev = (prev === undefined) ? Infinity : Math.abs(prev.x - you.x) + Math.abs(prev.y - you.y);
        if (dm < dmPrev) threats.push(f);
      }
    }
    for (var u = 0; u < foes.length; u++) {
      if (foes[u].x !== null) {
        _memPrev[String(foes[u].id)] = {
          x: foes[u].x, y: foes[u].y,
          dh: Math.abs(foes[u].x - foeHome.x) + Math.abs(foes[u].y - foeHome.y)
        };
      }
    }
    // intruders: foes in my half
    var intruders = [];
    for (var q = 0; q < foes.length; q++) if (ownHalf(foes[q].x)) intruders.push(foes[q]);

    var DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
    var grid = state.grid;

    function open(x, y) {
      return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] === '.';
    }

    // risk of standing on p while vulnerable (p in foe half or border-adjacent enemy side)
    function riskAt(x, y) {
      if (ownHalf(x) || x === border) return 0;
      var cost = 0;
      for (var k = 0; k < threats.length; k++) {
        var d = Math.abs(x - threats[k].x) + Math.abs(y - threats[k].y);
        if (d <= 1) cost += 60;
        else if (d === 2) cost += 14;
        else if (d === 3) cost += 4;
      }
      return cost;
    }

    // A*: returns first action. goal(p) bool, passable(p) bool, riskFn(p) number.
    function astar(sx, sy, goal, passable, riskFn) {
      var size = W * H;
      var costs = new Float64Array(size);
      for (var c = 0; c < size; c++) costs[c] = Infinity;
      var hk = function (x, y) { return y * W + x; };
      // binary heap of {x,y,cost,act}
      var hx = [], hy = [], hc = [], ha = [], hn = 0;
      function push(x, y, cost, act) {
        var j = hn++;
        hx[j] = x; hy[j] = y; hc[j] = cost; ha[j] = act;
        while (j > 0) {
          var par = (j - 1) >> 1;
          if (hc[par] <= hc[j]) break;
          var tx = hx[par]; hx[par] = hx[j]; hx[j] = tx;
          var ty = hy[par]; hy[par] = hy[j]; hy[j] = ty;
          var tc = hc[par]; hc[par] = hc[j]; hc[j] = tc;
          var ta = ha[par]; ha[par] = ha[j]; ha[j] = ta;
          j = par;
        }
      }
      function pop() {
        var rx = hx[0], ry = hy[0], rc = hc[0], ra = ha[0];
        hn--;
        if (hn > 0) {
          hx[0] = hx[hn]; hy[0] = hy[hn]; hc[0] = hc[hn]; ha[0] = ha[hn];
          var j = 0;
          for (;;) {
            var l = j * 2 + 1, r = l + 1, m = j;
            if (l < hn && hc[l] < hc[m]) m = l;
            if (r < hn && hc[r] < hc[m]) m = r;
            if (m === j) break;
            var tx = hx[m]; hx[m] = hx[j]; hx[j] = tx;
            var ty = hy[m]; hy[m] = hy[j]; hy[j] = ty;
            var tc = hc[m]; hc[m] = hc[j]; hc[j] = tc;
            var ta = ha[m]; ha[m] = ha[j]; ha[j] = ta;
            j = m;
          }
        }
        return { x: rx, y: ry, cost: rc, act: ra };
      }
      costs[hk(sx, sy)] = 0;
      push(sx, sy, 0, 'stay');
      var cur = { x: 0, y: 0, cost: 0, act: 'stay' };
      while (hn > 0) {
        cur = pop();
        if (cur.cost !== costs[hk(cur.x, cur.y)]) continue;
        if (goal(cur.x, cur.y)) return cur.act;
        for (var d = 0; d < 4; d++) {
          var nx = cur.x + DIRS[d][1], ny = cur.y + DIRS[d][2];
          if (!open(nx, ny) || !passable(nx, ny)) continue;
          var nc = cur.cost + 1 + riskFn(nx, ny);
          var key = hk(nx, ny);
          if (nc >= costs[key]) continue;
          costs[key] = nc;
          push(nx, ny, nc, cur.act === 'stay' ? DIRS[d][0] : cur.act);
        }
      }
      return 'stay';
    }

    function anyPass() { return true; }

    // ---- carrier: run to own half ----
    if (you.carrying) {
      var gCap = function (x) { return ownHalf(x); };
      var a = astar(you.x, you.y, function (x) { return gCap(x); }, anyPass, riskAt);
      return a;
    }

    var losingLate = (state.maxTicks - state.tick < 160) &&
      (state.score[enemy] >= state.score[team]);

    // ---- defender: sit on the flag, pounce on close intruders ----
    // An intruder must step onto our flag to steal it, and tags resolve
    // before pickups, so holding the flag cell kills any grab attempt.
    // Chasing far intruders only drags us out of position.
    var isDef = n > 1 && idx === 0 && !losingLate;
    if (isDef) {
      var confD = function (x) { return ownHalf(x) || x === border; };
      // 1. thief escaping with our flag through our half: chase it down
      if (myFlag.carrier !== null) {
        var thief = null;
        for (var c = 0; c < foes.length; c++) {
          if (foes[c].id === myFlag.carrier) { thief = foes[c]; break; }
        }
        if (thief && (ownHalf(thief.x) || thief.x === border)) {
          var tx = thief.x, ty = thief.y;
          return astar(you.x, you.y, function (x, y) {
            return Math.abs(x - tx) + Math.abs(y - ty) <= 1;
          }, confD, function () { return 0; });
        }
      }
      // 2. intruder close to our flag: pounce
      var near = null, nearD = 6;
      for (var ni = 0; ni < intruders.length; ni++) {
        var dHome = dist(intruders[ni], myFlag.home);
        if (dHome < nearD || (dHome === nearD && near !== null && dist(you, intruders[ni]) < dist(you, near))) {
          near = intruders[ni]; nearD = dHome;
        }
      }
      if (near !== null) {
        var nx2 = near.x, ny2 = near.y;
        return astar(you.x, you.y, function (x, y) {
          return Math.abs(x - nx2) + Math.abs(y - ny2) <= 1;
        }, confD, function () { return 0; });
      }
      // 3. enemy prisoners in our jail and no flag threat: guard the jail.
      // A rescuer must step next to a jail cell, so holding that post tags it.
      var myJail = state.zones[team].jail;
      var ePris = false;
      for (var ep = 0; ep < foes.length; ep++) if (foes[ep].jailed) { ePris = true; break; }
      if (ePris) {
        return astar(you.x, you.y, function (x, y) {
          for (var j = 0; j < myJail.length; j++) {
            if (Math.abs(x - myJail[j].x) + Math.abs(y - myJail[j].y) <= 1) return true;
          }
          return false;
        }, confD, function () { return 0; });
      }
      // 4. default: sit exactly on our flag stand
      var fh = myFlag.home;
      if (you.x === fh.x && you.y === fh.y) return 'stay';
      return astar(you.x, you.y, function (x, y) { return x === fh.x && y === fh.y; },
        confD, function () { return 0; });
    }

    // ---- raiders ----
    // rescue duty: closest available raider when teammates jailed
    var jailedMates = [];
    for (var m = 0; m < state.teammates.length; m++) if (state.teammates[m].jailed) jailedMates.push(state.teammates[m]);
    if (jailedMates.length && foeFlag.carrier === null && !you.carrying) {
      var jail = state.zones[enemy].jail;
      var dj = function (a) {
        var best = Infinity;
        for (var j = 0; j < jail.length; j++) {
          var d = Math.abs(a.x - jail[j].x) + Math.abs(a.y - jail[j].y);
          if (d < best) best = d;
        }
        return best;
      };
      var pool = [];
      var defId = (n > 1 && !losingLate) ? order[0].id : null; // keep real defender home
      var mates = [you].concat(state.teammates);
      for (var r = 0; r < mates.length; r++) {
        var o = mates[r];
        if (defId !== null && o.id === defId) continue;
        if (o.jailed || o.respawnIn > 0 || o.carrying || o.x === null) continue;
        pool.push(o);
      }
      if (pool.length) {
        pool.sort(function (a, b) {
          var d = dj(a) - dj(b);
          if (d !== 0) return d;
          var sa = String(a.id), sb = String(b.id);
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        });
        if (pool[0].id === you.id && dist(you, foeFlag) > 5) {
          return astar(you.x, you.y, function (x, y) {
            for (var j = 0; j < jail.length; j++) {
              if (Math.abs(x - jail[j].x) + Math.abs(y - jail[j].y) <= 1) return true;
            }
            return false;
          }, anyPass, riskAt);
        }
      }
    }

    // escort: only the closest free raider screens the carrier (in our
    // half it can tag pursuers); the rest start the next wave instead of
    // piling onto the carrier.
    if (foeFlag.carrier !== null && foeFlag.carrier !== you.id) {
      var cx = foeFlag.x, cy = foeFlag.y;
      // if I am close to enemy home flag-grab irrelevant; escort instead
      var mateCarries = false;
      for (var mc = 0; mc < state.teammates.length; mc++) {
        if (state.teammates[mc].id === foeFlag.carrier) { mateCarries = true; break; }
      }
      if (mateCarries) {
        var free = [you].concat(state.teammates.filter(function (a) {
          return active(a) && !a.carrying;
        }));
        free.sort(function (a, b) {
          var d = dist(a, foeFlag) - dist(b, foeFlag);
          if (d !== 0) return d;
          var sa = String(a.id), sb = String(b.id);
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        });
        if (free.length && free[0].id === you.id) {
          if (you.x === cx && you.y === cy) return 'stay';
          return astar(you.x, you.y, function (x, y) {
            return Math.abs(x - cx) + Math.abs(y - cy) <= 1;
          }, anyPass, riskAt);
        }
        // not the escort: fall through to raid again below
      } else if (myFlag.carrier !== null) {
        // enemy picked its own flag? impossible (defenders can't pick own). Enemy carries OUR flag:
        // if our flag stolen, nearest raider helps hunt it in foe half
        var hx2 = myFlag.x, hy2 = myFlag.y;
        return astar(you.x, you.y, function (x, y) {
          return Math.abs(x - hx2) + Math.abs(y - hy2) <= 1;
        }, anyPass, riskAt);
      }
    }
    // our flag stolen and visible in foe half: nearest raider intercepts
    if (myFlag.carrier !== null && foeFlag.carrier === null) {
      var thief = null;
      for (var th = 0; th < foes.length; th++) if (foes[th].id === myFlag.carrier) thief = foes[th];
      if (thief && foeHalf(thief.x)) {
        // am I the closest raider?
        var racers = [you].concat(state.teammates.filter(function (a) {
          return active(a) && !a.carrying;
        }));
        racers.sort(function (a, b) {
          var d = dist(a, thief) - dist(b, thief);
          if (d !== 0) return d;
          var sa = String(a.id), sb = String(b.id);
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        });
        if (racers[0].id === you.id) {
          var tx = thief.x, ty = thief.y;
          return astar(you.x, you.y, function (x, y) {
            return x === tx && y === ty;
          }, anyPass, riskAt);
        }
      }
    }

    // default: raid enemy flag. Outbound raiders spread across border
    // crossings (by seat band) when the enemy holds its flag, so one
    // holder cannot cover every approach; otherwise run straight.
    var fx = foeFlag.x, fy = foeFlag.y;
    if (you.x === fx && you.y === fy) return 'stay';
    if (ownHalf(you.x) || you.x === border) {
      var holderOut = false;
      for (var hh = 0; hh < foes.length; hh++) {
        var fh2 = foes[hh];
        if (fh2.carrying || fh2.jailed || fh2.respawnIn > 0 || fh2.x === null) continue;
        if (!foeOwnHalf(fh2)) continue;
        var dhh = Math.abs(fh2.x - foeHome.x) + Math.abs(fh2.y - foeHome.y);
        if (dhh > 6) continue;
        var pph = _memPrev[String(fh2.id)];
        var pdhh = (pph === undefined) ? dhh : pph.dh;
        if ((dhh - pdhh) < 2) { holderOut = true; break; }
      }
      if (holderOut) {
        var nRaid = n - ((n > 1 && !losingLate) ? 1 : 0);
        var ridx = idx - (n - nRaid);
        if (ridx < 0) ridx = 0;
        var centerY = Math.floor(H * (ridx + 0.5) / Math.max(1, nRaid));
        var wx = -1, wy = -1, wBest = Infinity;
        for (var wyy = 0; wyy < H; wyy++) {
          for (var wxx = 0; wxx < W; wxx++) {
            if (!open(wxx, wyy)) continue;
            var off = Math.abs(wxx - border);
            if (off > 2) continue;
            var scoreW = off * 1000 + Math.abs(wyy - centerY);
            if (scoreW < wBest) { wBest = scoreW; wx = wxx; wy = wyy; }
          }
        }
        if (wx >= 0 && !(you.x === wx && you.y === wy)) {
          var wxx2 = wx, wyy2 = wy;
          return astar(you.x, you.y, function (x, y) { return x === wxx2 && y === wyy2; }, anyPass, riskAt);
        }
      }
    }
    return astar(you.x, you.y, function (x, y) { return x === fx && y === fy; }, anyPass, riskAt);
  } catch (err) {
    return 'stay';
  }
}
