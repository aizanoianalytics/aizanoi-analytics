import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const src = file => fs.readFileSync(
  new URL('../frontend/arcade/capture-flag/' + file, import.meta.url), 'utf8',
);
const loadUmd = file => {
  const m = { exports: {} };
  new vm.Script(
    `(function (module, exports) {\n${src(file)}\n})`, { filename: file },
  ).runInThisContext()(m, m.exports);
  return m.exports;
};
const Engine = loadUmd('engine.js');
const get = (game, id) => game.agents().find(a => a.id === id);
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function walk(game, id, target) {
  const start = get(game, id);
  assert.ok(!start.jailed && !start.respawnIn);
  const grid = game.grid();
  const enemies = game.agents().filter(a =>
    a.team !== start.team && !a.jailed && !a.respawnIn);
  const border = game.zones().border;
  const unsafe = p => enemies.some(enemy => {
    const enemyHome = x => enemy.team === 'west' ? x < border : x > border;
    return enemyHome(enemy.x) && enemyHome(p.x) && distance(p, enemy) <= 1;
  });
  const queue = [{ x: start.x, y: start.y, route: [] }];
  const seen = new Set([`${start.x},${start.y}`]);
  let route;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === target.x && p.y === target.y) {
      route = p.route;
      break;
    }
    for (const [action, [dx, dy]] of Object.entries(Engine.DIRS)) {
      if (action === 'stay') continue;
      const next = { x: p.x + dx, y: p.y + dy };
      const key = `${next.x},${next.y}`;
      if (next.x < 0 || next.x >= game.width || next.y < 0 ||
          next.y >= game.height || seen.has(key) ||
          grid[next.y][next.x] === '#' || unsafe(next)) continue;
      seen.add(key);
      queue.push({ ...next, route: [...p.route, action] });
    }
  }
  assert.ok(route, `No safe route for ${id} to ${JSON.stringify(target)}`);
  for (const action of route) {
    assert.equal(game.finished(), false);
    game.step({ [id]: action });
    assert.equal(get(game, id).jailed, false);
  }
  assert.equal(get(game, id).x, target.x);
  assert.equal(get(game, id).y, target.y);
}

function thresholdFixture(options = {}) {
  const game = Engine.create([
    { id: 'w0', team: 'west', name: 'West carrier' },
    { id: 'w1', team: 'west', name: 'West teammate' },
    { id: 'e0', team: 'east', name: 'East carrier' },
  ], { seed: 7, maxTicks: 10000, capturesToWin: 1, ...options });

  walk(game, 'e0', { x: 22, y: 10 });
  walk(game, 'w1', { x: 20, y: 10 });
  const tags = game.step({ w1: 'right' });
  assert.ok(tags.some(e => e.type === 'tag' && e.id === 'w1' && e.by === 'e0'));
  walk(game, 'e0', { x: 16, y: 0 });
  for (let i = 0; i < 40; i++) game.step({});
  walk(game, 'w1', { x: 0, y: 0 });
  walk(game, 'w0', game.flags().east.home);
  walk(game, 'w0', { x: 16, y: 10 });
  walk(game, 'e0', game.flags().west.home);
  walk(game, 'e0', { x: 16, y: 10 });
  assert.equal(get(game, 'w0').carrying, true);
  assert.equal(get(game, 'e0').carrying, true);
  assert.equal(get(game, 'e0').tags, 1);
  assert.equal(game.finished(), false);
  return game;
}

test('equal simultaneous threshold captures draw despite unequal tag totals', () => {
  const game = thresholdFixture();
  const events = game.step({ w0: 'left', e0: 'right' });
  assert.equal(events.filter(e => e.type === 'capture').length, 2);
  assert.equal(game.finished(), true);
  assert.deepEqual(game.result().score, { west: 1, east: 1 });
  assert.equal(game.result().winner, null);
  assert.equal(game.result().reason, 'draw');
  const result = game.result();
  assert.deepEqual(game.step({ w0: 'right' }), []);
  assert.deepEqual(game.result(), result);
});

test('simultaneous winning captures on the time-limit tick still draw', () => {
  const probe = thresholdFixture();
  const finalTick = probe.tick + 1;
  const game = thresholdFixture({ maxTicks: finalTick });
  game.step({ w0: 'left', e0: 'right' });
  assert.equal(game.result().tick, finalTick);
  assert.equal(game.result().winner, null);
  assert.equal(game.result().reason, 'draw');
});

test('below threshold the same equal captures use tags at the time limit', () => {
  const probe = thresholdFixture();
  const game = thresholdFixture({
    capturesToWin: 2,
    maxTicks: probe.tick + 1,
  });
  game.step({ w0: 'left', e0: 'right' });
  assert.deepEqual(game.result().score, { west: 1, east: 1 });
  assert.equal(game.result().winner, 'east');
  assert.equal(game.result().reason, 'time');
});

test('botState exposes the actual winning target without removing existing keys', () => {
  const game = Engine.create([
    { id: 0, team: 'west' }, { id: 1, team: 'east' },
  ], { seed: 4, capturesToWin: 7 });
  const state = game.botState(0);
  assert.deepEqual(Object.keys(state).sort(), [
    'tick', 'maxTicks', 'capturesToWin', 'width', 'height', 'grid', 'border',
    'you', 'team', 'teammates', 'enemies', 'flags', 'zones', 'score',
  ].sort());
  assert.equal(state.capturesToWin, 7);
  state.capturesToWin = 99;
  assert.equal(game.botState(0).capturesToWin, 7);
});

test('worker preserves object-method receiver and recovers from a thrown move', () => {
  const scope = {};
  const messages = [];
  const imports = [];
  const exported = {
    direction: 'right',
    move(state) {
      if (state.tick === 1) throw new Error('Example failure');
      return this.direction;
    },
  };
  new vm.Script(
    `(function (self, importScripts, postMessage, FlagEngine, Math) {
      ${src('bot-worker.js')}
    })`, { filename: 'bot-worker.js' },
  ).runInThisContext()(
    scope,
    file => {
      imports.push(file);
      if (file.startsWith('bots/')) scope.module.exports = exported;
    },
    message => messages.push(message),
    Engine,
    Object.create(Math),
  );
  scope.onmessage({ data: { type: 'init', id: 'sample-squad', seed: 3 } });
  for (const tick of [0, 1, 2]) {
    scope.onmessage({ data: { type: 'move', state: { tick } } });
  }
  assert.deepEqual(imports, ['engine.js', 'bots/sample-squad.js']);
  assert.deepEqual(messages, [
    { type: 'ready' },
    { type: 'move', tick: 0, move: 'right' },
    { type: 'move', tick: 1, move: null },
    { type: 'move', tick: 2, move: 'right' },
  ]);
});

test('commentary uses exact simultaneous tag events and distinguishes releases', () => {
  // Extract the actual standalone function, retaining same-realm execution.
  const text = src('game.js');
  const begin = text.indexOf('  function announce(');
  const end = text.indexOf('\n  function roundSeats(', begin);
  assert.ok(begin >= 0 && end > begin);
  const ticker = { textContent: '' };
  const announce = new vm.Script(
    `(function ($, TITLES) {
      ${text.slice(begin, end)}
      return announce;
    })`,
  ).runInThisContext()(
    id => {
      assert.equal(id, 'cf-ticker');
      return ticker;
    },
    { west: 'West', east: 'East' },
  );
  const agents = [
    { id: 'w1', name: 'Alpha' }, { id: 'w2', name: 'Beta' },
    { id: 'e1', name: 'Gamma' }, { id: 'e2', name: 'Delta' },
  ];
  announce([
    { type: 'tag', id: 'e1', by: 'w2', team: 'west' },
    { type: 'tag', id: 'e2', by: 'w1', team: 'west' },
    { type: 'release', id: 'e1', team: 'east', automatic: false },
    { type: 'release', id: 'e2', team: 'east', automatic: true },
  ], agents, agents);
  assert.equal(ticker.textContent,
    'W2 · Beta tagged E1 · Gamma · W1 · Alpha tagged E2 · Delta · ' +
    'E1 · Gamma respawned · E2 · Delta served jail time');
});

test('one shared touch pad routes only to the selected human', async () => {
  const listeners = new Map();
  const padListeners = new Map();
  const history = [];
  let tick = 0;
  let selected = 'p2';
  const win = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const pad = {
    contains: button => button === buttonNode,
    addEventListener(type, fn) {
      if (!padListeners.has(type)) padListeners.set(type, new Set());
      padListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { padListeners.get(type)?.delete(fn); },
  };
  const buttonNode = { disabled: false, dataset: { dir: 'right' } };
  const target = { closest: () => buttonNode };
  const input = () => ({
    dir: 'up',
    reset(direction) { this.dir = direction; },
    onKey() { return () => {}; },
    destroy() {},
  });
  const seats = [
    { id: 'w1', team: 'west', human: true, input: input(), pad,
      enabled: true, touchSelected: () => selected === 'p1' },
    { id: 'e1', team: 'east', human: true, input: input(), pad,
      enabled: true, touchSelected: () => selected === 'p2' },
  ];
  const game = {
    get tick() { return tick; },
    agents: () => seats.map(s => ({ id: s.id, jailed: false, respawnIn: 0 })),
    finished: () => false,
    step(moves) { history.push({ ...moves }); tick++; return []; },
  };
  new vm.Script(
    `(function (window, FlagEngine) { ${src('runner.js')} })`,
    { filename: 'runner.js' },
  ).runInThisContext()(win, { create: () => game });
  const dispatch = (map, type, event) => {
    for (const fn of map.get(type) || []) fn(event);
  };
  const run = win.FlagRunner.start(seats);
  try {
    await run.turn();
    assert.deepEqual(history.at(-1), { w1: 'stay', e1: 'stay' });
    dispatch(padListeners, 'pointerdown', {
      target, pointerId: 1, preventDefault() {},
    });
    await run.turn();
    await run.turn();
    assert.deepEqual(history.at(-1), { w1: 'stay', e1: 'right' });
    dispatch(listeners, 'pointerup', { pointerId: 1 });
    await run.turn();
    assert.deepEqual(history.at(-1), { w1: 'stay', e1: 'stay' });

    selected = 'p1';
    dispatch(padListeners, 'click', { target, detail: 0 });
    await run.turn();
    assert.deepEqual(history.at(-1), { w1: 'right', e1: 'stay' });
    await run.turn();
    assert.deepEqual(history.at(-1), { w1: 'stay', e1: 'stay' });

    seats[0].enabled = false;
    dispatch(padListeners, 'pointerdown', {
      target, pointerId: 2, preventDefault() {},
    });
    await run.turn();
    assert.deepEqual(history.at(-1), { w1: 'stay', e1: 'stay' });
  } finally {
    run.stop();
  }
  assert.ok([...listeners.values(), ...padListeners.values()].every(set => set.size === 0));
});
