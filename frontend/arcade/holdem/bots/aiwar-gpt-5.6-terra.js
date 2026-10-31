'use strict';
module.exports = {
  name: 'Aizanoi Terra',
  act(state) {
    try {
      var R = '23456789TJQKA';
      function rv(c) { return R.indexOf(c[0]) + 2; }
      function clampRaise(s, target) {
        if (s.minRaiseTo === null || s.minRaiseTo === undefined) return null;
        var t = Math.floor(target);
        if (t < s.minRaiseTo) t = s.minRaiseTo;
        if (t > s.maxRaiseTo) t = s.maxRaiseTo;
        if (t <= s.currentBet) return null;
        return t;
      }
      function doRaise(s, target) {
        if (s.minRaiseTo === null || s.minRaiseTo === undefined) {
          if (s.canAllIn) return { type: 'allin' };
          if (s.canCheck) return { type: 'check' };
          return { type: 'call' };
        }
        var u = clampRaise(s, target);
        if (u === null) {
          if (s.canCheck) return { type: 'check' };
          return { type: 'call' };
        }
        if (u >= s.maxRaiseTo) {
          if (s.canAllIn) return { type: 'allin' };
          if (s.canCheck) return { type: 'check' };
          return { type: 'call' };
        }
        return { type: 'raise', amount: u };
      }
      function safeAllin(s) {
        if (s.canAllIn) return { type: 'allin' };
        if (s.canCheck) return { type: 'check' };
        return { type: 'call' };
      }
      function potOf(s) {
        var p = 0, i;
        for (i = 0; i < s.pots.length; i++) p += s.pots[i].amount;
        return p;
      }
      var you = state.you, board = state.board || [], street = state.street;
      var hole = you.cards;
      var r1 = rv(hole[0]), r2 = rv(hole[1]);
      var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
      var suited = hole[0][1] === hole[1][1];
      var pair = r1 === r2;
      var gap = pair ? 0 : hi - lo - 1;
      var pot = potOf(state);
      var bb = state.blinds[1] || 100;
      var toCall = state.toCall || 0;
      var stack = you.stack;
      var live = state.seats.filter(function (x) { return !x.out && !x.folded && x.id !== you.id; });
      var nOpp = live.length;
      if (nOpp < 1) nOpp = 1;
      var effStack = stack;
      var i, s2;
      for (i = 0; i < live.length; i++) { s2 = live[i].stack + live[i].bet; if (s2 < effStack) effStack = s2; }
      var bbDepth = effStack / Math.max(1, bb);
      var potOdds = toCall <= 0 ? 0 : toCall / Math.max(1, pot + toCall);
      // position: distance left of button
      var N = state.seats.length;
      var distB = (you.seat - state.buttonSeat + N) % N;
      var activeCount = state.seats.filter(function (x) { return !x.out; }).length;
      var late = (distB >= activeCount - 2) || you.seat === state.buttonSeat;
      var early = !late && distB <= 2;
      var headsUp = activeCount === 2 || nOpp === 1;
      var actions = state.actions || [];
      var raisedBefore = false, nRaises = 0, limpCount = 0, lastAggr = 0;
      for (i = 0; i < actions.length; i++) {
        var a = actions[i];
        if (a.street !== 'preflop' && street === 'preflop') continue;
        if (street === 'preflop' && a.street !== 'preflop') continue;
        if (a.street !== street) continue;
        if (a.type === 'raise' || a.type === 'allin') { nRaises++; lastAggr = a.amount || 0; if (a.street === 'preflop' || street === 'preflop') raisedBefore = true; }
        if (a.street === 'preflop' && a.type === 'call') limpCount++;
      }
      // ---- PREFLOP ----
      if (street === 'preflop') {
        // Chen score
        var chen = 0;
        var high = hi;
        if (high === 14) chen = 10;
        else if (high === 13) chen = 8;
        else if (high === 12) chen = 7;
        else if (high === 11) chen = 6;
        else chen = (high / 2);
        if (pair) { chen = Math.max(5, chen * 2); }
        else {
          if (suited) chen += 2;
          if (gap === 0) chen += (lo < 12 ? 1 : 2);
          else if (gap === 1) chen -= 1;
          else if (gap === 2) chen -= 2;
          else if (gap === 3) chen -= 4;
          else chen -= 5;
          if (gap <= 1 && hi < 12 && lo < 12) chen += 1;
        }
        chen = Math.max(0, chen);
        // short stack push/fold
        var mStack = stack / Math.max(1, bb);
        if (mStack <= 12 && toCall > 0) {
          var need = chen;
          var thresh = mStack <= 5 ? (headsUp ? 4.5 : 6) : mStack <= 8 ? (headsUp ? 6 : 7.5) : 8.5;
          if (late || headsUp) thresh -= 1.2;
          if (nRaises >= 2) thresh += 2;
          var commitFrac = toCall / Math.max(1, stack + you.bet + you.total);
          if ((pair && hi >= 6) || chen >= thresh || (suited && hi === 14 && chen >= 6)) {
            // shove if strong or call is big chunk
            if (chen >= thresh + 2 || toCall >= stack * 0.3 || (pair && hi >= 9)) return safeAllin(state);
            if (chen >= thresh) {
              if (state.canCheck) return { type: 'check' };
              return { type: 'call' };
            }
          }
          if (state.canCheck) return { type: 'check' };
          // cheap complete?
          if (potOdds < 0.18 && chen >= 5) return { type: 'call' };
          return { type: 'fold' };
        }
        if (mStack <= 10 && !raisedBefore && state.minRaiseTo !== null) {
          var openPush = (pair && hi >= 8) || chen >= 10 || (headsUp && chen >= 8);
          if (openPush && mStack <= 7) return safeAllin(state);
        }
        if (!raisedBefore) {
          // open / limp-check
          var openNeed = headsUp ? 4.5 : (late ? 6.5 : early ? 9 : 7.5);
          if (activeCount >= 6 && early) openNeed = 9.5;
          var openScore = chen + (pair && hi <= 6 && late ? 1 : 0);
          if (state.canCheck) {
            // BB option or limped to us: raise premiums + good broadways, else check
            if ((openScore >= 10 || (pair && hi >= 9)) && state.minRaiseTo !== null) {
              var t0 = you.bet + Math.max(state.minRaiseTo - you.bet, bb * 3 + limpCount * bb);
              return doRaise(state, Math.max(state.minRaiseTo, t0));
            }
            return { type: 'check' };
          }
          if (openScore >= openNeed) {
            if (state.minRaiseTo === null) return { type: 'call' };
            var base = bb * (headsUp ? 2.5 : late ? 2.3 : 2.8);
            if (openScore >= 12 || (pair && hi >= 11)) base = bb * 3;
            var target = you.bet + toCall + base + limpCount * bb;
            // keep open small vs deep, bigger vs short
            if (target < state.minRaiseTo) target = state.minRaiseTo;
            if (target >= stack + you.bet - 1) return safeAllin(state);
            return doRaise(state, target);
          }
          // cheap limp behind late with speculative
          if (late && toCall <= bb && (suited || gap <= 1 || pair || hi === 14) && toCall < stack * 0.06) return { type: 'call' };
          if (toCall <= 0) return { type: 'check' };
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        }
        // facing raise
        var faceBig = toCall / Math.max(1, bb);
        var threeBet = (pair && hi >= 11) || chen >= 12 || (pair && hi === 10 && late) || (chen >= 10.5 && (late || headsUp));
        if (threeBet && state.minRaiseTo !== null) {
          var monsters = pair && hi >= 12;
          var t3 = you.bet + toCall + Math.max(bb * 3, Math.floor((pot + toCall) * 0.75)) + bb;
          if (nOpp === 1 && (monsters || chen >= 13) && bbDepth < 25) return safeAllin(state);
          if (state.canCheck) return { type: 'check' };
          // avoid 3bet-fold stacks: shove if 3bet > 35% stack
          if (t3 >= you.bet + stack * 0.45 && chen >= 11) return safeAllin(state);
          return doRaise(state, t3);
        }
        if (state.canCheck) return { type: 'check' };
        // calls: pairs want set mine if deep; broadways; Ax suited
        var stackFrac = toCall / Math.max(1, stack + toCall);
        var implied = effStack / Math.max(1, toCall);
        var callOk = false;
        if (pair) callOk = (hi >= 8) || (implied >= 12 && stackFrac <= 0.12) || (toCall <= bb * 3) || potOdds < 0.25;
        else if (suited && hi === 14) callOk = stackFrac <= 0.12 || toCall <= bb * 4;
        else if (chen >= 9) callOk = stackFrac <= 0.14;
        else if (chen >= 7.5 && (late || headsUp)) callOk = stackFrac <= 0.08 && toCall <= bb * 5;
        else if (headsUp && chen >= 6) callOk = toCall <= bb * 3;
        // blind defense: getting odds
        if (!callOk && you.seat === state.bigBlindSeat && potOdds < 0.3 && (chen >= 5 || suited || gap <= 2)) callOk = stackFrac <= 0.15;
        if (callOk) {
          if (toCall >= stack) return safeAllin(state);
          return { type: 'call' };
        }
        return { type: 'fold' };
      }
      // ---- POSTFLOP ----
      var b = board;
      var nb = b.length;
      function rankOf(c) { return R.indexOf(c[0]) + 2; }
      var hr1 = r1, hr2 = r2;
      var branks = b.map(rankOf);
      var topB = 0;
      for (i = 0; i < branks.length; i++) if (branks[i] > topB) topB = branks[i];
      var boardPair = false, boardTrips = false;
      var seen = {};
      for (i = 0; i < branks.length; i++) { seen[branks[i]] = (seen[branks[i]] || 0) + 1; }
      for (var k in seen) { if (seen[k] >= 3) boardTrips = true; if (seen[k] >= 2) boardPair = true; }
      var pocket = pair;
      var isSet = pocket && seen[hr1] >= 1; // board has our rank at least once -> trips+ (board must contain one)
      // pair analysis
      var hitTop = (hr1 === topB || hr2 === topB);
      var overpair = pocket && hi > topB && nb >= 3;
      var topPair = false, midPair = false, weakPair = false, underPair = false;
      if (!pocket) {
        // find board ranks sorted
        var bs = branks.slice().sort(function (x, y) { return y - x; });
        var matched = -1;
        if (hr1 === hr2) matched = hr1;
        else {
          if (seen[hr1]) matched = hr1;
          if (seen[hr2] && hr2 > matched) matched = hr2;
        }
        if (matched > 0) {
          if (matched === topB) topPair = true;
          else if (nb >= 4 && matched === bs[1]) midPair = true;
          else if (matched >= 10) midPair = true;
          else weakPair = true;
        } else if (pocket && hi < topB) underPair = true;
        if (pocket && hi < topB) underPair = true;
      }
      var kicker = pocket ? 0 : (hitTop ? (hr1 === topB ? hr2 : hr1) : 0);
      // two pair / trips using hole
      var twoPair = false, trips = false, boatPlus = false;
      if (pocket && seen[hr1] >= 1) { trips = true; }
      if (!pocket && seen[hr1] && seen[hr2]) twoPair = true;
      if (!pocket && (seen[hr1] >= 2 || seen[hr2] >= 2)) { trips = true; }
      if (!pocket && seen[hr1] && hr1 !== topB && boardPair) twoPair = true; // one hole matches + board pair (counterfeit-aware approx)
      // flush / straight via evaluate
      var ev = null, evRank = -1;
      try { ev = PokerEngine.evaluate(hole.concat(b)); evRank = ev.rank; } catch (e) { ev = null; }
      if (evRank >= 6) boatPlus = true;
      var madeFlush = evRank === 5 || evRank === 8;
      var madeStraight = evRank === 4 || evRank === 8;
      // flush draw: count suits
      var suitCount = { c: 0, d: 0, h: 0, s: 0 };
      hole.concat(b).forEach(function (c) { suitCount[c[1]]++; });
      var maxSuit = Math.max(suitCount.c, suitCount.d, suitCount.h, suitCount.s);
      var flushDraw = !madeFlush && maxSuit === 4;
      // straight draws
      var allr = {};
      hole.concat(b).forEach(function (c) { allr[rankOf(c)] = 1; });
      if (allr[14]) allr[1] = 1;
      var oesd = false, gut = false;
      if (!madeStraight && !boatPlus) {
        for (var s0 = 1; s0 <= 10; s0++) {
          var win = [s0, s0 + 1, s0 + 2, s0 + 3, s0 + 4].filter(function (x) { return allr[x] || allr[x === 1 ? 14 : x]; });
          // simpler: count present in window
          var cnt = 0;
          for (var q = 0; q < 5; q++) { var rr = s0 + q; if (rr === 1) { if (allr[14] || allr[1]) cnt++; } else if (allr[rr]) cnt++; }
          if (cnt === 5) { /* made, already handled */ }
          else if (cnt === 4) {
            var missLow = !(allr[s0 === 1 ? 14 : s0] || (s0 === 1 && allr[1]));
            var missHigh = !allr[s0 + 4];
            var open = (!missLow && !missHigh) ? false : (missLow !== missHigh);
            if (open) oesd = true; else gut = true;
          }
        }
      }
      var overcards = 0;
      if (!hitTop && !pocket) {
        if (hr1 > topB) overcards++;
        if (hr2 > topB && hr2 !== hr1) overcards++;
      }
      // board texture danger
      var bSuit = { c: 0, d: 0, h: 0, s: 0 };
      b.forEach(function (c) { bSuit[c[1]]++; });
      var bFlush = Math.max(bSuit.c, bSuit.d, bSuit.h, bSuit.s);
      var boardScary = (bFlush >= 3 && !madeFlush && !flushDraw) || boardPair || boardTrips;
      // equity estimate
      var eq = 0.12;
      if (boatPlus) eq = 0.93;
      else if (madeFlush) eq = boardPair ? 0.68 : 0.82;
      else if (madeStraight) eq = boardPair ? 0.62 : (bFlush >= 3 ? 0.62 : 0.76);
      else if (trips) eq = 0.74;
      else if (overpair) eq = kicker >= 0 ? 0.68 : 0.68;
      else if (isSet) eq = 0.74;
      else if (twoPair) eq = boardScary ? 0.55 : 0.68;
      else if (topPair) eq = kicker >= 12 ? 0.64 : kicker >= 10 ? 0.58 : 0.52;
      else if (midPair) eq = 0.44;
      else if (weakPair) eq = 0.36;
      else if (underPair) eq = 0.34;
      else eq = 0.14 + overcards * 0.05 + (hi === 14 ? 0.03 : 0);
      // draws add
      var streetMul = street === 'flop' ? 1 : street === 'turn' ? 0.55 : 0;
      if (street !== 'river') {
        if (flushDraw) eq += street === 'flop' ? 0.16 : 0.09;
        if (oesd) eq += street === 'flop' ? 0.15 : 0.08;
        else if (gut) eq += street === 'flop' ? 0.07 : 0.04;
        if (overcards && eq < 0.5) eq += overcards * 0.02;
      }
      if (boardScary && eq < 0.9 && !boatPlus) eq -= 0.06;
      // multiway discount
      if (nOpp > 1 && eq < 0.9) eq = eq / (1 + 0.28 * (nOpp - 1) * (eq < 0.5 ? 1 : 0.5));
      if (eq > 0.97) eq = 0.97;
      if (eq < 0.02) eq = 0.02;
      // SPR / commitment
      var spr = stack / Math.max(1, pot + toCall);
      // thresholds
      var valNeed = headsUp ? 0.58 : nOpp === 2 ? 0.62 : 0.68;
      if (street === 'river') valNeed += 0.02;
      var margin = street === 'river' ? 0.06 : street === 'turn' ? 0.05 : 0.03;
      if (!headsUp && nOpp >= 3) margin += 0.03;
      if (late) margin -= 0.015;
      // committed: never fold getting great price with any equity
      if (toCall > 0 && toCall / Math.max(1, stack) > 0.35 && eq > 0.3) {
        if (state.canCheck) return { type: 'check' };
        if (eq > 0.45 || potOdds < 0.45) return { type: 'call' };
      }
      // all-in/shove spots: strong + low SPR
      if (eq >= 0.8 && spr < 2.5 && (state.minRaiseTo !== null || state.canAllIn)) return safeAllin(state);
      if (eq >= 0.72 && spr < 1.2) return safeAllin(state);
      // short stack shove with decent equity
      if (bbDepth < 8 && eq > 0.55 && toCall < stack * 0.4) {
        if (state.canCheck && eq > 0.62 && (state.minRaiseTo !== null || state.canAllIn)) {
          return safeAllin(state);
        }
        if (!state.canCheck && eq > 0.5 && toCall <= stack * 0.35) {
          if (eq > 0.66) return safeAllin(state);
        }
      }
      // aggression: value bet
      var checkedTo = true;
      for (i = 0; i < actions.length; i++) if (actions[i].street === street && (actions[i].type === 'raise' || actions[i].type === 'allin')) checkedTo = false;
      if (state.canCheck) {
        if (eq >= valNeed && (state.minRaiseTo !== null || state.canAllIn)) {
          var frac = eq >= 0.8 ? 0.7 : eq >= 0.68 ? 0.6 : 0.45;
          if (nOpp >= 3) frac = Math.min(0.7, frac + 0.1);
          // polarize river thin: smaller
          if (street === 'river' && eq < 0.66) frac = 0.4;
          var open = you.bet + Math.max(bb, Math.floor((pot) * frac));
          // protect vs draws on wet boards
          if (bFlush >= 3 || oesd) open = you.bet + Math.max(bb, Math.floor(pot * 0.65));
          return doRaise(state, open);
        }
        // semi-bluff / steal: heads-up late, checked to us never here (canCheck means no bet yet) -> Donk rare
        if (street !== 'river' && (flushDraw || oesd) && eq >= 0.42 && (headsUp || late) && pot > bb * 2) {
          if (state.minRaiseTo !== null && Math.random() < (headsUp ? 0.5 : 0.25)) {
            return doRaise(state, you.bet + Math.max(bb, Math.floor(pot * 0.5)));
          }
        }
        // occasional river bluff heads-up
        if (street === 'river' && headsUp && eq < 0.4 && pot > bb * 3 && Math.random() < 0.08 && state.minRaiseTo !== null) {
          return doRaise(state, you.bet + Math.floor(pot * 0.5));
        }
        return { type: 'check' };
      }
      // facing bet
      if (eq >= Math.max(valNeed, 0.6) && state.minRaiseTo !== null) {
        // raise value; more likely with very strong or vs small bets
        var betSize = state.currentBet - you.bet + 0; // toCall already
        var smallBet = toCall <= pot * 0.4;
        var monster = eq >= 0.75 || boatPlus || madeFlush || madeStraight || trips;
        if (monster || (eq >= valNeed + 0.08 && (smallBet || Math.random() < 0.4))) {
          var rt = you.bet + toCall + Math.max(bb * 2, Math.floor((pot + toCall) * (monster ? 0.75 : 0.6)));
          if (rt >= you.bet + stack) return safeAllin(state);
          return doRaise(state, rt);
        }
      }
      // semi-bluff shove/raise with strong draws getting good fold equity vs small field
      if (street !== 'river' && (flushDraw || oesd) && nOpp <= 2 && toCall <= pot * 0.6 && eq >= 0.42 && state.minRaiseTo !== null && Math.random() < 0.25) {
        var rt2 = you.bet + toCall + Math.floor((pot + toCall) * 0.7);
        return doRaise(state, rt2);
      }
      var need = potOdds + margin;
      // SPR discount: good implied with draws/paints
      if (street !== 'river' && (flushDraw || oesd || (pocket && hi <= 8)) && spr > 6) need -= 0.04;
      if (eq >= need) return { type: 'call' };
      // river bluff-catch discount for strong-ish top pair getting good price
      if (street === 'river' && topPair && potOdds < 0.25 && eq > 0.45) return { type: 'call' };
      return { type: 'fold' };
    } catch (e) {
      try {
        if (state && state.canCheck) return { type: 'check' };
        if (state && !state.canCheck && state.toCall === 0) return { type: 'check' };
      } catch (e2) {}
      return { type: 'fold' };
    }
  }
};
