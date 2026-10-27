'use strict';

module.exports = function move(state) {
  const you = state.you;
  const key = p => p.y * state.width + p.x;
  const dirs = ['up', 'right', 'down', 'left'];

  function adjacent(p, role) {
    const from = state.grid[p.y][p.x];
    return dirs.map(dir => {
      let x = p.x + MazeEngine.DIRS[dir][0];
      const y = p.y + MazeEngine.DIRS[dir][1];
      if (p.y === state.tunnelRow) x = (x + state.width) % state.width;
      return { x, y, dir };
    }).filter(n => {
      const cell = state.grid[n.y] && state.grid[n.y][n.x];
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
      if (!map.has(key(p))) {
        map.set(key(p), 0);
        queue.push(p);
      }
    });

    for (let i = 0; i < queue.length; i++) {
      adjacent(queue[i], role).forEach(p => {
        if (map.has(key(p))) return;
        map.set(key(p), map.get(key(queue[i])) + 1);
        queue.push(p);
      });
    }
    return map;
  }

  const legal = adjacent(you, you.role);
  if (!legal.length) return 'stay';
  const live = state.runners.filter(r => r.alive && !r.respawnIn);

  if (you.role === 'ghost') {
    let targets = [];

    if (you.inPen) {
      state.grid.forEach((row, y) => Array.from(row).forEach((c, x) => {
        if (c === '-') targets.push({ x, y });
      }));
    } else {
      const fromYou = distances([you], 'ghost');
      const ordered = live.slice().sort((a, b) => {
        return (fromYou.get(key(a)) ?? 10000)
          - (fromYou.get(key(b)) ?? 10000);
      });
      const index = state.ghosts.findIndex(g => g.id === you.id);
      const target = ordered[index % Math.max(1, ordered.length)];

      if (target) {
        let predicted = { x: target.x, y: target.y };
        for (let i = 0; i < 4; i++) {
          const next = adjacent(predicted, 'runner').find(p => p.dir === target.dir);
          if (!next) break;
          predicted = next;
        }

        if (index % 2 === 0) {
          targets = [predicted];
        } else {
          const approaches = adjacent(predicted, 'runner');
          const toward = MazeEngine.DIRS[target.dir] || [0, 0];
          approaches.sort((a, b) => {
            return (b.x - predicted.x) * toward[0]
              + (b.y - predicted.y) * toward[1]
              - (a.x - predicted.x) * toward[0]
              - (a.y - predicted.y) * toward[1];
          });
          targets = [approaches[0] || predicted];
        }
      }
    }

    const map = distances(
      you.frightened && !you.inPen ? live : targets,
      'ghost'
    );
    legal.sort((a, b) => {
      const diff = (map.get(key(a)) ?? 10000)
        - (map.get(key(b)) ?? 10000);
      return you.frightened && !you.inPen ? -diff : diff;
    });
    return legal[0].dir;
  }

  const threats = state.ghosts.filter(g => !g.inPen && !g.frightened);
  const danger = distances(threats, 'ghost');
  const edible = distances(
    state.ghosts.filter(g => !g.inPen && g.frightened),
    'ghost'
  );
  const pellets = [];

  state.grid.forEach((row, y) => Array.from(row).forEach((c, x) => {
    if (c === '.' || c === 'o') {
      pellets.push({ x, y, power: c === 'o' });
    }
  }));

  const scored = legal.map(p => {
    const map = distances([p], 'runner');
    const safety = danger.get(key(p)) ?? 10000;
    let reward = 0;

    pellets.forEach(target => {
      const d = map.get(key(target));
      if (d === undefined) return;
      const urgent = target.power && threats.length && safety < 8;
      const value = target.power
        ? (urgent ? 45 : state.frightTicksLeft > 12 ? 1 : 8)
        : 12;
      reward = Math.max(reward, value / (d + 1));
    });

    const hunt = edible.get(key(p)) ?? 10000;
    const canHunt = state.frightTicksLeft > hunt + 3;
    const penalty = you.invulnerable ? 0
      : safety <= 1 ? 10000
        : safety <= 3 ? 150 / safety
          : 8 / (safety + 1);
    const powerNow = state.grid[p.y][p.x] === 'o';

    return {
      dir: p.dir,
      score: reward
        + (canHunt ? 20 / (hunt + 1) : 0)
        - (powerNow ? 0 : penalty)
        + (p.dir === you.dir ? 0.01 : 0)
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].dir;
};
