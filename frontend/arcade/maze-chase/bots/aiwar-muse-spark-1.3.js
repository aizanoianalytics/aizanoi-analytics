'use strict';
// Ariadne: dual-role Maze Chase bot.
// Runner: value-weighted pellet clearing with teammate-aware claiming,
// power-pellet conservation, fright-chain hunting, and danger+dead-end lookahead.
// Ghost: spread-target interception with prediction and pincer cutoffs,
// pen-exit rushing, power-trap caution, and half-speed flee logic.
module.exports = { name: 'Ariadne', move: move };

var DIRS = ['up', 'left', 'down', 'right'];
var DX = { up: 0, down: 0, left: -1, right: 1, stay: 0 };
var DY = { up: -1, down: 1, left: 0, right: 0, stay: 0 };
var INF = 1e9;

function move(state) {
  try {
    var you = state.you;
    if (!you.alive || you.respawnIn > 0) return 'stay';
    if (you.role === 'runner') return runnerMove(state);
    return ghostMove(state);
  } catch (e) {
    return 'stay';
  }
}

// ---------- shared helpers ----------

function cellAt(state, x, y) {
  if (y < 0 || y >= state.height || x < 0 || x >= state.width) return '#';
  var row = state.grid[y];
  if (!row) return '#';
  var c = row[x];
  return c === undefined ? '#' : c;
}

function stepWrap(state, x, y, dir) {
  var nx = x + DX[dir];
  var ny = y + DY[dir];
  if (y === state.tunnelRow) nx = ((nx % state.width) + state.width) % state.width;
  return { x: nx, y: ny };
}

function isFloorChar(c) {
  return c === '.' || c === 'o' || c === ' ';
}

// Exact replica of engine.destination legality for the deciding agent.
function legalMoves(state, me) {
  var from = cellAt(state, me.x, me.y);
  var out = [];
  for (var i = 0; i < 4; i++) {
    var dir = DIRS[i];
    var p = stepWrap(state, me.x, me.y, dir);
    if (p.y < 0 || p.y >= state.height || p.x < 0 || p.x >= state.width) continue;
    var c = cellAt(state, p.x, p.y);
    if (c === '#') continue;
    if (me.role === 'runner') {
      if (c === 'G' || c === '-') continue;
    } else {
      if (from === 'G' && c !== 'G' && c !== '-') continue;
      if (c === 'G' && from !== 'G' && from !== '-') continue;
      if (me.inPen && me.releaseIn > 1 && c !== 'G') continue;
    }
    out.push({ dir: dir, x: p.x, y: p.y });
  }
  return out;
}

// BFS over boolean passable array; sources = [{x,y,d}]. Returns Int32Array dist.
function bfs(W, H, row, pass, sources) {
  var dist = new Int32Array(W * H);
  dist.fill(-1);
  var qx = [];
  var qy = [];
  for (var s = 0; s < sources.length; s++) {
    var src = sources[s];
    if (src.x < 0 || src.x >= W || src.y < 0 || src.y >= H) continue;
    var idx = src.y * W + src.x;
    if (!pass[idx] || dist[idx] !== -1) continue;
    dist[idx] = src.d || 0;
    qx.push(src.x);
    qy.push(src.y);
  }
  var head = 0;
  while (head < qx.length) {
    var x = qx[head];
    var y = qy[head];
    head++;
    var d = dist[y * W + x];
    // up
    var nxs = [x, x, x - 1, x + 1];
    var nys = [y - 1, y + 1, y, y];
    for (var k = 0; k < 4; k++) {
      var nx = nxs[k];
      var ny = nys[k];
      if (y === row) nx = ((nx % W) + W) % W;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      var ni = ny * W + nx;
      if (!pass[ni] || dist[ni] !== -1) continue;
      dist[ni] = d + 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  return dist;
}

function buildPass(state, role) {
  // role 'runner': floor only. 'ghostOut': everything but wall/pen-interior.
  var W = state.width;
  var H = state.height;
  var pass = new Array(W * H);
  for (var y = 0; y < H; y++) {
    var rowStr = state.grid[y];
    for (var x = 0; x < W; x++) {
      var c = rowStr[x];
      if (role === 'runner') pass[y * W + x] = isFloorChar(c);
      else pass[y * W + x] = (c !== '#' && c !== 'G');
    }
  }
  return pass;
}

function liveRunners(state) {
  return state.runners.filter(function (r) {
    return r.alive && r.respawnIn <= 0;
  });
}

function findDoors(state) {
  var doors = [];
  for (var y = 0; y < state.height; y++) {
    var row = state.grid[y];
    for (var x = 0; x < state.width; x++) {
      if (row[x] === '-') doors.push({ x: x, y: y });
    }
  }
  return doors;
}

// ---------- runner ----------

function runnerMove(state) {
  var you = state.you;
  var W = state.width;
  var H = state.height;
  var row = state.tunnelRow;
  var legal = legalMoves(state, you);
  var selfIdx = you.y * W + you.x;

  var ghosts = state.ghosts;
  var threats = [];
  var edibles = [];
  var i, g;
  for (i = 0; i < ghosts.length; i++) {
    g = ghosts[i];
    if (g.inPen) continue;
    if (g.frightened) {
      // Fright expiring next tick -> dangerous again.
      if (state.frightTicksLeft <= 1) threats.push(g);
      else edibles.push(g);
    } else {
      threats.push(g);
    }
  }

  var runnerPass = buildPass(state, 'runner');
  // Danger: ghost steps to each cell (full speed threats).
  var danger;
  if (threats.length) {
    var src = threats.map(function (t) {
      return { x: t.x, y: t.y };
    });
    danger = bfs(W, H, row, runnerPass, src);
    // Penned ghosts about to exit: door + release countdown pressure.
    var minRel = INF;
    for (i = 0; i < ghosts.length; i++) {
      if (ghosts[i].inPen && ghosts[i].releaseIn < minRel) minRel = ghosts[i].releaseIn;
    }
    if (minRel < INF) {
      var ghostPass = buildPass(state, 'ghostOut');
      var doors = findDoors(state);
      if (doors.length) {
        var doorDist = bfs(W, H, row, ghostPass, doors);
        for (var k = 0; k < danger.length; k++) {
          if (doorDist[k] >= 0) {
            var via = doorDist[k] + minRel;
            if (danger[k] < 0 || via < danger[k]) danger[k] = via;
          }
        }
      }
    }
  } else {
    danger = new Int32Array(W * H);
    danger.fill(-1);
  }

  var dangerHere = danger[selfIdx] < 0 ? INF : danger[selfIdx];
  var urgent = dangerHere <= 5;

  // Teammate proximity so we don't all chase the same pellet.
  var mates = liveRunners(state).filter(function (r) {
    return r.id !== you.id;
  });
  var mateDist = null;
  if (mates.length) {
    mateDist = bfs(W, H, row, runnerPass, mates.map(function (r) {
      return { x: r.x, y: r.y };
    }));
  }

  // Pellet inventory.
  var pellets = [];
  for (var y = 0; y < H; y++) {
    var rowStr = state.grid[y];
    for (var x = 0; x < W; x++) {
      var c = rowStr[x];
      if (c === '.' || c === 'o') pellets.push({ x: x, y: y, power: c === 'o', idx: y * W + x });
    }
  }

  var candidates = legal.map(function (m) {
    return { dir: m.dir, x: m.x, y: m.y };
  });
  candidates.push({ dir: 'stay', x: you.x, y: you.y });

  var frightLeft = state.frightTicksLeft;
  var chainVal = Math.min(30, state.nextGhostPoints / 50);
  var endgame = state.pellets <= 25;
  var timeP = state.maxTicks ? state.tick / state.maxTicks : 0;
  var fearScale = timeP > 0.6 ? Math.max(0.25, 1 - timeP) : 1;
  var greedScale = timeP > 0.6 ? 1 + (timeP - 0.6) * 3 : 1;

  var best = null;
  for (i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var ci = c.y * W + c.x;
    // Exact distances from this candidate: costs one BFS but decides well.
    var dmap = runnerPass[ci]
      ? bfs(W, H, row, runnerPass, [{ x: c.x, y: c.y }])
      : null;
    var safety = danger[ci] < 0 ? INF : danger[ci];

    var score = 0;
    var dense = 0;
    if (dmap) {
      var bestPellet = 0;
      for (var p = 0; p < pellets.length; p++) {
        var t = pellets[p];
        var d = dmap[t.idx];
        if (d < 0) continue;
        if (d <= 5) dense++;
        var v;
        if (t.power) {
          if (frightLeft > 12) v = 1; // conserve power while fright active
          else if (urgent) {
            var dd = danger[t.idx] < 0 ? INF : danger[t.idx];
            v = d <= dd + 1 ? 55 : 14; // race-winnable power is precious
            if (d <= 4 && dd <= 6 && threats.length >= 2) v = 75; // combo
          } else v = endgame ? 10 : 8;
        } else {
          v = endgame ? 20 : 12;
        }
        v *= greedScale;
        // Yield pellets a nearby mate will clearly take.
        if (mateDist && mateDist[t.idx] >= 0 && mateDist[t.idx] < d - 2 && !endgame) v *= 0.35;
        var rwd = v / (d + 1);
        if (rwd > bestPellet) bestPellet = rwd;
      }
      score += bestPellet + Math.min(6, dense) * 0.4;

      // Hunt edible ghosts while fright lasts (they move at half speed).
      if (edibles.length && frightLeft > 0) {
        var h1 = 0, h2 = 0;
        for (var e = 0; e < edibles.length; e++) {
          var hd = dmap[edibles[e].y * W + edibles[e].x];
          if (hd < 0 || frightLeft <= hd + 4) continue;
          var hb = chainVal / (hd + 1);
          if (hb > h1) { h2 = h1; h1 = hb; }
          else if (hb > h2) h2 = hb;
        }
        score += h1 + 0.5 * h2;
      }
    }

    // Survival penalty.
    if (!you.invulnerable && threats.length) {
      if (safety <= 1) score -= 100000;
      else if (safety === 2) score -= 60 * fearScale;
      else if (safety === 3) score -= 20 * fearScale;
      else if (safety === 4) score -= 8 * fearScale;
      else score -= (8 / safety) * fearScale;
    }

    // Dead-end trap check: no cell reachable within 4 steps beats the ghosts.
    if (dmap && threats.length && !you.invulnerable && safety < INF) {
      var escape = 0;
      for (var k = 0; k < dmap.length; k++) {
        if (dmap[k] >= 0 && dmap[k] <= 4) {
          var dg = danger[k] < 0 ? INF : danger[k];
          if (dg > dmap[k] + 1) escape++;
        }
      }
      if (escape === 0) score -= 500;
    }

    // Power-step nuance: grabbing resets the shared chain; avoid it when
    // the chain is rich and edibles remain, love it when threatened.
    if (cellAt(state, c.x, c.y) === 'o') {
      if (state.ghostChain >= 2 && frightLeft > 6 && edibles.length) score -= 30;
      else if (urgent && frightLeft <= 6) score += 25;
    }

    if (c.dir === 'stay') score -= 0.02;
    if (c.dir === you.dir) score += 0.05;

    var tie = DIRS.indexOf(c.dir);
    if (!best || score > best.score + 1e-9 ||
        (Math.abs(score - best.score) <= 1e-9 && tie < best.tie)) {
      best = { dir: c.dir, score: score, tie: tie };
    }
  }
  return best ? best.dir : 'stay';
}

// ---------- ghost ----------

function ghostMove(state) {
  var you = state.you;
  var W = state.width;
  var H = state.height;
  var row = state.tunnelRow;
  var nextTick = state.tick + 1;
  var legal = legalMoves(state, you);

  var willFright = you.frightened && state.frightTicksLeft > 1;
  // Frightened ghosts only move on even ticks; save the effort otherwise.
  if (willFright && nextTick % 2 === 1) return 'stay';
  if (!legal.length) return 'stay';

  var ghostPass = buildPass(state, 'ghostOut');
  var runnerPass = buildPass(state, 'runner');

  // --- in pen: rush the door ---
  if (you.inPen) {
    var doors = findDoors(state);
    var penPass = new Array(W * H);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var ch = state.grid[y][x];
        penPass[y * W + x] = (ch === 'G' || ch === '-');
      }
    }
    var doorDist = doors.length ? bfs(W, H, row, penPass, doors) : null;
    var live = liveRunners(state);
    var huntDist = live.length ? bfs(W, H, row, ghostPass, live) : null;
    var bestD = null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      var mi = m.y * W + m.x;
      // Outside pen and allowed to leave -> take it.
      if (state.grid[m.y][m.x] !== 'G') {
        var hd = huntDist && huntDist[mi] >= 0 ? huntDist[mi] : INF;
        var s = -hd + (m.dir === you.dir ? 0.05 : 0);
        if (!bestD || s > bestD.s) bestD = { dir: m.dir, s: s };
        continue;
      }
      var dd = doorDist && doorDist[mi] >= 0 ? doorDist[mi] : INF;
      var s2 = -3 * dd + (m.dir === you.dir ? 0.05 : 0);
      if (!bestD || s2 > bestD.s) bestD = { dir: m.dir, s: s2 };
    }
    return bestD ? bestD.dir : 'stay';
  }

  var runners = state.runners.filter(function (r) {
    return r.alive;
  });
  var present = liveRunners(state);
  // Absent runners reappear at spawn: camp the proxy.
  var sources = present.map(function (r) {
    return { x: r.x, y: r.y };
  });
  runners.forEach(function (r) {
    if (r.alive && r.respawnIn > 0) sources.push({ x: r.spawn.x, y: r.spawn.y });
  });

  // --- frightened: flee to maximize distance, prefer junctions ---
  if (willFright) {
    var fearMap = sources.length ? bfs(W, H, row, ghostPass, sources) : null;
    var bestF = null;
    for (var f = 0; f < legal.length; f++) {
      var c = legal[f];
      var ci = c.y * W + c.x;
      var sd = fearMap && fearMap[ci] >= 0 ? fearMap[ci] : INF;
      // Junction bonus: count open ghost-graph neighbours.
      var deg = 0;
      for (var q = 0; q < 4; q++) {
        var np = stepWrap(state, c.x, c.y, DIRS[q]);
        if (np.x < 0 || np.x >= W || np.y < 0 || np.y >= H) continue;
        if (ghostPass[np.y * W + np.x]) deg++;
      }
      var fs = 3 * Math.min(sd, 60) + (deg > 2 ? 1.5 : 0) +
        (c.dir === you.dir ? 0.05 : 0) - (c.dir === 'stay' ? 0.1 : 0);
      // Do not hug the pen: ghosts inside can't be eaten but lose time.
      if (state.grid[c.y][c.x] === '-') fs -= 2;
      if (!bestF || fs > bestF.s) bestF = { dir: c.dir, s: fs };
    }
    return bestF ? bestF.dir : 'stay';
  }

  // --- hunt: spread targets across ghosts, intercept, pinch escapes ---
  var myIdx = 0;
  for (var gi = 0; gi < state.ghosts.length; gi++) {
    if (state.ghosts[gi].id === you.id) { myIdx = gi; break; }
  }
  var fromMe = bfs(W, H, row, ghostPass, [{ x: you.x, y: you.y }]);

  var targets = present.slice().sort(function (a, b) {
    var da = fromMe[a.y * W + a.x];
    var db = fromMe[b.y * W + b.x];
    da = da < 0 ? INF : da;
    db = db < 0 ? INF : db;
    return da - db;
  });

  var aim;
  if (!targets.length) {
    // Everyone respawning: wait near the earliest return spawn.
    var wait = runners.slice().sort(function (a, b) {
      return a.respawnIn - b.respawnIn;
    })[0];
    aim = wait ? { x: wait.spawn.x, y: wait.spawn.y } : { x: you.x, y: you.y };
  } else {
    // Prefer vulnerable runners; invulnerable ones cannot be caught.
    var vuln = targets.filter(function (r) { return !r.invulnerable; });
    var pool = vuln.length ? vuln : targets;
    var ordered = pool.slice().sort(function (a, b) {
      var da = fromMe[a.y * W + a.x];
      var db = fromMe[b.y * W + b.x];
      da = da < 0 ? INF : da;
      db = db < 0 ? INF : db;
      return da - db;
    });
    var primary = pool[myIdx % pool.length];
    var dPrim = fromMe[primary.y * W + primary.x];
    dPrim = dPrim < 0 ? INF : dPrim;
    var dNear = fromMe[ordered[0].y * W + ordered[0].x];
    dNear = dNear < 0 ? INF : dNear;
    // Opportunistic switch: a much closer runner is everyone's problem.
    if (dNear < dPrim - 6) primary = ordered[0];
    var distMe = Math.min(dPrim, dNear + 6);
    // Intercept: project along runner heading.
    var px = primary.x;
    var py = primary.y;
    var steps = Math.max(0, Math.min(4, Math.floor(distMe / 4)));
    for (var s = 0; s < steps; s++) {
      var np = stepWrap(state, px, py, primary.dir || 'stay');
      if (np.x < 0 || np.x >= W || np.y < 0 || np.y >= H) break;
      if (!runnerPass[np.y * W + np.x]) break;
      px = np.x;
      py = np.y;
    }
    aim = { x: px, y: py };
    // Encirclement: with several ghosts, each covers a different escape
    // route around the predicted cell (sorted deterministically so seats
    // spread out), instead of forming a single tail.
    if (state.ghosts.length > 1 && !primary.invulnerable) {
      var cuts = [];
      for (var d = 0; d < 4; d++) {
        var cp = stepWrap(state, px, py, DIRS[d]);
        if (cp.x < 0 || cp.x >= W || cp.y < 0 || cp.y >= H) continue;
        if (runnerPass[cp.y * W + cp.x]) cuts.push(cp);
      }
      cuts.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      if (cuts.length) aim = cuts[myIdx % cuts.length];
    }
  }

  var targetMap = bfs(W, H, row, ghostPass, [aim]);

  // Power-trap caution: lunging at a runner parked on power just
  // hands them fright (pickups resolve before contact).
  var powerNear = null;
  var pp = state.powerPellets;
  for (var pi = 0; pi < pp.length; pi++) {
    var md = Math.abs(pp[pi].x - aim.x) + Math.abs(pp[pi].y - aim.y);
    if (md <= 2) { powerNear = pp[pi]; break; }
  }
  var runnerToPower = INF;
  if (powerNear) {
    var rpMap = bfs(W, H, row, runnerPass, [{ x: aim.x, y: aim.y }]);
    // distance from runner to that power ~= map value at power cell.
    var rv = rpMap[powerNear.y * W + powerNear.x];
    runnerToPower = rv < 0 ? INF : rv;
  }

  var mateAt = {};
  for (var mi2 = 0; mi2 < state.ghosts.length; mi2++) {
    var o = state.ghosts[mi2];
    if (o.id !== you.id && !o.inPen) mateAt[o.y * W + o.x] = true;
  }

  // Close-range minimax: when near a vulnerable target, assume the runner
  // replies optimally and pick the move minimizing their best outcome.
  // Captures (same cell or head-on swap) score lowest (= best for ghost).
  var prey = (targets.length && !primary.invulnerable && distMe <= 8) ? primary : null;
  if (prey) {
    var replies = [{ x: prey.x, y: prey.y }];
    for (var rd = 0; rd < 4; rd++) {
      var rp2 = stepWrap(state, prey.x, prey.y, DIRS[rd]);
      if (rp2.x < 0 || rp2.x >= W || rp2.y < 0 || rp2.y >= H) continue;
      if (runnerPass[rp2.y * W + rp2.x]) replies.push(rp2);
    }
    var bestM = null;
    var myCands = legal.map(function (m) { return { x: m.x, y: m.y, dir: m.dir }; });
    myCands.push({ x: you.x, y: you.y, dir: 'stay' });
    for (var mc = 0; mc < myCands.length; mc++) {
      var cc = myCands[mc];
      var dc = bfs(W, H, row, ghostPass, [cc]);
      var worst = -INF;
      for (var ri = 0; ri < replies.length; ri++) {
        var rpos = replies[ri];
        var val;
        var sameCell = (cc.x === rpos.x && cc.y === rpos.y);
        var swap = (cc.x === prey.x && cc.y === prey.y &&
                    rpos.x === you.x && rpos.y === you.y);
        if (sameCell || swap) {
          // Runner stepping onto power escapes via instant fright instead.
          val = (cellAt(state, rpos.x, rpos.y) === 'o') ? 60 : -100000;
        } else {
          var dd2 = dc[rpos.y * W + rpos.x];
          dd2 = dd2 < 0 ? 50 : dd2;
          // Prefer herding the runner into low-mobility cells.
          var rdeg = 0;
          for (var q2 = 0; q2 < 4; q2++) {
            var np2 = stepWrap(state, rpos.x, rpos.y, DIRS[q2]);
            if (np2.x < 0 || np2.x >= W || np2.y < 0 || np2.y >= H) continue;
            if (runnerPass[np2.y * W + np2.x]) rdeg++;
          }
          val = dd2 + 0.4 * rdeg;
        }
        if (val > worst) worst = val;
      }
      var ms = -worst + (mateAt[cc.y * W + cc.x] ? -0.6 : 0) +
        (cc.dir === you.dir ? 0.05 : 0) + (cc.dir === 'stay' ? -0.02 : 0);
      var tbr2 = cc.dir === 'stay' ? 4 : DIRS.indexOf(cc.dir);
      if (!bestM || ms > bestM.s + 1e-9 ||
          (Math.abs(ms - bestM.s) <= 1e-9 && tbr2 < bestM.t)) {
        bestM = { dir: cc.dir, s: ms, t: tbr2 };
      }
    }
    if (bestM) return bestM.dir;
  }

  var bestC = null;
  for (var li = 0; li < legal.length; li++) {
    var mv = legal[li];
    var mvi = mv.y * W + mv.x;
    var dt = targetMap[mvi] < 0 ? INF : targetMap[mvi];
    var cs = -3 * Math.min(dt, 200);
    if (mateAt[mvi]) cs -= 0.6; // don't pile onto teammates
    if (powerNear && runnerToPower <= 1 && dt <= 1) {
      var myD = fromMe[mvi];
      myD = myD < 0 ? INF : myD;
      if (myD > runnerToPower) cs -= 50; // contain, don't feed them fright
    }
    if (state.grid[mv.y][mv.x] === 'o') cs -= 1; // don't gift adjacency
    if (mv.dir === you.dir) cs += 0.05;
    var tbr = DIRS.indexOf(mv.dir);
    if (!bestC || cs > bestC.s + 1e-9 ||
        (Math.abs(cs - bestC.s) <= 1e-9 && tbr < bestC.t)) {
      bestC = { dir: mv.dir, s: cs, t: tbr };
    }
  }
  // Include staying only if everything is terrible (surrounded by power trap).
  if (bestC && bestC.s < -40) {
    var stayD = targetMap[you.y * W + you.x];
    if (stayD >= 0 && -3 * stayD > bestC.s) return 'stay';
  }
  return bestC ? bestC.dir : 'stay';
}
