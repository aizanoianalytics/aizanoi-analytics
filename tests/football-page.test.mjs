import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../frontend/arcade/football/', import.meta.url);
const src = file => fs.readFileSync(new URL('../frontend/arcade/football/' + file, import.meta.url), 'utf8');
const loadUmd = (file, FootballEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, FootballEngine) {\n${src(file)}\n})`, {
    filename: file
  }).runInThisContext()(m, m.exports, FootballEngine);
  return m.exports;
};

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

const moduleFiles = () => files(fileURLToPath(root));
const manifest = () => JSON.parse(src('bots.json'));

test('browser JavaScript parses and contains no dynamic source compilation', () => {
  const javascript = moduleFiles().filter(file => file.endsWith('.js'));
  assert.ok(javascript.length >= 8, 'Engine, page scripts, worker, and bots must exist');
  for (const filename of javascript) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(/, filename);
    assert.doesNotMatch(source, /\bnew\s+Function\b/, filename);
    assert.doesNotMatch(source, /\bFunction\s*\(/, filename);
    assert.doesNotMatch(source, /set(?:Timeout|Interval)\s*\(\s*['"`]/, filename);
    assert.doesNotThrow(() => new vm.Script(source, { filename }));
  }
});

test('HTML contains only external executable scripts and head JSON-LD', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.equal(scripts.length, 6);
  const executable = [];
  let metadata = 0;
  for (const match of scripts) {
    const attributes = match[1];
    const body = match[2];
    if (/\btype\s*=\s*['"]application\/ld\+json['"]/i.test(attributes)) {
      metadata++;
      assert.ok(match.index < html.indexOf('</head>'));
      const data = JSON.parse(body);
      assert.equal(data.url, 'https://aizanoianalytics.com/arcade/football/');
      continue;
    }
    const external = attributes.match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i);
    assert.ok(external, 'Executable scripts must have src');
    assert.equal(body.trim(), '');
    assert.doesNotMatch(external[1], /^(?:https?:)?\/\//i);
    executable.push(external[1]);
  }
  assert.equal(metadata, 1);
  assert.deepEqual(executable, [
    'engine.js',
    '/arcade/shared/custom-bot.js',
    'runner.js',
    'renderer.js',
    'game.js'
  ]);
});

test('HTML provides the complete accessible page surface', () => {
  const html = src('index.html');
  for (const id of [
    'fb-form', 'fb-red', 'fb-blue', 'fb-add-red', 'fb-add-blue',
    'fb-size', 'fb-time', 'fb-limit', 'fb-speed', 'fb-series',
    'fb-start', 'fb-pause', 'fb-random', 'fb-score', 'fb-clock',
    'fb-canvas', 'fb-cards', 'fb-ticker', 'fb-result', 'fb-stick',
    'fb-kick', 'fb-roster', 'fb-list'
  ]) {
    assert.equal([...html.matchAll(new RegExp(`\\bid="${id}"`, 'g'))].length, 1, id);
  }
  assert.match(html, /<canvas\b[^>]*\bwidth="900"[^>]*\bheight="460"[^>]*\brole="img"/);
  assert.match(html, /<title>AI Football — Aizanoi Arcade<\/title>/);
});

function workerHarness(botSource = 'module.exports = state => ({ x: 2, y: -2, kick: true });') {
  const imports = [];
  const messages = [];
  const context = vm.createContext({
    imports,
    messages,
    botSource,
    postMessage(message) {
      messages.push(message);
    }
  });
  vm.runInContext(`
    self = globalThis;
    importScripts = filename => {
      imports.push(filename);
      if (filename !== 'engine.js') {
        new vm.Script(botSource).runInContext(context);
      }
    };
  `, vm.createContext({}));
  context.importScripts = filename => {
    imports.push(filename);
    if (filename !== 'engine.js') vm.runInContext(botSource, context);
  };
  vm.runInContext('self = globalThis;', context);
  new vm.Script(src('bot-worker.js'), { filename: 'bot-worker.js' }).runInContext(context);
  return {
    imports,
    messages,
    send(data) {
      context.onmessage({ data });
    }
  };
}

test('worker loads engine first and builds a local path only after validating id', () => {
  for (const id of ['../escape', 'a..b', '/outside', 'https://other.test/bot', 'UPPER', 'a/b', 'a\\b', '']) {
    const worker = workerHarness();
    worker.send({ type: 'init', id, seed: 1 });
    assert.deepEqual(worker.imports, ['engine.js']);
    assert.equal(worker.messages.at(-1).type, 'fail');
  }
  const worker = workerHarness();
  worker.send({ type: 'init', id: 'sample-striker', seed: 42, url: 'https://other.test/bot.js' });
  assert.deepEqual(worker.imports, ['engine.js', 'bots/sample-striker.js']);
  assert.equal(worker.messages.at(-1).type, 'ready');
  worker.send({ type: 'decide', step: 6, state: { step: 6 } });
  const answer = JSON.parse(JSON.stringify(worker.messages.at(-1)));
  assert.deepEqual(answer, { type: 'decide', step: 6, input: { x: 1, y: -1, kick: true } });
});

test('worker supports object exports, rejects invalid actions, and seeds randomness', () => {
  const randomSource = 'module.exports = { decide: () => ({ x: Math.random(), y: Math.random(), kick: false }) };';
  const left = workerHarness(randomSource);
  const right = workerHarness(randomSource);
  for (const worker of [left, right]) {
    worker.send({ type: 'init', id: 'sample-chaser', seed: 91 });
    for (let step = 0; step < 30; step += 3) {
      worker.send({ type: 'decide', step, state: { step } });
    }
  }
  assert.equal(JSON.stringify(left.messages), JSON.stringify(right.messages));

  const invalid = workerHarness('module.exports = () => ({ x: NaN, y: 0, kick: true });');
  invalid.send({ type: 'init', id: 'sample-chaser', seed: 1 });
  invalid.send({ type: 'decide', step: 0, state: { step: 0 } });
  assert.equal(invalid.messages.at(-1).input, null);
});

test('runner creates a fixed local worker and posts ids rather than URLs', () => {
  const source = src('runner.js');
  assert.match(source, /new Worker\('\/arcade\/football\/bot-worker\.js'\)/);
  assert.doesNotMatch(source, /\burl\s*:/i);
  assert.doesNotMatch(source, /\bimportScripts\s*\(/);
  assert.match(source, /type: 'init',\s*id: seat\.botId,/);
  assert.match(source, /type: 'decide',\s*step,\s*state: game\.botState\(entry\.seat\.id\)/);
  assert.match(source, /FootballEngine\.mirrorInput\(input, seat\.team\)/);
});

test('manifest ids are unique, paths are canonical, and files exist', () => {
  const data = manifest();
  assert.equal(data.version, 1);
  assert.equal(data.bots.length, 3);
  const ids = new Set();
  for (const bot of data.bots) {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.ok(!bot.id.includes('..'));
    assert.ok(!ids.has(bot.id));
    ids.add(bot.id);
    assert.equal(bot.file, `bots/${bot.id}.js`);
    assert.ok(fs.statSync(new URL(bot.file, root)).isFile());
    assert.equal(bot.lab, 'Aizanoi sample');
    assert.match(bot.note, /not an AI-model entry/);
    assert.match(bot.note, /not an AI-model entry/);
    assert.match(bot.color, /^#[0-9a-f]{6}$/i);
  }
});

test('manifest byte counts equal the actual bot file sizes', () => {
  for (const bot of manifest().bots) {
    assert.equal(bot.bytes, fs.statSync(new URL(bot.file, root)).size,
      `${bot.id}: replace the zero-byte placeholder with the actual source byte length`);
  }
});

test('sample bot UMD exports load in the engine realm', () => {
  const engine = loadUmd('engine.js');
  assert.equal(typeof engine.create, 'function');
  for (const bot of manifest().bots) {
    const exported = loadUmd(bot.file, engine);
    const decide = typeof exported === 'function' ? exported : exported.decide;
    assert.equal(typeof decide, 'function', bot.id);
  }
});

test('module contains no prohibited legacy game name', () => {
  const prohibited = ['Hax', 'ball'].join('').toLowerCase();
  for (const filename of moduleFiles()) {
    const source = fs.readFileSync(filename, 'utf8').toLowerCase();
    assert.ok(!source.includes(prohibited), filename);
  }
});
