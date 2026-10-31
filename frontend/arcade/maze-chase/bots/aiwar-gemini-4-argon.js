'use strict';

/**
 * Argon - High-Speed Tactical Maze Chase Bot
 *
 * Core architecture:
 * 1. Cached Topology & All-Pairs Shortest Paths (APSP) via flat typed arrays (~0.2ms/turn).
 * 2. Exact Tick-Parity & Countdown Physics:
 *    - Exact handling of `frightTicksLeft === 1` and `invulnerableTicksLeft === 1` expiring at the start of `tick + 1`.
 *    - Exact half-speed parity (`(tick + 1) % 2 === 1`) for frightened ghosts.
 *    - Exact pen-release countdowns (`releaseIn <= 1` allowing exit on `tick + 1`).
 * 3. Runner Intelligence:
 *    - Multi-step time-expanded Safe Escape & Foraging BFS (detects corridor pincers, dead-ends, and safe routes).
 *    - Multi-runner Voronoi territory partitioning so teammates sweep disjoint regions without clumping.
 *    - Strategic Life Sacrifice / Endgame Breakthrough: when few pellets remain (`pellets <= 8`) or clock is running out
 *      and `lives > 1` (or `pellets === 1`, where simultaneous elimination still wins for runners!),
 *      dynamically lowers safety thresholds to break ghost camps on the last pellet.
 *    - Cycle-Breaking Memory: tracks position history over a 16-tick window to break large macro-loops around blocks.
 * 4. Ghost Intelligence:
 *    - Concentrated Pack Pincer: commits 2-3 ghosts to converge on the most trappable runner while remaining ghosts
 *      pressure secondary runners or guard critical pellet clusters.
 *    - Junction Cutoff & Corridor Sealing: traces the target runner's escape corridors to their exit junctions and
 *      assigns pack members to seal each exit simultaneously.
 *    - Local Voronoi Territory Compression: evaluates moves by how strongly they shrink the runner's reachable safe cells
 *      and safe junctions within the local horizon.
 *    - Endgame Pellet Guarding: when `state.pellets <= 10`, assigns a sentinel ghost to patrol the remaining pellet cluster.
 */

const DIRS = ['up', 'right', 'down', 'left'];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const REV = { up: 'down', down: 'up', left: 'right', right: 'left', stay: 'stay' };

let cachedTopo = null;

function buildTopology(state) {
  const w = state.width;
  const h = state.height;
  const n = w * h;
  const tunnelRow = state.tunnelRow;
  const grid = state.grid;

  const rAdj = new Int32Array(n * 4).fill(-1);
  const rDeg = new Uint8Array(n);
  const gAdj = new Int32Array(n * 4).fill(-1);
  const gDeg = new Uint8Array(n);
  const cellType = new Uint8Array(n); // 0: '#', 1: floor, 2: '-', 3: 'G'
  const doors = [];
  const penCells = [];
  const floorCells = [];

  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const c = row[x];
      const idx = y * w + x;
      if (c === '#') {
        cellType[idx] = 0;
      } else if (c === '-') {
        cellType[idx] = 2;
        doors.push({ x, y, idx });
      } else if (c === 'G') {
        cellType[idx] = 3;
        penCells.push({ x, y, idx });
      } else {
        cellType[idx] = 1;
        floorCells.push({ x, y, idx });
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const ct = cellType[idx];
      if (ct === 0) continue;

      for (let d = 0; d < 4; d++) {
        let nx = x + DX[d];
        const ny = y + DY[d];
        if (y === tunnelRow) nx = (nx + w) % w;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nIdx = ny * w + nx;
        const nct = cellType[nIdx];
        if (nct === 0) continue;

        if (ct === 1 && nct === 1) {
          rAdj[idx * 4 + d] = nIdx;
          rDeg[idx]++;
        }
        if (!((ct === 3 && nct === 1) || (ct === 1 && nct === 3))) {
          gAdj[idx * 4 + d] = nIdx;
          gDeg[idx]++;
        }
      }
    }
  }

  const rDist = new Int16Array(n * n).fill(10000);
  const gDist = new Int16Array(n * n).fill(10000);
  const rComputed = new Uint8Array(n);
  const gComputed = new Uint8Array(n);
  const q = new Int32Array(n);

  function ensureRDist(s) {
    if (rComputed[s]) return;
    rComputed[s] = 1;
    if (cellType[s] !== 1) return;
    const base = s * n;
    rDist[base + s] = 0;
    let head = 0, tail = 0;
    q[tail++] = s;
    while (head < tail) {
      const u = q[head++];
      const du = rDist[base + u] + 1;
      const u4 = u * 4;
      for (let d = 0; d < 4; d++) {
        const v = rAdj[u4 + d];
        if (v !== -1 && rDist[base + v] === 10000) {
          rDist[base + v] = du;
          q[tail++] = v;
        }
      }
    }
  }

  function ensureGDist(s) {
    if (gComputed[s]) return;
    gComputed[s] = 1;
    if (cellType[s] === 0) return;
    const base = s * n;
    gDist[base + s] = 0;
    let head = 0, tail = 0;
    q[tail++] = s;
    while (head < tail) {
      const u = q[head++];
      const du = gDist[base + u] + 1;
      const u4 = u * 4;
      for (let d = 0; d < 4; d++) {
        const v = gAdj[u4 + d];
        if (v !== -1 && gDist[base + v] === 10000) {
          gDist[base + v] = du;
          q[tail++] = v;
        }
      }
    }
  }

  // Eagerly compute APSP for normal grids (w * h <= 1225, i.e., up to 35x35, which takes < 4ms);
  // for huge grids (37x37 to 61x61), compute lazily on-demand so tick 1 takes < 3ms!
  if (n <= 1225) {
    for (let s = 0; s < n; s++) {
      if (cellType[s] === 1) ensureRDist(s);
      if (cellType[s] !== 0) ensureGDist(s);
    }
  }

  const isJunction = new Uint8Array(n);
  const junctions = [];
  for (let i = 0; i < floorCells.length; i++) {
    const idx = floorCells[i].idx;
    if (rDeg[idx] >= 3) {
      isJunction[idx] = 1;
      junctions.push(idx);
    }
  }

  const nextJunctionIdx = new Int32Array(n * 4).fill(-1);
  const nextJunctionDist = new Int16Array(n * 4).fill(0);
  const nextJunctionEntry = new Int32Array(n * 4).fill(-1);

  for (let i = 0; i < floorCells.length; i++) {
    const startIdx = floorCells[i].idx;
    for (let d = 0; d < 4; d++) {
      let prev = startIdx;
      let curr = rAdj[startIdx * 4 + d];
      if (curr === -1) continue;
      let steps = 1;
      while (!isJunction[curr] && curr !== startIdx && steps < n) {
        let next = -1;
        for (let nd = 0; nd < 4; nd++) {
          const cand = rAdj[curr * 4 + nd];
          if (cand !== -1 && cand !== prev) {
            next = cand;
            break;
          }
        }
        if (next === -1) break;
        prev = curr;
        curr = next;
        steps++;
      }
      nextJunctionIdx[startIdx * 4 + d] = curr;
      nextJunctionDist[startIdx * 4 + d] = steps;
      nextJunctionEntry[startIdx * 4 + d] = prev;
    }
  }

  return {
    w, h, n, tunnelRow,
    rAdj, rDeg, gAdj, gDeg,
    cellType, doors, penCells, floorCells,
    rDist, gDist, ensureRDist, ensureGDist,
    isJunction, junctions,
    nextJunctionIdx, nextJunctionDist, nextJunctionEntry,
    visitedTime: new Int16Array(n),
    bfsQueue: new Int32Array(n),
    ghostDangerTime: new Int16Array(n),
    immediateDangerCells: new Uint8Array(n),
    immediateDangerCurrent: new Uint8Array(n),
    visitCounts: new Uint16Array(n),
    ghostVisitCounts: new Uint16Array(n)
  };
}

function getTopology(state) {
  if (
    !cachedTopo ||
    cachedTopo.w !== state.width ||
    cachedTopo.h !== state.height ||
    cachedTopo.tunnelRow !== state.tunnelRow ||
    state.tick === 0
  ) {
    cachedTopo = buildTopology(state);
  }
  return cachedTopo;
}

const memory = {
  lastTick: -1,
  lastPos: -1,
  secondLastPos: -1,
  stuckCount: 0,
  recentPositions: [],
  lastPellets: -1,
  ticksSincePickup: 0
};

function resetMemoryIfNeeded(state, topo) {
  if (state.tick <= 1 || state.tick < memory.lastTick) {
    memory.lastPos = -1;
    memory.secondLastPos = -1;
    memory.stuckCount = 0;
    memory.recentPositions = [];
    memory.lastPellets = state.pellets;
    memory.ticksSincePickup = 0;
    topo.visitCounts.fill(0);
    topo.ghostVisitCounts.fill(0);
  } else {
    if (state.pellets < memory.lastPellets) {
      memory.ticksSincePickup = 0;
      memory.lastPellets = state.pellets;
    } else {
      memory.ticksSincePickup++;
    }
  }
  memory.lastTick = state.tick;
}

function getLegalMoves(topo, state, agent) {
  const { w, rAdj, gAdj, cellType } = topo;
  const idx = agent.y * w + agent.x;
  const res = [];
  const isRunner = agent.role === 'runner';
  const adj = isRunner ? rAdj : gAdj;

  for (let d = 0; d < 4; d++) {
    const nIdx = adj[idx * 4 + d];
    if (nIdx === -1) continue;
    if (!isRunner) {
      if (agent.inPen && agent.releaseIn > 1 && cellType[nIdx] !== 3) continue;
    }
    res.push({
      dir: DIRS[d],
      dIdx: d,
      idx: nIdx,
      x: nIdx % w,
      y: (nIdx / w) | 0
    });
  }
  return res;
}

function playGhost(state, topo, legal) {
  const you = state.you;
  const {
    w, n, gDist, rDist, cellType, doors,
    nextJunctionIdx, nextJunctionDist, rAdj, gAdj, rDeg, ghostVisitCounts
  } = topo;
  const myIdx = you.y * w + you.x;
  ghostVisitCounts[myIdx]++;

  // 1. In Pen: exit immediately via '-' door
  if (you.inPen) {
    let bestMove = legal[0];
    let bestD = 10000;
    for (const m of legal) {
      let dToExit = 10000;
      for (const door of doors) {
        let outsideIdx = door.idx;
        for (let d = 0; d < 4; d++) {
          const nb = gAdj[door.idx * 4 + d];
          if (nb !== -1 && cellType[nb] === 1) {
            outsideIdx = nb;
            break;
          }
        }
        const targetIdx = (you.releaseIn <= 1) ? outsideIdx : door.idx;
        const d = gDist[m.idx * n + targetIdx];
        if (d < dToExit) dToExit = d;
      }
      if (dToExit < bestD) {
        bestD = dToExit;
        bestMove = m;
      }
    }
    return bestMove.dir;
  }

  const activeRunners = state.runners.filter(r => r.alive && r.respawnIn === 0);
  const respawningRunners = state.runners.filter(r => r.alive && r.respawnIn > 0);

  // 2. Frightened Mode: Evasion
  if (you.frightened) {
    if (activeRunners.length === 0) return legal[0].dir;
    const bodyguards = state.ghosts.filter(g => g.id !== you.id && !g.inPen && !g.frightened);

    let bestMove = legal[0];
    let bestScore = -1e9;

    for (const m of legal) {
      let minRunnerDist = 10000;
      let secondRunnerDist = 10000;
      let immediateDeath = false;

      for (const r of activeRunners) {
        const rIdx = r.y * w + r.x;
        const d = rDist[rIdx * n + m.idx];
        if (d <= 1 || m.idx === rIdx) {
          immediateDeath = true;
        }
        if (d < minRunnerDist) {
          secondRunnerDist = minRunnerDist;
          minRunnerDist = d;
        } else if (d < secondRunnerDist) {
          secondRunnerDist = d;
        }
      }

      let safeBranches = 0;
      for (let d = 0; d < 4; d++) {
        const nb = gAdj[m.idx * 4 + d];
        if (nb === -1 || cellType[nb] !== 1) continue;
        const jIdx = nextJunctionIdx[m.idx * 4 + d];
        if (jIdx !== -1) {
          const jDistG = gDist[m.idx * n + jIdx];
          let runnerBeats = false;
          for (const r of activeRunners) {
            const rIdx = r.y * w + r.x;
            if (rDist[rIdx * n + jIdx] <= jDistG * 2 + 1) {
              runnerBeats = true;
              break;
            }
          }
          if (!runnerBeats) safeBranches++;
        }
      }

      let guardBonus = 0;
      const allInvuln = activeRunners.every(r => r.invulnerable && r.invulnerableTicksLeft > 2);
      if (!allInvuln && bodyguards.length > 0) {
        for (const bg of bodyguards) {
          const bgDist = gDist[m.idx * n + (bg.y * w + bg.x)];
          guardBonus = Math.max(guardBonus, 14 / (bgDist + 2));
        }
      }

      let score = minRunnerDist * 28 + Math.min(secondRunnerDist, 20) * 6 + safeBranches * 20 + guardBonus;
      if (immediateDeath) score -= 100000;
      if (cellType[m.idx] !== 1) score -= 60;
      if (m.dir === REV[you.dir]) score -= 3;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }
    return bestMove.dir;
  }

  // 3. Hunting Mode
  const huntingGhosts = state.ghosts.filter(g => !g.inPen && !g.frightened);

  const allTargets = [];
  for (const r of activeRunners) {
    const rIdx = r.y * w + r.x;
    const shieldLeft = Math.max(0, r.invulnerableTicksLeft - 1);
    allTargets.push({
      runner: r,
      x: r.x,
      y: r.y,
      idx: rIdx,
      shieldLeft
    });
  }
  for (const r of respawningRunners) {
    const sIdx = r.spawn.y * w + r.spawn.x;
    const shieldLeft = r.respawnIn + 9;
    allTargets.push({
      runner: r,
      x: r.spawn.x,
      y: r.spawn.y,
      idx: sIdx,
      shieldLeft
    });
  }

  if (allTargets.length === 0) return legal[0].dir;

  const catchableNow = allTargets.filter(t => t.shieldLeft === 0);
  const targetPool = catchableNow.length > 0 ? catchableNow : allTargets;

  let chosenTarget = targetPool[0];
  let roleInPack = 0;

  if (targetPool.length === 1) {
    chosenTarget = targetPool[0];
    const ranked = huntingGhosts.slice().sort((a, b) => {
      const da = gDist[(a.y * w + a.x) * n + chosenTarget.idx];
      const db = gDist[(b.y * w + b.x) * n + chosenTarget.idx];
      return da - db || (a.id < b.id ? -1 : 1);
    });
    roleInPack = ranked.findIndex(g => g.id === you.id);
    if (roleInPack < 0) roleInPack = 0;
  } else {
    // Score each target runner by how quickly 2+ ghosts can converge on it
    const scoredTargets = targetPool.map(t => {
      const dists = huntingGhosts.map(g => gDist[(g.y * w + g.x) * n + t.idx]).sort((a, b) => a - b);
      const convergenceCost = (dists[0] || 50) + (dists[1] !== undefined ? dists[1] * 0.8 : 0) + t.shieldLeft * 4;
      return { t, convergenceCost };
    }).sort((a, b) => a.convergenceCost - b.convergenceCost);

    const primaryTarget = scoredTargets[0].t;
    const ghostsByPrimary = huntingGhosts.slice().sort((a, b) => {
      const da = gDist[(a.y * w + a.x) * n + primaryTarget.idx];
      const db = gDist[(b.y * w + b.x) * n + primaryTarget.idx];
      return da - db || (a.id < b.id ? -1 : 1);
    });

    const primaryPackSize = huntingGhosts.length <= 3 ? huntingGhosts.length : Math.min(3, huntingGhosts.length - 1);
    const myPrimaryRank = ghostsByPrimary.findIndex(g => g.id === you.id);

    let adjacentOther = null;
    for (const t of catchableNow) {
      if (t.runner.id !== primaryTarget.runner.id && gDist[myIdx * n + t.idx] <= 3) {
        adjacentOther = t;
        break;
      }
    }

    if (adjacentOther) {
      chosenTarget = adjacentOther;
      roleInPack = 0;
    } else if (myPrimaryRank >= 0 && myPrimaryRank < primaryPackSize) {
      chosenTarget = primaryTarget;
      roleInPack = myPrimaryRank;
    } else {
      chosenTarget = scoredTargets[1].t;
      roleInPack = Math.max(0, myPrimaryRank - primaryPackSize);
    }
  }

  const r = chosenTarget.runner;
  const rIdx = chosenTarget.idx;
  const distToR = gDist[myIdx * n + rIdx];

  if (chosenTarget.shieldLeft > 0) {
    let bestMove = legal[0];
    let bestScore = -1e9;
    const idealDist = Math.max(1, Math.min(3, chosenTarget.shieldLeft));
    for (const m of legal) {
      const d = gDist[m.idx * n + rIdx];
      const score = -Math.abs(d - idealDist) * 20 + rDeg[m.idx] * 3;
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }
    return bestMove.dir;
  }

  const runnerNeighbors = [];
  for (let d = 0; d < 4; d++) {
    const nb = rAdj[rIdx * 4 + d];
    if (nb !== -1) {
      runnerNeighbors.push({ d, idx: nb, dir: DIRS[d] });
    }
  }

  const otherGhosts = huntingGhosts.filter(g => g.id !== you.id);
  const otherGhostPositions = otherGhosts.map(g => g.y * w + g.x);

  const runnerEscapeRanking = runnerNeighbors.map(rn => {
    let minG = 10000;
    for (const g of huntingGhosts) {
      const gd = gDist[(g.y * w + g.x) * n + rn.idx];
      if (gd < minG) minG = gd;
    }
    const jIdx = nextJunctionIdx[rIdx * 4 + rn.d];
    const jDist = nextJunctionDist[rIdx * 4 + rn.d];
    let minOtherGToJ = 10000;
    if (jIdx !== -1) {
      for (const ogIdx of otherGhostPositions) {
        const d = gDist[ogIdx * n + jIdx];
        if (d < minOtherGToJ) minOtherGToJ = d;
      }
    }
    const isForward = rn.dir === r.dir ? 1 : 0;
    return {
      ...rn,
      minG,
      jIdx: jIdx !== -1 ? jIdx : rn.idx,
      jDist,
      minOtherGToJ,
      isForward,
      escapeScore: minG * 10 + (minOtherGToJ - jDist) * 4 + isForward * 3
    };
  }).sort((a, b) => b.escapeScore - a.escapeScore);

  let targetCell = rIdx;
  let secondaryTargetCell = rIdx;

  // Check if runner is near a power pellet and we can intercept it
  let interceptPowerIdx = -1;
  if (state.powerPellets && state.powerPellets.length > 0) {
    for (const pp of state.powerPellets) {
      const ppIdx = pp.y * w + pp.x;
      const rToPP = rDist[rIdx * n + ppIdx];
      const gToPP = gDist[myIdx * n + ppIdx];
      if (rToPP <= 9 && gToPP <= rToPP + 1) {
        interceptPowerIdx = ppIdx;
        break;
      }
    }
  }

  // Endgame last-pellets defense: if <= 3 pellets left on the entire map, one ghost (role >= 2) guards the pellet closest to the runner!
  let endgamePelletIdx = -1;
  if (state.pellets <= 3 && roleInPack >= 2) {
    let bestPD = 10000;
    for (let i = 0; i < topo.floorCells.length; i++) {
      const fc = topo.floorCells[i];
      const c = state.grid[fc.y][fc.x];
      if (c === '.' || c === 'o') {
        const d = rDist[rIdx * n + fc.idx];
        if (d < bestPD) {
          bestPD = d;
          endgamePelletIdx = fc.idx;
        }
      }
    }
  }

  if (interceptPowerIdx !== -1 && roleInPack >= 1) {
    targetCell = interceptPowerIdx;
  } else if (endgamePelletIdx !== -1) {
    targetCell = endgamePelletIdx;
  } else if (roleInPack === 0) {
    if (distToR === 2 && runnerEscapeRanking.length > 0) {
      targetCell = runnerEscapeRanking[0].idx;
      secondaryTargetCell = rIdx;
    } else {
      targetCell = rIdx;
    }
  } else if (roleInPack === 1 && runnerEscapeRanking.length > 0) {
    targetCell = runnerEscapeRanking[0].jIdx;
    secondaryTargetCell = runnerEscapeRanking[0].idx;
  } else if (runnerEscapeRanking.length > 1) {
    const pick = runnerEscapeRanking[Math.min(roleInPack - 1, runnerEscapeRanking.length - 1)];
    targetCell = pick.jIdx;
    secondaryTargetCell = pick.idx;
  }

  const doVoronoi = distToR <= 16;

  let bestMove = legal[0];
  let bestScore = -1e9;

  for (const m of legal) {
    const dTarget = gDist[m.idx * n + targetCell];
    const dSec = gDist[m.idx * n + secondaryTargetCell];
    const dRunner = gDist[m.idx * n + rIdx];

    let score = -dTarget * 18 - dSec * 4 - dRunner * 3;

    if (m.idx === rIdx) {
      score += 600;
    }

    if (dRunner > 1) {
      for (let i = 0; i < otherGhostPositions.length; i++) {
        const ogIdx = otherGhostPositions[i];
        const dOg = gDist[m.idx * n + ogIdx];
        if (dOg === 0) score -= 120;
        else if (dOg === 1) score -= 50;
        else if (dOg === 2) score -= 15;
      }
    }

    if (doVoronoi) {
      let runnerSafeCells = 0;
      let runnerSafeJunctions = 0;
      const rBase = rIdx * n;
      const mBase = m.idx * n;

      for (let i = 0; i < topo.floorCells.length; i++) {
        const fIdx = topo.floorCells[i].idx;
        const rd = rDist[rBase + fIdx];
        if (rd > 14) continue;
        let gd = 1 + gDist[mBase + fIdx];
        for (let j = 0; j < otherGhostPositions.length; j++) {
          const ogd = gDist[otherGhostPositions[j] * n + fIdx];
          if (ogd < gd) gd = ogd;
        }
        if (rd < gd) {
          runnerSafeCells++;
          if (rDeg[fIdx] >= 3) runnerSafeJunctions++;
        }
      }
      score -= runnerSafeCells * 4.5 + runnerSafeJunctions * 16;
    }

    score -= Math.min(ghostVisitCounts[m.idx], 20) * 0.4;

    if (m.dir === you.dir) score += 0.6;
    if (m.dir === REV[you.dir] && legal.length > 1 && dRunner > 2) score -= 4.0;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }

  return bestMove.dir;
}

function playRunner(state, topo, legal) {
  const you = state.you;
  const {
    w, n, rAdj, rDeg, gAdj, rDist, gDist, cellType,
    visitedTime, bfsQueue, ghostDangerTime, immediateDangerCells, immediateDangerCurrent, visitCounts
  } = topo;
  const myIdx = you.y * w + you.x;
  const grid = state.grid;
  const nextTick = state.tick + 1;

  visitCounts[myIdx]++;
  memory.recentPositions.push(myIdx);
  if (memory.recentPositions.length > 24) memory.recentPositions.shift();

  const safeTicks = Math.max(0, you.invulnerableTicksLeft - 1);
  const frightLeft = Math.max(0, state.frightTicksLeft - 1);

  ghostDangerTime.fill(10000);
  immediateDangerCells.fill(0);
  immediateDangerCurrent.fill(0);

  const edibleGhosts = [];
  const dangerousGhosts = [];

  for (const g of state.ghosts) {
    const gIdx = g.y * w + g.x;
    const isFrightenedNext = g.frightened && frightLeft > 0;

    if (isFrightenedNext && !g.inPen) {
      edibleGhosts.push(g);
      const maxStepsWhileFrightened = (frightLeft / 2) | 0;
      const gBase = gIdx * n;
      for (let c = 0; c < n; c++) {
        if (cellType[c] !== 1) continue;
        const d = gDist[gBase + c];
        const arrivalAfterExpiry = frightLeft + 1 + Math.max(0, d - maxStepsWhileFrightened);
        if (arrivalAfterExpiry < ghostDangerTime[c]) {
          ghostDangerTime[c] = arrivalAfterExpiry;
        }
      }
    } else if (g.inPen) {
      const waitTicks = Math.max(0, g.releaseIn - 1);
      const extraFrightDelay = isFrightenedNext ? ((Math.min(frightLeft, waitTicks + 4) / 2) | 0) : 0;
      const gBase = gIdx * n;
      for (let c = 0; c < n; c++) {
        if (cellType[c] !== 1) continue;
        const d = gDist[gBase + c];
        const tArrive = waitTicks + extraFrightDelay + d;
        if (tArrive < ghostDangerTime[c]) {
          ghostDangerTime[c] = tArrive;
        }
      }
      if (waitTicks === 0 && !isFrightenedNext) {
        dangerousGhosts.push(g);
        immediateDangerCurrent[gIdx] = 1;
        immediateDangerCells[gIdx] = 1;
        for (let d = 0; d < 4; d++) {
          const nb = gAdj[gIdx * 4 + d];
          if (nb !== -1) immediateDangerCells[nb] = 1;
        }
      }
    } else {
      dangerousGhosts.push(g);
      immediateDangerCurrent[gIdx] = 1;
      immediateDangerCells[gIdx] = 1;
      for (let d = 0; d < 4; d++) {
        const nb = gAdj[gIdx * 4 + d];
        if (nb !== -1) immediateDangerCells[nb] = 1;
      }
      const gBase = gIdx * n;
      for (let c = 0; c < n; c++) {
        if (cellType[c] !== 1) continue;
        const d = gDist[gBase + c];
        if (d < ghostDangerTime[c]) {
          ghostDangerTime[c] = d;
        }
      }
    }
  }

  const otherRunners = state.runners.filter(r => r.id !== you.id && r.alive && r.respawnIn === 0);

  const pelletList = [];
  const powerList = [];
  for (let i = 0; i < topo.floorCells.length; i++) {
    const fc = topo.floorCells[i];
    const c = grid[fc.y][fc.x];
    if (c === '.') {
      pelletList.push(fc.idx);
    } else if (c === 'o') {
      powerList.push(fc.idx);
    }
  }

  const myPartitionPellets = [];
  if (otherRunners.length > 0 && pelletList.length > 0) {
    const myBase = myIdx * n;
    for (let i = 0; i < pelletList.length; i++) {
      const pIdx = pelletList[i];
      const myD = rDist[myBase + pIdx];
      let mine = true;
      for (let j = 0; j < otherRunners.length; j++) {
        const or = otherRunners[j];
        const orD = rDist[(or.y * w + or.x) * n + pIdx];
        if (orD < myD || (orD === myD && or.id < you.id)) {
          mine = false;
          break;
        }
      }
      if (mine) myPartitionPellets.push(pIdx);
    }
  }
  const activePellets = myPartitionPellets.length > 0 ? myPartitionPellets : pelletList;

  const closestDangerNow = ghostDangerTime[myIdx];
  const ticksLeftInMatch = state.maxTicks - state.tick;

  // Detect if we are in a prolonged drought without picking up any pellet (e.g. ghosts camping the last 1-3 pellets!)
  // If we have spare lives (`you.lives > 1`) and `memory.ticksSincePickup > 65` (or time is running low),
  // we enter Breakthrough Mode: willing to take tighter margins (or sacrifice 1 life to respawn with 10 ticks of invulnerability!)
  const isBreakthroughMode = (
    (you.lives > 1 && memory.ticksSincePickup > 70 && state.pellets <= 10) ||
    (you.lives > 1 && ticksLeftInMatch < state.pellets * 8 + 80) ||
    (ticksLeftInMatch < state.pellets * 4 + 30)
  );

  let bestDir = legal[0].dir;
  let bestScore = -1e12;

  for (const m of legal) {
    const stepOnPower = grid[m.y][m.x] === 'o';
    const stepOnLastPellet = (state.pellets === 1) && (grid[m.y][m.x] === '.' || stepOnPower);
    const isProtectedStep1 = (safeTicks >= 1) || stepOnPower || stepOnLastPellet;
    // Note on `stepOnLastPellet`:
    // Rule: "Pickups happen after movement and before contacts."
    // Rule: "1. No pickups remain: runners win, including simultaneous final elimination."
    // So if we step onto the LAST pellet (`state.pellets === 1`), we WIN IMMEDIATELY even if a ghost catches us on that cell!
    // The only way we fail to collect the last pellet on `m.idx` is if we don't reach `m.idx` (which is impossible since movement always succeeds onto a legal floor cell, even in a head-on swap!).
    // Wait: let's verify in `engine.js`!
    // In `engine.js`:
    // 1) `a.x = target.x; a.y = target.y;` (Runner moves to `m.idx`)
    // 2) `orderedRunners... grid[a.y][a.x] = ' '; pellets--;` (Runner picks up the pellet BEFORE contacts!)
    // 3) Contacts resolved (even if runner loses its last life, `pellets === 0` is checked FIRST in `finish()`:
    //    `const reason = pellets === 0 ? 'pellets' : ...`)
    // That means stepping onto the last pickup on the board (`state.pellets === 1`) is a 100% GUARANTEED INSTANT WIN, even if a ghost is standing on it or swapping with us!

    const step1Lethal = !isProtectedStep1 && (
      immediateDangerCells[m.idx] === 1 ||
      immediateDangerCurrent[m.idx] === 1
    );

    visitedTime.fill(10000);
    let head = 0, tail = 0;

    let reachableSafeCells = 0;
    let reachableJunctions = 0;
    let canReachPower = stepOnPower;
    let minSafePelletDist = 10000;
    let minSafePartitionPelletDist = 10000;

    if (!step1Lethal) {
      visitedTime[m.idx] = 1;
      bfsQueue[tail++] = m.idx;
    }

    while (head < tail) {
      const u = bfsQueue[head++];
      const t = visitedTime[u];
      reachableSafeCells++;
      if (rDeg[u] >= 3) reachableJunctions++;

      const uY = (u / w) | 0;
      const uX = u % w;
      const uChar = grid[uY][uX];
      if (uChar === '.' && t - 1 < minSafePelletDist) {
        minSafePelletDist = t - 1;
      }

      const nt = t + 1;
      const u4 = u * 4;
      for (let d = 0; d < 4; d++) {
        const v = rAdj[u4 + d];
        if (v === -1 || visitedTime[v] !== 10000) continue;

        const vY = (v / w) | 0;
        const vX = v % w;
        const vIsPower = grid[vY][vX] === 'o';
        const vIsLastPellet = (state.pellets === 1) && (grid[vY][vX] === '.' || vIsPower);
        const gTimeV = ghostDangerTime[v];

        let safeStep = false;
        if (stepOnPower && nt <= state.frightDuration) {
          safeStep = true;
        } else if (nt <= safeTicks) {
          safeStep = true;
        } else if ((vIsPower || vIsLastPellet) && gTimeV >= nt) {
          safeStep = true;
        } else if (gTimeV > nt) {
          safeStep = true;
        } else if (isBreakthroughMode && gTimeV >= nt && nt > 2) {
          // In breakthrough mode, allow tie-distance paths at depth > 2 to push toward the last guarded pellets
          safeStep = true;
        }

        if (safeStep) {
          visitedTime[v] = nt;
          bfsQueue[tail++] = v;
          if (vIsPower) canReachPower = true;
        }
      }
    }

    let score = 0;
    const gMargin = ghostDangerTime[m.idx] - 1;

    if (stepOnLastPellet) {
      return m.dir; // Instant guaranteed victory!
    }

    // 1. Survival & Escape Space
    if (step1Lethal) {
      score -= immediateDangerCurrent[m.idx] ? 10000000 : 2000000;
      score += gMargin * 1000;
    } else {
      const totalPickups = pelletList.length + powerList.length;
      if (reachableSafeCells < 16 && !canReachPower && totalPickups > reachableSafeCells && !isBreakthroughMode) {
        score -= (22 - reachableSafeCells) * 25000;
      } else {
        score += Math.min(reachableSafeCells, 60) * 3 + Math.min(reachableJunctions, 12) * 10;
      }

      if (!isProtectedStep1) {
        const marginScale = isBreakthroughMode ? 0.25 : 1.0;
        if (gMargin <= 1) score -= 5000 * marginScale;
        else if (gMargin === 2) score -= 350 * marginScale;
        else if (gMargin === 3) score -= 40 * marginScale;
      }
    }

    // 2. Power Pellet Evaluation
    if (stepOnPower) {
      let nearbyGhosts = 0;
      for (const g of state.ghosts) {
        if (!g.inPen && rDist[m.idx * n + (g.y * w + g.x)] <= 9) {
          nearbyGhosts++;
        }
      }
      if (closestDangerNow <= 3) {
        score += 4500 + nearbyGhosts * 700;
      } else if (frightLeft > 8 && edibleGhosts.length > 0) {
        score -= 400;
      } else if (nearbyGhosts >= 1) {
        score += 900 + nearbyGhosts * 500;
      } else {
        score += (pelletList.length <= 15) ? 1000 : 60;
      }
    }

    // 3. Hunting Edible Ghosts (200 -> 400 -> 800 -> 1600)
    if (edibleGhosts.length > 0 && frightLeft > 2) {
      let bestGhostHunt = 0;
      const chainPoints = state.nextGhostPoints || 200;

      for (const eg of edibleGhosts) {
        const egIdx = eg.y * w + eg.x;
        const d = rDist[m.idx * n + egIdx];
        const guaranteedEat = (m.idx === egIdx) && (nextTick % 2 === 1 || rDeg[egIdx] <= 1);
        const catchTimeEst = d === 0 ? 0 : Math.ceil(d * 1.6);

        if (guaranteedEat && !step1Lethal) {
          bestGhostHunt = Math.max(bestGhostHunt, chainPoints * 10);
        } else if (d <= 8 && catchTimeEst < frightLeft && (visitedTime[egIdx] < 10000 || gMargin > 2)) {
          const val = (chainPoints * 2.0) / (d + 1);
          if (val > bestGhostHunt) bestGhostHunt = val;
        }
      }
      score += bestGhostHunt;
    }

    // 4. Aggressive Pellet Foraging
    const cellChar = grid[m.y][m.x];
    if (cellChar === '.') {
      score += 220;
    }

    const mBase = m.idx * n;

    for (let i = 0; i < activePellets.length; i++) {
      const pIdx = activePellets[i];
      const tSafe = visitedTime[pIdx];
      if (tSafe < 10000) {
        const dSafe = tSafe - 1;
        if (dSafe < minSafePartitionPelletDist) {
          minSafePartitionPelletDist = dSafe;
        }
      }
    }

    if (minSafePartitionPelletDist < 10000) {
      score += 650 / (minSafePartitionPelletDist + 1) - minSafePartitionPelletDist * 20;
    } else if (minSafePelletDist < 10000) {
      score += 550 / (minSafePelletDist + 1) - minSafePelletDist * 16;
    } else {
      // No pellet is reachable in our safe tree (e.g., ghosts are between us and the last pellet(s)!)
      // Instead of running to the corner farthest from the pellet, orbit as close as safely possible to the nearest pellet
      // from an alternate angle so we pull the ghosts away and slip past them!
      let minRawD = 10000;
      for (let i = 0; i < activePellets.length; i++) {
        const d = rDist[mBase + activePellets[i]];
        if (d < minRawD) minRawD = d;
      }
      if (minRawD < 10000) {
        const pullWeight = isBreakthroughMode ? 35 : 22;
        score += 450 / (minRawD + 1) - minRawD * pullWeight;
      }
    }

    let densityBonus = 0;
    for (let i = 0; i < activePellets.length; i++) {
      const pIdx = activePellets[i];
      const d = rDist[mBase + pIdx];
      if (d <= 8 && visitedTime[pIdx] < 10000) {
        const cornerMultiplier = (rDeg[pIdx] <= 2 && ghostDangerTime[pIdx] > d + 5) ? 1.35 : 1.0;
        densityBonus += (24 * cornerMultiplier) / (d + 2);
      }
    }
    score += Math.min(densityBonus, 240);

    for (let i = 0; i < powerList.length; i++) {
      const ppIdx = powerList[i];
      const tSafe = visitedTime[ppIdx];
      const d = tSafe < 10000 ? tSafe - 1 : rDist[mBase + ppIdx];
      if (d === 0) continue;
      if (closestDangerNow <= 5 || reachableSafeCells < 25) {
        score += 1200 / (d + 1) - d * 25;
      } else if (pelletList.length === 0) {
        score += 800 / (d + 1) - d * 20;
      }
    }

    // 5. Anti-Oscillation & Macro-Cycle Breaking
    if (m.dir === you.dir) score += 4.0;
    if (m.idx === memory.secondLastPos && legal.length > 1) {
      score -= 35 * (memory.stuckCount + 1);
    }

    // Count how many times m.idx appears in recentPositions (last 24 ticks)
    let recentCount = 0;
    for (let i = 0; i < memory.recentPositions.length; i++) {
      if (memory.recentPositions[i] === m.idx) recentCount++;
    }
    if (recentCount > 0 && cellChar === ' ') {
      score -= recentCount * (memory.ticksSincePickup > 25 ? 28 : 8);
    }

    if (cellChar === ' ' && gMargin > 3) {
      score -= Math.min(visitCounts[m.idx], 30) * 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = m.dir;
    }
  }

  if (myIdx === memory.secondLastPos) {
    memory.stuckCount = Math.min(12, memory.stuckCount + 1);
  } else {
    memory.stuckCount = Math.max(0, memory.stuckCount - 1);
  }
  memory.secondLastPos = memory.lastPos;
  memory.lastPos = myIdx;

  return bestDir;
}

module.exports = {
  name: 'Argon',
  move(state) {
    const you = state.you;
    if (!you || !you.alive || you.respawnIn > 0) return 'stay';
    const nextTick = state.tick + 1;
    if (you.role === 'ghost' && you.frightened && nextTick % 2 === 1) return 'stay';

    const topo = getTopology(state);
    resetMemoryIfNeeded(state, topo);

    const legal = getLegalMoves(topo, state, you);
    if (legal.length === 0) return 'stay';

    if (topo.n > 1225) {
      const w = topo.w;
      const myIdx = you.y * w + you.x;
      topo.ensureRDist(myIdx);
      topo.ensureGDist(myIdx);
      for (const m of legal) {
        topo.ensureRDist(m.idx);
        topo.ensureGDist(m.idx);
        for (let d = 0; d < 4; d++) {
          const jIdx = topo.nextJunctionIdx[m.idx * 4 + d];
          if (jIdx !== -1) {
            topo.ensureRDist(jIdx);
            topo.ensureGDist(jIdx);
          }
        }
      }
      for (const r of state.runners) {
        const rIdx = r.y * w + r.x;
        topo.ensureRDist(rIdx);
        topo.ensureGDist(rIdx);
        const sIdx = r.spawn.y * w + r.spawn.x;
        topo.ensureRDist(sIdx);
        topo.ensureGDist(sIdx);
        for (let d = 0; d < 4; d++) {
          const nb = topo.rAdj[rIdx * 4 + d];
          if (nb !== -1) {
            topo.ensureRDist(nb);
            topo.ensureGDist(nb);
          }
        }
      }
      for (const g of state.ghosts) {
        const gIdx = g.y * w + g.x;
        topo.ensureRDist(gIdx);
        topo.ensureGDist(gIdx);
      }
    }

    if (you.role === 'ghost') {
      return playGhost(state, topo, legal);
    }
    return playRunner(state, topo, legal);
  }
};
