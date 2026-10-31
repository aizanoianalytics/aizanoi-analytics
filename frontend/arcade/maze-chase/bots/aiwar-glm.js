'use strict';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ORDER = ['up', 'left', 'down', 'right'];

// Persisted camp target for hysteresis (per worker, reset each round).
let campLock = null;

module.exports = { name: 'LabyrinthCortex', move: botMove };

function botMove(state) {
  try {
    return decide(state);
  } catch (e) {
    return 'stay';
  }
}

function decide(state) {
  const w = state.width;
  const h = state.height;
  const tRow = state.tunnelRow;
  const grid = state.grid;
  const you = state.you;
  const passRunner = c => c !== '#' && c !== 'G' && c !== '-';
  const passOpen = c => c !== '#';

  function cellAt(x, y) {
    if (y < 0 || y >= h) return '#';
    if (y === tRow) return grid[y][((x % w) + w) % w];
    if (x < 0 || x >= w) return '#';
    return grid[y][x];
  }

  // Multi-source BFS distance field over cells accepted by `pass`.
  function field(sources, pass) {
    const dist = new Int32Array(w * h);
    dist.fill(-1);
    const qx = [];
    const qy = [];
    for (const s0 of sources) {
      const x = ((s0.x % w) + w) % w;
      const k = s0.y * w + x;
      if (dist[k] === -1) {
        dist[k] = 0;
        qx.push(x);
        qy.push(s0.y);
      }
    }
    for (let i = 0; i < qx.length; i++) {
      const x = qx[i];
      const y = qy[i];
      const d = dist[y * w + x] + 1;
      for (let j = 0; j < 4; j++) {
        const dir = ORDER[j];
        let nx = x + DIRS[dir][0];
        const ny = y + DIRS[dir][1];
        if (ny < 0 || ny >= h) continue;
        if (y !== tRow && (nx < 0 || nx >= w)) continue;
        const c = cellAt(nx, ny);
        if (!pass(c)) continue;
        nx = ((nx % w) + w) % w;
        const k = ny * w + nx;
        if (dist[k] !== -1) continue;
        dist[k] = d;
        qx.push(nx);
        qy.push(ny);
      }
    }
    return dist;
  }

  // BFS from a single cell recording the first move of each shortest path.
  // Nodes are pruned when a dangerous ghost can beat us there by `margin`.
  function pathField(src, pass, danger, margin) {
    const dist = new Int32Array(w * h);
    dist.fill(-1);
    const first = new Array(w * h).fill(null);
    const qx = [src.x];
    const qy = [src.y];
    dist[src.y * w + src.x] = 0;
    for (let i = 0; i < qx.length; i++) {
      const x = qx[i];
      const y = qy[i];
      const t = dist[y * w + x] + 1;
      for (let j = 0; j < 4; j++) {
        const dir = ORDER[j];
        let nx = x + DIRS[dir][0];
        const ny = y + DIRS[dir][1];
        if (ny < 0 || ny >= h) continue;
        if (y !== tRow && (nx < 0 || nx >= w)) continue;
        const c = cellAt(nx, ny);
        if (!pass(c)) continue;
        nx = ((nx % w) + w) % w;
        const k = ny * w + nx;
        if (dist[k] !== -1) continue;
        if (danger && danger[k] >= 0 && danger[k] - t < margin) continue;
        dist[k] = t;
        first[k] = dist[y * w + x] === 0 ? dir : first[y * w + x];
        qx.push(nx);
        qy.push(ny);
      }
    }
    return { dist, first };
  }

  function legalDirs(a, isRunner, pass) {
    const list = [];
    for (let j = 0; j < 4; j++) {
      const dir = ORDER[j];
      const dx = DIRS[dir][0];
      const dy = DIRS[dir][1];
      const y = a.y + dy;
      if (y < 0 || y >= h) continue;
      let x = a.x + dx;
      if (y === tRow) {
        x = ((x % w) + w) % w;
      } else if (x < 0 || x >= w) continue;
      const c = grid[y][x];
      if (!pass(c)) continue;
      if (isRunner) {
        if (c === 'G' || c === '-') continue;
      } else if (!ghostCellOk(a, c)) continue;
      list.push({ dir, x, y });
    }
    return list;
  }

  function ghostCellOk(a, c) {
    const from = grid[a.y][a.x];
    if (from === 'G' && c !== 'G' && c !== '-') return false;
    if (c === 'G' && from !== 'G' && from !== '-') return false;
    if (a.inPen && a.releaseIn > 1 && c !== 'G') return false;
    return true;
  }

  function pickOpt(legal, score) {
    let best = null;
    let bestScore = -Infinity;
    for (const l of legal) {
      const s = score(l);
      if (s > bestScore) {
        bestScore = s;
        best = l;
      }
    }
    return best;
  }

  function runnerLogic() {
    // Danger field from ghosts that can catch us (includes pen ghosts so that
    // imminent releases count; far pen ghosts barely affect the field).
    const threats = state.ghosts.filter(g => !g.frightened).map(g => g);
    const danger = field(threats, passOpen);

    const legal = legalDirs(you, true, passRunner);
    if (!legal.length) return 'stay';

    // Chase edible ghosts while we outrun both them and our own predators.
    const edible = state.ghosts.filter(g => g.frightened && !g.inPen);
    if (edible.length) {
      const f = field(edible, passRunner);
      const t = f[you.y * w + you.x];
      const d0 = danger[you.y * w + you.x];
      if (t >= 0 && d0 > t + 1 && 2 * t + 5 <= state.frightTicksLeft
        && (t <= 12 || state.ghostChain > 0)) {
        const best = pickOpt(legal, l => {
          const d = f[l.y * w + l.x];
          return d === -1 ? -Infinity : -d;
        });
        if (best) return best.dir;
      }
    }

    // Protected: hunt any exterior ghost at close range.
    if (you.invulnerable) {
      const allG = state.ghosts.filter(g => !g.inPen);
      if (allG.length) {
        const f = field(allG, passRunner);
        const t = f[you.y * w + you.x];
        if (t >= 0 && t <= 10) {
          const best = pickOpt(legal, l => {
            const d = f[l.y * w + l.x];
            return d === -1 ? -Infinity : -d;
          });
          if (best) return best.dir;
        }
      }
    }

    // Nearest safely-reachable pickup via margin-pruned BFS from our cell.
    function firstPickup(margin) {
      const safe = pathField(you, passRunner, danger, margin);
      let pellet = null;
      let pelletD = Infinity;
      let power = null;
      let powerD = Infinity;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = grid[y][x];
          if (c !== '.' && c !== 'o') continue;
          const d = safe.dist[y * w + x];
          if (d <= 0) continue;
          if (c === '.') {
            if (d < pelletD) {
              pelletD = d;
              pellet = { x, y };
            }
          } else if (d < powerD) {
            powerD = d;
            power = { x, y };
          }
        }
      }
      return { safe, pellet, pelletD, power, powerD };
    }

    let r = firstPickup(1);
    const myDanger = danger[you.y * w + you.x];
    // Take a power pellet when ghosts pressure us, and also whenever no
    // ordinary pellet is safely reachable (breaks ghost camping stalls).
    if (r.power && ((myDanger <= 14 && r.powerD <= 20) || !r.pellet)) {
      return r.safe.first[r.power.y * w + r.power.x];
    }
    if (r.pellet) return r.safe.first[r.pellet.y * w + r.pellet.x];

    // Desperate: many pellets behind and little time, accept equal-time cells.
    if (state.pellets <= 4 || state.maxTicks - state.tick <= 140) {
      r = firstPickup(0);
      const target = r.power || r.pellet;
      if (target) return r.safe.first[target.y * w + target.x];
    }

    // Kite: maximize the distance to the nearest dangerous ghost.
    const best = pickOpt(legal, l => {
      const d = danger[l.y * w + l.x];
      return (d === -1 ? 100000 : d) + (l.dir === you.dir ? 0.5 : 0);
    });
    return best ? best.dir : 'stay';
  }

  function predict(r) {
    if (r.dir === 'stay') return null;
    if (DIRS[r.dir] === undefined) return null;
    let approach = r.dir;
    let cx = r.x;
    let cy = r.y;
    for (let step = 0; step < 10; step++) {
      const options = [];
      for (let j = 0; j < 4; j++) {
        const d = ORDER[j];
        let nx = cx + DIRS[d][0];
        const ny = cy + DIRS[d][1];
        if (ny < 0 || ny >= h) continue;
        if (cy !== tRow && (nx < 0 || nx >= w)) continue;
        const c = grid[ny][((nx % w) + w) % w];
        if (c === ' ' || c === '.' || c === 'o') options.push(d);
      }
      if (options.length > 2) break;
      const chosen = options.includes(approach) ? approach
        : (options.length
          ? options.filter(d => d !== back(approach))[0] : null);
      if (!chosen) break;
      approach = chosen;
      cx = ((cx + DIRS[chosen][0]) % w + w) % w;
      cy += DIRS[chosen][1];
    }
    return cx === r.x && cy === r.y ? null : { x: cx, y: cy };
  }

  function back(d) {
    return d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left';
  }

  function ghostLogic() {
    const legal = legalDirs(you, false, passOpen);
    if (!legal.length) return 'stay';

    if (you.inPen) {
      const from = grid[you.y][you.x];
      if (from === '-') {
        // At the door: leave to the exterior once (or if) released.
        if (you.releaseIn <= 1) {
          const out = pickOpt(legal, l => {
            const c = grid[l.y][l.x];
            if (c === 'G' || c === '-') return -Infinity;
            return l.dir === you.dir ? 2 : l.dir === 'up' ? 1 : 0.5;
          });
          return out ? out.dir : 'stay';
        }
        const back = pickOpt(legal, l => grid[l.y][l.x] === 'G' ? 1 : -Infinity);
        return back ? back.dir : 'stay';
      }
      // In the G area: wait one cell from the door, walk in when eligible.
      const doors = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (grid[y][x] === '-') doors.push({ x, y });
        }
      }
      if (!doors.length) return 'stay';
      const f = field(doors, c => c === 'G' || c === '-');
      const here = f[you.y * w + you.x];
      if (you.releaseIn <= 1) {
        let best = null;
        let bestD = here;
        for (const l of legal) {
          const c = grid[l.y][l.x];
          if (c !== 'G' && c !== '-') continue;
          const d = f[l.y * w + l.x];
          if (d !== -1 && d < bestD) {
            bestD = d;
            best = l;
          }
        }
        return best ? best.dir : 'stay';
      }
      if (here === -1) return 'stay';
      // Settle on a spot at distance 1 from the door and hold.
      if (here <= 1) return 'stay';
      const best = pickOpt(legal, l => {
        const c = grid[l.y][l.x];
        if (c !== 'G' && c !== '-') return -Infinity;
        const d = f[l.y * w + l.x];
        if (d === -1) return -Infinity;
        if (d === here) return 0.4 + 0.01 * d;
        return -d;
      });
      return best ? best.dir : 'stay';
    }

    const runners = state.runners.filter(r => r.alive && !r.respawnIn);
    const threat = runners.map(r => ({ x: r.x, y: r.y }));

    if (you.frightened) {
      // Flee the nearest living runner.
      const f = threat.length ? field(threat, passOpen) : null;
      const best = pickOpt(legal, l => {
        if (!f) return 1;
        const d = f[l.y * w + l.x];
        return (d === -1 ? 100000 : d) + (l.dir === you.dir ? 0.5 : 0);
      });
      return best ? best.dir : 'stay';
    }

    // Attrition-camping ghost stance. A parked ghost makes every nearby cell
    // unsafe for margin-based runners, so a guarded pickup can never be
    // collected: ghosts stall out a time win, or catch kamikaze runners that
    // step in anyway. Hunt explicitly only when protection makes guarding
    // futile or no pickups remain.
    const rField = field(threat, passOpen);
    const minRunner = rField[you.y * w + you.x] === -1
      ? Infinity : rField[you.y * w + you.x];
    const pickups = candidatesSafe();
    const anyProtected = runners.some(r => r.invulnerable);
    if (pickups.length && !anyProtected) {
      return campPlan(legal, rField, pickups);
    }

    // Hunt with interception: model the runner as a margin-1 safe pellet
    // seeker, predict its next path, and aim at the earliest cell on that
    // path we can reach no later than the runner does. A small seeded jitter
    // breaks deterministic kiting cycles.
    let target = null;
    let bestDist = Infinity;
    let planRunner = null;
    const guarded = runners.every(r => r.invulnerable);
    for (const r of runners) {
      const f = field([r, predict(r)].filter(Boolean), passOpen);
      const d = f[you.y * w + you.x];
      if (d !== -1 && d < bestDist && (!r.invulnerable || guarded)) {
        bestDist = d;
        target = f;
        planRunner = r;
      }
    }
    if (target) {
      let best = pickOpt(legal, l => {
        const d = target[l.y * w + l.x];
        return d === -1 ? -Infinity : -d;
      });
      let bestD = target[you.y * w + you.x];

      const myField = field([{ x: you.x, y: you.y }], passOpen);
      const rp = pathField(planRunner, passRunner,
        field(state.ghosts.filter(g => !g.frightened), passOpen), 1);
      let catchCell = -1;
      let catchScore = Infinity;
      for (let k = 0; k < w * h; k++) {
        const d = rp.dist[k];
        if (d <= 0) continue;
        const g = myField[k];
        if (g === -1 || g > d) continue;
        const s = 2 * g + Math.max(0, d - g);
        if (s < catchScore) {
          catchScore = s;
          catchCell = k;
        }
      }
      if (catchCell >= 0) {
        const cf = field([{
          x: catchCell % w, y: Math.floor(catchCell / w)
        }], passOpen);
        const baseD = cf[you.y * w + you.x];
        let pb = null;
        let pbD = Infinity;
        for (const l of legal) {
          const d = cf[l.y * w + l.x];
          if (d !== -1 && d < pbD) {
            pbD = d;
            pb = l;
          }
        }
        if (pb && pbD < baseD) best = pb;
      }

      if (best && (Math.random() > 0.06 || bestD <= 1)) return best.dir;
      if (!best) {
        const cands = legal.map(l => l.dir);
        if (cands.length && Math.random() > 0.06) {
          return cands[0];
        }
        if (cands.length) return cands[Math.floor(Math.random() * cands.length)];
      }
      return best ? best.dir : 'stay';
    }

    // Between camping and full chase: drift toward the runner team while
    // staying ready to intercept, so we never dither.
    const best = pickOpt(legal, l => {
      const d = rField[l.y * w + l.x];
      return d === -1 ? -Infinity : -d;
    });
    return best ? best.dir : 'stay';
  }

  // Choose the pickup to guard favoring spots where we get there at least as
  // fast as the nearest runner; approach it and hold once adjacent/on it.
  // Ordinal rotation splits multiple ghosts across different targets.
  function campPlan(legal, rField, pickups) {
    if (!pickups.length) {
      if (minRunner === Infinity) return 'stay';
      const best = pickOpt(legal, l => {
        const d = rField[l.y * w + l.x];
        return d === -1 ? -Infinity : -d;
      });
      return best ? best.dir : 'stay';
    }
    const ordinal = Math.max(0, state.ghosts.findIndex(g => g.id === you.id));
    const fMe = field([{ x: you.x, y: you.y }], passOpen);
    if (campLock) {
      const k = campLock.y * w + campLock.x;
      const c = grid[campLock.y][campLock.x];
      const stillThere = c === '.' || c === 'o';
      const myD = fMe[k];
      const rD = rField[k] === -1 ? 9999 : rField[k];
      // Persist the guard while the pickup exists: the parked-adjacent ghost
      // keeps its whole neighborhood dangerous for margin-based runners.
      if (stillThere && myD >= 0) {
        if (myD <= 1) return 'stay';
        const fp = field([campLock], passOpen);
        const best = pickOpt(legal, l => {
          const d = fp[l.y * w + l.x];
          return d === -1 ? -Infinity : -d;
        });
        return best ? best.dir : 'stay';
      }
      campLock = null;
    }
    const scored = pickups.map((p, i) => {
      const k = p.y * w + p.x;
      const myD = fMe[k] === -1 ? 9999 : fMe[k];
      const rD = rField[k] === -1 ? 9999 : rField[k];
      const power = grid[p.y][p.x] === 'o';
      const excess = Math.max(0, myD - rD);
      const score = excess * 1000 + myD + (power ? 400 : 0) + i * 1e-4;
      return { p, myD, rD, score };
    }).sort((a, b) => a.score - b.score);
    const chosen = scored[ordinal % Math.min(3, scored.length)];
    campLock = { x: chosen.p.x, y: chosen.p.y };
    if (chosen.myD <= 1) return 'stay';
    const fp = field([chosen.p], passOpen);
    const best = pickOpt(legal, l => {
      const d = fp[l.y * w + l.x];
      return d === -1 ? -Infinity : -d;
    });
    return best ? best.dir : 'stay';
  }

  function candidatesSafe() {
    const list = state.powerPellets.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y][x] === '.') list.push({ x, y });
      }
    }
    return list;
  }

  return you.role === 'runner' ? runnerLogic() : ghostLogic();
}
