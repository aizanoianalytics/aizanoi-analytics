import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = file => fs.readFileSync(
  new URL('../frontend/arcade/holdem/' + file, import.meta.url), 'utf8'
);
const m = { exports: {} };
new vm.Script(`(function(module,exports){\n${source('engine.js')}\n})`, {
  filename: 'engine.js'
}).runInThisContext()(m, m.exports);
const E = m.exports;

function harness({ entropy = 12345, late = false } = {}) {
  const workers = [];
  let clock = 0;
  let entropyCalls = 0;
  class Worker {
    constructor(path) {
      assert.equal(path, '/arcade/holdem/bot-worker.js');
      this.messages = [];
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
      queueMicrotask(() => {
        if (this.terminated || !this.onmessage) return;
        if (message.type === 'init') {
          this.onmessage({ data: { type: 'ready' } });
        } else {
          if (late) clock += 1001;
          this.onmessage({
            data: {
              type: 'act', handNumber: message.handNumber,
              decisionId: message.decisionId,
              action: { type: message.state.canCheck ? 'check' : 'call' }
            }
          });
        }
      });
    }
    terminate() { this.terminated = true; }
  }
  const window = {};
  new vm.Script(
    `(function(window,PokerEngine,Worker,crypto,performance,setTimeout,clearTimeout){\n${source('runner.js')}\n})`,
    { filename: 'runner.js' }
  ).runInThisContext()(
    window, E, Worker,
    {
      getRandomValues(array) {
        entropyCalls++;
        array[0] = entropy;
        return array;
      }
    },
    { now: () => clock },
    setTimeout, clearTimeout
  );
  return {
    start: window.HoldemRunner.start,
    workers,
    entropyCalls: () => entropyCalls
  };
}

const seats = [
  { kind: 'bot', botId: 'sample-caller', name: 'A' },
  { kind: 'bot', botId: 'sample-caller', name: 'B' }
];

test('default worker random streams do not disclose or depend on deck seed', async () => {
  const first = harness({ entropy: 98765 });
  const second = harness({ entropy: 98765 });
  const a = first.start(seats, { seed: 1 });
  const b = second.start(seats, { seed: 999 });
  try {
    await Promise.all([a.loaded, b.loaded]);
    assert.equal(first.entropyCalls(), 1);
    assert.equal(second.entropyCalls(), 1);
    const seeds = h => h.workers.map(worker => worker.messages[0].seed);
    assert.deepEqual(seeds(first), seeds(second));
    assert.notEqual(seeds(first)[0], seeds(first)[1]);
    for (const worker of first.workers) {
      assert.deepEqual(Object.keys(worker.messages[0]).sort(), ['id', 'seed', 'type']);
    }
  } finally {
    a.stop();
    b.stop();
  }
});

test('explicit independent botSeed reproduces worker streams without entropy', async () => {
  const first = harness({ entropy: 1 });
  const second = harness({ entropy: 2 });
  const a = first.start(seats, { seed: 456, botSeed: 789 });
  const b = second.start(seats, { seed: 456, botSeed: 789 });
  try {
    await Promise.all([a.loaded, b.loaded]);
    assert.equal(first.entropyCalls(), 0);
    assert.equal(second.entropyCalls(), 0);
    assert.deepEqual(
      first.workers.map(worker => worker.messages[0]),
      second.workers.map(worker => worker.messages[0])
    );
    await a.next();
    await b.next();
    const actionA = await a.next();
    const actionB = await b.next();
    assert.deepEqual(actionA, actionB);
    assert.deepEqual(a.game.publicState(), b.game.publicState());
  } finally {
    a.stop();
    b.stop();
  }
});

test('elapsed deadline rejects a response even before the timer callback runs', async () => {
  const h = harness({ late: true });
  const run = h.start(seats, { seed: 123, botSeed: 456 });
  try {
    await run.loaded;
    await run.next();
    const id = run.game.toAct();
    const event = await run.next();
    assert.equal(event.type, 'action');
    assert.equal(event.id, id);
    assert.equal(event.error, true);
    assert.deepEqual(event.action, { type: 'fold' });
    assert.equal(run.errors[id], 1);
    assert.equal(h.workers[Number(id.slice(1)) - 1].terminated, true);
  } finally {
    run.stop();
  }
});

test('invalid botSeed rejects before any worker is created', () => {
  const h = harness();
  for (const botSeed of [-1, 0x100000000, 0.5, NaN, '1']) {
    assert.throws(() => h.start(seats, { botSeed }), /botSeed/);
  }
  assert.equal(h.workers.length, 0);
});
