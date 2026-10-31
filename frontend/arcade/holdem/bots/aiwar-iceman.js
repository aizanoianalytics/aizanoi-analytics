'use strict';

module.exports = {
  name: 'Iceman',
  act(state) {
    try {
      const you = state.you;
      const cards = you.cards;
      const board = state.board || [];
      const street = state.street;
      const pot = Array.isArray(state.pots) ? state.pots.reduce((s, p) => s + (p.amount || 0), 0) : 0;
      const toCall = state.toCall || 0;
      const canCheck = !!state.canCheck;
      const minRaiseTo = state.minRaiseTo;
      const maxRaiseTo = state.maxRaiseTo;
      const bb = (state.blinds && state.blinds[1]) || 100;
      const buttonSeat = state.buttonSeat;
      
      // Count opponents still in hand
      const opponentsInHand = state.seats.filter(s => s.id !== you.id && !s.out && !s.folded).length;
      const opponentsAlive = state.seats.filter(s => s.id !== you.id && !s.out).length;
      // Track opponent tendencies from history
      let opponentStyle = { tight: false, loose: false, aggro: false, passive: false };
      if (state.history && state.history.length > 0) {
        // quick glance
        const hist = state.history.slice(-10);
        let folds = 0, bets = 0;
        for (let h=0; h<hist.length; h++) {
          // can't see individual actions in history summary, but rough
        }
      }
      
      // Position
      const activeSeats = state.seats.filter(s => !s.out);
      const posFromButton = activeSeats.length === 0 ? 0 : ((you.seat - buttonSeat + state.seats.length) % state.seats.length);
      const isButton = posFromButton === 0;
      const isSB = you.seat === state.smallBlindSeat;
      const isBB = you.seat === state.bigBlindSeat;
      const inPosition = isButton || (opponentsInHand > 0 && posFromButton < Math.floor(activeSeats.length / 2) && !isButton); // rough
      
      // Preflop hand evaluation
      const RANKS = '23456789TJQKA';
      const getRank = c => RANKS.indexOf(c[0]) + 2;
      const r1 = getRank(cards[0]), r2 = getRank(cards[1]);
      const high = Math.max(r1,r2), low = Math.min(r1,r2);
      const pair = r1 === r2;
      const suited = cards[0][1] === cards[1][1];
      const gap = high - low;
      
      function preflopStrength() {
        if (pair) {
          if (high >= 14) return 1.0; // AA
          if (high >= 13) return 0.95; // KK
          if (high >= 12) return 0.92; // QQ
          if (high >= 11) return 0.88; // JJ
          if (high >= 10) return 0.84; // TT
          if (high >= 9) return 0.78; // 99
          if (high >= 8) return 0.72; // 88
          if (high >= 7) return 0.66; // 77
          if (high >= 6) return 0.60; // 66
          if (high >= 5) return 0.54; // 55
          if (high >= 4) return 0.48; // 44
          if (high >= 3) return 0.42; // 33
          return 0.38; // 22
        }
        // Axs
        if (high === 14) {
          if (suited) {
            if (low >= 13) return 0.9; // AKs
            if (low >= 12) return 0.85; // AQs
            if (low >= 11) return 0.81; // AJs
            if (low >= 10) return 0.77; // ATs
            if (low >= 9) return 0.72; // A9s
            if (low >= 8) return 0.68; // A8s
            if (low >= 7) return 0.65; // A7s
            if (low >= 6) return 0.62; // A6s
            if (low >= 5) return 0.6; // A5s
            if (low >= 4) return 0.58; // A4s
            if (low >= 3) return 0.56; // A3s
            return 0.54; // A2s
          } else {
            if (low >= 13) return 0.83; // AKo
            if (low >= 12) return 0.78; // AQo
            if (low >= 11) return 0.74; // AJo
            if (low >= 10) return 0.7; // ATo
            if (low >= 9) return 0.64; // A9o
            if (low >= 8) return 0.59; // A8o
            if (low >= 7) return 0.55; // A7o
            return 0.52;
          }
        }
        // KQs, KJs etc
        if (high === 13 && low === 12) {
          return suited ? 0.8 : 0.72;
        }
        if (suited) {
          if (high >= 13 && low >= 11) return 0.76; // KJs
          if (high >= 12 && low >= 11) return 0.73; // QJs
          if (high >= 13 && gap <= 1) return 0.72;
          if (high >= 11 && gap <= 1) return 0.68; // JTs
          if (high >= 10 && gap <= 1 && low >= 9) return 0.64; // T9s
          if (high >= 9 && gap <= 1 && low >= 8) return 0.6; // 98s
          if (high >= 8 && gap <= 1 && low >= 7) return 0.57;
          if (high >= 7 && gap <= 1 && low >= 6) return 0.54;
          if (high >= 11 && low >= 10) return 0.63; // JTo-ish suited? JT
          if (gap <= 2 && high >= 10) return 0.55;
          if (gap <= 3 && high >= 9) return 0.52;
          if (gap <= 4 && high >= 8) return 0.5;
          return 0.45;
        } else {
          if (high >= 13 && low >= 11) return 0.68;
          if (high >= 12 && low >= 11) return 0.65;
          if (high >= 11 && gap <= 1) return 0.61; // JTo
          if (high >= 10 && gap <= 1 && low >= 9) return 0.57; // T9o
          if (gap <= 2 && high >= 11) return 0.55;
          if (gap <= 3 && high >= 10) return 0.52;
          return 0.46;
        }
      }
      
      let preflopStr = street === 'preflop' ? preflopStrength() : 0;
      
      // Postflop hand strength
      let madeStrength = 0;
      let equity = 0.5;
      if (board.length > 0) {
        try {
          const hero5 = PokerEngine.evaluate([...cards, ...board]);
          // Get rank category
          madeStrength = hero5.rank / 8.0; // normalize
          // Estimate equity vs opponents
          if (opponentsInHand > 0 && opponentsInHand <= 8) {
            // Quick equity calc - keep it fast
            const iters = opponentsInHand >= 6 ? 200 : (opponentsInHand >= 3 ? 300 : 400);
            equity = PokerEngine.equity(cards, board, opponentsInHand, iters, Math.random);
          }
        } catch (e) {
          madeStrength = 0.1;
          equity = 0.5;
        }
      }
      
      // Adjust preflop by position
      if (street === 'preflop') {
        const posAdj = isButton ? 1.08 : (posFromButton <= 1 && activeSeats.length > 2 ? 0.95 : (posFromButton >= activeSeats.length - 2 ? 1.02 : 1.0));
        preflopStr = Math.min(1.0, preflopStr * posAdj);
        // Heads up adjustments
        if (activeSeats.length === 2) {
          preflopStr = Math.min(1.0, preflopStr * 1.1); // play wider heads up
        }
      }
      
      const effectiveStack = Math.min(you.stack + you.bet, state.seats.filter(s=>!s.out).reduce((m,s)=>Math.max(m,s.stack+s.bet), 0));
      const spr = pot > 0 ? (you.stack / pot) : 10;
      
      // Decide action
      if (street === 'preflop') {
        const facingRaise = state.actions && state.actions.length > 0 && state.actions.some(a=>a.street==='preflop' && (a.type === 'raise' || a.type === 'allin'));
        const facingBet = toCall > 0 && !canCheck; // facing a bet/raise
        
        if (!facingBet && canCheck) {
          // Can check - rare preflop except BB can check if all limped? Or if we already posted blinds
          // If we're BB and no one raised above BB
          if (isBB && toCall === 0) {
            // Check
            if (preflopStr >= 0.7) {
              // Sometimes raise as BB with strong hands
              if (minRaiseTo !== null && state.actions.filter(a=>a.street==='preflop').length >= 0) {
                // check or raise
                if (Math.random() < 0.3 && preflopStr >= 0.8) {
                  const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + bb * 3));
                  if (target >= minRaiseTo) return { type: target >= maxRaiseTo ? 'allin' : 'raise', amount: target };
                }
              }
              return { type: 'check' };
            }
            return { type: 'check' };
          }
          return { type: 'check' };
        }
        
        if (facingBet) {
          const betSize = toCall;
          const potOdds = pot > 0 ? betSize / (pot + betSize) : 1;
          
          if (preflopStr >= 0.95) {
            if (minRaiseTo !== null) {
              const reraiseSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + toCall + Math.max(bb * 3.5, toCall * 3)));
              if (reraiseSize >= minRaiseTo) {
                if (reraiseSize >= maxRaiseTo * 0.75) return { type: 'allin' };
                return { type: 'raise', amount: Math.floor(reraiseSize) };
              }
            }
            if (toCall >= you.stack) return { type: 'allin' };
            return { type: 'call' };
          } else if (preflopStr >= 0.75) {
            if (minRaiseTo !== null && betSize <= bb * 4 && opponentsInHand <= 2 && Math.random() < 0.35) {
              const reraiseSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + toCall + bb * 3.5));
              if (reraiseSize < maxRaiseTo && reraiseSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(reraiseSize) };
              if (reraiseSize >= maxRaiseTo) return { type: 'allin' };
            }
            if (toCall >= you.stack) return { type: 'allin' };
            if (potOdds < 0.38 || preflopStr > potOdds * 1.3) return { type: 'call' };
            return toCall < bb * 6 ? { type: 'call' } : { type: 'fold' };
          } else if (preflopStr >= 0.6) {
            if (toCall >= you.stack) return { type: 'allin' };
            if (minRaiseTo !== null && isButton && betSize <= bb * 3 && Math.random() < 0.2) {
              const reraiseSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + toCall + bb * 3));
              if (reraiseSize < maxRaiseTo) return { type: 'raise', amount: Math.floor(reraiseSize) };
            }
            if (potOdds < preflopStr + 0.08) return { type: 'call' };
            if (isButton && potOdds < 0.42) return { type: 'call' };
            return potOdds < 0.32 ? { type: 'call' } : { type: 'fold' };
          } else if (preflopStr >= 0.52) {
            if (toCall >= you.stack) return { type: 'allin' };
            if (isButton && potOdds < 0.32) return { type: 'call' };
            if (toCall <= bb * 2.5 && potOdds < 0.28) return { type: 'call' };
            if (activeSeats.length <= 3 && potOdds < 0.35) return { type: 'call' };
            return { type: 'fold' };
          } else if (preflopStr >= 0.45) {
            if (toCall >= you.stack && preflopStr > 0.42) return { type: 'allin' };
            if (isButton && potOdds < 0.25) return { type: 'call' };
            if (toCall <= bb * 1.5) return { type: 'call' };
            return { type: 'fold' };
          } else {
            if (toCall >= you.stack && preflopStr > 0.43) return { type: 'allin' };
            return { type: 'fold' };
          }
        }
        
        // Opening action
        if (preflopStr >= 0.95) {
          if (minRaiseTo !== null) {
            const openSize = (isButton || activeSeats.length === 2) ? bb * 3.5 : bb * 4;
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + openSize));
            if (target >= maxRaiseTo * 0.85) return { type: 'allin' };
            return { type: 'raise', amount: Math.floor(target) };
          }
          return state.canAllIn ? { type: 'allin' } : (canCheck ? { type: 'check' } : { type: 'fold' });
        } else if (preflopStr >= 0.75) {
          if (minRaiseTo !== null) {
            const openSize = isButton ? bb * 2.75 : bb * 3.25;
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + openSize));
            if (target >= maxRaiseTo) return { type: 'allin' };
            return { type: 'raise', amount: Math.floor(target) };
          }
          return canCheck ? { type: 'check' } : { type: 'fold' };
        } else if (preflopStr >= 0.58) {
          if (minRaiseTo !== null && (isButton || activeSeats.length <= 4 || inPosition || activeSeats.length === 2)) {
            const openSize = isButton ? bb * 2.5 : (activeSeats.length === 2 ? bb * 3 : bb * 3);
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + openSize));
            if (target < maxRaiseTo && target >= minRaiseTo) return { type: 'raise', amount: Math.floor(target) };
            if (target >= maxRaiseTo) return { type: 'allin' };
          }
          if (canCheck) return { type: 'check' };
          if (toCall > 0 && toCall < bb) return { type: 'call' };
          if (toCall === 0 && canCheck) return { type: 'check' };
          return { type: 'fold' };
        } else if (preflopStr >= 0.5) {
          if (isButton && minRaiseTo !== null && Math.random() < 0.5) {
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + bb * 2.5));
            if (target < maxRaiseTo && target >= minRaiseTo) return { type: 'raise', amount: Math.floor(target) };
          }
          if (canCheck) return { type: 'check' };
          if (toCall === 0) return { type: 'check' };
          if (toCall > 0 && toCall < bb * 0.7) return { type: 'call' };
          return { type: 'fold' };
        } else if (preflopStr >= 0.44) {
          if (isButton && minRaiseTo !== null && Math.random() < 0.35) {
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + bb * 2.25));
            if (target < maxRaiseTo && target >= minRaiseTo) return { type: 'raise', amount: Math.floor(target) };
          }
          if (activeSeats.length === 2 && minRaiseTo !== null && preflopStr >= 0.46 && Math.random() < 0.4) {
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + bb * 2.5));
            if (target < maxRaiseTo) return { type: 'raise', amount: Math.floor(target) };
          }
          if (canCheck) return { type: 'check' };
          if (toCall === 0) return { type: 'check' };
          if (toCall > 0 && toCall <= bb * 0.4) return { type: 'call' };
          return { type: 'fold' };
        } else {
          if ((isButton || activeSeats.length === 2) && canCheck && Math.random() < 0.25) {
            return { type: 'check' };
          }
          if (activeSeats.length === 2 && minRaiseTo !== null && preflopStr >= 0.4 && Math.random() < 0.3) {
            const target = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + bb * 2));
            if (target < maxRaiseTo) return { type: 'raise', amount: Math.floor(target) };
          }
          if (canCheck) return { type: 'check' };
          if (toCall > 0 && toCall <= bb * 0.3) return { type: 'call' };
          return { type: 'fold' };
        }
      }
      
      // Postflop
      const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
      
      // Very strong made hands
      if (madeStrength >= 0.625) { // Full house or better
        if (!canCheck && minRaiseTo !== null) {
          if (toCall >= you.stack) return { type: 'allin' };
          const raiseAmount = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + toCall + Math.max(bb, pot * 0.8)));
          if (raiseAmount >= maxRaiseTo * 0.9 || opponentsInHand >= 2 || you.stack <= toCall + bb * 3) return { type: 'allin' };
          if (raiseAmount >= minRaiseTo) return { type: 'raise', amount: Math.floor(raiseAmount) };
        }
        if (canCheck && minRaiseTo !== null && opponentsInHand > 0) {
          const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb * 2, pot * 0.7)));
          if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
          else if (state.canAllIn) return { type: 'allin' };
        }
        if (canCheck) return { type: 'check' };
        if (toCall >= you.stack) return { type: 'allin' };
        return { type: 'call' };
      } else if (madeStrength >= 0.5) { // Flush
        if (canCheck && minRaiseTo !== null && opponentsInHand > 0) {
          const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb * 1.8, pot * 0.65)));
          if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
          else if (state.canAllIn) return { type: 'allin' };
          return { type: 'check' };
        }
        if (canCheck) return { type: 'check' };
        if (toCall >= you.stack) return { type: 'allin' };
        if (minRaiseTo !== null && equity > 0.75 && opponentsInHand === 1 && toCall < pot * 0.5) {
          const raiseAmount = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + toCall + pot * 0.65));
          if (raiseAmount < maxRaiseTo && raiseAmount >= minRaiseTo) return { type: 'raise', amount: Math.floor(raiseAmount) };
        }
        if (equity >= potOdds - 0.02) return { type: 'call' };
        return { type: 'call' };
      } else if (madeStrength >= 0.375) { // Straight
        if (canCheck && minRaiseTo !== null && opponentsInHand > 0 && equity > 0.55) {
          const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb * 1.3, pot * 0.5)));
          if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
        }
        if (canCheck) return { type: 'check' };
        if (toCall >= you.stack) return equity > 0.45 ? { type: 'allin' } : { type: 'fold' };
        if (equity > potOdds + 0.12) return { type: 'call' };
        if (equity > potOdds + 0.03) return { type: 'call' };
        if (potOdds < 0.22 && equity > 0.32) return { type: 'call' };
        return { type: 'fold' };
      } else if (madeStrength >= 0.25) { // Trips
        if (canCheck && minRaiseTo !== null && opponentsInHand > 0 && equity > 0.5) {
          const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb * 1.1, pot * 0.4)));
          if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
        }
        if (canCheck) return { type: 'check' };
        if (toCall >= you.stack) return equity > 0.4 ? { type: 'allin' } : { type: 'fold' };
        if (equity > potOdds + 0.08) return { type: 'call' };
        if (potOdds < 0.18 && equity > 0.28) return { type: 'call' };
        return { type: 'fold' };
      } else if (madeStrength >= 0.125) { // One pair
        if (canCheck && minRaiseTo !== null && opponentsInHand === 1 && equity > 0.65) {
          const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb, pot * 0.55)));
          if (betSize < maxRaiseTo && betSize >= minRaiseTo && Math.random() < 0.5) return { type: 'raise', amount: Math.floor(betSize) };
        } else if (canCheck && minRaiseTo !== null && opponentsInHand > 1 && equity > 0.6 && Math.random() < 0.25) {
          const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb, pot * 0.4)));
          if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
        }
        if (canCheck) return { type: 'check' };
        if (toCall >= you.stack) return equity > 0.42 ? { type: 'allin' } : { type: 'fold' };
        if (equity > potOdds + 0.1) return { type: 'call' };
        if (potOdds < 0.14 && equity > 0.28) return { type: 'call' };
        if (opponentsInHand === 1 && inPosition && potOdds < 0.32 && equity > 0.38) return { type: 'call' };
        return { type: 'fold' };
      } else {
        // High card / draws
        if (canCheck && minRaiseTo !== null && opponentsInHand === 1 && street === 'river') {
          if (Math.random() < 0.12) { // bluff
            const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb, pot * 0.65)));
            if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
          }
        } else if (canCheck && minRaiseTo !== null && opponentsInHand === 1 && street !== 'river') {
          if (equity > 0.42 && Math.random() < 0.18) { // semi-bluff
            const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb, pot * 0.45)));
            if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
          }
        } else if (canCheck && minRaiseTo !== null && opponentsInHand > 1) {
          if (equity > 0.55 && Math.random() < 0.12) {
            const betSize = Math.min(maxRaiseTo, Math.max(minRaiseTo, you.bet + Math.max(bb, pot * 0.38)));
            if (betSize < maxRaiseTo && betSize >= minRaiseTo) return { type: 'raise', amount: Math.floor(betSize) };
          }
        }
        if (canCheck) return { type: 'check' };
        if (toCall >= you.stack) {
          return equity > 0.5 ? { type: 'allin' } : { type: 'fold' };
        }
        if (equity > potOdds + 0.1) return { type: 'call' };
        if (potOdds < 0.08 && equity > 0.16) return { type: 'call' };
        if (opponentsInHand === 1 && inPosition && street !== 'river' && equity > 0.4 && potOdds < 0.37) return { type: 'call' };
        return { type: 'fold' };
      }
      
      // Fallback
      if (canCheck) return { type: 'check' };
      if (toCall > 0 && toCall < bb * 2 && Math.random() < 0.3) return { type: 'call' };
      return { type: 'fold' };
    } catch (e) {
      if (state && state.canCheck) return { type: 'check' };
      return { type: 'fold' };
    }
  }
};
