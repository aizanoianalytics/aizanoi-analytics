'use strict';

var DIR_ORDER = ['up', 'down', 'left', 'right'];
var VALID_DIRS = { up: true, down: true, left: true, right: true, stay: true };
var FLEE_DIST = 2;

function legalMoves(state, you) {
  var w = state.width;
  var h = state.height;
  var out = [{ dir: 'stay', x: you.x, y: you.y }];
  for (var i = 0; i < DIR_ORDER.length; i++) {
    var dir = DIR_ORDER[i];
    var d = MazeEngine.DIRS[dir];
    var x = you.x + d[0];
    var y = you.y + d[1];
    if (you.y === state.tunnelRow) x = (x + w) % w;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    var cell = state.grid[y] && state.grid[y][x];
    if (!cell || cell === '#') continue;
    if (you.role === 'runner') {
      if (cell === 'G' || cell === '-') continue;
    } else {
      var from = state.grid[you.y] && state.grid[you.y][you.x];
      if (from === 'G' && cell !== 'G' && cell !== '-') continue;
      if (cell === 'G' && from !== 'G' && from !== '-') continue;
      if (you.inPen && you.releaseIn > 0 && cell !== 'G') continue;
    }
    out.push({ dir: dir, x: x, y: y });
  }
  return out;
}

function bfs(state, sources, ctx) {
  var w = state.width;
  var dist = new Map();
  var first = new Map();
  var queue = [];
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    var k = s.y * w + s.x;
    if (dist.has(k)) continue;
    dist.set(k, 0);
    first.set(k, 'stay');
    queue.push({ x: s.x, y: s.y });
  }
  for (var q = 0; q < queue.length; q++) {
    var p = queue[q];
    var pk = p.y * w + p.x;
    var d = dist.get(pk);
    var nbs = [];
    for (var j = 0; j < DIR_ORDER.length; j++) {
      var dd = MazeEngine.DIRS[DIR_ORDER[j]];
      var nx = p.x + dd[0];
      var ny = p.y + dd[1];
      if (p.y === state.tunnelRow) nx = (nx + w) % w;
      if (nx < 0 || nx >= w || ny < 0 || ny >= state.height) continue;
      var cell = state.grid[ny] && state.grid[ny][nx];
      if (!cell || cell === '#') continue;
      var from = state.grid[p.y] && state.grid[p.y][p.x];
      if (ctx.role === 'runner') {
        if (cell === 'G' || cell === '-') continue;
      } else {
        if (from === 'G' && cell !== 'G' && cell !== '-') continue;
        if (cell === 'G' && from !== 'G' && from !== '-') continue;
        if (ctx.inPen && ctx.releaseIn > 0 && cell !== 'G') continue;
      }
      nbs.push({ dir: DIR_ORDER[j], x: nx, y: ny });
    }
    nbs.push({ dir: 'stay', x: p.x, y: p.y });
    for (var n2 = 0; n2 < nbs.length; n2++) {
      var nb = nbs[n2];
      var nk = nb.y * w + nb.x;
      if (dist.has(nk)) continue;
      dist.set(nk, d + 1);
      first.set(nk, nb.dir);
      queue.push(nb);
    }
  }
  return { dist: dist, first: first };
}


function collectPellets(state) {
  var list = [];
  for (var y = 0; y < state.height; y++) {
    var row = state.grid[y];
    if (!row) continue;
    for (var x = 0; x < state.width; x++) {
      var c = row[x];
      if (c === '.' || c === 'o') list.push({ x: x, y: y, power: c === 'o' });
    }
  }
  return list;
}

function decideRunner(state, you, legal) {
  var w = state.width;
  var prot = you.invulnerable === true || (you.invulnerableTicksLeft || 0) > 0;

  var dangers = [];
  for (var i = 0; i < state.ghosts.length; i++) {
    var g = state.ghosts[i];
    if (g.role !== 'ghost') continue;
    if (g.alive === false) continue;
    if (g.inPen) continue;
    if (g.frightened) continue;
    dangers.push({ x: g.x, y: g.y });
  }
  var gbfs = bfs(state, dangers, { role: 'ghost', inPen: false, releaseIn: 0 });
  var myK = you.y * w + you.x;
  var dNow = gbfs.dist.has(myK) ? gbfs.dist.get(myK) : 99;

  var pellets = collectPellets(state);
  if (!pellets.length) return 'stay';
  var pbfs = bfs(state, pellets, { role: 'runner', inPen: false, releaseIn: 0 });

  var opts = [];
  for (var oi = 0; oi < legal.length; oi++) {
    var m = legal[oi];
    var k = m.y * w + m.x;
    opts.push({
      dir: m.dir,
      x: m.x,
      y: m.y,
      dd: gbfs.dist.has(k) ? gbfs.dist.get(k) : 99,
      pd: pbfs.dist.has(k) ? pbfs.dist.get(k) : 9999
    });
  }

  if (!prot && dNow <= FLEE_DIST) {
    var bestFlee = null;
    var bestFleeScore = -Infinity;
    for (var fi = 0; fi < opts.length; fi++) {
      var fm = opts[fi];
      var fscore = fm.dd * 100 - fm.pd;
      if (bestFlee === null || fscore > bestFleeScore) {
        bestFlee = fm;
        bestFleeScore = fscore;
      }
    }
    return bestFlee ? bestFlee.dir : 'stay';
  }

  var bestMove = null;
  var bestScore = Infinity;
  for (var bi = 0; bi < opts.length; bi++) {
    var bm = opts[bi];
    if (!prot && bm.dd < 2) continue;
    var bscore = bm.pd * 10;
    if (bm.dir === you.dir && bm.dir !== 'stay') bscore -= 5;
    if (bestMove === null || bscore < bestScore) {
      bestScore = bscore;
      bestMove = bm;
    }
  }
  return bestMove ? bestMove.dir : 'stay';
}


function decideGhost(state, you, legal) {
  if (you.inPen) {
    var door = null;
    var doorDist = Infinity;
    for (var dy = 0; dy < state.height; dy++) {
      var drow = state.grid[dy];
      if (!drow) continue;
      for (var dx = 0; dx < state.width; dx++) {
        if (drow[dx] === '-') {
          var dd = Math.abs(dx - you.x) + Math.abs(dy - you.y);
          if (dd < doorDist) { doorDist = dd; door = { x: dx, y: dy }; }
        }
      }
    }
    var target = door;
    if (!target) {
      var bestEx = null;
      var bestExD = Infinity;
      for (var ey = 0; ey < state.height; ey++) {
        for (var ex = 0; ex < state.width; ex++) {
          var ec = state.grid[ey] && state.grid[ey][ex];
          if (ec === 'G' || ec === '-') continue;
          var edx = Math.abs(ex - you.x) + Math.abs(ey - you.y);
          if (edx < bestExD) { bestExD = edx; bestEx = { x: ex, y: ey }; }
        }
      }
      target = bestEx;
    }
    var penMove = 'stay';
    var penMoveScore = Infinity;
    for (var pi = 0; pi < legal.length; pi++) {
      var pm = legal[pi];
      var d2 = target ? (Math.abs(pm.x - target.x) + Math.abs(pm.y - target.y)) : 0;
      if (d2 < penMoveScore) { penMoveScore = d2; penMove = pm.dir; }
    }
    return penMove;
  }

  if (you.frightened && (state.tick + 1) % 2 === 1) return 'stay';

  var runners = [];
  for (var ri = 0; ri < state.runners.length; ri++) {
    var r = state.runners[ri];
    if (r.alive === false) continue;
    if (r.respawnIn > 0) continue;
    runners.push(r);
  }
  var targets = [];
  for (var ti = 0; ti < runners.length; ti++) {
    if (runners[ti].invulnerable === true || (runners[ti].invulnerableTicksLeft || 0) > 0) continue;
    targets.push(runners[ti]);
  }
  if (!targets.length) targets = runners;
  var srcs = [];
  for (var si = 0; si < targets.length; si++) srcs.push({ x: targets[si].x, y: targets[si].y });
  var ctx = { role: 'ghost', inPen: false, releaseIn: 0 };
  var b = bfs(state, srcs, ctx);

  var bestG = null;
  var bestGVal = you.frightened ? -1 : Infinity;
  for (var gi = 0; gi < legal.length; gi++) {
    var gm = legal[gi];
    var gk = gm.y * state.width + gm.x;
    var gd = b.dist.has(gk) ? b.dist.get(gk) : 9999;
    var gval = you.frightened ? -gd : gd;
    if (bestG === null) { bestG = gm; bestGVal = gval; continue; }
    if (you.frightened) {
      if (gval > bestGVal || (gval === bestGVal && gm.dir < bestG.dir)) { bestG = gm; bestGVal = gval; }
    } else {
      if (gval < bestGVal || (gval === bestGVal && gm.dir < bestG.dir)) { bestG = gm; bestGVal = gval; }
    }
  }
  return bestG ? bestG.dir : 'stay';
}

function decide(state) {
  var you = state ? state.you : null;
  if (!you) return 'stay';
  if (you.alive === false) return 'stay';
  if (you.respawnIn > 0) return 'stay';
  var legal = legalMoves(state, you);
  if (!legal || !legal.length) return 'stay';
  var dir;
  try {
    dir = you.role === 'runner'
      ? decideRunner(state, you, legal)
      : decideGhost(state, you, legal);
  } catch (err) {
    return 'stay';
  }
  if (typeof dir !== 'string') return 'stay';
  if (!VALID_DIRS[dir]) return 'stay';
  return dir;
}

module.exports = {
  name: 'MazeMind',
  move: function (state) {
    return decide(state);
  }
};
