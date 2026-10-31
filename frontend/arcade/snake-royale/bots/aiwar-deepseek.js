'use strict';
// Snake Royale bot: joint-move adversarial search with flood-fill territory control.
(function () {
  var DIRS = [
    { name: 'up', dx: 0, dy: -1 },
    { name: 'down', dx: 0, dy: 1 },
    { name: 'left', dx: -1, dy: 0 },
    { name: 'right', dx: 1, dy: 0 }
  ];
  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var INF = 1e9;
  var BIG = 1e8;

  // Persistent learning across turns (worker module variables survive).
  var learned = { shrinkEvery: 20, startHealth: 100, lastNextShrink: null, lastHealth: null };

  function inB(x, y, W, H) { return x >= 0 && y >= 0 && x < W && y < H; }
  function inHaz(x, y, ring, W, H) {
    return ring > 0 && (x < ring || y < ring || x >= W - ring || y >= H - ring);
  }

  function ringFromHazards(hz, W, H) {
    var r = 0;
    for (var i = 0; i < hz.length; i++) {
      var m = Math.min(hz[i].x, hz[i].y, W - 1 - hz[i].x, H - 1 - hz[i].y);
      if (m + 1 > r) r = m + 1;
    }
    return r;
  }

  // Compact internal state used by the search.
  function makeState(state) {
    var W = state.width, H = state.height;
    var snakes = [];
    for (var i = 0; i < state.snakes.length; i++) {
      var s = state.snakes[i];
      var body = [];
      for (var k = 0; k < s.body.length; k++) body.push([s.body[k].x, s.body[k].y]);
      snakes.push({ id: s.id, body: body, health: s.health });
    }
    var food = [];
    for (var f = 0; f < state.food.length; f++) food.push([state.food[f].x, state.food[f].y]);
    var ring = ringFromHazards(state.hazards || [], W, H);
    var nextShrink = typeof state.nextShrinkTurn === 'number' ? state.nextShrinkTurn : INF;

    // Reset learned state at the start of each game so series play is deterministic.
    if (state.turn <= 1) {
      learned.shrinkEvery = 20; learned.startHealth = 100;
      learned.lastNextShrink = null; learned.lastHealth = null;
    }

    // Learn option details from observations.
    if (learned.lastNextShrink !== null && nextShrink > learned.lastNextShrink) {
      var d = nextShrink - learned.lastNextShrink;
      if (d > 0 && d < 1000) learned.shrinkEvery = d;
    }
    learned.lastNextShrink = nextShrink;
    var hp = state.you ? state.you.health : null;
    if (hp !== null && learned.lastHealth !== null && hp > learned.lastHealth) {
      learned.startHealth = hp;
    }
    learned.lastHealth = hp;

    return {
      W: W, H: H, turn: state.turn, ring: ring, nextShrink: nextShrink,
      shrinkEvery: learned.shrinkEvery, startHealth: learned.startHealth,
      snakes: snakes, food: food
    };
  }

  function cloneState(cs) {
    var snakes = [];
    for (var i = 0; i < cs.snakes.length; i++) {
      var s = cs.snakes[i];
      var body = [];
      for (var k = 0; k < s.body.length; k++) body.push([s.body[k][0], s.body[k][1]]);
      snakes.push({ id: s.id, body: body, health: s.health });
    }
    var food = [];
    for (var f = 0; f < cs.food.length; f++) food.push([cs.food[f][0], cs.food[f][1]]);
    return {
      W: cs.W, H: cs.H, turn: cs.turn, ring: cs.ring, nextShrink: cs.nextShrink,
      shrinkEvery: cs.shrinkEvery, startHealth: cs.startHealth,
      snakes: snakes, food: food
    };
  }

  // Simulate one simultaneous turn for all snakes. Returns the resulting compact state
  // plus death info and post-move bodies (including dead snakes).
  function simulate(cs, moves) {
    var W = cs.W, H = cs.H;
    var snakes = [];
    var i, k;
    for (i = 0; i < cs.snakes.length; i++) {
      var s = cs.snakes[i];
      var body = [];
      for (k = 0; k < s.body.length; k++) body.push([s.body[k][0], s.body[k][1]]);
      snakes.push({ id: s.id, body: body, health: s.health, ate: false, head: body[0] });
    }
    var foods = [];
    for (i = 0; i < cs.food.length; i++) foods.push([cs.food[i][0], cs.food[i][1]]);

    // 1-2. move heads and decrement health
    for (i = 0; i < snakes.length; i++) {
      var sn = snakes[i];
      var dir = moves[sn.id] || 'up';
      var v = DIRV[dir] || DIRV.up;
      var nh = [sn.body[0][0] + v[0], sn.body[0][1] + v[1]];
      sn.body.unshift(nh);
      sn.head = nh;
      sn.health -= 1;
    }
    // 3-5. food / tails
    for (i = 0; i < snakes.length; i++) {
      var s2 = snakes[i];
      var hx = s2.head[0], hy = s2.head[1];
      var found = false;
      for (k = 0; k < foods.length; k++) {
        if (foods[k][0] === hx && foods[k][1] === hy) { found = true; break; }
      }
      if (found) { s2.health = cs.startHealth; s2.ate = true; }
      else s2.body.pop();
    }
    // 6. remove eaten food entries
    var eaten = {};
    for (i = 0; i < snakes.length; i++) {
      if (!snakes[i].ate) continue;
      var ex = snakes[i].head[0], ey = snakes[i].head[1];
      for (k = 0; k < foods.length; k++) {
        if (foods[k][0] === ex && foods[k][1] === ey) { eaten[k] = true; break; }
      }
    }
    var foodAfter = [];
    for (k = 0; k < foods.length; k++) if (!eaten[k]) foodAfter.push(foods[k]);

    // 7. eliminations (all snakes that started this pass participate)
    var deadIds = {};
    var deadCount = 0;
    for (i = 0; i < snakes.length; i++) {
      var s3 = snakes[i];
      var hx3 = s3.head[0], hy3 = s3.head[1];
      var cause = null;
      if (!inB(hx3, hy3, W, H)) cause = 'wall';
      else if (inHaz(hx3, hy3, cs.ring, W, H)) cause = 'storm';
      else if (s3.health <= 0) cause = 'starved';
      if (!cause) {
        for (var ti = 0; ti < snakes.length && !cause; ti++) {
          var t = snakes[ti];
          for (k = 1; k < t.body.length; k++) {
            if (t.body[k][0] === hx3 && t.body[k][1] === hy3) { cause = 'body'; break; }
          }
        }
      }
      if (!cause) {
        for (var oi = 0; oi < snakes.length; oi++) {
          var o = snakes[oi];
          if (o.id === s3.id) continue;
          if (o.head[0] === hx3 && o.head[1] === hy3 && o.body.length >= s3.body.length) {
            cause = 'head-on'; break;
          }
        }
      }
      if (cause) { deadIds[s3.id] = true; deadCount++; }
    }

    // 9. storm expansion
    var ring = cs.ring;
    var cap = Math.floor(Math.min(W, H) / 2) - 1;
    var nextShrink = cs.nextShrink;
    if (cs.nextShrink === cs.turn && ring < cap) ring++;
    if (cs.nextShrink === cs.turn) nextShrink = cs.turn + cs.shrinkEvery;

    var finalFood = [];
    for (k = 0; k < foodAfter.length; k++) {
      if (!inHaz(foodAfter[k][0], foodAfter[k][1], ring, W, H)) finalFood.push(foodAfter[k]);
    }

    var living = [];
    for (i = 0; i < snakes.length; i++) {
      if (!deadIds[snakes[i].id]) {
        living.push({ id: snakes[i].id, body: snakes[i].body, health: snakes[i].health, ate: snakes[i].ate });
      }
    }
    return {
      W: W, H: H, turn: cs.turn + 1, ring: ring, nextShrink: nextShrink,
      shrinkEvery: cs.shrinkEvery, startHealth: cs.startHealth,
      snakes: living, food: finalFood, deadIds: deadIds, all: snakes, deadCount: deadCount
    };
  }

  function bodyLen(all, id) {
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].body.length;
    return 0;
  }

  var scratchN = 0;
  var sHardA = null, sHardB = null;
  var sDistA = null, sDistB = null, sDistC = null;
  var sQueue = null;

  function ensureScratch(N) {
    if (N <= scratchN) return;
    scratchN = N;
    sHardA = new Uint8Array(N);
    sHardB = new Uint8Array(N);
    sDistA = new Int32Array(N);
    sDistB = new Int32Array(N);
    sDistC = new Int32Array(N);
    sQueue = new Int32Array(N);
  }

  function buildBlockedInto(cs, tailsFree, hard) {
    var W = cs.W, H = cs.H;
    hard.fill(0);
    var i, k;
    for (i = 0; i < cs.snakes.length; i++) {
      var b = cs.snakes[i].body;
      for (k = 0; k < b.length; k++) {
        if (tailsFree && k === b.length - 1 && b.length > 1) continue;
        var x = b[k][0], y = b[k][1];
        if (inB(x, y, W, H)) hard[y * W + x] = 1;
      }
    }
    for (var yy = 0; yy < H; yy++) {
      for (var xx = 0; xx < W; xx++) {
        if (inHaz(xx, yy, cs.ring, W, H)) hard[yy * W + xx] = 1;
      }
    }
  }

  function floodFromInto(hard, W, H, sx, sy, dist, q) {
    var N = W * H;
    dist.fill(-1);
    if (!inB(sx, sy, W, H)) return dist;
    var qh = 0, qt = 0;
    var si = sy * W + sx;
    dist[si] = 0;
    q[qt++] = si;
    while (qh < qt) {
      var idx = q[qh++];
      var x2 = idx % W, y2 = (idx - x2) / W;
      var d = dist[idx] + 1;
      if (x2 > 0) { var j = idx - 1; if (!hard[j] && dist[j] < 0) { dist[j] = d; q[qt++] = j; } }
      if (x2 < W - 1) { var j2 = idx + 1; if (!hard[j2] && dist[j2] < 0) { dist[j2] = d; q[qt++] = j2; } }
      if (y2 > 0) { var j3 = idx - W; if (!hard[j3] && dist[j3] < 0) { dist[j3] = d; q[qt++] = j3; } }
      if (y2 < H - 1) { var j4 = idx + W; if (!hard[j4] && dist[j4] < 0) { dist[j4] = d; q[qt++] = j4; } }
    }
    return dist;
  }

  function floodMultiInto(hard, W, H, sources, dist, q) {
    var N = W * H;
    dist.fill(-1);
    var qh = 0, qt = 0, i;
    for (i = 0; i < sources.length; i++) {
      var x = sources[i][0], y = sources[i][1];
      if (!inB(x, y, W, H)) continue;
      var si = y * W + x;
      if (dist[si] >= 0) continue;
      dist[si] = 0;
      q[qt++] = si;
    }
    while (qh < qt) {
      var idx = q[qh++];
      var x2 = idx % W, y2 = (idx - x2) / W;
      var d = dist[idx] + 1;
      if (x2 > 0) { var j = idx - 1; if (!hard[j] && dist[j] < 0) { dist[j] = d; q[qt++] = j; } }
      if (x2 < W - 1) { var j2 = idx + 1; if (!hard[j2] && dist[j2] < 0) { dist[j2] = d; q[qt++] = j2; } }
      if (y2 > 0) { var j3 = idx - W; if (!hard[j3] && dist[j3] < 0) { dist[j3] = d; q[qt++] = j3; } }
      if (y2 < H - 1) { var j4 = idx + W; if (!hard[j4] && dist[j4] < 0) { dist[j4] = d; q[qt++] = j4; } }
    }
    return dist;
  }

  function evalMetrics(cs, meId) {
    var W = cs.W, H = cs.H, N = W * H;
    var me = null, opps = [], i;
    for (i = 0; i < cs.snakes.length; i++) {
      if (cs.snakes[i].id === meId) me = cs.snakes[i];
      else opps.push(cs.snakes[i]);
    }
    var myLen = bodyLen(cs.all, meId);
    var maxOppLen = 0;
    for (i = 0; i < opps.length; i++) {
      var l = bodyLen(cs.all, opps[i].id);
      if (l > maxOppLen) maxOppLen = l;
    }
    if (!me) {
      if (opps.length === 0) {
        if (myLen > maxOppLen) return { score: BIG * 0.6, dead: 1 };
        if (myLen < maxOppLen) return { score: -BIG * 0.9, dead: 1 };
        return { score: -BIG * 0.05, dead: 1 };
      }
      return { score: -BIG, dead: 1 };
    }
    if (opps.length === 0) return { score: BIG * 1.2, dead: 0 };

    ensureScratch(N);
    var hx = me.body[0][0], hy = me.body[0][1];
    buildBlockedInto(cs, false, sHardA);
    buildBlockedInto(cs, true, sHardB);
    var myDistO = floodFromInto(sHardB, W, H, hx, hy, sDistA, sQueue);
    var myDistC = floodFromInto(sHardA, W, H, hx, hy, sDistB, sQueue);
    var oppHeads = [];
    for (i = 0; i < opps.length; i++) oppHeads.push([opps[i].body[0][0], opps[i].body[0][1]]);
    var oppDist = floodMultiInto(sHardB, W, H, oppHeads, sDistC, sQueue);

    var myAreaO = 0, myAreaC = 0, territory = 0;
    for (var idx = 0; idx < N; idx++) {
      if (myDistO[idx] >= 0) {
        myAreaO++;
        if (oppDist[idx] < 0 || myDistO[idx] < oppDist[idx]) territory++;
      } else if (oppDist[idx] >= 0) {
        territory--;
      }
      if (myDistC[idx] >= 0) myAreaC++;
    }

    var bestFood = INF, bestFoodVal = 0;
    for (i = 0; i < cs.food.length; i++) {
      var fi = cs.food[i][1] * W + cs.food[i][0];
      var md = myDistO[fi];
      if (md < 0) continue;
      if (md < bestFood) bestFood = md;
      var od = oppDist[fi];
      var val = 100 / (md + 2);
      if (od >= 0 && od < md) val *= 0.35;
      else if (od >= 0) val *= 1 + Math.min(3, od - md) * 0.12;
      if (val > bestFoodVal) bestFoodVal = val;
    }

    var health = me.health;
    var urg = health <= 30 ? 2.5 : health <= 60 ? 1.5 : 1.0;

    var score = 0, trap = 0, stormPen = 0, centerPen = 0, oppBox = 0, starve = 0;
    score += myAreaO * 2.5;
    score += myAreaC * 2.0;
    if (myAreaC <= myLen + 1) { trap = 400 + (myLen + 1 - myAreaC) * 100; score -= trap; }
    else if (myAreaC < myLen * 2.5) score -= (myLen * 2.5 - myAreaC) * 12;
    score += territory * 3.0;
    score += (myLen - maxOppLen) * 12;
    score += health * 0.6;
    if (health <= 35) { starve = (35 - health) * 45; score -= starve; }
    score += bestFoodVal * urg;
    if (me.ate) score += 80;
    if (health < 45) {
      var reach = bestFood < INF ? bestFood : 200;
      if (reach > health) score -= Math.min(1800, (reach - health) * 10);
    }

    var cap = Math.floor(Math.min(W, H) / 2) - 1;
    var dcell = Math.min(hx, hy, W - 1 - hx, H - 1 - hy);
    if (cap > 0 && cs.ring < cap) {
      var timeLeft = Math.max(0, cs.nextShrink - cs.turn) +
        Math.max(0, dcell - cs.ring) * cs.shrinkEvery;
      if (timeLeft < 70) { stormPen = (70 - timeLeft) * 6; score -= stormPen; }
    }
    if (inHaz(hx, hy, cs.ring, W, H)) score -= 500;
    var cx = (W - 1) / 2, cy = (H - 1) / 2;
    var cd = Math.abs(hx - cx) + Math.abs(hy - cy);
    centerPen = cd * (cs.ring >= 1 ? 1.5 : 0.25);
    score -= centerPen;

    var oppArea = 0;
    for (var qq = 0; qq < N; qq++) if (oppDist[qq] >= 0) oppArea++;
    oppBox = (myAreaO - oppArea) * 1.0;
    score += oppBox;

    return {
      score: score, dead: 0, myAreaO: myAreaO, myAreaC: myAreaC, territory: territory,
      bestFood: bestFood, bestFoodVal: bestFoodVal, health: health, urg: urg,
      myLen: myLen, maxOppLen: maxOppLen, trap: trap, stormPen: stormPen,
      centerPen: centerPen, oppBox: oppBox, ate: me.ate ? 1 : 0, starve: starve
    };
  }

  function evaluate(cs, meId) { return evalMetrics(cs, meId).score; }

  function dirName(v) { return v.name; }

  // Search: our move (max) vs opponent move (min), alternating joint turns,
  // with alpha-beta pruning and a deterministic node budget.
  var searchNodes = 0;
  var NODE_BUDGET = 400000;

  function findSnake(cs, id) {
    for (var i = 0; i < cs.snakes.length; i++) if (cs.snakes[i].id === id) return cs.snakes[i];
    return null;
  }

  function prevDirection(sn) {
    if (!sn || sn.body.length < 2) return null;
    var dx = sn.body[0][0] - sn.body[1][0];
    var dy = sn.body[0][1] - sn.body[1][1];
    if (dx === 1) return 'right';
    if (dx === -1) return 'left';
    if (dy === 1) return 'down';
    if (dy === -1) return 'up';
    return null;
  }

  function orderOurMoves(cs, meId) {
    var me = findSnake(cs, meId);
    if (!me) return DIRS;
    var hx = me.body[0][0], hy = me.body[0][1];
    var prev = prevDirection(me);
    var scored = [];
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i];
      var nx = hx + d.dx, ny = hy + d.dy;
      var legal = inB(nx, ny, cs.W, cs.H) && !inHaz(nx, ny, cs.ring, cs.W, cs.H);
      if (legal) {
        for (var si = 0; si < cs.snakes.length && legal; si++) {
          var b = cs.snakes[si].body;
          for (var k = 0; k < b.length; k++) {
            if (k === b.length - 1 && b.length > 1) continue;
            if (b[k][0] === nx && b[k][1] === ny) { legal = false; break; }
          }
        }
      }
      var fd = 99;
      for (var f = 0; f < cs.food.length; f++) {
        var dd = Math.abs(cs.food[f][0] - nx) + Math.abs(cs.food[f][1] - ny);
        if (dd < fd) fd = dd;
      }
      var sc = (legal ? 1000 : 0) - fd * 8;
      if (prev && d.name === prev) sc += 3;
      scored.push({ name: d.name, sc: sc, i: i });
    }
    scored.sort(function (a, b) { return b.sc - a.sc || a.i - b.i; });
    return scored;
  }

  function orderOppMoves(cs, oppId, meId) {
    var opp = findSnake(cs, oppId), me = findSnake(cs, meId);
    if (!opp || !me) return [0, 1, 2, 3];
    var hx = me.body[0][0], hy = me.body[0][1];
    var scored = [];
    for (var i = 0; i < 4; i++) {
      var d = DIRS[i];
      var nx = opp.body[0][0] + d.dx, ny = opp.body[0][1] + d.dy;
      var dist = Math.abs(nx - hx) + Math.abs(ny - hy);
      scored.push({ name: d.name, sc: -dist, i: i });
    }
    scored.sort(function (a, b) { return b.sc - a.sc || a.i - b.i; });
    return scored;
  }

  function maxNode(cs, meId, oppId, depth, alpha, beta) {
    if (depth <= 0 || searchNodes >= NODE_BUDGET) return evaluate(cs, meId);
    var order = orderOurMoves(cs, meId);
    var best = -BIG * 10;
    for (var qi = 0; qi < order.length; qi++) {
      var v = minNode(cs, order[qi].name, meId, oppId, depth, alpha, beta);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function minNode(cs, myMove, meId, oppId, depth, alpha, beta) {
    var order = orderOppMoves(cs, oppId, meId);
    var worst = BIG * 10;
    for (var qi = 0; qi < order.length; qi++) {
      var mv = {};
      mv[meId] = myMove;
      mv[oppId] = order[qi].name;
      var child = simulate(cs, mv);
      searchNodes++;
      var v;
      if (depth <= 1) v = evaluate(child, meId);
      else v = maxNode(child, meId, oppId, depth - 1, alpha, beta);
      if (v < worst) worst = v;
      if (worst < beta) beta = worst;
      if (alpha >= beta) break;
    }
    return worst;
  }

  function chooseDuel(cs, meId, oppId, depth) {
    searchNodes = 0;
    var order = orderOurMoves(cs, meId);
    var bestScore = -BIG * 10;
    var bestMove = order.length ? order[0].name : 'up';
    var alpha = -BIG * 10, beta = BIG * 10;
    for (var qi = 0; qi < order.length; qi++) {
      var v = minNode(cs, order[qi].name, meId, oppId, depth, alpha, beta);
      if (v > bestScore) { bestScore = v; bestMove = order[qi].name; }
      if (bestScore > alpha) alpha = bestScore;
    }
    return bestMove;
  }

  // Multiplayer fallback: coordinate-descent worst case for each of our moves.
  function chooseMulti(cs, meId, depth) {
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    var bestMove = null, bestScore = -BIG * 10;
    for (var i = 0; i < 4; i++) {
      var baseMoves = {};
      baseMoves[meId] = DIRS[i].name;
      // start opponents with a greedy direction
      for (var a = 0; a < opps.length; a++) baseMoves[opps[a].id] = greedyDir(cs, opps[a].id);
      var worst = BIG * 10;
      for (var pass = 0; pass < 2; pass++) {
        for (var b = 0; b < opps.length; b++) {
          var oid = opps[b].id;
          var localBest = BIG * 10, localDir = baseMoves[oid];
          for (var d = 0; d < 4; d++) {
            var mv = {};
            for (var key in baseMoves) mv[key] = baseMoves[key];
            mv[oid] = DIRS[d].name;
            var child = simulate(cs, mv);
            var val = evaluate(child, meId);
            if (val < localBest) { localBest = val; localDir = DIRS[d].name; }
          }
          baseMoves[oid] = localDir;
          if (localBest < worst) worst = localBest;
        }
      }
      var child2 = simulate(cs, baseMoves);
      var v2 = evaluate(child2, meId);
      if (v2 < worst) worst = v2;
      if (worst > bestScore) { bestScore = worst; bestMove = DIRS[i].name; }
    }
    return bestMove || 'up';
  }

  function greedyDir(cs, id) {
    var me = null;
    for (var i = 0; i < cs.snakes.length; i++) if (cs.snakes[i].id === id) me = cs.snakes[i];
    if (!me) return 'up';
    var hx = me.body[0][0], hy = me.body[0][1];
    var best = 'up', bestScore = -INF;
    for (var d = 0; d < 4; d++) {
      var nx = hx + DIRS[d].dx, ny = hy + DIRS[d].dy;
      if (!inB(nx, ny, cs.W, cs.H)) continue;
      if (inHaz(nx, ny, cs.ring, cs.W, cs.H)) continue;
      var blocked = false;
      for (var s = 0; s < cs.snakes.length && !blocked; s++) {
        var b = cs.snakes[s].body;
        for (var k = 0; k < b.length; k++) {
          if (k === b.length - 1 && b.length > 1) continue;
          if (b[k][0] === nx && b[k][1] === ny) { blocked = true; break; }
        }
      }
      if (blocked) continue;
      var fd = INF;
      for (var f = 0; f < cs.food.length; f++) {
        var dd = Math.abs(cs.food[f][0] - nx) + Math.abs(cs.food[f][1] - ny);
        if (dd < fd) fd = dd;
      }
      var score = -fd * 3 - (Math.abs(nx - (cs.W - 1) / 2) + Math.abs(ny - (cs.H - 1) / 2)) * 0.5;
      if (score > bestScore) { bestScore = score; best = DIRS[d].name; }
    }
    return best;
  }

  function decide(state) {
    var me = state.you;
    if (!me) return 'up';
    var cs = makeState(state);
    var meId = me.id;
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    if (opps.length === 0) return 'up';

    var depth = 4;
    if (opps.length === 1) {
      if (state.turn >= 120 || cs.ring >= 1) depth = 5;
      return chooseDuel(cs, meId, opps[0].id, depth);
    }
    return chooseMulti(cs, meId, 1);
  }

  function move(state) {
    try {
      return decide(state);
    } catch (e) {
      return 'up';
    }
  }

  module.exports = { name: 'DeepSeekRoyale', move: move };
  module.exports._nodes = function () { return searchNodes; };
  module.exports._case = function (state, m0, o0, m1, o1) {
    var cs = makeState(state);
    var meId = state.you.id;
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    var oppId = opps[0].id;
    var m1a = {}; m1a[meId] = m0; m1a[oppId] = o0;
    var c1 = simulate(cs, m1a);
    var m2 = {}; m2[meId] = m1; m2[oppId] = o1;
    var c2 = simulate(c1, m2);
    var em = evalMetrics(c2, meId);
    return { c1turn: c1.turn, c1ring: c1.ring, c1next: c1.nextShrink, c1snakes: c1.snakes.map(function(x){return x.id;}), c1dead: Object.keys(c1.deadIds), c2turn: c2.turn, c2ring: c2.ring, c2next: c2.nextShrink, c2snakes: c2.snakes.map(function(x){return [x.id,x.body[0],x.health];}), c2dead: Object.keys(c2.deadIds), c2all: c2.all.map(function(x){return [x.id,x.body.length];}), score: em.score, me: em };
  };
  module.exports._line2 = function (state, m0) {
    var cs = makeState(state);
    var meId = state.you.id;
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    var oppId = opps[0].id;
    var out = [];
    for (var oi = 0; oi < 4; oi++) {
      var o0 = DIRS[oi].name;
      var c1 = simulate(cs, (function(){ var m={}; m[meId]=m0; m[oppId]=o0; return m; })());
      var meAlive = false;
      for (var z = 0; z < c1.snakes.length; z++) if (c1.snakes[z].id === meId) meAlive = true;
      var vals = [];
      if (meAlive) {
        for (var mi = 0; mi < 4; mi++) {
          var m1 = DIRS[mi].name, worst = BIG * 10, wo = null;
          for (var oj = 0; oj < 4; oj++) {
            var o1 = DIRS[oj].name;
            var c2 = simulate(c1, (function(){ var m={}; m[meId]=m1; m[oppId]=o1; return m; })());
            var v = evaluate(c2, meId);
            if (v < worst) { worst = v; wo = o1; }
          }
          vals.push([m1, Math.round(worst), wo]);
        }
      }
      out.push([o0, meAlive, vals]);
    }
    return out;
  };
  module.exports._scores = function (state, DEP) {
    var cs = makeState(state);
    var meId = state.you.id;
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    var order = orderOurMoves(cs, meId);
    searchNodes = 0;
    var out = [], alpha = -BIG * 10, beta = BIG * 10;
    for (var i = 0; i < order.length; i++) {
      var v = minNode(cs, order[i].name, meId, opps[0].id, DEP || 5, alpha, beta);
      out.push([order[i].name, Math.round(v), order[i].sc]);
      if (v > alpha) alpha = v;
    }
    return { order: order.map(function (o) { return [o.name, o.sc]; }), scores: out, nodes: searchNodes };
  };
  module.exports._child = function (state, myMove, oppMove) {
    var cs = makeState(state);
    var meId = state.you.id;
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    var mv = {}; mv[meId] = myMove; mv[opps[0].id] = oppMove;
    var child = simulate(cs, mv);
    var W = child.W, H = child.H, N = W * H;
    var hardTail = buildBlocked(child, true);
    var me = null, opp = null;
    for (var i = 0; i < child.snakes.length; i++) {
      if (child.snakes[i].id === meId) me = child.snakes[i]; else opp = child.snakes[i];
    }
    var md = floodFrom(hardTail, W, H, me.body[0][0], me.body[0][1]);
    var od = floodMulti(hardTail, W, H, [[opp.body[0][0], opp.body[0][1]]]);
    var terr = 0, mine = 0, theirs = 0;
    for (var k = 0; k < N; k++) {
      if (md[k] >= 0 && (od[k] < 0 || md[k] < od[k])) { terr++; mine++; }
      else if (od[k] >= 0 && (md[k] < 0 || od[k] < md[k])) { terr--; theirs++; }
    }
    var mm = evalMetrics(child, meId); return { me: me, opp: opp, myDist: Array.from(md), oppDist: Array.from(od), terr: terr, mine: mine, theirs: theirs, emTerr: mm.territory, emAreaO: mm.myAreaO, emAreaC: mm.myAreaC, score: Math.round(mm.score) };
  };
  module.exports._debug = function (state) {
    var cs = makeState(state);
    var meId = state.you.id;
    var opps = cs.snakes.filter(function (s) { return s.id !== meId; });
    var out = { turn: cs.turn, ring: cs.ring, moves: [], detail: [] };
    for (var i = 0; i < 4; i++) {
      var worst = BIG * 10, worstChild = null, worstO = null;
      for (var o = 0; o < 4; o++) {
        var mv = {}; mv[meId] = DIRS[i].name; mv[opps[0].id] = DIRS[o].name;
        var child = simulate(cs, mv);
        var v = evaluate(child, meId);
        if (v < worst) { worst = v; worstChild = child; worstO = DIRS[o].name; }
      }
      out.moves.push([DIRS[i].name, Math.round(worst), worstO]);
      if (worstChild) {
        var m = evalMetrics(worstChild, meId);
        out.detail.push([DIRS[i].name, worstO, {
          score: Math.round(m.score), areaO: m.myAreaO, areaC: m.myAreaC,
          terr: m.territory, bf: m.bestFood, bfv: Math.round(m.bestFoodVal),
          hp: m.health, trap: Math.round(m.trap), storm: Math.round(m.stormPen),
          center: Math.round(m.centerPen), box: Math.round(m.oppBox), ate: m.ate
        }]);
      }
    }
    return out;
  };
})();
