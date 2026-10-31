import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../frontend/arcade/football/engine.js', import.meta.url), 'utf8'
);
const marker = '    function step(inputs) {';
assert.equal(source.split(marker).length, 2);
const fixtureSource = source.replace(marker, marker + `
      if (inputs && inputs.__setup) {
        inputs.__setup({ ball, players, setPhase(value) { phase = value; } });
      }
`);
function load(text) {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, FootballEngine) {\n${text}\n})`, {
    filename: 'football-regression-engine.js'
  }).runInThisContext()(m, m.exports, undefined);
  return m.exports;
}
const Engine = load(source);
const Fixture = load(fixtureSource);
const seats = [
  { id: 'r1', team: 'red', name: 'Red' },
  { id: 'b1', team: 'blue', name: 'Blue' }
];
function fixture(options = {}) {
  return Fixture.create(seats, { time: 120, scoreLimit: 0, ...options });
}
function setup(game, change, inputs = {}) {
  return game.step({ ...inputs, __setup: change });
}
function isolate(context) {
  context.setPhase('play');
  for (const player of context.players) {
    Object.assign(player, {
      x: player.team === 'red' ? -300 : 300,
      y: 150, vx: 0, vy: 0
    });
  }
}
function score(game) {
  return setup(game, context => {
    isolate(context);
    Object.assign(context.ball, { x: 429, y: 0, vx: 4, vy: 0 });
  });
}
function normalized(state) {
  return {
    ...state,
    players: state.players.slice().sort((a, b) =>
      String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)
  };
}

test('zero score limit permits multiple goals and ends only at time', () => {
  const game = fixture({ time: 4 });
  assert.equal(game.state().rules.scoreLimit, 0);
  assert.equal(score(game).filter(event => event.type === 'goal').length, 1);
  assert.equal(game.finished(), false);
  for (let i = 0; i < 90; i++) game.step({});
  assert.equal(score(game).filter(event => event.type === 'goal').length, 1);
  assert.equal(game.finished(), false);
  assert.deepEqual(game.state().score, { red: 2, blue: 0 });
  while (!game.finished()) game.step({});
  assert.equal(game.result().reason, 'time');
  assert.equal(game.result().steps, 240);
  assert.equal(game.result().winner, 'red');
});

test('unsafe match settings are rejected instead of creating unfinishable matches', () => {
  for (const options of [
    { time: Number.MAX_VALUE },
    { scoreLimit: Number.MAX_VALUE },
    { decisionEvery: Number.MAX_VALUE }
  ]) assert.throws(() => Engine.create(seats, options), RangeError);
});

test('fast ball cannot tunnel through end line, post, or top wall', () => {
  const endLine = fixture();
  setup(endLine, context => {
    isolate(context);
    Object.assign(context.ball, { x: 390, y: 120, vx: 120, vy: 0 });
  });
  assert.equal(endLine.state().score.red, 0);
  assert.ok(endLine.state().ball.x <= 410);
  assert.ok(endLine.state().ball.vx < 0);

  const top = fixture();
  setup(top, context => {
    isolate(context);
    Object.assign(context.ball, { x: 0, y: 180, vx: 0, vy: 150 });
  });
  assert.ok(top.state().ball.y <= 190);
  assert.ok(top.state().ball.vy < 0);

  const post = fixture();
  const events = setup(post, context => {
    isolate(context);
    Object.assign(context.ball, { x: 390, y: 65, vx: 140, vy: 0 });
  });
  assert.ok(events.some(event => event.type === 'post'));
  assert.equal(events.filter(event => event.type === 'post' && event.x === 420 && event.y === 65).length, 1);
  assert.equal(post.state().score.red, 0);
  assert.ok(post.state().ball.vx < 0);
});

test('fast central crossing scores once before any net-back reflection', () => {
  for (const sign of [-1, 1]) {
    const game = fixture();
    const events = setup(game, context => {
      isolate(context);
      Object.assign(context.ball, { x: sign * 400, y: 0, vx: sign * 150, vy: 0 });
    });
    assert.equal(events.filter(event => event.type === 'goal').length, 1);
    assert.equal(game.state().phase, 'goal');
    assert.deepEqual(game.state().score, sign > 0 ? { red: 1, blue: 0 } : { red: 0, blue: 1 });
    assert.ok(Math.abs(game.state().ball.x) > 430);
    assert.ok(Math.abs(game.state().ball.x) <= 434.000001);
  }
});

test('seat permutations preserve formations, contact physics, events and credit', () => {
  const roster = [
    { id: 'r2', team: 'red' }, { id: 'b2', team: 'blue' },
    { id: 'r1', team: 'red' }, { id: 'b1', team: 'blue' }
  ];
  const first = Fixture.create(roster, { time: 20, scoreLimit: 0 });
  const second = Fixture.create(roster.slice().reverse(), { time: 20, scoreLimit: 0 });
  assert.deepEqual(normalized(first.state()), normalized(second.state()));
  function arrange(context) {
    context.setPhase('play');
    const positions = {
      r1: [-25, 0], b1: [25, 0], r2: [-50, 12], b2: [50, -12]
    };
    for (const player of context.players) {
      Object.assign(player, {
        x: positions[player.id][0], y: positions[player.id][1], vx: 0, vy: 0
      });
    }
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  }
  const input = Object.fromEntries(roster.map(player => [
    player.id, { x: player.team === 'red' ? 1 : -1, y: 0, kick: true }
  ]));
  assert.deepEqual(setup(first, arrange, input), setup(second, arrange, input));
  for (let i = 0; i < 240; i++) {
    assert.deepEqual(first.step(input), second.step(input));
    assert.deepEqual(normalized(first.state()), normalized(second.state()));
  }
});

test('one player gets at most one touch per step despite repeated solver contacts', () => {
  const game = fixture();
  setup(game, context => {
    isolate(context);
    Object.assign(context.players[0], { x: -24, y: 0, vx: 0, vy: 0 });
    Object.assign(context.players[1], { x: 24, y: 0, vx: 0, vy: 0 });
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  }, { r1: { kick: true }, b1: { kick: true } });
  for (const player of game.state().players) {
    assert.ok(player.touches <= 1);
  }
  assert.ok(game.state().players.some(player => player.touches === 1));
});

test('ball correction cannot push a player through an outer wall', () => {
  const game = fixture();
  setup(game, context => {
    isolate(context);
    Object.assign(context.players[0], { x: 435, y: 0, vx: 0, vy: 0 });
    Object.assign(context.ball, { x: 412, y: 0, vx: 0, vy: 0 });
  });
  const player = game.state().players[0];
  assert.ok(player.x <= 435);
  assert.ok(Math.abs(player.y) <= 215);
});

test('public state exposes counters, cooldown, freeze and detached touch history', () => {
  const game = fixture({ decisionEvery: 5 });
  setup(game, context => {
    isolate(context);
    Object.assign(context.players[0], { x: -28, y: 0, vx: 0, vy: 0 });
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  }, { r1: { x: 0, y: 0, kick: true } });
  const state = game.state();
  assert.equal(state.rules.decisionEvery, 5);
  assert.equal(state.players[0].kicks, 1);
  assert.equal(state.players[0].touches, 1);
  assert.equal(state.players[0].kickCooldown, 10);
  assert.equal(state.players[0].heldKick, true);
  assert.deepEqual(state.lastTouches, [{ id: 'r1', team: 'red', step: 1 }]);
  state.lastTouches[0].id = 'tampered';
  state.rules.time = 999;
  assert.equal(game.state().lastTouches[0].id, 'r1');
  assert.equal(game.state().rules.time, 120);

  const view = game.botState('b1');
  assert.equal(view.field.outerMargin, 30);
  assert.equal(view.field.postRadius, 8);
  assert.deepEqual(view.lastTouches, game.state().lastTouches);
  assert.equal(view.you.kickCooldown, game.state().players[1].kickCooldown);
  score(game);
  assert.equal(game.state().goalFreezeSteps, 90);
  game.step({});
  assert.equal(game.state().goalFreezeSteps, 89);
});

test('simultaneous opposing kicks use common geometry and cancel symmetrically', () => {
  const game = fixture();
  const events = setup(game, context => {
    isolate(context);
    Object.assign(context.players[0], { x: -28, y: 0, vx: 0, vy: 0 });
    Object.assign(context.players[1], { x: 28, y: 0, vx: 0, vy: 0 });
    Object.assign(context.ball, { x: 0, y: 0, vx: 0, vy: 0 });
  }, {
    r1: { x: 0, y: 0, kick: true },
    b1: { x: 0, y: 0, kick: true }
  });
  assert.equal(events.filter(event => event.type === 'kick').length, 2);
  assert.equal(game.state().ball.vx, 0);
  assert.equal(game.state().ball.vy, 0);
});
