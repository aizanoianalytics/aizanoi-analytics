import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const text = fs.readFileSync(
  new URL('../frontend/arcade/maze-chase/engine.js', import.meta.url), 'utf8'
);
const module = { exports: {} };
new vm.Script(`(function(module, exports) {\n${text}\n})`, {
  filename: 'maze-chase/engine.js'
}).runInThisContext()(module, module.exports);
const Engine = module.exports;
const dirs = ['up', 'down', 'left', 'right'];
const get = (game, id) => game.agents().find(a => a.id === id);
const baseSeats = [
  { id: 'r', role: 'runner', name: 'Runner' },
  { id: 'g0', role: 'ghost' }
];

function fixture({ seats = baseSeats, power = false, finalPellet = false } = {}) {
  const grid = Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) =>
      x > 0 && x < 8 && y > 0 && y < 8 ? ' ' : '#'));
  for (let y = 3; y <= 5; y++) {
    for (let x = 3; x <= 5; x++) grid[y][x] = 'G';
  }
  grid[2][4] = '-';
  grid[4][0] = grid[4][8] = ' ';
  if (finalPellet) grid[6][4] = '.';
  else grid[1][1] = '.';
  if (power) grid[7][3] = 'o';
  const saved = Engine.LAYOUTS.aizanoi;
  try {
    Engine.LAYOUTS.aizanoi = grid.map(row => row.join(''));
    return Engine.create(seats, { layout: 'aizanoi', maxTicks: 500 });
  } finally {
    Engine.LAYOUTS.aizanoi = saved;
  }
}

function idle(game, n) {
  const events = [];
  for (let i = 0; i < n; i++) {
    events.push(...game.step(Object.fromEntries(game.agents().map(a => [a.id, 'stay']))));
  }
  return events;
}

function route(game, id, tx, ty) {
  const a = get(game, id);
  const grid = game.grid();
  const queue = [{ x: a.x, y: a.y, first: 'stay' }];
  const seen = new Set([`${a.x},${a.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === tx && p.y === ty) return p.first;
    for (const dir of dirs) {
      let x = p.x + Engine.DIRS[dir][0];
      const y = p.y + Engine.DIRS[dir][1];
      if (p.y === Math.floor(game.height / 2)) x = (x + game.width) % game.width;
      const cell = grid[y]?.[x];
      const from = grid[p.y][p.x];
      if (!cell || cell === '#') continue;
      if (a.role === 'runner' && (cell === 'G' || cell === '-')) continue;
      if (a.role === 'ghost' &&
          ((from === 'G' && cell !== 'G' && cell !== '-') ||
           (cell === 'G' && from !== 'G' && from !== '-'))) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y, first: p.first === 'stay' ? dir : p.first });
    }
  }
  throw new Error(`No route for ${id} to ${tx},${ty}`);
}

function moveTo(game, id, x, y) {
  for (let i = 0; i < 150; i++) {
    const a = get(game, id);
    if (a.x === x && a.y === y) return;
    assert.equal(game.finished(), false, 'Fixture must remain active while routing');
    const moves = Object.fromEntries(game.agents().map(a => [a.id, 'stay']));
    moves[id] = route(game, id, x, y);
    game.step(moves);
  }
  assert.fail('Route exceeded bound');
}

function inspectRunnerGraph(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const tunnel = Math.floor(h / 2);
  const floor = (x, y) => '.o '.includes(grid[y]?.[x] ?? '!');
  const adjacent = (x, y) => dirs.map(dir => {
    let nx = x + Engine.DIRS[dir][0];
    const ny = y + Engine.DIRS[dir][1];
    if (y === tunnel) nx = (nx + w) % w;
    return [nx, ny];
  }).filter(([x, y]) => floor(x, y));
  const cells = [];
  grid.forEach((row, y) => {
    assert.equal(row.length, w);
    assert.equal(row, Array.from(row).reverse().join(''), `Symmetry, row ${y}`);
    Array.from(row).forEach((cell, x) => {
      if (!floor(x, y)) return;
      cells.push([x, y]);
      assert.ok(adjacent(x, y).length >= 2, `Runner dead end at ${x},${y}`);
    });
  });
  const queue = [cells[0]];
  const seen = new Set([cells[0].join(',')]);
  for (let i = 0; i < queue.length; i++) {
    adjacent(...queue[i]).forEach(p => {
      const key = p.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(p);
      }
    });
  }
  assert.equal(seen.size, cells.length, 'Every pickup/floor reachable without entering pen');
}

test('runner graph has no dead ends or unreachable pickups across center parities', () => {
  inspectRunnerGraph(Engine.LAYOUTS.aizanoi);
  for (const [w, h] of [[19, 19], [25, 25], [27, 27], [25, 31], [29, 25], [61, 61]]) {
    for (const seed of [0, 1, 7, 42]) {
      const grid = Engine.generateMaze(seed, w, h);
      inspectRunnerGraph(grid);
      assert.deepEqual(grid, Engine.generateMaze(seed, w, h));
    }
  }
});

test('direction vectors cannot be changed by same-realm consumers', () => {
  for (const vector of Object.values(Engine.DIRS)) assert.equal(Object.isFrozen(vector), true);
  assert.throws(() => { Engine.DIRS.up[1] = 100; }, TypeError);
  assert.deepEqual(Engine.DIRS.up, [0, -1]);
});

test('null and malformed seats are rejected intentionally', () => {
  assert.throws(() => Engine.create([null, ...baseSeats]), TypeError);
  assert.throws(() => Engine.create([...baseSeats, { id: 'x', role: 'other' }]), TypeError);
});

test('public timers, counters and spawn data are complete and detached', () => {
  const game = fixture({
    seats: [...baseSeats, { id: 'g1', role: 'ghost' }]
  });
  const state = game.botState('g1');
  assert.equal(state.you.releaseIn, 8);
  assert.equal(state.you.eaten, 0);
  assert.equal(state.you.invulnerableTicksLeft, 0);
  assert.equal(state.you.frightImmune, false);
  assert.equal(state.frightDuration, 60);
  assert.equal(state.ghostChain, 0);
  assert.equal(state.nextGhostPoints, 200);
  state.you.spawn.x = -100;
  state.ghosts[1].spawn.y = -100;
  assert.notEqual(game.botState('g1').you.spawn.x, -100);
  assert.notEqual(game.botState('g1').ghosts[1].spawn.y, -100);
  idle(game, 7);
  assert.equal(game.botState('g1').you.releaseIn, 1);
});

test('a protected runner still eats a frightened ghost', () => {
  const game = fixture({ power: true });
  moveTo(game, 'g0', 4, 6);
  assert.ok(game.step({ r: 'stay', g0: 'down' }).some(e => e.type === 'catch'));
  idle(game, 10);
  assert.equal(get(game, 'r').invulnerableTicksLeft, 10);
  assert.ok(game.step({ r: 'left', g0: 'stay' }).some(e => e.type === 'power'));
  const events = game.step({ r: 'right', g0: 'stay' });
  assert.ok(events.some(e => e.type === 'eaten' && e.points === 200));
  assert.equal(get(game, 'r').lives, 2);
  assert.equal(get(game, 'r').ghostsEaten, 1);
  assert.equal(get(game, 'g0').eaten, 1);
  assert.equal(get(game, 'g0').releaseIn, 20);
  assert.equal(get(game, 'g0').frightImmune, true);
  assert.equal(game.botState('r').ghostChain, 1);
  assert.equal(game.botState('r').nextGhostPoints, 400);
});

test('last pickup wins even on final-life elimination in the same tick', () => {
  const game = fixture({ finalPellet: true });
  moveTo(game, 'g0', 4, 6);
  game.step({ r: 'stay', g0: 'down' });
  assert.equal(get(game, 'r').lives, 2);
  idle(game, 20);
  assert.equal(get(game, 'r').lives, 1);
  idle(game, 19);
  assert.equal(get(game, 'r').invulnerableTicksLeft, 1);
  const events = game.step({ r: 'up', g0: 'up' });
  assert.ok(events.some(e => e.type === 'pellet'));
  assert.ok(events.some(e => e.type === 'out'));
  assert.equal(game.result().winner, 'runners');
  assert.equal(game.result().reason, 'pellets');
  assert.equal(game.result().pelletsLeft, 0);
});

test('contested pickup uses ID priority, not seat-array traversal', () => {
  const rA = { id: 'a', role: 'runner' };
  const rZ = { id: 'z', role: 'runner' };
  for (const runnerSeats of [[rZ, rA], [rA, rZ]]) {
    const game = fixture({ seats: [...runnerSeats, { id: 'g0', role: 'ghost' }] });
    // Move both runners to the same pickup; retain a separate reserve.
    const saved = Engine.LAYOUTS.aizanoi;
    const rows = game.grid().map(row => row.split(''));
    rows[7][4] = '.';
    let contested;
    try {
      Engine.LAYOUTS.aizanoi = rows.map(row => row.join(''));
      contested = Engine.create([...runnerSeats, { id: 'g0', role: 'ghost' }], {
        layout: 'aizanoi'
      });
    } finally {
      Engine.LAYOUTS.aizanoi = saved;
    }
    const moves = Object.fromEntries(contested.agents().map(a => [
      a.id, a.role === 'ghost' ? 'stay' : a.x < 4 ? 'right' : 'left'
    ]));
    const events = contested.step(moves);
    assert.equal(events.find(e => e.type === 'pellet').id, 'a');
    assert.equal(get(contested, 'a').score, 10);
    assert.equal(get(contested, 'z').score, 0);
    assert.equal(contested.botState('a').pellets, 1);
  }
});

test('multiple dangerous ghosts cost only one life and receive one catch credit', () => {
  const game = fixture({
    seats: [...baseSeats, { id: 'g1', role: 'ghost' }]
  });
  moveTo(game, 'g0', 4, 6);
  moveTo(game, 'g1', 4, 6);
  const nextTick = game.tick + 1;
  const expected = (nextTick - 1) % 2 === 0 ? 'g0' : 'g1';
  const events = game.step({ r: 'stay', g0: 'down', g1: 'down' });
  assert.equal(events.filter(e => e.type === 'catch').length, 1);
  assert.equal(events.find(e => e.type === 'catch').by, expected);
  assert.equal(get(game, 'r').lives, 2);
  assert.equal(game.agents().reduce((n, a) => n + a.catches, 0), 1);
});
