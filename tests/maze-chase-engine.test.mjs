import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const src = file => fs.readFileSync(
  new URL('../frontend/arcade/maze-chase/' + file, import.meta.url),
  'utf8'
);
const loadUmd = (file, MazeEngine) => {
  const m = { exports: {} };
  new vm.Script(
    `(function (module, exports, MazeEngine) {\n${src(file)}\n})`,
    { filename: file }
  ).runInThisContext()(m, m.exports, MazeEngine);
  return m.exports;
};

const Engine = loadUmd('engine.js');
const bots = Object.fromEntries(
  ['wanderer', 'hunter', 'tactician'].map(name => [
    name,
    loadUmd('bots/sample-' + name + '.js', Engine)
  ])
);
const seats = [
  { id: 'r', role: 'runner', name: 'Runner' },
  { id: 'g', role: 'ghost', name: 'Ghost' }
];
const directions = ['up', 'down', 'left', 'right'];
const agent = (game, id) => game.agents().find(a => a.id === id);

function inspect(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const row = Math.floor(h / 2);
  const open = [];
  let powers = 0;
  let pen = 0;
  let doors = 0;

  const adjacent = (x, y) => directions.map(d => {
    let nx = x + Engine.DIRS[d][0];
    const ny = y + Engine.DIRS[d][1];
    if (y === row) nx = (nx + w) % w;
    return [nx, ny];
  }).filter(([x, y]) => {
    return x >= 0 && x < w && y >= 0 && y < h && grid[y][x] !== '#';
  });

  grid.forEach((line, y) => {
    assert.equal(line.length, w);
    assert.equal(line, Array.from(line).reverse().join(''));

    Array.from(line).forEach((c, x) => {
      assert.ok('#.o G-'.includes(c));
      if (c === 'o') powers++;
      if (c === 'G') pen++;
      if (c === '-') doors++;

      if (c !== '#') {
        open.push([x, y]);
        assert.ok(adjacent(x, y).length >= 2, `Dead end at ${x},${y}`);
      }
    });
  });

  assert.equal(powers, 4);
  assert.equal(pen, 15);
  assert.equal(doors, 1);

  const cx = (w - 1) / 2;
  assert.equal(grid[row - 2][cx], '-');
  for (let y = row - 1; y <= row + 1; y++) {
    assert.equal(grid[y].slice(cx - 2, cx + 3), 'GGGGG');
  }
  assert.notEqual(grid[row][0], '#');
  assert.notEqual(grid[row][w - 1], '#');

  const queue = [open[0]];
  const seen = new Set([open[0].join(',')]);
  for (let i = 0; i < queue.length; i++) {
    adjacent(...queue[i]).forEach(p => {
      const key = p.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(p);
      }
    });
  }
  assert.equal(seen.size, open.length);
}

function fixture({
  power = true,
  reserve = true,
  count = 1,
  maxTicks = 300,
  frightTicks = 60
} = {}) {
  const grid = Array.from({ length: 9 }, (_, y) => {
    return Array.from({ length: 9 }, (_, x) => {
      return x && y && x < 8 && y < 8 ? ' ' : '#';
    });
  });

  for (let y = 3; y <= 5; y++) {
    for (let x = 3; x <= 5; x++) grid[y][x] = 'G';
  }
  grid[2][4] = '-';
  grid[4][0] = grid[4][8] = ' ';
  grid[7][4] = '.';
  if (reserve) grid[1][1] = '.';
  if (power) grid[7][3] = 'o';

  const saved = Engine.LAYOUTS.aizanoi;
  Engine.LAYOUTS.aizanoi = grid.map(row => row.join(''));

  try {
    const fixtureSeats = [
      seats[0],
      ...Array.from({ length: count }, (_, i) => ({
        id: 'g' + i,
        role: 'ghost'
      }))
    ];
    return Engine.create(fixtureSeats, {
      layout: 'aizanoi',
      maxTicks,
      frightTicks
    });
  } finally {
    Engine.LAYOUTS.aizanoi = saved;
  }
}

function route(game, id, tx, ty) {
  const a = agent(game, id);
  const grid = game.grid();
  const queue = [{ x: a.x, y: a.y, first: 'stay' }];
  const seen = new Set([a.x + ',' + a.y]);

  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === tx && p.y === ty) return p.first;

    for (const dir of directions) {
      let x = p.x + Engine.DIRS[dir][0];
      const y = p.y + Engine.DIRS[dir][1];
      if (p.y === Math.floor(game.height / 2)) {
        x = (x + game.width) % game.width;
      }

      const cell = grid[y] && grid[y][x];
      const from = grid[p.y][p.x];
      if (!cell || cell === '#') continue;
      if (a.role === 'runner' && (cell === '-' || cell === 'G')) continue;

      if (a.role === 'ghost'
        && ((from === 'G' && cell !== 'G' && cell !== '-')
          || (cell === 'G' && from !== 'G' && from !== '-'))) {
        continue;
      }

      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        x,
        y,
        first: p.first === 'stay' ? dir : p.first
      });
    }
  }

  throw new Error('No route.');
}

function moveTo(game, id, x, y) {
  for (let i = 0; i < 120; i++) {
    const a = agent(game, id);
    if (a.x === x && a.y === y) return;
    const moves = Object.fromEntries(
      game.agents().map(a => [a.id, 'stay'])
    );
    moves[id] = route(game, id, x, y);
    game.step(moves);
  }
  assert.fail('Route did not complete.');
}

function idle(game, n) {
  const events = [];
  for (let i = 0; i < n; i++) {
    events.push(...game.step(Object.fromEntries(
      game.agents().map(a => [a.id, 'stay'])
    )));
  }
  return events;
}

function play(seed, runner, ghost, count = 2, maxTicks = 600) {
  const matchSeats = [
    seats[0],
    ...Array.from({ length: count }, (_, i) => ({
      id: 'g' + i,
      role: 'ghost'
    }))
  ];
  const game = Engine.create(matchSeats, { seed, maxTicks });
  const saved = Math.random;
  Math.random = Engine.rng(seed);

  try {
    while (!game.finished()) {
      const moves = Object.fromEntries(game.agents().map(a => [
        a.id,
        (a.role === 'runner' ? runner : ghost)(game.botState(a.id))
      ]));
      game.step(moves);
    }
  } finally {
    Math.random = saved;
  }
  return game.result();
}

test('generated mazes satisfy topology, symmetry, pen, powers and seed invariants', () => {
  const variants = new Set();

  for (let seed = 0; seed < 50; seed++) {
    const grid = Engine.generateMaze(seed);
    assert.equal(grid.length, 27);
    assert.equal(grid[0].length, 27);
    inspect(grid);
    assert.deepEqual(grid, Engine.generateMaze(seed));
    variants.add(grid.join('\n'));
  }

  assert.equal(variants.size, 50);
  for (const [w, h] of [[19, 19], [25, 31], [29, 25], [31, 29]]) {
    inspect(Engine.generateMaze(7, w, h));
  }
  inspect(Engine.LAYOUTS.aizanoi);
});

test('pellets, powers, timer reset, expiry and frightened half speed', () => {
  const game = fixture({ frightTicks: 12 });

  let events = game.step({ r: 'left', g0: 'right' });
  assert.ok(events.some(e => e.type === 'power'));
  assert.equal(agent(game, 'r').score, 50);
  assert.equal(game.botState('r').frightTicksLeft, 12);
  assert.equal(agent(game, 'g0').frightened, true);

  game.step({ r: 'right', g0: 'up' });
  assert.equal(agent(game, 'r').score, 60);

  const before = agent(game, 'g0');
  game.step({ r: 'stay', g0: 'up' });
  assert.equal(agent(game, 'g0').y, before.y);

  game.step({ r: 'stay', g0: 'up' });
  assert.equal(agent(game, 'g0').y, before.y - 1);

  events = idle(game, 9);
  assert.equal(game.botState('r').frightTicksLeft, 0);
  assert.equal(agent(game, 'g0').frightened, false);
  assert.equal(events.filter(e => e.type === 'fright-end').length, 1);
  assert.equal(idle(game, 2).filter(e => e.type === 'fright-end').length, 0);
});

test('power re-eating resets the global timer', () => {
  const saved = Engine.LAYOUTS.aizanoi;
  const rows = saved.map(row => row.replaceAll('.', ' '));
  Engine.LAYOUTS.aizanoi = rows;

  let game;
  try {
    game = Engine.create(seats, { layout: 'aizanoi' });
  } finally {
    Engine.LAYOUTS.aizanoi = saved;
  }

  moveTo(game, 'r', 1, 25);
  assert.equal(game.botState('r').frightTicksLeft, 60);
  moveTo(game, 'r', 25, 25);
  assert.equal(game.botState('r').frightTicksLeft, 60);
});

test('ghost chain awards 200/400 and eaten ghosts wait 20 ticks, immune to this fright', () => {
  const game = fixture({ count: 2 });
  moveTo(game, 'g0', 4, 6);
  moveTo(game, 'g1', 4, 6);

  game.step({ r: 'left', g0: 'stay', g1: 'stay' });
  game.step({ r: 'right', g0: 'stay', g1: 'stay' });

  let events = game.step({ r: 'stay', g0: 'down', g1: 'down' });
  if (!events.some(e => e.type === 'eaten')) {
    events = game.step({ r: 'stay', g0: 'down', g1: 'down' });
  }

  assert.deepEqual(
    events.filter(e => e.type === 'eaten').map(e => e.points),
    [200, 400]
  );
  assert.equal(agent(game, 'r').score, 660);
  assert.equal(agent(game, 'r').ghostsEaten, 2);

  const eatenAt = game.tick;
  moveTo(game, 'g0', 4, 3);
  for (; game.tick < eatenAt + 19;) {
    game.step({ r: 'stay', g0: 'up', g1: 'stay' });
  }

  assert.equal(agent(game, 'g0').y, 3);
  assert.equal(agent(game, 'g0').frightened, false);

  game.step({ r: 'stay', g0: 'up', g1: 'stay' });
  assert.equal(agent(game, 'g0').y, 2);
});

test('catch, ten-tick respawn, ten-tick protection, elimination and ghost scoring', () => {
  const game = fixture({ power: false });
  moveTo(game, 'g0', 4, 6);

  const events = game.step({ r: 'stay', g0: 'down' });
  assert.ok(events.some(e => e.type === 'catch'));
  assert.equal(agent(game, 'r').lives, 2);
  assert.equal(agent(game, 'r').respawnIn, 10);
  assert.equal(agent(game, 'g0').score, 200);

  assert.ok(!idle(game, 9).some(e => e.type === 'respawn'));
  assert.equal(agent(game, 'r').respawnIn, 1);
  assert.ok(idle(game, 1).some(e => e.type === 'respawn'));
  assert.equal(agent(game, 'r').invulnerable, true);

  idle(game, 9);
  assert.equal(agent(game, 'r').lives, 2);
  idle(game, 1);
  assert.equal(agent(game, 'r').lives, 1);
  idle(game, 20);

  assert.equal(agent(game, 'r').alive, false);
  assert.equal(agent(game, 'g0').catches, 3);
  assert.equal(game.result().winner, 'ghosts');
  assert.equal(game.result().reason, 'caught');
});

test('head-on swaps count as contact', () => {
  const game = fixture({ power: false });
  moveTo(game, 'g0', 4, 6);
  const events = game.step({ r: 'up', g0: 'down' });
  assert.ok(events.some(e => e.type === 'catch'));
});

test('door excludes runners; tunnel wraps in both directions; invalid moves preserve heading', () => {
  const game = fixture();

  moveTo(game, 'r', 4, 1);
  game.step({ r: 'down', g0: 'stay' });
  assert.equal(agent(game, 'r').y, 1);

  moveTo(game, 'r', 0, 4);
  game.step({ r: 'left', g0: 'stay' });
  assert.equal(agent(game, 'r').x, 8);
  game.step({ r: 'right', g0: 'stay' });
  assert.equal(agent(game, 'r').x, 0);

  for (const invalid of [null, 'bogus', 'toString', '__proto__', {}, undefined]) {
    const x = agent(game, 'r').x;
    game.step({ r: invalid, g0: 'stay' });
    assert.equal(agent(game, 'r').x, (x + 1) % 9);

    if (agent(game, 'r').x === 2) {
      game.step({ r: 'left', g0: 'stay' });
      game.step({ r: 'left', g0: 'stay' });
      game.step({ r: 'left', g0: 'stay' });
      game.step({ r: 'right', g0: 'stay' });
    }
  }
});

test('ghosts release eight ticks apart', () => {
  const game = fixture({ count: 2 });

  game.step({ r: 'stay', g0: 'right', g1: 'up' });
  assert.equal(agent(game, 'g1').y, 3);

  game.step({ r: 'stay', g0: 'up', g1: 'up' });
  assert.equal(agent(game, 'g0').y, 2);

  while (game.tick < 7) {
    game.step({ r: 'stay', g0: 'stay', g1: 'up' });
  }
  assert.equal(agent(game, 'g1').y, 3);

  game.step({ r: 'stay', g0: 'stay', g1: 'up' });
  assert.equal(agent(game, 'g1').y, 2);
});

test('pellet and clock end conditions, terminal stability and detached state', () => {
  const clear = fixture({ power: false, reserve: false });
  clear.step({ r: 'stay', g0: 'stay' });

  assert.equal(clear.result().reason, 'pellets');
  assert.equal(clear.result().winner, 'runners');
  assert.equal(clear.result().pelletsLeft, 0);

  const result = clear.result();
  assert.deepEqual(clear.step({ r: 'up' }), []);
  assert.deepEqual(clear.result(), result);
  result.scores[0].score = -1;
  assert.notEqual(clear.result().scores[0].score, -1);

  const clock = fixture({ maxTicks: 3 });
  const state = clock.botState('r');
  state.grid[0] = 'broken';
  state.you.x = -1;
  state.runners[0].lives = -1;
  state.ghosts[0].score = -1;
  state.powerPellets[0].x = -1;

  const fresh = clock.botState('r');
  assert.notEqual(fresh.grid[0], 'broken');
  assert.notEqual(fresh.you.x, -1);
  assert.equal(fresh.runners[0].lives, 3);
  assert.equal(fresh.ghosts[0].score, 0);
  assert.notEqual(fresh.powerPellets[0].x, -1);

  idle(clock, 3);
  assert.equal(clock.result().reason, 'time');
  assert.equal(clock.result().winner, 'ghosts');
  assert.equal(clock.result().tick, 3);
});

test('sample bots return directions in thirty states for each role', () => {
  const game = Engine.create(seats, { seed: 13 });

  for (let i = 0; i < 30; i++) {
    for (const bot of Object.values(bots)) {
      for (const id of ['r', 'g']) {
        const state = game.botState(id);
        const saved = JSON.stringify(state);
        assert.ok(Object.hasOwn(Engine.DIRS, bot(state)));
        assert.equal(JSON.stringify(state), saved);
      }
    }

    game.step({
      r: bots.wanderer(game.botState('r')),
      g: bots.hunter(game.botState('g'))
    });
  }
});

test('full tactician match terminates; same seed and bot moves reproduce the result', () => {
  const first = play(42, bots.tactician, bots.wanderer);
  assert.ok(first);
  assert.ok(first.tick <= 600);
  assert.equal(first.scores.length, 3);
  assert.deepEqual(first, play(42, bots.tactician, bots.wanderer));
});

test('hunter ghosts beat a wandering runner in most of five seeds', () => {
  const results = [1, 2, 3, 4, 5].map(seed => {
    return play(seed, bots.wanderer, bots.hunter, 2, 1500);
  });
  assert.ok(results.filter(r => r.winner === 'ghosts').length >= 3);
});
