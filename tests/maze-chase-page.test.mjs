import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../frontend/arcade/maze-chase/', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? files(absolute) : [absolute];
  });
}

const moduleFiles = files(root);
const jsFiles = moduleFiles.filter(file => file.endsWith('.js'));

test('module does not compile code dynamically', () => {
  assert.ok(jsFiles.length >= 5, 'Expected engine, worker, runner, renderer and page logic');
  jsFiles.forEach(file => {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /\beval\s*\(/, path.relative(root, file));
    assert.doesNotMatch(text, /\bnew\s+Function\b/, path.relative(root, file));
  });
});

test('page contains no inline executable script, inline style or event handler', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /javascript\s*:/i);

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];
  assert.equal(scripts.length, 7);
  let metadata = 0;

  scripts.forEach(match => {
    const [, attributes, body] = match;
    if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attributes)) {
      metadata++;
      assert.doesNotMatch(attributes, /\bsrc\s*=/i);
      const data = JSON.parse(body);
      assert.equal(data.name, 'Maze Chase');
      assert.equal(data.url, 'https://aizanoianalytics.com/arcade/maze-chase/');
      assert.ok(match.index < html.indexOf('</head>'));
    } else {
      assert.match(attributes, /\bsrc\s*=\s*["'][^"']+["']/i);
      assert.equal(body.trim(), '');
    }
  });
  assert.equal(metadata, 1);
});

test('scripts use same-origin files in dependency order', () => {
  const scripts = [...read('index.html').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(match => match[1]);

  assert.deepEqual(scripts, [
    '/arcade/shared/arena-input.js',
    'engine.js',
    '/arcade/shared/custom-bot.js',
    'runner.js',
    'renderer.js',
    'game.js',
  ]);
});

test('worker validates an id before constructing its local bot path', () => {
  const worker = read('bot-worker.js');
  const engineImport = worker.indexOf("importScripts('engine.js')");
  const validation = worker.indexOf('/^[a-z0-9][a-z0-9.-]*$/');
  const traversalCheck = worker.indexOf("id.includes('..')");
  const botImport = worker.indexOf('importScripts(`bots/${id}.js`)');

  assert.ok(engineImport >= 0);
  assert.ok(validation > engineImport);
  assert.ok(traversalCheck > validation);
  assert.ok(botImport > traversalCheck);
  assert.match(worker, /Math\.random\s*=\s*MazeEngine\.rng\(/);
  assert.match(worker, /type:\s*'move'[\s\S]*tick:\s*message\.state\.tick/);
  assert.doesNotMatch(worker, /importScripts\(\s*(?:message|event|m)\./);

  const valid = id => /^[a-z0-9][a-z0-9.-]*$/.test(id) && !id.includes('..');
  ['sample-hunter', 'sample.tactician', 'bot-2'].forEach(id => assert.ok(valid(id)));
  ['', '../x', 'x..y', '/x', 'https://x', 'x/y', 'x\\y', 'x?y', 'X', '-x', '.x']
    .forEach(id => assert.equal(valid(id), false, id));
});

test('runner creates local workers and sends bot ids, never script URLs', () => {
  const runner = read('runner.js');
  assert.match(runner, /new Worker\('\/arcade\/maze-chase\/bot-worker\.js'\)/);
  assert.match(runner, /type:\s*'init',\s*id:\s*entry\.botId/);
  assert.doesNotMatch(runner, /\burl\s*:/i);
  assert.doesNotMatch(runner, /\b(?:entry|seat)\.file\b/);
  assert.doesNotMatch(runner, /importScripts/);
  assert.match(runner, /const TIMEOUT_MS = 150;/);
  assert.match(runner, /data\.tick === state\.tick/);
  assert.match(runner, /moves\[entry\.id\]/);
  assert.match(runner, /\.terminate\(\)/);
  assert.match(runner, /pending\.delete\(cancel\)/);
});

test('manifest has valid, unique local bot files and the three labeled house samples', () => {
  const manifest = JSON.parse(read('bots.json'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.bots.filter(bot => bot.id.startsWith('sample-')).length, 3);
  assert.equal(new Set(manifest.bots.map(bot => bot.id)).size, manifest.bots.length);

  const expected = {
    'sample-wanderer': '#9fb3d1',
    'sample-hunter': '#ff4d4d',
    'sample-tactician': '#2dd4bf',
  };

  manifest.bots.forEach(bot => {
    assert.match(bot.id, /^[a-z0-9][a-z0-9.-]*$/);
    assert.ok(!bot.id.includes('..'));
    assert.equal(bot.file, `bots/${bot.id}.js`);
    assert.ok(fs.statSync(path.join(root, bot.file)).isFile(), bot.file);
    assert.equal(bot.bytes, fs.statSync(path.join(root, bot.file)).size, `${bot.id} bytes`);
    if (!bot.id.startsWith('sample-')) return; // AI-model entries join the same manifest later
    assert.equal(bot.lab, 'Aizanoi sample');
    assert.equal(bot.color, expected[bot.id]);
    assert.equal(typeof bot.name, 'string');
    assert.equal(typeof bot.botName, 'string');
    assert.match(bot.note, /not an AI-model entry/);
  });
});

test('module uses its own game identity', () => {
  const forbidden = new RegExp(['Pac' + '-Man', 'Pac' + 'man'].join('|'), 'i');
  moduleFiles.forEach(file => {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, path.relative(root, file));
  });
});

test('required page controls and accessible touch buttons exist', () => {
  const html = read('index.html');
  const required = [
    'mc-form', 'mc-runners', 'mc-ghosts', 'mc-add-runner', 'mc-add-ghost',
    'mc-layout', 'mc-speed', 'mc-series', 'mc-start', 'mc-random',
    'mc-tick', 'mc-pellets', 'mc-fright', 'mc-canvas', 'mc-pad',
    'mc-cards', 'mc-ticker', 'mc-result', 'mc-tally', 'mc-roster', 'mc-list',
  ];
  required.forEach(id => {
    assert.equal([...html.matchAll(new RegExp(`\\bid="${id}"`, 'g'))].length, 1, id);
  });
  ['up', 'down', 'left', 'right'].forEach(direction => {
    assert.match(html, new RegExp(`<button\\b[^>]*data-dir="${direction}"[^>]*aria-label=`));
  });
  assert.match(html, /<canvas\b[^>]*width="756"[^>]*height="756"[^>]*role="img"/);
  assert.match(read('maze-chase.css'), /min-height:\s*56px/);
  assert.match(read('game.js'), /window\.__MAZE_CHASE__\s*=/);
});
