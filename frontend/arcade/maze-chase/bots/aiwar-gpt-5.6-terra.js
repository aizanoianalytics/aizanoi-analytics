'use strict';

/* Maze Chase entrant: deterministic dual-role tactical pathfinder. */
module.exports = {
  name: 'Apex Pathfinder',
  move: function (state) {
    var me = state && state.you;
    if (!me || !me.alive || me.respawnIn) return 'stay';
    var W = state.width, H = state.height, grid = state.grid, row = state.tunnelRow;
    var dirs = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
    var nextTick = state.tick + 1;
    if (me.role === 'ghost' && me.frightened && nextTick % 2 === 1) return 'stay';

    function cell(x, y) { return y >= 0 && y < H && x >= 0 && x < W ? grid[y][x] : '#'; }
    function key(x, y) { return y * W + x; }
    function step(x, y, d, role, pen, release) {
      var nx = x + d[1], ny = y + d[2];
      if (y === row && d[2] === 0) nx = (nx + W) % W;
      var to = cell(nx, ny), from = cell(x, y);
      if (to === '#') return null;
      if (role === 'runner' && (to === 'G' || to === '-')) return null;
      if (role === 'ghost') {
        if (from === 'G' && to !== 'G' && to !== '-') return null;
        if (to === 'G' && from !== 'G' && from !== '-') return null;
        if (pen && release > 1 && to !== 'G') return null;
      }
      return [nx, ny];
    }
    function legal(a) {
      var r = [];
      for (var i = 0; i < 4; i++) {
        var p = step(a.x, a.y, dirs[i], a.role, a.inPen, a.releaseIn);
        if (p) r.push([dirs[i][0], p[0], p[1]]);
      }
      return r;
    }
    var moves = legal(me);
    if (!moves.length) return 'stay';

    // A floor-only distance field is enough for runner survival and objectives.
    function distances(sources, role) {
      var d = new Int16Array(W * H), q = [], head = 0, i, s;
      for (i = 0; i < d.length; i++) d[i] = -1;
      for (i = 0; i < sources.length; i++) {
        s = sources[i];
        if (!s || s.x < 0 || s.y < 0) continue;
        var k = key(s.x, s.y);
        if (d[k] < 0) { d[k] = 0; q.push([s.x, s.y]); }
      }
      while (head < q.length) {
        var a = q[head++], ad = d[key(a[0], a[1])];
        for (i = 0; i < 4; i++) {
          var p = step(a[0], a[1], dirs[i], role, false, 0);
          if (p && d[key(p[0], p[1])] < 0) { d[key(p[0], p[1])] = ad + 1; q.push(p); }
        }
      }
      return d;
    }
    function pathFirst(from, goal, forbidden) {
      var seen = new Int8Array(W * H), prev = new Int32Array(W * H), q = [[from.x, from.y]], head = 0, i;
      for (i = 0; i < prev.length; i++) prev[i] = -1;
      seen[key(from.x, from.y)] = 1;
      while (head < q.length) {
        var a = q[head++];
        if (a[0] === goal.x && a[1] === goal.y) {
          var cur = key(a[0], a[1]), start = key(from.x, from.y);
          while (prev[cur] !== start && prev[cur] !== -1) cur = prev[cur];
          if (prev[cur] === -1) return 'stay';
          var cx = cur % W, cy = (cur / W) | 0;
          for (i = 0; i < moves.length; i++) if (moves[i][1] === cx && moves[i][2] === cy) return moves[i][0];
          return 'stay';
        }
        for (i = 0; i < 4; i++) {
          var p = step(a[0], a[1], dirs[i], 'runner', false, 0);
          if (!p) continue;
          var pk = key(p[0], p[1]);
          if (!seen[pk] && (!forbidden || !forbidden[pk] || (p[0] === goal.x && p[1] === goal.y))) {
            seen[pk] = 1; prev[pk] = key(a[0], a[1]); q.push(p);
          }
        }
      }
      return null;
    }

    if (me.role === 'runner') {
      var dangerous = [];
      for (var g = 0; g < state.ghosts.length; g++) {
        var gh = state.ghosts[g];
        if (!gh.inPen && !gh.frightened) dangerous.push(gh);
      }
      var threat = distances(dangerous, 'runner');
      var ownDistance = distances([{x: me.x, y: me.y}], 'runner');
      var best = null, bestScore = 1e9, y, x;
      // Prefer a power pellet when danger is real, otherwise clear reachable food safely.
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var c = cell(x, y);
        if (c !== '.' && c !== 'o') continue;
        var dist = ownDistance[key(x, y)];
        if (dist < 0) continue;
        var td = threat[key(x, y)], score = dist;
        if (c === 'o') score -= dangerous.length ? 18 : 5;
        if (td >= 0) {
          // Unsafe targets and narrow time margins lose heavily.
          if (td <= dist + 1) score += 10000 + (dist - td) * 300;
          else score += Math.max(0, 9 - (td - dist)) * 10;
        }
        if (!best || score < bestScore || (score === bestScore && (y < best.y || y === best.y && x < best.x))) {
          best = {x:x, y:y}; bestScore = score;
        }
      }
      // A nearby edible ghost is worth more than a pellet, but only if the
      // current fright has enough time left for the contact.
      for (g = 0; g < state.ghosts.length; g++) {
        var edible = state.ghosts[g];
        if (edible.inPen || !edible.frightened) continue;
        var ed = ownDistance[key(edible.x, edible.y)];
        if (ed >= 0 && state.frightTicksLeft > ed + 1 && (!best || ed - 24 < bestScore)) {
          best = {x: edible.x, y: edible.y}; bestScore = ed - 24;
        }
      }
      var goalDistance = best ? distances([best], 'runner') : null;
      // A move onto/near a dangerous ghost is never acceptable unless protected.
      var pick = null, pickScore = -1e9;
      for (var m = 0; m < moves.length; m++) {
        var mv = moves[m], mk = key(mv[1], mv[2]), safety = threat[mk];
        var v = safety < 0 ? 50 : safety * 30;
        if (safety >= 0 && safety <= 1 && !me.invulnerable) v -= 100000;
        if (cell(mv[1], mv[2]) === 'o') v += dangerous.length ? 600 : 50;
        if (goalDistance && goalDistance[mk] >= 0) v -= goalDistance[mk] * 4;
        if (best) {
          var first = pathFirst(me, best, null);
          if (first === mv[0]) v += 100;
        }
        // Avoid head-on swaps: a ghost adjacent facing our cell is especially likely to attack.
        for (g = 0; g < dangerous.length; g++) if (dangerous[g].x === mv[1] && dangerous[g].y === mv[2]) v -= 100000;
        if (v > pickScore) { pickScore = v; pick = mv[0]; }
      }
      if (pick !== 'stay' && pickScore > -99999) return pick;
      // If all exits are immediately bad, maximize distance / take power.
      return pick || 'stay';
    }

    // Ghost: chase the most vulnerable runner by shortest legal route; frightened ghosts flee.
    var targets = [];
    for (var r = 0; r < state.runners.length; r++) {
      var run = state.runners[r];
      if (run.alive && !run.respawnIn) targets.push(run);
    }
    if (!targets.length) return moves[0][0];
    var runnerField = distances(targets, 'ghost');
    if (me.inPen) {
      var doors = [];
      for (var dy = 0; dy < H; dy++) for (var dx = 0; dx < W; dx++) {
        if (cell(dx, dy) === '-') doors.push({x: dx, y: dy});
      }
      runnerField = distances(doors, 'ghost');
    }
    var chosen = moves[0], value = me.frightened ? -1e9 : 1e9;
    for (m = 0; m < moves.length; m++) {
      mv = moves[m]; mk = key(mv[1], mv[2]);
      var d0 = runnerField[mk];
      if (d0 < 0) d0 = 999;
      // In pen, route toward the door / first exterior target by the same distance field.
      if (me.frightened) {
        var flee = d0 * 100;
        // Do not drift into a runner while frightened.
        if (flee > value) { value = flee; chosen = mv; }
      } else {
        // Chase vulnerable runners more aggressively; deterministic direction order breaks ties.
        if (d0 < value) { value = d0; chosen = mv; }
      }
    }
    return chosen[0] || 'stay';
  }
};
