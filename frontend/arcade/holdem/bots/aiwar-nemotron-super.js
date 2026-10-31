'use strict';

const RANKS = '23456789TJQKA';

function cardRank(card) {
  return RANKS.indexOf(card[0]) + 2;
}

function holeStrength(cards) {
  const a = cardRank(cards[0]);
  const b = cardRank(cards[1]);
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const suited = cards[0][1] === cards[1][1];
  const pair = a === b;
  const gap = high - low;
  let s = 0;
  if (pair) {
    s = 0.45 + (a - 7) * 0.075;
  } else {
    s = (high - 2) * 0.032 + (low - 2) * 0.018;
    if (suited) s += 0.045;
    if (gap === 1) s += 0.035;
    else if (gap === 2) s += 0.012;
    if (high === 14) s += 0.05;
    if (high === 13 && low >= 10) s += 0.03;
  }
  if (s > 1) s = 1;
  if (s < 0) s = 0;
  return s;
}

function activeOpponents(state) {
  const me = state.you;
  let n = 0;
  for (const s of state.seats) {
    if (s.id === me.id || s.out || s.folded) continue;
    n++;
  }
  return n;
}

function potTotal(state) {
  let t = 0;
  for (const p of state.pots) t += p.amount;
  return t;
}

function raiseTarget(state, add) {
  const me = state.you;
  const target = me.bet + add;
  const cap = state.maxRaiseTo;
  if (target >= cap) return { allin: true, amount: cap };
  return { allin: false, amount: target };
}

module.exports = {
  name: 'Nemotron Holdem',
  botName: 'Nemotron Holdem',
  lab: 'nemotron-super',
  act(state) {
    const me = state.you;
    const street = state.street;
    const board = state.board;
    const nOpp = activeOpponents(state);
    const pot = potTotal(state);
    const toCall = state.toCall;
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const bb = state.blinds[1] || 1;

    // Monte Carlo equity vs random opponent hands (bounded, fixed work).
    let eq;
    try {
      const iters = Math.max(150, Math.min(500, Math.floor(2000 / Math.max(1, nOpp))));
      eq = PokerEngine.equity(me.cards, board, nOpp, iters, Math.random);
    } catch (e) {
      eq = holeStrength(me.cards);
    }

    const committed = me.stack - toCall;
    const shortStack = committed <= bb * 3;

    const baseline = 1 / Math.max(1, nOpp + 1);   // even-split equity
    const multiway = nOpp >= 3;
    const valueEdge = multiway ? 0.20 : 0.14;      // bet/raise when clearly ahead of average
    const callEdge = multiway ? 0.08 : 0.03;       // call when beating pot odds by this margin

    function betValue() {
      if (state.minRaiseTo === null) return null;
      const raiseAmt = Math.max(bb, Math.floor((pot + toCall) * (nOpp >= 3 ? 0.9 : 0.75)));
      const r = raiseTarget(state, toCall + raiseAmt);
      if (r.allin) {
        if (state.canAllIn) return { type: 'allin' };
        return null;
      }
      if (state.minRaiseTo !== null && r.amount < state.minRaiseTo) return null;
      return { type: 'raise', amount: r.amount };
    }

    if (state.canCheck) {
      // No outstanding bet: check or bet for value/protection.
      if (eq >= baseline + valueEdge && state.minRaiseTo !== null) {
        const r = betValue();
        if (r) return r;
        if (state.canAllIn) return { type: 'allin' };
      }
      // Heads-up river bluff with a busted hand.
      if (street === 'river' && nOpp === 1 && eq < baseline * 0.7 && Math.random() < 0.12) {
        const r = betValue();
        if (r) return r;
      }
      return { type: 'check' };
    }

    // Facing a bet: fold / call / raise.
    const ahead = eq >= baseline + valueEdge;
    if (ahead && state.minRaiseTo !== null) {
      const r = betValue();
      if (r) return r;
      if (state.canAllIn) return { type: 'allin' };
    }
    if (shortStack) {
      if (eq >= potOdds - 0.05) return { type: 'call' };
      return { type: 'fold' };
    }
    if (eq >= potOdds + callEdge || (nOpp === 1 && eq >= potOdds - 0.02 && street !== 'river')) {
      return { type: 'call' };
    }
    return { type: 'fold' };
  }
};
