import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = file => fs.readFileSync(new URL('../frontend/arcade/football/' + file, import.meta.url), 'utf8');
const loadUmd = (file, FootballEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, FootballEngine) {\n${src(file)}\n})`, { filename: file })
    .runInThisContext()(m, m.exports, FootballEngine);
  return m.exports;
};
const Engine = loadUmd('engine.js');
const chaser = loadUmd('bots/sample-chaser.js', Engine);
const striker = loadUmd('bots/sample-striker.js', Engine);
const keeper = loadUmd('bots/sample-keeper.js', Engine);

// Instrument only the test copy, keeping arbitrary state mutation out of the public API.
const marker = '    function step(inputs) {';
assert.equal(src('engine.js').split(marker).length, 2);
const fixtureSource = src('engine.js').replace(marker, marker + `
      if (inputs && inputs.__setup) {
        inputs.__setup({ ball, players, setPhase(value) { phase = value; } });
      }
`);
const fixtureModule = { exports: {} };
new vm.Script(`(function (module, exports, FootballEngine) {\n${fixtureSource}\n})`, { filename: 'engine-fixture.js' })
  .runInThisContext()(fixtureModule, fixtureModule.exports, undefined);
const Fixture = fixtureModule.exports;
const seats = [
  { id: 'r', team: 'red', name: 'Red' },
  { id: 'b', team: 'blue', name: 'Blue' }
];

function game(options) {
  return Fixture.create(seats, { time: 120, scoreLimit: 10, ...options });
}

function setup(match, change, inputs = {}) {
  return match.step({ ...inputs, __setup: change });
}

function isolate(context) {
  context.setPhase('play');
  Object.assign(context.players[0], { x: -300, y: 150, vx: 0, vy: 0 });
  Object.assign(context.players[1], { x: 300, y: 150, vx: 0, vy: 0 });
}

function near(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not near ${expected}`);
}

function random(seed) {
  let value = seed >>> 0;
  return function () {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function creditAndScore(match, toucher = 0, goalX = 431) {
  setup(match, context => {
    isolate(context);
    Object.assign(context.players[toucher], { x: -24, y: 0 });
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  });
  return setup(match, context => {
    isolate(context);
    Object.assign(context.ball, { x: goalX, y: 0, vx: 1, vy: 0 });
  });
}

test('same inputs produce identical JSON for 3000 physics steps', () => {
  const first = Engine.create(seats, { time: 100, scoreLimit: 100 });
  const second = Engine.create(seats, { time: 100, scoreLimit: 100 });
  const rng = random(725);
  for (let step = 0; step < 3000; step += 1) {
    const inputs = {};
    for (const seat of seats) inputs[seat.id] = { x: rng() * 2 - 1, y: rng() * 2 - 1, kick: rng() > 0.3 };
    assert.deepEqual(first.step(inputs), second.step(inputs));
    assert.equal(JSON.stringify(first.state()), JSON.stringify(second.state()));
  }
  assert.equal(first.steps, 3000);
});

test('ball damping and field side bounce', () => {
  const match = game();
  setup(match, context => {
    isolate(context);
    Object.assign(context.ball, { x: 0, y: 0, vx: 2, vy: 1 });
  });
  near(match.state().ball.vx, 1.98);
  near(match.state().ball.vy, 0.99);
  setup(match, context => {
    Object.assign(context.ball, { x: 0, y: 189, vx: 0, vy: 3 });
  });
  near(match.state().ball.y, 190);
  near(match.state().ball.vy, -1.485);
});

test('end line blocks shots outside the mouth; a full crossing scores', () => {
  const match = game();
  setup(match, context => {
    isolate(context);
    Object.assign(context.ball, { x: 409, y: 100, vx: 4, vy: 0 });
  });
  near(match.state().ball.x, 410);
  near(match.state().ball.vx, -1.98);
  assert.deepEqual(match.state().score, { red: 0, blue: 0 });
  setup(match, context => {
    Object.assign(context.ball, { x: 419, y: 0, vx: 4, vy: 0 });
  });
  assert.equal(match.state().phase, 'play');
  let events = [];
  for (let step = 0; step < 4; step += 1) events.push(...match.step({}));
  assert.equal(events.filter(event => event.type === 'goal').length, 1);
  assert.deepEqual(match.state().score, { red: 1, blue: 0 });
  const left = game();
  setup(left, context => {
    isolate(context);
    Object.assign(context.ball, { x: -429, y: 0, vx: -4, vy: 0 });
  });
  assert.deepEqual(left.state().score, { red: 0, blue: 1 });
});

test('last toucher gets goal credit, including own goals and a previous-touch assist', () => {
  const match = game();
  const events = creditAndScore(match);
  assert.equal(events.find(event => event.type === 'goal').scorer, 'r');
  assert.equal(events.find(event => event.type === 'goal').ownGoal, false);
  const own = game({ scoreLimit: 1 });
  const ownEvents = creditAndScore(own, 1);
  assert.equal(ownEvents.find(event => event.type === 'goal').ownGoal, true);
  assert.equal(own.result().players[1].ownGoals, 1);
  assert.equal(own.result().players[1].goals, 0);
  const credited = game({ scoreLimit: 1 });
  creditAndScore(credited);
  assert.equal(credited.result().players[0].goals, 1);
  const assisted = Fixture.create([...seats, { id: 'r2', team: 'red', name: 'Support' }], { scoreLimit: 1 });
  setup(assisted, context => {
    isolate(context);
    Object.assign(context.players[2], { x: -300, y: -150 });
    Object.assign(context.players[0], { x: -24, y: 0 });
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  });
  setup(assisted, context => {
    isolate(context);
    Object.assign(context.players[2], { x: -24, y: 0, vx: 0, vy: 0 });
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  });
  const goals = setup(assisted, context => {
    Object.assign(context.ball, { x: 431, y: 0, vx: 1, vy: 0 });
  });
  assert.equal(goals.find(event => event.type === 'goal').scorer, 'r2');
  assert.equal(goals.find(event => event.type === 'goal').assist, 'r');
});

test('post impact deflects the ball', () => {
  const match = game();
  const events = setup(match, context => {
    isolate(context);
    Object.assign(context.ball, { x: 404, y: 52, vx: 5, vy: 0 });
  });
  assert.ok(events.some(event => event.type === 'post'));
  assert.ok(match.state().ball.vy < 0);
  assert.ok(match.state().ball.vx < 4.95);
  assert.equal(match.state().score.red, 0);
});

test('kick range and held cooldown; a new press is a rising edge', () => {
  const match = game();
  function position(distance) {
    return context => {
      isolate(context);
      Object.assign(context.players[0], { x: 0, y: 0 });
      Object.assign(context.ball, { x: distance, y: 0, vx: 0, vy: 0 });
    };
  }
  let events = setup(match, position(31), { r: { kick: true } });
  assert.equal(events.filter(event => event.type === 'kick').length, 0);
  events = setup(match, position(28), { r: { kick: true } });
  assert.equal(events.filter(event => event.type === 'kick').length, 1);
  near(match.state().ball.vx, 5);
  for (let step = 1; step < 10; step += 1) {
    events = setup(match, position(28), { r: { kick: true } });
    assert.equal(events.filter(event => event.type === 'kick').length, 0);
  }
  events = setup(match, position(28), { r: { kick: true } });
  assert.equal(events.filter(event => event.type === 'kick').length, 1);
  setup(match, position(28));
  events = setup(match, position(28), { r: { kick: true } });
  assert.equal(events.filter(event => event.type === 'kick').length, 1);
});

test('player collisions separate overlapping bodies and conserve damped momentum', () => {
  const match = game();
  setup(match, context => {
    context.setPhase('play');
    Object.assign(context.ball, { x: 0, y: 150, vx: 0, vy: 0 });
    Object.assign(context.players[0], { x: -10, y: 0, vx: 1, vy: 0 });
    Object.assign(context.players[1], { x: 10, y: 0, vx: -0.3, vy: 0 });
  });
  const [red, blue] = match.state().players;
  assert.ok(Math.hypot(red.x - blue.x, red.y - blue.y) >= 30 - 1e-8);
  near(2 * (red.vx + blue.vx), 2 * (1 - 0.3) * 0.96);
});

test('kickoff exclusion holds until the kicking team touches', () => {
  const match = game();
  for (let step = 0; step < 120; step += 1) {
    match.step({ b: { x: -1, y: 0, kick: true } });
    const blue = match.state().players[1];
    assert.ok(blue.x >= 15);
    assert.ok(Math.hypot(blue.x, blue.y) >= 85 - 1e-8);
    assert.equal(match.state().phase, 'kickoff');
  }
  setup(match, context => {
    Object.assign(context.players[0], { x: -24, y: 0 });
  });
  assert.equal(match.state().phase, 'play');
  for (let step = 0; step < 30; step += 1) match.step({ b: { x: -1 } });
  assert.ok(match.state().players[1].x < 85);
});

test('goal freezes for 90 steps then conceding team kicks off', () => {
  const match = game();
  creditAndScore(match);
  const frozen = match.state();
  for (let step = 0; step < 89; step += 1) {
    assert.deepEqual(match.step({ r: { x: 1, kick: true } }), []);
    assert.deepEqual(match.state().ball, frozen.ball);
    assert.deepEqual(match.state().players, frozen.players);
    assert.equal(match.state().phase, 'goal');
  }
  assert.deepEqual(match.step({}), [{ type: 'kickoff', team: 'blue' }]);
  assert.equal(match.state().phase, 'kickoff');
  assert.equal(match.state().kickoffTeam, 'blue');
  assert.deepEqual(match.state().ball, { x: 0, y: 0, vx: 0, vy: 0 });
});

test('score limit, time expiry, frozen final state and detached result', () => {
  const limited = game({ scoreLimit: 1 });
  creditAndScore(limited);
  assert.equal(limited.finished(), true);
  assert.equal(limited.result().reason, 'score-limit');
  assert.equal(limited.result().winner, 'red');
  const final = limited.state();
  assert.deepEqual(limited.step({}), []);
  assert.deepEqual(limited.state(), final);
  limited.result().players[0].goals = 900;
  assert.equal(limited.result().players[0].goals, 1);
  const timed = Engine.create(seats, { time: 1 });
  assert.equal(timed.result(), null);
  for (let step = 0; step < 60; step += 1) timed.step({});
  assert.equal(timed.result().reason, 'time');
  assert.equal(timed.result().steps, 60);
  assert.equal(timed.result().winner, null);
  assert.equal(timed.state().timeLeft, 0);
});

test('blue bot state mirrors every body and mirrorInput attacks world left', () => {
  const match = game();
  setup(match, context => {
    isolate(context);
    Object.assign(context.ball, { x: 50, y: 20, vx: 2, vy: -1 });
  });
  const world = match.state();
  const view = match.botState('b');
  near(view.ball.x, -world.ball.x);
  near(view.ball.vx, -world.ball.vx);
  near(view.ball.y, world.ball.y);
  near(view.you.x, -world.players[1].x);
  near(view.opponents[0].x, -world.players[0].x);
  assert.equal(view.field.ownGoalX, -420);
  assert.equal(view.field.enemyGoalX, 420);
  assert.equal(view.team, 'blue');
  assert.equal(view.teammates.length, 0);
  const start = world.players[1].x;
  match.step({ b: Engine.mirrorInput({ x: 1, y: 0, kick: false }, 'blue') });
  assert.ok(match.state().players[1].x < start);
  assert.deepEqual(Engine.mirrorInput({ x: 9, y: -9, kick: true }, 'red'), { x: 1, y: -1, kick: true });
});

test('state and botState are detached, including nested objects', () => {
  const match = Engine.create(seats);
  const original = JSON.stringify(match.state());
  const snapshot = match.state();
  snapshot.ball.x = 999;
  snapshot.score.red = 999;
  snapshot.players[0].name = 'Changed';
  snapshot.players.push({});
  const view = match.botState('r');
  view.you.x = 999;
  view.opponents[0].vx = 999;
  view.field.width = 1;
  assert.equal(JSON.stringify(match.state()), original);
});

test('seat limits, invalid ids and non-finite inputs are handled', () => {
  assert.throws(() => Engine.create([]), RangeError);
  assert.throws(() => Engine.create([seats[0], seats[0]]), TypeError);
  assert.throws(() => Engine.create([...seats, ...Array.from({ length: 4 }, (_, index) => ({ id: index, team: 'red' }))]), RangeError);
  const match = Engine.create(seats);
  match.step({ r: { x: NaN, y: Infinity, kick: 'yes' } });
  assert.ok(match.state().players.every(player => Number.isFinite(player.x) && Number.isFinite(player.y)));
  assert.throws(() => match.botState('missing'), RangeError);
});

test('each sample returns a valid input in 30 states for both teams', () => {
  const roster = Array.from({ length: 8 }, (_, index) => ({ id: index, team: index < 4 ? 'red' : 'blue', name: `Seat ${index}` }));
  const match = Engine.create(roster);
  for (let state = 0; state < 30; state += 1) {
    const inputs = {};
    for (const seat of roster) {
      const view = match.botState(seat.id);
      for (const decide of [chaser, striker, keeper]) {
        const value = decide(view);
        assert.ok(Number.isFinite(value.x) && value.x >= -1 && value.x <= 1);
        assert.ok(Number.isFinite(value.y) && value.y >= -1 && value.y <= 1);
        assert.equal(typeof value.kick, 'boolean');
      }
      inputs[seat.id] = Engine.mirrorInput(striker(view), seat.team);
    }
    for (let step = 0; step < 3; step += 1) match.step(inputs);
  }
});

test('striker vs chaser finishes and striker wins or draws at least three of five seeded starts', () => {
  let unbeaten = 0;
  const results = [];
  for (let seed = 1; seed <= 5; seed += 1) {
    const rng = random(seed);
    const strikerTeam = seed % 2 === 0 ? 'blue' : 'red';
    const match = game({ time: 120, scoreLimit: 3, decisionEvery: 3 });
    setup(match, context => {
      // Tiny seeded formation offsets only; engine physics has no randomness.
      for (const player of context.players) {
        player.x += (rng() - 0.5) * 0.2;
        player.y += (rng() - 0.5) * 0.2;
      }
    });
    let inputs = {};
    while (!match.finished()) {
      if (match.steps % 3 === 0) {
        inputs = {};
        for (const seat of seats) {
          const decide = seat.team === strikerTeam ? striker : chaser;
          inputs[seat.id] = Engine.mirrorInput(decide(match.botState(seat.id)), seat.team);
        }
      }
      match.step(inputs);
    }
    const result = match.result();
    assert.ok(result.steps <= 7200);
    assert.ok(['time', 'score-limit'].includes(result.reason));
    if (result.winner === null || result.winner === strikerTeam) unbeaten += 1;
    results.push({ seed, strikerTeam, score: result.score });
  }
  assert.ok(unbeaten >= 3, JSON.stringify(results));
});
