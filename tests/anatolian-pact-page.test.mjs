import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base = new URL('../frontend/arcade/anatolian-pact/', import.meta.url);
const src = file => fs.readFileSync(
  new URL('../frontend/arcade/anatolian-pact/' + file, import.meta.url),
  'utf8'
);
const loadUmd = (file, PactEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, PactEngine) {\n${src(file)}\n})`, {
    filename: file
  }).runInThisContext()(m, m.exports, PactEngine);
  return m.exports;
};
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

test('HTML has only external executable scripts and head JSON-LD', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i);
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 5);
  for (const [, attributes, body] of scripts) {
    if (/\btype=["']application\/ld\+json["']/i.test(attributes)) {
      assert.ok(head.includes(body));
      assert.equal(JSON.parse(body)['@type'], 'WebPage');
    } else {
      assert.match(attributes, /\bsrc=["'](?:engine|runner|map|game)\.js["']/);
      assert.equal(body.trim(), '');
    }
  }
  assert.match(html, /https:\/\/aizanoianalytics\.com\/arcade\/anatolian-pact\//);
});

test('manifest IDs, paths and exact byte counts', () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.bots.length, 3);
  const seen = new Set();
  for (const bot of manifest.bots) {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.ok(!bot.id.includes('..'));
    assert.ok(!seen.has(bot.id));
    seen.add(bot.id);
    assert.equal(bot.file, `bots/${bot.id}.js`);
    assert.equal(bot.lab, 'Aizanoi sample');
    assert.ok(bot.note.includes('not an AI-model entry'));
    const file = new URL(bot.file, base);
    assert.ok(fs.existsSync(file), `Missing companion bot: ${bot.file}`);
    assert.equal(
      bot.bytes,
      fs.statSync(file).size,
      `Update measured bytes for ${bot.id}; zero is only an integration placeholder.`
    );
  }
});

function workerProbe(id) {
  const imports = [];
  const replies = [];
  const context = vm.createContext({
    Math: Object.create(Math),
    PactEngine: { rng: () => () => 0.5 },
    importScripts: file => {
      imports.push(file);
      if (file.startsWith('bots/')) context.module.exports = { orders: () => [] };
    },
    postMessage: message => replies.push(message)
  });
  context.self = context;
  new vm.Script(src('bot-worker.js'), {
    filename: 'bot-worker.js'
  }).runInContext(context);
  context.onmessage({ data: { type: 'init', id, seed: 7 } });
  return { imports, replies, context };
}

test('worker validates IDs before constructing a local bot path', () => {
  for (const id of [
    '../escape', 'a..b', '/remote', 'https://example.test/x',
    'A', 'a/b', 'a?b', ''
  ]) {
    const probe = workerProbe(id);
    assert.deepEqual(probe.imports, ['engine.js']);
    assert.equal(probe.replies[0].type, 'fail');
  }
  const probe = workerProbe('sample-turtle');
  assert.deepEqual(probe.imports, ['engine.js', 'bots/sample-turtle.js']);
  assert.equal(probe.replies[0].type, 'ready');
  probe.context.onmessage({
    data: { type: 'call', call: 'orders', key: 4, state: {} }
  });
  assert.equal(probe.replies[1].type, 'answer');
  assert.equal(probe.replies[1].call, 'orders');
  assert.equal(probe.replies[1].key, 4);
});

function fakeEngine() {
  let steps = 0;
  const submitted = [];
  const game = {
    phase: 'orders',
    year: 1,
    season: 'Spring',
    units: () => [
      { power: 'Phrygia', type: 'army', at: 'A' },
      { power: 'Lydia', type: 'army', at: 'B' }
    ],
    owners: () => ({ A: 'Phrygia', B: 'Lydia' }),
    botState: power => ({ phase: 'orders', you: power }),
    submitOrders: (power, orders) => {
      submitted.push([power, orders]);
      return { ok: true };
    },
    advance: () => {
      steps++;
      return { events: [], resolution: [] };
    },
    finished: () => false
  };
  return { create: () => game, submitted, steps: () => steps };
}

test('runner posts IDs, gates humans, shares concurrent next and cleans up', async () => {
  const original = globalThis.Worker;
  const messages = [];
  const created = [];
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
        data: message.type === 'init' ?
          { type: 'ready' } :
          { type: 'answer', call: message.call, key: message.key, payload: [] }
      }));
    }

    terminate() {
      this.terminated = true;
    }
  }

  globalThis.Worker = WorkerDouble;
  let runner;
  try {
    const engine = fakeEngine();
    const api = loadUmd('runner.js', engine);
    runner = api.start({
      Phrygia: { human: true },
      Lydia: { id: 'sample-turtle', name: 'Turtle' }
    }, { seed: 5 });
    await runner.loaded;
    const next = runner.next();
    assert.equal(runner.next(), next);
    assert.deepEqual(runner.waitingFor(), ['Phrygia']);
    assert.equal(runner.submitHuman('Phrygia', null).ok, false);
    assert.equal(engine.steps(), 0);
    assert.equal(runner.submitHuman('Phrygia', []).ok, true);
    assert.equal(runner.submitHuman('Phrygia', []).ok, false);
    await next;
    assert.equal(engine.steps(), 1);
    assert.equal(engine.submitted.length, 2);
    assert.deepEqual(Object.keys(messages[0]).sort(), ['id', 'seed', 'type']);
    const waiting = runner.next();
    runner.stop();
    await waiting;
    assert.equal(engine.steps(), 1);
    assert.deepEqual(runner.waitingFor(), []);
    assert.ok(created.every(w => w.terminated));
  } finally {
    runner?.stop();
    globalThis.Worker = original;
  }
});
