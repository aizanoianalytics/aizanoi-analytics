'use strict';
// LunaGuard v2: airtight camp defense + pressure offense.
// Defense: defender stands ON own flag stand (immortal there: enemies can't tag
//   in our half; any pickup attempt tags before pickup resolves). Only leaves to
//   chase our-flag carriers or jail-rats, then returns. Never chases non-carriers.
// Offense: dive straight at open/guarded-by-chaser flags; stage outside tag
//   radius vs campers (per-seat memory classifies); rescue jailed mates;
//   desperation dives when behind late; protects leads late.

module.exports = {
  name: 'LunaGuard',
  move: function move(state) {
    try {
      var you = state.you;
      if (!you || you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';
      var W = state.width, H = state.height, B = state.border, grid = state.grid;
      var team = state.team, enemy = team === 'west' ? 'east' : 'west';
      var ownHalf = function (x) { return team === 'west' ? x < B : x > B; };
      var foeHalf = function (x) { return team === 'west' ? x > B : x < B; };
      var foeHome = function (x) { return enemy === 'west' ? x < B : x > B; };
      var active = function (a) { return !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null; };
      var man = function (ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); };
      var open = function (x, y) {
        return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] === '.';
      };

      var order = [you].concat(state.teammates).sort(function (a, b) {
        return String(a.id) < String(b.id) ? -1 : 1;
      });
      var myIdx = 0, k;
      for (k = 0; k < order.length; k++) if (order[k].id === you.id) myIdx = k;
      var teamSize = order.length;

      var foes = state.enemies.filter(active);
      var foeDefs = foes.filter(function (a) { return foeHome(a.x); });

      var myFlag = state.flags[team], foeFlag = state.flags[enemy];
      var myStand = myFlag.home, foeStand = foeFlag.home;
      var foeJail = state.zones[enemy].jail, myJail = state.zones[team].jail;
      var ticksLeft = state.maxTicks - state.tick;
      var ahead = state.score[team] > state.score[enemy];
      var behind = state.score[team] < state.score[enemy];

      // ---- per-seat memory: classify enemy flag defense as camper-like ----
      if (typeof move._m === 'undefined') move._m = { lastTick: -1, camp: 0 };
      var M = move._m;
      if (state.tick !== M.lastTick + 1 && state.tick !== M.lastTick) { M.camp = 0; }
      M.lastTick = state.tick;
      var foeOnFlag = false;
      for (k = 0; k < foes.length; k++) {
        if (man(foes[k].x, foes[k].y, foeStand.x, foeStand.y) <= 1) { foeOnFlag = true; break; }
      }
      if (foeOnFlag) M.camp++; else M.camp = 0;
      var camper = M.camp >= 6;

      // ---- role consensus ----
      // Solo also camps: a camper can't be scored on, wins 0-0 on tags vs
      // rushers; only dives when behind late (desperation).
      var defenderId = null;
      for (k = 0; k < order.length; k++) {
        if (!active(order[k]) || order[k].carrying) continue;
        defenderId = order[k].id; break;
      }
      var iAmDefender = defenderId !== null && defenderId === you.id;

      var jailedMates = [you].concat(state.teammates).filter(function (a) { return a.jailed; });
      var rescuerId = null;
      if (jailedMates.length && !you.carrying && !iAmDefender) {
        var cands = order.filter(function (a) {
          return active(a) && !a.carrying && a.id !== defenderId;
        });
        if (teamSize === 1) cands = order.filter(active);
        var best = null, bestD = Infinity;
        for (k = 0; k < cands.length; k++) {
          var dmin = Infinity, j;
          for (j = 0; j < foeJail.length; j++) {
            var dd = man(cands[k].x, cands[k].y, foeJail[j].x, foeJail[j].y);
            if (dd < dmin) dmin = dd;
          }
          if (dmin < bestD || (dmin === bestD && best !== null && String(cands[k].id) < String(best.id))) {
            bestD = dmin; best = cands[k];
          }
        }
        if (best) rescuerId = best.id;
      }
      var iAmRescuer = rescuerId !== null && rescuerId === you.id;

      // Desperation: behind late -> everyone dives, defender abandons camp.
      var desperate = behind && ticksLeft < 120 + 60 * (state.score[enemy] - state.score[team]);
      if (desperate) iAmDefender = false;
      // Protect lead late: attackers hold rather than feed.
      var protectLead = ahead && ticksLeft < 150;

      var baseDirs = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
      var rot = ((myIdx % 4) + 4) % 4, d;
      var dirs = [];
      for (d = 0; d < 4; d++) dirs.push(baseDirs[(d + rot) % 4]);

      function nextStep(sx, sy, goalFn, passFn, costFn) {
        if (goalFn(sx, sy)) return 'stay';
        var N = W * H, i;
        var dist = new Float64Array(N);
        for (i = 0; i < N; i++) dist[i] = Infinity;
        var first = new Int8Array(N);
        for (i = 0; i < N; i++) first[i] = -1;
        var h = [];
        function hpush(c, idx) {
          h.push([c, idx]);
          var k2 = h.length - 1, tmp;
          while (k2 > 0) {
            var p = (k2 - 1) >> 1;
            if (h[p][0] <= h[k2][0]) break;
            tmp = h[p]; h[p] = h[k2]; h[k2] = tmp; k2 = p;
          }
        }
        function hpop() {
          var top = h[0], last = h.pop();
          if (h.length) {
            h[0] = last;
            var k2 = 0, tmp;
            for (;;) {
              var l = k2 * 2 + 1, r = l + 1, m = k2;
              if (l < h.length && h[l][0] < h[m][0]) m = l;
              if (r < h.length && h[r][0] < h[m][0]) m = r;
              if (m === k2) break;
              tmp = h[m]; h[m] = h[k2]; h[k2] = tmp; k2 = m;
            }
          }
          return top;
        }
        var s = sy * W + sx;
        dist[s] = 0; first[s] = -2;
        hpush(0, s);
        while (h.length) {
          var cur = hpop(), c0 = cur[0], idx = cur[1];
          if (c0 !== dist[idx]) continue;
          var cx = idx % W, cy = (idx / W) | 0;
          if (goalFn(cx, cy)) {
            var f = first[idx];
            return f >= 0 ? dirs[f][0] : 'stay';
          }
          for (d = 0; d < 4; d++) {
            var nx = cx + dirs[d][1], ny = cy + dirs[d][2];
            if (!open(nx, ny) || !passFn(nx, ny)) continue;
            var ni = ny * W + nx;
            var nc = c0 + 1 + costFn(nx, ny);
            if (nc < dist[ni]) {
              dist[ni] = nc;
              first[ni] = (first[idx] === -2) ? d : first[idx];
              hpush(nc, ni);
            }
          }
        }
        return null;
      }

      function danger(x, y, w) {
        if (!foeHalf(x) || x === B) return 0;
        if (w === undefined) w = 1;
        var c = 0;
        for (var i = 0; i < foeDefs.length; i++) {
          var dd = man(x, y, foeDefs[i].x, foeDefs[i].y);
          if (dd <= 1) c += 200; // never willingly step next to a foe that can tag
          else if (dd === 2) c += 25 * w;
          else if (dd === 3) c += 6 * w;
          else if (dd === 4) c += 2 * w;
        }
        return c;
      }
      var zero = function () { return 0; };
      var passAll = function () { return true; };
      var passOwn = function (x) { return ownHalf(x) || x === B; };

      function ourCarrier() {
        for (var i = 0; i < foes.length; i++) {
          if (foes[i].carrying && ownHalf(foes[i].x)) return foes[i];
        }
        return null;
      }

      // ---- DEFENDER: camp the stand ----
      if (iAmDefender) {
        var oc = ourCarrier();
        if (oc) {
          // Our flag is out there: chase the carrier (only way to stop capture).
          if (man(you.x, you.y, oc.x, oc.y) <= 1) {
            var dx = oc.x - you.x, dy = oc.y - you.y;
            if (dx === 0 && dy === 0) return 'stay';
            var act = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
            if (open(you.x + dx, you.y + dy)) return act;
            return 'stay';
          }
          var ch = nextStep(you.x, you.y, function (x, y) { return x === oc.x && y === oc.y; }, passOwn, zero);
          if (ch) return ch;
          return 'stay';
        }
        // Jail-rat: only when it is the SOLE intruder in our half AND there
        // is nothing to free (no enemy prisoners in our jail); else camp.
        // A rescue frees attackers who then outnumber us off-stand (lure).
        var rat = null, ri;
        var intruderCount = 0;
        for (ri = 0; ri < foes.length; ri++) {
          if (ownHalf(foes[ri].x)) intruderCount++;
        }
        var enemyPrisoners = 0;
        for (ri = 0; ri < state.enemies.length; ri++) {
          if (state.enemies[ri].jailed) enemyPrisoners++;
        }
        if (intruderCount === 1 && enemyPrisoners === 0) {
          for (ri = 0; ri < foes.length; ri++) {
            var near = false, q;
            for (q = 0; q < myJail.length; q++) {
              if (man(foes[ri].x, foes[ri].y, myJail[q].x, myJail[q].y) <= 2) { near = true; break; }
            }
            if (near) { rat = foes[ri]; break; }
          }
        }
        if (rat) {
          var rh = nextStep(you.x, you.y, function (x, y) { return x === rat.x && y === rat.y; }, passOwn, zero);
          if (rh) return rh;
        }
        // Camp: stand on the flag stand. Anything stepping on dies before pickup.
        if (you.x === myStand.x && you.y === myStand.y) return 'stay';
        var home = nextStep(you.x, you.y, function (x, y) { return x === myStand.x && y === myStand.y; }, passOwn, zero);
        return home || 'stay';
      }

      // ---- RESCUER ----
      if (iAmRescuer) {
        var goalR = function (x, y) {
          for (var k2 = 0; k2 < foeJail.length; k2++) {
            if (man(x, y, foeJail[k2].x, foeJail[k2].y) <= 1) return true;
          }
          return false;
        };
        if (goalR(you.x, you.y)) return 'stay';
        var stepR = nextStep(you.x, you.y, goalR, passAll, danger);
        return stepR || 'stay';
      }

      // ---- agents in own half: free tags on intruders (safe: they can't tag back) ----
      // Skipped solo: in a 1v1 every tempo step matters; only carrier stops divert.
      if (!you.carrying && ownHalf(you.x) && teamSize > 1) {
        var prey = ourCarrier();
        if (!prey) {
          var pd = Infinity;
          for (k = 0; k < foes.length; k++) {
            if (!ownHalf(foes[k].x)) continue;
            var pdd = man(you.x, you.y, foes[k].x, foes[k].y);
            if (pdd < pd) { pd = pdd; prey = foes[k]; }
          }
          if (prey && pd > 3) prey = null; // don't wander; head out instead
        }
        if (prey) {
          if (man(you.x, you.y, prey.x, prey.y) <= 1) {
            var pdx = prey.x - you.x, pdy = prey.y - you.y;
            if (pdx === 0 && pdy === 0) return 'stay';
            var pa = pdx === 1 ? 'right' : pdx === -1 ? 'left' : pdy === 1 ? 'down' : 'up';
            if (open(you.x + pdx, you.y + pdy)) return pa;
            return 'stay';
          }
          var ps = nextStep(you.x, you.y, function (x, y) { return x === prey.x && y === prey.y; }, passOwn, zero);
          if (ps) return ps;
        }
      }

      // ---- CARRIER: dive for nearest own-half cell ----
      if (you.carrying) {
        var costC = function (x, y) {
          var dh = ownHalf(x) ? 0 : (team === 'west' ? B - x : x - B);
          return danger(x, y, dh <= 1 ? 0.05 : dh <= 2 ? 0.25 : dh <= 4 ? 0.6 : 1);
        };
        return nextStep(you.x, you.y, ownHalf, passAll, costC) || 'stay';
      }

      // ---- ATTACK ----
      var guarded = false;
      for (k = 0; k < foeDefs.length; k++) {
        if (man(foeDefs[k].x, foeDefs[k].y, foeFlag.x, foeFlag.y) <= 2) { guarded = true; break; }
      }
      var flagOpen = foeFlag.carrier === null;

      var diveCost = function (x, y) {
        var df = man(x, y, foeFlag.x, foeFlag.y);
        return danger(x, y, df <= 1 ? 1 : df <= 2 ? 0.3 : df <= 4 ? 0.7 : 1);
      };
      function dive() {
        var fx = foeFlag.x, fy = foeFlag.y;
        return nextStep(you.x, you.y, function (x, y) { return x === fx && y === fy; }, passAll, diveCost);
      }

      if (desperate) return dive() || 'stay';
      if (protectLead && guarded) {
        // Hold: stay in own half near border, threaten without feeding.
        if (ownHalf(you.x) || you.x === B) return 'stay';
        return nextStep(you.x, you.y, function (x) { return ownHalf(x) || x === B; }, passAll, danger) || 'stay';
      }

      if (camper && guarded && flagOpen) {
        // Unbreakable camp: stage outside tag radius, don't feed tags.
        var sx = -1, sy = -1, sd = Infinity;
        for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
          if (!open(xx, yy)) continue;
          var dmf = man(xx, yy, foeFlag.x, foeFlag.y);
          if (dmf < 3 || dmf > 6) continue;
          var dm = man(xx, yy, you.x, you.y);
          if (dm < sd) { sd = dm; sx = xx; sy = yy; }
        }
        if (sx < 0) return 'stay';
        if (you.x === sx && you.y === sy) return 'stay';
        return nextStep(you.x, you.y, function (x, y) { return x === sx && y === sy; }, passAll, danger) || 'stay';
      }
      // Otherwise pressure: dive straight. Chasers get pulled out and outrun.
      return dive() || 'stay';
    } catch (e) {
      return 'stay';
    }
  }
};
