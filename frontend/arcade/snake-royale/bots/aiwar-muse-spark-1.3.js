'use strict';
// ApexConstrictor: 2-ply simultaneous-move minimax (duels) / 1-ply paranoid (royales)
// + exact engine simulation + flood-fill space + Voronoi territory + food urgency
// + head-on discipline + storm foresight. Sync, dependency-free, fast.
var GB_START_HEALTH = 100;

function move(state) {
  try {
    return decide(state);
  } catch (e) {
    return lastResort(state);
  }
}

var DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 }
];

function lastResort(state) {
  try {
    var me = state.you, W = state.width, H = state.height;
    var occ = {};
    for (var i = 0; i < state.snakes.length; i++) {
      var b = state.snakes[i].body;
      for (var k = 0; k < b.length; k++) occ[b[k].x + ',' + b[k].y] = 1;
    }
    var hz = {};
    var hzz = state.hazards || [];
    for (var h = 0; h < hzz.length; h++) hz[hzz[h].x + ',' + hzz[h].y] = 1;
    for (var d = 0; d < 4; d++) {
      var nx = me.head.x + DIRS[d].dx, ny = me.head.y + DIRS[d].dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (hz[nx + ',' + ny]) continue;
      if (occ[nx + ',' + ny]) continue;
      return DIRS[d].name;
    }
  } catch (e2) {}
  return 'up';
}

function decide(state) {
  var W = state.width, H = state.height, N = W * H;
  var turn = state.turn || 1;
  var me = state.you;
  if (!me || !me.body || !me.body.length) return 'up';
  if (turn <= 1) GB_START_HEALTH = me.health || 100;
  var START_HEALTH = GB_START_HEALTH;
  var myId = me.id;
  var rivals = [];
  var all = state.snakes || [];
  for (var i = 0; i < all.length; i++) if (all[i].id !== myId) rivals.push(all[i]);
  var foods = state.food || [];
  var hzz = state.hazards || [];
  var nextShrink = (typeof state.nextShrinkTurn === 'number') ? state.nextShrinkTurn : 1e9;
  var duel = (rivals.length === 1);

  var hzGrid = new Uint8Array(N);
  for (var h = 0; h < hzz.length; h++) {
    var hx = hzz[h].x, hy = hzz[h].y;
    if (hx >= 0 && hy >= 0 && hx < W && hy < H) hzGrid[hy * W + hx] = 1;
  }
  var ring = 0;
  while (ring < W && ring < H && hzGrid[ring * W + ring]) ring++;
  var turnsToShrink = nextShrink - turn;

  var foodGrid = new Uint8Array(N);
  for (var f = 0; f < foods.length; f++) {
    var fx = foods[f].x, fy = foods[f].y;
    if (fx >= 0 && fy >= 0 && fx < W && fy >= 0 && fy < H) foodGrid[fy * W + fx] = 1;
  }

  function candMoves(head, eatGrid) {
    var out = [];
    for (var d = 0; d < 4; d++) {
      var nx = head.x + DIRS[d].dx, ny = head.y + DIRS[d].dy;
      var wall = (nx < 0 || ny < 0 || nx >= W || ny >= H);
      var hz = (!wall && hzGrid[ny * W + nx]) ? 1 : 0;
      var eat = (!wall && eatGrid[ny * W + nx]) ? 1 : 0;
      out.push({ dir: d, name: DIRS[d].name, x: nx, y: ny, wall: wall, hz: hz, eat: eat });
    }
    return out;
  }
  function saneMoves(cands) {
    var s = [];
    for (var m = 0; m < cands.length; m++) if (!cands[m].wall && !cands[m].hz) s.push(cands[m]);
    return s.length ? s : cands;
  }

  var myCands = candMoves(me.head, foodGrid);
  var oppCands = [];
  for (var r = 0; r < rivals.length; r++) oppCands.push(candMoves(rivals[r].head, foodGrid));
  var oppMoves = [];
  for (var o = 0; o < rivals.length; o++) oppMoves.push(saneMoves(oppCands[o]));

  var modeled = [], fixed = [];
  if (rivals.length <= 2) {
    for (var q = 0; q < rivals.length; q++) modeled.push(q);
  } else {
    var order = [];
    for (var q2 = 0; q2 < rivals.length; q2++) {
      order.push({ i: q2, d: Math.abs(rivals[q2].head.x - me.head.x) + Math.abs(rivals[q2].head.y - me.head.y) });
    }
    order.sort(function (a, b) { return a.d - b.d; });
    modeled = [order[0].i, order[1].i];
    for (var q3 = 2; q3 < order.length; q3++) fixed.push(order[q3].i);
  }
  var fixedChoice = {};
  for (var fi = 0; fi < fixed.length; fi++) {
    var ri = fixed[fi];
    var bestM = oppMoves[ri][0], bestS = -1e18;
    for (var mi = 0; mi < oppMoves[ri].length; mi++) {
      var cm = oppMoves[ri][mi];
      var s = 0;
      for (var ff = 0; ff < foods.length; ff++) {
        s += 10 / (1 + Math.abs(foods[ff].x - cm.x) + Math.abs(foods[ff].y - cm.y));
      }
      s -= (Math.abs(cm.x - (W - 1) / 2) + Math.abs(cm.y - (H - 1) / 2)) * 0.1;
      if (s > bestS) { bestS = s; bestM = cm; }
    }
    fixedChoice[ri] = bestM;
  }

  var qbuf = new Int32Array(N);
  var distM = new Int32Array(N);
  var distO = new Int32Array(N);

  function bfsSingle(blocked, sx, sy, dist) {
    for (var i = 0; i < N; i++) dist[i] = -1;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return 0;
    var s0 = sy * W + sx;
    if (blocked[s0]) return 0;
    var qh = 0, qt = 0, cnt = 0;
    dist[s0] = 0; qbuf[qt++] = s0; cnt++;
    while (qh < qt) {
      var cur = qbuf[qh++];
      var cx = cur % W, cy = (cur - cx) / W;
      var nd = dist[cur] + 1;
      if (cx + 1 < W) { var j0 = cur + 1; if (!blocked[j0] && dist[j0] < 0) { dist[j0] = nd; qbuf[qt++] = j0; cnt++; } }
      if (cx - 1 >= 0) { var j1 = cur - 1; if (!blocked[j1] && dist[j1] < 0) { dist[j1] = nd; qbuf[qt++] = j1; cnt++; } }
      if (cy + 1 < H) { var j2 = cur + W; if (!blocked[j2] && dist[j2] < 0) { dist[j2] = nd; qbuf[qt++] = j2; cnt++; } }
      if (cy - 1 >= 0) { var j3 = cur - W; if (!blocked[j3] && dist[j3] < 0) { dist[j3] = nd; qbuf[qt++] = j3; cnt++; } }
    }
    return cnt;
  }

  function bfsMulti(blocked, heads, dist) {
    for (var i = 0; i < N; i++) dist[i] = -1;
    var qh = 0, qt = 0;
    for (var k = 0; k < heads.length; k++) {
      var hx = heads[k].x, hy = heads[k].y;
      if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
      var s0 = hy * W + hx;
      if (blocked[s0] || dist[s0] >= 0) continue;
      dist[s0] = 0; qbuf[qt++] = s0;
    }
    while (qh < qt) {
      var cur = qbuf[qh++];
      var cx = cur % W, cy = (cur - cx) / W;
      var nd = dist[cur] + 1;
      if (cx + 1 < W) { var j0 = cur + 1; if (!blocked[j0] && dist[j0] < 0) { dist[j0] = nd; qbuf[qt++] = j0; } }
      if (cx - 1 >= 0) { var j1 = cur - 1; if (!blocked[j1] && dist[j1] < 0) { dist[j1] = nd; qbuf[qt++] = j1; } }
      if (cy + 1 < H) { var j2 = cur + W; if (!blocked[j2] && dist[j2] < 0) { dist[j2] = nd; qbuf[qt++] = j2; } }
      if (cy - 1 >= 0) { var j3 = cur - W; if (!blocked[j3] && dist[j3] < 0) { dist[j3] = nd; qbuf[qt++] = j3; } }
    }
  }

  // General exact simulator. snakesArr: [{head:{x,y}, body:[{x,y}], health}], movesArr: cand moves.
  // eatGrid: Uint8Array of food available this turn. Returns sim object.
  function simulateTurn(snakesArr, movesArr, eatGrid) {
    var P = snakesArr.length;
    var nHeads = new Array(P), nHealth = new Array(P), nLen = new Array(P), nBody = new Array(P);
    var ate = new Array(P);
    for (var p = 0; p < P; p++) {
      var sn = snakesArr[p], mv = movesArr[p];
      var nx = sn.head.x + DIRS[mv.dir].dx, ny = sn.head.y + DIRS[mv.dir].dy;
      nHeads[p] = { x: nx, y: ny };
      var e = (!mv.wall && nx >= 0 && ny >= 0 && nx < W && ny < H && eatGrid[ny * W + nx]) ? 1 : 0;
      ate[p] = e;
      nHealth[p] = e ? START_HEALTH : (sn.health - 1);
      nLen[p] = sn.body.length + (e ? 1 : 0);
      var oldB = sn.body, oldL = oldB.length;
      var keep = e ? oldL : oldL - 1;
      if (keep < 0) keep = 0;
      var nb = new Array(keep + 1);
      nb[0] = { x: nx, y: ny };
      for (var k = 0; k < keep; k++) nb[k + 1] = { x: oldB[k].x, y: oldB[k].y };
      nBody[p] = nb;
    }
    var dead = new Array(P), cause = new Array(P);
    for (var d = 0; d < P; d++) { dead[d] = false; cause[d] = null; }
    for (var a = 0; a < P; a++) {
      var hx2 = nHeads[a].x, hy2 = nHeads[a].y;
      if (hx2 < 0 || hy2 < 0 || hx2 >= W || hy2 >= H) { dead[a] = true; cause[a] = 'wall'; continue; }
      if (hx2 >= 0 && hy2 >= 0 && hx2 < W && hy2 < H && hzGrid[hy2 * W + hx2]) { dead[a] = true; cause[a] = 'storm'; continue; }
      if (nHealth[a] <= 0) { dead[a] = true; cause[a] = 'starved'; continue; }
    }
    for (var b2 = 0; b2 < P; b2++) {
      if (dead[b2]) continue;
      var hx3 = nHeads[b2].x, hy3 = nHeads[b2].y;
      var hit = false;
      for (var t = 0; t < P && !hit; t++) {
        var tb = nBody[t];
        for (var k2 = 1; k2 < tb.length; k2++) {
          if (tb[k2].x === hx3 && tb[k2].y === hy3) { dead[b2] = true; cause[b2] = (t === b2) ? 'self' : 'body'; hit = true; break; }
        }
      }
    }
    for (var c = 0; c < P; c++) {
      if (dead[c]) continue;
      for (var t2 = 0; t2 < P; t2++) {
        if (t2 === c) continue;
        if (nHeads[t2].x === nHeads[c].x && nHeads[t2].y === nHeads[c].y && nLen[t2] >= nLen[c]) {
          dead[c] = true; cause[c] = 'head-on'; break;
        }
      }
    }
    return { nHeads: nHeads, nHealth: nHealth, nLen: nLen, nBody: nBody, ate: ate, dead: dead, cause: cause };
  }

  function remainingFoodGrid(eatenSims) {
    // eatenSims: array of sims whose ate/heads mark consumed cells
    var g = new Uint8Array(N);
    for (var i = 0; i < N; i++) g[i] = foodGrid[i];
    for (var s = 0; s < eatenSims.length; s++) {
      var sim = eatenSims[s];
      for (var p = 0; p < sim.ate.length; p++) {
        if (sim.ate[p]) {
          var hx = sim.nHeads[p].x, hy = sim.nHeads[p].y;
          if (hx >= 0 && hy >= 0 && hx < W && hy < H) g[hy * W + hx] = 0;
        }
      }
    }
    return g;
  }

  // Terminal check shared by ply1/ply2. Returns score or null if non-terminal.
  // nRivals = number of rivals modeled in this sim (for duel: 1).
  function terminalScore(sim, myMvEat, preLen, preHealth, bestOppPreLen) {
    var nR = sim.dead.length - 1;
    var myDead = sim.dead[0];
    var aliveCount = 0, bestOppLen = 0, deadCount = 0;
    for (var o = 0; o < nR; o++) {
      if (sim.dead[o + 1]) deadCount++;
      else aliveCount++;
      if (sim.nLen[o + 1] > bestOppLen) bestOppLen = sim.nLen[o + 1];
    }
    var myLen = sim.nLen[0];
    if (myDead) {
      if (aliveCount === 0 && nR > 0) {
        if (myLen > bestOppLen) return 90000 + (myLen - bestOppLen) * 500;
        if (myLen === bestOppLen) return -3000;
        return -100000 + (myLen - bestOppLen) * 8;
      }
      return -100000 + myLen * 8 - bestOppLen * 8 + deadCount * 2000;
    }
    if (nR > 0 && aliveCount === 0) return 100000 + myLen * 10 + sim.nHealth[0];
    return null;
  }

  function positionalScore(sim, myMvEat, preLen, preHealth) {
    var nR = sim.dead.length - 1;
    var oppAliveIdx = [];
    for (var o = 0; o < nR; o++) if (!sim.dead[o + 1]) oppAliveIdx.push(o);
    var myLen = sim.nLen[0];
    var bestOppLen = 0;
    for (var o2 = 0; o2 < nR; o2++) if (sim.nLen[o2 + 1] > bestOppLen) bestOppLen = sim.nLen[o2 + 1];

    var blocked = new Uint8Array(N);
    for (var i = 0; i < N; i++) if (hzGrid[i]) blocked[i] = 1;
    for (var p = 0; p < sim.nBody.length; p++) {
      var bd = sim.nBody[p];
      for (var k = 0; k < bd.length; k++) {
        var bx = bd[k].x, by = bd[k].y;
        if (bx >= 0 && by >= 0 && bx < W && by < H) blocked[by * W + bx] = 1;
      }
    }
    var mh = sim.nHeads[0];
    if (mh.x < 0 || mh.y < 0 || mh.x >= W || mh.y >= H) return -95000;
    blocked[mh.y * W + mh.x] = 0;
    var oppHeads = [];
    for (var oi = 0; oi < oppAliveIdx.length; oi++) {
      var oh = sim.nHeads[oppAliveIdx[oi] + 1];
      oppHeads.push(oh);
      if (oh.x >= 0 && oh.y >= 0 && oh.x < W && oh.y < H) blocked[oh.y * W + oh.x] = 0;
    }

    var reach = bfsSingle(blocked, mh.x, mh.y, distM);
    bfsMulti(blocked, oppHeads, distO);

    var territory = 0;
    for (var fi2 = 0; fi2 < N; fi2++) {
      if (distM[fi2] < 0) continue;
      if (distO[fi2] < 0 || distM[fi2] < distO[fi2]) territory++;
    }
    var eatenCells = {};
    for (var ap = 0; ap < sim.ate.length; ap++) {
      if (sim.ate[ap]) eatenCells[sim.nHeads[ap].x + ',' + sim.nHeads[ap].y] = 1;
    }
    var fBest = 1e9;
    for (var f3 = 0; f3 < foods.length; f3++) {
      var fcx = foods[f3].x, fcy = foods[f3].y;
      if (eatenCells[fcx + ',' + fcy]) continue;
      if (fcx < 0 || fcy < 0 || fcx >= W || fcy >= H) continue;
      var fi3 = fcy * W + fcx;
      if (distM[fi3] >= 0 && distM[fi3] < fBest) fBest = distM[fi3];
    }
    var foodDist = (fBest === 1e9) ? -1 : fBest;

    var mob = 0;
    if (mh.x + 1 < W && !blocked[mh.y * W + mh.x + 1]) mob++;
    if (mh.x - 1 >= 0 && !blocked[mh.y * W + mh.x - 1]) mob++;
    if (mh.y + 1 < H && !blocked[(mh.y + 1) * W + mh.x]) mob++;
    if (mh.y - 1 >= 0 && !blocked[(mh.y - 1) * W + mh.x]) mob++;

    var score = 0;
    if (reach < myLen) score -= 6000 + (myLen - reach) * 120;
    if (mob === 0) score -= 4000;
    score += Math.min(reach, 90) * 2.2;
    score += territory * 7;
    score += mob * 6;
    score += (myLen - bestOppLen) * 22;
    score += sim.nHealth[0] * 0.6;

    var health = sim.nHealth[0];
    if (myMvEat) score += (preHealth > 60 && preLen > bestOppLen) ? 40 : 150;
    if (foodDist >= 0) {
      var urgency;
      if (health <= 20) urgency = 40;
      else if (health <= 40) urgency = 14;
      else if (myLen <= bestOppLen) urgency = 8;
      else urgency = 3;
      if (foodDist < health) score += urgency * 26 / (foodDist + 1);
      else score -= 600;
    } else {
      if (health < 35) score -= 800;
    }

    for (var ai = 0; ai < oppAliveIdx.length; ai++) {
      var oh2 = sim.nHeads[oppAliveIdx[ai] + 1];
      var man = Math.abs(oh2.x - mh.x) + Math.abs(oh2.y - mh.y);
      var ol = sim.nLen[oppAliveIdx[ai] + 1];
      if (man === 1) {
        if (ol >= myLen) score -= (mob >= 3 ? 220 : mob === 2 ? 420 : 900);
        else score += 170;
      } else if (man === 0) {
        score += (myLen > ol ? 5000 : -5000);
      }
    }

    var edge = Math.min(mh.x, mh.y, W - 1 - mh.x, H - 1 - mh.y);
    if (ring > 0 || turn >= 110) {
      var cx = (W - 1) / 2, cy = (H - 1) / 2;
      score -= (Math.abs(mh.x - cx) + Math.abs(mh.y - cy)) * (turn >= 130 ? 3 : 1.6);
      if (edge === ring) {
        if (turnsToShrink <= 3) score -= 4000;
        else if (turnsToShrink <= 10) score -= 1200;
        else if (turnsToShrink <= 25) score -= 200;
      } else if (edge === ring + 1 && turnsToShrink <= 10) {
        score -= 150;
      }
    } else {
      var cx0 = (W - 1) / 2, cy0 = (H - 1) / 2;
      score -= (Math.abs(mh.x - cx0) + Math.abs(mh.y - cy0)) * 0.35;
    }
    if (edge === 0 && ring === 0 && turnsToShrink <= 12) score -= 150;

    return score;
  }

  function fullScore(sim, myMvEat, preLen, preHealth) {
    var t = terminalScore(sim, myMvEat, preLen, preHealth, 0);
    if (t !== null) return t;
    return positionalScore(sim, myMvEat, preLen, preHealth);
  }

  // --- 2nd ply for duels: after sim1 (both alive), max over my replies of min over opp replies ---
  function secondPly(sim1) {
    var snakes2 = [
      { head: sim1.nHeads[0], body: sim1.nBody[0], health: sim1.nHealth[0] },
      { head: sim1.nHeads[1], body: sim1.nBody[1], health: sim1.nHealth[1] }
    ];
    var fg2 = remainingFoodGrid([sim1]);
    var my2 = saneMoves(candMoves(snakes2[0].head, fg2));
    var op2 = saneMoves(candMoves(snakes2[1].head, fg2));
    var preLen = sim1.nLen[0], preH = sim1.nHealth[0];
    var best = -Infinity;
    for (var a = 0; a < my2.length; a++) {
      var worst = Infinity;
      for (var b = 0; b < op2.length; b++) {
        var sim2 = simulateTurn(snakes2, [my2[a], op2[b]], fg2);
        var v = fullScore(sim2, my2[a].eat ? 1 : 0, preLen, preH);
        if (v < worst) worst = v;
        if (worst < best) break;
      }
      if (worst > best) best = worst;
    }
    return best;
  }

  // --- top-level minimax ---
  var nModeled = modeled.length;
  var oppLists = [];
  for (var mi2 = 0; mi2 < nModeled; mi2++) oppLists.push(oppMoves[modeled[mi2]]);

  var bestMoveName = null, bestVal = -Infinity;
  var myOrder = myCands.slice(0);
  myOrder.sort(function (a, b) {
    var sa = (!a.wall && !a.hz) ? 10 : -1000;
    var sb = (!b.wall && !b.hz) ? 10 : -1000;
    return sb - sa;
  });

  var baseSnakes = [me].concat(rivals);

  function worstCase(myMv) {
    var base = new Array(rivals.length);
    for (var o = 0; o < rivals.length; o++) base[o] = null;
    for (var fk = 0; fk < fixed.length; fk++) base[fixed[fk]] = fixedChoice[fixed[fk]];
    var total = 1;
    for (var c = 0; c < oppLists.length; c++) total *= oppLists[c].length;
    if (total > 64) total = 64;
    var worst = Infinity;
    for (var t = 0; t < total; t++) {
      var tmp = t;
      var reply = base.slice(0);
      for (var d2 = 0; d2 < nModeled; d2++) {
        var li = tmp % oppLists[d2].length;
        tmp = Math.floor(tmp / oppLists[d2].length);
        reply[modeled[d2]] = oppLists[d2][li];
      }
      for (var o2 = 0; o2 < rivals.length; o2++) {
        if (!reply[o2]) reply[o2] = oppMoves[o2][0];
      }
      var sim = simulateTurn(baseSnakes, [myMv].concat(reply), foodGrid);
      var term = terminalScore(sim, myMv.eat ? 1 : 0, me.body.length, me.health, 0);
      var v;
      if (term !== null) {
        v = term;
      } else if (duel) {
        v = secondPly(sim);
      } else {
        v = positionalScore(sim, myMv.eat ? 1 : 0, me.body.length, me.health);
      }
      if (v < worst) worst = v;
      if (worst < bestVal) break;
    }
    return worst;
  }

  for (var mi3 = 0; mi3 < myOrder.length; mi3++) {
    var mv = myOrder[mi3];
    var wv;
    if (mv.wall || mv.hz) {
      wv = -90000 + (mv.hz ? 0 : -5000);
      var rep0 = [];
      for (var o3 = 0; o3 < rivals.length; o3++) rep0.push(oppMoves[o3][0]);
      var s0 = simulateTurn(baseSnakes, [mv].concat(rep0), foodGrid);
      wv += fullScore(s0, mv.eat ? 1 : 0, me.body.length, me.health) * 0.001;
    } else {
      wv = worstCase(mv);
    }
    if (wv > bestVal) { bestVal = wv; bestMoveName = mv.name; }
  }

  if (bestMoveName) return bestMoveName;
  return lastResort(state);
}

module.exports = { move: move, name: 'ApexConstrictor' };
