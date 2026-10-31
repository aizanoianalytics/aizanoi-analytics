'use strict';

module.exports = {
  name: 'Nemotron Holdem',
  act(state) {
    const you = state.you;
    const board = state.board;
    const street = state.street;
    const seats = state.seats;
    const myStack = you.stack;
    const myBet = you.bet;
    const toCall = state.toCall;
    const minRaiseTo = state.minRaiseTo;
    const maxRaiseTo = state.maxRaiseTo;
    const canCheck = state.canCheck;
    const canAllIn = state.canAllIn;
    const currentBet = state.currentBet;
    const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
    const opponentCount = seats.filter(s => s.id !== you.id && !s.out && !s.folded).length;
    const blinds = state.blinds;
    const bb = blinds[1];

    const handRanks = '23456789TJQKA';

    // Card ranks
    const r1 = handRanks.indexOf(you.cards[0][0]) + 2;
    const r2 = handRanks.indexOf(you.cards[1][0]) + 2;
    const suited = you.cards[0][1] === you.cards[1][1];
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    const isPair = r1 === r2;
    const isBroadway = high === 14;
    const isAK = high === 14 && low === 13;
    const isAQ = high === 14 && low === 12;
    const isGapTwoSuited = Math.abs(r1 - r2) === 2 && suited;
    const isConnLowSuited = Math.abs(r1 - r2) === 1 && suited && high <= 12;
    const isConnHighSuited = Math.abs(r1 - r2) === 1 && suited && high >= 13;

    // Position
    const mySeat = you.seat;
    const buttonSeat = state.buttonSeat;
    const seatsCount = seats.length;
    const pos = (mySeat - buttonSeat + seatsCount) % seatsCount;
    const isButton = pos === 0;
    const isCutoff = pos === 1;
    const isEarly = pos >= 5;
    const isLate = pos <= 2;

    // Effective stack in big blinds
    const effStack = myStack / Math.max(1, bb);

    // Helper: evaluate 5+ card hand
    const evalHand = (cards) => PokerEngine.evaluate(cards);

    // Helper: board flush suit check
    const boardFlushCheck = () => {
      const s = { c: 0, d: 0, h: 0, s: 0 };
      [...board, ...you.cards].forEach(card => s[card[1]]++);
      return Object.values(s).some(v => v >= 5);
    };

    // Helper: count our suit cards
    const ourSuitCount = () => {
      const s = { c: 0, d: 0, h: 0, s: 0 };
      [...board, ...you.cards].forEach(card => s[card[1]]++);
      return s[you.cards[0][1]] + s[you.cards[1][1]];
    };

    // Helper: board pairs
    const boardPairs = () => {
      const r = {};
      board.forEach(card => { r[card[0]] = (r[card[0]] || 0) + 1; });
      return r;
    };

    // Helper: compute equity
    const computeEq = (iters) => {
      if (opponentCount <= 0) return 1;
      try { return PokerEngine.equity(you.cards, board, opponentCount, iters, Math.random); } catch (e) { return 0.5; }
    };

    // --- PREFLOP ---
    if (street === 'preflop') {
      const facingBet = toCall > 0;
      const firstIn = currentBet === 0 && myBet === 0;

      // Hand groups (tight range)
      const isPremiumPair = isPair && high >= 10;
      const isHighPair = isPair && high >= 7;
      const isAK = high === 14 && low === 13;
      const isAQ = high === 14 && low === 12;
      const isAQs = isAQ && suited;
      const isKQs = high === 13 && low === 12 && suited;
      const isSuitedConnLow = isConnLowSuited; // JTs T9s 98s 87s 76s
      const isOneGapSuited = isGapTwoSuited; // KQo AQs etc

      if (firstIn) {
        // Act first - raise or fold (no limp preflop)
        if (isButton || isCutoff) {
          // Late position - raise good hands
          if (isPremiumPair || isAK || isAQs || isKQs || isSuitedConnLow || high >= 11) {
            const raiseAmt = Math.max(minRaiseTo || bb * 2, pot + myBet);
            if (raiseAmt >= maxRaiseTo) return { type: 'allin' };
            return { type: 'raise', amount: raiseAmt };
          }
        } else if (isEarly) {
          // Early position - only premium
          if (isPremiumPair || isAK) {
            const raiseAmt = Math.max(minRaiseTo || bb * 2, pot + myBet);
            if (raiseAmt >= maxRaiseTo) return { type: 'allin' };
            return { type: 'raise', amount: raiseAmt };
          }
        } else {
          // Middle position
          if (isPremiumPair || isAK || isAQs) {
            const raiseAmt = Math.max(minRaiseTo || bb * 2, pot + myBet);
            if (raiseAmt >= maxRaiseTo) return { type: 'allin' };
            return { type: 'raise', amount: raiseAmt };
          }
        }
        // Fold everything else
        if (canCheck) return { type: 'check' };
        return { type: 'fold' };
      } else {
        // Facing a raise - call, reraise, or fold
        // Tight calling range: pair+8s, AK, AQs, low suited connectors
        const isGoodCall = isPair && high >= 8 || isAK || isAQs || isSuitedConnLow;

        if (!isGoodCall) {
          return { type: 'fold' };
        }

        // Call small bets, reraise strong hands
        if (toCall <= bb && opponentCount <= 2) {
          return { type: 'call' };
        }

        // Reraise with strong hands
        if (isPair && high >= 11 || isAK || isAQs) {
          const reraise = Math.max(minRaiseTo || currentBet + bb, pot + myBet + bb);
          if (reraise >= maxRaiseTo) return { type: 'allin' };
          return { type: 'raise', amount: reraise };
        }

        // Just call with suited connectors etc
        return { type: 'call' };
      }
    }

    // --- FLOP ---
    if (street === 'flop') {
      const myHand = evalHand([...you.cards, ...board]);
      const myRank = myHand.rank;
      const myValue = myHand.value;
      const bFlush = boardFlushCheck();
      const bp = boardPairs();
      const boardPairRanks = Object.keys(bp).map(k => parseInt(k)).filter(k => bp[k] === 2);
      const bpMax = boardPairRanks.length > 0 ? Math.max(...boardPairRanks) : -1;
      const ourPair = myRank >= 1;
      const ourTwoPair = myRank === 2;
      const ourTrips = myRank === 3;
      const ourStraight = myRank === 4;
      const ourFlush = myRank === 5;
      const ourFullHouse = myRank === 6;
      const ourQuads = myRank === 7;
      const ourStraightFlush = myRank === 8;

      // Equity helpers
      const eqPair = computeEq(32);
      const eqTwoPair = computeEq(32);

      // --- Strong made hands ---
      if (ourQuads) {
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.5 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (ourStraightFlush) {
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.8 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (ourFlush) {
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.6 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (ourFullHouse) {
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.7 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (ourTrips) {
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 2, pot * 0.5 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      // --- Top pair / overpair ---
      if (myRank === 1) {
        // One pair, no board pair
        if (ourPair && boardPairRanks.length === 0) {
          if (canCheck) return { type: 'check' };
          const amount = Math.max(minRaiseTo || bb * 2, pot * 0.5 + toCall);
          const raiseTo = Math.min(amount, myStack + myBet);
          if (raiseTo >= maxRaiseTo) return { type: 'allin' };
          if (raiseTo <= currentBet) return { type: 'call' };
          return { type: 'raise', amount: raiseTo };
        }

        // Top pair with better kicker than board pair
        if (ourPair && boardPairRanks.length > 0 && high > bpMax) {
          if (canCheck) return { type: 'check' };
          const amount = Math.max(minRaiseTo || bb * 2, pot * 0.5 + toCall);
          const raiseTo = Math.min(amount, myStack + myBet);
          if (raiseTo >= maxRaiseTo) return { type: 'allin' };
          if (raiseTo <= currentBet) return { type: 'call' };
          return { type: 'raise', amount: raiseTo };
        }

        // Middle/low pair - check/fold
        if (canCheck) return { type: 'check' };
        if (toCall <= bb && opponentCount <= 2) return { type: 'call' };
        return { type: 'fold' };
      }

      // --- Two pair ---
      if (myRank === 2) {
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 2, pot * 0.55 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      // --- Draws ---
      // Flush draw: four to a flush
      if (!bFlush && ourSuitCount() >= 4) {
        const fdEquity = 0.18;
        const potRisk = toCall / Math.max(1, pot + toCall);
        if (fdEquity > potRisk + 0.03) {
          if (canCheck) return { type: 'check' };
          const amount = Math.max(minRaiseTo || bb * 2, pot * 0.45 + toCall);
          const raiseTo = Math.min(amount, myStack + myBet);
          if (raiseTo >= maxRaiseTo) return { type: 'allin' };
          if (raiseTo <= currentBet) return { type: 'call' };
          return { type: 'raise', amount: raiseTo };
        }
        if (canCheck) return { type: 'check' };
        if (toCall <= bb && opponentCount <= 1) return { type: 'call' };
        return { type: 'fold' };
      }

      // Straight draw
      const sd = hasStraightDraw();
      if (sd) {
        if (sd === 'oesd') {
          // OESD - play aggressively
          if (canCheck) return { type: 'check' };
          const amount = Math.max(minRaiseTo || bb * 2, pot * 0.5 + toCall);
          const raiseTo = Math.min(amount, myStack + myBet);
          if (raiseTo >= maxRaiseTo) return { type: 'allin' };
          if (raiseTo <= currentBet) return { type: 'call' };
          return { type: 'raise', amount: raiseTo };
        }
        // Gutshot - cautious
        if (canCheck) return { type: 'check' };
        if (toCall <= bb && opponentCount <= 2) return { type: 'call' };
        return { type: 'fold' };
      }

      // --- Weak hands ---
      if (myRank === 0) {
        if (canCheck) return { type: 'check' };
        if (high >= 14 && toCall <= bb) return { type: 'call' };
        if (high >= 13 && toCall <= bb * 1.5) return { type: 'call' };
        return { type: 'fold' };
      }

      // Default
      if (canCheck) return { type: 'check' };
      if (toCall <= bb * 0.5) return { type: 'call' };
      return { type: 'fold' };
    }

    // --- TURN ---
    if (street === 'turn') {
      const myHand = evalHand([...you.cards, ...board]);
      const myRank = myHand.rank;
      const bFlushCheck = boardFlushCheck();
      const ourSuitCountT = ourSuitCount();

      // Straight draw
      const hasStraightDraw = () => {
        const ranks = [...board, ...you.cards].map(c => handRanks.indexOf(c[0]) + 2).sort((a, b) => a - b);
        for (let i = 0; i <= ranks.length - 5; i++) {
          if (ranks[i + 4] - ranks[i] === 4) return 'oesd';
        }
        for (let high = 14; high >= 5; high--) {
          const needed = [high, high - 1, high - 2, high - 3, high - 4];
          const missing = needed.filter(r => !ranks.includes(r));
          if (missing.length === 1) return 'gutshot';
        }
        return false;
      };
      const sd = hasStraightDraw();

      // Strong made hands
      if (myRank >= 6) { // full house or better
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.6 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 5) { // flush
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.65 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 4) { // straight
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.6 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 3) { // trips
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 2, pot * 0.5 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      // Flush draw
      if (ourSuitCountT >= 4 && !bFlushCheck) {
        const equity = computeEq(32);
        const potRisk = toCall / Math.max(1, pot + toCall);
        if (equity > potRisk + 0.02) {
          if (canCheck) return { type: 'check' };
          const amount = Math.max(minRaiseTo || bb * 2, pot * 0.5 + toCall);
          const raiseTo = Math.min(amount, myStack + myBet);
          if (raiseTo >= maxRaiseTo) return { type: 'allin' };
          if (raiseTo <= currentBet) return { type: 'call' };
          return { type: 'raise', amount: raiseTo };
        }
        if (canCheck) return { type: 'check' };
        if (toCall <= bb && opponentCount <= 2) return { type: 'call' };
        return { type: 'fold' };
      }

      // Straight draw
      if (sd) {
        const equity = computeEq(32);
        const potRisk = toCall / Math.max(1, pot + toCall);
        const adjEq = sd === 'oesd' ? equity : equity * 0.55;
        if (adjEq > potRisk + 0.03) {
          if (canCheck) return { type: 'check' };
          const amount = Math.max(minRaiseTo || bb * 2, pot * 0.55 + toCall);
          const raiseTo = Math.min(amount, myStack + myBet);
          if (raiseTo >= maxRaiseTo) return { type: 'allin' };
          if (raiseTo <= currentBet) return { type: 'call' };
          return { type: 'raise', amount: raiseTo };
        }
        if (canCheck) return { type: 'check' };
        if (toCall <= bb && opponentCount <= 2) return { type: 'call' };
        return { type: 'fold' };
      }

      // Middle/weak pairs
      if (myRank === 2 || myRank === 1) {
        if (canCheck) return { type: 'check' };
        if (toCall <= bb * 0.5 && opponentCount <= 2) return { type: 'call' };
        return { type: 'fold' };
      }

      // High card
      if (myRank === 0) {
        if (canCheck) return { type: 'check' };
        if (toCall <= bb * 0.3) return { type: 'call' };
        return { type: 'fold' };
      }

      if (canCheck) return { type: 'check' };
      if (toCall <= bb * 0.5) return { type: 'call' };
      return { type: 'fold' };
    }

    // --- RIVER ---
    if (street === 'river') {
      const myHand = evalHand([...you.cards, ...board]);
      const myRank = myHand.rank;

      // Strong hands - value bet
      if (myRank >= 6) { // full house or better
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.7 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 5) { // flush
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.6 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 4) { // straight
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 3, pot * 0.5 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 3) { // trips
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 2, pot * 0.4 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 2) { // two pair
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 2, pot * 0.35 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      if (myRank === 1) { // one pair
        if (canCheck) return { type: 'check' };
        const amount = Math.max(minRaiseTo || bb * 2, pot * 0.3 + toCall);
        const raiseTo = Math.min(amount, myStack + myBet);
        if (raiseTo >= maxRaiseTo) return { type: 'allin' };
        if (raiseTo <= currentBet) return { type: 'call' };
        return { type: 'raise', amount: raiseTo };
      }

      // High card - rare bluff only
      if (myRank === 0) {
        if (canCheck) return { type: 'check' };
        if (opponentCount === 1 && isButton && Math.random() < 0.02) {
          const amount = Math.max(minRaiseTo || bb * 2, pot * 1.5);
          if (amount >= maxRaiseTo) return { type: 'allin' };
          return { type: 'raise', amount: amount };
        }
        return { type: 'fold' };
      }

      if (canCheck) return { type: 'check' };
      return { type: 'fold' };
    }

    // Fallback
    if (canCheck) return { type: 'check' };
    return { type: 'fold' };
  }
};
