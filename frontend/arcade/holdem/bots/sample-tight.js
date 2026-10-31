module.exports = function act(state) {
  'use strict';

  const ranks = '23456789TJQKA';
  const [a, b] = state.you.cards.map(card => ranks.indexOf(card[0]) + 2).sort((x, y) => y - x);
  const suited = state.you.cards[0][1] === state.you.cards[1][1];
  const active = state.seats.filter(seat => !seat.out);
  const afterButton = active.filter(seat => (seat.seat - state.buttonSeat + state.seats.length) % state.seats.length > (state.you.seat - state.buttonSeat + state.seats.length) % state.seats.length).length;
  const late = state.you.seat === state.buttonSeat || afterButton <= 1;
  const pot = state.pots.reduce((sum, entry) => sum + entry.amount, 0);
  const bb = state.blinds[1];
  let strong;
  let playable;
  if (state.street === 'preflop') {
    strong = (a === b && a >= 10) || (a === 14 && b >= 12);
    playable = strong || (a === b && a >= (late ? 2 : 7)) || (a >= 13 && b >= (late ? 9 : 11)) || (suited && a >= 10 && a - b <= 2 && late) || (a === 14 && (suited || b >= (late ? 7 : 10)));
  } else {
    const hand = PokerEngine.evaluate([...state.you.cards, ...state.board]);
    const boardRank = state.board.length >= 5 ? PokerEngine.evaluate(state.board).rank : -1;
    strong = hand.rank >= 2 && hand.rank > boardRank;
    playable = hand.rank >= 1;
  }
  if (strong && state.minRaiseTo !== null) {
    const target = Math.max(state.minRaiseTo, state.you.bet + state.toCall + Math.max(bb * 2, Math.floor(pot * 0.65)));
    return target >= state.maxRaiseTo ? { type: 'allin' } : { type: 'raise', amount: target };
  }
  if (state.canCheck) return { type: 'check' };
  const limit = state.street === 'preflop' ? bb * (strong ? 20 : 4) : Math.max(bb, pot * (strong ? 1 : 0.3));
  return { type: playable && state.toCall <= limit ? 'call' : 'fold' };
};

module.exports.botName = 'Sample Tight';
module.exports.lab = 'Aizanoi sample';
module.exports.note = 'House sample; not an AI-model entry.';
