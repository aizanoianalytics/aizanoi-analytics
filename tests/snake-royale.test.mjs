import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const dir = path.resolve('frontend/arcade/snake-royale');
const load = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const engine = (() => { const m = { exports: {} }; vm.runInNewContext(load('engine.js'), { module: m, Math }); return m.exports; })();
const { bots } = JSON.parse(load('bots.json'));

function botFn(id, i, seed) {
  const sb = { module: { exports: {} }, console: { log() {} } };
  sb.exports = sb.module.exports; sb.globalThis = sb; sb.window = sb;
  const ctx = vm.createContext(sb);
  ctx.__r = engine.rng((seed * 31 + i) ^ 0x9e3779b9);
  vm.runInContext('Math.random = __r;', ctx);
  vm.runInContext(load('bots/' + id + '.js'), ctx, { timeout: 2000 });
  const e = ctx.module.exports;
  ctx.__fn = (typeof e === 'function' && e) || (e && e.move) || ctx.move;
  return ctx;
}
function play(a, b, seed) {
  const g = engine.create([a, b], { seed }), ctx = [botFn(a, 0, seed), botFn(b, 1, seed)];
  while (!g.finished()) {
    const mv = {};
    g.snakes.forEach((s, i) => {
      if (!s.alive) return;
      ctx[i].__s = JSON.parse(JSON.stringify(g.botState(s.id)));
      try { mv[s.id] = vm.runInContext('__fn(__s)', ctx[i], { timeout: 1000 }); } catch { mv[s.id] = null; }
    });
    g.step(mv);
  }
  return g;
}

test('manifest lists existing, unique bots', () => {
  assert.ok(bots.length >= 20);
  assert.equal(new Set(bots.map(b => b.id)).size, bots.length);
  for (const b of bots) {
    assert.ok(fs.existsSync(path.join(dir, b.file)), b.file);
    assert.match(b.color, /^#[0-9a-f]{6}$/i);
  }
});

test('every bot loads and finishes a duel against a reference bot', () => {
  for (const b of bots) {
    const g = play(b.id, b.id === 'haiku' ? 'beam' : 'haiku', 7);
    assert.ok(g.turn > 0, b.id);
    assert.notEqual(g.snakes[0].death?.cause, 'load-error', b.id);
  }
});

test('engine is deterministic for a seed', () => {
  const a = play('haiku', 'beam', 3), b = play('haiku', 'beam', 3);
  assert.equal(a.turn, b.turn);
  assert.deepEqual(a.placements(), b.placements());
});

test('page code is CSP-safe (no eval, no inline script/style)', () => {
  for (const f of ['engine.js', 'bot-worker.js', 'runner.js', 'game.js']) assert.doesNotMatch(load(f), /\beval\(|new Function\(/, f);
  const html = load('index.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/);
  assert.doesNotMatch(html, /<style|\sstyle=/);
});

test('the worker resolves its own fighter file from a validated id, never a URL', () => {
  const worker = load('bot-worker.js');
  const runner = load('runner.js');
  // A URL taken from a message and passed to importScripts is a dynamic script
  // load; keeping it out of the message removes the sink instead of relying on
  // CSP alone.
  assert.doesNotMatch(worker, /importScripts\(\s*m\.url|importScripts\(\s*(url|href)\b/);
  assert.match(worker, /importScripts\(`bots\/\$\{id\}\.js`\)/, 'the worker must build the path from the id');
  assert.match(worker, /\^\[a-z0-9\]\[a-z0-9\.-\]\*\$/, 'the id must be validated before it becomes a path');
  assert.doesNotMatch(runner, /postMessage\(\{[^}]*url:/, 'the runner must not hand a URL to the worker');
  // Every manifest id must survive the worker's validation.
  for (const b of bots) assert.match(b.id, /^[a-z0-9][a-z0-9.-]*$/, `${b.id} must be a valid fighter id`);
});
