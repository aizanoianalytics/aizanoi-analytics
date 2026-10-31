'use strict';

function cardValue(card) {
  return '23456789TJQKA'.indexOf(card[0]) + 2;
}

function classifyPreflop(cards) {
  const hi = Math.max(cardValue(cards[0]), cardValue(cards[1]));
  const lo = Math.min(cardValue(cards[0]), cardValue(cards[1]));
  const pair = hi === lo;
  const suited = cards[0][1] === cards[1][1];
  let cls = 'weak';
  let score = 35;
  if (pair) {
    if (hi >= 8) { cls = 'premium'; score = 90; }
    else if (hi >= 6) { cls = 'strong'; score = 75; }
    else if (hi >= 4) { cls = 'playable'; score = 55; }
    else { cls = 'weak'; score = 40; }
  } else if (hi === 14) {
    if (lo >= 13) { cls = 'premium'; score = 85; }
    else if (lo >= 12 || lo >= 11) { cls = 'strong'; score = 70; }
    else if (lo >= 10 || lo >= 9) { cls = 'playable'; score = 52; }
  } else if (hi >= 13) {
    if (lo >= 12) { cls = 'strong'; score = 70; }
    else if (lo >= 10) { cls = 'playable'; score = 52; }
    else if (lo >= 8) { cls = 'playable'; score = 46; }
  } else if (hi === 12) {
    if (lo >= 11) { cls = 'strong'; score = 70; }
    else if (lo >= 9) { cls = 'playable'; score = 52; }
  } else if (hi === 11) {
    if (lo >= 10) { cls = 'playable'; score = 52; }
  } else if (hi === 10) {
    if (lo >= 9) { cls = 'playable'; score = 52; }
  }
  if (suited && score > 35 && score < 60) score += 6;
  return { cls: score >= 70 ? 'premium' : score >= 55 ? 'strong' : score >= 42 ? 'playable' : 'weak', score: Math.min(95, score) };
}

function evalHand(cards) {
  try {
    return PokerEngine.evaluate(cards);
  } catch (e) {
    return null;
  }
}

function calcEquity(state, oppCount) {
  if (oppCount <= 0) return 1;
  try {
    const rng = PokerEngine.rng(0x9e3779b9);
    let sum = 0;
    const iters = 24;
    for (let i = 0; i < iters; i += 1) {
      sum += PokerEngine.equity(state.you.cards, state.board, oppCount, 1, rng);
    }
    return sum / iters;
  } catch (e) {
    return 0.5;
  }
}

function makeRaise(state, increment) {
  const minTo = state.minRaiseTo;
  if (minTo === null || minTo === undefined) return null;
  const cur = state.currentBet;
  const maxTo = state.maxRaiseTo;
  let target = cur + increment;
  if (target < minTo) target = minTo;
  if (target > maxTo) {
    if (state.canAllIn) return { type: 'allin' };
    return null;
  }
  if (target <= cur) return null;
  return { type: 'raise', amount: target };
}

function seatsAfter(state) {
  const n = state.seats.length;
  const meSeat = state.you.seat;
  let count = 0;
  for (const seat of state.seats) {
    if (seat.seat === meSeat) continue;
    if (seat.out || seat.folded) continue;
    const relMe = (meSeat - state.buttonSeat + n) % n;
    const relSeat = (seat.seat - state.buttonSeat + n) % n;
    if (relSeat > relMe) count += 1;
  }
  return count;
}

function act(state) {
  const you = state.you;
  const canCheck = state.canCheck;
  const facing = !canCheck;
  const toCall = state.toCall;
  const pot = state.pots.reduce((sum, entry) => sum + entry.amount, 0);
  const potTotal = pot + toCall;
  const required = potTotal > 0 ? toCall / potTotal : 0;

  const ev = state.board.length >= 3 ? evalHand([...you.cards, ...state.board].slice(0, 7)) : null;
  const isPreflop = !ev;
  const rank = ev ? ev.rank : -1;
  const strength = ev ? ev.value : 0;
  const madeHand = ev ? rank >= 1 : false;
  let cls = 'weak';
  let score = 0;
  if (isPreflop) {
    const c = classifyPreflop(you.cards);
    cls = c.cls;
    score = c.score;
  } else if (ev) {
    cls = rank >= 2 ? 'premium' : rank >= 1 ? 'strong' : 'playable';
    score = rank >= 2 ? 90 : rank >= 1 ? 75 : 55;
  }

  const oppCount = state.seats.filter((seat) => seat.id !== you.id && !seat.out && !seat.folded).length;
  const equity = facing && !madeHand ? calcEquity(state, oppCount) : 1;
  const bb = state.blinds[1];
  const small = state.blinds[0];
  const late = seatsAfter(state) <= 1;

  let action;

  if (facing) {
    if (cls === 'premium' || cls === 'strong') {
      const inc = Math.max(small, Math.floor(potTotal * 0.55));
      const raise = makeRaise(state, inc);
      if (raise) return raise;
      return { type: 'call' };
    }
    if (cls === 'playable') {
      return equity > required + 0.015 ? { type: 'call' } : { type: 'fold' };
    }
    return { type: 'fold' };
  }

  if (cls === 'premium' || (cls === 'strong' && score >= (late ? 60 : 70))) {
    const inc = Math.max(small, Math.floor(pot * 0.55));
    const bet = makeRaise(state, inc);
    if (bet) return bet;
  }
  return { type: 'check' };
}

module.exports = act;
module.exports.act = act;
module.exports.botName = 'Flamma';
module.exports.lab = 'Holdem AI War entry';
module.exports.note = 'Monte Carlo equity bot with value raising.';
Object.defineProperty(module.exports, 'name', { value: 'Flamma', configurable: true });
