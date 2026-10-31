'use strict';

// ============================================================================
// ARGON - AI WAR Capture the Flag Bot
// ============================================================================

const ACT_LIST = ['up', 'down', 'left', 'right', 'stay'];
const DX = { up: 0, down: 0, left: -1, right: 1, stay: 0 };
const DY = { up: -1, down: 1, left: 0, right: 0, stay: 0 };

function compareId(a, b) {
  const sa = String(a.id);
  const sb = String(b.id);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function manhattan(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function isLiving(a) {
  return Boolean(a && !a.jailed && a.respawnIn === 0 && a.x !== null && a.y !== null);
}

// Per-worker persistent memory (resets when grid or tick resets)
let cachedMap = null;
let history = {
  lastTick: -1,
  myPos: [],           // recent positions of `you`
  myActions: [],       // recent actions of `you`
  enemyPos: new Map(), // id -> array of recent {x, y, tick}
  lastRole: null
};

function buildMapCache(state) {
  const w = state.width;
  const h = state.height;
  const n = w * h;
  const grid = state.grid;

  const open = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      if (row[x] === '.') open[y * w + x] = 1;
    }
  }

  // Precompute valid neighbors for each cell
  const neighbors = new Array(n);
  const degree = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!open[idx]) {
        neighbors[idx] = [];
        continue;
      }
      const list = [];
      for (let d = 0; d < 4; d++) {
        const act = ACT_LIST[d];
        const nx = x + DX[act];
        const ny = y + DY[act];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && open[ny * w + nx]) {
          list.push({ act, x: nx, y: ny, idx: ny * w + nx });
        }
      }
      degree[idx] = list.length;
      list.push({ act: 'stay', x, y, idx });
      neighbors[idx] = list;
    }
  }

  // Lazy row-based BFS cache: bfsCache[s] is an Int16Array(n) computed on first request for source cell `s`
  const bfsCache = new Array(n);
  const bfsQueue = new Int32Array(n);

  function getDistFrom(s) {
    let row = bfsCache[s];
    if (row) return row;
    row = new Int16Array(n);
    row.fill(30000);
    if (!open[s]) {
      bfsCache[s] = row;
      return row;
    }
    row[s] = 0;
    let head = 0, tail = 0;
    bfsQueue[tail++] = s;
    while (head < tail) {
      const cur = bfsQueue[head++];
      const d = row[cur] + 1;
      const nb = neighbors[cur];
      for (let i = 0; i < nb.length - 1; i++) {
        const nextIdx = nb[i].idx;
        if (row[nextIdx] === 30000) {
          row[nextIdx] = d;
          bfsQueue[tail++] = nextIdx;
        }
      }
    }
    bfsCache[s] = row;
    return row;
  }

  // Dead-end depth calculation (iterative leaf pruning)
  const deadEndDepth = new Uint8Array(n);
  const remDeg = new Uint8Array(degree);
  let qHead = 0, qTail = 0;
  for (let i = 0; i < n; i++) {
    if (open[i] && remDeg[i] === 1) {
      bfsQueue[qTail++] = i;
      deadEndDepth[i] = 1;
    }
  }
  while (qHead < qTail) {
    const cur = bfsQueue[qHead++];
    const nb = neighbors[cur];
    for (let i = 0; i < nb.length - 1; i++) {
      const nextIdx = nb[i].idx;
      if (remDeg[nextIdx] > 1) {
        remDeg[nextIdx]--;
        if (remDeg[nextIdx] === 1) {
          deadEndDepth[nextIdx] = deadEndDepth[cur] + 1;
          bfsQueue[qTail++] = nextIdx;
        }
      }
    }
  }

  // Multi-source BFS helper
  function multiSourceBFS(targets) {
    const dist = new Int16Array(n).fill(30000);
    let head = 0, tail = 0;
    for (const t of targets) {
      if (t >= 0 && t < n && open[t] && dist[t] === 30000) {
        dist[t] = 0;
        bfsQueue[tail++] = t;
      }
    }
    while (head < tail) {
      const cur = bfsQueue[head++];
      const d = dist[cur] + 1;
      const nb = neighbors[cur];
      for (let i = 0; i < nb.length - 1; i++) {
        const nextIdx = nb[i].idx;
        if (dist[nextIdx] === 30000) {
          dist[nextIdx] = d;
          bfsQueue[tail++] = nextIdx;
        }
      }
    }
    return dist;
  }

  const border = state.border;
  const westTargets = [];
  const eastTargets = [];
  const borderTargets = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!open[idx]) continue;
      if (x < border) westTargets.push(idx);
      else if (x > border) eastTargets.push(idx);
      else borderTargets.push(idx);
    }
  }

  const distToWest = multiSourceBFS(westTargets);
  const distToEast = multiSourceBFS(eastTargets);
  const distToBorder = multiSourceBFS(borderTargets);

  const rescueCells = { west: [], east: [] };
  const distToRescue = { west: null, east: null };
  for (const t of ['west', 'east']) {
    const jailCells = state.zones[t].jail;
    const rIndices = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!open[idx]) continue;
        if (jailCells.some(jc => manhattan(x, y, jc.x, jc.y) <= 1)) {
          rescueCells[t].push({ x, y, idx });
          rIndices.push(idx);
        }
      }
    }
    distToRescue[t] = multiSourceBFS(rIndices);
  }

  // Reusable Dijkstra buffers (size n * 8 to guarantee no overflow)
  const dijkstraCosts = new Float64Array(n);
  const dijkstraVisited = new Uint8Array(n);
  const heapIdx = new Int32Array(n * 8 + 64);
  const heapCost = new Float64Array(n * 8 + 64);

  return {
    w, h, n, border,
    gridKey: grid.join(''),
    open,
    neighbors,
    degree,
    deadEndDepth,
    distToWest,
    distToEast,
    distToBorder,
    rescueCells,
    distToRescue,
    dijkstraCosts,
    dijkstraVisited,
    heapIdx,
    heapCost,
    dist(x1, y1, x2, y2) {
      if (x1 === null || y1 === null || x2 === null || y2 === null) return 30000;
      const i1 = y1 * w + x1;
      const i2 = y2 * w + x2;
      if (bfsCache[i1]) return bfsCache[i1][i2];
      if (bfsCache[i2]) return bfsCache[i2][i1];
      return getDistFrom(i1)[i2];
    },
    distIdx(i1, i2) {
      if (bfsCache[i1]) return bfsCache[i1][i2];
      if (bfsCache[i2]) return bfsCache[i2][i1];
      return getDistFrom(i1)[i2];
    }
  };
}

function getMap(state) {
  const key = state.grid[0] + '|' + state.grid[state.height >> 1] + '|' + state.width + 'x' + state.height;
  if (!cachedMap || cachedMap.w !== state.width || cachedMap.h !== state.height || cachedMap.shortKey !== key) {
    cachedMap = buildMapCache(state);
    cachedMap.shortKey = key;
    history = {
      lastTick: -1,
      myPos: [],
      myActions: [],
      enemyPos: new Map(),
      lastRole: null
    };
  }
  if (state.tick < history.lastTick) {
    history = {
      lastTick: -1,
      myPos: [],
      myActions: [],
      enemyPos: new Map(),
      lastRole: null
    };
  }
  return cachedMap;
}

function updateHistory(state) {
  if (state.tick === history.lastTick) return;
  history.lastTick = state.tick;
  const you = state.you;
  if (isLiving(you)) {
    history.myPos.push({ x: you.x, y: you.y, tick: state.tick });
    if (history.myPos.length > 20) history.myPos.shift();
  } else {
    history.myPos = [];
    history.myActions = [];
  }
  for (const e of state.enemies) {
    if (isLiving(e)) {
      let arr = history.enemyPos.get(e.id);
      if (!arr) {
        arr = [];
        history.enemyPos.set(e.id, arr);
      }
      arr.push({ x: e.x, y: e.y, tick: state.tick });
      if (arr.length > 8) arr.shift();
    } else {
      history.enemyPos.delete(e.id);
    }
  }
}

function canTagMove(defTeam, border, x1, y1, nx1, ny1, x2, y2, nx2, ny2) {
  const ownHalf = defTeam === 'west' ? (nx1 < border && nx2 < border) : (nx1 > border && nx2 > border);
  if (!ownHalf) return false;
  const m = Math.abs(nx1 - nx2) + Math.abs(ny1 - ny2);
  if (m <= 1) return true;
  if (nx1 === x2 && ny1 === y2 && nx2 === x1 && ny2 === y1) return true;
  return false;
}

// Multi-target backwards Dijkstra:
// Exact inverse of forward Dijkstra where stepping from `v` -> `u` costs `1 + cellRisk[u]`.
function runBackwardRiskDijkstra(map, targetIndices, targetBaseCosts, cellRisk) {
  const n = map.n;
  const costs = map.dijkstraCosts;
  const visited = map.dijkstraVisited;
  const heapIdx = map.heapIdx;
  const heapCost = map.heapCost;

  costs.fill(Infinity);
  visited.fill(0);

  let heapLen = 0;
  function push(idx, cost) {
    let i = heapLen++;
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (heapCost[p] <= cost) break;
      heapIdx[i] = heapIdx[p];
      heapCost[i] = heapCost[p];
      i = p;
    }
    heapIdx[i] = idx;
    heapCost[i] = cost;
  }
  function pop() {
    const topIdx = heapIdx[0];
    heapLen--;
    if (heapLen > 0) {
      const lastIdx = heapIdx[heapLen];
      const lastCost = heapCost[heapLen];
      let i = 0;
      while (i * 2 + 1 < heapLen) {
        let c = i * 2 + 1;
        if (c + 1 < heapLen && heapCost[c + 1] < heapCost[c]) c++;
        if (lastCost <= heapCost[c]) break;
        heapIdx[i] = heapIdx[c];
        heapCost[i] = heapCost[c];
        i = c;
      }
      heapIdx[i] = lastIdx;
      heapCost[i] = lastCost;
    }
    return topIdx;
  }

  for (let i = 0; i < targetIndices.length; i++) {
    const t = targetIndices[i];
    const bc = targetBaseCosts ? targetBaseCosts[i] : 0;
    if (bc < costs[t]) {
      costs[t] = bc;
      push(t, bc);
    }
  }

  while (heapLen > 0) {
    const u = pop();
    if (visited[u]) continue;
    visited[u] = 1;
    const stepIntoU = costs[u] + 1 + cellRisk[u];
    const nb = map.neighbors[u];
    for (let i = 0; i < nb.length - 1; i++) {
      const v = nb[i].idx;
      if (visited[v]) continue;
      if (stepIntoU < costs[v]) {
        costs[v] = stepIntoU;
        push(v, stepIntoU);
      }
    }
  }
  return costs;
}

// ============================================================================
// TACTICAL 2-PLY / 3-PLY LOOKAHEAD FOR ENGAGEMENTS
// ============================================================================

function evaluateAttackerMoveSafety(map, state, you, nx, ny, act, enemyDefenders, isCarrier, goalDistFn) {
  const enemyTeam = state.team === 'west' ? 'east' : 'west';
  const border = map.border;
  const ownHalf = x => state.team === 'west' ? x < border : x > border;

  // If (nx, ny) is in our own half or on border, we CANNOT be tagged!
  if (ownHalf(nx) || nx === border) {
    return {
      guaranteedSafe: true,
      guaranteedTagged: false,
      tagProb: 0,
      totalWaysTagged: 0,
      worstNextSurvival: 1.0,
      bestEscapeDist: goalDistFn(nx, ny)
    };
  }

  let maxEnemyThreat = 0;
  let totalWaysTagged = 0;
  let anyEnemyCanTag = false;
  let guaranteedTagged = false;

  for (const e of enemyDefenders) {
    if (manhattan(e.x, e.y, nx, ny) > 3) continue;
    const eIdx = e.y * map.w + e.x;
    const eMoves = map.neighbors[eIdx];
    let waysThisEnemyTags = 0;
    const totalEnemyMoves = eMoves.length;

    let likelyEnemyTag = false;
    let bestEnemyDist = 99999;
    for (const em of eMoves) {
      const d = manhattan(em.x, em.y, you.x, you.y);
      if (d < bestEnemyDist) bestEnemyDist = d;
    }

    for (const em of eMoves) {
      if (canTagMove(enemyTeam, border, e.x, e.y, em.x, em.y, you.x, you.y, nx, ny)) {
        waysThisEnemyTags++;
        if (manhattan(em.x, em.y, you.x, you.y) <= bestEnemyDist) {
          likelyEnemyTag = true;
        }
      }
    }

    if (waysThisEnemyTags > 0) {
      anyEnemyCanTag = true;
      totalWaysTagged += waysThisEnemyTags;
      const prob = waysThisEnemyTags === totalEnemyMoves ? 1.0 : (likelyEnemyTag ? 0.85 : (waysThisEnemyTags / totalEnemyMoves));
      if (prob > maxEnemyThreat) maxEnemyThreat = prob;
      if (waysThisEnemyTags === totalEnemyMoves) guaranteedTagged = true;
    }
  }

  // Lookahead step 2: If we survive step 1 at (nx, ny), and enemy moves to their closest chasing position,
  // do we have at least one safe move on step 2, or are we walking into a trap (e.g. dead end)?
  let worstNextSurvival = 1.0;
  const nextIdx = ny * map.w + nx;
  const ourNextMoves = map.neighbors[nextIdx];

  const closeEnemies = enemyDefenders.filter(e => manhattan(e.x, e.y, nx, ny) <= 5);
  if (closeEnemies.length > 0) {
    const assumedEnemyPos = closeEnemies.map(e => {
      const eMoves = map.neighbors[e.y * map.w + e.x];
      let bestM = eMoves[0];
      let bestScore = 99999;
      for (const em of eMoves) {
        if (ownHalf(em.x)) continue;
        const d = map.dist(em.x, em.y, nx, ny);
        if (d < bestScore) {
          bestScore = d;
          bestM = em;
        }
      }
      return bestM;
    });

    let bestStep2Safety = 0;
    for (const m2 of ourNextMoves) {
      if (ownHalf(m2.x) || m2.x === border) {
        bestStep2Safety = 1.0;
        break;
      }
      let taggedInStep2 = false;
      for (const ep of assumedEnemyPos) {
        const epMoves = map.neighbors[ep.idx];
        for (const epm of epMoves) {
          if (canTagMove(enemyTeam, border, ep.x, ep.y, epm.x, epm.y, nx, ny, m2.x, m2.y)) {
            taggedInStep2 = true;
            break;
          }
        }
        if (taggedInStep2) break;
      }
      const s2 = taggedInStep2 ? 0.2 : 1.0;
      if (s2 > bestStep2Safety) bestStep2Safety = s2;
    }
    worstNextSurvival = bestStep2Safety;
  }

  return {
    guaranteedSafe: !anyEnemyCanTag,
    guaranteedTagged,
    tagProb: maxEnemyThreat,
    totalWaysTagged,
    worstNextSurvival,
    bestEscapeDist: goalDistFn(nx, ny)
  };
}

function evaluateDefenderInterceptMove(map, state, you, nx, ny, targetEnemy, teammateDefenders) {
  const myTeam = state.team;
  const border = map.border;
  const ownHalf = x => myTeam === 'west' ? x < border : x > border;

  if (!ownHalf(nx)) {
    return {
      guaranteedTag: false,
      tagCount: 0,
      tagsLikelyMove: false,
      worstCaseDistAfter: map.dist(nx, ny, targetEnemy.x, targetEnemy.y),
      enemyEscapeMargin: -999
    };
  }

  const eIdx = targetEnemy.y * map.w + targetEnemy.x;
  const eMoves = map.neighbors[eIdx];

  const enemyEscapeDist = (x, y) => {
    if (targetEnemy.carrying) {
      return myTeam === 'west' ? map.distToEast[y * map.w + x] : map.distToWest[y * map.w + x];
    }
    const myFlag = state.flags[myTeam];
    return map.dist(x, y, myFlag.x, myFlag.y);
  };

  let minEnemyGoalDist = 99999;
  for (const em of eMoves) {
    const gd = enemyEscapeDist(em.x, em.y);
    if (gd < minEnemyGoalDist) minEnemyGoalDist = gd;
  }

  let tagCount = 0;
  let tagsLikelyMove = false;
  let worstCaseDistAfter = 0;
  let minEnemyEscapeMargin = 99999;

  for (const em of eMoves) {
    const taggedByMe = canTagMove(myTeam, border, you.x, you.y, nx, ny, targetEnemy.x, targetEnemy.y, em.x, em.y);
    let taggedByTeammate = false;
    if (teammateDefenders) {
      for (const td of teammateDefenders) {
        if (ownHalf(td.x) && ownHalf(em.x) && manhattan(td.x, td.y, em.x, em.y) <= 1) {
          taggedByTeammate = true;
        }
      }
    }

    if (taggedByMe) {
      tagCount++;
      if (enemyEscapeDist(em.x, em.y) === minEnemyGoalDist) {
        tagsLikelyMove = true;
      }
    } else if (!taggedByTeammate) {
      const dAfter = map.dist(nx, ny, em.x, em.y);
      if (dAfter > worstCaseDistAfter) worstCaseDistAfter = dAfter;
      const escD = myTeam === 'west' ? map.distToEast[em.idx] : map.distToWest[em.idx];
      const margin = escD - dAfter;
      if (margin < minEnemyEscapeMargin) minEnemyEscapeMargin = margin;
    }
  }

  return {
    guaranteedTag: tagCount === eMoves.length,
    tagCount,
    totalEnemyMoves: eMoves.length,
    tagsLikelyMove,
    worstCaseDistAfter,
    enemyEscapeMargin: minEnemyEscapeMargin
  };
}

// ============================================================================
// TEAM ROLE ASSIGNMENT (Deterministic & Coordinated across all teammates)
// ============================================================================

function assignTeamRoles(map, state) {
  const myTeam = state.team;
  const enemyTeam = myTeam === 'west' ? 'east' : 'west';
  const border = map.border;
  const ownHalf = x => myTeam === 'west' ? x < border : x > border;

  const allOurAgents = [state.you, ...state.teammates].sort(compareId);
  const livingOurs = allOurAgents.filter(isLiving);
  const livingEnemies = state.enemies.filter(isLiving);

  const ourFlag = state.flags[myTeam];
  const enemyFlag = state.flags[enemyTeam];
  const ourJailed = allOurAgents.filter(a => a.jailed);

  const enemyCarriers = livingEnemies.filter(e => e.carrying);
  const enemyIntruders = livingEnemies.filter(e => ownHalf(e.x));

  const roles = new Map();
  const unassigned = [];

  for (const a of livingOurs) {
    if (a.carrying) {
      roles.set(a.id, { role: 'CARRIER' });
    } else {
      unassigned.push(a);
    }
  }

  const teamSize = allOurAgents.length;
  const ticksLeft = state.maxTicks - state.tick;
  const scoreDiff = state.score[myTeam] - state.score[enemyTeam];

  if (unassigned.length === 0) return roles;

  // 1. URGENT INTERCEPT: If an enemy has our flag
  if (enemyCarriers.length > 0) {
    const ec = enemyCarriers[0];
    const ecDistToSafe = myTeam === 'west' ? map.distToEast[ec.y * map.w + ec.x] : map.distToWest[ec.y * map.w + ec.x];
    const candidates = [...unassigned].sort((a, b) => {
      const da = map.dist(a.x, a.y, ec.x, ec.y);
      const db = map.dist(b.x, b.y, ec.x, ec.y);
      return da - db || compareId(a, b);
    });

    if (ownHalf(ec.x) || ecDistToSafe <= 2) {
      const primary = candidates.shift();
      if (primary) {
        roles.set(primary.id, { role: 'INTERCEPTOR', targetEnemy: ec });
        unassigned.splice(unassigned.indexOf(primary), 1);
      }
      if (candidates.length >= 2 && ownHalf(ec.x)) {
        const secondary = candidates.find(c => map.dist(c.x, c.y, ec.x, ec.y) <= ecDistToSafe + 4);
        if (secondary) {
          roles.set(secondary.id, { role: 'INTERCEPTOR_PINCER', targetEnemy: ec });
          unassigned.splice(unassigned.indexOf(secondary), 1);
        }
      }
    }
  }

  if (unassigned.length === 0) return roles;

  // 2. Decide how many defenders we need
  let desiredDefenders = teamSize === 1 ? 0 : 1;
  if (teamSize === 1) {
    if (enemyIntruders.length > 0) {
      const e = enemyIntruders[0];
      const myD = map.dist(unassigned[0].x, unassigned[0].y, ourFlag.home.x, ourFlag.home.y);
      const eD = map.dist(e.x, e.y, ourFlag.home.x, ourFlag.home.y);
      if (e.carrying || myD <= eD + 2) desiredDefenders = 1;
    }
  } else if (livingOurs.length >= 3) {
    const threatsInOurHalf = enemyIntruders.length;
    const winningLate = scoreDiff > 0 && ticksLeft < 250;
    const winningComfortably = scoreDiff >= 2 && livingOurs.length === 4;
    if ((threatsInOurHalf >= 2 && livingOurs.length >= 3) || winningLate || winningComfortably) {
      desiredDefenders = 2;
    }
  }
  if (scoreDiff < 0 && ticksLeft < 90 && enemyIntruders.length === 0) {
    desiredDefenders = 0;
  }

  let currentDefenders = 0;
  for (const r of roles.values()) {
    if (r.role === 'INTERCEPTOR' || r.role === 'INTERCEPTOR_PINCER') currentDefenders++;
  }

  while (currentDefenders < desiredDefenders && unassigned.length > 0) {
    let bestDef = null;
    let bestScore = 999999;
    for (const a of unassigned) {
      let d = map.dist(a.x, a.y, ourFlag.home.x, ourFlag.home.y);
      if (enemyIntruders.length > 0) {
        const threat = enemyIntruders[0];
        d = map.dist(a.x, a.y, threat.x, threat.y) * 0.7 + d * 0.3;
      }
      if (!ownHalf(a.x)) d += 12;
      if (d < bestScore) {
        bestScore = d;
        bestDef = a;
      }
    }
    if (bestDef) {
      const roleName = currentDefenders === 0 ? 'DEFENDER_MAIN' : 'DEFENDER_SUPPORT';
      roles.set(bestDef.id, { role: roleName });
      unassigned.splice(unassigned.indexOf(bestDef), 1);
      currentDefenders++;
    } else {
      break;
    }
  }

  if (unassigned.length === 0) return roles;

  // 3. RESCUER: If we have jailed teammates, assign the closest unassigned attacker to rescue them
  if (ourJailed.length > 0) {
    let bestRescuer = null;
    let bestDist = 999999;
    for (const a of unassigned) {
      const d = map.distToRescue[enemyTeam][a.y * map.w + a.x];
      if (d < bestDist) {
        bestDist = d;
        bestRescuer = a;
      }
    }
    const flagDist = bestRescuer ? map.dist(bestRescuer.x, bestRescuer.y, enemyFlag.x, enemyFlag.y) : 999;
    if (bestRescuer && (unassigned.length >= 2 || ourJailed.length >= 2 || bestDist <= flagDist + 6)) {
      roles.set(bestRescuer.id, { role: 'RESCUER' });
      unassigned.splice(unassigned.indexOf(bestRescuer), 1);
    }
  }

  if (unassigned.length === 0) return roles;

  // 4. Remaining unassigned agents are Raiders / Flankers / Poachers
  unassigned.sort((a, b) => {
    const da = map.dist(a.x, a.y, enemyFlag.x, enemyFlag.y);
    const db = map.dist(b.x, b.y, enemyFlag.x, enemyFlag.y);
    return da - db || compareId(a, b);
  });

  const ourCarrier = livingOurs.find(a => a.carrying);

  for (let i = 0; i < unassigned.length; i++) {
    const a = unassigned[i];
    if (!ourCarrier) {
      if (i === 0) {
        roles.set(a.id, { role: 'RAIDER_PRIMARY', flank: 0 });
      } else if (i === 1) {
        roles.set(a.id, { role: 'RAIDER_FLANK', flank: 1 });
      } else {
        roles.set(a.id, { role: 'RAIDER_FLANK', flank: -1 });
      }
    } else {
      if (ourJailed.length > 0 && i === 0) {
        roles.set(a.id, { role: 'RESCUER' });
      } else if (i === 0) {
        roles.set(a.id, { role: 'POACHER' });
      } else {
        roles.set(a.id, { role: 'SUPPORT_BLOCKER' });
      }
    }
  }

  return roles;
}

// ============================================================================
// ACTION SELECTION FOR EACH ROLE
// ============================================================================

function isOscillating(nx, ny) {
  const pos = history.myPos;
  if (pos.length < 4) return false;
  const p2 = pos[pos.length - 2];
  const p4 = pos[pos.length - 4];
  if (p2 && p4 && p2.x === nx && p2.y === ny && p4.x === nx && p4.y === ny) {
    return true;
  }
  return false;
}

// 1. CARRIER MOVE: Bring the flag to our half (`ownHalf(x)`) as safely and quickly as possible
function chooseCarrierMove(map, state, you) {
  const myTeam = state.team;
  const enemyTeam = myTeam === 'west' ? 'east' : 'west';
  const border = map.border;
  const ownHalf = x => myTeam === 'west' ? x < border : x > border;
  const distToHomeHalf = (x, y) => myTeam === 'west' ? map.distToWest[y * map.w + x] : map.distToEast[y * map.w + x];

  const livingEnemies = state.enemies.filter(isLiving);
  const enemyDefenders = livingEnemies.filter(e => !ownHalf(e.x));

  const myIdx = you.y * map.w + you.x;
  const candidates = map.neighbors[myIdx];

  // Immediate score check
  for (const c of candidates) {
    if (ownHalf(c.x)) {
      return c.act;
    }
  }

  // Build risk map for backward Dijkstra from home half
  const cellRisk = new Float64Array(map.n);
  for (let idx = 0; idx < map.n; idx++) {
    if (!map.open[idx]) continue;
    const x = idx % map.w;
    const y = (idx / map.w) | 0;
    if (ownHalf(x) || x === border) continue;

    let r = 0;
    if (map.deadEndDepth[idx] > 0) {
      r += map.deadEndDepth[idx] * 25;
    }

    for (const e of enemyDefenders) {
      const md = manhattan(x, y, e.x, e.y);
      if (md > 6) continue;
      const d = map.dist(x, y, e.x, e.y);
      if (md <= 1) r += 500;
      else if (d <= 2) r += 180;
      else if (d === 3) r += 45;
      else if (d === 4) r += 12;
      else if (d === 5) r += 3;
    }
    cellRisk[idx] = r;
  }

  const homeTargets = [];
  const targetX = myTeam === 'west' ? border - 1 : border + 1;
  for (let y = 0; y < map.h; y++) {
    const tIdx = y * map.w + targetX;
    if (map.open[tIdx]) homeTargets.push(tIdx);
  }

  const costToHome = runBackwardRiskDijkstra(map, homeTargets, null, cellRisk);
  const ourJailed = state.teammates.some(a => a.jailed);

  // Find which action minimizes total risk-weighted path from `you` -> `c` -> `home`
  let bestHomeCost = Infinity;
  let bestHomeAction = null;
  for (let i = 0; i < candidates.length - 1; i++) {
    const c = candidates[i];
    const totalViaC = 1 + cellRisk[c.idx] + costToHome[c.idx];
    if (totalViaC < bestHomeCost) {
      bestHomeCost = totalViaC;
      bestHomeAction = c.act;
    }
  }

  let bestAct = 'stay';
  let bestScore = -Infinity;

  for (const c of candidates) {
    const safety = evaluateAttackerMoveSafety(map, state, you, c.x, c.y, c.act, enemyDefenders, true, distToHomeHalf);
    const minCostToHome = costToHome[c.idx];

    let score = 0;
    if (safety.guaranteedTagged) {
      score -= 100000;
    } else if (!safety.guaranteedSafe) {
      score -= safety.tagProb * 25000 - safety.totalWaysTagged * 2000;
    }
    score += safety.worstNextSurvival * 5000;

    if (ourJailed && safety.guaranteedSafe && map.distToRescue[enemyTeam][c.idx] === 0) {
      score += 1200;
    }

    score -= minCostToHome * 40;
    score -= safety.bestEscapeDist * 15;

    let minEnemyDist = 999;
    for (const e of enemyDefenders) {
      const d = map.dist(c.x, c.y, e.x, e.y);
      if (d < minEnemyDist) minEnemyDist = d;
    }
    score += Math.min(minEnemyDist, 8) * 6;
    score -= map.deadEndDepth[c.idx] * 80;

    if (c.act === bestHomeAction) score += 5;
    if (c.act === 'stay') score -= 3;
    if (isOscillating(c.x, c.y)) score -= 8;

    if (score > bestScore) {
      bestScore = score;
      bestAct = c.act;
    }
  }

  return bestAct;
}

// 2. DEFENDER / INTERCEPTOR MOVE
function chooseDefenderMove(map, state, you, roleInfo) {
  const myTeam = state.team;
  const border = map.border;
  const ownHalf = x => myTeam === 'west' ? x < border : x > border;

  const ourFlag = state.flags[myTeam];
  const livingEnemies = state.enemies.filter(isLiving);
  const teammateDefenders = state.teammates.filter(a => isLiving(a) && ownHalf(a.x));

  const myIdx = you.y * map.w + you.x;
  const candidates = map.neighbors[myIdx];

  if (!ownHalf(you.x)) {
    let bestAct = 'stay';
    let bestD = 99999;
    for (const c of candidates) {
      const d = map.dist(c.x, c.y, ourFlag.home.x, ourFlag.home.y);
      if (d < bestD) {
        bestD = d;
        bestAct = c.act;
      }
    }
    return bestAct;
  }

  const enemiesInOurHalf = livingEnemies.filter(e => ownHalf(e.x));
  if (enemiesInOurHalf.length > 0) {
    let bestImmediateAct = null;
    let bestImmediateScore = -Infinity;

    for (const c of candidates) {
      if (!ownHalf(c.x)) continue;
      let moveTagScore = 0;
      for (const e of enemiesInOurHalf) {
        if (manhattan(c.x, c.y, e.x, e.y) > 3) continue;
        const evalRes = evaluateDefenderInterceptMove(map, state, you, c.x, c.y, e, teammateDefenders);
        const weight = e.carrying ? 5.0 : 1.5;
        if (evalRes.guaranteedTag) {
          moveTagScore += 10000 * weight;
        } else if (evalRes.tagsLikelyMove && evalRes.tagCount >= 2) {
          moveTagScore += (2000 + evalRes.tagCount * 400) * weight;
        } else if (evalRes.tagCount > 0) {
          moveTagScore += evalRes.tagCount * 250 * weight;
        }
      }
      if (moveTagScore > 0 && moveTagScore > bestImmediateScore) {
        const primaryE = roleInfo.targetEnemy || enemiesInOurHalf[0];
        const evalPrimary = evaluateDefenderInterceptMove(map, state, you, c.x, c.y, primaryE, teammateDefenders);
        const total = moveTagScore - evalPrimary.worstCaseDistAfter * 20;
        if (total > bestImmediateScore) {
          bestImmediateScore = total;
          bestImmediateAct = c.act;
        }
      }
    }
    if (bestImmediateScore >= 2000) {
      return bestImmediateAct;
    }
  }

  let targetEnemy = roleInfo.targetEnemy || null;
  if (!targetEnemy) {
    const enemyJailedCount = state.enemies.filter(e => e.jailed).length;
    const scoredEnemies = [];
    for (const e of livingEnemies) {
      const dToOurHalf = myTeam === 'west' ? map.distToWest[e.y * map.w + e.x] : map.distToEast[e.y * map.w + e.x];
      if (dToOurHalf > 6 && !ownHalf(e.x)) continue;

      const dToFlag = map.dist(e.x, e.y, ourFlag.x, ourFlag.y);
      const dToJail = enemyJailedCount > 0 ? map.distToRescue[myTeam][e.y * map.w + e.x] : 999;
      const dTarget = Math.min(dToFlag, dToJail + 2);

      let threatPriority = 0;
      if (e.carrying && ownHalf(e.x)) threatPriority = 1000 - (myTeam === 'west' ? map.distToEast[e.y * map.w + e.x] : map.distToWest[e.y * map.w + e.x]) * 10;
      else if (ownHalf(e.x)) threatPriority = 500 - dTarget * 8 - map.dist(you.x, you.y, e.x, e.y) * 2;
      else threatPriority = 200 - dTarget * 5 - dToOurHalf * 10;

      if (roleInfo.role === 'DEFENDER_SUPPORT' && teammateDefenders.length > 0) {
        const td = teammateDefenders[0];
        if (map.dist(td.x, td.y, e.x, e.y) <= 2 && livingEnemies.length > 1) {
          threatPriority -= 120;
        }
      }

      scoredEnemies.push({ e, threatPriority });
    }
    scoredEnemies.sort((a, b) => b.threatPriority - a.threatPriority);
    if (scoredEnemies.length > 0) {
      targetEnemy = scoredEnemies[0].e;
    }
  }

  let interceptCell = { x: ourFlag.home.x, y: ourFlag.home.y };

  if (targetEnemy) {
    if (targetEnemy.carrying && ownHalf(targetEnemy.x)) {
      let bestCutCell = { x: targetEnemy.x, y: targetEnemy.y };
      let bestCutScore = -Infinity;
      const eMinEscape = map.distToBorder[targetEnemy.y * map.w + targetEnemy.x];

      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          if (!ownHalf(x)) continue;
          const idx = y * map.w + x;
          if (!map.open[idx]) continue;

          const eDistToCell = map.dist(targetEnemy.x, targetEnemy.y, x, y);
          const cellDistToBorder = map.distToBorder[idx];
          const eTotalViaCell = eDistToCell + cellDistToBorder;

          if (eTotalViaCell > eMinEscape + 3) continue;

          const myDistToCell = map.dist(you.x, you.y, x, y);
          const canReachInTime = myDistToCell <= eDistToCell + 1;
          let cutScore = 0;
          if (canReachInTime) {
            cutScore += 1000 - eTotalViaCell * 40 - eDistToCell * 15 - myDistToCell * 5;
          } else {
            cutScore -= (myDistToCell - eDistToCell) * 50 + eDistToCell * 5;
          }

          if (roleInfo.role === 'INTERCEPTOR_PINCER' && teammateDefenders.length > 0) {
            const td = teammateDefenders[0];
            if (y !== td.y) cutScore += Math.min(Math.abs(y - td.y), 4) * 8;
          }

          if (cutScore > bestCutScore) {
            bestCutScore = cutScore;
            bestCutCell = { x, y };
          }
        }
      }
      interceptCell = bestCutCell;
    } else if (ownHalf(targetEnemy.x)) {
      const enemyJailedCount = state.enemies.filter(e => e.jailed).length;
      const dFlag = map.dist(targetEnemy.x, targetEnemy.y, ourFlag.x, ourFlag.y);
      const dJail = enemyJailedCount > 0 ? map.distToRescue[myTeam][targetEnemy.y * map.w + targetEnemy.x] : 999;

      let goalX = ourFlag.x;
      let goalY = ourFlag.y;
      if (dJail + 1 < dFlag && state.zones[myTeam].jail.length > 0) {
        goalX = state.zones[myTeam].jail[0].x;
        goalY = state.zones[myTeam].jail[0].y;
      }

      const myDistToGoal = map.dist(you.x, you.y, goalX, goalY);
      const enemyDistToGoal = map.dist(targetEnemy.x, targetEnemy.y, goalX, goalY);

      if (myDistToGoal <= enemyDistToGoal) {
        interceptCell = { x: targetEnemy.x, y: targetEnemy.y };
      } else {
        interceptCell = { x: goalX, y: goalY };
      }
    } else {
      const shadowX = myTeam === 'west'
        ? Math.min(border - 2, Math.max(ourFlag.home.x + 2, border - 4))
        : Math.max(border + 2, Math.min(ourFlag.home.x - 2, border + 4));
      const shadowY = Math.round(targetEnemy.y * 0.65 + ourFlag.home.y * 0.35);

      let bestCell = { x: ourFlag.home.x, y: ourFlag.home.y };
      let bestD = 99999;
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          if (!ownHalf(x) || !map.open[y * map.w + x]) continue;
          const d = manhattan(x, y, shadowX, shadowY);
          if (d < bestD) {
            bestD = d;
            bestCell = { x, y };
          }
        }
      }
      interceptCell = bestCell;
    }
  } else {
    const guardX = myTeam === 'west' ? Math.min(border - 1, ourFlag.home.x + 2) : Math.max(border + 1, ourFlag.home.x - 2);
    const guardY = roleInfo.role === 'DEFENDER_SUPPORT'
      ? Math.max(1, ourFlag.home.y - 3)
      : ourFlag.home.y;
    if (map.open[guardY * map.w + guardX]) {
      interceptCell = { x: guardX, y: guardY };
    } else {
      interceptCell = { x: ourFlag.home.x, y: ourFlag.home.y };
    }
  }

  let bestAct = 'stay';
  let bestScore = -Infinity;

  for (const c of candidates) {
    if (!ownHalf(c.x)) continue;

    let score = 0;
    const dToIntercept = map.dist(c.x, c.y, interceptCell.x, interceptCell.y);
    score -= dToIntercept * 30;

    if (targetEnemy && ownHalf(targetEnemy.x)) {
      const evalRes = evaluateDefenderInterceptMove(map, state, you, c.x, c.y, targetEnemy, teammateDefenders);
      if (evalRes.guaranteedTag) score += 50000;
      else if (evalRes.tagsLikelyMove) score += 3000 + evalRes.tagCount * 500;
      else score += evalRes.tagCount * 350;

      score -= evalRes.worstCaseDistAfter * 25;

      // 2-step cornering bonus: if enemy is not tagged this step, check if from (c.x, c.y) we threaten more of their next moves!
      if (!evalRes.guaranteedTag && evalRes.worstCaseDistAfter <= 3) {
        const eMoves = map.neighbors[targetEnemy.y * map.w + targetEnemy.x];
        let nextThreatSum = 0;
        for (const em of eMoves) {
          if (!ownHalf(em.x)) continue;
          // If enemy moves to em, and we are at c, how close are we and how many walls surround em?
          const deg = map.degree[em.idx];
          if (deg <= 2) nextThreatSum += (4 - deg) * 8;
        }
        score += nextThreatSum;
      }

      if (!targetEnemy.carrying) {
        const dFlagFromC = map.dist(c.x, c.y, ourFlag.x, ourFlag.y);
        const dEnemyToFlag = map.dist(targetEnemy.x, targetEnemy.y, ourFlag.x, ourFlag.y);
        if (dFlagFromC <= dEnemyToFlag) score += 40;
      }
    }

    if (c.x === ourFlag.home.x && c.y === ourFlag.home.y) {
      const closestE = targetEnemy ? map.dist(c.x, c.y, targetEnemy.x, targetEnemy.y) : 999;
      if (closestE > 3) score -= 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAct = c.act;
    }
  }

  return bestAct;
}

// 3. ATTACKER / RAIDER / RESCUER / POACHER MOVE
function chooseAttackerMove(map, state, you, roleInfo) {
  const myTeam = state.team;
  const enemyTeam = myTeam === 'west' ? 'east' : 'west';
  const border = map.border;
  const ownHalf = x => myTeam === 'west' ? x < border : x > border;

  const enemyFlag = state.flags[enemyTeam];
  const livingEnemies = state.enemies.filter(isLiving);
  const enemyDefenders = livingEnemies.filter(e => !ownHalf(e.x) && e.x !== border);
  const enemiesInOurHalf = livingEnemies.filter(e => ownHalf(e.x));

  const myIdx = you.y * map.w + you.x;
  const candidates = map.neighbors[myIdx];

  // OPPORTUNITY 1: If we are in our own half and can IMMEDIATELY tag an enemy intruder (1 step), do it!
  if (ownHalf(you.x) && enemiesInOurHalf.length > 0) {
    for (const c of candidates) {
      if (!ownHalf(c.x)) continue;
      for (const e of enemiesInOurHalf) {
        if (manhattan(c.x, c.y, e.x, e.y) > 2) continue;
        const evalRes = evaluateDefenderInterceptMove(map, state, you, c.x, c.y, e, null);
        if (evalRes.guaranteedTag || (e.carrying && evalRes.tagsLikelyMove && evalRes.tagCount >= 2)) {
          return c.act;
        }
      }
    }
  }

  const ourJailedCount = state.teammates.filter(a => a.jailed).length;

  // Build risk map in enemy half
  const cellRisk = new Float64Array(map.n);
  const flankBias = roleInfo.flank || 0;
  const midY = map.h >> 1;

  for (let idx = 0; idx < map.n; idx++) {
    if (!map.open[idx]) continue;
    const x = idx % map.w;
    const y = (idx / map.w) | 0;

    let r = 0;
    if (!ownHalf(x) && x !== border) {
      if (map.deadEndDepth[idx] > 0) {
        r += map.deadEndDepth[idx] * 18;
      }
      for (const e of enemyDefenders) {
        const md = manhattan(x, y, e.x, e.y);
        if (md > 6) continue;
        const d = map.dist(x, y, e.x, e.y);
        if (md <= 1) r += 400;
        else if (d <= 2) r += 130;
        else if (d === 3) r += 32;
        else if (d === 4) r += 8;
        else if (d === 5) r += 2;
      }
    }

    if (flankBias !== 0) {
      const yOffset = y - midY;
      if (flankBias > 0 && yOffset < 0) r += Math.abs(yOffset) * 0.45;
      if (flankBias < 0 && yOffset > 0) r += Math.abs(yOffset) * 0.45;
    }

    for (const tm of state.teammates) {
      if (isLiving(tm) && !ownHalf(tm.x)) {
        const dTm = manhattan(x, y, tm.x, tm.y);
        if (dTm === 0) r += 6;
        else if (dTm === 1) r += 2;
      }
    }

    cellRisk[idx] = r;
  }

  let targetIndices = [];
  if (roleInfo.role === 'RESCUER' || (ourJailedCount > 0 && map.distToRescue[enemyTeam][myIdx] <= 4)) {
    for (const rc of map.rescueCells[enemyTeam]) {
      targetIndices.push(rc.idx);
    }
  } else if (roleInfo.role === 'POACHER') {
    targetIndices.push(enemyFlag.home.y * map.w + enemyFlag.home.x);
  } else if (roleInfo.role === 'SUPPORT_BLOCKER') {
    const enemyCarrier = livingEnemies.find(e => e.carrying);
    if (enemyCarrier) {
      targetIndices.push(enemyCarrier.y * map.w + enemyCarrier.x);
    } else {
      targetIndices.push(enemyFlag.home.y * map.w + enemyFlag.home.x);
    }
  } else {
    if (enemyFlag.carrier === null) {
      targetIndices.push(enemyFlag.y * map.w + enemyFlag.x);
      if (ourJailedCount >= 2) {
        for (const rc of map.rescueCells[enemyTeam]) {
          targetIndices.push(rc.idx);
        }
      }
    } else {
      if (ourJailedCount > 0) {
        for (const rc of map.rescueCells[enemyTeam]) targetIndices.push(rc.idx);
      } else {
        targetIndices.push(enemyFlag.home.y * map.w + enemyFlag.home.x);
      }
    }
  }

  const goalDistFn = (x, y) => {
    const cIdx = y * map.w + x;
    let best = 30000;
    for (const ti of targetIndices) {
      const d = map.distIdx(cIdx, ti);
      if (d < best) best = d;
    }
    return best;
  };

  const costToTarget = runBackwardRiskDijkstra(map, targetIndices, null, cellRisk);

  // Check if an allied raider is ALSO attacking the enemy flag and is closer or engaged
  let alliedRaiderNearFlag = false;
  for (const tm of state.teammates) {
    if (isLiving(tm) && !tm.carrying && !ownHalf(tm.x)) {
      if (map.dist(tm.x, tm.y, enemyFlag.x, enemyFlag.y) <= 5) {
        alliedRaiderNearFlag = true;
        break;
      }
    }
  }

  let bestAct = 'stay';
  let bestScore = -Infinity;

  for (const c of candidates) {
    const safety = evaluateAttackerMoveSafety(map, state, you, c.x, c.y, c.act, enemyDefenders, false, goalDistFn);
    const minPathCost = costToTarget[c.idx];

    let score = 0;

    // 1. Immediate flag pickup!
    const picksUpFlag = enemyFlag.carrier === null && c.x === enemyFlag.x && c.y === enemyFlag.y;
    if (picksUpFlag && safety.guaranteedSafe) {
      score += 50000;
    } else if (picksUpFlag && !safety.guaranteedTagged) {
      score += 4000;
    }

    // 2. Immediate prisoner rescue!
    const rescuesPrisoners = ourJailedCount > 0 && map.distToRescue[enemyTeam][c.idx] === 0;
    if (rescuesPrisoners && safety.guaranteedSafe) {
      score += 35000 * ourJailedCount;
    } else if (rescuesPrisoners && !safety.guaranteedTagged) {
      score += 2000;
    }

    // 3. Survival evaluation (slightly bolder when a teammate raider is also pressuring the flag within 5 steps!)
    const pressureDiscount = (alliedRaiderNearFlag && safety.bestEscapeDist <= 4) ? 0.72 : 1.0;
    if (safety.guaranteedTagged) {
      score -= 100000;
    } else if (!safety.guaranteedSafe) {
      score -= (safety.tagProb * 20000 + safety.totalWaysTagged * 1500) * pressureDiscount;
    }
    score += safety.worstNextSurvival * 3500;

    // 4. Path progress
    score -= minPathCost * 35;
    score -= safety.bestEscapeDist * 12;

    if (roleInfo.role === 'POACHER' && enemyFlag.carrier !== null) {
      const dStand = map.dist(c.x, c.y, enemyFlag.home.x, enemyFlag.home.y);
      if (dStand <= 2) {
        let minDefD = 999;
        for (const e of enemyDefenders) {
          const d = map.dist(c.x, c.y, e.x, e.y);
          if (d < minDefD) minDefD = d;
        }
        if (minDefD <= 3) score -= (4 - minDefD) * 200;
      }
    }

    if (!ownHalf(c.x) && map.deadEndDepth[c.idx] > 0) {
      let minDefD = 999;
      for (const e of enemyDefenders) {
        const d = map.dist(c.x, c.y, e.x, e.y);
        if (d < minDefD) minDefD = d;
      }
      if (minDefD <= map.deadEndDepth[c.idx] * 2 + 3) {
        score -= map.deadEndDepth[c.idx] * 500;
      }
    }

    if (c.act === 'stay') score -= 4;
    if (isOscillating(c.x, c.y)) score -= 18;

    if (score > bestScore) {
      bestScore = score;
      bestAct = c.act;
    }
  }

  return bestAct;
}

// ============================================================================
// MAIN BOT ENTRYPOINT
// ============================================================================

function move(state) {
  try {
    if (!state || !state.you) return 'stay';
    const you = state.you;
    if (you.jailed || you.respawnIn > 0 || you.x === null || you.y === null) {
      return 'stay';
    }

    const map = getMap(state);
    updateHistory(state);

    const roles = assignTeamRoles(map, state);
    const myRole = roles.get(you.id) || { role: 'RAIDER_PRIMARY', flank: 0 };

    let action = 'stay';
    if (you.carrying || myRole.role === 'CARRIER') {
      action = chooseCarrierMove(map, state, you);
    } else if (
      myRole.role === 'INTERCEPTOR' ||
      myRole.role === 'INTERCEPTOR_PINCER' ||
      myRole.role === 'DEFENDER_MAIN' ||
      myRole.role === 'DEFENDER_SUPPORT'
    ) {
      action = chooseDefenderMove(map, state, you, myRole);
    } else {
      action = chooseAttackerMove(map, state, you, myRole);
    }

    if (!ACT_LIST.includes(action)) action = 'stay';
    history.myActions.push(action);
    if (history.myActions.length > 16) history.myActions.shift();
    return action;
  } catch (_err) {
    return 'stay';
  }
}

module.exports = {
  name: 'Argon',
  move
};
