import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const dir = path.resolve('frontend/arcade/snake-royale');
const load = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const engine = (() => { const m = { exports: {} }; vm.runInNewContext(load('engine.js'), { module: m, Math }); return m.exports; })();
const { bots } = JSON.parse(load('bots.json'));
const renderer = () => { const m = { exports: {} }; vm.runInNewContext(load('renderer.js'), { module: m, Math }); return m.exports; };
test('renderer copies snapshots and interpolates only valid consecutive grid movement', () => {
  const r = renderer(), game = engine.create(['a', 'b'], { seed: 1 });
  const before = r.snapshot(game, { a: '#112233' }, { fighters: ['a', 'b'] });
  const original = JSON.stringify(before);
  game.step({ a: 'up', b: 'down' });
  assert.equal(JSON.stringify(before), original);
  const state = (turn, body) => ({ ...before, turn, snakes: [{ ...before.snakes[0], body }] });
  const a = state(1, [[3, 2], [2, 2], [1, 2]]), b = state(2, [[3, 1], [3, 2], [2, 2]]);
  assert.equal(JSON.stringify(r.interpolate(a, b, .5).snakes[0].body), JSON.stringify([[3, 1.5], [2.5, 2], [1.5, 2]]));
  for (const invalid of [state(3, b.snakes[0].body), state(2, [[0, 3], [3, 2], [2, 2]]), state(2, [[4, 2], [1, 2], [0, 2]])]) {
    assert.equal(JSON.stringify(r.interpolate(a, invalid, .5).snakes[0].body), JSON.stringify(invalid.snakes[0].body));
  }
  assert.equal(JSON.stringify(r.interpolate(a, b, 1).snakes[0].body), JSON.stringify(b.snakes[0].body));
});

function rendererHarness(reduced = false) {
  let clock = 0, next = 0, listener, removed = 0;
  const pending = new Map(), calls = [];
  const ctx = new Proxy({}, { get(target, key) { return target[key] ?? ((...args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key}: finite canvas coordinates`);
    calls.push([key, ...args]);
  }); }, set(target, key, value) { target[key] = value; return true; } });
  const instance = renderer().create({ width: 720, height: 720, getContext: () => ctx }, {
    now: () => clock, requestAnimationFrame: fn => { pending.set(++next, fn); return next; },
    cancelAnimationFrame: id => pending.delete(id),
    mediaQuery: { matches: reduced, addEventListener: (_, fn) => { listener = fn; }, removeEventListener: (_, fn) => { assert.equal(fn, listener); removed++; } }
  });
  return { instance, calls, pending, get removed() { return removed; },
    motion(value) { listener({ matches: value }); },
    tick(time) { clock = time; const batch = [...pending.values()]; pending.clear(); batch.forEach(fn => fn(time)); } };
}
test('renderer paints finite canvas paths, bounds animation and cancels all work on destroy', () => {
  const h = rendererHarness(), game = engine.create(['a', 'b'], { seed: 1 });
  const unchanged = JSON.stringify({ snakes: game.snakes, food: game.food });
  h.instance.update(game, { a: '#61efbb', b: '#ffa252' });
  assert.equal(JSON.stringify({ snakes: game.snakes, food: game.food }), unchanged);
  assert.equal(h.pending.size, 1);
  h.tick(70); assert.ok(h.calls.some(call => call[0] === 'fillRect'));
  h.tick(800); assert.equal(h.pending.size, 0, 'idle is finite, not an endless loop');
  game.step({ a: 'up', b: 'down' }); h.instance.update(game, {});
  assert.equal(h.pending.size, 1);
  h.instance.destroy(); assert.equal(h.pending.size, 0); assert.equal(h.removed, 1);
  const count = h.calls.length; h.instance.update(game, {}); h.tick(900); h.instance.destroy();
  assert.equal(h.calls.length, count); assert.equal(h.removed, 1);
});
test('reduced motion renders a stable still frame and responds to live preference changes', () => {
  const h = rendererHarness(true), game = engine.create(['a', 'b'], { seed: 2 });
  h.instance.update(game, {}); const first = JSON.stringify(h.calls);
  assert.equal(h.pending.size, 0); h.calls.length = 0; h.tick(5000);
  h.instance.update(game, {}); assert.equal(JSON.stringify(h.calls), first);
  h.motion(false); assert.equal(h.pending.size, 1);
  h.motion(true); assert.equal(h.pending.size, 0); h.instance.destroy();
});
test('renderer snaps instant mode, growth, skipped turns and backward turns stay bounded', () => {
  const r = renderer(), game = engine.create(['a', 'b']);
  const a = r.snapshot(game, {});
  a.turn = 1; a.snakes[0].body = [[2, 2], [1, 2]];
  const b = JSON.parse(JSON.stringify(a)); b.turn = 2; b.snakes[0].body = [[2, 1], [2, 2], [1, 2]];
  const half = r.interpolate(a, b, .5).snakes[0].body;
  assert.equal(JSON.stringify(half), JSON.stringify([[2, 1.5], [1.5, 2], [1, 2]]));
  for (const t of [-1, 0, .2, .8, 1, 2]) for (const [x, y] of r.interpolate(a, b, t).snakes[0].body) {
    assert.ok(x >= 1 && x <= 2 && y >= 1 && y <= 2);
  }
  b.turn = 0; assert.equal(JSON.stringify(r.interpolate(a, b, .5).snakes[0].body), JSON.stringify(b.snakes[0].body));
  const h = rendererHarness(); h.instance.update(game, {}, { duration: 0 }); h.tick(10); h.instance.destroy();
});

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

test('renderer bounds sparks, accepts frozen inputs and exposes the same browser API', () => {
  const h = rendererHarness();
  const snakes = Array.from({ length: 8 }, (_, i) => ({ id: String(i), alive: true, eaten: 0, health: 99, body: [[2, 2], [1, 2]] }));
  const initial = { options: { width: 11, height: 11 }, turn: 1, hazard: 2, nextShrinkTurn: 150, food: [], snakes };
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  freeze(initial); h.instance.update(initial, Object.freeze({}));
  const next = { ...initial, turn: 2, snakes: snakes.map(s => ({ ...s, alive: false, body: [[3, 2], [2, 2]] })) };
  h.calls.length = 0; h.instance.update(freeze(next), {});
  const circles = h.calls.filter(c => c[0] === 'arc');
  assert.equal(circles.filter(c => c[3] === .055).length, 48, 'hard particle ceiling even with eight deaths');
  h.calls.length = 0; h.tick(650);
  assert.equal(h.calls.filter(c => c[0] === 'arc' && c[3] === .055).length, 0, 'sparks expire');
  h.instance.destroy();
  const browser = {}; vm.runInNewContext(load('renderer.js'), { self: browser, Math });
  assert.equal(typeof browser.SnakeArenaRenderer.create, 'function');
});

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
  for (const f of ['engine.js', 'bot-worker.js', 'runner.js', 'renderer.js', 'game.js']) assert.doesNotMatch(load(f), /\beval\(|new Function\(/, f);
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
