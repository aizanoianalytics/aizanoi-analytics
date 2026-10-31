'use strict';

/**
 * AegisPhantom - AI War Maze Chase Champion Bot
 * Master-tier autonomous agent for both Runner and Ghost roles.
 */

const DIRS = ['up', 'right', 'down', 'left'];
const REV = { up: 'down', down: 'up', left: 'right', right: 'left', stay: 'stay' };
const DELTA = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  stay: [0, 0]
};

// -----------------------------------------------------------------------------
// ZERO-ALLOCATION FAST GRAPH & BFS INFRASTRUCTURE
// -----------------------------------------------------------------------------
let G_WIDTH = 0;
let G_HEIGHT = 0;
let G_SIZE = 0;
let G_TUNNEL = 0;

let qBuf = null;
let tokenBuf = null;
let currentToken = 1;

let dGhostDanger = null;
let dGhostEdible = null;
let dRunner = null;
let dTarget = null;
let dMoveBufs = null;

// Runner position history to eliminate oscillation
const runnerHistory = new Int32Array(32).fill(-1);
let rHistoryHead = 0;

function ensureBuffers(w, h, tunnelRow) {
  const size = w * h;
  if (size !== G_SIZE) {
    G_WIDTH = w;
    G_HEIGHT = h;
    G_SIZE = size;
    G_TUNNEL = tunnelRow;
    qBuf = new Int32Array(size);
    tokenBuf = new Int32Array(size);
    dGhostDanger = new Int16Array(size);
    dGhostEdible = new Int16Array(size);
    dRunner = new Int16Array(size);
    dTarget = new Int16Array(size);
    dMoveBufs = [
      new Int16Array(size),
      new Int16Array(size),
      new Int16Array(size),
      new Int16Array(size)
    ];
    currentToken = 1;
  }
}

function nextToken() {
  currentToken++;
  if (currentToken >= 2147483640) {
    tokenBuf.fill(0);
    currentToken = 1;
  }
  return currentToken;
}

function getLegalNeighbors(x, y, role, grid) {
  const w = G_WIDTH;
  const h = G_HEIGHT;
  const tunnelRow = G_TUNNEL;
  const from = grid[y][x];
  const result = [];

  for (let i = 0; i < 4; i++) {
    const dir = DIRS[i];
    let nx = x + DELTA[dir][0];
    const ny = y + DELTA[dir][1];
    if (y === tunnelRow) nx = (nx + w) % w;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

    const cell = grid[ny][nx];
    if (!cell || cell === '#') continue;

    if (role === 'runner') {
      if (cell === 'G' || cell === '-') continue;
    } else {
      if (from === 'G' && cell !== 'G' && cell !== '-') continue;
      if (cell === 'G' && from !== 'G' && from !== '-') continue;
    }

    result.push({ x: nx, y: ny, dir, idx: ny * w + nx });
  }
  return result;
}

function bfs(sources, role, grid, outDist, blockedIdx = -1) {
  const w = G_WIDTH;
  const h = G_HEIGHT;
  const tunnelRow = G_TUNNEL;
  outDist.fill(9999);

  if (!sources || !sources.length) return;

  const token = nextToken();
  let head = 0;
  let tail = 0;

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const idx = s.y * w + s.x;
    if (idx === blockedIdx) continue;
    if (tokenBuf[idx] !== token) {
      tokenBuf[idx] = token;
      outDist[idx] = 0;
      qBuf[tail++] = idx;
    }
  }

  while (head < tail) {
    const curIdx = qBuf[head++];
    const curDist = outDist[curIdx];
    const cx = curIdx % w;
    const cy = (curIdx / w) | 0;
    const from = grid[cy][cx];

    for (let i = 0; i < 4; i++) {
      const dir = DIRS[i];
      let nx = cx + DELTA[dir][0];
      const ny = cy + DELTA[dir][1];
      if (cy === tunnelRow) nx = (nx + w) % w;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

      const cell = grid[ny][nx];
      if (!cell || cell === '#') continue;

      if (role === 'runner') {
        if (cell === 'G' || cell === '-') continue;
      } else {
        if (from === 'G' && cell !== 'G' && cell !== '-') continue;
        if (cell === 'G' && from !== 'G' && from !== '-') continue;
      }

      const nIdx = ny * w + nx;
      if (nIdx === blockedIdx) continue;

      if (tokenBuf[nIdx] !== token) {
        tokenBuf[nIdx] = token;
        outDist[nIdx] = curDist + 1;
        qBuf[tail++] = nIdx;
      }
    }
  }
}

function countSafeVoronoiArea(startCell, grid, ghostDist, moveDist) {
  const w = G_WIDTH;
  const h = G_HEIGHT;
  const tunnelRow = G_TUNNEL;
  const startIdx = startCell.y * w + startCell.x;
  if (ghostDist[startIdx] <= 1) return 0;

  const token = nextToken();
  let head = 0;
  let tail = 0;

  tokenBuf[startIdx] = token;
  qBuf[tail++] = startIdx;
  let count = 0;

  while (head < tail) {
    const curIdx = qBuf[head++];
    count++;
    if (count >= 30) break;

    const cx = curIdx % w;
    const cy = (curIdx / w) | 0;

    for (let i = 0; i < 4; i++) {
      const dir = DIRS[i];
      let nx = cx + DELTA[dir][0];
      const ny = cy + DELTA[dir][1];
      if (cy === tunnelRow) nx = (nx + w) % w;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

      const cell = grid[ny][nx];
      if (!cell || cell === '#' || cell === 'G' || cell === '-') continue;

      const nIdx = ny * w + nx;
      if (moveDist[nIdx] >= ghostDist[nIdx]) continue;

      if (tokenBuf[nIdx] !== token) {
        tokenBuf[nIdx] = token;
        qBuf[tail++] = nIdx;
      }
    }
  }

  return count;
}

// -----------------------------------------------------------------------------
// GHOST STRATEGY ("PHANTOM")
// -----------------------------------------------------------------------------
function moveGhost(state) {
  const you = state.you;
  const w = state.width;
  const h = state.height;
  const tunnelRow = state.tunnelRow;
  const grid = state.grid;
  const nextTick = state.tick + 1;

  ensureBuffers(w, h, tunnelRow);

  if (you.frightened && nextTick % 2 === 1) return 'stay';

  const legal = getLegalNeighbors(you.x, you.y, 'ghost', grid);
  if (!legal.length) return 'stay';

  // 1. PEN TRANSIT & SANCTUARY
  const doors = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === '-') doors.push({ x, y });
    }
  }

  if (you.inPen) {
    if (!doors.length) return legal[0].dir;
    bfs(doors, 'ghost', grid, dTarget);

    if (you.releaseIn > 1) {
      const penMoves = legal.filter(n => grid[n.y][n.x] === 'G');
      if (penMoves.length) {
        penMoves.sort((a, b) => dTarget[a.idx] - dTarget[b.idx]);
        return penMoves[0].dir;
      }
      return 'stay';
    } else {
      legal.sort((a, b) => dTarget[a.idx] - dTarget[b.idx]);
      return legal[0].dir;
    }
  }

  // 2. EXTERIOR GHOSTS
  const livingRunners = state.runners.filter(r => r.alive && !r.respawnIn);
  if (!livingRunners.length) return legal[0].dir;

  // Frightened Evasion: Retreat to Pen Sanctuary or Flee towards open loops
  if (you.frightened) {
    bfs(livingRunners, 'ghost', grid, dRunner);

    // If door is accessible, enter pen sanctuary (runners cannot enter pen door)
    if (doors.length) {
      const safePenMoves = legal.filter(m => grid[m.y][m.x] === '-');
      if (safePenMoves.length) {
        return safePenMoves[0].dir;
      }
    }

    legal.sort((a, b) => {
      const da = dRunner[a.idx];
      const db = dRunner[b.idx];
      const degreeA = getLegalNeighbors(a.x, a.y, 'ghost', grid).length;
      const degreeB = getLegalNeighbors(b.x, b.y, 'ghost', grid).length;
      return (db * 10 + degreeB) - (da * 10 + degreeA);
    });
    return legal[0].dir;
  }

  // Dangerous Ghost: Check immediate catch
  for (let i = 0; i < legal.length; i++) {
    const m = legal[i];
    for (let j = 0; j < livingRunners.length; j++) {
      const r = livingRunners[j];
      if (r.invulnerable) continue;
      if (r.x === m.x && r.y === m.y) {
        if (grid[m.y][m.x] !== 'o') return m.dir;
      }
    }
  }

  // Anti-Suicide: Beware runners adjacent to 'o'
  const dangerousPowerPellets = [];
  for (let i = 0; i < livingRunners.length; i++) {
    const r = livingRunners[i];
    const rAdj = getLegalNeighbors(r.x, r.y, 'runner', grid);
    for (let j = 0; j < rAdj.length; j++) {
      if (grid[rAdj[j].y][rAdj[j].x] === 'o') {
        dangerousPowerPellets.push({ runner: r, power: rAdj[j] });
      }
    }
  }

  // Multi-Ghost Target Assignment: distribute across all living runners
  const activeGhosts = state.ghosts.filter(g => !g.inPen && !g.frightened);
  const myGhostIndex = activeGhosts.findIndex(g => g.id === you.id);
  const myIndex = myGhostIndex >= 0 ? myGhostIndex : 0;

  const sortedRunners = livingRunners.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const assignedRunner = sortedRunners[myIndex % sortedRunners.length];
  const isPrimary = (myIndex < sortedRunners.length);

  const rIdx = assignedRunner.y * w + assignedRunner.x;
  let target = { x: assignedRunner.x, y: assignedRunner.y };
  let blockRunnerCell = false;

  if (isPrimary) {
    // Interceptor: Predict forward path to next junction to meet head-on
    let curX = assignedRunner.x;
    let curY = assignedRunner.y;
    let curDir = assignedRunner.dir !== 'stay' ? assignedRunner.dir : 'up';

    for (let step = 0; step < 5; step++) {
      let nx = curX + DELTA[curDir][0];
      const ny = curY + DELTA[curDir][1];
      if (curY === tunnelRow) nx = (nx + w) % w;
      const cell = grid[ny] && grid[ny][nx];
      if (!cell || cell === '#' || cell === 'G' || cell === '-') break;
      curX = nx;
      curY = ny;
      const neighbors = getLegalNeighbors(curX, curY, 'runner', grid);
      if (neighbors.length >= 3) break;
    }

    target = { x: curX, y: curY };
    blockRunnerCell = true;
  } else {
    // Secondary Ghost: Cut off closest power pellet to runner
    if (state.powerPellets && state.powerPellets.length) {
      bfs([assignedRunner], 'runner', grid, dRunner);
      let bestP = null;
      let minD = 9999;
      state.powerPellets.forEach(p => {
        const pIdx = p.y * w + p.x;
        const d = dRunner[pIdx];
        if (d < minD) {
          minD = d;
          bestP = p;
        }
      });
      if (bestP) target = bestP;
    }
  }

  const blockedIdx = blockRunnerCell ? rIdx : -1;
  bfs([target], 'ghost', grid, dTarget, blockedIdx);

  if (dTarget[you.y * w + you.x] >= 9999) {
    bfs([target], 'ghost', grid, dTarget);
  }

  const scoredLegal = legal.map(m => {
    let score = -dTarget[m.idx];

    for (let k = 0; k < dangerousPowerPellets.length; k++) {
      const dp = dangerousPowerPellets[k];
      const distToRunner = Math.abs(m.x - dp.runner.x) + Math.abs(m.y - dp.runner.y);
      if (distToRunner <= 1) {
        score -= 5000;
      }
    }

    return { dir: m.dir, score };
  });

  scoredLegal.sort((a, b) => b.score - a.score);
  return scoredLegal[0].dir;
}

// -----------------------------------------------------------------------------
// RUNNER STRATEGY ("AEGIS")
// -----------------------------------------------------------------------------
function moveRunner(state) {
  const you = state.you;
  const w = state.width;
  const h = state.height;
  const tunnelRow = state.tunnelRow;
  const grid = state.grid;

  if (!you.alive || you.respawnIn) return 'stay';

  ensureBuffers(w, h, tunnelRow);

  // Record history to prevent oscillation loops
  const curIdx = you.y * w + you.x;
  runnerHistory[rHistoryHead % 32] = curIdx;
  rHistoryHead++;

  const legal = getLegalNeighbors(you.x, you.y, 'runner', grid);
  if (!legal.length) return 'stay';

  // Threats & Edibles
  const dangerousGhosts = state.ghosts.filter(g => {
    if (!g.alive || g.inPen) return false;
    if (g.frightened && state.frightTicksLeft > 2) return false;
    return true;
  });

  const edibleGhosts = state.ghosts.filter(g => {
    return g.alive && !g.inPen && g.frightened && state.frightTicksLeft > 3;
  });

  bfs(dangerousGhosts, 'ghost', grid, dGhostDanger);
  bfs(edibleGhosts, 'ghost', grid, dGhostEdible);

  const otherRunners = state.runners.filter(r => r.alive && !r.respawnIn && r.id !== you.id);

  // Pellets & Power Pellets
  const pellets = [];
  const powerPellets = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (c === '.' || c === 'o') {
        const pObj = { x, y, isPower: c === 'o', idx: y * w + x };
        pellets.push(pObj);
        if (c === 'o') powerPellets.push(pObj);
      }
    }
  }

  // Pre-calculate immediate ghost reachability (1-step catch)
  const ghostNextCells = new Set();
  const ghostCurrentCells = new Set();
  if (!you.invulnerable) {
    for (let i = 0; i < dangerousGhosts.length; i++) {
      const g = dangerousGhosts[i];
      ghostCurrentCells.add(g.y * w + g.x);
      const gAdj = getLegalNeighbors(g.x, g.y, 'ghost', grid);
      for (let j = 0; j < gAdj.length; j++) {
        ghostNextCells.add(gAdj[j].idx);
      }
    }
  }

  const scoredMoves = legal.map((move, mIdxOrder) => {
    const mIdx = move.idx;
    const isPowerCell = grid[move.y][move.x] === 'o';
    const isPelletCell = grid[move.y][move.x] === '.';
    const moveDangerDist = dGhostDanger[mIdx];

    const mDistBuf = dMoveBufs[mIdxOrder];
    bfs([move], 'runner', grid, mDistBuf);

    let score = 0;

    // 1. HARD SAFETY & IMMEDIATE COLLISION
    const willCollide = ghostNextCells.has(mIdx);
    const willSwap = ghostCurrentCells.has(mIdx);

    if (!you.invulnerable && dangerousGhosts.length) {
      if (willCollide || willSwap) {
        if (isPowerCell) {
          score += 50000; // Power pellet kills ghost before contact!
        } else {
          score -= 1000000; // Certain death
        }
      }

      // Check if this move is part of a safe Power Pellet Rush ("NukeRush")
      let powerRush = false;
      for (let p = 0; p < powerPellets.length; p++) {
        const pp = powerPellets[p];
        const rDistToPower = mDistBuf[pp.idx];
        const gDistToPower = dGhostDanger[pp.idx];
        if (rDistToPower < gDistToPower && rDistToPower <= 10) {
          score += (12 - rDistToPower) * 600;
          powerRush = true;
        }
      }

      if (!powerRush) {
        if (moveDangerDist <= 1) score -= 150000;
        else if (moveDangerDist <= 2) score -= 30000;
        else if (moveDangerDist <= 3) score -= 4000;
      } else {
        if (moveDangerDist <= 1 && !isPowerCell) score -= 150000;
      }

      // Safe Voronoi Area Check (Dead-End / Pocket Prevention)
      if (moveDangerDist <= 6 && !powerRush) {
        const safeArea = countSafeVoronoiArea(move, grid, dGhostDanger, mDistBuf);
        if (safeArea < 8) {
          score -= (8 - safeArea) * 3000;
        } else {
          score += safeArea * 20;
        }
      }
    }

    // 2. POWER PELLET STRATEGY
    if (isPowerCell) {
      if (moveDangerDist <= 3) {
        score += 40000; // Lifesaver
      } else if (moveDangerDist <= 8 && edibleGhosts.length === 0) {
        score += 15000; // Attack strike
      } else if (state.frightTicksLeft > 15 || dangerousGhosts.length === 0) {
        score -= 600;
      } else {
        score += 2500;
      }
    }

    // 3. APEX PREDATOR: HUNT EDIBLE GHOSTS
    if (edibleGhosts.length && state.frightTicksLeft > 3) {
      let minEDist = 9999;
      for (let i = 0; i < edibleGhosts.length; i++) {
        const eg = edibleGhosts[i];
        const egIdx = eg.y * w + eg.x;
        const d = mDistBuf[egIdx];
        if (d < minEDist) minEDist = d;
      }

      if (minEDist * 2 < state.frightTicksLeft - 2) {
        score += 18000 / (minEDist + 1);
      }
    }

    // 4. REPETITION / OSCILLATION PENALTY FOR EMPTY FLOOR
    if (!isPelletCell && !isPowerCell) {
      let visits = 0;
      for (let i = 0; i < 32; i++) {
        if (runnerHistory[i] === mIdx) visits++;
      }
      if (visits > 0) {
        score -= visits * 200;
      }
    }

    // 5. PELLET COLLECTION & PARTITIONING
    if (pellets.length) {
      let nearestPelletDist = 9999;
      let clusterScore = 0;

      for (let i = 0; i < pellets.length; i++) {
        const p = pellets[i];
        if (p.isPower && state.frightTicksLeft > 15 && pellets.length > 5) continue;
        const d = mDistBuf[p.idx];

        // Teammate partitioning in multi-runner games
        let closerToTeammate = false;
        for (let t = 0; t < otherRunners.length; t++) {
          const tm = otherRunners[t];
          const tDist = Math.abs(tm.x - p.x) + Math.abs(tm.y - p.y);
          if (tDist < d) {
            closerToTeammate = true;
            break;
          }
        }
        if (closerToTeammate && pellets.length > 10) continue;

        if (d < nearestPelletDist) {
          nearestPelletDist = d;
        }
        if (d <= 8) {
          clusterScore += 1 / (d + 1);
        }
      }

      if (isPelletCell) {
        score += (pellets.length <= 15 ? 600 : 180);
      }

      if (nearestPelletDist < 9999) {
        const pelletWeight = (pellets.length <= 15 ? 1500 : 500);
        score += pelletWeight / (nearestPelletDist + 1);
      }

      score += clusterScore * 15;
    }

    // 6. MOMENTUM
    if (move.dir === you.dir) {
      score += 10;
    }
    if (move.dir === REV[you.dir] && !isPelletCell && !isPowerCell) {
      score -= 20;
    }

    return { dir: move.dir, score };
  });

  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves[0].dir;
}

// -----------------------------------------------------------------------------
// BOT EXPORT (BOT_API.md COMPLIANT)
// -----------------------------------------------------------------------------
module.exports = {
  name: 'AegisPhantom',
  move(state) {
    try {
      if (state.you.role === 'ghost') {
        return moveGhost(state);
      } else {
        return moveRunner(state);
      }
    } catch (e) {
      return 'stay';
    }
  }
};
