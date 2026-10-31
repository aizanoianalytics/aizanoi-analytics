'use strict';
// Equity-driven no-limit bot: Monte Carlo equity, range-shrink vs aggression, pot-odds, push/fold when short.
function act(state) {
  var me = state.you, bb = state.blinds[1];
  var opps = state.seats.filter(function (s) { return s.id !== me.id && !s.out && !s.folded; });
  var n = opps.length;
  function safe(a) {
    if (a.type === 'raise') {
      var amt = Math.floor(a.amount);
      if (state.minRaiseTo === null || amt >= state.maxRaiseTo) return state.canAllIn ? { type: 'allin' } : (state.canCheck ? { type: 'check' } : { type: 'call' });
      if (amt < state.minRaiseTo) amt = state.minRaiseTo;
      if (amt <= state.currentBet) return state.canCheck ? { type: 'check' } : { type: 'call' };
      return { type: 'raise', amount: amt };
    }
    return a;
  }
  try {
    if (n === 0) return state.canCheck ? { type: 'check' } : { type: 'call' };
    var pot = state.pots.reduce(function (t, e) { return t + e.amount; }, 0);
    var toCall = state.toCall;
    var stack = me.stack;
    var iters = n <= 2 ? 1000 : n <= 4 ? 700 : 500;
    var eq = PokerEngine.equity(me.cards, state.board, n, iters, Math.random);

    // aggression evidence: raises by opponents this hand
    var raisers = 0, bigBet = 0;
    for (var i = 0; i < state.actions.length; i++) {
      var a = state.actions[i];
      if (a.id === me.id) continue;
      if (a.type === 'raise' || (a.type === 'allin' && a.amount > bb)) raisers++;
    }
    var facing = toCall > 0;
    var potBefore = Math.max(1, pot - 0);
    var frac = facing ? toCall / Math.max(1, pot - toCall) : 0; // bet size relative to pot before it
    var eff = eq;
    if (facing) {
      var shrink = 0.18 * Math.min(raisers, 3) + 0.25 * Math.min(frac, 1.5);
      if (state.street === 'preflop') shrink = 0.22 * Math.min(raisers, 3) * (toCall > 3 * bb ? 1.2 : 1);
      eff = Math.pow(eq, 1 + shrink);
    }
    var bbs = stack / bb;
    var heads = n === 1;
    var base = 1 / (n + 1);

    // short-stack push/fold
    if (bbs <= 9 && state.street === 'preflop') {
      var need = heads ? 0.5 : base + 0.12;
      if (facing) need = Math.max(need, (toCall / (pot + toCall)) + 0.06 + 0.04 * raisers);
      if (eq > need) return state.canAllIn ? { type: 'allin' } : { type: 'call' };
      return state.canCheck ? { type: 'check' } : { type: 'fold' };
    }

    var rnd = Math.random();
    if (!facing) {
      // open / bet
      var thr = heads ? 0.54 : base + 0.17;
      var val = eff > thr;
      var bluff = !val && eq > base * 0.6 && rnd < (state.street === 'river' ? 0.12 : 0.18) && heads;
      if (state.street === 'preflop' && !val && heads && rnd < 0.25 && eq > 0.42) bluff = true;
      if ((val || bluff) && state.minRaiseTo !== null) {
        var f = val ? (eff > 0.8 ? 0.75 : eff > 0.65 ? 0.6 : 0.5) : 0.5;
        if (state.street === 'preflop') {
          var target = Math.round(bb * (val ? (eff > 0.7 ? 3.5 : 2.6) : 2.2));
          return safe({ type: 'raise', amount: Math.max(target, state.minRaiseTo) });
        }
        // slowplay monsters sometimes
        if (eff > 0.92 && state.street !== 'river' && rnd < 0.2) return { type: 'check' };
        return safe({ type: 'raise', amount: me.bet + Math.max(bb, Math.round(pot * f)) });
      }
      return { type: 'check' };
    }

    // facing a bet
    var odds = toCall / (pot + toCall);
    var allinCall = toCall >= stack;
    if (state.minRaiseTo !== null && !allinCall) {
      var rthr = heads ? 0.72 : 0.62 + 0.03 * n;
      if (eff > rthr + 0.04 * raisers && eff > odds + 0.2) {
        var size = Math.round(state.currentBet + Math.max(state.lastFullRaise, (pot + toCall) * (eff > 0.85 ? 0.9 : 0.65)));
        if (size >= state.maxRaiseTo * 0.6) return state.canAllIn ? { type: 'allin' } : safe({ type: 'raise', amount: size });
        return safe({ type: 'raise', amount: size });
      }
      // light 3-bet bluff preflop heads-up
      if (heads && state.street === 'preflop' && raisers <= 1 && toCall <= 3 * bb && eq > 0.45 && rnd < 0.12)
        return safe({ type: 'raise', amount: Math.round(state.currentBet * 3) });
    }
    var margin = state.street === 'river' ? 0.03 : 0.015;
    if (eff >= odds + margin) {
      if (allinCall && state.canAllIn) return { type: 'allin' };
      return { type: 'call' };
    }
    return { type: 'fold' };
  } catch (e) {
    return state.canCheck ? { type: 'check' } : { type: 'fold' };
  }
}
module.exports = { name: 'Sonnet Equity Shark', botName: 'Sonnet Equity Shark', lab: 'Claude Sonnet 5.5', act: act };
