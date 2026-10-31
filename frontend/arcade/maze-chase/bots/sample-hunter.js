'use strict';

module.exports = function move(state) {
  const you = state.you;
  const key = (x, y) => y * state.width + x;
  const dirs = ['up', 'left', 'down', 'right'];
  const runners = state.runners.filter(r => r.alive && !r.respawnIn);
  const threats = state.ghosts.filter(g => {
    return !g.frightened && !g.inPen && !g.respawnIn;
  });

  function adjacent(x, y, role) {
    const from = state.grid[y][x];
    return dirs.map(dir => {
      let nx = x + MazeEngine.DIRS[dir][0];
      const ny = y + MazeEngine.DIRS[dir][1];
      if (y === state.tunnelRow) nx = (nx + state.width) % state.width;
      return { x: nx, y: ny, dir };
    }).filter(p => {
      const cell = state.grid[p.y] && state.grid[p.y][p.x];
      if (!cell || cell === '#') return false;
      if (role === 'runner') return cell !== 'G' && cell !== '-';
      return !(from === 'G' && cell !== 'G' && cell !== '-')
        && !(cell === 'G' && from !== 'G' && from !== '-');
    });
  }

  function distances(sources, role) {
    const map = new Map();
    const queue = [];

    sources.forEach(p => {
      const k = key(p.x, p.y);
      if (!map.has(k)) {
        map.set(k, 0);
        queue.push(p);
      }
    });

    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      adjacent(p.x, p.y, role).forEach(n => {
        const k = key(n.x, n.y);
        if (map.has(k)) return;
        map.set(k, map.get(key(p.x, p.y)) + 1);
        queue.push(n);
      });
    }
    return map;
  }

  const legal = adjacent(you.x, you.y, you.role);
  if (!legal.length) return 'stay';

  if (you.role === 'ghost') {
    // Pen movement is deterministic and always finds the only legal exit.
    const doors = [];
    if (you.inPen) {
      state.grid.forEach((row, y) => Array.from(row).forEach((c, x) => {
        if (c === '-') doors.push({ x, y });
      }));
    }

    const map = distances(you.inPen ? doors : runners, 'ghost');
    const fleeing = you.frightened && !you.inPen;
    legal.sort((a, b) => {
      const da = map.get(key(a.x, a.y)) ?? 10000;
      const db = map.get(key(b.x, b.y)) ?? 10000;
      return fleeing ? db - da : da - db;
    });
    return legal[0].dir;
  }

  const danger = distances(threats, 'ghost');
  const queue = [{ x: you.x, y: you.y, first: 'stay' }];
  const seen = new Set([key(you.x, you.y)]);

  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (i && (state.grid[p.y][p.x] === '.' || state.grid[p.y][p.x] === 'o')) {
      return p.first;
    }

    adjacent(p.x, p.y, 'runner').forEach(n => {
      const k = key(n.x, n.y);
      if (seen.has(k) || (danger.get(k) ?? 10000) <= 3) return;
      seen.add(k);
      queue.push({
        ...n,
        first: p.first === 'stay' ? n.dir : p.first
      });
    });
  }

  legal.sort((a, b) => {
    return (danger.get(key(b.x, b.y)) ?? 10000)
      - (danger.get(key(a.x, a.y)) ?? 10000);
  });
  return legal[0].dir;
};
