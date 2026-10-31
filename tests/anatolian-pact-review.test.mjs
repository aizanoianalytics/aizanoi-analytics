import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

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
const E = loadUmd('engine.js');
const powers = E.MAP.powers.map(p => p.id);
const provinces = Object.values(E.MAP.provinces);
const land = provinces.filter(p => p.type === 'land').map(p => p.id);
const adj = E.MAP.adjacency;
const unit = (at, power = powers[0]) => ({ at, power, type: 'army' });
const move = (at, dest) => ({ unit: at, type: 'move', dest });
const support = (at, target, targetDest = 'hold') =>
  ({ unit: at, type: 'support', target, targetDest });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const canonical = list => [...list].sort((a, b) => compare(a.unit || a.at, b.unit || b.at));
const owners = () => Object.fromEntries(provinces.filter(p => p.sc).map(p => [p.id, null]));
const triangle = land.flatMap(a => adj[a].filter(b => land.includes(b)).flatMap(b =>
  adj[b].filter(c => c !== a && land.includes(c) && adj[c].includes(a)).map(c => [a, b, c])))[0];
assert.ok(triangle);
const [a, b, c] = triangle;

test('bot snapshots expose detached seed and configured scoring horizon', () => {
  const game = E.create({ seed: 4294967295, maxYears: 6 });
  const state = game.botState(powers[0]);
  assert.equal(state.seed, 4294967295);
  assert.equal(state.limits.maxYears, 6);
  state.seed = 1;
  state.limits.maxYears = 999;
  assert.equal(game.botState(powers[0]).seed, 4294967295);
  assert.equal(game.botState(powers[0]).limits.maxYears, 6);
  assert.equal(E.create().botState(powers[0]).seed, 0);
  assert.equal(E.create().botState(powers[0]).limits.maxYears, 12);
});

test('simultaneous eliminations share placement rather than map-order tiebreaking', () => {
  const sc = provinces.filter(p => p.sc).map(p => p.id);
  const own = { ...owners(), [sc[0]]: powers[0], [sc[1]]: powers[1] };
  const game = E.create({
    maxYears: 1,
    setup: { phase: 'orders', season: 'Autumn', units: [], owners: own }
  });
  game.advance();
  const result = game.result();
  assert.deepEqual(result.shared, [powers[0], powers[1]]);
  const eliminated = result.placements.filter(p => p.eliminated);
  assert.equal(eliminated.length, 4);
  assert.ok(eliminated.every(p => p.rank === 3));
  assert.ok(result.placements.filter(p => !p.eliminated).every(p => p.rank === 1));
});

test('survivors outrank an earlier elimination cohort and cohort members tie', () => {
  const home = E.MAP.powers[0].homes[0];
  // Use non-centres: holding on the triangle's supply centres captures them in Autumn and invalidates the expected ranks.
  const [first, second] = provinces.filter(p => p.type === 'land' && !p.sc);
  assert.ok(first && second);
  const game = E.create({
    maxYears: 1,
    setup: {
      phase: 'orders',
      units: [unit(first.id, powers[1]), unit(second.id, powers[2])],
      owners: { ...owners(), [home]: powers[0] }
    }
  });
  game.advance();
  assert.equal(game.season, 'Autumn');
  game.advance();
  game.advance();
  game.advance();
  assert.equal(game.phase, 'over');
  const result = game.result();
  const byPower = Object.fromEntries(result.placements.map(p => [p.power, p]));
  assert.equal(byPower[powers[0]].rank, 1);
  assert.equal(byPower[powers[1]].eliminated, false);
  assert.equal(byPower[powers[2]].eliminated, false);
  assert.equal(byPower[powers[1]].rank, 2);
  assert.equal(byPower[powers[2]].rank, 2);
  assert.ok([powers[3], powers[4], powers[5]].every(p => byPower[p].rank === 4));
});

test('explicit support destination equal to origin is invalid, not support-hold', () => {
  const battle = E.adjudicate([unit(a), unit(b)], [support(a, b, b)]);
  const order = battle.resolution.find(o => o.unit === a);
  assert.equal(order.type, 'hold');
  assert.equal(order.valid, false);
  assert.equal(order.outcome, 'invalid');
  const omitted = E.adjudicate([unit(a), unit(b)], [
    { unit: a, type: 'support', target: b }
  ]);
  assert.equal(omitted.resolution.find(o => o.unit === a).targetDest, 'hold');
  assert.equal(omitted.resolution.find(o => o.unit === a).effective, true);
});

test('unmatched support is ineffective but not falsely reported as cut', () => {
  const battle = E.adjudicate([unit(a), unit(b)], [support(a, b, c)]);
  const order = battle.resolution.find(o => o.unit === a);
  assert.equal(order.valid, true);
  assert.equal(order.outcome, 'success');
  assert.equal(order.effective, false);
  const matching = E.adjudicate([unit(a), unit(b)], [support(a, b, c), move(b, c)]);
  assert.equal(matching.resolution.find(o => o.unit === a).effective, true);
});

test('an attacked unmatched support is still correctly reported as cut', () => {
  const battle = E.adjudicate(
    [unit(a), unit(b), unit(c, powers[1])],
    [support(a, b), move(c, a)]
  );
  assert.equal(battle.resolution.find(o => o.unit === a).outcome, 'cut');
  assert.equal(battle.resolution.find(o => o.unit === a).effective, false);
});

test('rotations and supported head-to-head resolution do not depend on input order', () => {
  const fixtures = [
    {
      units: [unit(a), unit(b, powers[1]), unit(c, powers[2])],
      orders: [move(a, b), move(b, c), move(c, a)]
    },
    {
      units: [unit(a), unit(b, powers[1]), unit(c)],
      orders: [move(a, b), move(b, a), support(c, a, b)]
    }
  ];
  for (const fixture of fixtures) {
    const expected = E.adjudicate(fixture.units, fixture.orders);
    for (const units of [fixture.units, [...fixture.units].reverse()]) {
      for (const orders of [fixture.orders, [...fixture.orders].reverse()]) {
        const actual = E.adjudicate(units, orders);
        assert.deepEqual(canonical(actual.units), canonical(expected.units));
        assert.deepEqual(canonical(actual.dislodged), canonical(expected.dislodged));
        assert.deepEqual(canonical(actual.resolution), canonical(expected.resolution));
        assert.deepEqual(actual.standoffs, expected.standoffs);
      }
    }
  }
});

test('a dislodged head-to-head loser cannot standoff its dislodger origin', () => {
  let motif;
  search: for (const x of land) for (const y of adj[x].filter(id => land.includes(id))) {
    const common = land.filter(id => ![x, y].includes(id) &&
      adj[id].includes(x) && adj[id].includes(y));
    if (common.length >= 2) {
      motif = [x, y, common[0], common[1]];
      break search;
    }
  }
  assert.ok(motif);
  const [x, y, z, d] = motif;
  const battle = E.adjudicate(
    [unit(x), unit(y, powers[1]), unit(z), unit(d, powers[2])],
    [move(x, y), move(y, x), support(z, x, y), move(d, x)]
  );
  const result = Object.fromEntries(battle.resolution.map(o => [o.unit, o.outcome]));
  assert.equal(result[x], 'success');
  assert.equal(result[y], 'dislodged');
  assert.equal(result[d], 'success');
  assert.ok(!battle.standoffs.includes(x));
  assert.equal(new Set(battle.units.map(u => u.at)).size, battle.units.length);
});

test('map sizing uses CSS custom properties rather than direct style assignment', () => {
  assert.match(src('map.js'), /style\.setProperty\('--ap-map-ratio'/);
  assert.doesNotMatch(src('map.js'), /\.style\.(?:aspectRatio|width|height)\s*=/);
  assert.match(src('anatolian-pact.css'), /aspect-ratio:\s*var\(--ap-map-ratio/);
  assert.match(src('index.md'), /\[BOT_API\.md\]\(BOT_API\.md\)/);
});

test('human semantic rejection retains its barrier and permits a corrected proposal', async () => {
  const api = loadUmd('runner.js', E);
  const power = powers[0];
  const runner = api.start({ [power]: { human: true } }, { seed: 7 });
  try {
    await runner.loaded;
    const pending = runner.next();
    const bad = runner.submitHuman(power, [
      { to: power, type: 'peace', terms: {} }
    ]);
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.length);
    assert.deepEqual(runner.waitingFor(), [power]);
    assert.equal(runner.game.phase, 'negotiate-propose');
    assert.equal(runner.submitHuman(power, []).ok, true);
    await pending;
    assert.equal(runner.game.phase, 'negotiate-answer');
    assert.deepEqual(runner.waitingFor(), []);
    assert.deepEqual(runner.game.proposals(), []);
  } finally {
    runner.stop();
  }
});

test('invalid human builds remain editable instead of silently being waived', async () => {
  const api = loadUmd('runner.js', E);
  const power = powers[0], home = E.MAP.powers[0].homes[0];
  const runner = api.start({ [power]: { human: true } }, {
    seed: 7,
    setup: { phase: 'builds', units: [], owners: { ...owners(), [home]: power } }
  });
  try {
    const pending = runner.next();
    assert.equal(runner.submitHuman(power, [{ type: 'fleet', at: home }]).ok, false);
    assert.deepEqual(runner.waitingFor(), [power]);
    assert.equal(runner.game.units().length, 0);
    assert.equal(runner.submitHuman(power, [{ type: 'army', at: home }]).ok, true);
    await pending;
    assert.deepEqual(runner.game.units(), [unit(home)]);
  } finally {
    runner.stop();
  }
});

test('worker seat seeds are independent of seat object insertion order', async () => {
  const original = globalThis.Worker;
  const initializations = [];
  class WorkerDouble {
    postMessage(message) {
      if (message.type === 'init') initializations.push({ id: message.id, seed: message.seed });
      queueMicrotask(() => this.onmessage?.({
        data: message.type === 'init' ? { type: 'ready' } :
          { type: 'answer', call: message.call, key: message.key, payload: [] }
      }));
    }
    terminate() {}
  }
  globalThis.Worker = WorkerDouble;
  const api = loadUmd('runner.js', E);
  let first, second;
  try {
    const a = [powers[0], { id: 'sample-turtle' }];
    const b = [powers[1], { id: 'sample-expander' }];
    first = api.start(Object.fromEntries([a, b]), { seed: 19 });
    await first.loaded;
    const expected = initializations.splice(0);
    first.stop();
    second = api.start(Object.fromEntries([b, a]), { seed: 19 });
    await second.loaded;
    assert.deepEqual(initializations, expected);
    assert.equal(expected[0].seed, (Math.imul(19, 31) + 0) >>> 0);
    assert.equal(expected[1].seed, (Math.imul(19, 31) + 1) >>> 0);
  } finally {
    first?.stop();
    second?.stop();
    globalThis.Worker = original;
  }
});

test('invalid bot payload reports a public fallback without leaking payload contents', async () => {
  const original = globalThis.Worker;
  class WorkerDouble {
    postMessage(message) {
      queueMicrotask(() => this.onmessage?.({
        data: message.type === 'init' ? { type: 'ready' } : {
          type: 'answer', call: message.call, key: message.key,
          payload: [{ to: powers[0], type: 'peace', terms: { secret: 'DO_NOT_LEAK' } }]
        }
      }));
    }
    terminate() {}
  }
  globalThis.Worker = WorkerDouble;
  let runner;
  try {
    const api = loadUmd('runner.js', E);
    runner = api.start({ [powers[0]]: { id: 'sample-turtle' } }, { seed: 3 });
    await runner.loaded;
    const result = await runner.next();
    assert.deepEqual(result.events, [{
      type: 'bot-fallback', power: powers[0], call: 'propose', reason: 'invalid-payload'
    }]);
    assert.ok(!JSON.stringify(result).includes('DO_NOT_LEAK'));
    assert.deepEqual(runner.game.proposals(), []);
  } finally {
    runner?.stop();
    globalThis.Worker = original;
  }
});
