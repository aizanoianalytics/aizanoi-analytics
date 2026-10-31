import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = new URL('../frontend/arcade/holdem/', import.meta.url);
const directory = fileURLToPath(root);
const src = file => fs.readFileSync(new URL(file, root), 'utf8');

const loadUmd = (file, PokerEngine) => {
  const m = { exports: {} };
  new vm.Script(
    `(function (module, exports, PokerEngine) {\n${src(file)}\n})`,
    { filename: file },
  ).runInThisContext()(m, m.exports, PokerEngine);
  return m.exports;
};

function scriptsIn(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return scriptsIn(file);
    return entry.isFile() && entry.name.endsWith('.js') ? [file] : [];
  });
}

test('scripts contain no dynamic executable-code constructors', () => {
  const files = scriptsIn(directory);
  assert.ok(files.length >= 5);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /\beval\s*(?:\?\.)?\s*\(/, file);
    assert.doesNotMatch(content, /\bnew\s+Function\b/, file);
    assert.doesNotMatch(content, /\bFunction\s*\(/, file);
    assert.doesNotMatch(content, /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, file);
    assert.doesNotMatch(content, /\.style\s*\.(?!setProperty\b)[a-zA-Z_$]+\s*=/, file);
    assert.doesNotMatch(content, /\.style\s*\[/, file);
    assert.doesNotMatch(content, /setAttribute\s*\(\s*['"]style['"]/, file);
    new vm.Script(content, { filename: file });
  }
});

test('HTML uses external scripts and styles except head structured data', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\bjavascript\s*:/i);

  const headEnd = html.indexOf('</head>');
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];
  const external = [];
  let metadata = 0;

  for (const match of blocks) {
    const attributes = match[1];
    const code = match[2];
    if (/\btype\s*=\s*['"]application\/ld\+json['"]/i.test(attributes)) {
      assert.ok(match.index < headEnd, 'Structured data belongs in head');
      const data = JSON.parse(code);
      assert.equal(data['@context'], 'https://schema.org');
      assert.equal(data.url, 'https://aizanoianalytics.com/arcade/holdem/');
      metadata++;
      continue;
    }

    const source = attributes.match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i);
    assert.ok(source, 'Executable scripts must have src');
    assert.equal(code.trim(), '', 'External script tags cannot contain code');
    assert.doesNotMatch(source[1], /^(?:[a-z]+:|\/\/)/i);
    external.push(source[1]);
  }

  assert.equal(metadata, 1);
  assert.deepEqual(external, [
    'engine.js', '/arcade/shared/custom-bot.js',
    'runner.js', 'table.js', 'game.js'
  ]);
  assert.match(html, /href="holdem\.css"/);
});

test('worker resolves a validated local identifier, not a supplied URL', () => {
  const worker = src('bot-worker.js');
  const validate = worker.indexOf('/^[a-z0-9][a-z0-9.-]*$/');
  const traversal = worker.indexOf('id.includes(\'..\')');
  const load = worker.indexOf('importScripts(`bots/${id}.js`)');

  assert.match(worker, /importScripts\('engine\.js'\)/);
  assert.ok(validate >= 0 && traversal >= 0 && load > validate && load > traversal);
  assert.doesNotMatch(worker, /importScripts\s*\(\s*(?:message|m)\.(?:url|file)/);
  assert.match(worker, /PokerEngine\.rng/);
  assert.match(worker, /decisionId:\s*message\.decisionId/);
  assert.match(worker, /handNumber:\s*message\.handNumber/);
});

test('runner never posts a URL and uses only the fixed worker entry point', () => {
  const runner = src('runner.js');
  const constructors = [...runner.matchAll(/new Worker\(([^)]+)\)/g)];
  assert.equal(constructors.length, 1);
  assert.equal(constructors[0][1], '\'/arcade/holdem/bot-worker.js\'');
  assert.doesNotMatch(runner, /\burl\s*:/i);
  assert.doesNotMatch(runner, /\.url\b/);
  assert.match(runner, /type:\s*'init',\s*id:\s*entry\.botId/);
  assert.match(runner, /const TIMEOUT_MS = 1000;/);
  assert.match(runner, /clearTimeout\(/);
  assert.match(runner, /\.terminate\(/);
});

test('roster identifiers, local paths, files and byte counts are exact', () => {
  const manifest = JSON.parse(src('bots.json'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.bots.filter(bot => bot.id.startsWith('sample-')).length, 3);
  assert.equal(new Set(manifest.bots.map(bot => bot.id)).size, manifest.bots.length);

  const colors = {
    'sample-caller': '#9fb3d1',
    'sample-tight': '#ffd84d',
    'sample-equity': '#2dd4bf',
  };

  for (const bot of manifest.bots) {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.ok(!bot.id.includes('..'));
    assert.equal(bot.file, `bots/${bot.id}.js`);
    if (bot.id.startsWith('sample-')) {
      assert.equal(bot.lab, 'Aizanoi sample');
      assert.equal(bot.color, colors[bot.id]);
      assert.match(bot.note, /not an AI-model entry/);
    } else {
      assert.match(bot.color, /^#[0-9a-f]{6}$/i); // AI-model entry
    }
    assert.ok(Number.isSafeInteger(bot.bytes) && bot.bytes >= 0);

    const file = new URL(bot.file, root);
    assert.ok(fs.existsSync(file), `Missing ${bot.file}`);
    assert.equal(
      bot.bytes,
      fs.statSync(file).size,
      `${bot.file}: update bots.json bytes to the actual file size`,
    );
  }
});

test('sample bots load with the same-realm UMD loader', () => {
  const engine = loadUmd('engine.js');
  assert.equal(typeof engine.create, 'function');
  assert.equal(typeof engine.evaluate, 'function');
  assert.equal(typeof engine.equity, 'function');

  const manifest = JSON.parse(src('bots.json'));
  for (const bot of manifest.bots) {
    const exported = loadUmd(bot.file, engine);
    const act = typeof exported === 'function' ? exported : exported && exported.act;
    assert.equal(typeof act, 'function', `${bot.id} exports act(state)`);
  }
});

test('page includes every controller and QA element', () => {
  const html = src('index.html');
  const ids = [
    'ph-form', 'ph-seats', 'ph-add', 'ph-stack', 'ph-speed', 'ph-hands',
    'ph-start', 'ph-random', 'ph-table', 'ph-actions', 'ph-fold', 'ph-check',
    'ph-raise', 'ph-amount', 'ph-slider', 'ph-half', 'ph-pot', 'ph-allin',
    'ph-pass', 'ph-pass-name', 'ph-show', 'ph-standings', 'ph-log',
    'ph-ticker', 'ph-result', 'ph-hand', 'ph-blinds', 'ph-street',
    'ph-roster', 'ph-list',
  ];

  for (const id of ids) {
    assert.equal(
      [...html.matchAll(new RegExp(`\\bid="${id}"`, 'g'))].length,
      1,
      `${id} must exist exactly once`,
    );
  }

  assert.match(src('game.js'), /window\.__HOLDEM__\s*=/);
  assert.match(src('holdem.css'), /#0f5c3a/i);
  assert.match(src('holdem.css'), /#0f1526/i);
  assert.match(src('holdem.css'), /position:\s*sticky/);
});
