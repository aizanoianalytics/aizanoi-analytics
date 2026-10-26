import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/arcade/snake-royale/runner.js', import.meta.url), 'utf8');

function harness() {
  const workers = [];
  class FakeWorker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  const game = {
    options: { seed: 1 }, snakes: [{ alive: true, id: 'a' }, { alive: true, id: 'b' }],
    botState: () => ({ turn: 1 }), step: () => [],
  };
  const context = { window: {}, Worker: FakeWorker, SnakeEngine: { create: () => game }, setTimeout, clearTimeout, Promise };
  vm.runInNewContext(source, context);
  return { start: context.window.SnakeRunner.start, workers };
}

test('stopping a match settles fighter startup even when workers never answer', async () => {
  const { start, workers } = harness();
  const run = start([{ id: 'a' }, { id: 'b' }], {});
  run.stop();
  await Promise.race([run.loaded, new Promise((_, reject) => { setTimeout(() => reject(new Error('startup did not settle')), 100); })]);
  assert.ok(workers.every(worker => worker.terminated));
});
