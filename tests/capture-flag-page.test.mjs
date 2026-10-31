import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../frontend/arcade/capture-flag/', import.meta.url);
const src = file => fs.readFileSync(
  new URL('../frontend/arcade/capture-flag/' + file, import.meta.url),
  'utf8',
);

const loadUmd = (file, FlagEngine) => {
  const m = { exports: {} };
  new vm.Script(
    `(function (module, exports, FlagEngine) {\n${src(file)}\n})`,
    { filename: file },
  ).runInThisContext()(m, m.exports, FlagEngine);
  return m.exports;
};

const browserFiles = [
  'engine.js',
  'bot-worker.js',
  'runner.js',
  'renderer.js',
  'game.js',
];

test('browser scripts parse and avoid dynamic code execution', () => {
  for (const file of browserFiles) {
    const text = src(file);
    assert.doesNotThrow(() => new vm.Script(text, { filename: file }));
    assert.doesNotMatch(text, /\beval\s*\(/);
    assert.doesNotMatch(text, /\bnew\s+Function\b/);
    assert.doesNotMatch(text, /\bFunction\s*\(\s*['"`]/);
  }
});

test('HTML contains no inline executable scripts, styles, or handlers', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /javascript\s*:/i);

  let metadata = 0;
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];

  for (const [, attributes, body] of scripts) {
    if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attributes)) {
      assert.doesNotMatch(attributes, /\bsrc\s*=/i);
      const data = JSON.parse(body);
      assert.equal(data['@context'], 'https://schema.org');
      assert.equal(data.url, 'https://aizanoianalytics.com/arcade/capture-flag/');
      metadata++;
    } else {
      assert.match(attributes, /\bsrc\s*=\s*["'][^"']+["']/i);
      assert.equal(body.trim(), '');
    }
  }

  assert.equal(metadata, 1);
  assert.equal(scripts.length, 7);
  assert.match(
    html,
    /<link\s+rel="canonical"\s+href="https:\/\/aizanoianalytics\.com\/arcade\/capture-flag\/">/,
  );

  const sources = scripts
    .filter(([, attributes]) => /\bsrc\s*=/.test(attributes))
    .map(([, attributes]) => attributes.match(/\bsrc=["']([^"']+)["']/)[1]);

  assert.deepEqual(sources, [
    '/arcade/shared/arena-input.js',
    'engine.js',
    '/arcade/shared/custom-bot.js',
    'runner.js',
    'renderer.js',
    'game.js',
  ]);
});

test('worker validates ids before constructing a local bot path', () => {
  const text = src('bot-worker.js');
  assert.match(text, /importScripts\('engine\.js'\)/);
  assert.ok(text.includes('/^[a-z0-9][a-z0-9.-]*$/.test(id)'));
  assert.ok(text.includes('id.includes(\'..\')'));
  assert.ok(text.includes('importScripts(`bots/${id}.js`)'));
  assert.ok(text.indexOf('.test(id)') < text.indexOf('importScripts(`bots/'));
  assert.doesNotMatch(text, /importScripts\s*\(\s*(?:message|m)\./);
  assert.match(text, /Math\.random\s*=\s*FlagEngine\.rng/);
  assert.match(text, /const tick = message\.state\.tick/);
  assert.match(text, /type:\s*'move',\s*tick,/);
});

test('worker rejects invalid ids and emits seeded tick-addressed moves', () => {
  function boot() {
    const messages = [];
    const imports = [];
    const engine = { rng: seed => () => (seed >>> 0) / 4294967296 };
    const scope = {};
    const math = Object.create(Math);

    const importScripts = file => {
      imports.push(file);
      if (file.startsWith('bots/')) {
        scope.module.exports = state => state.tick === 7 ? 'right' : 'stay';
      }
    };

    new vm.Script(
      `(function (self, importScripts, postMessage, FlagEngine, Math) {\n` +
      `${src('bot-worker.js')}\n})`,
      { filename: 'bot-worker.js' },
    ).runInThisContext()(
      scope,
      importScripts,
      message => messages.push(message),
      engine,
      math,
    );

    return { scope, imports, messages, math };
  }

  for (const id of ['../escape', 'sample..bot', '/sample', 'https://bad.test/a', 'UPPER']) {
    const worker = boot();
    worker.scope.onmessage({ data: { type: 'init', id, seed: 10 } });
    assert.deepEqual(worker.imports, ['engine.js']);
    assert.equal(worker.messages[0].type, 'fail');
  }

  const worker = boot();
  worker.scope.onmessage({
    data: { type: 'init', id: 'sample-squad', seed: 10 },
  });
  assert.deepEqual(worker.imports, ['engine.js', 'bots/sample-squad.js']);
  assert.equal(worker.messages[0].type, 'ready');

  worker.scope.onmessage({
    data: { type: 'move', state: { tick: 7 } },
  });
  assert.deepEqual(worker.messages[1], {
    type: 'move',
    tick: 7,
    move: 'right',
  });

  const sameSeed = boot();
  sameSeed.scope.onmessage({
    data: { type: 'init', id: 'sample-squad', seed: 10 },
  });
  assert.equal(worker.math.random(), sameSeed.math.random());
});

test('runner posts bot ids, never script URLs', () => {
  const text = src('runner.js');
  assert.match(text, /new Worker\('\/arcade\/capture-flag\/bot-worker\.js'\)/);
  assert.match(text, /type:\s*'init',\s*id:\s*seat\.botId,\s*seed/);
  assert.doesNotMatch(text, /\burl\s*:/i);
  assert.doesNotMatch(text, /\b(?:seat|entry)\.file\b/);
  assert.match(text, /const TIMEOUT_MS = 150;/);
});

function runnerHarness() {
  const listeners = new Map();
  const instances = [];
  let tick = 0;
  const history = [];

  const win = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };

  function dispatch(type, event = {}) {
    for (const listener of listeners.get(type) || []) listener(event);
  }

  const game = {
    get tick() {
      return tick;
    },
    finished() {
      return false;
    },
    agents() {
      return [
        { id: 'w1', jailed: false, respawnIn: 0 },
        { id: 'e1', jailed: false, respawnIn: 0 },
      ];
    },
    botState(id) {
      return { tick, you: { id } };
    },
    step(moves) {
      history.push({ ...moves });
      tick++;
      return [];
    },
  };

  class Worker {
    constructor(path) {
      this.path = path;
      this.messages = [];
      this.terminated = false;
      instances.push(this);
    }

    postMessage(message) {
      this.messages.push(message);
      queueMicrotask(() => {
        if (this.terminated || !this.onmessage) return;
        this.onmessage({
          data: message.type === 'init'
            ? { type: 'ready' }
            : { type: 'move', tick: message.state.tick, move: 'left' },
        });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  new vm.Script(
    `(function (window, FlagEngine, Worker) {\n${src('runner.js')}\n})`,
    { filename: 'runner.js' },
  ).runInThisContext()(win, { create: () => game }, Worker);

  return { win, game, instances, history, listeners, dispatch };
}

test('every bot seat gets an independent worker, including repeated bot ids', async () => {
  const harness = runnerHarness();
  const run = harness.win.FlagRunner.start([
    { id: 'w1', team: 'west', name: 'Squad', botId: 'sample-squad' },
    { id: 'e1', team: 'east', name: 'Squad', botId: 'sample-squad' },
  ], { seed: 123 });

  try {
    await run.loaded;
    assert.equal(harness.instances.length, 2);
    assert.notEqual(harness.instances[0], harness.instances[1]);

    for (const worker of harness.instances) {
      assert.equal(worker.path, '/arcade/capture-flag/bot-worker.js');
      assert.deepEqual(Object.keys(worker.messages[0]).sort(), ['id', 'seed', 'type']);
      assert.equal(worker.messages[0].id, 'sample-squad');
    }

    await Promise.all([run.turn(), run.turn()]);
    assert.equal(harness.game.tick, 1);
    assert.deepEqual(harness.history[0], { w1: 'left', e1: 'left' });
  } finally {
    run.stop();
  }

  assert.ok(harness.instances.every(worker => worker.terminated));
});

test('humans stay idle, move while held, stop on release, and reverse freely', async () => {
  const harness = runnerHarness();
  let callback;
  let destroyed = false;
  let unsubscribed = false;

  const input = {
    dir: 'up',
    reset(direction) {
      this.dir = direction;
    },
    onKey(fn) {
      callback = fn;
      return () => {
        unsubscribed = true;
      };
    },
    destroy() {
      destroyed = true;
    },
  };

  const run = harness.win.FlagRunner.start([
    { id: 'w1', team: 'west', name: 'Player 1', human: true, input },
  ]);

  try {
    await run.turn();
    assert.equal(harness.history[0].w1, 'stay');

    callback('right', { code: 'KeyD' });
    await run.turn();
    await run.turn();
    assert.equal(harness.history[1].w1, 'right');
    assert.equal(harness.history[2].w1, 'right');

    harness.dispatch('keyup', { code: 'KeyD' });
    await run.turn();
    assert.equal(harness.history[3].w1, 'stay');

    callback('left', { code: 'KeyA' });
    await run.turn();
    assert.equal(harness.history[4].w1, 'left');

    harness.dispatch('blur');
    await run.turn();
    assert.equal(harness.history[5].w1, 'stay');
  } finally {
    run.stop();
  }

  assert.equal(destroyed, true);
  assert.equal(unsubscribed, true);
  assert.ok([...harness.listeners.values()].every(set => set.size === 0));
});

test('manifest ids are safe, unique, and resolve to actual sample bot files', () => {
  const manifest = JSON.parse(src('bots.json'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.bots.filter(bot => bot.id.startsWith('sample-')).length, 3);

  const ids = new Set();

  for (const bot of manifest.bots) {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.equal(bot.id.includes('..'), false);
    assert.equal(ids.has(bot.id), false);
    ids.add(bot.id);

    assert.equal(bot.file, `bots/${bot.id}.js`);
    assert.ok(fs.statSync(new URL(bot.file, root)).isFile());
    assert.equal(bot.bytes, fs.statSync(new URL(bot.file, root)).size, `${bot.id} bytes`);
    if (bot.id.startsWith('sample-')) assert.equal(bot.lab, 'Aizanoi sample'); // AI-model entries join later
    if (bot.id.startsWith('sample-')) assert.match(bot.note, /not an AI-model entry/);
    assert.match(bot.color, /^#[a-f0-9]{6}$/i);

    const text = src(bot.file);
    assert.doesNotMatch(text, /\beval\s*\(|\bnew\s+Function\b/);
  }
});

test('sample bot exports load with the browser engine in the same realm', () => {
  const FlagEngine = loadUmd('engine.js');
  assert.equal(typeof FlagEngine.create, 'function');
  assert.equal(typeof FlagEngine.rng, 'function');

  const manifest = JSON.parse(src('bots.json'));
  for (const bot of manifest.bots) {
    const exported = loadUmd(bot.file, FlagEngine);
    const move = typeof exported === 'function' ? exported : exported.move;
    assert.equal(typeof move, 'function', bot.id);
  }
});
