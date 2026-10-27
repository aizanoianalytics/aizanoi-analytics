import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../frontend/arcade/chess/', import.meta.url));

async function read(name) {
  return readFile(path.join(root, name), 'utf8');
}

async function javascriptFiles(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await javascriptFiles(location));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      result.push(location);
    }
  }

  return result.sort();
}

test('chess JavaScript does not compile strings as code', async () => {
  const files = await javascriptFiles(root);
  assert.ok(files.length >= 5);

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\beval\s*(?:\?\.)?\s*\(/, file);
    assert.doesNotMatch(source, /\bnew\s+Function\b/, file);
    assert.doesNotMatch(source, /\bFunction\s*\(/, file);
    assert.doesNotMatch(source, /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, file);
  }
});

test('HTML uses external scripts and styles with no inline handlers', async () => {
  const html = await read('index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attributes]) => !/application\/ld\+json/.test(attributes));

  assert.equal(scripts.length, 5);
  for (const [, attributes, content] of scripts) {
    assert.match(attributes, /\bsrc\s*=\s*["'][^"']+["']/i);
    assert.equal(content.trim(), '');
  }

  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\bjavascript\s*:/i);

  const sources = scripts.map(([, attributes]) => {
    return attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)[1];
  });
  assert.deepEqual(sources, [
    'engine.js',
    '/arcade/shared/custom-bot.js',
    'runner.js',
    'renderer.js',
    'game.js'
  ]);
});

test('page includes required controls, metadata and linked JSON-LD', async () => {
  const html = await read('index.html');
  const ids = [
    'ch-white', 'ch-black', 'ch-variant', 'ch-series', 'ch-speed',
    'ch-start', 'ch-resign', 'ch-flip', 'ch-canvas', 'ch-cards',
    'ch-ticker', 'ch-moves', 'ch-result', 'ch-score', 'ch-promo',
    'ch-roster', 'ch-list'
  ];

  for (const id of ids) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }

  assert.match(html, /<title>AI Chess Arena — Aizanoi Arcade<\/title>/);
  assert.match(html, /https:\/\/aizanoianalytics\.com\/arcade\/chess\//);
  // JSON-LD is data, not executable code.
  const metadata = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(metadata['@context'], 'https://schema.org');
  assert.equal(metadata['@type'], 'WebPage');
  assert.equal(metadata.url, 'https://aizanoianalytics.com/arcade/chess/');
});

test('worker validates identifiers before building its local import path', async () => {
  const source = await read('bot-worker.js');

  assert.ok(source.includes('/^[a-z0-9][a-z0-9.-]*$/'));
  assert.ok(source.includes("id.includes('..')"));
  assert.ok(source.includes("importScripts('engine.js')"));
  assert.ok(source.includes('importScripts(`bots/${id}.js`)'));
  assert.ok(
    source.indexOf("id.includes('..')") <
    source.indexOf('importScripts(`bots/${id}.js`)')
  );

  function boot(id) {
    const imports = [];
    const messages = [];
    const sandbox = {
      module: undefined,
      exports: undefined,
      ChessEngine: { rng: () => () => 0.25 },
      Math: Object.create(Math),
      postMessage: message => messages.push(message),
      importScripts(location) {
        imports.push(location);
        if (location.startsWith('bots/')) {
          sandbox.module.exports = () => 'e2e4';
        }
      }
    };

    sandbox.self = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'bot-worker.js' });
    sandbox.onmessage({ data: { type: 'init', id, seed: 7 } });

    return { imports, messages, sandbox };
  }

  for (const id of [
    '../escape', 'a..b', '/absolute', 'https://example.com/bot',
    'Uppercase', 'a/b', 'a\\b', 'a?b', '', '.hidden'
  ]) {
    const result = boot(id);
    assert.deepEqual(result.imports, ['engine.js'], id);
    assert.equal(result.messages.at(-1).type, 'fail', id);
  }

  const valid = boot('sample-random');
  assert.deepEqual(valid.imports, ['engine.js', 'bots/sample-random.js']);
  assert.equal(valid.messages[0].type, 'ready');

  valid.sandbox.onmessage({
    data: {
      type: 'move',
      state: { ply: 12, legalMoves: ['e2e4'] }
    }
  });

  assert.equal(valid.messages[1].type, 'move');
  assert.equal(valid.messages[1].ply, 12);
  assert.equal(valid.messages[1].move, 'e2e4');
});

test('runner posts identifiers and never accepts a worker script URL from a seat', async () => {
  const source = await read('runner.js');
  assert.match(source, /new Worker\('\/arcade\/chess\/bot-worker\.js'\)/);
  assert.match(source, /type:\s*'init',\s*id:\s*entry\.id/);
  assert.match(source, /workerUrl:\s*'\/arcade\/chess\/bot-worker\.js'/);
  assert.doesNotMatch(source, /entry\.(?:file|url|workerUrl)|options\.(?:file|url|workerUrl)|seat\.(?:file|url|workerUrl)/);
  assert.match(source, /const TIMEOUT_MS = 1000;/);
});

test('manifest identifiers are unique and every bot file exists', async () => {
  const manifest = JSON.parse(await read('bots.json'));
  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.bots));
  assert.equal(manifest.bots.length, 3);

  const ids = new Set();
  const expected = new Map([
    ['sample-random', '#9fb3d1'],
    ['sample-greedy', '#ffd84d'],
    ['sample-minimax', '#2dd4bf']
  ]);

  for (const bot of manifest.bots) {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.ok(!bot.id.includes('..'));
    assert.ok(!ids.has(bot.id));
    assert.notEqual(bot.id, 'human');
    assert.notEqual(bot.id, 'custom');
    ids.add(bot.id);

    assert.equal(bot.file, `bots/${bot.id}.js`);
    assert.equal(bot.lab, 'Aizanoi sample');
    assert.equal(bot.color, expected.get(bot.id));
    assert.equal(typeof bot.name, 'string');
    assert.equal(typeof bot.botName, 'string');
    assert.ok(Number.isSafeInteger(bot.bytes) && bot.bytes >= 0);
    assert.ok((await stat(path.join(root, bot.file))).isFile());
  }

  assert.deepEqual([...ids].sort(), [...expected.keys()].sort());
});
