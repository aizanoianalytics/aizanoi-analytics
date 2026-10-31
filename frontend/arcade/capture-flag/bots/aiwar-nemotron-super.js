'use strict';

const DIR_ORDER = ['up', 'right', 'down', 'left'];
const DELTAS = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0]
};
const INF = 0xFFFFFFFF;

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isActive(a) {
  return !a.jailed && a.respawnIn === 0 && a.x != null && a.y != null;
}

function ownHalfX(team, border, x) {
  return team === 'west' ? x < border : x > border;
}

// Distance map from (tx, ty) over open terrain. Returns a flat Uint32Array
// indexed by y * width + x; unreachable cells are INF.
function distanceMap(grid, width, height, tx, ty) {
  const size = width * height;
  const dist = new Uint32Array(size);
  for (let i = 0; i < size; i++) dist[i] = INF;
  if (ty < 0 || ty >= height || tx < 0 || tx >= width || grid[ty][tx] === '#') return dist;
  const queue = new Uint32Array(size);
  let head = 0;
  let tail = 0;
  const start = ty * width + tx;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const n = queue[head++];
    const x = n % width;
    const y = (n / width) | 0;
    const d = dist[n] + 1;
    // up
    if (y > 0 && grid[y - 1][x] === '.' && dist[n - width] === INF) {
      dist[n - width] = d;
      queue[tail++] = n - width;
    }
    // down
    if (y + 1 < height && grid[y + 1][x] === '.' && dist[n + width] === INF) {
      dist[n + width] = d;
      queue[tail++] = n + width;
    }
    // left
    if (x > 0 && grid[y][x - 1] === '.' && dist[n - 1] === INF) {
      dist[n - 1] = d;
      queue[tail++] = n - 1;
    }
    // right
    if (x + 1 < width && grid[y][x + 1] === '.' && dist[n + 1] === INF) {
      dist[n + 1] = d;
      queue[tail++] = n + 1;
    }
  }
  return dist;
}

// First step of a shortest path from (me) to (tx, ty). 'stay' if already there
// or unreachable. Deterministic tie-breaking by DIR_ORDER.
function bestMove(state, tx, ty) {
  const me = state.you;
  if (me.x === tx && me.y === ty) return 'stay';
  const dmap = distanceMap(state.grid, state.width, state.height, tx, ty);
  const here = me.y * state.width + me.x;
  if (dmap[here] === INF) return 'stay';
  let best = 'stay';
  let bestD = dmap[here];
  const w = state.width;
  for (let i = 0; i < DIR_ORDER.length; i++) {
    const dir = DIR_ORDER[i];
    const delta = DELTAS[dir];
    const nx = me.x + delta[0];
    const ny = me.y + delta[1];
    if (nx < 0 || nx >= w || ny < 0 || ny >= state.height) continue;
    if (state.grid[ny][nx] !== '.') continue;
    const nd = dmap[ny * w + nx];
    if (nd !== INF && nd < bestD) {
      bestD = nd;
      best = dir;
    }
  }
  return best;
}

function homeStand(state) {
  const home = state.zones[state.team].home;
  // center of the 3x3 home zone
  return home[4];
}

module.exports = {
  name: 'Nemotron-CTF',
  move(state) {
    const me = state.you;
    if (!me || me.jailed || me.respawnIn > 0 || me.x == null || me.y == null) return 'stay';

    const team = state.team;
    const enemyTeam = team === 'west' ? 'east' : 'west';
    const border = state.border;
    const oh = x => ownHalfX(team, border, x);
    const activeEnemies = state.enemies.filter(isActive);
    const activeTeammates = state.teammates.filter(isActive);

    // 1. Carrying the enemy flag: score by reaching our own stand.
    if (me.carrying) {
      return bestMove(state, homeStand(state).x, homeStand(state).y);
    }

    const ourFlag = state.flags[team];
    const enemyFlag = state.flags[enemyTeam];
    const roster = [me, ...state.teammates].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    const amFirst = roster[0].id === me.id;
    const isDefender = roster.length > 1 && amFirst;

    // 2. An enemy carrying our flag inside our half: chase and tag.
    if (ourFlag.carrier !== null) {
      const thief = activeEnemies.find(e => e.id === ourFlag.carrier && oh(e.x));
      if (thief) return bestMove(state, thief.x, thief.y);
    }

    // 3. Adjacent enemy in our half: step onto them to secure the tag.
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (oh(e.x) && oh(me.x) && manhattan(me, e) <= 1) {
        return bestMove(state, e.x, e.y);
      }
    }

    const home = homeStand(state);

    // Defender: camp the stand. The flag can only be picked up by stepping on
    // it, which puts the thief on our cell in our half - a free tag.
    if (isDefender) {
      return bestMove(state, home.x, home.y);
    }

    // Attackers: only the closest attacker leaves to rescue jailed teammates.
    const jailed = state.teammates.filter(t => t.jailed);
    if (jailed.length > 0) {
      const jail = state.zones[enemyTeam].jail;
      const w = state.width;
      const h = state.height;
      const grid = state.grid;
      const candidates = [];
      for (let j = 0; j < jail.length; j++) {
        const cell = jail[j];
        const pts = [{ x: cell.x, y: cell.y },
                     { x: cell.x - 1, y: cell.y }, { x: cell.x + 1, y: cell.y },
                     { x: cell.x, y: cell.y - 1 }, { x: cell.x, y: cell.y + 1 }];
        for (let k = 0; k < pts.length; k++) {
          const p = pts[k];
          if (p.x >= 0 && p.x < w && p.y >= 0 && p.y < h && grid[p.y][p.x] === '.') {
            candidates.push(p);
          }
        }
      }
      if (candidates.length > 0) {
        // Multi-source BFS from rescue candidates: dist to the nearest rescue cell.
        const rmap = new Uint32Array(w * h);
        for (let i = 0; i < rmap.length; i++) rmap[i] = INF;
        const queue = new Uint32Array(w * h);
        let head = 0;
        let tail = 0;
        for (let k = 0; k < candidates.length; k++) {
          const key = candidates[k].y * w + candidates[k].x;
          if (rmap[key] !== 0) { rmap[key] = 0; queue[tail++] = key; }
        }
        while (head < tail) {
          const n = queue[head++];
          const x = n % w;
          const y = (n / w) | 0;
          const d = rmap[n] + 1;
          if (y > 0 && grid[y - 1][x] === '.' && rmap[n - w] === INF) { rmap[n - w] = d; queue[tail++] = n - w; }
          if (y + 1 < h && grid[y + 1][x] === '.' && rmap[n + w] === INF) { rmap[n + w] = d; queue[tail++] = n + w; }
          if (x > 0 && grid[y][x - 1] === '.' && rmap[n - 1] === INF) { rmap[n - 1] = d; queue[tail++] = n - 1; }
          if (x + 1 < w && grid[y][x + 1] === '.' && rmap[n + 1] === INF) { rmap[n + 1] = d; queue[tail++] = n + 1; }
        }
        let closest = me;
        let closestD = rmap[me.y * w + me.x];
        for (let i = 0; i < activeTeammates.length; i++) {
          const t = activeTeammates[i];
          const td = rmap[t.y * w + t.x];
          if (td < closestD || (td === closestD && String(t.id) < String(closest.id))) {
            closestD = td;
            closest = t;
          }
        }
        if (closest.id === me.id) {
          const dmap = distanceMap(grid, w, h, me.x, me.y);
          let best = candidates[0];
          let bestD = dmap[best.y * w + best.x];
          for (let k = 1; k < candidates.length; k++) {
            const p = candidates[k];
            const d = dmap[p.y * w + p.x];
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
          return bestMove(state, best.x, best.y);
        }
      }
    }

    // 4. Attackers: if the enemy flag is camped at its stand (guard within 2
    // cells) it cannot be taken - holding avoids gifting the enemy tags.
    // Same posture while a teammate carries the flag home.
    const standGuarded = enemyFlag.carrier === null &&
      activeEnemies.some(e => manhattan(e, enemyFlag) <= 2);
    if (standGuarded || activeTeammates.some(t => t.carrying)) {
      return bestMove(state, home.x, home.y);
    }

    // 5. Enemy flag is free: capture it.
    return bestMove(state, enemyFlag.x, enemyFlag.y);
  }
};
