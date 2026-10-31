'use strict';

// ApexFlag: role-based CTF bot.
// - Lowest-id agent defends home half (chases intruders, guards flag stand).
// - Others attack the enemy flag with threat-aware routing, chain captures
//   by staging at the enemy stand, and send one agent to rescue prisoners.
// - Carriers take the safest shortest exit back to their own half.
// - Solo agent hybrids: chases intruders in its half, otherwise rushes.
// Pathfinding is forward Dijkstra over open cells with a defender-proximity
// threat cost, plus a 1-step tag veto so attackers never walk into a tag.

var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], stay: [0, 0] };
var ORDER = ['up', 'down', 'left', 'right'];

// Reused search buffers (reallocated if the field grows).
var BUF = { w: 0, h: 0, dist: null, first: null, prev: null, hi: null, hf: null, closed: null };

function cmpId(a, b) {
  var x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function getBuf(w, h) {
  if (BUF.w !== w || BUF.h !== h) {
    BUF.w = w; BUF.h = h;
    var s = w * h;
    BUF.dist = new Float64Array(s);
    BUF.first = new Int8Array(s);
    BUF.prev = new Int32Array(s);
    BUF.hi = new Int32Array(s + 1);
    BUF.hf = new Float64Array(s + 1);
    BUF.closed = new Uint8Array(s);
  }
  return BUF;
}

// Unified A* over open cells using reusable typed-array heaps (no per-node
// allocation, so even 201x201 fields stay far under the time limit).
// opt: {goal(x,y), h(x,y), allow(x,y)->bool, threatScale, threatAt,
//       lane, needPath}. Returns first-step action, or the full cell path
// when needPath is set, or null when capped/unreachable.
var MAXPOPS = 6000;
function search(W, H, B, sx, sy, opt) {
  var buf = getBuf(W, H);
  var dist = buf.dist, first = buf.first, prev = buf.prev;
  var hi = buf.hi, hf = buf.hf, closed = buf.closed;
  var size = W * H;
  for (var z = 0; z < size; z++) { dist[z] = Infinity; first[z] = -1; closed[z] = 0; }
  var needPath = !!opt.needPath;
  var start = sy * W + sx;
  dist[start] = 0; first[start] = 4;
  if (needPath) for (var q = 0; q < size; q++) prev[q] = -1;
  var n = 1;
  hi[1] = start; hf[1] = opt.h(sx, sy);
  var pops = 0;
  var grid = opt.grid, allow = opt.allow, threatScale = opt.threatScale || 0;
  var threatAt = opt.threatAt, lane = opt.lane || 0;
  var goal = opt.goal, h = opt.h;
  var jb = (lane * 3 + sx * 7 + sy * 13) % 5;
  while (n > 0) {
    // pop min (1-based binary heap on f, index tiebreak: deterministic)
    var top = hi[1];
    hi[1] = hi[n]; hf[1] = hf[n]; n--;
    var i = 1;
    for (;;) {
      var l = i * 2, r = l + 1, m = i;
      if (l <= n && (hf[l] < hf[m] || (hf[l] === hf[m] && hi[l] < hi[m]))) m = l;
      if (r <= n && (hf[r] < hf[m] || (hf[r] === hf[m] && hi[r] < hi[m]))) m = r;
      if (m === i) break;
      var ti = hi[i]; hi[i] = hi[m]; hi[m] = ti;
      var tf = hf[i]; hf[i] = hf[m]; hf[m] = tf;
      i = m;
    }
    if (closed[top]) continue;
    closed[top] = 1;
    var cx = top % W, cy = (top / W) | 0;
    var cg = dist[top];
    if ((cx !== sx || cy !== sy) && goal(cx, cy)) {
      if (!needPath) {
        var f = first[top];
        if (f === 4 || f < 0) return 'stay';
        return opt.order[f];
      }
      var path = [];
      var c2 = top;
      while (c2 !== start && c2 >= 0) {
        path.push({ x: c2 % W, y: (c2 / W) | 0 });
        c2 = prev[c2];
      }
      path.reverse();
      return path;
    }
    if (++pops > MAXPOPS) return null;
    for (var d = 0; d < 4; d++) {
      var dd = (d + lane) & 3;
      var act = opt.order[dd];
      var delt = opt.deltas[dd];
      var nx = cx + delt[0], ny = cy + delt[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (grid[ny][nx] === '#') continue;
      if (allow && !allow(nx, ny)) continue;
      var stepCost = 1;
      if (threatScale) stepCost += threatScale * threatAt(nx, ny);
      stepCost += ((nx * 7 + ny * 13 + jb) % 5) * 0.01;
      var nc = cg + stepCost;
      var nk = ny * W + nx;
      if (nc >= dist[nk]) continue;
      dist[nk] = nc;
      if (needPath) prev[nk] = top;
      else first[nk] = (first[top] === 4) ? dd : first[top];
      // push with sift-up
      n++;
      hi[n] = nk;
      var nf = nc + h(nx, ny);
      hf[n] = nf;
      var j = n;
      while (j > 1) {
        var p = j >> 1;
        if (hf[p] < hf[j] || (hf[p] === hf[j] && hi[p] <= hi[j])) break;
        var t3 = hi[p]; hi[p] = hi[j]; hi[j] = t3;
        var f3 = hf[p]; hf[p] = hf[j]; hf[j] = f3;
        j = p;
      }
    }
  }
  return null;
}

function move(state) {
  try {
    var you = state.you;
    if (!you || you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';
    var W = state.width, H = state.height, B = state.border;
    var west = state.team === 'west';
    var enemyTeam = west ? 'east' : 'west';
    var ownHalf = function (x) { return west ? x < B : x > B; };

    // Stable roster order (includes jailed/respawning so roles don't flap).
    var roster = [you].concat(state.teammates).sort(function (a, b) { return cmpId(a.id, b.id); });
    var myIdx = 0;
    for (var ri = 0; ri < roster.length; ri++) if (String(roster[ri].id) === String(you.id)) { myIdx = ri; break; }
    var n = roster.length;

    var liveEnemies = [];
    for (var ei = 0; ei < state.enemies.length; ei++) {
      var e = state.enemies[ei];
      if (!e.jailed && e.respawnIn === 0 && e.x !== null && e.y !== null) liveEnemies.push(e);
    }
    var intruders = [];
    for (var ii = 0; ii < liveEnemies.length; ii++) {
      if (ownHalf(liveEnemies[ii].x)) intruders.push(liveEnemies[ii]);
    }
    // Enemy defenders that can tag us: live enemies inside their own half.
    var foeHalf = function (x) { return west ? x > B : x < B; };
    var hunters = [];
    for (var hi = 0; hi < liveEnemies.length; hi++) {
      if (foeHalf(liveEnemies[hi].x)) hunters.push(liveEnemies[hi]);
    }

    var myFlag = state.flags[state.team];
    var foeFlag = state.flags[enemyTeam];
    var myJailCells = state.zones[enemyTeam].jail; // where OUR prisoners sit

    var prisoners = [];
    for (var pi = 0; pi < state.teammates.length; pi++) {
      if (state.teammates[pi].jailed) prisoners.push(state.teammates[pi]);
    }

    var allyCarrier = null;
    if (you.carrying) allyCarrier = you;
    else {
      for (var ci = 0; ci < state.teammates.length; ci++) {
        if (state.teammates[ci].carrying) { allyCarrier = state.teammates[ci]; break; }
      }
    }

    var remaining = state.maxTicks - state.tick;
    var behind = state.score[enemyTeam] > state.score[state.team];
    var desperation = remaining <= 80 && behind && n > 1;

    var isDefender = n > 1 && myIdx === 0 && !desperation;

    // Threat of standing on (x,y) in the enemy half (walls don't block tags).
    // Only adjacent/near hunters matter; far ones don't distort the search.
    function threatAt(x, y) {
      var t = 0;
      for (var k = 0; k < hunters.length; k++) {
        var dx = Math.abs(x - hunters[k].x), dy = Math.abs(y - hunters[k].y);
        var d = dx + dy;
        if (d <= 1) t += 60;
        else if (d === 2) t += 15;
      }
      return t;
    }

    // Thin wrappers over the shared typed-array A*: threat applies only in
    // the enemy half (our half and the border are tag-safe by rule).
    var DELTAS = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    var threatEnemyOnly = function (x, y) {
      if (ownHalf(x) || x === B) return 0;
      return threatAt(x, y);
    };
    function route(sx, sy, opt) {
      return search(W, H, B, sx, sy, {
        goal: opt.goal, h: opt.h, allow: opt.allow || null,
        threatScale: opt.threatScale || 0, threatAt: threatEnemyOnly,
        lane: myIdx, needPath: false,
        grid: state.grid, order: ORDER, deltas: DELTAS
      });
    }

    // Greedy one-step fallback (manhattan + danger) when A* caps out.
    function greedyStep(sx, sy, h, allow) {
      var acts = ['stay'].concat(ORDER);
      var bm = 'stay', bs = Infinity;
      for (var i = 0; i < acts.length; i++) {
        var nx = sx + DIRS[acts[i]][0], ny = sy + DIRS[acts[i]][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (state.grid[ny][nx] === '#') continue;
        if (allow && !allow(nx, ny)) continue;
        var s = h(nx, ny) * 1000 + threatAt(nx, ny);
        if (s < bs) { bs = s; bm = acts[i]; }
      }
      return bm;
    }

    // Full cell path for interception, via the shared A*.
    function bfsPath(sx, sy, isGoal, h, allow) {
      return search(W, H, B, sx, sy, {
        goal: isGoal, h: h, allow: allow || null,
        threatScale: 0, threatAt: threatEnemyOnly,
        lane: 0, needPath: true,
        grid: state.grid, order: ORDER, deltas: DELTAS
      });
    }

    // Where to meet an intruder: carriers get cut off at their border exit,
    // others are pursued head-on (they run toward us anyway).
    function meetPoint(t) {
      if (!t.carrying) return { x: t.x, y: t.y };
      var foeHalfT = function (x) { return west ? x > B : x < B; };
      var foeDist = function (x) { return west ? Math.max(0, B + 1 - x) : Math.max(0, x - (B - 1)); };
      var path = bfsPath(t.x, t.y, foeHalfT, foeDist, null);
      if (!path || !path.length) return { x: t.x, y: t.y };
      // Exit cell: last cell before entering their half (border or our side).
      var cut = path[0];
      for (var i = 0; i < path.length; i++) {
        if (foeHalfT(path[i].x)) break;
        cut = path[i];
      }
      // cut is on border or our side; defender must wait on our side.
      if (ownHalf(cut.x)) {
        var dd = Math.abs(you.x - t.x) + Math.abs(you.y - t.y);
        var de = Math.abs(t.x - cut.x) + Math.abs(t.y - cut.y);
        // If we can reach the cutoff well before the carrier, take it.
        var dw = Math.abs(you.x - cut.x) + Math.abs(you.y - cut.y);
        if (dw <= dd + de) return cut;
        return { x: t.x, y: t.y };
      }
      // cut on border: wait on the adjacent own-half cell.
      var bx = west ? cut.x - 1 : cut.x + 1;
      var wait = { x: bx, y: cut.y };
      if (wait.x < 0 || wait.x >= W || state.grid[wait.y][wait.x] === '#') {
        // nearest open own-half neighbor of the border cell
        wait = null;
        var best = Infinity;
        for (var d2 = 0; d2 < 4; d2++) {
          var nx = cut.x + DIRS[ORDER[d2]][0], ny = cut.y + DIRS[ORDER[d2]][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (state.grid[ny][nx] === '#') continue;
          if (!ownHalf(nx)) continue;
          var s = Math.abs(nx - you.x) + Math.abs(ny - you.y);
          if (s < best) { best = s; wait = { x: nx, y: ny }; }
        }
        if (!wait) return { x: t.x, y: t.y };
      }
      return wait;
    }

    function legalMoves(x, y, allow) {
      var out = [];
      var acts = ['stay'].concat(ORDER);
      for (var i = 0; i < acts.length; i++) {
        var nx = x + DIRS[acts[i]][0], ny = y + DIRS[acts[i]][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (state.grid[ny][nx] === '#') continue;
        if (allow && !allow(nx, ny)) continue;
        out.push(acts[i]);
      }
      return out;
    }

    // 1-step veto: never step onto an enemy-half cell adjacent to a hunter
    // when a safer move reaches a similar point goal.
    function veto(x, y, chosen, pointGoal, regionDist) {
      var cx = x + DIRS[chosen][0], cy = y + DIRS[chosen][1];
      if (cx === x && cy === y) return chosen;
      if (ownHalf(cx) || cx === B) return chosen; // safe side: keep route
      var curDanger = threatAt(cx, cy);
      if (curDanger < 60) return chosen;
      var opts = legalMoves(x, y, null);
      var best = chosen, bestScore = Infinity;
      // current move's goal distance baseline
      var curGoal = pointGoal ? Math.abs(cx - pointGoal.x) + Math.abs(cy - pointGoal.y)
        : (regionDist ? regionDist(cx, cy) : 0);
      bestScore = curDanger * 10000 + curGoal;
      for (var i = 0; i < opts.length; i++) {
        var nx = x + DIRS[opts[i]][0], ny = y + DIRS[opts[i]][1];
        if (ownHalf(nx) || nx === B) {
          // stepping home is always safer; small bonus
          var g = pointGoal ? Math.abs(nx - pointGoal.x) + Math.abs(ny - pointGoal.y)
            : (regionDist ? regionDist(nx, ny) : 0);
          var s = threatAt(nx, ny) * 10000 + g - 5000;
          if (s < bestScore) { bestScore = s; best = opts[i]; }
          continue;
        }
        var gd = pointGoal ? Math.abs(nx - pointGoal.x) + Math.abs(ny - pointGoal.y)
          : (regionDist ? regionDist(nx, ny) : 0);
        var sc = threatAt(nx, ny) * 10000 + gd;
        if (sc < bestScore) { bestScore = sc; best = opts[i]; }
      }
      return best;
    }

    function homeDist(x) {
      if (ownHalf(x)) return 0;
      return west ? x - (B - 1) : (B + 1) - x; // horizontal dist to own half
    }

    // ---- Carrier: shortest safe exit home ----
    if (you.carrying) {
      if (ownHalf(you.x)) return 'stay'; // capture resolves this tick
      var r = route(you.x, you.y, {
        goal: function (x) { return ownHalf(x); },
        h: function (x) { return homeDist(x); },
        allow: null,
        threatScale: 3
      });
      var mv = r || greedyStep(you.x, you.y, function (x) { return homeDist(x); }, null);
      return veto(you.x, you.y, mv, null, function (x, y) { return homeDist(x) + 0; });
    }

    // ---- Defender ----
    // Priority: stop carriers via cutoff, engage a lone intruder head-on,
    // but never be lured off the flag by a crowd: 2+ intruders means a
    // decoy is likely, so stand on the flag (untaggable pickup denial).
    if (isDefender) {
      var carriers = [];
      for (var ci2 = 0; ci2 < intruders.length; ci2++) {
        if (intruders[ci2].carrying) carriers.push(intruders[ci2]);
      }
      var mark = null;
      if (carriers.length) {
        carriers.sort(function (a, b) {
          var da = Math.abs(a.x - you.x) + Math.abs(a.y - you.y);
          var db = Math.abs(b.x - you.x) + Math.abs(b.y - you.y);
          if (da !== db) return da - db;
          return cmpId(a.id, b.id);
        });
        mark = meetPoint(carriers[0]);
      } else if (intruders.length === 1) {
        mark = { x: intruders[0].x, y: intruders[0].y };
      }
      if (mark) {
        if (mark.x === you.x && mark.y === you.y) return 'stay';
        var allowHome = function (x) { return ownHalf(x) || x === B; };
        var manMark = function (x, y) { return Math.abs(x - mark.x) + Math.abs(y - mark.y); };
        var chase = route(you.x, you.y, {
          goal: function (x, y) { return x === mark.x && y === mark.y; },
          h: manMark,
          allow: allowHome,
          threatScale: 0
        });
        if (chase) return chase;
        var bm = 'stay', bd = Infinity;
        var cand = legalMoves(you.x, you.y, allowHome);
        for (var gi = 0; gi < cand.length; gi++) {
          var gx = you.x + DIRS[cand[gi]][0], gy = you.y + DIRS[cand[gi]][1];
          var gd2 = Math.abs(gx - mark.x) + Math.abs(gy - mark.y);
          if (gd2 < bd) { bd = gd2; bm = cand[gi]; }
        }
        return bm;
      }
      // Guard: stand on our flag so no intruder can touch it.
      var fh = myFlag.home;
      if (you.x === fh.x && you.y === fh.y) return 'stay';
      var allowHome2 = function (x) { return ownHalf(x) || x === B; };
      var manFh = function (x, y) { return Math.abs(x - fh.x) + Math.abs(y - fh.y); };
      var g = route(you.x, you.y, {
        goal: function (x, y) { return x === fh.x && y === fh.y; },
        h: manFh,
        allow: allowHome2,
        threatScale: 0
      });
      return g || greedyStep(you.x, you.y, manFh, allowHome2);
    }

    // ---- Solo hybrid (n == 1) ----
    // Guard a threatened flag, chase a carrier, otherwise exploit: an
    // intruder loitering far from our flag left theirs undefended, so race.
    // Outnumbered (1v2+), never race into an empty trade: sit on the flag,
    // deny every capture, and win the tag count.
    if (n === 1) {
      // Roster-based: jailed enemies come back, so they still count.
      var outnumbered = state.enemies.length > 1;
      if (outnumbered && !desperation) {
        // 1v2+: never leave the flag. Deny every capture; attackers that
        // come for it get tagged, which wins the time tiebreak.
        var fh0 = myFlag.home;
        if (you.x === fh0.x && you.y === fh0.y) return 'stay';
        var allowS0 = function (x) { return ownHalf(x) || x === B; };
        var manfh0 = function (x, y) { return Math.abs(x - fh0.x) + Math.abs(y - fh0.y); };
        var c0 = route(you.x, you.y, {
          goal: function (x, y) { return x === fh0.x && y === fh0.y; },
          h: manfh0,
          allow: allowS0,
          threatScale: 0
        });
        return c0 || greedyStep(you.x, you.y, manfh0, allowS0);
      }
      if (intruders.length && !desperation) {
        var sc = null;
        for (var si = 0; si < intruders.length; si++) {
          if (intruders[si].carrying) { sc = intruders[si]; break; }
        }
        if (sc) {
          var smp = meetPoint(sc);
          if (smp.x !== you.x || smp.y !== you.y) {
            var allowS = function (x) { return ownHalf(x) || x === B; };
            var mansmp = function (x, y) { return Math.abs(x - smp.x) + Math.abs(y - smp.y); };
            var cs = route(you.x, you.y, {
              goal: function (x, y) { return x === smp.x && y === smp.y; },
              h: mansmp,
              allow: allowS,
              threatScale: 0
            });
            if (cs) return cs;
          } else return 'stay';
        } else {
          var near = false;
          for (var ni = 0; ni < intruders.length; ni++) {
            var dd2 = Math.abs(intruders[ni].x - myFlag.home.x) + Math.abs(intruders[ni].y - myFlag.home.y);
            if (dd2 <= 12) { near = true; break; }
          }
          if (near || outnumbered) {
            var fh2 = myFlag.home;
            if (you.x !== fh2.x || you.y !== fh2.y) {
              var allowS2 = function (x) { return ownHalf(x) || x === B; };
              var manfh2 = function (x, y) { return Math.abs(x - fh2.x) + Math.abs(y - fh2.y); };
              var cg = route(you.x, you.y, {
                goal: function (x, y) { return x === fh2.x && y === fh2.y; },
                h: manfh2,
                allow: allowS2,
                threatScale: 0
              });
              if (cg) return cg;
            } else return 'stay';
          }
          // else: lone far intruder in 1v1 -> race to their empty flag
        }
      }
      // fall through to attack
    }

    // ---- Attackers ----
    // Rescue: exactly one attacker (closest by Manhattan, id tiebreak)
    // diverts to the enemy jail when we have prisoners there.
    var rescueMe = false;
    if (prisoners.length && !allyCarrier) {
      var candidates = [];
      for (var ai = 0; ai < roster.length; ai++) {
        if (ai === 0 && n > 1) continue; // defender stays
        var a = roster[ai];
        if (a.jailed || a.respawnIn > 0 || a.x === null || a.carrying) continue;
        if (String(a.id) === String(you.id)) candidates.push({ self: true, a: a });
        else candidates.push({ self: false, a: a });
      }
      if (candidates.length) {
        var jd = function (a) {
          var m = Infinity;
          for (var k = 0; k < myJailCells.length; k++) {
            var d = Math.abs(a.x - myJailCells[k].x) + Math.abs(a.y - myJailCells[k].y);
            if (d < m) m = d;
          }
          return m;
        };
        candidates.sort(function (p, q) {
          var d = jd(p.a) - jd(q.a);
          if (d !== 0) return d;
          return cmpId(p.a.id, q.a.id);
        });
        rescueMe = String(candidates[0].a.id) === String(you.id);
      }
    }

    if (rescueMe) {
      var jailHit = function (x, y) {
        for (var k = 0; k < myJailCells.length; k++) {
          if (Math.abs(x - myJailCells[k].x) + Math.abs(y - myJailCells[k].y) <= 1) return true;
        }
        return false;
      };
      if (jailHit(you.x, you.y)) {
        // Touching the jail frees everyone; hold position.
        return 'stay';
      }
      var jailH = function (x, y) {
        var m = Infinity;
        for (var k = 0; k < myJailCells.length; k++) {
          var d = Math.abs(x - myJailCells[k].x) + Math.abs(y - myJailCells[k].y) - 1;
          if (d < m) m = d;
        }
        return m < 0 ? 0 : m;
      };
      var rr = route(you.x, you.y, { goal: jailHit, h: jailH, allow: null, threatScale: 1 });
      var rm = rr || greedyStep(you.x, you.y, jailH, null);
      var jailPt = myJailCells[0];
      return veto(you.x, you.y, rm, jailPt, null);
    }

    // Stage at the enemy stand when an ally already carries (chain captures).
    var target = { x: foeFlag.x, y: foeFlag.y };
    if (allyCarrier) target = { x: foeFlag.home.x, y: foeFlag.home.y };
    if (you.x === target.x && you.y === target.y) return 'stay';
    var manTgt = function (x, y) { return Math.abs(x - target.x) + Math.abs(y - target.y); };
    var atk = route(you.x, you.y, {
      goal: function (x, y) { return x === target.x && y === target.y; },
      h: manTgt,
      allow: null,
      threatScale: 1
    });
    if (!atk) {
      // Unreachable (shouldn't happen on connected fields): greedy manhattan.
      var opts2 = legalMoves(you.x, you.y, null);
      var b2 = 'stay', b2d = Math.abs(you.x - target.x) + Math.abs(you.y - target.y);
      for (var o = 0; o < opts2.length; o++) {
        var nx2 = you.x + DIRS[opts2[o]][0], ny2 = you.y + DIRS[opts2[o]][1];
        var d2 = Math.abs(nx2 - target.x) + Math.abs(ny2 - target.y);
        if (d2 < b2d) { b2d = d2; b2 = opts2[o]; }
      }
      return b2;
    }
    return veto(you.x, you.y, atk, target, null);
  } catch (err) {
    return 'stay';
  }
}

module.exports = { name: 'ApexFlag', move: move };
