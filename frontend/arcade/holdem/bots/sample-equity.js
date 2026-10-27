module.exports = function act(state) {
  'use strict';

  const opponents = state.seats.filter(seat => seat.id !== state.you.id && !seat.out && !seat.folded).length;
  if (!opponents) return { type: state.canCheck ? 'check' : 'call' };
  // A fixed sample cap usually finishes well below the worker deadline.
  const deadline = Date.now() + Math.min(240, state.timeLimitMs / 4);
  let sum = 0;
  let batches = 0;
  do {
    sum += PokerEngine.equity(state.you.cards, state.board, opponents, 32, Math.random);
    batches++;
  } while (batches < 12 && Date.now() < deadline);
  const equity = sum / batches;
  const pot = state.pots.reduce((total, entry) => total + entry.amount, 0);
  const odds = state.toCall / Math.max(1, pot + state.toCall);
  const value = equity > Math.max(0.56, 1 / (opponents + 1) + 0.15);
  const bluff = state.street === 'river' && state.canCheck && opponents === 1 && Math.random() < 0.1;
  if ((value || bluff) && state.minRaiseTo !== null) {
    const fraction = Math.max(0.5, Math.min(1, equity));
    const target = Math.max(state.minRaiseTo, state.you.bet + state.toCall + Math.max(state.blinds[1], Math.floor((pot + state.toCall) * fraction)));
    return target >= state.maxRaiseTo ? { type: 'allin' } : { type: 'raise', amount: target };
  }
  if (state.canCheck) return { type: 'check' };
  return { type: equity >= odds + 0.025 ? 'call' : 'fold' };
};

module.exports.botName = 'Sample Equity';
module.exports.lab = 'Aizanoi sample';
module.exports.note = 'House sample; not an AI-model entry.';
