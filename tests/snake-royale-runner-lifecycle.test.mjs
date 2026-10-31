import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../frontend/arcade/snake-royale/runner.js', import.meta.url), 'utf8'
);

// Same-realm wrapper: assertions see ordinary host objects and arrays.
const loadRunner = vm.runInThisContext(
  `(function(window, Worker, SnakeEngine, setTimeout, clearTimeout) {
    ${source}
    return window.SnakeRunner;
  })`,
  { filename: 'snake-royale/runner.js' }
);

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function harness() {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const workers = [];
  const steps = [];
  let done = false;
  const game = {
    options: { seed: 1, width: 11, height: 11 },
    snakes: [
      { id: 'a', body: [[2, 2]], alive: true },
      { id: 'b', body: [[8, 8]], alive: true },
    ],
    turn: 0,
    botState(id) { return { turn: this.turn + 1, you: { id } }; },
    finished() { return done; },
    step(moves) {
      this.turn++;
      steps.push({ ...moves });
      return [{ type: 'stepped', turn: this.turn }];
    },
  };
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.terminations = 0;
      this.onmessage = null;
      this.onerror = null;
      workers.push(this);
    }
    postMessage(message) { this.sent.push(message); }
    terminate() { this.terminations++; }
    emit(data) { this.onmessage?.({ data }); }
    error() { this.onerror?.({ preventDefault() {} }); }
  }
  const setTimer = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  const clearTimer = id => timers.delete(id);
  const runner = loadRunner({}, FakeWorker, { create: () => game }, setTimer, clearTimer);
  return {
    runner, workers, game, steps, timers,
    start(entries = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]) {
      return runner.start(entries, { seed: 1 });
    },
    finish() { done = true; },
    ready() { workers.forEach(worker => worker.emit({ type: 'ready' })); },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.due <= now)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
        if (!due.length) break;
        const [id, timer] = due[0];
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

test('initialization has a bounded deadline and terminates stalled imports', async () => {
  const h = harness(), run = h.start();
  h.workers[0].emit({ type: 'move', turn: 1, move: 'right' });
  h.workers[1].emit({ type: 'ready' });
  h.advance(4999);
  await flush();
  assert.equal(h.game.snakes[0].alive, true);
  h.advance(1);
  await run.loaded;
  assert.equal(h.game.snakes[0].alive, false);
  assert.deepEqual(h.game.snakes[0].death, {
    turn: 0, cause: 'load-error', by: null,
  });
  assert.equal(h.workers[0].terminations, 1);
  assert.equal(h.workers[1].terminations, 0);
  assert.equal(h.timers.size, 0);
  run.stop();
  assert.equal(h.workers[0].terminations, 1);
  assert.equal(h.workers[1].terminations, 1);
});

test('explicit initialization failures terminate without waiting for a deadline', async () => {
  for (const failure of ['message', 'error']) {
    const h = harness(), run = h.start();
    if (failure === 'message') h.workers[0].emit({ type: 'fail' });
    else h.workers[0].error();
    h.workers[1].emit({ type: 'ready' });
    await run.loaded;
    assert.equal(h.game.snakes[0].death.cause, 'load-error');
    assert.equal(h.workers[0].terminations, 1);
    assert.equal(h.timers.size, 0);
    run.stop();
  }
});

test('move timeout terminates once and supplies null on all subsequent turns', async () => {
  const h = harness(), run = h.start();
  h.ready();
  await run.loaded;
  const first = run.turn();
  await flush();
  h.workers[1].emit({ type: 'move', turn: 1, move: 'left' });
  h.advance(399);
  await flush();
  assert.equal(h.steps.length, 0);
  h.advance(1);
  await first;
  assert.deepEqual(h.steps, [{ a: null, b: 'left' }]);
  assert.equal(h.workers[0].terminations, 1);
  const sent = h.workers[0].sent.length;
  const second = run.turn();
  await flush();
  h.workers[1].emit({ type: 'move', turn: 2, move: 'up' });
  await second;
  assert.deepEqual(h.steps[1], { a: null, b: 'up' });
  assert.equal(h.workers[0].sent.length, sent);
  assert.equal(h.game.snakes[0].alive, true, 'fallback is not immediate elimination');
  assert.equal(h.timers.size, 0);
  run.stop();
  assert.equal(h.workers[0].terminations, 1);
});

test('worker errors retire the worker and preserve the other contestant response', async () => {
  const h = harness(), run = h.start();
  h.ready();
  await run.loaded;
  const turn = run.turn();
  await flush();
  h.workers[0].error();
  h.workers[1].emit({ type: 'move', turn: 1, move: 'down' });
  await turn;
  assert.deepEqual(h.steps[0], { a: null, b: 'down' });
  assert.equal(h.workers[0].terminations, 1);
  assert.equal(h.timers.size, 0);
  run.stop();
});

test('move protocol ignores wrong type and stale turn, and rejects non-string payloads', async () => {
  const h = harness(), run = h.start();
  h.ready();
  await run.loaded;
  const turn = run.turn();
  await flush();
  h.workers[0].emit({ type: 'ready', turn: 1, move: 'right' });
  h.workers[0].emit({ type: 'move', turn: 0, move: 'right' });
  h.workers[1].emit({ type: 'move', turn: 1, move: 'left' });
  await flush();
  assert.equal(h.steps.length, 0);
  h.workers[0].emit({ type: 'move', turn: 1, move: { direction: 'right' } });
  await turn;
  assert.deepEqual(h.steps[0], { a: null, b: 'left' });
  assert.equal(h.workers[0].terminations, 0, 'invalid returns do not retire a worker');
  run.stop();
});

test('overlapping turn calls share one request batch and one engine step', async () => {
  const h = harness(), run = h.start();
  h.ready();
  await run.loaded;
  const first = run.turn(), second = run.turn();
  assert.equal(first, second);
  await flush();
  assert.equal(h.workers[0].sent.filter(message => message.type === 'move').length, 1);
  assert.equal(h.workers[1].sent.filter(message => message.type === 'move').length, 1);
  h.workers[0].emit({ type: 'move', turn: 1, move: 'right' });
  h.workers[1].emit({ type: 'move', turn: 1, move: 'left' });
  await Promise.all([first, second]);
  assert.equal(h.steps.length, 1);
  run.stop();
});

test('finished matches neither query workers nor step the engine', async () => {
  const h = harness(), run = h.start();
  h.ready();
  await run.loaded;
  h.finish();
  assert.deepEqual(await run.turn(), []);
  assert.equal(h.steps.length, 0);
  assert.ok(h.workers.every(worker => worker.sent.length === 1));
  run.stop();
});

test('stop settles initialization and clears all startup timers', async () => {
  const h = harness(), run = h.start();
  run.stop();
  run.stop();
  await run.loaded;
  assert.equal(h.timers.size, 0);
  assert.ok(h.workers.every(worker => worker.terminations === 1));
  assert.deepEqual(await run.turn(), []);
  assert.equal(h.steps.length, 0);
  assert.ok(h.game.snakes.every(snake => snake.alive),
    'cancellation is not a startup disqualification');
});

test('stop settles pending moves without advancing the match', async () => {
  const h = harness(), run = h.start();
  h.ready();
  await run.loaded;
  const turn = run.turn();
  await flush();
  run.stop();
  assert.deepEqual(await turn, []);
  assert.equal(h.steps.length, 0);
  assert.equal(h.timers.size, 0);
  assert.ok(h.workers.every(worker => worker.terminations === 1));
});

test('entry validation happens before constructing workers', () => {
  const h = harness();
  for (const entries of [
    [],
    [{ id: 'a' }],
    [{ id: 'a' }, { id: 'a' }],
    [{ id: '../a' }, { id: 'b' }],
    [{ id: 'https://example.test/a' }, { id: 'b' }],
    [{ id: 'a' }, { id: 'player-1', human: true }],
    Array.from({ length: 13 }, (_, i) => ({ id: `bot-${i}` })),
  ]) {
    assert.throws(() => h.start(entries));
  }
  assert.equal(h.workers.length, 0);
});

test('human seats get no worker and commit their direction once per turn', async () => {
  const h = harness();
  const resets = [];
  const input = {
    dir: 'right',
    reset(direction) { this.dir = direction; resets.push(direction); },
  };
  const run = h.start([
    { id: 'a', human: true, input },
    { id: 'b' },
  ]);
  assert.equal(h.workers.length, 1);
  h.ready();
  await run.loaded;
  input.dir = 'down';
  const turn = run.turn();
  await flush();
  h.workers[0].emit({ type: 'move', turn: 1, move: 'left' });
  await turn;
  assert.deepEqual(h.steps[0], { a: 'down', b: 'left' });
  assert.deepEqual(resets, ['right', 'down']);
  run.stop();
});
