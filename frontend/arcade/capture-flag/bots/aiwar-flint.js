'use strict';

const ACTIONS = ['stay', 'up', 'right', 'down', 'left'];
const DX = [0, 0, 1, 0, -1];
const DY = [0, -1, 0, 1, 0];

const scratchCache = new Map();

function getScratch(w, h) {
  const key = w + 'x' + h;
  let s = scratchCache.get(key);
  if (s === undefined) {
    const size = w * h;
    s = {
      size: size,
      visited: new Int32Array(size),
      cameAction: new Int8Array(size).fill(0),
      cameFrom: new Int32Array(size).fill(-1),
      queue: new Int32Array(size),
    };
    scratchCache.set(key, s);
  }
  return s;
}

function planMove(state, me, goalOk, useDanger) {
  const w = state.width;
  const h = state.height;
  const s = getScratch(w, h);
  const visited = s.visited;
  const cameAction = s.cameAction;
  const cameFrom = s.cameFrom;
  const queue = s.queue;
  const size = s.size;
  const idx = (x, y) => y * w + x;
  const start = idx(me.x, me.y);
  const execute = function (blockDanger) {
    visited.fill(0);
    cameFrom.fill(-1);
    let qh = 0;
    let qt = 0;
    queue[qt++] = start;
    visited[start] = 1;
    let goalKey = -1;
    while (qh < qt) {
      const k = queue[qh++];
      const x = k % w;
      const y = Math.floor(k / w);
      if (goalOk({ x: x, y: y })) { goalKey = k; break; }
      for (let d = 1; d < 5; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (state.grid[ny][nx] !== '.') continue;
        const nk = ny * w + nx;
        if (visited[nk]) continue;
        if (blockDanger) {
          let bad = false;
          const enemies = state.enemies || [];
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.jailed || e.respawnIn > 0) continue;
            if (e.x === null || e.y === null) continue;
            if (Math.abs(nx - e.x) + Math.abs(ny - e.y) <= 1) { bad = true; break; }
          }
          if (bad) continue;
        }
        visited[nk] = 1;
        cameAction[nk] = d;
        cameFrom[nk] = k;
        queue[qt++] = nk;
      }
    }
    if (goalKey < 0) return null;
    let action = 'stay';
    let k = goalKey;
    for (;;) {
      const prev = cameFrom[k];
      if (prev < 0) break;
      action = ACTIONS[cameAction[k]];
      k = prev;
    }
    return action;
  };
  let action = execute(true);
  if (action === null && useDanger) action = execute(false);
  if (action === null) return 'stay';
  return action;
}

function findThreat(state) {
  const flag = state.flags ? state.flags[state.team] : null;
  const carrierId = flag ? flag.carrier : null;
  if (carrierId === null || carrierId === undefined) return null;
  const border = state.border;
  const myTeam = state.team;
  const inMyHalf = (x) => myTeam === 'west' ? x < border : x > border;
  const list = state.enemies || [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.jailed || e.respawnIn > 0) continue;
    if (String(e.id) !== String(carrierId)) continue;
    if (e.x === null || e.y === null) continue;
    if (!inMyHalf(e.x)) return null;
    return e;
  }
  return null;
}

module.exports = {
  name: 'Overrun',
  move(state) {
    const you = state.you;
    if (you.jailed || you.respawnIn > 0) return 'stay';
    const me = { x: you.x, y: you.y };
    const myTeam = state.team;
    const enemyTeam = myTeam === 'west' ? 'east' : 'west';
    const border = state.border;
    const inMyHalf = (x) => myTeam === 'west' ? x < border : x > border;
    const enemyFlag = state.flags ? state.flags[enemyTeam] : null;

    if (you.carrying) {
      return planMove(state, me, function (p) { return inMyHalf(p.x); }, true);
    }

    const threat = findThreat(state);
    if (threat) {
      return planMove(state, me, function (p) { return p.x === threat.x && p.y === threat.y; }, false);
    }

    const allies = state.teammates || [];
    let needsRescue = false;
    for (let i = 0; i < allies.length; i++) {
      const t = allies[i];
      if (t.jailed) { needsRescue = true; break; }
    }
    if (needsRescue) {
      const jail = state.zones ? state.zones[enemyTeam].jail : [];
      const goalOk = function (p) {
        for (let i = 0; i < jail.length; i++) {
          if (Math.abs(p.x - jail[i].x) + Math.abs(p.y - jail[i].y) <= 1) return true;
        }
        return false;
      };
      return planMove(state, me, goalOk, false);
    }

    return planMove(state, me, function (p) { return p.x === enemyFlag.x && p.y === enemyFlag.y; }, true);
  }
};
