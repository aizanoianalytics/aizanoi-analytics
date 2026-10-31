import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const src = file => fs.readFileSync(
  new URL('../frontend/arcade/anatolian-pact/' + file, import.meta.url), 'utf8'
);

/*
 * runInThisContext deliberately preserves the host realm: strict deep equality
 * of engine return values must not fail merely because Array prototypes differ.
 * Each UMD wrapper gets a local globalThis without mutating the test process.
 */
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
const data = globals.PactMapData = loadUmd('map-data.js');
const E = loadUmd('engine.js');
const { provinces, adjacency, powers, rows } = E.MAP;
const all = Object.keys(provinces);
const land = all.filter(id => provinces[id].type === 'land');
const byName = name => {
  const province = Object.values(provinces).find(p => p.name === name);
  assert.ok(province, 'Missing province ' + name);
  return province;
};
const adjacent = (a, b) => adjacency[a].includes(b);
const p = powers.map(power => power.id);
const unit = (at, power = p[0], type = 'army') => ({ power, type, at });
const move = (unit, dest) => ({ unit, type: 'move', dest });
const support = (unit, target, targetDest = 'hold') => ({ unit, type: 'support', target, targetDest });
const hold = unit => ({ unit, type: 'hold' });
const outcome = (battle, at) => battle.resolution.find(order => order.unit === at).outcome;
const nullOwners = () => Object.fromEntries(Object.values(provinces)
  .filter(province => province.sc).map(province => [province.id, null]));

function components(ids, next = id => adjacency[id]) {
  const unseen = new Set(ids), result = [];
  while (unseen.size) {
    const start = unseen.values().next().value, queue = [start];
    unseen.delete(start);
    for (let i = 0; i < queue.length; i++) for (const n of next(queue[i])) {
      if (unseen.delete(n)) queue.push(n);
    }
    result.push(queue);
  }
  return result;
}
function reachable(start, target, type) {
  const seen = new Set([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] === target) return true;
    for (const n of adjacency[queue[i]]) if (!seen.has(n) && E.canMove(unit(queue[i], p[0], type), n)) {
      seen.add(n); queue.push(n);
    }
  }
  return false;
}
const triangle = land.flatMap(a => adjacency[a].filter(b => land.includes(b)).flatMap(b =>
  adjacency[b].filter(c => land.includes(c) && c !== a && adjacent(c, a)).map(c => [a, b, c])))[0];
assert.ok(triangle, 'The generated map must contain a land triangle');
const [a, b, c] = triangle;

function fixture(units, extra = {}) {
  return E.create({ maxYears: 8, setup: { units, phase: 'orders', ...extra } });
}
function issue(game, orders) {
  p.forEach(power => {
    const own = game.units().filter(unit => unit.power === power).map(unit => unit.at);
    assert.equal(game.submitOrders(power, orders.filter(order => own.includes(order.unit))).ok, true);
  });
  return game.advance();
}
function tripleWithExtra() {
  for (const x of land) for (const y of adjacency[x].filter(id => land.includes(id))) {
    for (const z of adjacency[x].filter(id => land.includes(id) && id !== y && adjacent(id, y))) {
      const d = adjacency[z].find(id => land.includes(id) && ![x, y, z].includes(id));
      if (d) return [x, y, z, d];
    }
  }
  throw new Error('Missing four-province motif');
}

test('generated metadata, source, codes, connected hex clusters, symmetric computed adjacency', () => {
  assert.match(data.source, /Natural Earth/);
  assert.equal(data.victory, 13);
  assert.deepEqual(data.hex, { orientation: 'pointy', offset: 'odd-r' });
  assert.ok(land.length >= 36 && land.length <= 40);
  assert.ok(all.length - land.length >= 12 && all.length - land.length <= 14);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => row.length === rows[0].length));
  assert.equal(new Set(data.provinces.map(p => p.id)).size, data.provinces.length);
  for (const row of rows) for (const id of row) {
    assert.ok(id === ' ' || id === '~' || provinces[id], 'Undefined code ' + id);
  }
  for (const province of Object.values(provinces)) {
    assert.equal(province.id.length, 1);
    assert.equal(province.id, province.type === 'land' ?
      province.id.toUpperCase() : province.id.toLowerCase());
    assert.ok(province.name);
    assert.ok(province.hexes.length >= (province.type === 'land' ? 3 : 1));
    assert.ok(province.centre.every(Number.isFinite));
    const cells = new Map(province.hexes.map(([x, y]) => [x + ',' + y, [x, y]]));
    const clusters = components([...cells.keys()], key => {
      const [x, y] = cells.get(key);
      return E.MAP.neighbours(x, y).map(([a, b]) => a + ',' + b);
    });
    assert.equal(clusters.length, 1, province.name + ' must be one hex cluster');
    const found = new Set();
    for (const [x, y] of province.hexes) {
      assert.equal(rows[y][x], province.id);
      for (const [nx, ny] of E.MAP.neighbours(x, y)) {
        const id = rows[ny]?.[nx];
        if (id !== province.id && provinces[id]) found.add(id);
      }
    }
    assert.deepEqual(adjacency[province.id], [...found].sort());
    for (const other of found) assert.ok(adjacency[other].includes(province.id));
    assert.equal(province.coastal, province.type === 'land' &&
      [...found].some(id => provinces[id].type === 'sea'));
  }
  assert.equal(components(all).length, 1, 'whole province graph');
});

test('three geographic land components and fleet-only access across water', () => {
  const parts = components(land);
  assert.equal(parts.length, 3);
  const thrace = byName('Byzantion'), cyprus = byName('Salamis'), mainland = byName('Ankyra');
  assert.ok(parts.find(part => part.includes(thrace.id)));
  assert.ok(parts.find(part => part.includes(cyprus.id)));
  assert.ok(!parts.find(part => part.includes(mainland.id)).includes(thrace.id));
  assert.ok(!parts.find(part => part.includes(mainland.id)).includes(cyprus.id));
  assert.ok(!parts.find(part => part.includes(thrace.id)).includes(cyprus.id));
  assert.ok(thrace.coastal && cyprus.coastal);
  assert.ok(adjacency[thrace.id].some(id =>
    ['Pontus West', 'Propontis', 'Hellespont', 'Aegean North'].includes(provinces[id].name)));
  assert.ok(adjacent(cyprus.id, byName('Cyprian Sea').id));
  const coast = byName('Nikomedeia');
  for (const destination of [thrace.id, cyprus.id]) {
    assert.equal(reachable(coast.id, destination, 'army'), false);
    assert.equal(reachable(coast.id, destination, 'fleet'), true);
  }
  const route = ['Pontus West', 'Propontis', 'Hellespont', 'Aegean North'].map(name => byName(name).id);
  for (let i = 1; i < route.length; i++) {
    assert.ok(E.canMove(unit(route[i - 1], p[0], 'fleet'), route[i]));
  }
  assert.match(E.MAP.rules, /No convoys/);
  assert.match(E.MAP.rules, /Thrace.*Cyprus/);
});

test('real-geography orientation and eastern Pontic coast', () => {
  assert.ok(byName('Aizanoi').centre[0] < byName('Ankyra').centre[0]);
  /* Canvas y increases southwards. */
  assert.ok(byName('Aizanoi').centre[1] > byName('Nikomedeia').centre[1]);
  const east = byName('Trapezous');
  for (const name of ['Herakleia Pontike', 'Sinope', 'Amisos']) {
    assert.ok(byName(name).centre[0] < east.centre[0]);
  }
  const generator = new URL('../scripts/arcade/build-anatolian-pact-map.mjs', import.meta.url);
  assert.ok(fs.existsSync(generator));
  const text = fs.readFileSync(generator, 'utf8');
  assert.match(text, /Natural Earth/);
  assert.match(text, /public domain/);
  assert.match(src('map-data.js'), /Do not edit by hand/);
});

test('24 centres, eighteen owned homes, six neutrals and valid starting units', () => {
  const centres = Object.values(provinces).filter(province => province.sc);
  assert.equal(centres.length, 24);
  assert.equal(centres.filter(province => province.home).length, 18);
  const neutrals = centres.filter(province => !province.home);
  assert.equal(neutrals.length, 6);
  const game = E.create(), units = game.units();
  assert.equal(units.length, 18);
  assert.equal(new Set(units.map(unit => unit.at)).size, 18);
  assert.equal(powers.length, 6);
  for (const power of powers) {
    assert.equal(power.homes.length, 3);
    assert.equal(centres.filter(province => province.home === power.id).length, 3);
    const own = units.filter(unit => unit.power === power.id);
    assert.equal(own.length, 3);
    assert.ok(own.every(u => power.homes.includes(u.at) && provinces[u.at].home === power.id));
    const fleets = own.filter(u => u.type === 'fleet');
    assert.equal(fleets.length, ['Lydia', 'Caria', 'Bithynia', 'Cilicia'].includes(power.id) ? 1 : 0);
    assert.ok(fleets.every(u => provinces[u.at].coastal));
  }
  const distances = powers.map(power => {
    const best = Object.fromEntries(all.map(id => [id, Infinity]));
    for (const u of units.filter(u => u.power === power.id)) {
      const queue = [[u.at, 0]], seen = new Set([u.at]);
      for (let i = 0; i < queue.length; i++) {
        const [id, depth] = queue[i];
        best[id] = Math.min(best[id], depth);
        for (const n of adjacency[id]) if (!seen.has(n) && E.canMove({ ...u, at: id }, n)) {
          seen.add(n); queue.push([n, depth + 1]);
        }
      }
    }
    return best;
  });
  powers.forEach((power, index) => {
    const first = neutrals.filter(n =>
      distances[index][n.id] === Math.min(...distances.map(d => d[n.id]))).length;
    assert.ok(first >= 1 && first <= 2, power.id + ': earliest neutral opportunities = ' + first);
  });
});

test('simple movement, equal attacks, supported dislodgement and head-to-head', () => {
  assert.equal(E.adjudicate([unit(a)], [move(a, b)]).units[0].at, b);
  const bounce = E.adjudicate([unit(a), unit(c, p[1])], [move(a, b), move(c, b)]);
  assert.equal(outcome(bounce, a), 'bounce');
  assert.equal(outcome(bounce, c), 'bounce');
  assert.ok(bounce.standoffs.includes(b));
  assert.ok(!bounce.units.some(u => u.at === b));
  const supported = E.adjudicate([unit(a), unit(b, p[1]), unit(c)],
    [move(a, b), support(c, a, b)]);
  assert.equal(outcome(supported, a), 'success');
  assert.deepEqual(supported.dislodged, [{ ...unit(b, p[1]), attacker: a }]);
  const head = E.adjudicate([unit(a), unit(b, p[1])], [move(a, b), move(b, a)]);
  assert.equal(outcome(head, a), 'bounce');
  const strong = E.adjudicate([unit(a), unit(b, p[1]), unit(c)],
    [move(a, b), move(b, a), support(c, a, b)]);
  assert.equal(outcome(strong, a), 'success');
  assert.equal(outcome(strong, b), 'dislodged');
});

test('support cutting, destination exception and friendly attacks', () => {
  const [x, y, z, d] = tripleWithExtra();
  const cut = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d, p[2])],
    [move(x, y), support(z, x, y), move(d, z)]);
  assert.equal(outcome(cut, z), 'cut');
  assert.equal(outcome(cut, x), 'bounce');
  const friendly = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d)],
    [move(x, y), support(z, x, y), move(d, z)]);
  assert.equal(outcome(friendly, z), 'success');
  const exception = E.adjudicate([unit(a), unit(b, p[1]), unit(c)],
    [move(a, b), move(b, c), support(c, a, b)]);
  assert.equal(outcome(exception, c), 'success');
  assert.equal(outcome(exception, a), 'success');
});

test('rotation, self-dislodgement, defender-owned support and beleaguered garrison', () => {
  for (const owners of [[p[0], p[1], p[2]], [p[0], p[0], p[0]]]) {
    const battle = E.adjudicate([unit(a, owners[0]), unit(b, owners[1]), unit(c, owners[2])],
      [move(a, b), move(b, c), move(c, a)]);
    assert.ok(battle.resolution.every(order => order.outcome === 'success'));
    assert.equal(battle.dislodged.length, 0);
  }
  const own = E.adjudicate([unit(a), unit(b), unit(c)], [move(a, b), support(c, a, b)]);
  assert.equal(outcome(own, a), 'bounce');
  const enemy = E.adjudicate([unit(a), unit(b, p[1]), unit(c, p[1])],
    [move(a, b), support(c, a, b)]);
  assert.equal(enemy.dislodged.length, 0);
  const garrison = E.adjudicate([unit(a), unit(b, p[1]), unit(c, p[2])],
    [move(a, b), move(c, b)]);
  assert.equal(garrison.dislodged.length, 0);
});

test('failed departures block followers; support-hold cannot defend a moving unit', () => {
  const [x, y, z, d] = tripleWithExtra();
  const blocked = E.adjudicate([unit(x), unit(y, p[1]), unit(d, p[2])],
    [move(x, y), move(y, z), move(d, z)]);
  assert.equal(outcome(blocked, x), 'bounce');
  assert.equal(outcome(blocked, y), 'bounce');
  const moving = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d, p[1])],
    [move(x, y), support(z, x, y), move(y, z), support(d, y)]);
  assert.equal(outcome(moving, x), 'success');
  assert.equal(outcome(moving, y), 'dislodged');
});

test('head-to-head defence counts support from the attacking power', () => {
  const edge = land.flatMap(x => adjacency[x].filter(y => land.includes(y)).map(y => [x, y]))
    .find(([x, y]) => land.filter(z => adjacent(z, x) && adjacent(z, y)).length >= 2);
  assert.ok(edge, 'missing shared-neighbour adjudication motif');
  const [x, y] = edge, [z, d] = land.filter(id => adjacent(id, x) && adjacent(id, y));
  const battle = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d)],
    [move(x, y), move(y, x), support(z, x, y), support(d, y, x)]);
  assert.equal(outcome(battle, x), 'bounce');
  assert.equal(outcome(battle, y), 'bounce');
});

test('invalid and duplicate orders become holds, including submitted invalid orders', () => {
  assert.equal(outcome(E.adjudicate([unit(a)], [move(a, '~')]), a), 'invalid');
  assert.equal(outcome(E.adjudicate([unit(a)], [move(a, b), hold(a)]), a), 'invalid');
  const game = fixture([unit(a)]);
  assert.equal(game.submitOrders(p[0], [move(a, '~')]).normalized[0].type, 'hold');
  assert.equal(game.advance().resolution[0].outcome, 'invalid');
});

test('army and fleet terrain restrictions, including common-sea coastal movement', () => {
  const coastal = land.find(id => provinces[id].coastal);
  const sea = adjacency[coastal].find(id => provinces[id].type === 'sea');
  assert.equal(E.canMove(unit(coastal), sea), false);
  assert.equal(E.canMove(unit(coastal, p[0], 'fleet'), sea), true);
  const inland = land.find(id => !provinces[id].coastal &&
    adjacency[id].some(other => provinces[other].coastal));
  assert.ok(inland);
  const coast = adjacency[inland].find(id => provinces[id].coastal);
  assert.equal(E.canMove(unit(coast, p[0], 'fleet'), inland), false);
  for (const from of land.filter(id => provinces[id].coastal)) {
    for (const to of adjacency[from].filter(id => provinces[id].coastal)) {
      const common = adjacency[from].some(id =>
        provinces[id].type === 'sea' && adjacency[to].includes(id));
      assert.equal(E.canMove(unit(from, p[0], 'fleet'), to), common);
    }
  }
});

test('retreat exclusions, explicit disband, collisions and deterministic defaults', () => {
  const displaced = { ...unit(b, p[1]), attacker: a };
  assert.ok(!E.retreatOptions(displaced, [unit(c)], [c]).includes(a));
  assert.ok(!E.retreatOptions(displaced, [unit(c)], []).includes(c));
  assert.ok(!E.retreatOptions(displaced, [], [c]).includes(c));
  const destination = adjacency[b].find(id => land.includes(id) && id !== a);
  assert.ok(destination);
  assert.equal(E.resolveRetreats([], [displaced], [], { [p[1]]: { [b]: destination } }).units[0].at, destination);
  assert.equal(E.resolveRetreats([], [displaced], [], { [p[1]]: { [b]: a } }).units.length, 0);
  assert.equal(E.resolveRetreats([], [displaced], [], { [p[1]]: { [b]: null } }).units.length, 0);
  let motif;
  search: for (const x of land) for (const y of land) {
    const common = adjacency[x].filter(id => land.includes(id) && adjacent(y, id) && id !== x && id !== y);
    if (x !== y && common.length >= 2) { motif = [x, y, common[0], common[1]]; break search; }
  }
  assert.ok(motif);
  const [x, y, attacker, target] = motif;
  const units = [{ ...unit(x), attacker }, { ...unit(y, p[1]), attacker }];
  const collision = E.resolveRetreats([], units, [], {
    [p[0]]: { [x]: target }, [p[1]]: { [y]: target }
  });
  assert.equal(collision.units.length, 0);
  assert.ok(collision.events.every(event => event.to === null));
  assert.equal(E.resolveRetreats([], [units[0]], [], {}).units[0].at,
    E.retreatOptions(units[0], [], [])[0]);
});

test('retreat phase rejects attacker origin and proceeds to Autumn', () => {
  const game = fixture([unit(a), unit(b, p[1]), unit(c)]);
  issue(game, [move(a, b), support(c, a, b)]);
  assert.equal(game.phase, 'retreats');
  assert.equal(game.submitRetreats(p[1], { [b]: a }).ok, false);
  const dest = game.botState(p[1]).retreats[0].options[0] || null;
  assert.equal(game.submitRetreats(p[1], { [b]: dest }).ok, true);
  game.advance();
  assert.equal(game.season, 'Autumn');
  assert.equal(game.phase, 'negotiate-propose');
});

test('ownership changes after Autumn, not Spring', () => {
  const target = land.find(id => provinces[id].sc && !provinces[id].home &&
    adjacency[id].some(n => provinces[n].type === 'land'));
  assert.ok(target);
  const from = adjacency[target].find(id => provinces[id].type === 'land');
  const game = fixture([unit(from)], { owners: nullOwners() });
  issue(game, [move(from, target)]);
  assert.equal(game.owners()[target], null);
  game.advance(); game.advance(); game.advance();
  assert.equal(game.owners()[target], p[0]);
  assert.equal(game.phase, 'builds');
});

test('builds require empty owned home centres and fleet builds require a coast', () => {
  const home = powers[0].homes.find(id => !provinces[id].coastal);
  assert.ok(home);
  const neutral = land.find(id => provinces[id].sc && !provinces[id].home);
  const owners = { ...nullOwners(), [home]: p[0], [neutral]: p[0] };
  const game = fixture([], { phase: 'builds', owners });
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: neutral }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: powers[1].homes[0] }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'fleet', at: home }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: home }, { type: 'army', at: home }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: home }]).ok, true);
  game.advance();
  assert.deepEqual(game.units(), [unit(home)]);
  assert.equal(game.year, 2);
  const occupied = fixture([unit(home)], { phase: 'builds', owners });
  assert.equal(occupied.submitBuilds(p[0], [{ type: 'army', at: home }]).ok, false);
});

test('forced disbands remove distant units and respect explicit selection', () => {
  const home = powers[0].homes[0], queue = powers[0].homes.map(at => [at, 0]), distances = {};
  for (let i = 0; i < queue.length; i++) {
    const [id, depth] = queue[i];
    if (Object.hasOwn(distances, id)) continue;
    distances[id] = depth;
    for (const n of adjacency[id]) if (!Object.hasOwn(distances, n)) queue.push([n, depth + 1]);
  }
  const far = land.filter(id => distances[id] > 0)
    .sort((x, y) => distances[y] - distances[x] || x.localeCompare(y))[0];
  const owners = { ...nullOwners(), [home]: p[0] };
  const automatic = fixture([unit(home), unit(far)], { phase: 'builds', owners });
  automatic.advance();
  assert.deepEqual(automatic.units(), [unit(home)]);
  const selected = fixture([unit(home), unit(far)], { phase: 'builds', owners });
  assert.equal(selected.submitBuilds(p[0], [{ disband: home }]).ok, true);
  selected.advance();
  assert.deepEqual(selected.units(), [unit(far)]);
});

function negotiate(game, from, list) {
  assert.equal(game.submitProposals(from, list).ok, true);
  game.advance();
  assert.equal(game.phase, 'negotiate-answer');
  p.forEach(power => assert.equal(game.submitAnswers(power, Object.fromEntries(game.proposals()
    .filter(proposal => proposal.to === power).map(proposal => [proposal.id, 'accept']))).ok, true));
  game.advance();
  assert.equal(game.phase, 'orders');
}

test('proposal validation, answer validation, limits and accepted peace promises', () => {
  const game = E.create(), proposal = { to: p[1], type: 'peace', terms: {} };
  assert.equal(game.submitProposals(p[0], Array(7).fill(proposal)).ok, false);
  assert.equal(game.submitProposals(p[0], [{ ...proposal, to: p[0] }]).ok, false);
  assert.equal(game.submitProposals(p[0], [{ ...proposal, type: 'dmz', terms: { province: '?' } }]).ok, false);
  assert.equal(game.submitProposals(p[0], Array(6).fill(proposal)).ok, true);
  game.advance();
  assert.equal(game.proposals().length, 6);
  assert.equal(game.submitAnswers(p[1], { missing: 'accept' }).ok, false);
  const inbox = game.botState(p[1]).inbox;
  assert.equal(game.submitAnswers(p[1], { [inbox[0].id]: 'accept', [inbox[1].id]: 'reject' }).ok, true);
  game.advance();
  assert.equal(game.proposals().filter(proposal => proposal.status === 'accepted').length, 1);
  assert.equal(game.botState(p[0]).accepted.length, 2);
  game.advance();
  assert.equal(game.botState(p[0]).trust[p[0]].kept, 1);
  assert.equal(game.botState(p[1]).trust[p[1]].kept, 1);
});

test('peace and dmz are broken by issued attacks even when they bounce', () => {
  const game = fixture([unit(a), unit(b, p[1])], { phase: 'negotiate-propose' });
  negotiate(game, p[0], [
    { to: p[1], type: 'peace', terms: {} },
    { to: p[1], type: 'dmz', terms: { province: b } }
  ]);
  const result = issue(game, [move(a, b)]);
  assert.equal(result.events.filter(event => event.type === 'promise' &&
    event.power === p[0] && event.outcome === 'broken').length, 2);
  assert.equal(game.botState(p[0]).trust[p[0]].broken, 2);
  assert.equal(game.botState(p[0]).trust[p[1]].kept, 2);
});

test('support promises and request-support use the proper promising power', () => {
  for (const keep of [true, false]) {
    const game = fixture([unit(a, p[1]), unit(c)], { phase: 'negotiate-propose' });
    negotiate(game, p[0], [{ to: p[1], type: 'support', terms: { unit: a, dest: b } }]);
    issue(game, [move(a, b), ...(keep ? [support(c, a, b)] : [])]);
    const record = game.botState(p[0]).trust[p[0]];
    assert.equal(record.kept, keep ? 1 : 0);
    assert.equal(record.broken, keep ? 0 : 1);
    assert.equal(game.botState(p[1]).trust[p[1]].promisesMade, 0);
  }
  const game = fixture([unit(a), unit(b, p[2]), unit(c, p[1])], { phase: 'negotiate-propose' });
  assert.equal(game.submitProposals(p[1], [{ to: p[2], type: 'peace', terms: {} }]).ok, true);
  negotiate(game, p[0], [{ to: p[1], type: 'request-support', terms: { unit: a, dest: b } }]);
  issue(game, [move(a, b), support(c, a, b)]);
  assert.equal(game.botState(p[0]).trust[p[1]].kept, 1);
  assert.equal(game.botState(p[0]).trust[p[1]].broken, 1);
});

test('thirteen centres wins; year limit selects leaders and shares ties', () => {
  const sc = Object.keys(nullOwners()), majority = nullOwners();
  sc.slice(0, 13).forEach(id => { majority[id] = p[0]; });
  const game = fixture([], { season: 'Autumn', owners: majority });
  game.advance();
  assert.equal(game.result().winner, p[0]);
  assert.equal(game.result().reason, 'majority');
  const limited = owners => E.create({
    maxYears: 1, setup: { phase: 'orders', season: 'Autumn', units: [], owners }
  });
  const winner = limited({ ...nullOwners(), [sc[0]]: p[0], [sc[1]]: p[1], [sc[2]]: p[1] });
  winner.advance();
  assert.equal(winner.result().winner, p[1]);
  const tied = limited({ ...nullOwners(), [sc[0]]: p[0], [sc[1]]: p[1] });
  tied.advance();
  assert.deepEqual(tied.result().shared, [p[0], p[1]]);
  assert.equal(tied.result().placements[0].rank, 1);
  assert.equal(tied.result().placements[1].rank, 1);
});

test('snapshots are detached and history retains six seasons without hard-coded province IDs', () => {
  const game = E.create({ maxYears: 8 }), state = game.botState(p[0]);
  const id = state.map.provinces[0].id, home = powers[0].homes[0];
  state.map.provinces[0].hexes[0][0] = -999;
  state.map.adjacency[a].length = 0;
  state.units[0].at = '?'; state.owners[home] = '?'; state.trust[p[0]].broken = 999;
  assert.notEqual(provinces[id].hexes[0][0], -999);
  assert.notEqual(game.units()[0].at, '?');
  assert.notEqual(game.owners()[home], '?');
  assert.ok(game.botState(p[0]).map.adjacency[a].length);
  while (!game.finished()) game.advance();
  assert.equal(game.botState(p[0]).history.length, 6);
  const result = game.result(); result.centres[p[0]] = 1000;
  assert.notEqual(game.result().centres[p[0]], 1000);
});

test('mulberry32 matches its reference', () => {
  for (const seed of [0, 1, 42, 4294967295]) {
    let a = seed >>> 0;
    const random = E.rng(seed);
    for (let i = 0; i < 30; i++) {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      assert.equal(random(), ((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
  }
});

const bots = ['sample-schemer', 'sample-schemer', 'sample-expander',
  'sample-expander', 'sample-turtle', 'sample-turtle'].map(id => loadUmd('bots/' + id + '.js', E));
function play(seed) {
  const game = E.create({ seed, maxYears: 8 });
  const methods = {
    'negotiate-propose': ['propose', 'submitProposals'],
    'negotiate-answer': ['answer', 'submitAnswers'],
    orders: ['orders', 'submitOrders'], retreats: ['retreats', 'submitRetreats'],
    builds: ['builds', 'submitBuilds']
  };
  let steps = 0;
  while (!game.finished()) {
    assert.ok(++steps < 160);
    const [method, submit] = methods[game.phase];
    powers.forEach((power, index) => {
      const state = game.botState(power.id);
      if (!state.centresByPower[power.id] && !state.units.some(unit => unit.power === power.id)) return;
      const payload = bots[index][method](state), submitted = game[submit](power.id, payload);
      assert.equal(submitted.ok, true, power.id + ' ' + method + ': ' + JSON.stringify(payload));
      if (method === 'orders') assert.ok(submitted.normalized.every(order => order.valid));
    });
    game.advance();
    assert.equal(new Set(game.units().map(unit => unit.at)).size, game.units().length);
    game.units().forEach(unit => assert.ok(unit.type === 'army' ? provinces[unit.at].type === 'land' :
      provinces[unit.at].type === 'sea' || provinces[unit.at].coastal));
  }
  return { result: game.result(), history: game.botState(p[0]).history };
}
test('six sample bots complete eight years with deterministic replay and valid trust totals', () => {
  const first = play(2026);
  assert.ok(first.result.year <= 8);
  assert.equal(first.result.placements.length, 6);
  assert.ok(['years', 'majority'].includes(first.result.reason));
  for (const record of Object.values(first.result.trust)) {
    assert.equal(record.made, record.kept + record.broken);
    assert.ok(Number.isInteger(record.broken));
  }
  assert.deepEqual(first, play(2026));
});
