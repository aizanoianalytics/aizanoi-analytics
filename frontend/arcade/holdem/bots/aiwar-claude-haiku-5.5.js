'use strict';

// Equity-driven bot: Monte Carlo equity vs. random opponents, adjusted for
// pot odds, position-free thresholds scaled by opponent count, and
// pot-proportional sizing. Fixed iteration counts keep it deterministic.

function opponentsLeft(state) {
  let n = 0;
  for (const s of state.seats) {
    if (s.id !== state.you.id && !s.out && !s.folded) n++;
  }
  return n;
}

function equityOf(state, opp) {
  const iters = opp <= 1 ? 900 : opp <= 3 ? 500 : opp <= 6 ? 300 : 200;
  return PokerEngine.equity(state.you.cards, state.board, Math.max(1, opp), iters, Math.random);
}

function potSize(state) {
  let t = 0;
  for (const p of state.pots) t += p.amount;
  return t;
}

function decide(state) {
  const opp = opponentsLeft(state);
  const bb = state.blinds[1];
  const pot = potSize(state);
  const toCall = state.toCall;
  const base = 1 / (opp + 1);
  const eq = equityOf(state, opp);

  // Short-stack commitment: shove when strong enough and little left behind.
  const spr = state.you.stack / Math.max(1, pot);
  if (state.canAllIn && spr <= 0.6 && eq > Math.max(0.5, base + 0.1)) {
    return { type: 'allin' };
  }

  const betThr = base + 0.12;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const needed = potOdds + 0.03;
  const canRaise = state.minRaiseTo !== null;

  if (state.canCheck) {
    if (canRaise && eq > betThr) {
      const frac = eq > 0.75 ? 0.9 : 0.6;
      const target = state.you.bet + Math.max(bb, Math.floor(pot * frac));
      return { type: 'raise', amount: target };
    }
    // Occasional semi-bluff heads-up with a weak hand on the later streets.
    if (canRaise && opp === 1 && state.street !== 'preflop' && eq < 0.35 && Math.random() < 0.12) {
      return { type: 'raise', amount: state.you.bet + Math.max(bb, Math.floor(pot * 0.5)) };
    }
    return { type: 'check' };
  }

  // Facing a bet.
  const raiseThr = betThr + 0.1;
  if (canRaise && eq > raiseThr) {
    const frac = eq > 0.8 ? 0.9 : 0.7;
    const target = state.you.bet + toCall + Math.max(bb, Math.floor((pot + toCall) * frac));
    return { type: 'raise', amount: target };
  }
  if (eq >= needed) return { type: 'call' };
  return { type: 'fold' };
}

function legalize(state, a) {
  const fallback = state.canCheck ? { type: 'check' } : { type: 'fold' };
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return fallback;
  switch (a.type) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return state.canCheck ? { type: 'check' } : fallback;
    case 'call':
      return state.canCheck ? { type: 'check' } : { type: 'call' };
    case 'allin':
      return state.canAllIn ? { type: 'allin' } : fallback;
    case 'raise': {
      if (state.minRaiseTo === null) return fallback;
      let amount = Math.floor(Number(a.amount));
      if (!Number.isSafeInteger(amount)) return fallback;
      if (amount < state.minRaiseTo) amount = state.minRaiseTo;
      if (amount >= state.maxRaiseTo) {
        return state.canAllIn ? { type: 'allin' } : fallback;
      }
      if (amount <= state.currentBet) return fallback;
      return { type: 'raise', amount };
    }
    default:
      return fallback;
  }
}

module.exports = {
  name: 'Claude Haiku 5.5',
  act(state) {
    try {
      return legalize(state, decide(state));
    } catch (err) {
      return state.canCheck ? { type: 'check' } : { type: 'fold' };
    }
  }
};
