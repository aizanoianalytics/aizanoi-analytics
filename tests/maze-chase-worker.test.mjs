import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = file => fs.readFileSync(
  new URL('../frontend/arcade/maze-chase/' + file, import.meta.url), 'utf8'
);

const engineModule = { exports: {} };
new vm.Script(`(function(module, exports) {\n${source('engine.js')}\n})`, {
  filename: 'engine.js'
}).runInThisContext()(engineModule, engineModule.exports);
const Engine = engineModule.exports;

function worker(botSource) {
  const replies = [];
  const imports = [];
  const self = {};
  const math = Object.create(Math);
  const importScripts = file => {
    imports.push(file);
    if (file === 'engine.js') return;
    new vm.Script(`(function(module, exports, MazeEngine, Math) {\n${botSource}\n})`, {
      filename: file
    }).runInThisContext()(self.module, self.exports, Engine, math);
  };
  new vm.Script(
    `(function(self, importScripts, MazeEngine, Math, postMessage, structuredClone) {\n` +
    source('bot-worker.js') + '\n})',
    { filename: 'bot-worker.js' }
  ).runInThisContext()(
    self, importScripts, Engine, math, reply => replies.push(reply), structuredClone
  );
  return {
    send(data) { self.onmessage({ data }); },
    replies,
    imports
  };
}

test('bot mutation cannot corrupt the response tick or caller state', () => {
  const w = worker(`
    module.exports = function(state) {
      state.tick = -500;
      state.you.x = -1;
      return 'left';
    };
  `);
  w.send({ type: 'init', id: 'example', seed: 10 });
  const state = { tick: 9, you: { x: 4 } };
  w.send({ type: 'move', state });
  assert.deepEqual(w.replies, [
    { type: 'ready' },
    { type: 'move', tick: 9, move: 'left' }
  ]);
  assert.deepEqual(state, { tick: 9, you: { x: 4 } });
  assert.deepEqual(w.imports, ['engine.js', 'bots/example.js']);
});

test('object export methods retain their receiver', () => {
  const w = worker(`
    module.exports = {
      direction: 'right',
      move() { return this.direction; }
    };
  `);
  w.send({ type: 'init', id: 'object-bot', seed: 1 });
  w.send({ type: 'move', state: { tick: 0 } });
  assert.deepEqual(w.replies.at(-1), { type: 'move', tick: 0, move: 'right' });
});

test('invalid IDs never reach a bot import', () => {
  for (const id of ['../x', 'https://example.com/x', 'x..y', 'x/y', 'X']) {
    const w = worker('throw new Error("must not load");');
    w.send({ type: 'init', id, seed: 1 });
    assert.equal(w.replies[0].type, 'fail');
    assert.deepEqual(w.imports, ['engine.js']);
  }
});

test('exceptions and non-string results use null fallback without losing correlation', () => {
  for (const body of ['throw new Error("bad move");', 'return Promise.resolve("up");']) {
    const w = worker(`module.exports = function() { ${body} };`);
    w.send({ type: 'init', id: 'example', seed: 1 });
    w.send({ type: 'move', state: { tick: 17 } });
    assert.deepEqual(w.replies.at(-1), { type: 'move', tick: 17, move: null });
  }
});

test('same worker seed gives the same import-time and move-time random stream', () => {
  const code = `
    const first = Math.random();
    module.exports = function() {
      return first + Math.random() < 1 ? 'up' : 'down';
    };
  `;
  const run = () => {
    const w = worker(code);
    w.send({ type: 'init', id: 'example', seed: 1234 });
    for (let tick = 0; tick < 20; tick++) w.send({ type: 'move', state: { tick } });
    return w.replies;
  };
  assert.deepEqual(run(), run());
});
