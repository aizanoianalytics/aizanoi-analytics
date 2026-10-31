import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base = new URL('../frontend/arcade/anatolian-pact/', import.meta.url);
const src = file => fs.readFileSync(new URL(file, base), 'utf8');
const globals = {};
function loadUmd(file, PactEngine) {
  const module = { exports: {} };
  new vm.Script(`(function(module,exports,globalThis,PactEngine,PactMapData) {
${src(file)}
})`, { filename: file }).runInThisContext()(
    module, module.exports, globals, PactEngine, globals.PactMapData
  );
  return module.exports;
}
globals.PactMapData = loadUmd('map-data.js');
const engine = loadUmd('engine.js');
const manifest = JSON.parse(src('bots.json'));

function files(dir = base) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    return entry.isDirectory() ? files(url) : [url];
  });
}
test('module has no dynamic compilation or prohibited product name', () => {
  for (const url of files()) {
    if (!/\.(?:js|json|html|css|md)$/.test(url.pathname)) continue;
    const text = fs.readFileSync(url, 'utf8');
    assert.doesNotMatch(text, /\beval\s*\(|\bnew\s+Function\s*\(/, url.pathname);
    assert.equal(text.toLowerCase().includes('diplo' + 'macy'), false, url.pathname);
  }
});
test('HTML loads generated data before engine and has only external executable scripts', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i);
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];
  const executable = [];
  let jsonLd = 0;
  for (const [, attributes, body] of scripts) {
    if (/\btype=["']application\/ld\+json["']/i.test(attributes)) {
      jsonLd++;
      assert.ok(head.includes(body));
      assert.equal(JSON.parse(body)['@type'], 'WebPage');
    } else {
      const match = attributes.match(/\bsrc=["']([^"']+)["']/);
      assert.ok(match);
      executable.push(match[1]);
      assert.equal(body.trim(), '');
    }
  }
  assert.equal(jsonLd, 1);
  // Preserve the original game-script order with the required shared dependency
  // inserted immediately before runner.js.
  assert.deepEqual(executable, [
    'map-data.js',
    'engine.js',
    '/arcade/shared/custom-bot.js',
    'runner.js',
    'map.js',
    'game.js'
  ]);
  assert.match(html, /https:\/\/aizanoianalytics\.com\/arcade\/anatolian-pact\//);
  assert.match(html, /armies cannot cross the straits/i);
});
test('generated data and engine load in the same realm without require', () => {
  assert.ok(engine.MAP.powers.length === 6);
  assert.deepEqual(engine.MAP.rows, globals.PactMapData.rows);
  const context = vm.createContext({});
  new vm.Script(src('map-data.js')).runInContext(context);
  new vm.Script(src('engine.js')).runInContext(context);
  assert.equal(context.PactEngine.MAP.rows.length, context.PactMapData.rows.length);
  assert.throws(() => {
    new vm.Script(src('engine.js')).runInContext(vm.createContext({}));
  }, /map-data\.js/);
});
test('manifest IDs, paths and exact byte counts', () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.bots.filter(bot => bot.id.startsWith('sample-')).length, 3);
  const seen = new Set();
  for (const bot of manifest.bots) {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.ok(!bot.id.includes('..'));
    assert.ok(!seen.has(bot.id));
    seen.add(bot.id);
    assert.equal(bot.file, `bots/${bot.id}.js`);
    // AI-model entries (aiwar-*) carry their own lab and note
    if (bot.id.startsWith('sample-')) {
      assert.equal(bot.lab, 'Aizanoi sample');
      assert.ok(bot.note.includes('not an AI-model entry'));
    }
    const file = new URL(bot.file, base);
    assert.ok(fs.existsSync(file), `Missing companion bot: ${bot.file}`);
    assert.equal(bot.bytes, fs.statSync(file).size,
      `Update measured bytes for ${bot.id}; zero is only an integration placeholder.`);
  }
});

function workerProbe(id) {
  const imports = [], replies = [];
  const context = vm.createContext({
    Math: Object.create(Math),
    importScripts: (...names) => {
      for (const file of names) {
        imports.push(file);
        if (file.startsWith('bots/')) context.module.exports = { orders: () => [] };
        else new vm.Script(src(file), { filename: file }).runInContext(context);
      }
    },
    postMessage: message => replies.push(message)
  });
  context.self = context;
  new vm.Script(src('bot-worker.js'), { filename: 'bot-worker.js' }).runInContext(context);
  context.onmessage({ data: { type: 'init', id, seed: 7 } });
  return { imports, replies, context };
}
test('worker imports data before engine and validates IDs before constructing bot paths', () => {
  for (const id of ['../escape', 'a..b', '/remote', 'https://example.test/x', 'A', 'a/b', 'a?b', '']) {
    const probe = workerProbe(id);
    assert.deepEqual(probe.imports, ['map-data.js', 'engine.js']);
    assert.equal(probe.replies[0].type, 'fail');
  }
  const probe = workerProbe('sample-turtle');
  assert.deepEqual(probe.imports, ['map-data.js', 'engine.js', 'bots/sample-turtle.js']);
  assert.equal(probe.replies[0].type, 'ready');
  probe.context.onmessage({ data: { type: 'call', call: 'orders', key: 4, state: {} } });
  assert.equal(probe.replies[1].type, 'answer');
  assert.equal(probe.replies[1].call, 'orders');
  assert.equal(probe.replies[1].key, 4);
  probe.context.onmessage({ data: { type: 'call', call: 'constructor', key: 5, state: {} } });
  assert.equal(probe.replies.length, 2);
});

function fakeEngine() {
  let steps = 0;
  const submitted = [];
  const first = engine.MAP.powers[0], second = engine.MAP.powers[1];
  const game = {
    phase: 'orders', year: 1, season: 'Spring',
    units: () => [
      { power: first.id, type: 'army', at: first.homes[0] },
      { power: second.id, type: 'army', at: second.homes[0] }
    ],
    owners: () => ({ [first.homes[0]]: first.id, [second.homes[0]]: second.id }),
    botState: power => ({ phase: 'orders', you: power }),
    submitOrders: (power, orders) => { submitted.push([power, orders]); return { ok: true }; },
    advance: () => { steps++; return { events: [], resolution: [] }; },
    finished: () => false
  };
  return { create: () => game, submitted, steps: () => steps };
}
test('runner posts IDs, gates humans, shares concurrent next and cleans up', async () => {
  const original = globalThis.Worker, messages = [], created = [];
  class WorkerDouble {
    constructor(path) {
      assert.equal(path, '/arcade/anatolian-pact/bot-worker.js');
      this.terminated = false;
      created.push(this);
    }
    postMessage(message) {
      messages.push(message);
      assert.ok(!Object.hasOwn(message, 'url'));
      queueMicrotask(() => this.onmessage?.({
        data: message.type === 'init' ? { type: 'ready' } :
          { type: 'answer', call: message.call, key: message.key, payload: [] }
      }));
    }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = WorkerDouble;
  let runner;
  try {
    const fake = fakeEngine();
    const api = loadUmd('runner.js', fake);
    const human = engine.MAP.powers[0].id, bot = engine.MAP.powers[1].id;
    runner = api.start({
      [human]: { human: true },
      [bot]: { id: 'sample-turtle', name: 'Turtle' }
    }, { seed: 5 });
    await runner.loaded;
    const next = runner.next();
    assert.equal(runner.next(), next);
    assert.deepEqual(runner.waitingFor(), [human]);
    assert.equal(runner.submitHuman(human, null).ok, false);
    assert.equal(fake.steps(), 0);
    assert.equal(runner.submitHuman(human, []).ok, true);
    assert.equal(runner.submitHuman(human, []).ok, false);
    await next;
    assert.equal(fake.steps(), 1);
    assert.equal(fake.submitted.length, 2);
    assert.deepEqual(Object.keys(messages[0]).sort(), ['id', 'seed', 'type']);
    const waiting = runner.next();
    runner.stop();
    await waiting;
    assert.equal(fake.steps(), 1);
    assert.deepEqual(runner.waitingFor(), []);
    assert.ok(created.every(w => w.terminated));
  } finally {
    runner?.stop();
    globalThis.Worker = original;
  }
});
