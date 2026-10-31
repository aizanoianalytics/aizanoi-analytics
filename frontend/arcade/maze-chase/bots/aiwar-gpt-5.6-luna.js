'use strict';

// A deterministic, bounded dual-role Maze Chase player.
module.exports = {
  name: 'Aizanoi Strategic',
  move: function move(state) {
    var me = state.you;
    if (!me || !me.alive || me.respawnIn) return 'stay';
    var dirs = ['up', 'right', 'down', 'left'];
    var w = state.width, h = state.height, grid = state.grid;
    var key = function (x, y) { return y * w + x; };
    var reverse = { up: 'down', down: 'up', left: 'right', right: 'left', stay: 'stay' };

    function next(p, d) {
      var v = MazeEngine.DIRS[d], x = p.x + v[0], y = p.y + v[1];
      if (p.y === state.tunnelRow) x = (x + w) % w;
      return { x: x, y: y, dir: d };
    }
    function pass(p, role) {
      var c = grid[p.y] && grid[p.y][p.x];
      if (!c || c === '#') return false;
      if (role === 'runner') return c !== 'G' && c !== '-';
      return true;
    }
    function legalFrom(a, role) {
      var from = grid[a.y] && grid[a.y][a.x];
      var out = [];
      for (var i = 0; i < dirs.length; i++) {
        var p = next(a, dirs[i]);
        if (!pass(p, role)) continue;
        var c = grid[p.y][p.x];
        if (role === 'ghost') {
          if (from === 'G' && c !== 'G' && c !== '-') continue;
          if (c === 'G' && from !== 'G' && from !== '-') continue;
          if (a.inPen && a.releaseIn > 1 && c !== 'G') continue;
        }
        out.push(p);
      }
      return out;
    }
    function legalPoint(p, role) {
      var fake = { x: p.x, y: p.y, inPen: false, releaseIn: 0 };
      return legalFrom(fake, role);
    }
    function bfs(sources, role) {
      var dist = new Map(), first = new Map(), q = [];
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i], k = key(s.x, s.y);
        if (!dist.has(k) && pass(s, role)) { dist.set(k, 0); first.set(k, 'stay'); q.push(s); }
      }
      for (var qi = 0; qi < q.length; qi++) {
        var cur = q[qi], ck = key(cur.x, cur.y), ns = legalPoint(cur, role);
        for (var j = 0; j < ns.length; j++) {
          var n = ns[j], nk = key(n.x, n.y);
          if (dist.has(nk)) continue;
          dist.set(nk, dist.get(ck) + 1);
          first.set(nk, first.get(ck) === 'stay' ? n.dir : first.get(ck));
          q.push(n);
        }
      }
      return { dist: dist, first: first };
    }
    function man(a, b) {
      var dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      if (a.y === state.tunnelRow && b.y === state.tunnelRow) dx = Math.min(dx, w - dx);
      return dx + dy;
    }
    var legal = legalFrom(me, me.role);
    if (!legal.length) return 'stay';

    if (me.role === 'runner') {
      var threats = state.ghosts.filter(function (g) { return !g.inPen && !g.frightened && !g.frightImmune; });
      var edible = state.ghosts.filter(function (g) { return !g.inPen && g.frightened && !g.frightImmune; });
      var danger = bfs(threats, 'ghost').dist;
      var edibleMap = bfs(edible, 'ghost').dist;
      var powers = state.powerPellets || [];
      var pellets = [];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        if (grid[y][x] === '.' || grid[y][x] === 'o') pellets.push({ x: x, y: y, power: grid[y][x] === 'o' });
      }
      var best = null;
      for (var li = 0; li < legal.length; li++) {
        var p = legal[li], pk = key(p.x, p.y), safe = danger.has(pk) ? danger.get(pk) : 999;
        var score = 0;
        var onPower = grid[p.y][p.x] === 'o';
        // A ghost can arrive next tick; strongly reject immediate traps unless protected/powering.
        if (!me.invulnerable && !onPower && safe <= 1) score -= 100000;
        if (!me.invulnerable && safe === 2) score -= 45;
        if (onPower) score += (threats.length ? 95 : 18);
        // Prefer food, with power pellets and reachable nearby food weighted highly.
        for (var pi = 0; pi < pellets.length; pi++) {
          var food = pellets[pi], fd = man(p, food);
          if (fd > 0 && fd > 18) continue;
          var val = food.power ? (threats.length ? 70 : 24) : 11;
          score += val / (fd + 1);
        }
        // Eat frightened ghosts only when the fright window supports the trip.
        if (state.frightTicksLeft > 0 && edible.length) {
          var ed = edibleMap.has(pk) ? edibleMap.get(pk) : 999;
          if (ed + 2 < state.frightTicksLeft) score += 34 / (ed + 1);
        }
        // Avoid advancing into an immediate ghost head-on; prefer open escape cells.
        var exits = legalFrom({ x: p.x, y: p.y, inPen: false, releaseIn: 0 }, 'runner').length;
        score += exits * 1.5;
        if (p.dir === me.dir) score += 0.08;
        if (reverse[me.dir] === p.dir && legal.length > 1) score -= 0.12;
        if (!best || score > best.score) best = { dir: p.dir, score: score };
      }
      return best ? best.dir : 'stay';
    }

    // Frightened ghosts move at half speed. Staying on odd ticks is mandatory.
    if (me.frightened && !me.inPen && ((state.tick + 1) % 2 === 1)) return 'stay';
    var live = state.runners.filter(function (r) { return r.alive && !r.respawnIn; });
    if (me.inPen) {
      var doors = [];
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) if (grid[yy][xx] === '-') doors.push({ x: xx, y: yy });
      var toDoor = bfs(doors, 'ghost').first, here = toDoor.get(key(me.x, me.y));
      if (here && legal.some(function (p) { return p.dir === here; })) return here;
      return legal[0].dir;
    }
    if (!live.length) return legal[0].dir;

    var target;
    if (me.frightened) {
      // Maximise distance from the nearest active runner, with a small anti-corner bias.
      var bestF = null;
      for (var fi = 0; fi < legal.length; fi++) {
        var fp = legal[fi], nearest = 999;
        for (var ri = 0; ri < live.length; ri++) nearest = Math.min(nearest, man(fp, live[ri]));
        var openness = legalFrom({ x: fp.x, y: fp.y, inPen: false, releaseIn: 0 }, 'ghost').length;
        var fs = nearest * 10 + openness;
        if (!bestF || fs > bestF.score) bestF = { dir: fp.dir, score: fs };
      }
      return bestF.dir;
    }
    // Assign targets by stable ghost order, but choose the nearest runner to avoid wasteful cross-map chases.
    var gi = 0;
    for (var gix = 0; gix < state.ghosts.length; gix++) if (state.ghosts[gix].id === me.id) { gi = gix; break; }
    target = live[gi % live.length];
    var chase = bfs([target], 'ghost').first, want = chase.get(key(me.x, me.y));
    if (want && legal.some(function (p) { return p.dir === want; })) return want;
    // If the assigned runner is unreachable, use the closest reachable one.
    var bestG = null;
    for (var ti = 0; ti < live.length; ti++) {
      var alt = bfs([live[ti]], 'ghost');
      var ad = alt.dist.get(key(me.x, me.y));
      var af = alt.first.get(key(me.x, me.y));
      if (ad !== undefined && af && (!bestG || ad < bestG.distance)) {
        bestG = { dir: af, distance: ad };
      }
    }
    return bestG && legal.some(function (p) { return p.dir === bestG.dir; })
      ? bestG.dir : legal[0].dir;
  }
};
