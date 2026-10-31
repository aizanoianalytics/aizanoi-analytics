(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MazeEngine = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DIRS = Object.freeze({
    up: Object.freeze([0, -1]),
    down: Object.freeze([0, 1]),
    left: Object.freeze([-1, 0]),
    right: Object.freeze([1, 0]),
    stay: Object.freeze([0, 0])
  });
  const cardinal = ['up', 'down', 'left', 'right'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Trusted applications may replace a layout before create(); games copy it.
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
      // Keep the exterior corridor above the pen continuous and mirrored.
      '#.#.#.#.#.........#.#.#.#.#',
      '#.#..........-..........#.#',
      '#.#.#.#.#.#GGGGG#.#.#.#.#.#',
      '..........#GGGGG#..........',
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

  function isFloor(cell) {
    return cell === '.' || cell === 'o' || cell === ' ';
  }

  function sound(grid, row, runnerOnly = false) {
    const h = grid.length;
    const w = grid[0].length;
    const passable = (x, y) => runnerOnly
      ? isFloor(grid[y][x]) : grid[y][x] !== '#';
    const cells = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!passable(x, y)) continue;
        if (neighbours(x, y, w, h, row)
          .filter(([a, b]) => passable(a, b)).length < 2) return false;
        cells.push([x, y]);
      }
    }
    if (!cells.length) return false;
    const queue = [cells[0]];
    const seen = new Set([cells[0][1] * w + cells[0][0]]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      neighbours(x, y, w, h, row).forEach(([a, b]) => {
        const key = b * w + a;
        if (passable(a, b) && !seen.has(key)) {
          seen.add(key);
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
    const grid = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) =>
        x > 0 && y > 0 && x < w - 1 && y < h - 1 && (x % 2 || y % 2)
          ? '.' : '#'));

    // On an even middle row, retain vertical spokes instead of making a band.
    if (cy % 2 === 0) {
      for (const y of [cy - 1, cy + 1]) {
        for (let x = 2; x < w - 2; x += 2) grid[y][x] = '#';
      }
    }
    for (let x = 0; x < w; x++) grid[cy][x] = '.';

    // A one-cell exterior circuit bypasses the pen. Its interior is protected.
    const left = cx - 4;
    const right = cx + 4;
    const top = cy - 3;
    const bottom = cy + 3;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        grid[y][x] = x === left || x === right || y === top || y === bottom
          ? '.' : '#';
      }
    }
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) grid[y][x] = 'G';
    }
    grid[cy - 2][cx] = '-';

    const protectedCell = (x, y) =>
      x > left && x < right && y > top && y < bottom;

    // Pen insertion can truncate lattice branches. Join those branches back
    // into the circuit, mirrored, before any seeded corridor removal.
    // Every pass opens a previously closed pair; the loop is bounded by area.
    for (let pass = 0; pass < w * h; pass++) {
      let changed = false;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!isFloor(grid[y][x])) continue;
          const degree = neighbours(x, y, w, h, cy)
            .filter(([a, b]) => isFloor(grid[b][a])).length;
          if (degree >= 2) continue;
          const candidates = neighbours(x, y, w, h, cy)
            .filter(([a, b]) => a > 0 && a < w - 1 && b > 0 && b < h - 1
              && grid[b][a] === '#' && !protectedCell(a, b));
          candidates.sort((a, b) => {
            const count = ([px, py]) => neighbours(px, py, w, h, cy)
              .filter(([nx, ny]) => isFloor(grid[ny][nx])).length;
            return count(b) - count(a) || a[1] - b[1] || a[0] - b[0];
          });
          if (!candidates.length) {
            throw new Error('Unable to repair maze corridor.');
          }
          const [a, b] = candidates[0];
          grid[b][a] = grid[b][w - 1 - a] = '.';
          changed = true;
        }
      }
      if (!changed) break;
    }

    if (!sound(grid, cy) || !sound(grid, cy, true)) {
      throw new Error('Generated maze topology is invalid.');
    }

    const candidates = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < cx; x++) {
        if ((x + y) % 2 === 1 && Math.abs(y - cy) > 4
          && grid[y][x] === '.') candidates.push([x, y]);
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
      if (!sound(grid, cy) || !sound(grid, cy, true)) {
        grid[y][x] = grid[y][mirror] = '.';
      }
    });

    [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].forEach(([x, y]) => {
      grid[y][x] = 'o';
    });
    return grid.map(row => row.join(''));
  }

  function create(seats, options = {}) {
    if (!Array.isArray(seats)) throw new TypeError('Seats must be an array.');
    const ids = new Set();
    seats.forEach(s => {
      if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id)
        || !['runner', 'ghost'].includes(s.role)) {
        throw new TypeError('Seats require unique string IDs and valid roles.');
      }
      ids.add(s.id);
    });
    const runners = seats.filter(s => s.role === 'runner');
    const ghosts = seats.filter(s => s.role === 'ghost');
    if (runners.length < 1 || runners.length > 4 || ghosts.length < 1 || ghosts.length > 6) {
      throw new RangeError('Use 1–4 runners and 1–6 ghosts.');
    }
    const layout = options.layout === undefined ? 'generated' : options.layout;
    if (!['generated', 'aizanoi'].includes(layout)) throw new RangeError('Unknown layout.');
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
      if (isFloor(c)) floor.push({ x, y });
    }));
    if (!pen.length || floor.length < runners.length) {
      throw new Error('Layout has no usable spawns.');
    }
    const bottom = floor.sort((a, b) => b.y - a.y || a.x - b.x);
    const spawnRow = bottom.filter(p => p.y === bottom[0].y);
    if (spawnRow.length < runners.length) throw new Error('Layout has too few runner spawns.');
    let ri = 0;
    let gi = 0;
    const agents = seats.map(s => {
      const index = s.role === 'runner' ? ri++ : gi++;
      const spawn = s.role === 'runner'
        ? spawnRow[Math.floor((index + 1) * spawnRow.length / (runners.length + 1))]
        : pen[index % pen.length];
      return {
        id: s.id, role: s.role, name: String(s.name || s.id),
        x: spawn.x, y: spawn.y, dir: 'stay', alive: true,
        lives: s.role === 'runner' ? 3 : 0,
        score: 0, catches: 0, ghostsEaten: 0, eaten: 0,
        spawn: { ...spawn }, inPen: s.role === 'ghost',
        releaseAt: index * 8, respawnAt: 0,
        invulnerableUntil: 0, immuneEpoch: -1
      };
    });
    const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    function priority(list) {
      const ordered = list.slice().sort(compareId);
      if (!ordered.length) return ordered;
      const offset = (tick - 1) % ordered.length;
      return ordered.slice(offset).concat(ordered.slice(0, offset));
    }
    const frightened = a =>
      a.role === 'ghost' && tick < frightUntil && a.immuneEpoch !== epoch;

    function copy(a) {
      return {
        id: a.id, role: a.role, name: a.name, x: a.x, y: a.y,
        dir: a.dir, alive: a.alive, lives: a.lives, score: a.score,
        catches: a.catches, ghostsEaten: a.ghostsEaten, eaten: a.eaten,
        frightened: frightened(a), inPen: a.inPen,
        respawnIn: Math.max(0, a.respawnAt - tick),
        invulnerable: tick < a.invulnerableUntil,
        invulnerableTicksLeft: Math.max(0, a.invulnerableUntil - tick),
        releaseIn: a.role === 'ghost' && a.inPen
          ? Math.max(0, a.releaseAt - tick) : 0,
        frightImmune: a.role === 'ghost' && tick < frightUntil && a.immuneEpoch === epoch,
        spawn: { ...a.spawn }
      };
    }

    function destination(a, dir) {
      if (!own(DIRS, dir)) return null;
      const delta = DIRS[dir];
      let x = a.x + delta[0];
      const y = a.y + delta[1];
      if (a.y === tunnelRow) x = (x + width) % width;
      if (x < 0 || x >= width || y < 0 || y >= height || grid[y][x] === '#') return null;
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
      const reason = pellets === 0 ? 'pellets'
        : !agents.some(a => a.role === 'runner' && a.alive) ? 'caught'
          : tick >= maxTicks ? 'time' : null;
      if (!reason) return;
      outcome = {
        winner: reason === 'pellets' ? 'runners' : 'ghosts',
        reason, tick, pelletsLeft: pellets,
        scores: agents.map(a => ({
          id: a.id, role: a.role, score: a.score, catches: a.catches,
          eaten: a.eaten, lives: a.lives, ghostsEaten: a.ghostsEaten
        }))
      };
    }

    function step(moves = {}) {
      if (outcome) return [];
      tick++;
      const events = [];
      if (frightUntil && tick === frightUntil) events.push({ type: 'fright-end' });
      const previous = new Map();
      const active = new Set();

      agents.forEach(a => {
        if (!a.alive) return;
        let resumed = false;
        if (a.respawnAt) {
          if (tick < a.respawnAt) return;
          a.respawnAt = 0;
          a.x = a.spawn.x;
          a.y = a.spawn.y;
          a.dir = 'stay';
          a.invulnerableUntil = tick + 10;
          resumed = true;
          events.push({ type: 'respawn', id: a.id });
        }
        active.add(a.id);
        previous.set(a.id, { x: a.x, y: a.y });
        if (resumed || (frightened(a) && tick % 2 === 1)) return;
        const requested = moves && own(moves, a.id) ? moves[a.id] : null;
        const dir = typeof requested === 'string' && own(DIRS, requested)
          ? requested : a.dir;
        const target = destination(a, dir);
        if (target) {
          a.x = target.x;
          a.y = target.y;
          a.dir = dir;
        }
        if (a.role === 'ghost') {
          a.inPen = grid[a.y][a.x] === 'G' || grid[a.y][a.x] === '-';
        }
      });

      const orderedRunners = priority(agents.filter(a => a.role === 'runner'));
      const orderedGhosts = priority(agents.filter(a => a.role === 'ghost'));
      orderedRunners.filter(a => active.has(a.id)).forEach(a => {
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
          id: a.id, x: a.x, y: a.y
        });
      });

      // Snapshot contacts before any ghost is returned to its pen.
      const contacts = new Map();
      orderedRunners.filter(r => active.has(r.id)).forEach(r => {
        const rp = previous.get(r.id);
        contacts.set(r.id, orderedGhosts.filter(g => {
          if (!active.has(g.id) || g.inPen) return false;
          const gp = previous.get(g.id);
          return (r.x === g.x && r.y === g.y)
            || (r.x === gp.x && r.y === gp.y && g.x === rp.x && g.y === rp.y);
        }));
      });
      const caught = new Set();
      orderedRunners.forEach(r => {
        if (tick < r.invulnerableUntil) return;
        const g = (contacts.get(r.id) || []).find(g => !frightened(g));
        if (!g) return;
        caught.add(r.id);
        r.lives--;
        g.score += 200;
        g.catches++;
        r.dir = 'stay';
        events.push({ type: 'catch', id: r.id, by: g.id });
        if (!r.lives) {
          r.alive = false;
          events.push({ type: 'out', id: r.id });
        } else {
          r.respawnAt = tick + 10;
        }
      });
      orderedGhosts.forEach(g => {
        if (!frightened(g) || g.inPen) return;
        const r = orderedRunners.find(r => !caught.has(r.id)
          && (contacts.get(r.id) || []).includes(g));
        if (!r) return;
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
      });

      finish();
      return events;
    }

    return {
      get tick() { return tick; },
      width, height,
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
          tick, maxTicks, width, height,
          grid: grid.map(row => row.join('')),
          you: copy(a),
          runners: agents.filter(item => item.role === 'runner').map(copy),
          ghosts: agents.filter(item => item.role === 'ghost').map(copy),
          pellets, powerPellets,
          frightTicksLeft: Math.max(0, frightUntil - tick),
          frightDuration,
          ghostChain: chain,
          nextGhostPoints: 200 * (2 ** Math.min(chain, 3)),
          tunnelRow
        };
      },
      step,
      finished: () => outcome !== null,
      result: () => outcome
        ? { ...outcome, scores: outcome.scores.map(s => ({ ...s })) } : null
    };
  }

  return { create, generateMaze, LAYOUTS, rng, DIRS };
});
