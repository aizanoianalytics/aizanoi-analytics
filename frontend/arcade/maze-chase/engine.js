(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MazeEngine = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DIRS = Object.freeze({
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
    stay: [0, 0]
  });
  const cardinal = ['up', 'down', 'left', 'right'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const LAYOUTS = {
    aizanoi: [
      '###########################',
      '#o.......................o#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.....#.............#.....#',
      '#.###.#.###.#.#.###.#.###.#',
      '#.........#.....#.........#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.....#.............#.....#',
      '#.#.###.#.#.#.#.#.#.###.#.#',
      '#.........#.....#.........#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.#..........-..........#.#',
      '#.#.#.#.#.#GGGGG#.#.#.#.#.#',
      '...........GGGGG...........',
      '#.#.#.#.#.#GGGGG#.#.#.#.#.#',
      '#.#.....................#.#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.........#.....#.........#',
      '#.#.###.#.#.#.#.#.#.###.#.#',
      '#.....#.............#.....#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.........#.....#.........#',
      '#.###.#.###.#.#.###.#.###.#',
      '#.....#.............#.....#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#o.......................o#',
      '###########################'
    ]
  };

  function rng(seed) {
    let a = Number(seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function neighbours(x, y, w, h, row) {
    return cardinal.map(d => {
      let nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      if (y === row) nx = (nx + w) % w;
      return [nx, ny];
    }).filter(([nx, ny]) => nx >= 0 && nx < w && ny >= 0 && ny < h);
  }

  function sound(grid, row) {
    const h = grid.length;
    const w = grid[0].length;
    const cells = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y][x] === '#') continue;
        const n = neighbours(x, y, w, h, row)
          .filter(([a, b]) => grid[b][a] !== '#');
        if (n.length < 2) return false;
        cells.push([x, y]);
      }
    }

    const seen = new Set();
    const queue = [cells[0]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      const key = y * w + x;
      if (seen.has(key)) continue;
      seen.add(key);
      neighbours(x, y, w, h, row).forEach(([a, b]) => {
        if (grid[b][a] !== '#' && !seen.has(b * w + a)) {
          queue.push([a, b]);
        }
      });
    }
    return seen.size === cells.length;
  }

  function dimension(value, fallback) {
    const n = value === undefined ? fallback : value;
    if (!Number.isInteger(n) || n < 19 || n > 61 || n % 2 === 0) {
      throw new RangeError('Maze dimensions must be odd integers from 19 to 61.');
    }
    return n;
  }

  function generateMaze(seed, width, height) {
    const w = dimension(width, 27);
    const h = dimension(height, 27);
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const random = rng(seed);
    const grid = Array.from({ length: h }, (_, y) => {
      return Array.from({ length: w }, (_, x) => {
        return x && y && x < w - 1 && y < h - 1 && (x % 2 || y % 2)
          ? '.'
          : '#';
      });
    });

    for (let x = 0; x < w; x++) grid[cy][x] = '.';
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) grid[y][x] = 'G';
    }
    grid[cy - 2][cx] = '-';

    // Connect the door even when the centre falls on an even lattice column.
    for (let x = cx - 1; x <= cx + 1; x++) {
      grid[cy - 2][x] = x === cx ? '-' : '.';
    }

    const candidates = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < cx; x++) {
        if ((x + y) % 2 === 1 && Math.abs(y - cy) > 3) {
          candidates.push([x, y]);
        }
      }
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    candidates.forEach(([x, y]) => {
      if (random() > 0.42) return;
      const mirror = w - 1 - x;
      grid[y][x] = grid[y][mirror] = '#';
      if (!sound(grid, cy)) grid[y][x] = grid[y][mirror] = '.';
    });

    [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].forEach(([x, y]) => {
      grid[y][x] = 'o';
    });
    return grid.map(row => row.join(''));
  }

  function create(seats, options = {}) {
    if (!Array.isArray(seats)) throw new TypeError('Seats must be an array.');

    const ids = new Set();
    const runners = seats.filter(s => s.role === 'runner');
    const ghosts = seats.filter(s => s.role === 'ghost');
    if (runners.length < 1 || runners.length > 4 || ghosts.length < 1 || ghosts.length > 6) {
      throw new RangeError('Use 1–4 runners and 1–6 ghosts.');
    }

    seats.forEach(s => {
      if (typeof s.id !== 'string' || !s.id || ids.has(s.id)
        || !['runner', 'ghost'].includes(s.role)) {
        throw new TypeError('Seats require unique string IDs and valid roles.');
      }
      ids.add(s.id);
    });

    const layout = options.layout === undefined ? 'generated' : options.layout;
    if (!['generated', 'aizanoi'].includes(layout)) {
      throw new RangeError('Unknown layout.');
    }

    const rows = layout === 'aizanoi'
      ? LAYOUTS.aizanoi.slice()
      : generateMaze(options.seed, options.width, options.height);
    const grid = rows.map(r => r.split(''));
    const height = grid.length;
    const width = grid[0].length;
    const tunnelRow = Math.floor(height / 2);
    const maxTicks = options.maxTicks === undefined ? 1500 : options.maxTicks;
    const frightDuration = options.frightTicks === undefined ? 60 : options.frightTicks;

    if (!Number.isInteger(maxTicks) || maxTicks < 1
      || !Number.isInteger(frightDuration) || frightDuration < 1) {
      throw new RangeError('Tick durations must be positive integers.');
    }

    let tick = 0;
    let frightUntil = 0;
    let epoch = 0;
    let chain = 0;
    let outcome = null;
    let pellets = grid.flat().filter(c => c === '.' || c === 'o').length;
    const pen = [];
    const floor = [];

    grid.forEach((row, y) => row.forEach((c, x) => {
      if (c === 'G') pen.push({ x, y });
      if (c === '.' || c === 'o' || c === ' ') floor.push({ x, y });
    }));

    if (!pen.length || floor.length < runners.length) {
      throw new Error('Layout has no usable spawns.');
    }

    const bottom = floor.sort((a, b) => b.y - a.y || a.x - b.x);
    const spawnRow = bottom.filter(p => p.y === bottom[0].y);
    let ri = 0;
    let gi = 0;
    const agents = seats.map(s => {
      const index = s.role === 'runner' ? ri++ : gi++;
      const spawn = s.role === 'runner'
        ? spawnRow[Math.floor((index + 1) * spawnRow.length / (runners.length + 1))]
        : pen[index % pen.length];

      return {
        id: s.id,
        role: s.role,
        name: String(s.name || s.id),
        x: spawn.x,
        y: spawn.y,
        dir: 'stay',
        alive: true,
        lives: s.role === 'runner' ? 3 : 0,
        score: 0,
        catches: 0,
        ghostsEaten: 0,
        eaten: 0,
        spawn: { ...spawn },
        inPen: s.role === 'ghost',
        releaseAt: index * 8,
        respawnAt: 0,
        invulnerableUntil: 0,
        immuneEpoch: -1
      };
    });

    const frightened = a => {
      return a.role === 'ghost' && tick < frightUntil && a.immuneEpoch !== epoch;
    };

    function copy(a) {
      return {
        id: a.id,
        role: a.role,
        name: a.name,
        x: a.x,
        y: a.y,
        dir: a.dir,
        alive: a.alive,
        lives: a.lives,
        score: a.score,
        catches: a.catches,
        ghostsEaten: a.ghostsEaten,
        frightened: frightened(a),
        inPen: a.inPen,
        respawnIn: Math.max(0, a.respawnAt - tick),
        invulnerable: tick < a.invulnerableUntil
      };
    }

    function destination(a, dir) {
      const delta = DIRS[dir];
      if (!delta) return null;
      let x = a.x + delta[0];
      const y = a.y + delta[1];
      if (a.y === tunnelRow) x = (x + width) % width;
      if (x < 0 || x >= width || y < 0 || y >= height || grid[y][x] === '#') {
        return null;
      }

      const cell = grid[y][x];
      const from = grid[a.y][a.x];
      if (a.role === 'runner' && (cell === 'G' || cell === '-')) return null;

      if (a.role === 'ghost') {
        if (from === 'G' && cell !== 'G' && cell !== '-') return null;
        if (cell === 'G' && from !== 'G' && from !== '-') return null;
        if (a.inPen && tick < a.releaseAt && cell !== 'G') return null;
      }
      return { x, y };
    }

    function finish() {
      const reason = !agents.some(a => a.role === 'runner' && a.alive) ? 'caught'
        : pellets === 0 ? 'pellets' : tick >= maxTicks ? 'time' : null;
      if (!reason) return;

      outcome = {
        winner: reason === 'pellets' ? 'runners' : 'ghosts',
        reason,
        tick,
        pelletsLeft: pellets,
        scores: agents.map(a => ({
          id: a.id,
          role: a.role,
          score: a.score,
          catches: a.catches,
          eaten: a.eaten,
          lives: a.lives,
          ghostsEaten: a.ghostsEaten
        }))
      };
    }

    function step(moves = {}) {
      if (outcome) return [];
      tick++;
      const events = [];

      if (frightUntil && tick === frightUntil) {
        events.push({ type: 'fright-end' });
      }

      const previous = new Map();
      const active = new Set();
      const resumed = new Set();

      agents.forEach(a => {
        if (!a.alive) return;
        if (a.respawnAt) {
          if (tick < a.respawnAt) return;
          a.respawnAt = 0;
          a.x = a.spawn.x;
          a.y = a.spawn.y;
          a.dir = 'stay';
          a.invulnerableUntil = tick + 10;
          resumed.add(a.id);
          events.push({ type: 'respawn', id: a.id });
        }

        active.add(a.id);
        previous.set(a.id, { x: a.x, y: a.y });
        if (resumed.has(a.id) || (frightened(a) && tick % 2 === 1)) return;

        const requested = moves && own(moves, a.id) ? moves[a.id] : null;
        const valid = typeof requested === 'string' && own(DIRS, requested);
        const dir = valid ? requested : a.dir;
        const target = destination(a, dir);

        if (target) {
          a.x = target.x;
          a.y = target.y;
          a.dir = dir;
        }
        if (a.role === 'ghost' && grid[a.y][a.x] !== 'G' && grid[a.y][a.x] !== '-') {
          a.inPen = false;
        }
      });

      agents.filter(a => a.role === 'runner' && active.has(a.id)).forEach(a => {
        const cell = grid[a.y][a.x];
        if (cell !== '.' && cell !== 'o') return;

        grid[a.y][a.x] = ' ';
        pellets--;
        a.score += cell === 'o' ? 50 : 10;

        if (cell === 'o') {
          epoch++;
          chain = 0;
          frightUntil = tick + frightDuration;
        }

        events.push({
          type: cell === 'o' ? 'power' : 'pellet',
          id: a.id,
          x: a.x,
          y: a.y
        });
      });

      const hunters = agents.filter(a => a.role === 'ghost' && active.has(a.id));

      agents.filter(a => a.role === 'runner' && active.has(a.id)).forEach(r => {
        if (tick < r.invulnerableUntil) return;

        for (const g of hunters) {
          if (g.inPen) continue;
          const rp = previous.get(r.id);
          const gp = previous.get(g.id);
          const contact = (r.x === g.x && r.y === g.y)
            || (r.x === gp.x && r.y === gp.y && g.x === rp.x && g.y === rp.y);
          if (!contact) continue;

          if (frightened(g)) {
            const points = 200 * (2 ** Math.min(chain++, 3));
            r.score += points;
            r.ghostsEaten++;
            g.eaten++;
            g.x = g.spawn.x;
            g.y = g.spawn.y;
            g.dir = 'stay';
            g.inPen = true;
            g.releaseAt = tick + 20;
            g.immuneEpoch = epoch;
            events.push({ type: 'eaten', id: g.id, by: r.id, points });
          } else {
            r.lives--;
            g.score += 200;
            g.catches++;
            events.push({ type: 'catch', id: r.id, by: g.id });
            r.dir = 'stay';

            if (!r.lives) {
              r.alive = false;
              events.push({ type: 'out', id: r.id });
            } else {
              r.respawnAt = tick + 10;
            }
            break;
          }
        }
      });

      finish();
      return events;
    }

    return {
      get tick() {
        return tick;
      },
      width,
      height,
      grid: () => grid.map(row => row.join('')),
      agents: () => agents.map(copy),
      botState(id) {
        const a = agents.find(item => item.id === id);
        if (!a) throw new RangeError('Unknown agent ID.');
        const powerPellets = [];

        grid.forEach((row, y) => row.forEach((c, x) => {
          if (c === 'o') powerPellets.push({ x, y });
        }));

        return {
          tick,
          maxTicks,
          width,
          height,
          grid: grid.map(row => row.join('')),
          you: copy(a),
          runners: agents.filter(item => item.role === 'runner').map(copy),
          ghosts: agents.filter(item => item.role === 'ghost').map(copy),
          pellets,
          powerPellets,
          frightTicksLeft: Math.max(0, frightUntil - tick),
          tunnelRow
        };
      },
      step,
      finished: () => outcome !== null,
      result: () => outcome
        ? { ...outcome, scores: outcome.scores.map(s => ({ ...s })) }
        : null
    };
  }

  return { create, generateMaze, LAYOUTS, rng, DIRS };
});
