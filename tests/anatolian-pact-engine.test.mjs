import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const src = file => fs.readFileSync(new URL('../frontend/arcade/anatolian-pact/' + file, import.meta.url), 'utf8');
const loadUmd = (file, PactEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, PactEngine) {\n${src(file)}\n})`, { filename: file })
    .runInThisContext()(m, m.exports, PactEngine);
  return m.exports;
};
const E = loadUmd('engine.js');
const { provinces, adjacency, powers, rows } = E.MAP;
const land = Object.keys(provinces).filter(id => provinces[id].type === 'land');
const adjacent = (a, b) => adjacency[a].includes(b);
const triangle = land.flatMap(a => adjacency[a].filter(b => land.includes(b)).flatMap(b =>
  adjacency[b].filter(c => land.includes(c) && c !== a && adjacent(c, a)).map(c => [a, b, c])))[0];
assert.ok(triangle, 'The real map must contain a land triangle');
const [a, b, c] = triangle;
const p = powers.map(power => power.id);
const unit = (at, power = p[0], type = 'army') => ({ power, type, at });
const move = (unit, dest) => ({ unit, type: 'move', dest });
const support = (unit, target, targetDest = 'hold') => ({ unit, type: 'support', target, targetDest });
const hold = unit => ({ unit, type: 'hold' });
const outcome = (battle, at) => battle.resolution.find(order => order.unit === at).outcome;
const nullOwners = () => Object.fromEntries(Object.values(provinces)
  .filter(province => province.sc).map(province => [province.id, null]));

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
  for (const x of land) {
    for (const y of adjacency[x].filter(id => land.includes(id))) {
      for (const z of adjacency[x].filter(id => land.includes(id) && id !== y && adjacent(id, y))) {
        const d = adjacency[z].find(id => land.includes(id) && ![x, y, z].includes(id));
        if (d) return [x, y, z, d];
      }
    }
  }
  throw new Error('Missing four-province motif');
}

// These tests use immutable map data and an explicit, detached setup fixture.
test('ASCII rows, named connected clusters, computed symmetric adjacency and coastlines', () => {
  assert.ok(rows.length >= 12, 'the map needs real height');
  assert.ok(rows.every(row => row.length === rows[0].length && /^[\x20-\x7e]+$/.test(row)), 'equal-length printable rows');
  for (const province of Object.values(provinces)) {
    assert.ok(province.name);
    assert.ok(province.hexes.length);
    assert.ok(province.centre.every(Number.isFinite));
    const cells = new Set(province.hexes.map(([x, y]) => x + ',' + y));
    const queue = [province.hexes[0]];
    const seen = new Set();
    const found = new Set();
    for (let index = 0; index < queue.length; index++) {
      const [x, y] = queue[index];
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      assert.equal(rows[y][x], province.id);
      const offset = y % 2 ? 1 : -1;
      const neighbours = [
        [x - 1, y], [x + 1, y], [x, y - 1],
        [x + offset, y - 1], [x, y + 1], [x + offset, y + 1]
      ];
      for (const [nx, ny] of neighbours) {
        const other = rows[ny]?.[nx];
        if (cells.has(nx + ',' + ny)) queue.push([nx, ny]);
        else if (provinces[other]) found.add(other);
      }
    }
    assert.equal(seen.size, cells.size, province.id + ' must be connected');
    assert.deepEqual(adjacency[province.id], Array.from(found).sort());
    adjacency[province.id].forEach(other => assert.ok(adjacency[other].includes(province.id)));
    assert.equal(province.coastal, province.type === 'land' &&
      adjacency[province.id].some(id => provinces[id].type === 'sea'));
  }
  const reached = new Set([land[0]]);
  const queue = [land[0]];
  for (let index = 0; index < queue.length; index++) {
    adjacency[queue[index]].filter(id => land.includes(id) && !reached.has(id)).forEach(id => {
      reached.add(id);
      queue.push(id);
    });
  }
  assert.equal(reached.size, land.length);
});

test('24 centres, eighteen homes, six neutrals, three homes and valid units per power', () => {
  const centres = Object.values(provinces).filter(province => province.sc);
  assert.equal(centres.length, 24);
  assert.equal(centres.filter(province => province.home).length, 18);
  assert.equal(centres.filter(province => !province.home).length, 6);
  const game = E.create();
  assert.equal(game.units().length, 18);
  assert.equal(new Set(game.units().map(unit => unit.at)).size, 18);
  for (const power of powers) {
    assert.equal(centres.filter(province => province.home === power.id).length, 3);
    assert.equal(game.units().filter(unit => unit.power === power.id).length, 3);
    assert.ok(power.homes.some(home => adjacency[home].some(id =>
      provinces[id].sc && !provinces[id].home)), power.id + ' has an adjacent neutral opportunity');
  }
  game.units().forEach(unit => {
    const province = provinces[unit.at];
    assert.equal(province.home, unit.power);
    assert.ok(unit.type === 'army' ? province.type === 'land' : province.coastal);
  });
});

test('a simple move succeeds', () => {
  const battle = E.adjudicate([unit(a)], [move(a, b)]);
  assert.equal(battle.units[0].at, b);
  assert.equal(outcome(battle, a), 'success');
});

test('equal attacks bounce and leave an empty target empty', () => {
  const battle = E.adjudicate([unit(a), unit(c, p[1])], [move(a, b), move(c, b)]);
  assert.equal(outcome(battle, a), 'bounce');
  assert.equal(outcome(battle, c), 'bounce');
  assert.ok(!battle.units.some(unit => unit.at === b));
  assert.ok(battle.standoffs.includes(b));
});

test('supported move dislodges a hold', () => {
  const battle = E.adjudicate([unit(a), unit(b, p[1]), unit(c)], [move(a, b), support(c, a, b)]);
  assert.equal(outcome(battle, a), 'success');
  assert.equal(outcome(battle, b), 'dislodged');
  assert.deepEqual(battle.dislodged, [{ ...unit(b, p[1]), attacker: a }]);
});

test('support is cut by a third-province attack even if that attack bounces', () => {
  const [x, y, z, d] = tripleWithExtra();
  const battle = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d, p[2])],
    [move(x, y), support(z, x, y), move(d, z)]);
  assert.equal(outcome(battle, z), 'cut');
  assert.equal(outcome(battle, x), 'bounce');
  assert.equal(outcome(battle, d), 'bounce');
});

test('support is not cut by an attack from its destination', () => {
  const battle = E.adjudicate([unit(a), unit(b, p[1]), unit(c)],
    [move(a, b), move(b, c), support(c, a, b)]);
  assert.equal(outcome(battle, c), 'success');
  assert.equal(outcome(battle, a), 'success');
  assert.equal(outcome(battle, b), 'dislodged');
});

test('a friendly attack does not cut support', () => {
  const [x, y, z, d] = tripleWithExtra();
  const battle = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d)],
    [move(x, y), support(z, x, y), move(d, z)]);
  assert.equal(outcome(battle, z), 'success');
  assert.equal(outcome(battle, x), 'success');
});

test('equal head-to-head stays; supported head-to-head dislodges', () => {
  const equal = E.adjudicate([unit(a), unit(b, p[1])], [move(a, b), move(b, a)]);
  assert.equal(outcome(equal, a), 'bounce');
  assert.equal(outcome(equal, b), 'bounce');
  const stronger = E.adjudicate([unit(a), unit(b, p[1]), unit(c)],
    [move(a, b), move(b, a), support(c, a, b)]);
  assert.equal(outcome(stronger, a), 'success');
  assert.equal(outcome(stronger, b), 'dislodged');
  assert.ok(!stronger.units.some(unit => unit.at === a));
});

test('head-to-head defence counts all support, even from the attacking power', () => {
  const edge = land.flatMap(x => adjacency[x].filter(y => land.includes(y)).map(y => [x, y]))
    .find(([x, y]) => land.filter(z => adjacent(z, x) && adjacent(z, y)).length >= 2);
  assert.ok(edge);
  const [x, y] = edge;
  const [z, d] = land.filter(id => adjacent(id, x) && adjacent(id, y));
  const battle = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d)],
    [move(x, y), move(y, x), support(z, x, y), support(d, y, x)]);
  assert.equal(outcome(battle, x), 'bounce');
  assert.equal(outcome(battle, y), 'bounce');
  assert.equal(battle.dislodged.length, 0);
});

test('three-unit rotation succeeds, including a single-power rotation', () => {
  for (const owners of [[p[0], p[1], p[2]], [p[0], p[0], p[0]]]) {
    const battle = E.adjudicate([unit(a, owners[0]), unit(b, owners[1]), unit(c, owners[2])],
      [move(a, b), move(b, c), move(c, a)]);
    assert.ok(battle.resolution.every(order => order.outcome === 'success'));
    assert.equal(battle.dislodged.length, 0);
    assert.equal(battle.units.length, 3);
  }
});

test('no self-dislodgement and no defender-owned support for dislodgement', () => {
  const own = E.adjudicate([unit(a), unit(b), unit(c)], [move(a, b), support(c, a, b)]);
  assert.equal(outcome(own, a), 'bounce');
  const enemy = E.adjudicate([unit(a), unit(b, p[1]), unit(c, p[1])],
    [move(a, b), support(c, a, b)]);
  assert.equal(outcome(enemy, a), 'bounce');
  assert.equal(enemy.dislodged.length, 0);
});

test('beleaguered garrison survives two equal attacks', () => {
  const battle = E.adjudicate([unit(a), unit(b, p[1]), unit(c, p[2])], [move(a, b), move(c, b)]);
  assert.equal(battle.dislodged.length, 0);
  assert.equal(outcome(battle, a), 'bounce');
  assert.equal(outcome(battle, c), 'bounce');
  assert.ok(battle.units.some(unit => unit.at === b && unit.power === p[1]));
});

test('a failed departure blocks the following move', () => {
  const [x, y, z, d] = tripleWithExtra();
  const battle = E.adjudicate([unit(x), unit(y, p[1]), unit(d, p[2])],
    [move(x, y), move(y, z), move(d, z)]);
  assert.equal(outcome(battle, y), 'bounce');
  assert.equal(outcome(battle, x), 'bounce');
});

test('support-hold cannot defend a unit ordered to move', () => {
  const [x, y, z, d] = tripleWithExtra();
  const battle = E.adjudicate([unit(x), unit(y, p[1]), unit(z), unit(d, p[1])],
    [move(x, y), support(z, x, y), move(y, z), support(d, y)]);
  assert.equal(outcome(battle, x), 'success');
  assert.equal(outcome(battle, y), 'dislodged');
});

test('invalid and duplicate orders normalize to holds, including through submitOrders', () => {
  const battle = E.adjudicate([unit(a)], [move(a, '~')]);
  assert.equal(battle.units[0].at, a);
  assert.equal(outcome(battle, a), 'invalid');
  const duplicate = E.adjudicate([unit(a)], [move(a, b), hold(a)]);
  assert.equal(outcome(duplicate, a), 'invalid');
  const game = fixture([unit(a)]);
  const submitted = game.submitOrders(p[0], [move(a, '~')]);
  assert.equal(submitted.normalized[0].type, 'hold');
  assert.equal(game.advance().resolution[0].outcome, 'invalid');
});

test('armies cannot enter seas; fleets cannot enter inland or cross unrelated coasts', () => {
  const coastal = land.find(id => provinces[id].coastal);
  const sea = adjacency[coastal].find(id => provinces[id].type === 'sea');
  assert.equal(E.canMove(unit(coastal), sea), false);
  assert.equal(outcome(E.adjudicate([unit(coastal)], [move(coastal, sea)]), coastal), 'invalid');
  const inland = land.find(id => !provinces[id].coastal &&
    adjacency[id].some(other => provinces[other].coastal));
  const coast = adjacency[inland].find(id => provinces[id].coastal);
  assert.equal(E.canMove(unit(coast, p[0], 'fleet'), inland), false);
  assert.equal(E.canMove(unit(coastal, p[0], 'fleet'), sea), true);
  for (const from of land.filter(id => provinces[id].coastal)) {
    for (const to of adjacency[from].filter(id => provinces[id].coastal)) {
      const common = adjacency[from].some(id =>
        provinces[id].type === 'sea' && adjacency[to].includes(id));
      assert.equal(E.canMove(unit(from, p[0], 'fleet'), to), common);
    }
  }
});

test('retreat options exclude origin of attacker, occupied provinces and standoffs', () => {
  const displaced = { ...unit(b, p[1]), attacker: a };
  const options = E.retreatOptions(displaced, [unit(a), unit(c)], []);
  assert.ok(!options.includes(a));
  assert.ok(!options.includes(c));
  assert.ok(!E.retreatOptions(displaced, [], [c]).includes(c));
  const destination = adjacency[b].find(id => land.includes(id) && id !== a);
  assert.ok(destination);
  const valid = E.resolveRetreats([], [displaced], [], { [p[1]]: { [b]: destination } });
  assert.equal(valid.units[0].at, destination);
  const forbidden = E.resolveRetreats([], [displaced], [], { [p[1]]: { [b]: a } });
  assert.equal(forbidden.units.length, 0);
  const disband = E.resolveRetreats([], [displaced], [], { [p[1]]: { [b]: null } });
  assert.equal(disband.units.length, 0);
});

test('two retreats to one province are both destroyed; default is first valid id', () => {
  // Find two displaced land units x, y sharing an attacker and one more common neighbour on the current map.
  let x, y, attacker, target;
  search: for (const one of land) for (const two of land) for (const by of land) for (const to of land) {
    if (new Set([one, two, by, to]).size < 4) continue;
    if (adjacent(one, by) && adjacent(two, by) && adjacent(one, to) && adjacent(two, to)) { [x, y, attacker, target] = [one, two, by, to]; break search; }
  }
  assert.ok(target, 'the map must allow two retreats into one province');
  const displaced = [{ ...unit(x), attacker }, { ...unit(y, p[1]), attacker }];
  const collision = E.resolveRetreats([], displaced, [], {
    [p[0]]: { [x]: target },
    [p[1]]: { [y]: target }
  });
  assert.equal(collision.units.length, 0);
  assert.ok(collision.events.every(event => event.to === null));
  const single = [displaced[0]];
  const automatic = E.resolveRetreats([], single, [], {});
  assert.equal(automatic.units[0].at, E.retreatOptions(single[0], [], [])[0]);
});

test('game enters retreats and rejects an illegal retreat submission', () => {
  const game = fixture([unit(a), unit(b, p[1]), unit(c)]);
  issue(game, [move(a, b), support(c, a, b)]);
  assert.equal(game.phase, 'retreats');
  assert.equal(game.submitRetreats(p[1], { [b]: a }).ok, false);
  const state = game.botState(p[1]);
  assert.equal(state.retreats.length, 1);
  const dest = state.retreats[0].options[0] || null;
  assert.equal(game.submitRetreats(p[1], { [b]: dest }).ok, true);
  game.advance();
  assert.equal(game.season, 'Autumn');
  assert.equal(game.phase, 'negotiate-propose');
});

test('ownership changes only at end of Autumn and after retreats', () => {
  const target = land.find(id => provinces[id].sc && !provinces[id].home);
  const from = adjacency[target].find(id => land.includes(id));
  const spring = fixture([unit(from)], { owners: nullOwners() });
  issue(spring, [move(from, target)]);
  assert.equal(spring.owners()[target], null);
  spring.advance();
  spring.advance();
  spring.advance();
  assert.equal(spring.owners()[target], p[0]);
  assert.equal(spring.phase, 'builds');
  const autumn = fixture([unit(a), unit(b, p[1]), unit(c)], { season: 'Autumn' });
  issue(autumn, [move(a, b), support(c, a, b)]);
  assert.equal(autumn.phase, 'retreats');
  const old = autumn.owners()[b];
  if (provinces[b].sc) assert.equal(old, provinces[b].home);
  autumn.advance();
  if (provinces[b].sc) assert.equal(autumn.owners()[b], p[0]);
});

test('builds only in empty owned homes; fleet builds require coasts', () => {
  const home = powers[0].homes[0];
  const neutral = land.find(id => provinces[id].sc && !provinces[id].home);
  const owners = { ...nullOwners(), [home]: p[0], [neutral]: p[0] };
  const game = fixture([], { phase: 'builds', owners });
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: neutral }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: powers[1].homes[0] }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'fleet', at: home }]).ok, false);
  assert.equal(game.submitBuilds(p[0], [
    { type: 'army', at: home },
    { type: 'army', at: home }
  ]).ok, false);
  assert.equal(game.submitBuilds(p[0], [{ type: 'army', at: home }]).ok, true);
  game.advance();
  assert.deepEqual(game.units(), [unit(home)]);
  assert.equal(game.year, 2);
  assert.equal(game.season, 'Spring');
  const occupied = fixture([unit(home)], { phase: 'builds', owners });
  assert.equal(occupied.submitBuilds(p[0], [{ type: 'army', at: home }]).ok, false);
});

test('forced disbands remove farthest units and respect selected disbands', () => {
  const home = powers[0].homes[0];
  const queue = powers[0].homes.map(at => [at, 0]);
  const distances = {};
  for (let index = 0; index < queue.length; index++) {
    const [at, distance] = queue[index];
    if (Object.hasOwn(distances, at)) continue;
    distances[at] = distance;
    adjacency[at].forEach(next => queue.push([next, distance + 1]));
  }
  const far = land.filter(id => distances[id] > 0)
    .sort((x, y) => distances[y] - distances[x] || x.localeCompare(y))[0];
  const owners = { ...nullOwners(), [home]: p[0] };
  const game = fixture([unit(home), unit(far)], { phase: 'builds', owners });
  game.advance();
  assert.deepEqual(game.units(), [unit(home)]);
  const explicit = fixture([unit(home), unit(far)], { phase: 'builds', owners });
  assert.equal(explicit.submitBuilds(p[0], [{ disband: home }]).ok, true);
  explicit.advance();
  assert.deepEqual(explicit.units(), [unit(far)]);
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

test('proposal validation, six-proposal limit, answers and accepted promises', () => {
  const game = E.create();
  const proposal = { to: p[1], type: 'peace', terms: {} };
  assert.equal(game.submitProposals(p[0], Array(7).fill(proposal)).ok, false);
  assert.equal(game.submitProposals(p[0], [{ ...proposal, to: p[0] }]).ok, false);
  assert.equal(game.submitProposals(p[0], [{
    ...proposal,
    type: 'dmz',
    terms: { province: '?' }
  }]).ok, false);
  assert.equal(game.submitProposals(p[0], Array(6).fill(proposal)).ok, true);
  game.advance();
  assert.equal(game.proposals().length, 6);
  assert.equal(game.submitAnswers(p[1], { missing: 'accept' }).ok, false);
  const incoming = game.botState(p[1]).inbox;
  assert.equal(incoming.length, 6);
  assert.equal(game.submitAnswers(p[1], {
    [incoming[0].id]: 'accept',
    [incoming[1].id]: 'reject'
  }).ok, true);
  game.advance();
  assert.equal(game.proposals().filter(proposal => proposal.status === 'accepted').length, 1);
  assert.equal(game.proposals().filter(proposal => proposal.status === 'rejected').length, 5);
  assert.equal(game.botState(p[0]).accepted.length, 2);
  assert.equal(game.botState(p[0]).trust[p[0]].promisesMade, 1);
  game.advance();
  assert.equal(game.botState(p[0]).trust[p[0]].kept, 1);
  assert.equal(game.botState(p[1]).trust[p[1]].kept, 1);
});

test('peace and dmz promises are broken by issued attacks, even if they bounce', () => {
  const game = fixture([unit(a), unit(b, p[1])], { phase: 'negotiate-propose' });
  negotiate(game, p[0], [
    { to: p[1], type: 'peace', terms: {} },
    { to: p[1], type: 'dmz', terms: { province: b } }
  ]);
  const result = issue(game, [move(a, b)]);
  assert.equal(result.events.filter(event => event.type === 'promise' &&
    event.power === p[0] && event.outcome === 'broken').length, 2);
  const trust = game.botState(p[0]).trust;
  assert.equal(trust[p[0]].broken, 2);
  assert.equal(trust[p[1]].kept, 2);
  assert.equal(trust[p[0]].brokenPromises[0].season, 'Spring');
  assert.equal(trust[p[0]].brokenPromises[0].year, 1);
});

test('promised support is kept by issuing support, and broken by omitting it', () => {
  for (const keep of [true, false]) {
    const game = fixture([unit(a, p[1]), unit(c)], { phase: 'negotiate-propose' });
    negotiate(game, p[0], [{ to: p[1], type: 'support', terms: { unit: a, dest: b } }]);
    issue(game, [move(a, b), ...(keep ? [support(c, a, b)] : [])]);
    const record = game.botState(p[0]).trust[p[0]];
    assert.equal(record.promisesMade, 1);
    assert.equal(record.kept, keep ? 1 : 0);
    assert.equal(record.broken, keep ? 0 : 1);
    assert.equal(game.botState(p[1]).trust[p[1]].promisesMade, 0);
  }
});

test('request-support makes the recipient promise; supported attacks break peace', () => {
  const game = fixture([unit(a), unit(b, p[2]), unit(c, p[1])], { phase: 'negotiate-propose' });
  assert.equal(game.submitProposals(p[1], [{ to: p[2], type: 'peace', terms: {} }]).ok, true);
  negotiate(game, p[0], [{ to: p[1], type: 'request-support', terms: { unit: a, dest: b } }]);
  issue(game, [move(a, b), support(c, a, b)]);
  const record = game.botState(p[1]).trust[p[1]];
  assert.equal(record.promisesMade, 2);
  assert.equal(record.kept, 1);
  assert.equal(record.broken, 1);
});

test('thirteen centres wins; maxYears selects largest holdings and shares ties', () => {
  const sc = Object.keys(nullOwners());
  const majority = { ...nullOwners() };
  sc.slice(0, 13).forEach(id => { majority[id] = p[0]; });
  const game = fixture([], { season: 'Autumn', owners: majority });
  game.advance();
  assert.equal(game.finished(), true);
  assert.equal(game.result().winner, p[0]);
  assert.equal(game.result().reason, 'majority');
  const owners = { ...nullOwners(), [sc[0]]: p[0], [sc[1]]: p[1], [sc[2]]: p[1] };
  const limit = E.create({
    maxYears: 1,
    setup: { phase: 'orders', season: 'Autumn', units: [], owners }
  });
  limit.advance();
  assert.equal(limit.result().winner, p[1]);
  assert.equal(limit.result().reason, 'years');
  const tied = E.create({
    maxYears: 1,
    setup: {
      phase: 'orders',
      season: 'Autumn',
      units: [],
      owners: { ...nullOwners(), [sc[0]]: p[0], [sc[1]]: p[1] }
    }
  });
  tied.advance();
  assert.equal(tied.result().winner, null);
  assert.deepEqual(tied.result().shared, [p[0], p[1]]);
  assert.equal(tied.result().placements[0].rank, 1);
  assert.equal(tied.result().placements[1].rank, 1);
});

test('public snapshots, botState and result are detached; history retains six seasons', () => {
  const game = E.create({ maxYears: 8 });
  const state = game.botState(p[0]);
  state.map.provinces[0].hexes[0][0] = -999;
  state.map.adjacency[a].length = 0;
  state.units[0].at = '?';
  state.owners.A = '?';
  state.trust[p[0]].broken = 999;
  state.legalOrders[game.units()[0].at].length = 0;
  assert.notEqual(game.units()[0].at, '?');
  assert.notEqual(game.owners().A, '?');
  assert.notEqual(E.MAP.provinces.A.hexes[0][0], -999);
  assert.ok(game.botState(p[0]).map.adjacency[a].length);
  while (!game.finished()) game.advance();
  assert.equal(game.botState(p[0]).history.length, 6);
  const result = game.result();
  result.centres[p[0]] = 1000;
  assert.notEqual(game.result().centres[p[0]], 1000);
});

test('mulberry32 matches a reference implementation', () => {
  for (const seed of [0, 1, 42, 4294967295]) {
    let a = seed >>> 0;
    const random = E.rng(seed);
    for (let index = 0; index < 30; index++) {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      assert.equal(random(), ((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
  }
});

const bots = [
  'sample-schemer',
  'sample-schemer',
  'sample-expander',
  'sample-expander',
  'sample-turtle',
  'sample-turtle'
].map(id => loadUmd('bots/' + id + '.js', E));

function play(seed) {
  const game = E.create({ seed, maxYears: 8 });
  const methods = {
    'negotiate-propose': ['propose', 'submitProposals'],
    'negotiate-answer': ['answer', 'submitAnswers'],
    orders: ['orders', 'submitOrders'],
    retreats: ['retreats', 'submitRetreats'],
    builds: ['builds', 'submitBuilds']
  };
  let steps = 0;
  while (!game.finished()) {
    assert.ok(++steps < 160);
    const [method, submit] = methods[game.phase];
    powers.forEach((power, index) => {
      const state = game.botState(power.id);
      if (!state.centresByPower[power.id] && !state.units.some(unit => unit.power === power.id)) return;
      const payload = bots[index][method](state);
      const submitted = game[submit](power.id, payload);
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

test('six sample bots complete eight years with valid payloads and public trust; deterministic replay', () => {
  const first = play(2026);
  assert.ok(first.result.year <= 8);
  assert.ok(['years', 'majority'].includes(first.result.reason));
  assert.equal(first.result.placements.length, 6);
  assert.ok(Object.values(first.result.trust).some(record => record.made > 0));
  for (const record of Object.values(first.result.trust)) {
    assert.equal(record.made, record.kept + record.broken);
    assert.ok(Number.isInteger(record.broken));
  }
  assert.deepEqual(first, play(2026));
});
