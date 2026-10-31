'use strict';

// ============================================================================
// TITAN HOLD'EM - Advanced Tournament AI Poker Bot
// ============================================================================

const RANKS = '23456789TJQKA';
const SUITS = ['c', 'd', 'h', 's'];

// 13x13 Preflop Hand Strength Percentile Matrix (0 to 100)
const PAIRS = [41, 46, 52, 58, 64, 70, 76, 81, 86, 90, 94, 97, 100];

const SUITED = [
  [], // 2
  [20], // 3
  [20, 28], // 4
  [20, 28, 38], // 5
  [16, 23, 32, 43], // 6
  [14, 20, 28, 38, 48], // 7
  [17, 19, 26, 35, 45, 55], // 8
  [21, 23, 25, 32, 42, 52, 61], // 9
  [26, 28, 29, 31, 39, 49, 59, 68], // T
  [31, 33, 35, 37, 39, 46, 56, 65, 74], // J
  [37, 39, 41, 43, 45, 47, 55, 64, 73, 78], // Q
  [42, 44, 46, 48, 50, 53, 57, 66, 75, 80, 85], // K
  [58, 60, 63, 66, 62, 65, 69, 74, 83, 88, 92, 96] // A
];

const OFFSUIT = [
  [], // 2
  [7], // 3
  [8, 13], // 4
  [8, 13, 20], // 5
  [7, 11, 16, 24], // 6
  [5, 9, 14, 21, 30], // 7
  [7, 9, 12, 18, 27, 37], // 8
  [9, 10, 12, 16, 24, 34, 45], // 9
  [11, 13, 14, 16, 22, 31, 42, 54], // T
  [15, 16, 18, 20, 22, 29, 38, 50, 62], // J
  [19, 21, 23, 25, 27, 30, 37, 49, 61, 67], // Q
  [24, 26, 28, 30, 32, 35, 40, 51, 63, 70, 76], // K
  [38, 40, 43, 47, 44, 48, 53, 60, 72, 79, 84, 91] // A
];

function getPreflopScore(card1, card2) {
  const r1 = RANKS.indexOf(card1[0]);
  const r2 = RANKS.indexOf(card2[0]);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  if (high === low) return PAIRS[high];
  const suited = card1[1] === card2[1];
  return suited ? SUITED[high][low] : OFFSUIT[high][low];
}

// Opponent tracker across hands
const opponentStats = new Map();
let lastTrackedHand = -1;

function updateOpponentTracking(state) {
  if (state.handNumber === lastTrackedHand) return;
  lastTrackedHand = state.handNumber;

  for (const s of state.seats) {
    if (!opponentStats.has(s.id)) {
      opponentStats.set(s.id, { hands: 0, vpip: 0, pfr: 0 });
    }
  }

  for (const s of state.seats) {
    if (!s.out) {
      opponentStats.get(s.id).hands++;
    }
  }

  const preflopActions = state.actions.filter(a => a.street === 'preflop');
  const seenVPIP = new Set();
  const seenPFR = new Set();
  for (const a of preflopActions) {
    if (a.type === 'call' || a.type === 'raise' || a.type === 'allin') {
      seenVPIP.add(a.id);
    }
    if (a.type === 'raise') {
      seenPFR.add(a.id);
    }
  }
  for (const id of seenVPIP) {
    const st = opponentStats.get(id);
    if (st) st.vpip++;
  }
  for (const id of seenPFR) {
    const st = opponentStats.get(id);
    if (st) st.pfr++;
  }
}

function getOpponentProfile(oppId) {
  const st = opponentStats.get(oppId);
  if (!st || st.hands < 5) return { isStation: false, isTight: false, isAggro: false };
  const vpipRate = st.vpip / Math.max(1, st.hands);
  const pfrRate = st.pfr / Math.max(1, st.hands);
  return {
    isStation: vpipRate > 0.40 && pfrRate < 0.20,
    isTight: vpipRate < 0.22,
    isAggro: pfrRate > 0.30
  };
}

function getDrawOuts(holeCards, board) {
  const pool = [...holeCards, ...board];
  if (pool.length < 5 || pool.length >= 7) {
    return { flushOuts: 0, straightOuts: 0, totalOuts: 0 };
  }
  const currentEval = PokerEngine.evaluate(pool);

  const suitCounts = { c: 0, d: 0, h: 0, s: 0 };
  for (const c of pool) suitCounts[c[1]]++;
  let flushOuts = 0;
  for (const s of SUITS) {
    if (suitCounts[s] === 4 && holeCards.some(c => c[1] === s)) {
      flushOuts = 9;
      break;
    }
  }

  let straightOutRanks = 0;
  if (currentEval.rank < 4) {
    for (let r = 0; r < 13; r++) {
      const rankChar = RANKS[r];
      const dummy = SUITS.map(s => rankChar + s).find(c => !pool.includes(c));
      if (dummy) {
        const testEval = PokerEngine.evaluate([...pool, dummy]);
        if (testEval.rank >= 4) {
          straightOutRanks++;
        }
      }
    }
  }
  const straightOuts = straightOutRanks * 4;
  return { flushOuts, straightOuts, totalOuts: flushOuts + straightOuts };
}

function makeRaise(state, targetAmount) {
  if (state.minRaiseTo === null) return null;
  let target = Math.floor(targetAmount);
  if (target >= state.maxRaiseTo) {
    return state.canAllIn ? { type: 'allin' } : null;
  }
  if (target < state.minRaiseTo) {
    target = state.minRaiseTo;
  }
  if (target > state.maxRaiseTo) {
    target = state.maxRaiseTo;
  }
  if (target <= state.currentBet) return null;
  if (target < state.minRaiseTo && target !== state.maxRaiseTo) return null;
  if (target === state.maxRaiseTo) {
    return state.canAllIn ? { type: 'allin' } : { type: 'raise', amount: target };
  }
  return { type: 'raise', amount: target };
}

function act(state) {
  try {
    updateOpponentTracking(state);

    const bb = state.blinds[1];
    const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
    const activeSeats = state.seats.filter(s => !s.out);
    const liveOpponents = state.seats.filter(s => !s.out && !s.folded && s.id !== state.you.id);
    const numOpponents = liveOpponents.length;

    if (numOpponents === 0) {
      return state.canCheck ? { type: 'check' } : { type: 'call' };
    }

    const isHeadsUp = activeSeats.length === 2;
    const isButton = state.you.seat === state.buttonSeat;
    const isSmallBlind = state.you.seat === state.smallBlindSeat;
    const isBigBlind = state.you.seat === state.bigBlindSeat;

    const maxOpponentStack = Math.max(...liveOpponents.map(s => s.stack + s.bet));
    const effectiveStack = Math.min(state.you.stack + state.you.bet, maxOpponentStack);
    const effectiveBB = effectiveStack / Math.max(1, bb);

    const primaryOpp = liveOpponents[0];
    const profile = getOpponentProfile(primaryOpp.id);

    // ========================================================================
    // PREFLOP STRATEGY
    // ========================================================================
    if (state.street === 'preflop') {
      const score = getPreflopScore(state.you.cards[0], state.you.cards[1]);
      const potOdds = state.toCall / Math.max(1, pot + state.toCall);
      const isUnopened = state.currentBet <= bb;

      const seatsAfterYou = activeSeats.filter(s => {
        const dist = (s.seat - state.buttonSeat + state.seats.length) % state.seats.length;
        const youDist = (state.you.seat - state.buttonSeat + state.seats.length) % state.seats.length;
        return dist > youDist;
      }).length;
      const isLate = isButton || seatsAfterYou <= 1;
      const isEarly = !isLate && seatsAfterYou >= 3;

      // ----------------------------------------------------------------------
      // 1. PUSH / FOLD ZONE (Effective stack <= 12 BB)
      // ----------------------------------------------------------------------
      if (effectiveBB <= 12) {
        if (isUnopened) {
          let pushThreshold = 58;
          if (isHeadsUp && isButton) pushThreshold = 30; // Shove 70%+ of hands HU on BTN
          else if (isButton) pushThreshold = 40;
          else if (isLate) pushThreshold = 50;
          else if (isEarly) pushThreshold = 66;

          if (score >= pushThreshold && state.canAllIn) {
            return { type: 'allin' };
          }
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        } else {
          // Facing raise or shove when short
          // Pot odds are huge when calling short shoves
          const callThreshold = effectiveBB <= 6 ? 54 : (effectiveBB <= 9 ? 65 : 74);
          if (score >= callThreshold) {
            if (state.canAllIn && state.toCall >= state.you.stack * 0.6) return { type: 'allin' };
            return { type: 'call' };
          }
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        }
      }

      // ----------------------------------------------------------------------
      // 2. HEADS-UP PREFLOP (> 12 BB)
      // ----------------------------------------------------------------------
      if (isHeadsUp) {
        if (isButton) {
          // Button/SB heads-up: Open raise ~75% of hands!
          if (score >= 32 && state.minRaiseTo !== null) {
            const r = makeRaise(state, state.you.bet + state.toCall + bb * 2);
            if (r) return r;
          }
          if (score >= 22 && state.canCheck) return { type: 'check' };
          return { type: score >= 22 ? 'call' : 'fold' };
        } else {
          // In Big Blind heads-up
          if (isUnopened) {
            // Button limped
            if (score >= 58 && state.minRaiseTo !== null) {
              const r = makeRaise(state, state.you.bet + bb * 3);
              if (r) return r;
            }
            return { type: 'check' };
          } else {
            // Button raised
            if (score >= 80 && state.minRaiseTo !== null) {
              const r = makeRaise(state, state.you.bet + state.toCall + state.currentBet * 2.5);
              if (r) return r;
            }
            // Defend BB wide against small raise
            if (score >= 35 && potOdds <= 0.35) {
              return { type: 'call' };
            }
            if (state.canCheck) return { type: 'check' };
            return { type: 'fold' };
          }
        }
      }

      // ----------------------------------------------------------------------
      // 3. MULTIWAY NORMAL PREFLOP (> 12 BB)
      // ----------------------------------------------------------------------
      // Premiums: AA, KK, QQ, JJ, AKs, AKo (Score >= 90)
      if (score >= 90) {
        if (state.minRaiseTo !== null) {
          if (state.currentBet > bb * 4) {
            return state.canAllIn ? { type: 'allin' } : { type: 'call' };
          }
          const raiseAmount = Math.max(state.minRaiseTo, state.you.bet + state.toCall + (isUnopened ? bb * 3 : state.currentBet * 3));
          const r = makeRaise(state, raiseAmount);
          if (r) return r;
        }
        return state.canCheck ? { type: 'check' } : { type: 'call' };
      }

      // Strong: TT, 99, 88, AQs, AQo, AJs, KQs, ATs, KJs (Score 78..89)
      if (score >= 78) {
        if (isUnopened) {
          if (state.minRaiseTo !== null) {
            const r = makeRaise(state, state.you.bet + state.toCall + Math.floor(bb * 2.5));
            if (r) return r;
          }
        } else {
          if (state.toCall <= bb * 4) {
            if (isLate && state.minRaiseTo !== null && Math.random() < 0.6) {
              const r = makeRaise(state, state.you.bet + state.toCall + Math.floor(state.currentBet * 2.5));
              if (r) return r;
            }
            return { type: 'call' };
          }
        }
        if (state.canCheck) return { type: 'check' };
        return { type: state.toCall <= bb * 5 ? 'call' : 'fold' };
      }

      // Playable: 77-55, AJo, KQo, QJs, JTs, T9s, 98s, suited Aces (Score 60..77)
      if (score >= 60) {
        if (isUnopened) {
          if ((isLate || !isEarly) && state.minRaiseTo !== null) {
            const r = makeRaise(state, state.you.bet + state.toCall + Math.floor(bb * 2.2));
            if (r) return r;
          }
          if (state.canCheck) return { type: 'check' };
          return { type: 'call' };
        } else {
          if (state.canCheck) return { type: 'check' };
          if (isBigBlind && state.toCall <= bb * 3 && potOdds <= 0.35) {
            return { type: 'call' };
          }
          if (isLate && state.toCall <= bb * 2.5) {
            return { type: 'call' };
          }
          return { type: 'fold' };
        }
      }

      // Steals / Marginal (Score 44..59)
      if (score >= 44) {
        if (isUnopened && (isButton || (isLate && profile.isTight))) {
          if (state.minRaiseTo !== null) {
            const r = makeRaise(state, state.you.bet + state.toCall + Math.floor(bb * 2.0));
            if (r) return r;
          }
        }
        if (state.canCheck) return { type: 'check' };
        if (isBigBlind && state.toCall <= bb && potOdds <= 0.25) {
          return { type: 'call' };
        }
        return { type: 'fold' };
      }

      // Trash (< 44)
      if (state.canCheck) return { type: 'check' };
      return { type: 'fold' };
    }

    // ========================================================================
    // POSTFLOP STRATEGY (Flop, Turn, River)
    // ========================================================================
    const iters = numOpponents === 1 ? 200 : numOpponents === 2 ? 150 : 100;
    const equity = PokerEngine.equity(state.you.cards, state.board, numOpponents, iters, Math.random);

    const handEval = PokerEngine.evaluate([...state.you.cards, ...state.board]);
    const boardEval = state.board.length >= 5 ? PokerEngine.evaluate(state.board) : { rank: 0 };
    const draws = getDrawOuts(state.you.cards, state.board);
    const potOdds = state.toCall / Math.max(1, pot + state.toCall);

    // Board analysis
    const sortedBoardRanks = state.board.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
    const highestBoardRank = sortedBoardRanks[0];
    const heroRanks = state.you.cards.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);

    const isMonster = handEval.rank >= 4 || (handEval.rank === 3 && heroRanks[0] === heroRanks[1]); // Straight+ or Set
    const isTwoPair = handEval.rank === 2 && handEval.rank > boardEval.rank;
    const isOverpair = heroRanks[0] === heroRanks[1] && heroRanks[0] > highestBoardRank;
    const isTopPair = heroRanks.includes(highestBoardRank);
    const topPairKicker = isTopPair ? (heroRanks[0] === highestBoardRank ? heroRanks[1] : heroRanks[0]) : 0;
    const isGoodTopPair = isTopPair && topPairKicker >= 8; // Kicker T or better

    const isMiddlePair = sortedBoardRanks.length > 1 && heroRanks.includes(sortedBoardRanks[1]);
    const isComboDraw = draws.totalOuts >= 12;
    const isGoodDraw = draws.totalOuts >= 8;

    const hasStrongMadeHand = isMonster || isTwoPair || isOverpair || (isGoodTopPair && equity >= 0.55);
    const hasMarginalMadeHand = (isTopPair && !isGoodTopPair) || isMiddlePair || (isHeadsUp && handEval.rank >= 1);

    // ------------------------------------------------------------------------
    // CASE A: WE CAN CHECK (No bet to call)
    // ------------------------------------------------------------------------
    if (state.canCheck) {
      // Monster: Bet large for value!
      if (isMonster || equity >= 0.80) {
        if (state.minRaiseTo !== null) {
          const betPct = profile.isStation ? 0.85 : 0.65;
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * betPct)));
          if (r) return r;
        }
        return { type: 'check' };
      }

      // Strong made hand: Value bet
      if (hasStrongMadeHand) {
        if (state.minRaiseTo !== null) {
          const betPct = profile.isStation ? 0.75 : 0.55;
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * betPct)));
          if (r) return r;
        }
        return { type: 'check' };
      }

      // Semi-bluff: Combo draws or good flush/straight draws
      if ((isComboDraw || (isGoodDraw && Math.random() < 0.65)) && !profile.isStation) {
        if (state.minRaiseTo !== null) {
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * 0.50)));
          if (r) return r;
        }
      }

      // Steal against Tight Bot postflop: if tight bot checked, bet 35% pot to force folds
      if (numOpponents === 1 && profile.isTight) {
        if (state.minRaiseTo !== null) {
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * 0.35)));
          if (r) return r;
        }
      }

      // Marginal made hand: In heads up, bet for value/protection
      if (isHeadsUp && hasMarginalMadeHand && equity >= 0.52 && Math.random() < 0.6) {
        if (state.minRaiseTo !== null) {
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * 0.40)));
          if (r) return r;
        }
      }

      // C-bet bluff on Flop (dry board, heads up, not a station)
      if (state.street === 'flop' && numOpponents === 1 && !profile.isStation && Math.random() < 0.40) {
        if (state.minRaiseTo !== null) {
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * 0.33)));
          if (r) return r;
        }
      }

      // River bluff against tight opponent who checked
      if (state.street === 'river' && numOpponents === 1 && profile.isTight && Math.random() < 0.35) {
        if (state.minRaiseTo !== null) {
          const r = makeRaise(state, state.you.bet + Math.max(bb, Math.floor(pot * 0.50)));
          if (r) return r;
        }
      }

      return { type: 'check' };
    }

    // ------------------------------------------------------------------------
    // CASE B: FACING A BET (Must Call, Raise, or Fold)
    // ------------------------------------------------------------------------
    // If facing a bet from a Tight Bot: they only bet 2 pair or better!
    // Fold marginal hands against tight bots
    if (profile.isTight && !isMonster && !isTwoPair && equity < 0.70) {
      if (state.toCall > bb * 2) {
        return { type: 'fold' };
      }
    }

    // Monster: Re-raise for value!
    if (isMonster || equity >= 0.82) {
      if (state.minRaiseTo !== null) {
        const raiseSize = state.you.bet + state.toCall + Math.max(state.lastFullRaise, Math.floor(pot * 0.75));
        const r = makeRaise(state, raiseSize);
        if (r) return r;
      }
      return { type: 'call' };
    }

    // Strong hand: Raise if equity very high, else call
    if (hasStrongMadeHand) {
      if (equity >= 0.72 && state.minRaiseTo !== null && Math.random() < 0.6) {
        const raiseSize = state.you.bet + state.toCall + Math.max(state.lastFullRaise, Math.floor(pot * 0.60));
        const r = makeRaise(state, raiseSize);
        if (r) return r;
      }
      return { type: 'call' };
    }

    // Semi-bluff raise with combo draw
    if (isComboDraw && state.street === 'flop' && !profile.isStation && state.minRaiseTo !== null) {
      if (Math.random() < 0.6) {
        const raiseSize = state.you.bet + state.toCall + Math.max(state.lastFullRaise, Math.floor(pot * 0.60));
        const r = makeRaise(state, raiseSize);
        if (r) return r;
      }
      return { type: 'call' };
    }

    // Drawing call: implied odds on flop/turn
    if (state.street !== 'river' && draws.totalOuts >= 4) {
      const remainingStreets = state.street === 'flop' ? 2 : 1;
      const drawEquity = draws.totalOuts * (remainingStreets === 2 ? 0.04 : 0.022);
      if (drawEquity >= potOdds - 0.05 && state.toCall <= effectiveStack * 0.35) {
        return { type: 'call' };
      }
    }

    // Pure pot-odds calling:
    if (equity >= potOdds) {
      return { type: 'call' };
    }

    // Heads up bluff-catching with pair or ace-high against small bet
    if (isHeadsUp && (handEval.rank >= 1 || heroRanks[0] === 12) && state.toCall <= bb * 2 && potOdds <= 0.25) {
      return { type: 'call' };
    }

    return { type: 'fold' };
  } catch (err) {
    return state.canCheck ? { type: 'check' } : { type: 'fold' };
  }
}

module.exports = {
  name: 'TitanHoldem',
  botName: 'TitanHoldem',
  act: act
};
