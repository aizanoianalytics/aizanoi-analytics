import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = file => fs.readFileSync(new URL('../frontend/arcade/holdem/' + file, import.meta.url), 'utf8');
const loadUmd = (file, PokerEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, PokerEngine) {\n${src(file)}\n})`, {
    filename: file
  }).runInThisContext()(m, m.exports, PokerEngine);
  return m.exports;
};
const E = loadUmd('engine.js');
const seats = count => Array.from({ length: count }, (_, seat) => ({
  id: `s${seat}`, name: `Seat ${seat}`
}));
const act = (game, type, amount) => {
  const result = game.act(game.toAct(), { type, ...(amount === undefined ? {} : { amount }) });
  assert.equal(result.ok, true, result.error);
  return result;
};
const passive = game => act(game, game.legalActions(game.toAct()).canCheck ? 'check' : 'call');
const finish = game => {
  let guard = 0;
  while (!game.handOver()) {
    assert.ok(++guard < 200);
    passive(game);
  }
};

test('equal stacks at the hand cap share first place without creating chips', () => {
  let fixture = null;
  for (let seed = 1; seed <= 20000; seed++) {
    const game = E.create(seats(2), {
      seed, stack: 100, blinds: [[1, 2]], maxHands: 1
    });
    game.startHand();
    finish(game);
    if (game.result().placements.every(entry => entry.chips === 100)) {
      fixture = game;
      break;
    }
  }
  assert.ok(fixture, 'Find a deterministic tied heads-up showdown');
  assert.equal(fixture.finished(), true);
  assert.deepEqual(fixture.result().placements, [
    { id: 's0', place: 1, chips: 100 },
    { id: 's1', place: 1, chips: 100 }
  ]);
  assert.deepEqual(fixture.startHand(), []);
});

test('transition to heads-up advances the big blind rather than repeating it', () => {
  let fixture = null;
  for (let seed = 1; seed <= 20000; seed++) {
    const game = E.create(seats(3), { seed, stack: 1000, blinds: [[50, 100]] });
    game.startHand();
    act(game, 'allin');
    act(game, 'call');
    act(game, 'fold');
    finish(game);
    const state = game.publicState();
    if (state.seats[0].out && !state.seats[1].out && !state.seats[2].out) {
      fixture = game;
      break;
    }
  }
  assert.ok(fixture, 'Find a hand eliminating the old button');
  fixture.startHand();
  const state = fixture.publicState();
  assert.equal(state.bigBlindSeat, 1);
  assert.equal(state.smallBlindSeat, 2);
  assert.equal(state.seats[2].isButton, true);
  assert.equal(fixture.toAct(), 's2');
  passive(fixture);
  passive(fixture);
  assert.equal(fixture.publicState().street, 'flop');
  assert.equal(fixture.toAct(), 's1');
});

test('eligibility merging compares IDs as elements, not comma-joined strings', () => {
  // These different eligible lists have the same comma-joined text:
  // ['a','b,c'] and ['a,b','c']. Ordinary input must retain literal IDs.
  const ids = ['a', 'b,c', 'a,b', 'c'];
  const game = E.create(ids.map(id => ({ id, name: id })), {
    stack: 1000, blinds: [[1, 2]], seed: 19
  });
  game.startHand();
  act(game, 'raise', 200);
  act(game, 'call');
  act(game, 'call');
  act(game, 'call');
  assert.equal(game.publicState().street, 'flop');
  const state = game.botState(game.toAct());
  assert.deepEqual(state.pots, [{ amount: 800, eligible: ids }]);
  assert.equal(state.pots.reduce((sum, pot) => sum + pot.amount, 0), 800);
  act(game, 'fold');
  finish(game);
  assert.equal(game.result().placements.reduce((sum, entry) => sum + entry.chips, 0), 4000);

  const engineSource = src('engine.js');
  assert.doesNotMatch(engineSource, /eligible\.join\(\)/);
  assert.match(engineSource, /last\.eligible\.every/);
});

test('engine snapshots stringified seeds at creation', () => {
  let text = 'original-seed';
  const mutableSeed = { toString: () => text };
  const game = E.create(seats(3), { seed: mutableSeed });
  const reference = E.create(seats(3), { seed: 'original-seed' });
  text = 'changed-seed';
  game.startHand();
  reference.startHand();
  for (const seat of seats(3)) {
    assert.deepEqual(game.botState(seat.id).you.cards, reference.botState(seat.id).you.cards);
  }
  finish(game);
  finish(reference);
  game.startHand();
  reference.startHand();
  assert.deepEqual(game.publicState(), reference.publicState());
  for (const seat of seats(3)) {
    assert.deepEqual(game.botState(seat.id).you.cards, reference.botState(seat.id).you.cards);
  }
});

test('extended bot state provides detached public contributions and tournament settings', () => {
  const game = E.create(seats(3), {
    stack: 1000, blinds: [[5, 10], [10, 20]], maxHands: 7, handsPerLevel: 2
  });
  game.startHand();
  const state = game.botState('s0');
  assert.equal(state.currentBet, 10);
  assert.equal(state.lastFullRaise, 10);
  assert.equal(state.smallBlindSeat, 1);
  assert.equal(state.bigBlindSeat, 2);
  assert.equal(state.canAllIn, true);
  assert.deepEqual(state.seats.map(seat => seat.total), [0, 5, 10]);
  assert.deepEqual(state.tournament, {
    startingStack: 1000, maxHands: 7, handsPerLevel: 2, level: 0,
    blindSchedule: [[5, 10], [10, 20]]
  });
  const before = JSON.stringify(game.botState('s0'));
  state.tournament.blindSchedule[0][0] = 999;
  state.seats[1].total = 999;
  state.you.total = 999;
  assert.equal(JSON.stringify(game.botState('s0')), before);
  assert.ok(state.seats.every(seat => !Object.hasOwn(seat, 'cards')));
  act(game, 'raise', 30);
  assert.equal(game.botState('s1').seats[0].total, 30);
  assert.equal(game.botState('s1').currentBet, 30);
  assert.equal(game.botState('s1').lastFullRaise, 20);
});

test('all-in legality distinguishes a closed raise from an all-in call', () => {
  const game = E.create(seats(3), { stack: 150 });
  game.startHand();
  passive(game);
  passive(game);
  passive(game);
  act(game, 'check');
  act(game, 'allin');
  passive(game);
  assert.equal(game.toAct(), 's1');
  const legal = game.legalActions('s1');
  assert.equal(legal.minRaiseTo, null);
  assert.equal(legal.canAllIn, true, 'Calling for all remaining chips stays legal');
  assert.equal(game.botState('s1').canAllIn, true);
  act(game, 'allin');
  assert.equal(game.handOver(), true);

  let closed = null;
  for (let seed = 1; seed <= 20000; seed++) {
    const candidate = E.create(seats(3), { seed, stack: 1000 });
    candidate.startHand();
    act(candidate, 'raise', 300);
    act(candidate, 'fold');
    passive(candidate);
    finish(candidate);
    const stacks = candidate.publicState().seats.map(seat => seat.stack);
    if (stacks[0] !== 1350 || stacks[1] !== 950 || stacks[2] !== 700) continue;
    candidate.startHand();
    act(candidate, 'raise', 600);
    act(candidate, 'allin');
    passive(candidate);
    closed = candidate;
    break;
  }
  assert.ok(closed);
  assert.equal(closed.toAct(), 's1');
  assert.equal(closed.legalActions('s1').canAllIn, false);
  assert.equal(closed.botState('s1').canAllIn, false);
  const before = JSON.stringify(closed.botState('s1'));
  assert.equal(closed.act('s1', { type: 'allin' }).ok, false);
  assert.equal(JSON.stringify(closed.botState('s1')), before);
  passive(closed);
  finish(closed);
});

test('sample equity uses bounded sampling rather than a clock', () => {
  const source = src('bots/sample-equity.js');
  assert.doesNotMatch(source, /\bDate\b|\bperformance\b/);
  const bot = loadUmd('bots/sample-equity.js', E);
  const game = E.create(seats(3), { seed: 7 });
  game.startHand();
  const previous = Math.random;
  const answer = () => {
    Math.random = E.rng(1234);
    return bot(game.botState(game.toAct()));
  };
  try {
    assert.deepEqual(answer(), answer());
  } finally {
    Math.random = previous;
  }
});
