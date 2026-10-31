'use strict';

// ApexFlag: coordinated CTF team bot.
// - Static role agreement by sorted id: carriers return, lowest ids defend,
//   one attacker rescues jailed mates, rest attack spread across lanes.
// - Solo agents run a committed fastest-path race (never chase); they only
//   hover outside tag range against a real flag camper.
// - Offense: risk-aware A* that only fears defender-like foes (campers near
//   the flag or foes close by), plus a minimal 1-step anti-suicide filter.
// - Endgame: defend a lead, rush when behind; rescue unless protecting a lead.
module.exports = {
  name: 'ApexFlag',
  move: function move(state) {
    try {
      var you = state.you;
      if (!you || you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) return 'stay';
      var W = state.width, H = state.height, B = state.border;
      var team = state.team;
      var enemy = team === 'west' ? 'east' : 'west';
      ensureCache(state, W, H, B, team, enemy);
      var walk = __apex.walk, N = W * H;
      var oFH = __apex.oFH, eFH = __apex.eFH, jailE = __apex.jailE;
      var dO = __apex.dO, dE = __apex.dE;
      ensureScratch(N);

      var k, j;
      var allies = [you];
      for (k = 0; k < state.teammates.length; k++) {
        var tm0 = state.teammates[k];
        if (!tm0.jailed && tm0.respawnIn === 0 && tm0.x !== null && tm0.y !== null) allies.push(tm0);
      }
      var foes = [];
      for (k = 0; k < state.enemies.length; k++) {
        var f0 = state.enemies[k];
        if (!f0.jailed && f0.respawnIn === 0 && f0.x !== null && f0.y !== null) foes.push(f0);
      }
      var totalSize = state.teammates.length + 1;
      allies.sort(cmpId);

      var intruders = [];
      for (k = 0; k < foes.length; k++) {
        if (isOwnX(foes[k].x, team, B)) intruders.push(foes[k]);
      }
      intruders.sort(function (a, b) {
        var c = (b.carrying ? 1 : 0) - (a.carrying ? 1 : 0);
        if (c !== 0) return c;
        var da = stepDist(dO, W, a.x, a.y, oFH), db = stepDist(dO, W, b.x, b.y, oFH);
        return (da - db) || cmpId(a, b);
      });
      var enemyCarrier = null;
      for (k = 0; k < foes.length; k++) {
        if (foes[k].carrying) { enemyCarrier = foes[k]; break; }
      }
      var jailedMates = 0;
      for (k = 0; k < state.teammates.length; k++) {
        if (state.teammates[k].jailed) jailedMates++;
      }

      var myScore = state.score[team], foeScore = state.score[enemy];
      var ticksLeft = state.maxTicks - state.tick;
      var ctw = state.capturesToWin;
      var myTags = you.tags, foeTags = 0;
      for (k = 0; k < state.teammates.length; k++) myTags += state.teammates[k].tags;
      for (k = 0; k < state.enemies.length; k++) foeTags += state.enemies[k].tags;
      var winning = myScore > foeScore || (myScore === foeScore && myTags > foeTags);
      var losing = myScore < foeScore || (myScore === foeScore && myTags < foeTags);
      var lateWin = ticksLeft < 150 && winning;
      var lateLose = ticksLeft < 150 && losing;

      var nonCar = [];
      for (k = 0; k < allies.length; k++) {
        if (!allies[k].carrying) nonCar.push(allies[k]);
      }
      var D = 0;
      if (totalSize >= 2 && !lateLose) {
        if (lateWin) D = nonCar.length;
        else {
          D = 1;
          if (totalSize >= 4 && (intruders.length >= 2 || enemyCarrier)) D = 2;
          if (foeScore === ctw - 1) D = Math.max(D, totalSize >= 3 ? 2 : 1);
          if (D > nonCar.length) D = nonCar.length;
        }
      }
      var isDef = false, atkIdx = -1, atkCount = nonCar.length - D;
      for (k = 0; k < nonCar.length; k++) {
        if (nonCar[k].id === you.id) {
          if (k < D) isDef = true;
          else atkIdx = k - D;
        }
      }

      // Rescue designation: attacker closest to the enemy jail.
      var rescuerId = null, bestJ = Infinity;
      if (jailedMates > 0 && !lateWin) {
        var pool = atkCount > 0 ? nonCar.slice(D) :
          (intruders.length === 0 && nonCar.length > 0 ? nonCar : []);
        for (k = 0; k < pool.length; k++) {
          var a = pool[k], m = Infinity;
          for (j = 0; j < jailE.length; j++) {
            var dd = mand(a.x, a.y, jailE[j].x, jailE[j].y);
            if (dd < m) m = dd;
          }
          if (rescuerId === null || m < bestJ ||
              (m === bestJ && String(a.id) < String(rescuerId))) {
            bestJ = m; rescuerId = a.id;
          }
        }
      }
      var iAmRescuer = rescuerId !== null && rescuerId === you.id;

      // Danger set for the suicide filter: foes able to tag (in their half
      // or on the border). Candidates in our half / on border are always safe.
      var dn = 0;
      for (k = 0; k < foes.length && dn < 8; k++) {
        if (isFoeX(foes[k].x, enemy, B) || foes[k].x === B) {
          __scratch.tx[dn] = foes[k].x; __scratch.ty[dn] = foes[k].y; dn++;
        }
      }

      // ---- carrier: run home ----
      if (you.carrying) {
        var mv = astarMove(W, H, walk, you.x, you.y, 1, 0, 0, team, B,
          null, __scratch.tx, __scratch.ty, dn, -1, null);
        return guardMove(W, H, walk, you.x, you.y, mv, 1, 0, 0, team, B,
          null, __scratch.tx, __scratch.ty, dn, null);
      }

      // ---- solo: committed race. The fastest path grabs first and the
      // first carrier wins the mid-map clash, so never turn back to chase;
      // equal-speed pursuit cannot catch up. Only hover vs a real camper.
      if (totalSize === 1) {
        var camperNear = false;
        for (k = 0; k < foes.length; k++) {
          if (isFoeX(foes[k].x, enemy, B) &&
              mand(foes[k].x, foes[k].y, eFH.x, eFH.y) <= 7) {
            camperNear = true; break;
          }
        }
        if (camperNear) {
          // Threaten from safety: hover outside tag range rather than feed.
          var mvS = astarMove(W, H, walk, you.x, you.y, 0, eFH.x, eFH.y, team, B,
            null, __scratch.tx, __scratch.ty, dn, -1, dE);
          return guardMove(W, H, walk, you.x, you.y, mvS, 0, eFH.x, eFH.y, team, B,
            null, __scratch.tx, __scratch.ty, dn, dE);
        }
        return bfsMove(W, H, walk, you.x, you.y, 0, eFH.x, eFH.y, 0, team, B);
      }

      // ---- team defender: defenders[0] holds the flag (radius-limited so
      // decoys cannot pull it away); extra defenders hunt intruders.
      if (isDef) {
        var holder = true, dk;
        for (dk = 0; dk < D && dk < nonCar.length; dk++) {
          if (nonCar[dk].id === you.id) { holder = (dk === 0); break; }
        }
        var chase = null;
        if (enemyCarrier && (isOwnX(enemyCarrier.x, team, B) || enemyCarrier.x === B)) {
          chase = enemyCarrier;
        } else if (!holder) {
          if (intruders.length > 0) chase = intruders[0];
        } else {
          var bi, bd, chaseD = Infinity;
          for (bi = 0; bi < intruders.length; bi++) {
            bd = stepDist(dO, W, intruders[bi].x, intruders[bi].y, oFH);
            if (bd <= 9 && bd < chaseD) { chaseD = bd; chase = intruders[bi]; }
          }
          if (chase === null) {
            var jailO = __apex.jailO, jm = Infinity;
            for (bi = 0; bi < intruders.length; bi++) {
              var m = Infinity, bj2;
              for (bj2 = 0; bj2 < jailO.length; bj2++) {
                bd = mand(intruders[bi].x, intruders[bi].y, jailO[bj2].x, jailO[bj2].y);
                if (bd < m) m = bd;
              }
              if (m <= 4 && m < jm) { jm = m; chase = intruders[bi]; }
            }
          }
        }
        if (chase) {
          return bfsMove(W, H, walk, you.x, you.y, 3, chase.x, chase.y, 1, team, B);
        }
        if (you.x === oFH.x && you.y === oFH.y) return 'stay';
        return bfsMove(W, H, walk, you.x, you.y, 0, oFH.x, oFH.y, 1, team, B);
      }
      // ---- rescuer ----
      if (iAmRescuer) {
        var mvR = astarMove(W, H, walk, you.x, you.y, 2, 0, 0, team, B,
          jailE, __scratch.tx, __scratch.ty, dn, -1, null);
        return guardMove(W, H, walk, you.x, you.y, mvR, 2, 0, 0, team, B,
          jailE, __scratch.tx, __scratch.ty, dn, null);
      }

      // ---- attacker: threat list = campers near flag + foes close to me ----
      var an = 0;
      for (k = 0; k < foes.length && an < 8; k++) {
        var fk = foes[k];
        if (!isFoeX(fk.x, enemy, B) && fk.x !== B) continue;
        if (mand(fk.x, fk.y, eFH.x, eFH.y) <= 8 ||
            mand(fk.x, fk.y, you.x, you.y) <= 4) {
          __scratch.ax[an] = fk.x; __scratch.ay[an] = fk.y; an++;
        }
      }
      var mateCarries = false;
      for (k = 0; k < state.teammates.length; k++) {
        var tm2 = state.teammates[k];
        if (!tm2.jailed && tm2.respawnIn === 0 && tm2.carrying) { mateCarries = true; break; }
      }
      if (mateCarries && you.x === eFH.x && you.y === eFH.y &&
          safeCell(you.x, you.y, team, B, __scratch.tx, __scratch.ty, dn)) {
        return 'stay';
      }
      var biasRow = -1;
      if (atkCount > 1 && atkIdx >= 0) {
        biasRow = Math.round(H * (atkIdx + 1) / (atkCount + 1));
      }
      var mvA = astarMove(W, H, walk, you.x, you.y, 0, eFH.x, eFH.y, team, B,
        null, __scratch.ax, __scratch.ay, an, biasRow, dE);
      return guardMove(W, H, walk, you.x, you.y, mvA, 0, eFH.x, eFH.y, team, B,
        null, __scratch.tx, __scratch.ty, dn, dE);
    } catch (e) {
      return 'stay';
    }
  }
};

// ---------- module-scope helpers (no per-tick allocation) ----------

var __apex = { key: '', walk: null, dE: null, dO: null, eFH: null, oFH: null, jailE: null, jailO: null };
var __scratch = null;

function ensureScratch(N) {
  if (__scratch && __scratch.N >= N) return;
  __scratch = {
    N: N,
    bfsQ: new Int32Array(N),
    bfsPar: new Int32Array(N),
    bfsMark: new Int32Array(N),
    bfsGen: 0,
    aG: new Float64Array(N),
    aF: new Float64Array(N),
    aPar: new Int32Array(N),
    aHeap: [],
    tx: new Int32Array(8),
    ty: new Int32Array(8),
    ax: new Int32Array(8),
    ay: new Int32Array(8)
  };
}

function cmpId(a, b) {
  var sa = String(a.id), sb = String(b.id);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function mand(ax, ay, bx, by) {
  var dx = ax > bx ? ax - bx : bx - ax;
  var dy = ay > by ? ay - by : by - ay;
  return dx + dy;
}

function isOwnX(x, team, B) { return team === 'west' ? x < B : x > B; }
function isFoeX(x, enemy, B) { return enemy === 'west' ? x < B : x > B; }

function stepDist(dArr, W, x, y, p) {
  var d = dArr[y * W + x];
  return d >= 0 ? d : mand(x, y, p.x, p.y);
}

var DIRS = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']];
var DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], stay: [0, 0] };

// goalKind: 0 = cell (gx,gy), 1 = own half, 2 = jail adjacency, 3 = near (gx,gy)<=1
function goalTest(kind, x, y, gx, gy, team, B, jail) {
  if (kind === 0) return x === gx && y === gy;
  if (kind === 1) return isOwnX(x, team, B);
  if (kind === 3) return mand(x, y, gx, gy) <= 1;
  for (var j = 0; j < jail.length; j++) {
    if (mand(x, y, jail[j].x, jail[j].y) <= 1) return true;
  }
  return false;
}

function heurVal(kind, x, y, gx, gy, team, B, jail, dArr, W) {
  if (kind === 0) {
    if (dArr) {
      var d = dArr[y * W + x];
      if (d >= 0) return d;
    }
    return mand(x, y, gx, gy);
  }
  if (kind === 1) {
    if (isOwnX(x, team, B)) return 0;
    return team === 'west' ? (x - B + 1) : (B - x + 1);
  }
  if (kind === 3) {
    var m = mand(x, y, gx, gy);
    return m > 1 ? m - 1 : 0;
  }
  var best = Infinity;
  for (var j = 0; j < jail.length; j++) {
    var dd = mand(x, y, jail[j].x, jail[j].y);
    if (dd < best) best = dd;
  }
  return best === Infinity ? 0 : Math.max(0, best - 1);
}

function actionTo(sx, sy, tx, ty) {
  if (tx === sx + 1) return 'right';
  if (tx === sx - 1) return 'left';
  if (ty === sy + 1) return 'down';
  return 'up';
}

// ownOnly: restrict passable cells to own half (team defense).
function bfsMove(W, H, walk, sx, sy, kind, gx, gy, ownOnly, team, B) {
  if (goalTest(kind, sx, sy, gx, gy, team, B, null)) return 'stay';
  var S = __scratch;
  var gen = ++S.bfsGen;
  var q = S.bfsQ, par = S.bfsPar, mark = S.bfsMark;
  var s = sy * W + sx;
  var head = 0, tail = 0;
  mark[s] = gen; par[s] = s;
  q[tail++] = s;
  var found = -1;
  while (head < tail) {
    var cur = q[head++];
    var cx = cur % W, cy = (cur / W) | 0;
    for (var d = 0; d < 4; d++) {
      var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!walk[ny * W + nx]) continue;
      if (ownOnly && !isOwnX(nx, team, B)) continue;
      var ni = ny * W + nx;
      if (mark[ni] === gen) continue;
      mark[ni] = gen; par[ni] = cur;
      if (goalTest(kind, nx, ny, gx, gy, team, B, null)) { found = ni; head = tail; break; }
      q[tail++] = ni;
    }
  }
  if (found === -1) return 'stay';
  var c = found;
  while (par[c] !== s) c = par[c];
  return actionTo(sx, sy, c % W, (c / W) | 0);
}

function astarMove(W, H, walk, sx, sy, kind, gx, gy, team, B, jail, txs, tys, tn, biasRow, dArr) {
  if (goalTest(kind, sx, sy, gx, gy, team, B, jail)) return 'stay';
  var S = __scratch;
  var g = S.aG, f = S.aF, par = S.aPar, heap = S.aHeap;
  var N = W * H;
  g.fill(Infinity);
  heap.length = 0;
  var s = sy * W + sx;
  var enemy = team === 'west' ? 'east' : 'west';
  g[s] = 0;
  f[s] = heurVal(kind, sx, sy, gx, gy, team, B, jail, dArr, W);
  par[s] = s;
  heap.push(s);
  var found = -1, pops = 0;
  var cap = N * 2;
  while (heap.length > 0) {
    var top = heap[0], last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      var ii = 0;
      for (;;) {
        var l = ii * 2 + 1, r = l + 1, sm = ii;
        if (l < heap.length && f[heap[l]] < f[heap[sm]]) sm = l;
        if (r < heap.length && f[heap[r]] < f[heap[sm]]) sm = r;
        if (sm === ii) break;
        var tmp = heap[ii]; heap[ii] = heap[sm]; heap[sm] = tmp;
        ii = sm;
      }
    }
    var cx = top % W, cy = (top / W) | 0;
    if (goalTest(kind, cx, cy, gx, gy, team, B, jail)) { found = top; break; }
    if (++pops > cap) break;
    var gc = g[top];
    for (var d = 0; d < 4; d++) {
      var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var ni = ny * W + nx;
      if (!walk[ni]) continue;
      var step = 1;
      if (biasRow >= 0) step += 0.3 * (ny > biasRow ? ny - biasRow : biasRow - ny);
      if (tn > 0 && isFoeX(nx, enemy, B)) {
        for (var q = 0; q < tn; q++) {
          var dx = nx > txs[q] ? nx - txs[q] : txs[q] - nx;
          var dy = ny > tys[q] ? ny - tys[q] : tys[q] - ny;
          var dist = dx + dy;
          step += dist <= 1 ? 60 : dist === 2 ? 25 : dist === 3 ? 10 : 0;
        }
      }
      var tent = gc + step;
      if (tent < g[ni]) {
        g[ni] = tent;
        par[ni] = top;
        f[ni] = tent + heurVal(kind, nx, ny, gx, gy, team, B, jail, dArr, W);
        heap.push(ni);
        var ci = heap.length - 1;
        while (ci > 0) {
          var pr = (ci - 1) >> 1;
          if (f[heap[pr]] <= f[heap[ci]]) break;
          var t2 = heap[pr]; heap[pr] = heap[ci]; heap[ci] = t2;
          ci = pr;
        }
      }
    }
  }
  if (found === -1) return 'stay';
  var c = found;
  var guard = N + 5;
  while (par[c] !== s && guard-- > 0) {
    c = par[c];
    if (c < 0) return 'stay';
  }
  if (par[c] !== s) return 'stay';
  return actionTo(sx, sy, c % W, (c / W) | 0);
}

function safeCell(x, y, team, B, txs, tys, tn) {
  if (isOwnX(x, team, B) || x === B) return true;
  for (var q = 0; q < tn; q++) {
    var dx = x > txs[q] ? x - txs[q] : txs[q] - x;
    var dy = y > tys[q] ? y - tys[q] : tys[q] - y;
    if (dx + dy <= 1) return false;
  }
  return true;
}

// Minimal anti-suicide filter: never step next to a live threat unless that
// cell itself is safe (own half / border). Otherwise keep the planned move.
function guardMove(W, H, walk, sx, sy, proposed, kind, gx, gy, team, B, jail, txs, tys, tn, dArr) {
  if (proposed === 'stay') return 'stay';
  var dd = DELTA[proposed];
  var px = sx + dd[0], py = sy + dd[1];
  if (safeCell(px, py, team, B, txs, tys, tn)) return proposed;
  var best = null, bestH = Infinity;
  var cands = ['up', 'down', 'left', 'right', 'stay'];
  for (var i = 0; i < cands.length; i++) {
    var d2 = DELTA[cands[i]];
    var nx = sx + d2[0], ny = sy + d2[1];
    if (cands[i] !== 'stay') {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !walk[ny * W + nx]) continue;
    }
    if (!safeCell(nx, ny, team, B, txs, tys, tn)) continue;
    var h = heurVal(kind, nx, ny, gx, gy, team, B, jail, dArr, W);
    if (h < bestH) { bestH = h; best = cands[i]; }
  }
  return best === null ? proposed : best;
}

function ensureCache(state, W, H, B, team, enemy) {
  var grid = state.grid, h = 0, y, x;
  for (y = 0; y < H; y++) {
    var row = grid[y];
    for (x = 0; x < row.length; x++) h = (((h * 33) ^ row.charCodeAt(x)) >>> 0);
  }
  var key = W + 'x' + H + '|' + B + '|' + team + '|' + h;
  if (__apex.key === key) return;
  var walk = new Uint8Array(W * H);
  for (y = 0; y < H; y++) {
    var r = grid[y];
    for (x = 0; x < W; x++) walk[y * W + x] = r[x] === '.' ? 1 : 0;
  }
  __apex.walk = walk;
  __apex.eFH = { x: state.flags[enemy].home.x, y: state.flags[enemy].home.y };
  __apex.oFH = { x: state.flags[team].home.x, y: state.flags[team].home.y };
  __apex.jailE = state.zones[enemy].jail.map(function (p) { return { x: p.x, y: p.y }; });
  __apex.jailO = state.zones[team].jail.map(function (p) { return { x: p.x, y: p.y }; });
  __apex.dE = bfsDist(walk, W, H, __apex.eFH.x, __apex.eFH.y);
  __apex.dO = bfsDist(walk, W, H, __apex.oFH.x, __apex.oFH.y);
  __apex.key = key;
}

function bfsDist(walk, W, H, tx, ty) {
  var N = W * H;
  var d = new Int32Array(N).fill(-1);
  var q = new Int32Array(N);
  var head = 0, tail = 0;
  d[ty * W + tx] = 0;
  q[tail++] = ty * W + tx;
  while (head < tail) {
    var cur = q[head++];
    var cx = cur % W, cy = (cur / W) | 0;
    var nd = d[cur] + 1;
    if (cx + 1 < W && walk[cur + 1] && d[cur + 1] < 0) { d[cur + 1] = nd; q[tail++] = cur + 1; }
    if (cx - 1 >= 0 && walk[cur - 1] && d[cur - 1] < 0) { d[cur - 1] = nd; q[tail++] = cur - 1; }
    if (cy + 1 < H && walk[cur + W] && d[cur + W] < 0) { d[cur + W] = nd; q[tail++] = cur + W; }
    if (cy - 1 >= 0 && walk[cur - W] && d[cur - W] < 0) { d[cur - W] = nd; q[tail++] = cur - W; }
  }
  return d;
}
