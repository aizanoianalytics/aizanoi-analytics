import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../frontend/arcade/snake-royale/engine.js', import.meta.url), 'utf8'
);
const moduleRecord = { exports: {} };
vm.runInThisContext(
  `(function(module) { ${source}\n })`,
  { filename: 'snake-royale/engine.js' }
)(moduleRecord);
const engine = moduleRecord.exports;

function fixture(options = {}, ids = ['a', 'b']) {
  const game = engine.create(ids, {
    seed: 7, minFood: 0, foodChance: 0, ...options,
  });
  game.food.splice(0);
  return game;
}

function setSnake(game, id, body, health = 100) {
  const snake = game.snakes.find(s => s.id === id);
  snake.body = body.map(point => point.slice());
  snake.health = health;
  return snake;
}

test('food restores health before starvation and increases post-move length', () => {
  const game = fixture();
  const a = setSnake(game, 'a', [[2, 2], [1, 2], [0, 2]], 1);
  setSnake(game, 'b', [[8, 8], [9, 8], [10, 8]]);
  game.food.push([3, 2]);
  const events = game.step({ a: 'right', b: 'left' });
  assert.equal(a.alive, true);
  assert.equal(a.health, 100);
  assert.equal(a.body.length, 4);
  assert.equal(a.eaten, 1);
  assert.ok(events.some(event => event.type === 'eat' && event.id === 'a'));
});

test('nongrowing tails vacate, whereas growing tails remain collision obstacles', () => {
  for (const eating of [false, true]) {
    const game = fixture();
    const a = setSnake(game, 'a', [[2, 3], [1, 3], [0, 3]]);
    setSnake(game, 'b', [[4, 2], [3, 2], [3, 3]]);
    if (eating) game.food.push([5, 2]);
    game.step({ a: 'right', b: 'right' });
    assert.equal(a.alive, !eating);
    if (eating) assert.equal(a.death.cause, 'body');
  }
});

test('equal head-ons eliminate both and retain benchmark mutual kill attribution', () => {
  const game = fixture();
  const a = setSnake(game, 'a', [[2, 2], [1, 2], [0, 2]]);
  const b = setSnake(game, 'b', [[4, 2], [5, 2], [6, 2]]);
  game.step({ a: 'right', b: 'left' });
  assert.equal(a.death.cause, 'head-on');
  assert.equal(b.death.cause, 'head-on');
  assert.equal(a.death.by, 'b');
  assert.equal(b.death.by, 'a');
  assert.equal(a.kills, 1);
  assert.equal(b.kills, 1);
  assert.deepEqual(game.placements().map(p => p.place), [1, 1]);
});

test('all heads on food grow before head-on lengths are compared', () => {
  const game = fixture();
  const a = setSnake(game, 'a', [[2, 2], [1, 2], [0, 2]], 1);
  const b = setSnake(game, 'b', [[4, 2], [5, 2]], 1);
  game.food.push([3, 2]);
  const events = game.step({ a: 'right', b: 'left' });
  assert.equal(a.alive, true);
  assert.equal(b.alive, false);
  assert.equal(a.body.length, 4);
  assert.equal(b.body.length, 3);
  assert.equal(a.health, 100);
  assert.equal(b.health, 100);
  assert.equal(a.eaten, 1);
  assert.equal(b.eaten, 1);
  assert.equal(events.filter(event => event.type === 'eat').length, 2);
});

test('head-on attribution retains original snake iteration order', () => {
  function resolve(ids) {
    const game = fixture({}, ids);
    setSnake(game, 'a', [[2, 3], [1, 3], [0, 3]]);
    setSnake(game, 'b', [[4, 3], [5, 3], [6, 3], [7, 3]]);
    setSnake(game, 'c', [[3, 2], [3, 1], [3, 0], [4, 0]]);
    game.step({ a: 'right', b: 'left', c: 'down' });
    return game.snakes.find(snake => snake.id === 'a');
  }
  assert.equal(resolve(['a', 'b', 'c']).death.by, 'b');
  assert.equal(resolve(['a', 'c', 'b']).death.by, 'c');
});

test('storm expansion occurs after collisions and newly covered heads may escape', () => {
  const game = fixture({ shrinkStart: 1, shrinkEvery: 20 });
  const a = setSnake(game, 'a', [[0, 2], [0, 1], [0, 0]]);
  const b = setSnake(game, 'b', [[10, 8], [10, 9], [10, 10]]);
  const events = game.step({ a: 'down', b: 'up' });
  assert.equal(game.hazard, 1);
  assert.ok(events.some(event => event.type === 'shrink'));
  assert.equal(a.alive, true);
  assert.equal(b.alive, true);
  assert.ok(game.botState('a').hazards.some(point => point.x === 0 && point.y === 3));
  game.step({ a: 'right', b: 'up' });
  assert.equal(a.alive, true, 'newly covered snake can move into safety');
  assert.equal(b.death.cause, 'storm');
});

test('nextShrinkTurn preserves the scheduled value even after the ring cap', () => {
  const game = fixture({ shrinkStart: 1, shrinkEvery: 1, maxTurns: 20 });
  setSnake(game, 'a', [[3, 3], [3, 3], [3, 3]]);
  setSnake(game, 'b', [[7, 7], [7, 7], [7, 7]]);
  for (let i = 0; i < 4; i++) game.step({ a: 'right', b: 'left' });
  assert.equal(game.hazard, 4);
  assert.equal(game.nextShrinkTurn, 5);
  const events = game.step({ a: 'down', b: 'up' });
  assert.equal(game.hazard, 4);
  assert.equal(events.some(event => event.type === 'shrink'), false);
  assert.equal(game.nextShrinkTurn, 6);
});

test('turn-limit survivors share first place regardless of length', () => {
  const game = fixture({ maxTurns: 1 });
  setSnake(game, 'a', [[2, 2], [1, 2]]);
  setSnake(game, 'b', [[8, 8], [9, 8], [10, 8]]);
  game.step({ a: 'right', b: 'left' });
  assert.equal(game.finished(), true);
  assert.ok(game.snakes.every(snake => snake.alive));
  assert.deepEqual(game.placements().map(p => p.place), [1, 1]);
});

test('simultaneous all-dead results rank by final length, not automatic draw', () => {
  const game = fixture();
  setSnake(game, 'a', [[0, 2], [1, 2]]);
  setSnake(game, 'b', [[10, 8], [9, 8], [8, 8]]);
  game.step({ a: 'left', b: 'right' });
  assert.equal(game.finished(), true);
  assert.deepEqual(game.placements().map(p => [p.id, p.place]), [['b', 1], ['a', 2]]);
});

test('bot state is fresh, head-first, complete and isolated from engine mutation', () => {
  const game = fixture();
  setSnake(game, 'a', [[2, 2], [1, 2], [0, 2]]);
  setSnake(game, 'b', [[8, 8], [9, 8], [10, 8]]);
  game.food.push([5, 5]);
  const before = JSON.stringify({ snakes: game.snakes, food: game.food });
  const state = game.botState('a');
  assert.deepEqual(Object.keys(state).sort(), [
    'food', 'hazards', 'height', 'nextShrinkTurn', 'snakes', 'turn', 'width', 'you',
  ]);
  assert.deepEqual(Object.keys(state.you).sort(), [
    'body', 'head', 'health', 'id', 'length', 'name',
  ]);
  assert.equal(state.turn, 1);
  assert.equal(state.you, state.snakes.find(snake => snake.id === 'a'));
  assert.deepEqual(state.you.head, state.you.body[0]);
  state.you.body[0].x = -99;
  state.you.head.y = -99;
  state.food[0].x = -99;
  state.snakes.pop();
  assert.equal(JSON.stringify({ snakes: game.snakes, food: game.food }), before);
  assert.equal(game.botState('a').you.body[0].x, 2);
});

test('string normalization and invalid fallback preserve the existing contract', () => {
  const game = fixture();
  const a = setSnake(game, 'a', [[3, 3], [2, 3], [1, 3]]);
  const b = setSnake(game, 'b', [[8, 8], [9, 8], [10, 8]]);
  game.step({ a: ' RIGHT ', b: null });
  assert.deepEqual(a.body[0], [4, 3]);
  assert.deepEqual(b.body[0], [8, 7], 'first invalid action defaults to up');
  assert.equal(a.errors, 0);
  assert.equal(b.errors, 1);
  game.step({ a: null, b: 'left' });
  assert.deepEqual(a.body[0], [5, 3], 'later invalid action repeats last valid direction');
  assert.equal(a.errors, 1);
});
