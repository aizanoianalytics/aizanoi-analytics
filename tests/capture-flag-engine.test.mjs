import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const src = file => fs.readFileSync(new URL('../frontend/arcade/capture-flag/' + file, import.meta.url), 'utf8');
const loadUmd = (file, FlagEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, FlagEngine) {\n${src(file)}\n})`, { filename: file })
    .runInThisContext()(m, m.exports, FlagEngine);
  return m.exports;
};
const Engine = loadUmd('engine.js');
const bots = Object.fromEntries(['rusher', 'guard', 'squad'].map(name =>
  [name, loadUmd('bots/sample-' + name + '.js', Engine)]));
const seats = [
  { id: 'w0', team: 'west', name: 'West 0' },
  { id: 'e0', team: 'east', name: 'East 0' }
];
const teamSeats = (west = 2, east = 2) => [
  ...Array.from({ length: west }, (_, i) => ({ id: 'w' + i, team: 'west', name: 'West ' + i })),
  ...Array.from({ length: east }, (_, i) => ({ id: 'e' + i, team: 'east', name: 'East ' + i }))
];
const make = (options = {}, players = seats) => Engine.create(players, { seed: 7, maxTicks: 10000, ...options });
const agent = (game, id) => game.agents().find(a => a.id === id);
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const directions = Object.entries(Engine.DIRS).filter(([name]) => name !== 'stay');

function path(game, start, target, allowed = () => true) {
  const grid = game.grid();
  const queue = [{ ...start, actions: [] }];
  const seen = new Set([start.y * game.width + start.x]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === target.x && p.y === target.y) return p.actions;
    for (const [action, [dx, dy]] of directions) {
      const next = { x: p.x + dx, y: p.y + dy };
      const key = next.y * game.width + next.x;
      if (next.x < 0 || next.x >= game.width || next.y < 0 || next.y >= game.height ||
          seen.has(key) || grid[next.y][next.x] === '#' || !allowed(next)) continue;
      seen.add(key);
      queue.push({ ...next, actions: [...p.actions, action] });
    }
  }
  assert.fail('No route to ' + JSON.stringify(target));
}

function walk(game, id, target, allowed) {
  const events = [];
  for (const action of path(game, agent(game, id), target, allowed)) {
    assert.equal(game.finished(), false);
    events.push(...game.step({ [id]: action }));
    assert.equal(agent(game, id).jailed, false, id + ' unexpectedly tagged');
  }
  assert.equal(agent(game, id).x, target.x);
  assert.equal(agent(game, id).y, target.y);
  return events;
}

function tagSetup(game) {
  walk(game, 'e0', { x: 22, y: 10 });
  walk(game, 'w0', { x: 20, y: 10 });
  return game.step({ w0: 'right' });
}

function pickupSetup(game) {
  walk(game, 'e0', { x: 16, y: 0 });
  const events = walk(game, 'w0', game.flags().east.home);
  assert.ok(events.some(e => e.type === 'pickup' && e.id === 'w0'));
  return events;
}

function runBots(seed, west, east, options = {}) {
  const game = make({ seed, maxTicks: 1200, ...options }, teamSeats());
  while (!game.finished()) {
    const moves = {};
    for (const a of game.agents()) moves[a.id] = (a.team === 'west' ? west : east)(game.botState(a.id));
    game.step(moves);
  }
  return game.result();
}

test('50 seeded fields are deterministic, point-symmetric, connected and reserve zones', () => {
  const fields = new Set();
  for (let seed = 0; seed < 50; seed++) {
    const grid = Engine.generateField(seed, 33, 21);
    assert.deepEqual(grid, Engine.generateField(seed, 33, 21));
    const game = make({ seed });
    assert.deepEqual(game.grid(), grid);
    const zones = game.zones();
    const flags = game.flags();
    let open = 0;
    let walls = 0;
    let start;
    for (let y = 0; y < 21; y++) {
      assert.equal(grid[y].length, 33);
      for (let x = 0; x < 33; x++) {
        assert.ok(grid[y][x] === '.' || grid[y][x] === '#');
        assert.equal(grid[y][x], grid[20 - y][32 - x]);
        if (grid[y][x] === '.') {
          open++;
          start = { x, y };
        } else walls++;
      }
    }
    assert.ok(walls / (33 * 21) >= 0.09 && walls / (33 * 21) <= 0.13);
    const visited = new Set([start.y * 33 + start.x]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const [, [dx, dy]] of directions) {
        const x = queue[i].x + dx;
        const y = queue[i].y + dy;
        const key = y * 33 + x;
        if (x < 0 || x >= 33 || y < 0 || y >= 21 || grid[y][x] === '#' || visited.has(key)) continue;
        visited.add(key);
        queue.push({ x, y });
      }
    }
    assert.equal(visited.size, open);
    for (const team of ['west', 'east']) {
      assert.equal(zones[team].home.length, 9);
      assert.equal(zones[team].jail.length, 4);
      for (const p of [flags[team].home, ...zones[team].home, ...zones[team].jail]) assert.equal(grid[p.y][p.x], '.');
    }
    assert.equal(zones.border, 16);
    assert.equal(zones.west.half, 'x<16');
    assert.equal(zones.east.half, 'x>16');
    const [w, e] = [agent(game, 'w0'), agent(game, 'e0')];
    assert.equal(w.x, 32 - e.x);
    assert.equal(w.y, 20 - e.y);
    assert.ok(w.x < 11 && e.x > 21);
    fields.add(grid.join('\n'));
  }
  assert.ok(fields.size > 40);
});

test('custom odd fields and four mirrored spawns work', () => {
  for (const [width, height] of [[9, 9], [17, 13], [35, 23]]) {
    const game = make({ width, height }, teamSeats(4, 4));
    const agents = game.agents();
    for (let i = 0; i < 4; i++) {
      const w = agents.find(a => a.id === 'w' + i);
      const e = agents.find(a => a.id === 'e' + i);
      assert.equal(w.x, width - 1 - e.x);
      assert.equal(w.y, height - 1 - e.y);
      assert.equal(game.grid()[w.y][w.x], '.');
      assert.ok(w.x < Math.ceil(width / 3));
    }
  }
  assert.throws(() => make({ width: 10 }), RangeError);
  assert.throws(() => make({ maxTicks: 0 }), RangeError);
  assert.throws(() => make({ capturesToWin: 0 }), RangeError);
  assert.throws(() => Engine.create([seats[0]], {}), RangeError);
  assert.throws(() => Engine.create([seats[0], { ...seats[1], id: 'w0' }], {}), TypeError);
});

test('integer ids are preserved and cannot alias string move keys', () => {
  const game = Engine.create([
    { id: 0, team: 'west', name: 'West' },
    { id: 1, team: 'east', name: 'East' }
  ], { seed: 4 });
  assert.equal(game.botState(0).you.id, 0);
  const before = game.botState(0).you.x;
  game.step({ 0: 'right' });
  assert.equal(game.botState(0).you.x, before + 1);
  assert.throws(() => Engine.create([
    { id: 0, team: 'west' }, { id: '0', team: 'east' }
  ]), TypeError);
});

test('mulberry32 matches its reference sequence', () => {
  const random = Engine.rng(1);
  assert.deepEqual(Array.from({ length: 4 }, random), [
    0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741
  ]);
});

test('missing, invalid and inherited actions stay; friendly cells may be shared', () => {
  const game = make({}, teamSeats(2, 1));
  const before = game.agents();
  for (const value of [null, undefined, '', 'UP', 'constructor', '__proto__', [], {}, 42]) {
    game.step({ w0: value });
    assert.deepEqual(game.agents(), before);
  }
  game.step(Object.create({ w0: 'right' }));
  game.step(null);
  assert.deepEqual(game.agents(), before);
  walk(game, 'w1', agent(game, 'w0'));
  assert.equal(distance(agent(game, 'w0'), agent(game, 'w1')), 0);
});

test('walls and out-of-field movement block', () => {
  const game = make();
  const grid = game.grid();
  let fixture;
  for (let y = 1; y < 20 && !fixture; y++) {
    for (let x = 1; x < 14 && !fixture; x++) {
      if (grid[y][x] !== '#') continue;
      for (const [action, [dx, dy]] of directions) {
        const p = { x: x - dx, y: y - dy };
        if (grid[p.y][p.x] === '.') fixture = { p, action };
      }
    }
  }
  assert.ok(fixture);
  walk(game, 'w0', fixture.p);
  const before = agent(game, 'w0');
  game.step({ w0: fixture.action });
  assert.deepEqual(agent(game, 'w0'), before);
  walk(game, 'w0', { x: 0, y: 0 });
  game.step({ w0: 'left' });
  game.step({ w0: 'up' });
  assert.equal(agent(game, 'w0').x, 0);
  assert.equal(agent(game, 'w0').y, 0);
});

test('neutral border prevents tagging in both directions, but adjacency inside home tags', () => {
  for (const defendingTeam of ['west', 'east']) {
    const game = make();
    const defender = defendingTeam === 'west' ? 'w0' : 'e0';
    const intruder = defendingTeam === 'west' ? 'e0' : 'w0';
    const sign = defendingTeam === 'west' ? -1 : 1;
    walk(game, intruder, { x: 16, y: 10 });
    walk(game, defender, { x: 16 + sign, y: 10 });
    assert.equal(game.agents().some(a => a.jailed), false);
    game.step({});
    assert.equal(game.agents().some(a => a.jailed), false);
    walk(game, defender, { x: 16 + 2 * sign, y: 10 });
    const events = game.step({ [intruder]: sign < 0 ? 'left' : 'right' });
    assert.ok(events.some(e => e.type === 'tag' && e.id === intruder && e.by === defender));
    assert.equal(agent(game, defender).jailed, false);
    assert.equal(agent(game, defender).tags, 1);
    assert.equal(agent(game, intruder).timesJailed, 1);
    assert.ok(game.zones()[defendingTeam].jail.some(p => distance(p, agent(game, intruder)) === 0));
  }
});

test('a border agent cannot tag an intruder one cell inside its half', () => {
  const game = make();
  walk(game, 'w0', { x: 16, y: 10 });
  walk(game, 'e0', { x: 16, y: 10 });
  game.step({ e0: 'left' });
  assert.equal(game.agents().some(a => a.jailed), false);
  const events = game.step({ w0: 'left' });
  assert.ok(events.some(e => e.type === 'tag' && e.id === 'e0'));
  assert.equal(agent(game, 'w0').jailed, false);
});

test('simultaneous enemy swaps across the border stay neutral, then defensive overlap tags', () => {
  const game = make();
  walk(game, 'e0', { x: 16, y: 10 });
  walk(game, 'w0', { x: 15, y: 10 });
  const events = game.step({ w0: 'right', e0: 'left' });
  assert.equal(events.some(e => e.type === 'tag'), false);
  assert.equal(agent(game, 'w0').x, 16);
  assert.equal(agent(game, 'e0').x, 15);
  const tagged = game.step({ w0: 'left' });
  assert.ok(tagged.some(e => e.type === 'tag' && e.id === 'e0' && e.by === 'w0'));
});

test('a tagged carrier immediately returns its flag and freezes in enemy jail', () => {
  const game = make();
  pickupSetup(game);
  walk(game, 'w0', { x: 24, y: 10 });
  walk(game, 'e0', { x: 24, y: 0 });
  walk(game, 'e0', { x: 24, y: 8 });
  const events = game.step({ e0: 'down' });
  assert.ok(events.some(e => e.type === 'tag' && e.id === 'w0'));
  assert.ok(events.some(e => e.type === 'drop' && e.flag === 'east' && e.returned));
  assert.deepEqual(game.flags().east, { ...game.flags().east.home, home: game.flags().east.home, carrier: null });
  const prisoner = agent(game, 'w0');
  assert.equal(prisoner.carrying, false);
  assert.equal(prisoner.jailed, true);
  assert.equal(prisoner.flagPickups, 1);
  game.step({ w0: 'up' });
  assert.equal(agent(game, 'w0').x, prisoner.x);
  assert.equal(agent(game, 'w0').y, prisoner.y);
  assert.equal(agent(game, 'w0').jailTicks, 1);
});

test('one teammate rescues all prisoners, followed by exactly three frozen respawn ticks', () => {
  const game = make({}, teamSeats(3, 1));
  walk(game, 'e0', { x: 22, y: 10 });
  walk(game, 'w0', { x: 20, y: 10 });
  walk(game, 'w1', { x: 20, y: 10 });
  const jail = game.zones().east.jail;
  const safe = p => (p.x <= 16 || distance(p, agent(game, 'e0')) > 1) && jail.every(j => distance(p, j) > 1);
  walk(game, 'w2', { x: 32, y: 17 }, safe);
  const tags = game.step({ w0: 'right', w1: 'right' });
  assert.equal(tags.filter(e => e.type === 'tag').length, 2);
  assert.equal(agent(game, 'e0').tags, 2);
  const events = game.step({ w2: 'down' });
  const freed = events.find(e => e.type === 'free');
  assert.deepEqual(freed.ids, ['w0', 'w1']);
  assert.equal(freed.by, 'w2');
  for (const id of freed.ids) {
    assert.equal(agent(game, id).jailed, false);
    assert.equal(agent(game, id).respawnIn, 3);
  }
  for (let remaining = 2; remaining >= 0; remaining--) {
    const releases = game.step({ w0: 'right', w1: 'right' });
    for (const id of freed.ids) assert.equal(agent(game, id).respawnIn, remaining);
    assert.equal(releases.filter(e => e.type === 'release').length, remaining === 0 ? 2 : 0);
  }
  for (const id of freed.ids) {
    const a = agent(game, id);
    assert.deepEqual({ x: a.x, y: a.y }, game.flags().west.home);
  }
  const before = agent(game, 'w0');
  game.step({ w0: 'right' });
  assert.equal(agent(game, 'w0').x, before.x + 1);
});

test('automatic release occurs forty ticks after tagging, not one tick earlier', () => {
  const game = make();
  assert.ok(tagSetup(game).some(e => e.type === 'tag'));
  for (let n = 1; n < 40; n++) {
    game.step({ w0: 'right' });
    assert.equal(agent(game, 'w0').jailed, true);
    assert.equal(agent(game, 'w0').jailTicks, n);
  }
  const events = game.step({ w0: 'right' });
  assert.ok(events.some(e => e.type === 'release' && e.id === 'w0' && e.automatic));
  const a = agent(game, 'w0');
  assert.equal(a.jailed, false);
  assert.equal(a.jailTicks, 0);
  assert.deepEqual({ x: a.x, y: a.y }, game.flags().west.home);
});

test('only one carrier picks up a flag, and home crossing captures without returning to the stand', () => {
  const game = make({ capturesToWin: 1 }, teamSeats(2, 1));
  walk(game, 'e0', { x: 16, y: 0 });
  walk(game, 'w0', { x: 28, y: 10 });
  walk(game, 'w1', { x: 28, y: 10 });
  const events = game.step({ w0: 'right', w1: 'right' });
  assert.equal(events.filter(e => e.type === 'pickup').length, 1);
  assert.equal(agent(game, 'w0').carrying, true);
  assert.equal(agent(game, 'w1').carrying, false);
  assert.equal(game.flags().east.carrier, 'w0');
  walk(game, 'w0', { x: 16, y: 10 });
  assert.equal(agent(game, 'w0').carrying, true);
  assert.equal(game.botState('w0').score.west, 0);
  assert.equal(game.finished(), false);
  const captured = game.step({ w0: 'left' });
  assert.ok(captured.some(e => e.type === 'capture' && e.team === 'west'));
  assert.equal(agent(game, 'w0').x, 15);
  assert.equal(agent(game, 'w0').carrying, false);
  assert.equal(game.flags().east.carrier, null);
  assert.equal(game.finished(), true);
  assert.equal(game.result().winner, 'west');
  assert.equal(game.result().reason, 'captures');
  assert.deepEqual(game.result().score, { west: 1, east: 0 });
  assert.equal(game.result().agents.find(a => a.id === 'w0').captures, 1);
  const frozen = game.result();
  assert.deepEqual(game.step({ w0: 'right' }), []);
  assert.deepEqual(game.result(), frozen);
});

test('default three-capture threshold and defenders never pick up their own flag', () => {
  const game = make();
  assert.equal(game.result(), null);
  game.step({});
  assert.equal(agent(game, 'w0').carrying, false);
  assert.equal(agent(game, 'e0').carrying, false);
  walk(game, 'e0', { x: 16, y: 0 });
  for (let n = 1; n <= 3; n++) {
    walk(game, 'w0', game.flags().east.home);
    walk(game, 'w0', { x: 15, y: 10 });
    assert.equal(game.botState('w0').score.west, n);
    assert.equal(game.finished(), n === 3);
  }
  assert.equal(game.result().reason, 'captures');
});

test('time results rank captures, then tags, then draw', () => {
  const drawn = make({ maxTicks: 1 });
  drawn.step({});
  assert.deepEqual(drawn.result().score, { west: 0, east: 0 });
  assert.equal(drawn.result().winner, null);
  assert.equal(drawn.result().reason, 'draw');
  assert.equal(drawn.result().tick, 1);

  const captured = make({ maxTicks: 240, capturesToWin: 9 }, teamSeats(2, 1));
  pickupSetup(captured);
  walk(captured, 'w0', { x: 15, y: 10 });
  walk(captured, 'e0', { x: 22, y: 10 });
  for (const id of ['w0', 'w1']) {
    walk(captured, id, { x: 20, y: 10 });
    captured.step({ [id]: 'right' });
  }
  while (!captured.finished()) captured.step({});
  assert.equal(captured.result().winner, 'west');
  assert.equal(captured.result().reason, 'time');
  assert.deepEqual(captured.result().score, { west: 1, east: 0 });
  assert.equal(captured.result().agents.find(a => a.id === 'e0').tags, 2);

  const tagged = make({ maxTicks: 120 });
  tagSetup(tagged);
  while (!tagged.finished()) tagged.step({});
  assert.deepEqual(tagged.result().score, { west: 0, east: 0 });
  assert.equal(tagged.result().winner, 'east');
  assert.equal(tagged.result().reason, 'time');
  assert.equal(tagged.result().agents.find(a => a.id === 'e0').tags, 1);
});

test('equal nonzero tag totals remain a draw at the time limit', () => {
  const game = make({ maxTicks: 160 }, teamSeats());
  walk(game, 'w1', { x: 27, y: 10 });
  assert.ok(game.step({ w1: 'right' }).some(e => e.type === 'tag' && e.id === 'w1'));
  walk(game, 'e1', { x: 5, y: 10 });
  assert.ok(game.step({ e1: 'left' }).some(e => e.type === 'tag' && e.id === 'e1'));
  while (!game.finished()) game.step({});
  const result = game.result();
  for (const team of ['west', 'east']) {
    assert.equal(result.agents.filter(a => a.team === team).reduce((sum, a) => sum + a.tags, 0), 1);
  }
  assert.equal(result.winner, null);
  assert.equal(result.reason, 'draw');
});

test('all public snapshots, including botState and result, are detached', () => {
  const game = make({ maxTicks: 1 });
  const expected = game.botState('w0');
  const state = game.botState('w0');
  state.you.x = 999;
  state.enemies[0].name = 'Changed';
  state.flags.east.home.x = 999;
  state.flags.west.carrier = 'fake';
  state.zones.west.home[0].x = 999;
  state.score.west = 99;
  state.grid[0] = '#';
  assert.deepEqual(game.botState('w0'), expected);
  game.agents()[0].x = 999;
  game.grid()[0] = '#';
  game.flags().east.home.x = 999;
  game.zones().east.jail[0].x = 999;
  assert.deepEqual(game.botState('w0'), expected);
  assert.throws(() => game.botState('unknown'), RangeError);
  game.step({});
  const result = game.result();
  result.score.west = 99;
  result.agents[0].tags = 99;
  assert.equal(game.result().score.west, 0);
  assert.equal(game.result().agents[0].tags, 0);
});

test('same seats, seed and moves produce identical events and states', () => {
  const a = make({ seed: 123, maxTicks: 300 }, teamSeats());
  const b = make({ seed: 123, maxTicks: 300 }, teamSeats());
  const random = Engine.rng(987);
  const actions = Object.keys(Engine.DIRS);
  for (let i = 0; i < 300; i++) {
    const moves = Object.fromEntries(a.agents().map(p => [p.id, actions[Math.floor(random() * actions.length)]]));
    assert.deepEqual(a.step(moves), b.step(moves));
    assert.deepEqual(a.agents(), b.agents());
    assert.deepEqual(a.flags(), b.flags());
  }
  assert.deepEqual(a.result(), b.result());
});

test('each sample bot returns a legal action for thirty independent states', () => {
  const actions = Object.keys(Engine.DIRS);
  for (const [name, bot] of Object.entries(bots)) {
    for (let n = 0; n < 30; n++) {
      const game = make({ seed: n }, teamSeats());
      for (let tick = 0; tick < n * 2; tick++) {
        const moves = Object.fromEntries(game.agents().map(a => [a.id, bots.rusher(game.botState(a.id))]));
        game.step(moves);
      }
      const id = ['w0', 'w1', 'e0', 'e1'][n % 4];
      const state = game.botState(id);
      const before = structuredClone(state);
      const action = bot(state);
      assert.ok(actions.includes(action), name + ' returned an illegal action');
      assert.equal(bot(game.botState(id)), action, name + ' is not deterministic');
      assert.deepEqual(state, before, name + ' mutated its input');
    }
    for (const status of [{ jailed: true }, { respawnIn: 2 }]) {
      const state = make().botState('w0');
      Object.assign(state.you, status);
      assert.equal(bot(state), 'stay');
    }
  }
});

test('2v2 squad beats rusher in at least three of five fixed seeds', () => {
  const results = [1, 2, 3, 4, 5].map(seed => runBots(seed, bots.squad, bots.rusher));
  assert.ok(results.every(r => r !== null && r.tick <= 1200));
  const wins = results.filter(r => r.winner === 'west').length;
  assert.ok(wins >= 3, 'Squad results: ' + JSON.stringify(results.map(r => ({ winner: r.winner, score: r.score }))));
});
