'use strict';

/**
 * Apex - AI WAR Capture the Flag Champion Bot
 */

const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'right', dx: 1, dy: 0 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'stay', dx: 0, dy: 0 }
];

function otherTeam(team) {
  return team === 'west' ? 'east' : 'west';
}

function ownHalf(team, x, border) {
  return team === 'west' ? x < border : x > border;
}

function enemyHalf(team, x, border) {
  return team === 'west' ? x > border : x < border;
}

// Fast BFS distance map from one or multiple start cells
function computeBFS(grid, width, height, startCells) {
  const size = width * height;
  const dist = new Int16Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;

  for (let i = 0; i < startCells.length; i++) {
    const p = startCells[i];
    if (p && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
      const idx = p.y * width + p.x;
      if (grid[p.y][p.x] !== '#' && dist[idx] === -1) {
        dist[idx] = 0;
        queue[tail++] = idx;
      }
    }
  }

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % width;
    const cy = (curr / width) | 0;
    const d = dist[curr] + 1;

    // up
    if (cy > 0) {
      const nidx = curr - width;
      if (dist[nidx] === -1 && grid[cy - 1][cx] !== '#') {
        dist[nidx] = d;
        queue[tail++] = nidx;
      }
    }
    // down
    if (cy < height - 1) {
      const nidx = curr + width;
      if (dist[nidx] === -1 && grid[cy + 1][cx] !== '#') {
        dist[nidx] = d;
        queue[tail++] = nidx;
      }
    }
    // left
    if (cx > 0) {
      const nidx = curr - 1;
      if (dist[nidx] === -1 && grid[cy][cx - 1] !== '#') {
        dist[nidx] = d;
        queue[tail++] = nidx;
      }
    }
    // right
    if (cx < width - 1) {
      const nidx = curr + 1;
      if (dist[nidx] === -1 && grid[cy][cx + 1] !== '#') {
        dist[nidx] = d;
        queue[tail++] = nidx;
      }
    }
  }

  return dist;
}

// Get shortest path cells from start to goal
function getShortestPath(grid, width, height, start, goal) {
  if (!start || !goal) return [];
  if (start.x === goal.x && start.y === goal.y) return [{ x: start.x, y: start.y }];
  const size = width * height;
  const prev = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;

  const startIdx = start.y * width + start.x;
  prev[startIdx] = startIdx;
  queue[tail++] = startIdx;

  let found = false;
  const goalIdx = goal.y * width + goal.x;

  while (head < tail) {
    const curr = queue[head++];
    if (curr === goalIdx) { found = true; break; }
    const cx = curr % width;
    const cy = (curr / width) | 0;

    const neighbors = [
      cy > 0 ? curr - width : -1,
      cy < height - 1 ? curr + width : -1,
      cx > 0 ? curr - 1 : -1,
      cx < width - 1 ? curr + 1 : -1
    ];

    for (let i = 0; i < 4; i++) {
      const nidx = neighbors[i];
      if (nidx >= 0 && prev[nidx] === -1) {
        const nx = nidx % width;
        const ny = (nidx / width) | 0;
        if (grid[ny][nx] !== '#') {
          prev[nidx] = curr;
          queue[tail++] = nidx;
        }
      }
    }
  }

  if (!found) return [];
  const path = [];
  let curr = goalIdx;
  while (curr !== startIdx) {
    path.push({ x: curr % width, y: (curr / width) | 0 });
    curr = prev[curr];
  }
  path.reverse();
  return path;
}

// Priority Queue for Dijkstra
class MinHeap {
  constructor() { this.nodes = []; }
  push(item) {
    let i = this.nodes.length;
    this.nodes.push(item);
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (this.nodes[p].cost <= item.cost) break;
      this.nodes[i] = this.nodes[p];
      i = p;
    }
    this.nodes[i] = item;
  }
  pop() {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!this.nodes.length) return first;
    let i = 0;
    const len = this.nodes.length;
    while (i * 2 + 1 < len) {
      let child = i * 2 + 1;
      if (child + 1 < len && this.nodes[child + 1].cost < this.nodes[child].cost) child++;
      if (last.cost <= this.nodes[child].cost) break;
      this.nodes[i] = this.nodes[child];
      i = child;
    }
    this.nodes[i] = last;
    return first;
  }
  get length() { return this.nodes.length; }
}

// Check if a move to (nx, ny) is threatened by ANY enemy move next tick
function isThreatened(nx, ny, youPrev, state, activeEnemies) {
  const border = state.border;
  // Border column and own half are 100% immune from tags
  if (nx === border || ownHalf(state.team, nx, border)) return false;

  const enemyTeam = otherTeam(state.team);
  const width = state.width;
  const height = state.height;

  for (let i = 0; i < activeEnemies.length; i++) {
    const e = activeEnemies[i];
    for (let d = 0; d < DIRS.length; d++) {
      const ex = e.x + DIRS[d].dx;
      const ey = e.y + DIRS[d].dy;
      if (ex < 0 || ex >= width || ey < 0 || ey >= height) continue;
      if (state.grid[ey][ex] === '#') continue;
      // Defender must be inside its own half to tag
      if (!ownHalf(enemyTeam, ex, border)) continue;

      const dist = Math.abs(ex - nx) + Math.abs(ey - ny);
      const swapped = (ex === youPrev.x && ey === youPrev.y && nx === e.x && ny === e.y);
      if (dist <= 1 || swapped) {
        return true;
      }
    }
  }
  return false;
}

// Find safe Dijkstra path in enemy territory towards goal
function findSafePathAction(you, goalFn, state, enemyDefenderDist, activeEnemies) {
  const width = state.width;
  const height = state.height;
  const border = state.border;
  const team = state.team;
  const grid = state.grid;

  const heap = new MinHeap();
  const costs = new Int32Array(width * height).fill(100000000);
  const startIdx = you.y * width + you.x;
  costs[startIdx] = 0;
  heap.push({ x: you.x, y: you.y, cost: 0, act: 'stay' });

  let bestAction = 'stay';
  let bestGoalCost = Infinity;

  while (heap.length > 0) {
    const curr = heap.pop();
    const cidx = curr.y * width + curr.x;
    if (curr.cost > costs[cidx]) continue;

    if (goalFn(curr)) {
      if (curr.cost < bestGoalCost) {
        bestGoalCost = curr.cost;
        bestAction = curr.act;
      }
      break;
    }

    for (let d = 0; d < 4; d++) {
      const nx = curr.x + DIRS[d].dx;
      const ny = curr.y + DIRS[d].dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (grid[ny][nx] !== '#') {
        const nidx = ny * width + nx;
        let stepThreat = 0;

        if (enemyHalf(team, nx, border)) {
          if (isThreatened(nx, ny, curr, state, activeEnemies)) {
            stepThreat = 100000;
          } else {
            const enD = enemyDefenderDist[nidx];
            if (enD === 2) stepThreat = 300;
            else if (enD === 3) stepThreat = 50;
            else if (enD === 4) stepThreat = 15;
          }
        }

        const nextCost = curr.cost + 1 + stepThreat;
        if (nextCost < costs[nidx]) {
          costs[nidx] = nextCost;
          const nextAct = curr.act === 'stay' ? DIRS[d].name : curr.act;
          heap.push({ x: nx, y: ny, cost: nextCost, act: nextAct });
        }
      }
    }
  }

  return bestAction;
}

module.exports = {
  name: 'Apex',
  move(state) {
    try {
      const you = state.you;
      if (you.jailed || you.respawnIn > 0) return 'stay';

      const width = state.width;
      const height = state.height;
      const border = state.border;
      const grid = state.grid;
      const team = state.team;
      const enemyTeam = otherTeam(team);

      const livingTeammates = [you, ...state.teammates]
        .filter(a => !a.jailed && a.respawnIn === 0 && a.x !== null)
        .sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);

      const livingEnemies = state.enemies
        .filter(a => !a.jailed && a.respawnIn === 0 && a.x !== null);

      const enemyDefenders = livingEnemies
        .filter(a => ownHalf(enemyTeam, a.x, border) || a.x === border);

      const intruders = livingEnemies
        .filter(a => ownHalf(team, a.x, border));

      // Key locations
      const enemyFlag = state.flags[enemyTeam];
      const ownFlagHome = state.flags[team].home;
      const enemyJail = state.zones[enemyTeam].jail;

      // Distance maps
      const ownFlagDist = computeBFS(grid, width, height, [ownFlagHome]);
      const enemyFlagDist = computeBFS(grid, width, height, [enemyFlag]);
      const enemyDefenderDist = computeBFS(grid, width, height, enemyDefenders);
      const youDist = computeBFS(grid, width, height, [you]);

      // All border cells that are open and have an open neighbor into our half
      const validBorderCells = [];
      const scoreDir = team === 'west' ? -1 : 1;
      for (let y = 0; y < height; y++) {
        if (grid[y][border] !== '#') {
          const scoreX = border + scoreDir;
          if (scoreX >= 0 && scoreX < width && grid[y][scoreX] !== '#') {
            validBorderCells.push({ x: border, y });
          }
        }
      }
      const borderDist = computeBFS(grid, width, height, validBorderCells);

      // Legal candidate moves for `you`
      const legalMoves = [];
      for (let d = 0; d < 4; d++) {
        const action = DIRS[d].name;
        const nx = you.x + DIRS[d].dx;
        const ny = you.y + DIRS[d].dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] !== '#') {
          const threatened = isThreatened(nx, ny, you, state, enemyDefenders);
          legalMoves.push({ action, x: nx, y: ny, threatened });
        }
      }
      const stayThreatened = isThreatened(you.x, you.y, you, state, enemyDefenders);
      legalMoves.push({ action: 'stay', x: you.x, y: you.y, threatened: stayThreatened });

      const safeMoves = legalMoves.filter(m => !m.threatened);

      // =========================================================================
      // 1. CARRIER: You are carrying the enemy flag! Deliver it to score!
      // =========================================================================
      if (you.carrying) {
        // If already on the border, step into own half to score immediately!
        if (you.x === border) {
          const scoreAction = team === 'west' ? 'left' : 'right';
          const scoreX = border + scoreDir;
          if (scoreX >= 0 && scoreX < width && grid[you.y][scoreX] !== '#') {
            return scoreAction;
          }
          // Move along border towards open score exit
          let bestBorderAct = 'stay';
          let minBD = Infinity;
          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            if (m.x === border) {
              const d = borderDist[m.y * width + m.x];
              if (d !== -1 && d < minBD) {
                minBD = d;
                bestBorderAct = m.action;
              }
            }
          }
          return bestBorderAct;
        }

        // Inside enemy territory carrying flag: Use safe Dijkstra to border
        const act = findSafePathAction(you, p => p.x === border, state, enemyDefenderDist, enemyDefenders);
        if (act !== 'stay') return act;

        // Fallback: Safe move that minimizes borderDist
        const pool = safeMoves.length > 0 ? safeMoves : legalMoves;
        let fallbackAct = pool[0].action;
        let minBD = Infinity;
        for (let i = 0; i < pool.length; i++) {
          const m = pool[i];
          const d = borderDist[m.y * width + m.x];
          if (d !== -1 && d < minBD) {
            minBD = d;
            fallbackAct = m.action;
          }
        }
        return fallbackAct;
      }

      // =========================================================================
      // 2. DYNAMIC ROLE ALLOCATION
      // =========================================================================
      const numTeammates = livingTeammates.length;
      const youIdx = livingTeammates.findIndex(a => a.id === you.id);
      const isWest = team === 'west';

      // 1v1 Specialized Duel Logic
      if (numTeammates === 1) {
        const loneEnemy = state.enemies[0];
        const jailRemaining = loneEnemy && loneEnemy.jailed ? (40 - loneEnemy.jailTicks) : (loneEnemy && loneEnemy.respawnIn > 0 ? loneEnemy.respawnIn : 0);

        // If enemy is jailed with sufficient time: RUSH FOR FLAG!
        if (jailRemaining >= 25 || (enemyHalf(team, you.x, border) && jailRemaining >= 15)) {
          return findSafePathAction(you, p => p.x === enemyFlag.x && p.y === enemyFlag.y, state, enemyDefenderDist, enemyDefenders);
        }

        // Enemy is active:
        // If enemy is in our half: DEFEND AND TAG!
        if (loneEnemy && ownHalf(team, loneEnemy.x, border) && !loneEnemy.jailed && loneEnemy.respawnIn === 0) {
          // Can we tag this tick? Step onto intruder!
          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            if (m.x === loneEnemy.x && m.y === loneEnemy.y && ownHalf(team, m.x, border)) {
              return m.action;
            }
          }
          // If enemy is close to flag (dist <= 3), intercept!
          const dToFlag = Math.abs(loneEnemy.x - ownFlagHome.x) + Math.abs(loneEnemy.y - ownFlagHome.y);
          if (dToFlag <= 3) {
            const intruderDist = computeBFS(grid, width, height, [loneEnemy]);
            let bestAct = 'stay';
            let minD = Infinity;
            for (let i = 0; i < legalMoves.length; i++) {
              const m = legalMoves[i];
              if (!ownHalf(team, m.x, border) && m.x !== border) continue;
              const d = intruderDist[m.y * width + m.x];
              if (d !== -1 && d < minD) {
                minD = d;
                bestAct = m.action;
              }
            }
            return bestAct;
          }
        }

        // Hold position directly at flag stand
        const holdDist = computeBFS(grid, width, height, [ownFlagHome]);
        let bestAct = 'stay';
        let minD = Infinity;
        for (let i = 0; i < legalMoves.length; i++) {
          const m = legalMoves[i];
          if (!ownHalf(team, m.x, border)) continue;
          const d = holdDist[m.y * width + m.x];
          if (d !== -1 && d < minD) {
            minD = d;
            bestAct = m.action;
          }
        }
        return bestAct;
      }

      // Multi-Agent Role Assignment:
      let role = 'RAIDER';
      if (numTeammates === 2) {
        if (youIdx === 0) role = 'DEFENDER';
        else role = 'RAIDER';
      } else if (numTeammates === 3) {
        if (youIdx === 0) role = 'DEFENDER';
        else role = 'RAIDER';
      } else {
        // 4v4: 2 Defenders, 2 Raiders
        if (youIdx === 0 || youIdx === 1) role = 'DEFENDER';
        else role = 'RAIDER';
      }

      // Check if teammates need rescue
      const jailedTeammates = state.teammates.filter(a => a.jailed);
      if (role === 'RAIDER' && jailedTeammates.length > 0) {
        role = 'RESCUER';
      }

      // =========================================================================
      // 3. DEFENDER ROLE: Intercept intruders, guard flag & jail
      // =========================================================================
      if (role === 'DEFENDER') {
        // If defender was somehow on or across border, immediately return to own half!
        if (!ownHalf(team, you.x, border)) {
          const pool = safeMoves.length > 0 ? safeMoves : legalMoves;
          let bestAct = pool[0].action;
          let minD = Infinity;
          for (let i = 0; i < pool.length; i++) {
            const m = pool[i];
            const d = ownFlagDist[m.y * width + m.x];
            if (d !== -1 && d < minD) {
              minD = d;
              bestAct = m.action;
            }
          }
          return bestAct;
        }

        // 1. Intruder carrying our flag! EMERGENCY!
        const enemyCarrier = intruders.find(e => e.carrying);
        if (enemyCarrier) {
          // Can we tag this tick? Step onto carrier!
          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            if (m.x === enemyCarrier.x && m.y === enemyCarrier.y && ownHalf(team, m.x, border)) {
              return m.action;
            }
          }
          // Intercept carrier on its way to the border
          const carrierPath = getShortestPath(grid, width, height, enemyCarrier, validBorderCells[0]);
          let interceptPoint = enemyCarrier;
          for (let i = 0; i < carrierPath.length; i++) {
            const cell = carrierPath[i];
            const d = youDist[cell.y * width + cell.x];
            if (d !== -1 && d <= i + 1) {
              interceptPoint = cell;
              break;
            }
          }
          const interceptDist = computeBFS(grid, width, height, [interceptPoint]);
          let bestAct = 'stay';
          let minD = Infinity;
          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            if (!ownHalf(team, m.x, border) && m.x !== border) continue;
            const d = interceptDist[m.y * width + m.x];
            if (d !== -1 && d < minD) {
              minD = d;
              bestAct = m.action;
            }
          }
          return bestAct;
        }

        // 2. Intruders in our half without flag
        if (intruders.length > 0) {
          // Prioritize intruder closest to our flag
          intruders.sort((a, b) => {
            const da = ownFlagDist[a.y * width + a.x];
            const db = ownFlagDist[b.y * width + b.x];
            return da - db;
          });
          const targetIntruder = intruders[youIdx < intruders.length ? youIdx : 0];

          // Can we tag this tick? Step onto intruder!
          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            if (m.x === targetIntruder.x && m.y === targetIntruder.y && ownHalf(team, m.x, border)) {
              return m.action;
            }
          }

          // Intercept between intruder and our flag
          const intruderPath = getShortestPath(grid, width, height, targetIntruder, ownFlagHome);
          let interceptPoint = targetIntruder;
          for (let i = 0; i < intruderPath.length; i++) {
            const cell = intruderPath[i];
            const d = youDist[cell.y * width + cell.x];
            if (d !== -1 && d <= i + 1) {
              interceptPoint = cell;
              break;
            }
          }

          const interceptDist = computeBFS(grid, width, height, [interceptPoint]);
          let bestAct = 'stay';
          let minD = Infinity;
          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            if (!ownHalf(team, m.x, border) && m.x !== border) continue;
            const d = interceptDist[m.y * width + m.x];
            if (d !== -1 && d < minD) {
              minD = d;
              bestAct = m.action;
            }
          }
          return bestAct;
        }

        // 3. No intruders in our half: Hold choke point in front of flag
        let holdPoint;
        if (youIdx === 0) {
          const hx = isWest ? ownFlagHome.x + 1 : ownFlagHome.x - 1;
          holdPoint = { x: hx, y: ownFlagHome.y };
        } else {
          const fx = isWest ? border - 2 : border + 2;
          holdPoint = { x: fx, y: Math.floor(height / 2) };
        }

        const holdDist = computeBFS(grid, width, height, [holdPoint]);
        let bestAct = 'stay';
        let minD = Infinity;
        for (let i = 0; i < legalMoves.length; i++) {
          const m = legalMoves[i];
          if (!ownHalf(team, m.x, border)) continue;
          const d = holdDist[m.y * width + m.x];
          if (d !== -1 && d < minD) {
            minD = d;
            bestAct = m.action;
          }
        }
        return bestAct;
      }

      // =========================================================================
      // 4. RESCUER ROLE: Infiltrate enemy territory to free prisoners
      // =========================================================================
      if (role === 'RESCUER') {
        const jailGoalFn = p => enemyJail.some(j => Math.abs(p.x - j.x) + Math.abs(p.y - j.y) <= 1);
        const act = findSafePathAction(you, jailGoalFn, state, enemyDefenderDist, enemyDefenders);
        if (act !== 'stay') return act;

        // Fallback: safe move towards jail
        const jailDist = computeBFS(grid, width, height, enemyJail);
        const pool = safeMoves.length > 0 ? safeMoves : legalMoves;
        let bestAct = pool[0].action;
        let minD = Infinity;
        for (let i = 0; i < pool.length; i++) {
          const m = pool[i];
          const d = jailDist[m.y * width + m.x];
          if (d !== -1 && d < minD) {
            minD = d;
            bestAct = m.action;
          }
        }
        return bestAct;
      }

      // =========================================================================
      // 5. RAIDER ROLE: Infiltrate, capture flag, outmaneuver defenders
      // =========================================================================
      {
        const flagGoalFn = p => p.x === enemyFlag.x && p.y === enemyFlag.y;
        const act = findSafePathAction(you, flagGoalFn, state, enemyDefenderDist, enemyDefenders);
        if (act !== 'stay') return act;

        // If no safe forward path exists and we are in enemy territory, retreat to border!
        if (enemyHalf(team, you.x, border)) {
          const actToBorder = findSafePathAction(you, p => p.x === border, state, enemyDefenderDist, enemyDefenders);
          if (actToBorder !== 'stay') return actToBorder;
        }

        // Fallback: Safe move that minimizes distance to enemy flag
        const pool = safeMoves.length > 0 ? safeMoves : legalMoves;
        let bestAct = pool[0].action;
        let minD = Infinity;
        for (let i = 0; i < pool.length; i++) {
          const m = pool[i];
          const d = enemyFlagDist[m.y * width + m.x];
          if (d !== -1 && d < minD) {
            minD = d;
            bestAct = m.action;
          }
        }
        return bestAct;
      }

    } catch (err) {
      // Hard fallback: never crash, return stay
      return 'stay';
    }
  }
};
