import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, 'scripts/arcade/arena.mjs');
const games = [
  'snake-royale', 'chess', 'maze-chase', 'capture-flag',
  'holdem', 'football', 'anatolian-pact'
];

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'aizanoi-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function run(args, timeout = 180000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill();
    }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (expired) {
        reject(new Error(`CLI exceeded ${timeout} ms\n${stderr}`));
      } else if (code !== 0) {
        reject(new Error(`CLI exited ${code}, signal ${signal}\n${stderr}\n${stdout}`));
      } else {
        resolvePromise({ stdout, stderr });
      }
    });
  });
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function validResult(result, game, count = 1) {
  assert.equal(result.game, game);
  assert.equal(result.seed, 1);
  assert.ok(Array.isArray(result.seats));
  assert.ok(result.seats.length >= 2);
  assert.equal(result.games.length, count);
  assert.equal(result.table.length, result.seats.length);
  for (const item of result.games) {
    assert.ok(Object.hasOwn(item, 'result'));
    assert.equal(item.seats.length, result.seats.length);
    assert.equal(item.errors.length, result.seats.length);
    assert.ok(item.errors.every(value => Number.isInteger(value) && value >= 0));
  }
  for (const row of result.table) {
    assert.equal(row.games, count);
    assert.ok(Number.isInteger(row.errors));
    assert.ok(row.averagePlace === null || Number.isFinite(row.averagePlace));
    assert.ok(row.points === null || Number.isFinite(row.points));
  }
}

for (const game of games) {
  test(`${game}: sample CLI produces aggregate JSON and replay`, {
    timeout: 240000
  }, async t => {
    const directory = await temporary(t);
    const out = join(directory, 'result.json');
    const replays = join(directory, 'replays');
    const execution = await run([
      game, '--games', '1', '--quiet', '--out', out, '--replays', replays
    ]);
    assert.equal(execution.stdout, '');
    const result = await json(out);
    validResult(result, game);
    const files = await readdir(replays);
    assert.deepEqual(files, [`${game}-0001.json`]);
    const replay = await json(join(replays, files[0]));
    assert.equal(replay.meta.kind, game);
    assert.equal(replay.meta.seed, 1);
    assert.equal(replay.meta.field.length, result.seats.length);
    assert.ok(Array.isArray(replay.frames));
    assert.ok(replay.frames.length >= 1);
    assert.ok(replay.names);
    if (game === 'snake-royale') {
      assert.ok(replay.opts);
      assert.ok(Array.isArray(replay.meta.placements));
      assert.ok(replay.meta.placements.every(item => Number.isInteger(item.errors)));
      assert.equal(replay.frames[0].turn, 0);
      for (const frame of replay.frames) {
        assert.ok(Array.isArray(frame.food));
        assert.ok(Array.isArray(frame.snakes));
        assert.ok(Array.isArray(frame.events));
        for (const snake of frame.snakes) {
          assert.equal(typeof snake.id, 'string');
          assert.equal(typeof snake.alive, 'boolean');
          assert.ok(snake.body.every(cell => Array.isArray(cell) && cell.length === 2));
        }
      }
    } else {
      assert.equal(replay.meta.schema, 'aizanoi-arena-replay-v1');
      assert.ok(Object.hasOwn(replay.frames[0], 'state'));
      assert.ok(replay.frames[0].views);
    }
  });
}

test('Snake CLI preserves authoritative invalid-decision errors in aggregates and replay placements', {
  timeout: 30000
}, async t => {
  const directory = await temporary(t);
  const bot = join(directory, 'invalid-snake.js');
  const out = join(directory, 'result.json');
  const replays = join(directory, 'replays');
  await writeFile(bot, 'module.exports = function () { return null; };\n');
  await run(['snake-royale', '--seat', bot, '--seat', bot, '--games', '1', '--quiet', '--out', out, '--replays', replays], 20000);
  const result = await json(out);
  validResult(result, 'snake-royale');
  const game = result.games[0];
  assert.ok(game.errors.every(value => value > 0), 'invalid successful returns are engine errors, not successful decisions');
  for (const placement of game.placements) {
    const index = game.seats.findIndex(seat => seat.id === placement.id);
    assert.equal(placement.errors, game.errors[index]);
    const row = result.table.find(item => item.participant === game.seats[index].participant);
    assert.equal(row.errors, placement.errors);
  }
  const replay = await json(join(replays, 'snake-royale-0001.json'));
  assert.deepEqual(replay.meta.placements, game.placements);
});

test('a bot that never returns times out and chess finishes by forfeit', {
  timeout: 30000
}, async t => {
  const directory = await temporary(t);
  const bot = join(directory, 'hang.js');
  const out = join(directory, 'result.json');
  await writeFile(bot, 'module.exports = function () { for (;;) {} };\n');
  await run([
    'chess', '--seat', bot, '--seat', bot,
    '--games', '1', '--timeout', '25', '--quiet', '--out', out
  ], 20000);
  const result = await json(out);
  validResult(result, 'chess');
  assert.equal(result.games[0].result.over, true);
  assert.ok(result.games[0].errors.some(value => value > 0));
});

test('load exceptions use Holdem check/fold fallback and finish', {
  timeout: 120000
}, async t => {
  const directory = await temporary(t);
  const bot = join(directory, 'throw.js');
  const out = join(directory, 'result.json');
  await writeFile(bot, 'throw new Error("intentional load failure");\n');
  await run([
    'holdem', '--seat', bot, '--seat', bot,
    '--games', '1', '--quiet', '--out', out
  ], 100000);
  const result = await json(out);
  validResult(result, 'holdem');
  assert.ok(result.games[0].errors.every(value => value > 0));
});

test('a load-time infinite loop is terminated', {
  timeout: 30000
}, async t => {
  const directory = await temporary(t);
  const bot = join(directory, 'load-hang.js');
  const out = join(directory, 'result.json');
  await writeFile(bot, 'for (;;) {}\n');
  await run([
    'chess', '--seat', bot, '--seat', bot,
    '--games', '1', '--quiet', '--out', out
  ], 20000);
  const result = await json(out);
  validResult(result, 'chess');
  assert.equal(result.games[0].result.over, true);
  assert.ok(result.games[0].errors.every(value => value > 0));
});

test('swap preserves participant identities and pairs engine seeds', {
  timeout: 30000
}, async t => {
  const directory = await temporary(t);
  const bot = join(directory, 'invalid.js');
  const out = join(directory, 'result.json');
  await writeFile(bot, 'module.exports = function () { return "invalid"; };\n');
  await run([
    'chess', '--seat', bot, '--seat', bot,
    '--games', '2', '--swap', '--quiet', '--out', out
  ], 20000);
  const result = await json(out);
  validResult(result, 'chess', 2);
  assert.equal(result.games[0].seed, result.games[1].seed);
  assert.deepEqual(result.games[0].seats.map(seat => seat.participant), [0, 1]);
  assert.deepEqual(result.games[1].seats.map(seat => seat.participant), [1, 0]);
});
