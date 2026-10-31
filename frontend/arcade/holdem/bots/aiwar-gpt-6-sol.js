'use strict';
// IceMan: tight-aggressive, equity-driven tournament NLHE.
// Preflop: Chen + position + stack-aware open/3bet/push-fold.
// Postflop: Monte Carlo equity vs active opps + made-hand/draw eval,
// pot-odds calls, value-heavy sizing, selective semi-bluffs, deterministic mixing.
module.exports = {
  name: 'IceMan',
  act(state) {
    try {
      var you = state.you, board = state.board || [], street = state.street;
      var hole = you.cards;
      var R = '23456789TJQKA';
      function rv(c) { return R.indexOf(c[0]) + 2; }
      var h0 = rv(hole[0]), h1 = rv(hole[1]);
      var hi = Math.max(h0, h1), lo = Math.min(h0, h1);
      var pair = h0 === h1, suited = hole[0][1] === hole[1][1];
      var gap = hi - lo;
      var pot = 0, i;
      for (i = 0; i < state.pots.length; i++) pot += state.pots[i].amount;
      var toCall = state.toCall || 0;
      var bb = state.blinds[1] || 100;
      var sb = state.blinds[0] || 50;
      var myStack = you.stack, myBet = you.bet;
      var maxTo = state.maxRaiseTo, minTo = state.minRaiseTo;
      var curBet = state.currentBet || 0;
      // active opponents still contesting (not folded/out); those who can still bet
      var opps = [], canAct = 0;
      for (i = 0; i < state.seats.length; i++) {
        var s = state.seats[i];
        if (s.id === you.id || s.out || s.folded) continue;
        opps.push(s);
        if (!s.allIn) canAct++;
      }
      var nOpp = opps.length;
      if (nOpp === 0) return state.canCheck ? { type: 'check' } : { type: 'call' };
      // effective stack vs remaining (shortest live opp who can act, else shortest opp)
      var eff = myStack;
      for (i = 0; i < opps.length; i++) if (opps[i].stack < eff) eff = opps[i].stack;
      var M = myStack / Math.max(1, sb + bb);
      var bbs = myStack / Math.max(1, bb);
      // position: distance left of button (0 = button). preflop order approx via seats.
      var N = state.seats.length;
      function dist(a, b) { return (a - b + N) % N; }
      var myDist = dist(you.seat, state.buttonSeat);
      // count live seats to gauge early/late
      var liveCount = 0;
      for (i = 0; i < state.seats.length; i++) if (!state.seats[i].out) liveCount++;
      var isHU = liveCount === 2;
      var latePos = isHU ? (you.seat === state.buttonSeat) : (myDist <= Math.max(1, Math.floor(liveCount / 3)));
      var earlyPos = !isHU && myDist >= liveCount - Math.max(2, Math.floor(liveCount / 3)) && liveCount > 4;
      // current-hand action read
      var acts = state.actions || [];
      var raisesBefore = 0, limpers = 0, aggroVol = 0, lastRaiseTo = 0;
      var streetActs = [];
      for (i = 0; i < acts.length; i++) {
        if (acts[i].street !== street) continue;
        streetActs.push(acts[i]);
        if (acts[i].type === 'raise' || acts[i].type === 'allin') { raisesBefore++; aggroVol += acts[i].amount || 0; }
        if (acts[i].street === 'preflop' && acts[i].type === 'call') limpers++;
      }
      var firstIn = streetActs.length === 0 && (street !== 'preflop' || toCall <= (you.seat === state.bigBlindSeat ? 0 : 0) || (state.canCheck || toCall === 0));
      // actually first-in preflop: no voluntary actions yet (blinds excluded from actions)
      if (street === 'preflop') firstIn = acts.length === 0;
      else firstIn = state.canCheck;
      // deterministic mixer 0..1 from cards+hand+street (stable, no clock/random dependence)
      var hk = hole[0] + hole[1] + '|' + board.join('') + '|' + state.handNumber + street;
      var hh = 2166136261;
      for (i = 0; i < hk.length; i++) { hh ^= hk.charCodeAt(i); hh = Math.imul(hh, 16777619) >>> 0; }
      hh ^= (pot * 31 + toCall * 17 + myDist * 7) >>> 0;
      var mix = ((hh >>> 0) % 1000) / 1000;
      // ---- equity ----
      var iters = nOpp >= 5 ? 80 : nOpp >= 3 ? 120 : nOpp === 2 ? 160 : 200;
      var eq = 0;
      try {
        eq = PokerEngine.equity(hole, board, Math.min(8, nOpp), iters, Math.random);
      } catch (e) { eq = 0; }
      if (!(eq > 0)) {
        // heuristic fallback: Chen-like
        var ch = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
        if (pair) ch = Math.max(5, ch * 2);
        if (suited) ch += 2;
        if (!pair && gap <= 1) ch += gap === 0 ? 0 : 3; else if (gap === 2) ch += 1;
        if (!pair && gap >= 4) ch -= gap >= 5 ? 5 : 2;
        eq = Math.max(0.25, Math.min(0.85, 0.28 + ch * 0.028 - (nOpp - 1) * 0.045));
        if (street !== 'preflop') {
          try {
            var ev0 = PokerEngine.evaluate(hole.concat(board));
            eq = Math.min(0.95, 0.3 + ev0.rank * 0.09);
          } catch (e2) {}
        }
      }
      // ---- postflop hand structure ----
      var madeRank = -1, topPair = false, overpair = false, twoPairPlus = false, tripsPlus = false;
      var flushDraw = false, straightDraw = false, gutshot = false, overcards = 0, nutish = false;
      var boardHigh = 0, boardPair = false;
      if (street !== 'preflop') {
        try {
          var full = PokerEngine.evaluate(hole.concat(board));
          madeRank = full.rank;
          tripsPlus = madeRank >= 3;
          twoPairPlus = madeRank >= 2;
          var br = {}, bs = {};
          for (i = 0; i < board.length; i++) { br[rv(board[i])] = (br[rv(board[i])] || 0) + 1; bs[board[i][1]] = (bs[board[i][1]] || 0) + 1; }
          for (var k in br) { if (br[k] >= 2) boardPair = true; if (+k > boardHigh) boardHigh = +k; }
          // pair classification
          if (madeRank === 1) {
            // which rank paired?
            if (pair && hi > boardHigh) overpair = true;
            else if (hi === boardHigh || h1 === boardHigh || h0 === boardHigh) topPair = true;
          }
          if (madeRank >= 2 && !boardPair) nutish = true;
          if (madeRank >= 3 && mix > 0.2) nutish = true;
          // flush draw: 4 of suit among hole+board
          var cs = {};
          for (i = 0; i < hole.concat(board).length; i++) { var su = hole.concat(board)[i][1]; cs[su] = (cs[su] || 0) + 1; }
          for (var sk in cs) if (cs[sk] === 4) flushDraw = true;
          // straight draws: any 4-in-5 window with 4 present (open) or 3 inner (gutshot)
          var pr = {};
          var all = hole.concat(board);
          for (i = 0; i < all.length; i++) { pr[rv(all[i])] = 1; if (rv(all[i]) === 14) pr[1] = 1; }
          var best = 0;
          for (var h = 14; h >= 5; h--) {
            var c = 0;
            for (var o = 0; o < 5; o++) if (pr[h - o]) c++;
            if (c > best) best = c;
          }
          if (best === 4) {
            // open vs gutshot: check missing card is at an end
            straightDraw = true;
          } else if (best === 3 && board.length <= 4) gutshot = true;
          if (hi > boardHigh) overcards++;
          if (lo > boardHigh) overcards++;
          // combo draw boost handled via eq already; small bump for direct computation noise
          if (flushDraw || straightDraw) eq = Math.min(0.92, eq + 0.015);
        } catch (e) {}
      }
      function legalRaise(target) {
        if (minTo === null || minTo === undefined) return null;
        var t = Math.floor(target);
        if (!(t > curBet)) t = minTo;
        if (t < minTo) t = minTo;
        if (t > maxTo) t = maxTo;
        if (!(t > curBet)) return null;
        if (t < minTo && t !== maxTo) return null;
        if (t >= maxTo) return { type: 'allin' };
        return { type: 'raise', amount: t };
      }
      function potOdds() { return toCall / Math.max(1, pot + toCall); }
      // tournament pressure: short stack => push/fold; tiny stack => gamble wider
      var desperate = bbs <= 7;
      var shortish = bbs <= 12;
      // ================= PREFLOP =================
      if (street === 'preflop') {
        // Chen score for ranges
        var chen = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
        if (pair) chen = Math.max(5, chen * 2);
        if (suited) chen += 2;
        if (!pair) {
          if (gap === 0) chen += 0; else if (gap === 1) chen -= 1;
          else if (gap === 2) chen -= 2; else if (gap === 3) chen -= 4; else chen -= 5;
          if (gap <= 1 && hi < 12) chen += 1;
        }
        var huBoost = isHU ? 3 : 0;
        var posAdj = latePos ? 1 : earlyPos ? -1.5 : 0;
        var adj = chen + posAdj + huBoost;
        // facing all-in / big call: commitment decision
        var callFrac = toCall / Math.max(1, myStack + myBet + toCall);
        var odds = potOdds();
        // shove-or-fold mode
        if (desperate) {
          var jam = adj >= (nOpp >= 3 ? 8 : 7) || (pair) || (hi === 14 && lo >= 8) || (isHU && (hi >= 11 || adj >= 6.5));
          if (firstIn) {
            if (jam || mix < 0.35) {
              if (state.canCheck) {
                var r0 = legalRaise(myBet + Math.max(bb * 2, pot));
                if (jam && r0) return r0;
                return { type: 'check' };
              }
              if (jam && state.canAllIn) return { type: 'allin' };
              if (jam && minTo !== null) { var rr = legalRaise(maxTo); if (rr) return rr; }
            }
            return state.canCheck ? { type: 'check' } : (odds < 0.25 && adj >= 5 ? { type: 'call' } : { type: 'fold' });
          }
          // facing bet short: call/jam with odds+strength
          if (eq >= odds + 0.02 || adj >= 8.5 || (pair && hi >= 7)) {
            if (callFrac > 0.35) { if (state.canAllIn) return { type: 'allin' }; return { type: 'call' }; }
            return { type: 'call' };
          }
          return state.canCheck ? { type: 'check' } : { type: 'fold' };
        }
        if (firstIn) {
          var openBar = isHU ? 6.5 : latePos ? 7 : earlyPos ? 8.5 : 7.5;
          if (shortish) openBar -= 0.7;
          if (adj >= openBar) {
            var sz = Math.max(bb * 2, Math.floor(bb * 2.5) + limpers * bb);
            var tgt = myBet + toCall + sz;
            // big pairs / AK: bigger
            if (pair && hi >= 11 || (hi === 14 && lo === 14 - 0 && false)) tgt += bb;
            if (pair && hi >= 12 || (h0 === 14 && h1 === 14) || (hi === 14 && lo === 13)) tgt = myBet + toCall + Math.max(bb * 3, Math.floor(pot * 0.9) + bb * 2);
            var r = legalRaise(Math.max(minTo === null ? 0 : minTo, tgt));
            if (r) return r;
            if (state.canAllIn && adj >= 11) return { type: 'allin' };
          }
          return state.canCheck ? { type: 'check' } : { type: 'fold' };
        }
        // facing raise(s)
        var raiseSize = curBet; // total faced
        var raiseMult = raiseSize / Math.max(1, bb);
        var threeBet = adj >= (isHU ? 9.5 : 10.5) || (pair && hi >= 12) || (hi === 14 && lo === 13 && suited) || (h0 === 14 && h1 === 14) || (pair && hi === 14);
        // premium 3-bet, plus rare light 3-bet late with blockers
        var light3 = latePos && nOpp <= 2 && raiseMult <= 4 && ((hi === 14 && lo <= 6 && suited) || (pair && hi >= 6)) && mix > 0.82;
        if ((threeBet || light3) && minTo !== null) {
          var t3 = curBet * 3 + Math.max(0, limpers * bb);
          if (raisesBefore >= 2) t3 = Math.max(t3, curBet * 2 + pot * 0.5);
          t3 = Math.min(maxTo, Math.max(minTo, Math.floor(t3)));
          // QQ+/AK: 4-bet / jam over 3-bets
          if (raisesBefore >= 2 && adj >= 11) { if (state.canAllIn && (myStack < pot * 3 || mix > 0.3)) return { type: 'allin' }; }
          var r3 = legalRaise(t3);
          if (r3) return r3;
        }
        // flat call: pairs, suited broadways/aces, connectors w/ odds + position
        // NOTE: raw equity is vs random hands; a raiser's range is tighter, so
        // discount equity when facing a raise instead of taking it at face value.
        var discount = Math.min(0.12, 0.04 + 0.015 * raiseMult + (raisesBefore >= 2 ? 0.04 : 0));
        var eqAdj = eq - discount;
        var margin = latePos ? 0.01 : 0.025;
        if (canAct > 2) margin += 0.02;
        if (raiseMult >= 6) margin += 0.04; // big raise: tighten
        var spec = pair || suited && (hi >= 12 || (hi === 14)) || (!pair && gap <= 1 && hi >= 11) || (suited && gap <= 2 && hi >= 10 && latePos);
        var goodOdds = odds <= 0.28 && raiseMult <= 5;
        if (eqAdj >= odds + margin || (spec && (goodOdds || eqAdj >= odds))) {
          // commit threshold: if call is large share, shove instead with strong
          if (callFrac > 0.4 && (adj >= 9 || eqAdj > 0.52)) { if (state.canAllIn) return { type: 'allin' }; }
          if (!state.canCheck) return { type: 'call' };
          return { type: 'check' };
        }
        // small-pair / suited set-mine vs small raise
        if (!state.canCheck && (pair || (suited && hi === 14)) && odds <= 0.18) return { type: 'call' };
        return state.canCheck ? { type: 'check' } : { type: 'fold' };
      }
      // ================= POSTFLOP =================
      var draw = flushDraw || straightDraw;
      var strongMade = tripsPlus || (madeRank === 5) || (madeRank === 4) || nutish || overpair || (topPair && madeRank >= 1 && (hi >= 13 || (topPair && lo >= 11)));
      var medMade = !strongMade && (topPair || madeRank >= 2 || (madeRank === 1 && (hi >= 12)));
      // value threshold adapts to field size
      var valBar = nOpp >= 3 ? 0.62 : nOpp === 2 ? 0.58 : isHU ? 0.58 : 0.55;
      if (street === 'river') valBar -= 0.02;
      var value = eq >= valBar || (tripsPlus && !boardPair) || madeRank >= 5;
      var bluffBoard = boardHigh >= 12 && !boardPair; // scary high board good to bluff
      var wantBluff = draw || (bluffBoard && overcards > 0 && gutshot) || (bluffBoard && nOpp === 1 && mix > 0.78 && eq > 0.32);
      if (street === 'river' && !value) wantBluff = nOpp === 1 && canAct === 1 && eq > 0.35 && ((bluffBoard && mix > 0.85) || (madeRank === 0 && mix > 0.93));
      if (state.canCheck) {
        // lead value + semis; check the rest (pot control), trap monsters rarely
        var trap = value && mix < 0.12 && madeRank >= 6;
        if (value && !trap) {
          var frac = madeRank >= 4 || nutish ? 0.75 : street === 'river' ? 0.65 : 0.6;
          if (draw && madeRank <= 1) frac = 0.55;
          var amt = Math.max(bb, Math.floor((pot) * frac));
          var lead = legalRaise(myBet + amt);
          if (lead) return lead;
          return { type: 'check' };
        }
        if ((draw && eq > 0.42 && (latePos || mix > 0.45)) || (wantBluff && street !== 'river' && mix > 0.55)) {
          var bfrac = 0.5;
          var bamt = Math.max(bb, Math.floor(pot * bfrac));
          // don't spew multiway without equity
          if (nOpp >= 3 && eq < 0.45) return { type: 'check' };
          var bl = legalRaise(myBet + bamt);
          if (bl) return bl;
        }
        return { type: 'check' };
      }
      // facing bet
      var o = potOdds();
      var betFaced = toCall;
      var potFracBet = betFaced / Math.max(1, pot);
      // commitment: calling >40% stack => shove-or-fold
      if (betFaced >= myStack * 0.4 && myStack > 0) {
        var need = o + 0.02;
        if (eq >= need || (value && eq > 0.5)) { if (state.canAllIn) return { type: 'allin' }; return { type: 'call' }; }
        return { type: 'fold' };
      }
      // raise for value / semi-bluff jam draws with fold equity heads-up
      if (value && minTo !== null) {
        // slowplay monsters multiway sometimes
        if (!(mix < 0.2 && nOpp >= 3 && madeRank >= 6)) {
          var vfrac = street === 'river' ? 0.85 : 0.7;
          if (nOpp >= 3) vfrac = 0.8;
          var raiseAmt = curBet + Math.max(bb * 2, Math.floor((pot + toCall) * vfrac));
          var vr = legalRaise(Math.max(minTo, myBet + (raiseAmt - 0))); // raise-to approx
          // legalRaise expects raise-to total: myBet + new chips; curBet is street total faced
          var vt = Math.max(minTo, curBet + Math.max(bb, Math.floor((pot + toCall) * vfrac)));
          vr = legalRaise(vt);
          if (vr) return vr;
        }
      }
      // all-in overbet shove with nuts / huge equity when pot committed
      if (state.canAllIn && (madeRank >= 6 || (nutish && eq > 0.75)) && (potFracBet >= 0.6 || myStack < pot * 0.8) && minTo !== null) {
        var sh = legalRaise(maxTo);
        if (sh && sh.type === 'allin' && mix > 0.25) return sh;
      }
      // call with odds: margin tighter multiway & big bets, looser with draws/position/closing
      var mgn = 0.02;
      if (nOpp >= 3) mgn += 0.02;
      if (potFracBet > 0.75) mgn += 0.025;
      if (potFracBet < 0.3) mgn -= 0.02;
      if (canAct === 0 || nOpp === 1) mgn -= 0.01;
      if (latePos) mgn -= 0.01;
      if (draw) mgn -= 0.02;
      if (street === 'river' && medMade) mgn += 0.02; // don't hero-call light
      // population read: samples (and most bots) under-bluff big river bets,
      // so demand real equity from one-pair hands facing heat
      if (street === 'river' && madeRank <= 1 && potFracBet > 0.5) mgn += 0.06;
      if (street === 'turn' && madeRank <= 1 && potFracBet > 0.75) mgn += 0.02;
      // gutshot/overcard discount already in eq; tiny-stab call
      if (betFaced <= bb && eq > 0.25) return { type: 'call' };
      if (eq >= o + mgn) return { type: 'call' };
      // backdoor / overs getting laid great price
      if (o <= 0.15 && (medMade || draw || gutshot || overcards >= 1) && eq > 0.28) return { type: 'call' };
      return { type: 'fold' };
    } catch (err) {
      try { return state.canCheck ? { type: 'check' } : { type: 'fold' }; } catch (e2) { return { type: 'fold' }; }
    }
  }
};
