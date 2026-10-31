import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = file => fs.readFileSync(new URL('../frontend/arcade/holdem/' + file, import.meta.url), 'utf8');
const loadUmd = (file, PokerEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, PokerEngine) {\n${src(file)}\n})`, { filename: file }).runInThisContext()(m, m.exports, PokerEngine);
  return m.exports;
};
const E = loadUmd('engine.js');
const bots = ['sample-equity', 'sample-caller', 'sample-tight'].map(id => loadUmd('bots/' + id + '.js', E));
const ranks = '23456789TJQKA';
const suits = 'cdhs';
const cards = text => text.split(' ');
const seats = count => Array.from({ length: count }, (_, i) => ({ id: 's' + i, name: 'Seat ' + i }));
const create = (count = 3, options = {}) => E.create(seats(count), options);
const total = game => {
  const state = game.publicState();
  return state.seats.reduce((sum, seat) => sum + seat.stack, 0) + state.pots.reduce((sum, pot) => sum + pot.amount, 0);
};
const act = (game, type, amount) => {
  const result = game.act(game.toAct(), { type, ...(amount === undefined ? {} : { amount }) });
  assert.equal(result.ok, true, result.error);
  return result;
};
const passive = game => act(game, game.legalActions(game.toAct()).canCheck ? 'check' : 'call');
const finishHand = game => {
  let guard = 0;
  while (!game.handOver()) {
    assert.ok(++guard < 100);
    passive(game);
  }
};

function referenceFive(hand) {
  const values = hand.map(card => ranks.indexOf(card[0]) + 2).sort((a, b) => b - a);
  const frequency = new Map();
  values.forEach(value => frequency.set(value, (frequency.get(value) || 0) + 1));
  const groups = [...frequency].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = hand.every(card => card[1] === hand[0][1]);
  const unique = [...new Set(values)];
  let high = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] : 0;
  if (unique.join(',') === '14,5,4,3,2') high = 5;
  let rank = 0;
  let keys = values;
  if (flush && high) { rank = 8; keys = [high]; }
  else if (groups[0][1] === 4) { rank = 7; keys = groups.map(group => group[0]); }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { rank = 6; keys = groups.map(group => group[0]); }
  else if (flush) { rank = 5; }
  else if (high) { rank = 4; keys = [high]; }
  else if (groups[0][1] === 3) { rank = 3; keys = groups.map(group => group[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { rank = 2; keys = groups.map(group => group[0]); }
  else if (groups[0][1] === 2) { rank = 1; keys = groups.map(group => group[0]); }
  let value = rank;
  for (let i = 0; i < 5; i++) value = value * 15 + (keys[i] || 0);
  return value;
}

function referenceSeven(hand) {
  let best = -1;
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 4; b++) {
      for (let c = b + 1; c < 5; c++) {
        for (let d = c + 1; d < 6; d++) {
          for (let e = d + 1; e < 7; e++) best = Math.max(best, referenceFive([hand[a], hand[b], hand[c], hand[d], hand[e]]));
        }
      }
    }
  }
  return best;
}

function seededBot(bot, state, random) {
  const previous = Math.random;
  Math.random = random;
  try {
    return bot(state);
  } finally {
    Math.random = previous;
  }
}

function findSeed(predicate) {
  for (let seed = 1; seed <= 20000; seed++) {
    const deck = E.dealHand(seed, 1);
    const hole = [[deck[2], deck[5]], [deck[0], deck[3]], [deck[1], deck[4]]];
    const board = [deck[7], deck[8], deck[9], deck[11], deck[13]];
    if (predicate(hole, board)) return seed;
  }
  assert.fail('No deterministic fixture found');
}

test('all nine hand categories, names and ordered values', () => {
  const fixtures = [
    ['Ac Jd 9h 6s 3c', 'High card'],
    ['Ac Ad 9h 6s 3c', 'One pair'],
    ['Ac Ad 9h 9s 3c', 'Two pair'],
    ['Ac Ad Ah 6s 3c', 'Three of a kind'],
    ['9c 8d 7h 6s 5c', 'Straight'],
    ['Ac Jc 9c 6c 3c', 'Flush'],
    ['Ac Ad Ah 6s 6c', 'Full house'],
    ['Ac Ad Ah As 3c', 'Four of a kind'],
    ['9c 8c 7c 6c 5c', 'Straight flush']
  ];
  let previous = -1;
  fixtures.forEach(([hand, name], rank) => {
    const result = E.evaluate(cards(hand));
    assert.equal(result.rank, rank);
    assert.equal(result.name, name);
    assert.equal(result.best.length, 5);
    assert.ok(result.value > previous);
    previous = result.value;
  });
});

test('kickers, wheels, steel wheels, board plays, ties and best five', () => {
  const greater = (a, b) => assert.ok(E.evaluate(cards(a)).value > E.evaluate(cards(b)).value);
  greater('Ac Ad Kh Qs Jc', 'Ah As Kd Qc Tc');
  greater('Ac Ad Kh Ks Qc', 'Ah As Kd Kc Jc');
  greater('Qc Qd Qh As Kc', 'Qh Qs Qd Ac Jc');
  greater('2c 2d 2h 2s Ac', '2c 2d 2h 2s Kc');
  greater('Ac Kc 9c 7c 3c', 'Ah Kh 9h 6h 5h');
  greater('Ac Ad Ah Ks Kc Qh Qc', 'Kc Kd Kh As Ac Qh Qc');
  greater('6c 5d 4h 3s 2c', 'Ac 2d 3h 4s 5c');
  greater('Ac Jc 9c 7c 3c', 'Ac Kd Qh Js Tc');
  assert.equal(E.evaluate(cards('Ac 2d 3h 4s 5c')).rank, 4);
  const wheel = E.evaluate(cards('Ah 2h 3h 4h 5h Kc Qd'));
  assert.equal(wheel.rank, 8);
  assert.equal(referenceFive(wheel.best), wheel.value);
  const board = cards('As Ks Qs Js Ts');
  const result = E.evaluate([...board, '2c', '3d']);
  assert.deepEqual(new Set(result.best), new Set(board));
  assert.equal(result.value, E.evaluate([...board, '4c', '5d']).value);
  assert.equal(E.evaluate(cards('Ac Ad Kh Qs Jc')).value, E.evaluate(cards('Ah As Kd Qc Js')).value);
  const twoTrips = E.evaluate(cards('Ac Ad Ah Kc Kd Kh 2s'));
  assert.equal(twoTrips.rank, 6);
  assert.equal(twoTrips.value, referenceSeven(cards('Ac Ad Ah Kc Kd Kh 2s')));
});

test('exactly 7462 distinct five-card values with category counts', () => {
  const values = Array.from({ length: 9 }, () => new Set());
  function visit(selected, start) {
    if (selected.length === 5) {
      if (selected.some(rank => selected.filter(other => other === rank).length > 4)) return;
      const hand = selected.map((rank, index) => ranks[rank] + suits[index % 4]);
      const evaluated = E.evaluate(hand);
      assert.equal(evaluated.value, referenceFive(hand));
      values[evaluated.rank].add(evaluated.value);
      if (new Set(selected).size === 5) {
        const suited = selected.map(rank => ranks[rank] + 'h');
        const flush = E.evaluate(suited);
        assert.equal(flush.value, referenceFive(suited));
        values[flush.rank].add(flush.value);
      }
      return;
    }
    for (let rank = start; rank < 13; rank++) visit([...selected, rank], rank);
  }
  visit([], 0);
  assert.deepEqual(values.map(group => group.size), [1277, 2860, 858, 858, 10, 1277, 156, 156, 10]);
  assert.equal(values.reduce((sum, group) => sum + group.size, 0), 7462);
});

test('2000 random seven-card hands agree with independent brute-force reference', () => {
  for (let i = 1; i <= 2000; i++) {
    const hand = E.dealHand('reference-check', i).slice(0, 7);
    const actual = E.evaluate(hand);
    assert.equal(actual.value, referenceSeven(hand), hand.join(' '));
    assert.equal(new Set(actual.best).size, 5);
    assert.ok(actual.best.every(card => hand.includes(card)));
    assert.equal(referenceFive(actual.best), actual.value);
  }
});

test('blinds, full-ring order and heads-up button rules', () => {
  const game = create();
  game.startHand();
  assert.equal(game.toAct(), 's0');
  assert.deepEqual(game.publicState().seats.map(seat => seat.bet), [0, 50, 100]);
  assert.equal(game.legalActions('s0').minRaiseTo, 200);
  passive(game);
  passive(game);
  assert.equal(game.toAct(), 's2');
  assert.equal(game.legalActions('s2').canCheck, true);
  passive(game);
  assert.equal(game.publicState().street, 'flop');
  assert.equal(game.toAct(), 's1');
  const hu = create(2);
  hu.startHand();
  assert.equal(hu.toAct(), 's0');
  const deck = E.dealHand(1, 1);
  assert.deepEqual(hu.botState('s1').you.cards, [deck[0], deck[2]]);
  assert.deepEqual(hu.botState('s0').you.cards, [deck[1], deck[3]]);
  assert.deepEqual(hu.publicState().seats.map(seat => seat.bet), [50, 100]);
  passive(hu);
  passive(hu);
  assert.equal(hu.toAct(), 's1');
  finishHand(hu);
  hu.startHand();
  assert.equal(hu.publicState().seats[1].isButton, true);
  assert.equal(hu.toAct(), 's1');
  passive(hu);
  passive(hu);
  assert.equal(hu.toAct(), 's0');
});

test('minimum raises, full raises and opening bets on later streets', () => {
  const game = create();
  game.startHand();
  assert.equal(game.act('s0', { type: 'raise', amount: 199 }).ok, false);
  act(game, 'raise', 300);
  assert.equal(game.legalActions('s1').minRaiseTo, 500);
  act(game, 'raise', 500);
  assert.equal(game.legalActions('s2').minRaiseTo, 700);
  passive(game);
  passive(game);
  assert.equal(game.publicState().street, 'flop');
  assert.equal(game.legalActions(game.toAct()).minRaiseTo, 100);
  act(game, 'raise', 150);
  assert.equal(game.legalActions(game.toAct()).minRaiseTo, 300);
});

test('a short all-in does not reopen action, but an unacted player may raise', () => {
  const seed = findSeed((hole, board) => referenceSeven([...hole[0], ...board]) > referenceSeven([...hole[2], ...board]));
  const setup = () => {
    const game = create(3, { seed, stack: 1000 });
    game.startHand();
    act(game, 'raise', 300);
    act(game, 'fold');
    passive(game);
    finishHand(game);
    game.startHand();
    act(game, 'raise', 600);
    act(game, 'allin');
    return game;
  };
  const game = setup();
  assert.equal(game.toAct(), 's0');
  assert.equal(game.legalActions('s0').minRaiseTo, 1200);
  passive(game);
  assert.equal(game.toAct(), 's1');
  assert.equal(game.legalActions('s1').callAmount, 100);
  assert.equal(game.legalActions('s1').minRaiseTo, null);
  const before = JSON.stringify(game.botState('s1'));
  assert.equal(game.act('s1', { type: 'allin' }).ok, false);
  assert.equal(game.act('s1', { type: 'raise', amount: 950 }).ok, false);
  assert.equal(JSON.stringify(game.botState('s1')), before);
  passive(game);
  finishHand(game);

  const other = setup();
  act(other, 'raise', 1200);
  assert.equal(other.toAct(), 's1');
  assert.equal(other.legalActions('s1').minRaiseTo, null);
  act(other, 'allin');
  assert.equal(other.handOver(), true);
});

test('short opening all-in after a check does not reopen the checker', () => {
  const game = create(3, { stack: 150 });
  game.startHand();
  passive(game);
  passive(game);
  passive(game);
  assert.equal(game.publicState().street, 'flop');
  act(game, 'check');
  act(game, 'allin');
  passive(game);
  assert.equal(game.toAct(), 's1');
  assert.equal(game.legalActions('s1').minRaiseTo, null);
  assert.equal(game.act('s1', { type: 'raise', amount: 50 }).ok, false);
  passive(game);
  assert.equal(game.handOver(), true);
});

test('three different contribution sizes create and settle side pots', () => {
  const seed = findSeed((hole, board) => {
    const scores = hole.map(hand => referenceSeven([...hand, ...board]));
    return scores[0] > scores[1] && scores[0] > scores[2];
  });
  const game = create(3, { seed, stack: 1000 });
  game.startHand();
  act(game, 'raise', 300);
  act(game, 'fold');
  act(game, 'call');
  finishHand(game);
  assert.deepEqual(game.publicState().seats.map(seat => seat.stack), [1350, 950, 700]);
  game.startHand();
  assert.equal(game.toAct(), 's1');
  act(game, 'allin');
  act(game, 'allin');
  const before = game.publicState();
  assert.deepEqual(before.pots.map(pot => pot.amount), [300, 1200, 250]);
  assert.deepEqual(before.pots.map(pot => pot.eligible), [['s0', 's1', 's2'], ['s1', 's2'], ['s1']]);
  // Both opponents are all-in, so s0 must call to 950 rather than raise its unmatched 400.
  assert.equal(game.legalActions('s0').canAllIn, false);
  assert.equal(game.legalActions('s0').minRaiseTo, null);
  assert.equal(game.legalActions('s0').callAmount, 850);
  act(game, 'call');
  assert.equal(game.handOver(), true);
  assert.equal(total(game), 3000);
  const deck = E.dealHand(seed, 2);
  // Button is seat 1; seat 2 receives the first card.
  const hands = [[deck[1], deck[4]], [deck[2], deck[5]], [deck[0], deck[3]]];
  const board = [deck[7], deck[8], deck[9], deck[11], deck[13]];
  const scores = hands.map(hand => referenceSeven([...hand, ...board]));
  const expected = [400, 0, 0];
  for (const [amount, eligible] of [[2100, [0, 1, 2]], [500, [0, 1]]]) {
    const best = Math.max(...eligible.map(index => scores[index]));
    const winners = eligible.filter(index => scores[index] === best).sort((a, b) => (a + 1) % 3 - (b + 1) % 3);
    winners.forEach((index, i) => {
      expected[index] += Math.floor(amount / winners.length) + (i < amount % winners.length ? 1 : 0);
    });
  }
  assert.deepEqual(game.publicState().seats.map(seat => seat.stack), expected);
  assert.equal(game.handResult().showdown.length, 3);
});

test('split pots award the odd chip to the first winner left of the button', () => {
  const seed = findSeed((hole, board) => referenceSeven([...hole[0], ...board]) === referenceSeven([...hole[2], ...board]));
  const game = create(3, { seed, stack: 100, blinds: [[1, 1]] });
  game.startHand();
  passive(game);
  passive(game);
  passive(game);
  assert.equal(game.toAct(), 's1');
  act(game, 'fold');
  finishHand(game);
  assert.deepEqual(game.handResult().winners.map(({ id, amount }) => ({ id, amount })), [{ id: 's2', amount: 2 }, { id: 's0', amount: 1 }]);
  assert.equal(game.handResult().showdown.length, 2);
  assert.equal(total(game), 300);
});

test('folding awards the pot without revealing cards and refunds uncalled chips', () => {
  const game = create();
  game.startHand();
  act(game, 'raise', 500);
  act(game, 'fold');
  const result = act(game, 'fold');
  assert.equal(game.handOver(), true);
  assert.deepEqual(game.handResult().showdown, []);
  assert.deepEqual(game.handResult().winners, [{ id: 's0', amount: 250, hand: null }]);
  assert.ok(result.events.some(event => event.type === 'uncalled' && event.amount === 400));
  assert.ok(game.publicState().seats.every(seat => seat.cards === null));
  assert.equal(game.publicState().seats[0].stack, 10150);
  assert.equal(total(game), 30000);
});

test('invalid actions are transactional', () => {
  const game = create();
  game.startHand();
  const snapshot = () => JSON.stringify({
    public: game.publicState(),
    private: seats(3).map(seat => game.botState(seat.id)),
    result: game.result()
  });
  for (const [id, action] of [
    ['s1', { type: 'fold' }], ['missing', { type: 'call' }], ['s0', null],
    ['s0', {}], ['s0', { type: 'check' }], ['s0', { type: 'bet' }],
    ...[-1, 0, 100, 199, 200.5, 10001, NaN, Infinity, '200'].map(amount => ['s0', { type: 'raise', amount }])
  ]) {
    const before = snapshot();
    assert.equal(game.act(id, action).ok, false);
    assert.equal(snapshot(), before);
  }
  const before = snapshot();
  assert.deepEqual(game.startHand(), []);
  assert.equal(snapshot(), before);
});

test('blind schedule, hand cap, bust places and single survivor', () => {
  const game = create(2, { stack: 10000, blinds: [[5, 10], [10, 20]], handsPerLevel: 1, maxHands: 2 });
  game.startHand();
  assert.equal(game.level, 0);
  act(game, 'fold');
  game.startHand();
  assert.equal(game.level, 1);
  assert.deepEqual(game.blinds, [10, 20]);
  act(game, 'fold');
  assert.equal(game.finished(), true);
  assert.equal(game.result().hands, 2);
  assert.deepEqual(game.result().placements.map(entry => entry.place), [1, 2]);
  assert.deepEqual(game.startHand(), []);

  let ended = false;
  for (let seed = 1; seed <= 20 && !ended; seed++) {
    const duel = create(2, { seed, stack: 100 });
    duel.startHand();
    while (!duel.handOver()) act(duel, 'allin');
    if (!duel.finished()) continue;
    ended = true;
    assert.deepEqual(duel.result().placements.map(entry => [entry.place, entry.chips]), [[1, 200], [2, 0]]);
    assert.equal(duel.publicState().seats.filter(seat => seat.out && seat.place === 2).length, 1);
    assert.equal(duel.handResult().showdown.length, 2);
    assert.equal(duel.publicState().seats.filter(seat => seat.cards !== null).length, 2);
  }
  assert.equal(ended, true);
});

test('chip conservation after every action across 200 random-action hands', () => {
  const random = E.rng(501);
  let hands = 0;
  let matches = 0;
  while (hands < 200) {
    const count = 2 + Math.floor(random() * 8);
    const game = create(count, { seed: ++matches, stack: 1000, maxHands: 25, handsPerLevel: 3 });
    while (!game.finished() && hands < 200) {
      game.startHand();
      assert.equal(total(game), count * 1000);
      let decisions = 0;
      while (!game.handOver()) {
        assert.ok(++decisions < 1000);
        const legal = game.legalActions(game.toAct());
        const choices = [{ type: 'fold' }, { type: legal.canCheck ? 'check' : 'call' }];
        if (legal.minRaiseTo !== null) {
          choices.push({ type: 'allin' });
          if (legal.minRaiseTo <= legal.maxRaiseTo) choices.push({ type: 'raise', amount: legal.minRaiseTo });
        }
        const chosen = choices[Math.floor(random() * choices.length)];
        assert.equal(game.act(game.toAct(), chosen).ok, true);
        assert.equal(total(game), count * 1000);
        assert.ok(game.publicState().seats.every(seat => Number.isSafeInteger(seat.stack) && seat.stack >= 0));
      }
      hands++;
    }
  }
  assert.equal(hands, 200);
});

test('deterministic decks, independent deck copies and duplicate seat rotation', () => {
  assert.deepEqual(E.dealHand('duplicate', 7), E.dealHand('duplicate', 7));
  assert.notDeepEqual(E.dealHand('duplicate', 7), E.dealHand('duplicate', 8));
  assert.equal(new Set(E.dealHand(42, 1)).size, 52);
  const deck = E.dealHand(42, 1);
  deck[0] = 'bad';
  assert.notEqual(E.dealHand(42, 1)[0], 'bad');
  const originalSeats = seats(4);
  const rotatedSeats = [...originalSeats.slice(1), originalSeats[0]];
  const first = E.create(originalSeats, { seed: 'duplicate' });
  const second = E.create(rotatedSeats, { seed: 'duplicate' });
  first.startHand();
  second.startHand();
  for (let index = 0; index < originalSeats.length; index++) {
    assert.deepEqual(first.botState(originalSeats[index].id).you.cards, second.botState(rotatedSeats[index].id).you.cards);
  }
  const a = E.rng(42);
  const b = E.rng(42);
  assert.deepEqual(Array.from({ length: 100 }, a), Array.from({ length: 100 }, b));
});

test('botState hides opponents, preserves only revealed history and is detached', () => {
  const game = create();
  game.startHand();
  passive(game);
  const before = JSON.stringify(game.botState('s1'));
  const view = game.botState('s1');
  assert.equal(view.you.cards.length, 2);
  assert.ok(view.seats.every(seat => !Object.hasOwn(seat, 'cards')));
  assert.ok(game.publicState().seats.every(seat => seat.cards === null));
  view.you.cards[0] = 'bad';
  view.seats[0].stack = -1;
  view.pots[0].eligible.push('bad');
  view.blinds[0] = -1;
  view.actions[0].type = 'bad';
  view.board.push('bad');
  assert.equal(JSON.stringify(game.botState('s1')), before);
  finishHand(game);
  const result = game.handResult();
  assert.equal(result.showdown.length, 3);
  result.showdown[0].cards[0] = 'bad';
  assert.notEqual(game.handResult().showdown[0].cards[0], 'bad');
  game.startHand();
  assert.equal(game.botState('s1').history[0].showdown.length, 3);
  const history = game.botState('s1').history;
  history[0].showdown[0].cards[0] = 'bad';
  assert.notEqual(game.botState('s1').history[0].showdown[0].cards[0], 'bad');
  act(game, 'fold');
  act(game, 'fold');
  assert.deepEqual(game.botState('s1').history.at(-1).showdown, []);
});

test('history is capped at twenty completed hands', () => {
  const game = create(2, { maxHands: 25, stack: 100000, blinds: [[1, 2]] });
  for (let hand = 1; hand <= 25; hand++) {
    game.startHand();
    act(game, 'fold');
  }
  const history = game.botState('s0').history;
  assert.equal(history.length, 20);
  assert.equal(history[0].handNumber, 6);
  assert.equal(history.at(-1).handNumber, 25);
});

test('equity helper respects ties, unbeatable hands, seeded sampling and inputs', () => {
  const board = cards('As Ks Qs Js Ts');
  assert.ok(Math.abs(E.equity(cards('2c 3d'), board, 2, 20, E.rng(1)) - 1 / 3) < 1e-12);
  assert.equal(E.equity(cards('As Ks'), cards('Qs Js Ts'), 4, 20, E.rng(2)), 1);
  assert.equal(E.equity(cards('Ac Ad'), [], 2, 30, E.rng(3)), E.equity(cards('Ac Ad'), [], 2, 30, E.rng(3)));
  assert.throws(() => E.evaluate(cards('Ac Ac Kh Qs Jc')));
  assert.throws(() => E.equity(cards('Ac Ad'), cards('Ac 2h 3h'), 1, 20, E.rng(1)));
  assert.throws(() => create(1));
  assert.throws(() => create(3, { stack: 0 }));
});

test('each sample bot returns a legal action in fifty actual decision states', () => {
  const states = [];
  for (const bot of bots) {
    assert.equal(bot.lab, 'Aizanoi sample');
    assert.ok(bot.note.includes('not an AI-model entry'));
  }
  const random = E.rng(789);
  for (let seed = 1; states.length < 50; seed++) {
    const game = create(3, { seed, stack: 2000 });
    game.startHand();
    while (!game.handOver() && states.length < 50) {
      states.push({ game, id: game.toAct(), state: game.botState(game.toAct()) });
      // Replay the action prefix to preserve this exact decision for each bot.
      const prefix = game.botState(game.toAct()).actions;
      const replay = choice => {
        const duplicate = create(3, { seed, stack: 2000 });
        duplicate.startHand();
        for (const entry of prefix) {
          const amount = duplicate.botState(entry.id).you.bet + entry.amount;
          assert.equal(duplicate.act(entry.id, { type: entry.type, amount }).ok, true);
        }
        return duplicate.act(duplicate.toAct(), choice);
      };
      for (const bot of bots) {
        const choice = seededBot(bot, game.botState(game.toAct()), random);
        assert.equal(replay(choice).ok, true, JSON.stringify(choice));
      }
      passive(game);
    }
  }
  assert.equal(states.length, 50);
});

test('three-bot tournaments finish; equity places ahead of caller in at least three of five seeds', { timeout: 180000 }, () => {
  let ahead = 0;
  for (const seed of [11, 22, 33, 44, 55]) {
    const game = create(3, { seed, stack: 3000, handsPerLevel: 6, maxHands: 100 });
    const randoms = bots.map((_, index) => E.rng(seed * 101 + index));
    let decisions = 0;
    while (!game.finished()) {
      game.startHand();
      while (!game.handOver()) {
        assert.ok(++decisions < 30000);
        const id = game.toAct();
        const index = Number(id.slice(1));
        const choice = seededBot(bots[index], game.botState(id), randoms[index]);
        assert.equal(game.act(id, choice).ok, true, JSON.stringify(choice));
        assert.equal(total(game), 9000);
      }
    }
    const result = game.result();
    assert.ok(result.hands <= 100);
    assert.deepEqual(result.placements.map(entry => entry.place), [1, 2, 3]);
    if (result.placements.find(entry => entry.id === 's0').place < result.placements.find(entry => entry.id === 's1').place) ahead++;
  }
  assert.ok(ahead >= 3, 'Equity finished ahead in ' + ahead + ' of five matches');
});
