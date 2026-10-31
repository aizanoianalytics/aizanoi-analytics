import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = file => fs.readFileSync(
  new URL('../frontend/arcade/football/' + file, import.meta.url), 'utf8'
);
const moduleObject = { exports: {} };
new vm.Script(`(function (module, exports, FootballEngine) {\n${src('engine.js')}\n})`, {
  filename: 'engine.js'
}).runInThisContext()(moduleObject, moduleObject.exports, undefined);
const Engine = moduleObject.exports;

function harness() {
  let clock = 0;
  let serial = 0;
  const frames = new Map();
  const timers = new Map();
  const workers = [];
  const handlers = new Map();
  class Element {
    constructor(kind = 'body') {
      this.kind = kind;
    }
    closest(selector) {
      if (selector === 'button') return this.kind === 'button' ? this : null;
      return ['button', 'input', 'select', 'textarea'].includes(this.kind) ? this : null;
    }
    blur() {
      document.activeElement = new Element();
    }
  }
  const window = {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    }
  };
  const document = {
    activeElement: new Element('button'),
    addEventListener() {},
    removeEventListener() {}
  };
  class Worker {
    constructor(path) {
      assert.equal(path, '/arcade/football/bot-worker.js');
      this.messages = [];
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    send(message) {
      this.onmessage({ data: message });
    }
    request() {
      return this.messages.filter(message => message.type === 'decide').at(-1);
    }
    answer(input, request = this.request()) {
      this.send({ type: 'decide', step: request.step, request: request.request, input });
    }
  }
  const setTimeout = (callback, delay) => {
    const id = ++serial;
    timers.set(id, { callback, due: clock + delay });
    return id;
  };
  const clearTimeout = id => timers.delete(id);
  const requestAnimationFrame = callback => {
    const id = ++serial;
    frames.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = id => frames.delete(id);
  new vm.Script(`(function (
    window, document, Element, Worker, FootballEngine, performance,
    setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame
  ) {\n${src('runner.js')}\n})`, { filename: 'runner.js' })
    .runInThisContext()(
      window, document, Element, Worker, Engine, { now: () => clock },
      setTimeout, clearTimeout, requestAnimationFrame, cancelAnimationFrame
    );
  return {
    window, document, workers, Element,
    frame(time) {
      clock = time;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(clock);
    },
    time(time, fireTimers = true) {
      clock = time;
      if (!fireTimers) return;
      for (const [id, entry] of [...timers]) {
        if (entry.due <= clock && timers.delete(id)) entry.callback();
      }
    },
    key(code, target = document.activeElement) {
      for (const handler of handlers.get('keydown') || []) {
        handler({ code, target, preventDefault() {} });
      }
    }
  };
}

const bots = [
  { id: 'r1', team: 'red', name: 'Red', botId: 'sample-chaser' },
  { id: 'b1', team: 'blue', name: 'Blue', botId: 'sample-striker' }
];
const move = { x: 1, y: 0, kick: false };
const neutral = { x: 0, y: 0, kick: false };

async function begin(h, seats = bots, options = {}) {
  const run = h.window.FootballRunner.start(seats, {
    time: 1, scoreLimit: 0, speed: 4, seed: 1, ...options
  });
  const started = run.start(() => {});
  for (const worker of h.workers) worker.send({ type: 'ready' });
  await started;
  return run;
}

test('4x rendering cannot skip pending decision windows', async t => {
  const h = harness();
  const run = await begin(h);
  t.after(() => run.stop());
  h.frame(0);
  h.frame(20);
  assert.equal(run.game.steps, 0);
  assert.ok(h.workers.every(worker => worker.request().step === 0));
  h.workers[0].answer(move);
  h.frame(21);
  assert.equal(run.game.steps, 0, 'all requested seats must answer');
  h.workers[1].answer(move);
  h.frame(22);
  assert.equal(run.game.steps, 3);
  assert.ok(h.workers.every(worker => worker.request().step === 3));
  const players = run.game.state().players;
  assert.ok(players[0].x > -95);
  assert.ok(players[1].x < 95, 'Blue return is unmirrored exactly once');
});

test('invalid decisions hold previous action without disabling worker', async t => {
  const h = harness();
  const run = await begin(h);
  t.after(() => run.stop());
  h.frame(0);
  h.frame(20);
  h.workers[0].answer(move);
  h.workers[1].answer(neutral);
  h.frame(21);
  const before = run.game.state().players[0].vx;
  h.workers[0].answer({ x: NaN, y: 0, kick: false });
  h.workers[1].answer(neutral);
  h.frame(40);
  assert.equal(run.game.steps, 6);
  assert.ok(run.game.state().players[0].vx > before);
  assert.equal(h.workers[0].terminated, false);
});

test('timeout terminates worker and keeps its previous valid action', async t => {
  const h = harness();
  const run = await begin(h);
  t.after(() => run.stop());
  h.frame(0);
  h.frame(20);
  for (const worker of h.workers) worker.answer(move);
  h.frame(21);
  const before = run.game.state().players[0].vx;
  h.time(72);
  assert.ok(h.workers.every(worker => worker.terminated));
  h.frame(73);
  assert.ok(run.game.steps > 3);
  assert.ok(run.game.state().players[0].vx > before);
});

test('late message cannot evade timeout when its timer has not fired yet', async t => {
  const h = harness();
  const run = await begin(h);
  t.after(() => run.stop());
  h.frame(0);
  h.frame(20);
  h.time(71, false);
  h.workers[0].answer(move);
  assert.equal(h.workers[0].terminated, true);
  h.workers[1].answer(move);
  assert.equal(h.workers[1].terminated, true);
  h.frame(72);
  assert.equal(run.game.state().players[0].vx, 0);
});

test('pause/resume rejects pre-pause responses at the same physics step', async t => {
  const h = harness();
  const run = await begin(h);
  t.after(() => run.stop());
  h.frame(0);
  h.frame(20);
  const oldRequests = h.workers.map(worker => worker.request());
  run.pause();
  h.document.activeElement = new h.Element('button');
  run.resume();
  assert.equal(h.document.activeElement.kind, 'body');
  h.frame(21);
  for (let i = 0; i < h.workers.length; i++) {
    assert.notEqual(h.workers[i].request().request, oldRequests[i].request);
    h.workers[i].answer(move, oldRequests[i]);
  }
  h.frame(22);
  assert.equal(run.game.steps, 0);
  for (const worker of h.workers) worker.answer(neutral);
  h.frame(23);
  assert.equal(run.game.steps, 3);
  assert.equal(run.game.state().players[0].vx, 0);
});

test('startup timeout disables seat and ignores a late ready message', async t => {
  const h = harness();
  const run = h.window.FootballRunner.start(bots, { time: 1 });
  t.after(() => run.stop());
  const started = run.start(() => {});
  h.time(5001);
  await started;
  assert.ok(h.workers.every(worker => worker.terminated));
  for (const worker of h.workers) worker.send({ type: 'ready' });
  h.frame(5001);
  h.frame(5020);
  assert.ok(run.game.steps > 0);
  assert.ok(h.workers.every(worker => !worker.request()));
});

test('click-start keyboard focus is released, but text editing focus is preserved', async t => {
  const humanSeats = [
    { id: 'r1', team: 'red', name: 'P1', human: true, keys: 'p1' },
    { id: 'b1', team: 'blue', name: 'P2', human: true, keys: 'p2' }
  ];
  const h = harness();
  const run = await begin(h, humanSeats);
  t.after(() => run.stop());
  assert.equal(h.document.activeElement.kind, 'body');
  h.key('KeyD');
  h.frame(0);
  h.frame(20);
  assert.ok(run.game.state().players[0].x > -95);
  run.pause();
  h.document.activeElement = new h.Element('input');
  run.resume();
  assert.equal(h.document.activeElement.kind, 'input');
});

test('worker echoes request serial without changing legacy messages', () => {
  const messages = [];
  const context = vm.createContext({
    postMessage: message => messages.push(JSON.parse(JSON.stringify(message)))
  });
  context.importScripts = filename => {
    if (filename !== 'engine.js') {
      vm.runInContext('module.exports = () => ({ x: 0, y: 0, kick: false });', context);
    }
  };
  vm.runInContext('self = globalThis;', context);
  new vm.Script(src('bot-worker.js'), { filename: 'bot-worker.js' }).runInContext(context);
  context.onmessage({ data: { type: 'init', id: 'sample-chaser', seed: 1 } });
  context.onmessage({ data: { type: 'decide', step: 0, request: 17, state: { step: 0 } } });
  assert.deepEqual(messages.at(-1), {
    type: 'decide', step: 0, request: 17, input: neutral
  });
  context.onmessage({ data: { type: 'decide', step: 3, state: { step: 3 } } });
  assert.deepEqual(messages.at(-1), { type: 'decide', step: 3, input: neutral });
});
