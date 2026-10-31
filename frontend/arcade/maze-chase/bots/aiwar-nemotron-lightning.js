'use strict';

module.exports = {
  name: 'NemotronChaser',
  move(state) {
    const you = state.you;
    const role = you.role;
    const tick = state.tick;
    const width = state.width;
    const height = state.height;
    const tunnelRow = state.tunnelRow;

    if (!you.alive || you.respawnIn) return 'stay';

    if (role === 'runner') {
      const legal = legalMoves(you, state.grid, width, height, tunnelRow);
      if (!legal.length) return 'stay';

      if (you.frightened && (tick + 1) % 2 === 1) return 'stay';

      // Priority 1: Eat edible ghosts
      const edibleGhosts = state.ghosts.filter(
        g => !g.inPen && g.frightened && !g.immuneEpoch && g.alive
      );
      if (edibleGhosts.length > 0) {
        // Pick the closest edible ghost
        let bestGhost = edibleGhosts[0];
        let bestDist = Infinity;
        for (const g of edibleGhosts) {
          const dx = Math.abs(g.x - you.x);
          const dy = Math.abs(g.y - you.y);
          let hw = dx;
          if (you.y === tunnelRow) hw = Math.min(dx, width - dx);
          const dist = hw + dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestGhost = g;
          }
        }
        const dirToGhost = directionTo(you, bestGhost, state.grid, width, height, tunnelRow);
        if (dirToGhost) return dirToGhost;
      }

      // Priority 2: Collect power pellet if nearby and safe
      if (state.powerPellets.length > 0 && you.frightTicksLeft < 20) {
        const powerDir = closestPowerPellet(you, state.powerPellets, state.grid, width, height, tunnelRow);
        if (powerDir) {
          const nx = you.x + MazeEngine.DIRS[powerDir][0];
          const ny = you.y + MazeEngine.DIRS[powerDir][1];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const cell = state.grid[ny] && state.grid[ny][nx];
            if (cell !== 'G' && cell !== '-') {
              return powerDir;
            }
          }
        }
      }

      // Priority 3: Collect closest pellet safely
      const pellets = [];
      for (let y = 0; y < state.grid.length; y++) {
        const row = state.grid[y];
        for (let x = 0; x < row.length; x++) {
          const c = row[x];
          if (c === '.' || c === 'o') pellets.push({ x, y });
        }
      }
      if (pellets.length > 0) {
        const closestPellet = closestGoal(you, pellets, state.grid, width, height, tunnelRow);
        if (closestPellet) {
          const dirToPellet = directionTo(you, closestPellet, state.grid, width, height, tunnelRow);
          if (dirToPellet) {
            if (isSafeFromRunners(you, dirToPellet, state.grid, width, height, tunnelRow, state.ghosts)) {
              return dirToPellet;
            }
          }
        }
      }

      // Priority 4: Avoid dangerous ghosts
      const threats = state.ghosts.filter(g => !g.frightened && !g.inPen && g.alive);
      if (threats.length > 0) {
        const dir = avoidGhosts(you, legal, threats, state.grid, width, height, tunnelRow);
        if (dir) return dir;
      }

      return legal[Math.floor(Math.random() * legal.length)];
    }

    // ---- Ghost logic ----
    if (role === 'ghost') {
      const legal = legalMoves(you, state.grid, width, height, tunnelRow);
      if (!legal.length) return 'stay';

      const nextTick = tick + 1;

      if (you.frightened && nextTick % 2 === 1) return 'stay';

      // If in pen, try to exit on release schedule
      if (you.inPen) {
        if (you.releaseIn > 0) {
          return 'stay';
        }
        const doorCells = [];
        for (let y = 0; y < state.grid.length; y++) {
          const row = state.grid[y];
          for (let x = 0; x < row.length; x++) {
            if (row[x] === '-') doorCells.push({ x, y });
          }
        }
        if (doorCells.length > 0) {
          const legalFromPen = legal.filter(d => {
            const [dx, dy] = MazeEngine.DIRS[d];
            const nx = you.x + dx;
            const ny = you.y + dy;
            return nx >= 0 && nx < width && ny >= 0 && ny < height &&
              (state.grid[ny][nx] === '.' || state.grid[ny][nx] === 'o' || state.grid[ny][nx] === 'G' || state.grid[ny][nx] === '-');
          });
          if (legalFromPen.length > 0) {
            return legalFromPen[0];
          }
        }
        return 'stay';
      }

      // If frightened, move away from runners
      if (you.frightened) {
        const runners = state.runners.filter(r => r.alive && !r.respawnIn);
        if (runners.length > 0) {
          const bestAvoid = avoidRunners(you, legal, runners, state.grid, width, height, tunnelRow);
          if (bestAvoid) return bestAvoid;
        }
        return legal[Math.floor(Math.random() * legal.length)];
      }

      // Normal ghost: chase runners
      const runners = state.runners.filter(r => r.alive && !r.respawnIn);
      if (runners.length > 0) {
        const bestChase = bestChaseTarget(you, runners, state.grid, width, height, tunnelRow);
        if (bestChase) {
          const dirToTarget = directionTo(you, bestChase, state.grid, width, height, tunnelRow);
          if (dirToTarget) return dirToTarget;
        }
      }

      const dir = preferLegalChase(you, legal, state.runners, state.grid, width, height, tunnelRow);
      if (dir) return dir;

      return legal[Math.floor(Math.random() * legal.length)];
    }

    return 'stay';
  }
};

// ---- Helper functions ----

function legalMoves(agent, grid, width, height, tunnelRow) {
  const legal = ['up', 'right', 'down', 'left'].filter(dir => {
    const [dx, dy] = MazeEngine.DIRS[dir];
    let x = agent.x + dx;
    const y = agent.y + dy;
    if (agent.y === tunnelRow) x = (x + width) % width;
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const cell = grid[y] && grid[y][x];
    if (!cell || cell === '#') return false;
    if (agent.role === 'runner') return cell !== 'G' && cell !== '-';
    const from = grid[agent.y][agent.x];
    if (from === 'G' && cell !== 'G' && cell !== '-') return false;
    if (cell === 'G' && from !== 'G' && from !== '-') return false;
    if (agent.inPen && agent.releaseIn > 1 && cell !== 'G') return false;
    return true;
  });
  return legal;
}

function directionTo(agent, target, grid, width, height, tunnelRow) {
  const dx = target.x - agent.x;
  const dy = target.y - agent.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'down' : 'up';
  }
}

function closestGoal(agent, goals, grid, width, height, tunnelRow) {
  let best = null;
  let bestDist = Infinity;
  for (const g of goals) {
    const dx = Math.abs(g.x - agent.x);
    const dy = Math.abs(g.y - agent.y);
    let hw = dx;
    if (agent.y === tunnelRow) hw = Math.min(dx, width - dx);
    const dist = hw + dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = g;
    }
  }
  return best;
}

function isSafeFromRunners(agent, dir, grid, width, height, tunnelRow, ghosts) {
  const [dx, dy] = MazeEngine.DIRS[dir];
  const nx = agent.x + dx;
  const ny = agent.y + dy;
  if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
  const cell = grid[ny] && grid[ny][nx];
  if (!cell || cell === '#') return false;
  for (const g of ghosts) {
    if (!g.frightened && !g.inPen && g.alive && g.x === nx && g.y === ny) return false;
  }
  return true;
}

function avoidGhosts(agent, legal, threats, grid, width, height, tunnelRow) {
  let bestDir = null;
  let bestDist = -1;
  for (const dir of legal) {
    const [dx, dy] = MazeEngine.DIRS[dir];
    const nx = agent.x + dx;
    const ny = agent.y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const cell = grid[ny] && grid[ny][nx];
    if (!cell || cell === '#') continue;
    let minDist = Infinity;
    for (const g of threats) {
      const gdx = Math.abs(g.x - nx);
      const gdy = Math.abs(g.y - ny);
      let hwdx = gdx;
      if (ny === tunnelRow) hwdx = Math.min(gdx, width - gdx);
      const dist = hwdx + gdy;
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestDist) {
      bestDist = minDist;
      bestDir = dir;
    }
  }
  return bestDir;
}

function avoidRunners(agent, legal, runners, grid, width, height, tunnelRow) {
  let bestDir = null;
  let bestDist = -1;
  for (const dir of legal) {
    const [dx, dy] = MazeEngine.DIRS[dir];
    const nx = agent.x + dx;
    const ny = agent.y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const cell = grid[ny] && grid[ny][nx];
    if (!cell || cell === '#') continue;
    let minDist = Infinity;
    for (const r of runners) {
      const gdx = Math.abs(r.x - nx);
      const gdy = Math.abs(r.y - ny);
      let hwdx = gdx;
      if (ny === tunnelRow) hwdx = Math.min(gdx, width - gdx);
      const dist = hwdx + gdy;
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestDist) {
      bestDist = minDist;
      bestDir = dir;
    }
  }
  return bestDir;
}

function bestChaseTarget(agent, runners, grid, width, height, tunnelRow) {
  let best = null;
  let bestScore = -Infinity;
  for (const r of runners) {
    const dx = Math.abs(r.x - agent.x);
    const dy = Math.abs(r.y - agent.y);
    let hw = dx;
    if (agent.y === tunnelRow) hw = Math.min(dx, width - dx);
    const dist = hw + dy;
    const score = 1000 / (dist + 1) + (r.frightened ? 500 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

function preferLegalChase(agent, legal, runners, grid, width, height, tunnelRow) {
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  let bestDir = legal[0];
  let bestScore = -Infinity;

  for (const dir of legal) {
    const [dx, dy] = MazeEngine.DIRS[dir];
    const nx = agent.x + dx;
    const ny = agent.y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const cell = grid[ny] && grid[ny][nx];
    if (!cell || cell === '#') continue;

    let minDist = Infinity;
    for (const r of runners) {
      if (!r.alive || r.respawnIn) continue;
      const gdx = Math.abs(r.x - nx);
      const gdy = Math.abs(r.y - ny);
      let hwdx = gdx;
      if (ny === tunnelRow) hwdx = Math.min(gdx, width - gdx);
      const dist = hwdx + gdy;
      if (dist < minDist) minDist = dist;
    }
    const score = 10000 / (minDist + 1) + (minDist < 10 ? 500 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }
  return bestDir;
}