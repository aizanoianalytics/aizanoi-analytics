import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ARENAS = ['chess', 'snake-royale', 'maze-chase', 'capture-flag', 'holdem', 'football', 'anatolian-pact'];
const frontend = new URL('../frontend/', import.meta.url);
const read = relative => readFile(new URL(relative, frontend), 'utf8');
const sharedSource = await read('arcade/shared/custom-bot.js');

test('shared custom bot API does not compile strings in page code', () => {
  assert.match(sharedSource, /window\.ArenaCustomBot\s*=/);
  for (const method of ['pick', 'get', 'forget', 'createWorker']) {
    assert.match(sharedSource, new RegExp(`\\bfunction\\s+${method}\\s*\\(`));
  }
  assert.match(sharedSource, /arena-custom-file/);
  assert.match(sharedSource, /256\s*\*\s*1024/);
  assert.match(sharedSource, /createObjectURL/);
  assert.match(sharedSource, /revokeObjectURL/);
  assert.doesNotMatch(sharedSource, /\beval\s*(?:\?\.)?\s*\(/);
  assert.doesNotMatch(sharedSource, /\bnew\s+Function\b/);
  assert.doesNotMatch(sharedSource, /\bFunction\s*\(/);
  assert.doesNotMatch(sharedSource, /\bset(?:Timeout|Interval)\s*\(\s*['"`]/);
});

for (const arena of ARENAS) {
  test(`${arena}: inline integration preserves the regular worker import contract`, async () => {
    const [worker, runner, page, game] = await Promise.all([
      read(`arcade/${arena}/bot-worker.js`),
      read(`arcade/${arena}/runner.js`),
      read(`arcade/${arena}/index.html`),
      read(`arcade/${arena}/game.js`)
    ]);

    assert.match(worker, /if\s*\(!self\.__ARENA_INLINE__\)/);
    assert.match(worker, /if\s*\(self\.__ARENA_INLINE__\)/);
    assert.match(worker, /self\.__ARENA_BOT__/);
    assert.match(worker, /self\.__ARENA_LOAD_ERROR__/);
    assert.ok(worker.includes("importScripts('engine.js')"));
    assert.ok(worker.includes('/^[a-z0-9][a-z0-9.-]*$/'));
    assert.ok(worker.includes("id.includes('..')"));
    assert.ok(worker.includes('importScripts(`bots/${id}.js`)'));
    assert.ok(worker.indexOf("id.includes('..')") <
      worker.indexOf('importScripts(`bots/${id}.js`)'));
    assert.match(runner, /entry\.custom/);
    assert.match(runner, /ArenaCustomBot\.createWorker/);
    assert.match(runner, /workerUrl:/);
    assert.match(runner, /scripts:/);
    assert.match(runner, /\.terminate\(\)/); // any worker handle name; behaviour is covered by the chess late-worker test
    assert.match(page, /<option\s+value="custom">Your bot \(upload…\)<\/option>/);
    assert.match(game, /ArenaCustomBot\.pick\(\{\s*game:/);
    assert.match(game, /lab:\s*'You'/);
    assert.match(page, /href="BOT_API\.md"/);
    assert.ok(page.indexOf('src="/arcade/shared/custom-bot.js"') <
      page.indexOf('src="runner.js"'));
    assert.ok(page.includes('src="/arcade/shared/custom-bot.js"'));
    assert.doesNotMatch(page, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i);

    const scripts = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      .filter(([, attributes]) => !/application\/ld\+json/.test(attributes));
    for (const [, attributes, body] of scripts) {
      assert.match(attributes, /\bsrc\s*=/);
      assert.equal(body.trim(), '');
    }
  });
}

/*
 * Exercise the actual source builder, not a hand-maintained approximation.
 * The fake Worker captures its single Blob; that exact source then runs in vm.
 */
async function sharedHarness() {
  const blobs = new Map();
  const workers = [];
  const fetched = [];
  const revoked = [];
  let nextBlob = 0;

  class FakeURL extends URL {
    static createObjectURL(blob) {
      const address = `blob:https://arena.test/${++nextBlob}`;
      blobs.set(address, blob);
      return address;
    }

    static revokeObjectURL(address) {
      revoked.push(address);
      // Preserve a test-only reference for inspecting the browser's source.
    }
  }

  class FakeWorker {
    constructor(address) {
      this.address = address;
      this.blob = blobs.get(address);
      this.terminated = false;
      workers.push(this);
    }

    terminate() {
      this.terminated = true;
    }
  }

  const sandbox = {
    window: { location: { origin: 'https://arena.test' } },
    document: { baseURI: 'https://arena.test/arcade/chess/' },
    URL: FakeURL,
    Worker: FakeWorker,
    Blob,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    async fetch(address, options) {
      fetched.push({ address, options });
      const location = new URL(address);
      assert.equal(location.origin, 'https://arena.test');
      const body = await read(location.pathname.slice(1));
      return { ok: true, status: 200, text: async () => body };
    }
  };
  vm.runInNewContext(sharedSource, sandbox, { filename: 'custom-bot.js' });

  return {
    api: sandbox.window.ArenaCustomBot,
    workers,
    fetched,
    revoked
  };
}

async function inlineChess(code) {
  const harness = await sharedHarness();
  const worker = await harness.api.createWorker({
    game: 'chess',
    workerUrl: '/arcade/chess/bot-worker.js',
    scripts: ['/arcade/chess/engine.js'],
    code
  });
  assert.equal(harness.workers.length, 1);
  assert.equal(harness.revoked[0], worker.address);
  assert.deepEqual(harness.fetched.map(entry => entry.address), [
    'https://arena.test/arcade/chess/engine.js',
    'https://arena.test/arcade/chess/bot-worker.js'
  ]);
  for (const entry of harness.fetched) {
    assert.equal(entry.options.credentials, 'same-origin');
    assert.equal(entry.options.redirect, 'error');
  }

  const messages = [];
  const sandbox = {
    postMessage(message) {
      messages.push(message);
    },
    importScripts() {
      assert.fail('Inline workers must not import scripts');
    }
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  const source = await worker.blob.text();
  vm.runInContext(source, context, {
    filename: 'chess-custom-worker.js',
    timeout: 1000
  });
  return { context, messages, source };
}

test('chess: actual concatenated inline worker answers legal moves for supported exports', async () => {
  const bots = [
    'module.exports = state => state.legalMoves[0];',
    'exports.move = state => state.legalMoves[0];',
    'function move(state) { return state.legalMoves[0]; }'
  ];

  for (const code of bots) {
    const { context, messages } = await inlineChess(code);
    context.onmessage({ data: { type: 'init', seed: 42 } });
    assert.equal(messages[0].type, 'ready', code);

    const game = context.ChessEngine.create();
    const state = game.botState();
    const expected = state.legalMoves[0];
    context.onmessage({ data: { type: 'move', state } });
    assert.equal(messages[1].type, 'move');
    assert.equal(messages[1].ply, state.ply);
    assert.equal(messages[1].move, expected);
    assert.equal(messages[1].detail, undefined);
    assert.equal(game.move(messages[1].move).ok, true);
  }
});

test('chess: inline load exceptions and missing entry points produce normal failures', async () => {
  for (const [code, expected] of [
    ["throw new Error('upload exploded');", /upload exploded/],
    ['module.exports = {};', /does not export move/]
  ]) {
    const { context, messages } = await inlineChess(code);
    context.onmessage({ data: { type: 'init', seed: 42 } });
    assert.equal(messages[0].type, 'fail');
    assert.match(messages[0].detail, expected);
  }
});

test('chess: seeded randomness is available inside the inline move function', async () => {
  const code = `
    module.exports = state => {
      return state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];
    };
  `;
  const first = await inlineChess(code);
  const second = await inlineChess(code);
  for (const instance of [first, second]) {
    instance.context.onmessage({ data: { type: 'init', seed: 12345 } });
    const game = instance.context.ChessEngine.create();
    instance.context.onmessage({
      data: { type: 'move', state: game.botState() }
    });
  }
  assert.equal(first.messages[1].move, second.messages[1].move);
});

test('chess: regular worker imports and identifier validation remain unchanged', async () => {
  const source = await read('arcade/chess/bot-worker.js');

  function boot(id) {
    const imports = [];
    const messages = [];
    const sandbox = {
      ChessEngine: { rng: () => () => 0.25 },
      Math: Object.create(Math),
      postMessage: message => messages.push(message),
      importScripts(location) {
        imports.push(location);
        if (location.startsWith('bots/')) {
          sandbox.module.exports = state => state.legalMoves[0];
        }
      }
    };
    sandbox.self = sandbox;
    vm.runInNewContext(source, sandbox);
    sandbox.onmessage({ data: { type: 'init', id, seed: 7 } });
    return { imports, messages, sandbox };
  }

  for (const id of [
    '../escape', 'a..b', '/absolute', 'https://example.com/bot',
    'Uppercase', 'a/b', 'a\\b', 'a?b', '', '.hidden'
  ]) {
    const result = boot(id);
    assert.deepEqual(result.imports, ['engine.js']);
    assert.equal(result.messages[0].type, 'fail');
  }

  const regular = boot('sample-random');
  assert.deepEqual(regular.imports, ['engine.js', 'bots/sample-random.js']);
  assert.equal(regular.messages[0].type, 'ready');
  regular.sandbox.onmessage({
    data: { type: 'move', state: { ply: 3, legalMoves: ['e2e4'] } }
  });
  assert.equal(regular.messages[1].move, 'e2e4');
});

test('shared builder rejects foreign scripts and oversized direct code', async () => {
  const { api, workers, fetched } = await sharedHarness();
  const base = {
    game: 'chess',
    workerUrl: '/arcade/chess/bot-worker.js',
    scripts: ['/arcade/chess/engine.js'],
    code: 'module.exports = state => state.legalMoves[0];'
  };

  await assert.rejects(api.createWorker({
    ...base, workerUrl: 'https://other.test/bot-worker.js'
  }), /same-origin/);
  await assert.rejects(api.createWorker({
    ...base, scripts: ['https://other.test/engine.js']
  }), /same-origin/);
  await assert.rejects(api.createWorker({
    ...base, code: 'x'.repeat(256 * 1024 + 1)
  }), /256 KB/);
  assert.equal(workers.length, 0);
  assert.equal(fetched.length, 0);
});

test('shared picker rejects oversized files, supports cancellation and forgets uploads', async () => {
  let picker;
  class FakeInput extends EventTarget {
    constructor() {
      super();
      this.files = [];
      this.value = '';
    }

    setAttribute() {}
    click() {}
  }

  const sandbox = {
    window: {},
    document: {
      createElement(tag) {
        assert.equal(tag, 'input');
        picker = new FakeInput();
        return picker;
      },
      body: { append() {} }
    },
    TextEncoder
  };
  vm.runInNewContext(sharedSource, sandbox);
  const api = sandbox.window.ArenaCustomBot;

  const oversized = api.pick({ game: 'chess' });
  const rejected = assert.rejects(oversized, /256 KB/);
  assert.equal(picker.id, 'arena-custom-file');
  assert.equal(picker.hidden, true);
  picker.files = [{
    name: 'large.js',
    size: 256 * 1024 + 1,
    text: async () => assert.fail('Oversized files must not be read')
  }];
  picker.dispatchEvent(new Event('change'));
  await rejected;
  assert.equal(api.get('chess'), null);

  const cancelled = api.pick({ game: 'chess' });
  picker.dispatchEvent(new Event('cancel'));
  assert.equal(await cancelled, null);

  const code = 'function move(state) { return state.legalMoves[0]; }';
  const chosen = api.pick({ game: 'chess' });
  picker.files = [{
    name: 'mine.js',
    size: Buffer.byteLength(code),
    text: async () => code
  }];
  picker.dispatchEvent(new Event('change'));
  const result = await chosen;
  assert.equal(result.name, 'mine.js');
  assert.equal(result.code, code);
  assert.equal(result.bytes, Buffer.byteLength(code));
  assert.equal(api.get('chess'), result);
  assert.equal(api.get('maze-chase'), null);
  api.forget('chess');
  assert.equal(api.get('chess'), null);
});

test('chess: stopping during async custom creation terminates the late worker', async () => {
  const [runnerSource, engineSource] = await Promise.all([
    read('arcade/chess/runner.js'),
    read('arcade/chess/engine.js')
  ]);
  let deliverWorker;
  const sandbox = {
    window: {},
    ArenaCustomBot: {
      createWorker: () => new Promise(resolve => { deliverWorker = resolve; })
    },
    setTimeout,
    clearTimeout,
    performance
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(engineSource, sandbox);
  vm.runInContext(runnerSource, sandbox);

  const runner = sandbox.window.ChessRunner.start({
    white: { custom: { name: 'mine.js', code: '' } },
    black: { human: true },
    seed: 7
  });
  runner.stop();
  await runner.loaded;
  let terminated = false;
  deliverWorker({ terminate() { terminated = true; } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(terminated, true);
  const result = await runner.next();
  assert.equal(result.type, 'stopped');
});
