'use strict';
// Aras Holdem: tight-aggressive, equity-driven NLHE tournament bot.
// Preflop: position-aware ranges + MC equity; Postflop: MC equity vs pot
// odds, value-heavy sizing, rare in-position bluffs, short-stack push/fold.
// Opponent pool tendencies tracked in module memory (VPIP/PFR/aggression)
// from public in-hand actions + showdown history; used to shift thresholds.
var STATS = Object.create(null); // id -> {hands,vpip,pfr,agg,seen}
var LAST = { hand: -1, count: 0 };

function potOf(state) {
  var p = 0;
  for (var i = 0; i < state.pots.length; i++) p += state.pots[i].amount;
  return p;
}
function liveOpp(state) {
  var r = [];
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    if (s.id !== state.you.id && !s.out && !s.folded) r.push(s);
  }
  return r;
}
function clampRaise(state, target) {
  if (state.minRaiseTo === null || state.minRaiseTo === undefined) return null;
  var t = Math.floor(target);
  if (!(t > state.currentBet)) t = state.minRaiseTo;
  if (t < state.minRaiseTo) t = state.minRaiseTo;
  if (t > state.maxRaiseTo) t = state.maxRaiseTo;
  if (!(t > state.currentBet)) return null;
  if (t < state.minRaiseTo && t !== state.maxRaiseTo) return null;
  return t;
}
function doRaise(state, target) {
  var t = clampRaise(state, target);
  if (t === null) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'call' };
  }
  if (t >= state.maxRaiseTo) return { type: 'allin' };
  // avoid pointless tiny short all-ins: if target within 12% of stack, shove
  return { type: 'raise', amount: t };
}
function observe(state) {
  try {
    var key = state.handNumber + ':' + state.you.id;
    if (LAST.hand !== state.handNumber) { LAST.hand = state.handNumber; LAST.count = 0; }
    var acts = state.actions || [];
    for (var i = LAST.count; i < acts.length; i++) {
      var a = acts[i];
      if (!a || !a.id || a.id === state.you.id) continue;
      var st = STATS[a.id];
      if (!st) { st = STATS[a.id] = { hands: 0, vpip: 0, pfr: 0, calls: 0, bets: 0 }; }
      if (a.street === 'preflop' && (a.type === 'call' || a.type === 'raise' || a.type === 'allin')) st.vpip++;
      if (a.street === 'preflop' && (a.type === 'raise' || a.type === 'allin')) st.pfr++;
      if (a.type === 'call') st.calls++;
      if (a.type === 'raise' || a.type === 'allin') st.bets++;
    }
    LAST.count = acts.length;
    // mark opponents present this hand
    for (var j = 0; j < state.seats.length; j++) {
      var s = state.seats[j];
      if (s.id === state.you.id || s.out) continue;
      var o = STATS[s.id];
      if (!o) STATS[s.id] = { hands: 1, vpip: 0, pfr: 0, calls: 0, bets: 0 };
    }
    void key;
  } catch (e) { /* stats never break decisions */ }
}
function tableLooseness(state) {
  var n = 0, sum = 0;
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    if (s.id === state.you.id || s.out) continue;
    var st = STATS[s.id];
    if (st && st.vpip > 0) { sum += Math.min(1, st.vpip / 12); n++; }
  }
  if (!n) return 0.5;
  return sum / n;
}
// position: 0 = first to act postflop ... ; late if button/cutoff area
function positionInfo(state) {
  var order = [];
  var n = state.seats.length;
  var live = state.seats.filter(function (s) { return !s.out; });
  // distance clockwise from button
  function dist(seatIdx) { return (seatIdx - state.buttonSeat + n) % n; }
  var mine = dist(state.you.seat);
  // count live seats with greater distance (act after us postflop, roughly)
  var after = 0, liveCount = 0;
  for (var i = 0; i < live.length; i++) {
    if (live[i].id === state.you.id) continue;
    liveCount++;
    if (dist(live[i].seat) > mine) after++;
  }
  var total = liveCount + 1;
  var late = (state.you.seat === state.buttonSeat) || (total > 1 && after <= Math.max(0, Math.floor(total / 3) - (total <= 3 ? 1 : 0)));
  if (total === 2) late = (state.you.seat === state.buttonSeat);
  return { after: after, total: total, late: late, headsUp: total === 2 };
}
function chenScore(cards) {
  var R = '23456789TJQKA';
  var r1 = R.indexOf(cards[0][0]) + 2, r2 = R.indexOf(cards[1][0]) + 2;
  var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  var suited = cards[0][1] === cards[1][1];
  var pair = r1 === r2;
  var gap = hi - lo - 1;
  var sc;
  if (hi === 14) sc = 10; else if (hi === 13) sc = 8; else if (hi === 12) sc = 7; else if (hi === 11) sc = 6;
  else sc = (hi + 2) / 2;
  if (pair) sc = Math.max(5, sc * 2);
  if (suited) sc += 2;
  if (!pair) {
    if (gap === 0) sc += (lo < 12 ? 1 : 0);
    else if (gap === 1) sc -= 1;
    else if (gap === 2) sc -= 2;
    else if (gap === 3) sc -= 4;
    else sc -= 5;
    if (hi < 12 && gap >= 0 && !(hi === 14 || lo === 14)) {
      // straight bonus for connected mid cards
      if (gap <= 1) sc += 1;
    }
  }
  return sc;
}
function mcEquity(state, nOpp) {
  var n = Math.max(0, Math.min(8, nOpp));
  if (!n) return 1;
  var iters = state.street === 'preflop' ? 220 : state.street === 'flop' ? 260 : state.street === 'turn' ? 180 : 220;
  if (n >= 4) iters = Math.max(120, Math.floor(iters * 0.6));
  try {
    return PokerEngine.equity(state.you.cards, state.board, n, iters, Math.random);
  } catch (e) {
    return 0.5;
  }
}
function madeHand(state) {
  try {
    if (state.board.length < 3) return null;
    return PokerEngine.evaluate(state.you.cards.concat(state.board));
  } catch (e) { return null; }
}

function decide(state) {
  observe(state);
  var pot = potOf(state);
  var bb = state.blinds[1] || 100;
  var toCall = state.toCall || 0;
  var opps = liveOpp(state);
  var n = opps.length;
  var pos = positionInfo(state);
  var eff = state.you.stack; // uncommitted
  var myTotal = state.you.stack + state.you.bet + state.you.total;
  var mStack = eff / Math.max(1, (state.blinds[0] || 50) + bb);
  var looseness = tableLooseness(state); // 0 tight .. 1 loose
  var potAfterCall = pot + toCall;
  var potOdds = toCall <= 0 ? 0 : toCall / Math.max(1, potAfterCall);

  // No one to beat: take free cards, never fold when free.
  if (n === 0) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'call' };
  }

  // ---------------- PREFLOP ----------------
  if (state.street === 'preflop') {
    var R = '23456789TJQKA';
    var a0 = R.indexOf(state.you.cards[0][0]) + 2, b0 = R.indexOf(state.you.cards[1][0]) + 2;
    var hi = Math.max(a0, b0), lo = Math.min(a0, b0);
    var pair = a0 === b0;
    var suited = state.you.cards[0][1] === state.you.cards[1][1];
    var chen = chenScore(state.you.cards);
    var eq = mcEquity(state, n);

    // effective BBs (use max(total) stacks roughly)
    var effBB = eff / Math.max(1, bb);

    // ---- short-stack push/fold (<=11bb effective) ----
    if (effBB <= 11 && !state.canCheck) {
      var pushEq = 0.50 - Math.min(0.10, (11 - effBB) * 0.012) - (pos.late ? 0.06 : 0) - (n >= 4 ? -0.02 : 0.02);
      // facing big call relative to pot: need real hand
      if (toCall >= eff * 0.35) {
        if (eq >= Math.max(0.47, potOdds + 0.06)) return { type: 'allin' };
        return { type: 'fold' };
      }
      var shove = false;
      if (pair && (hi >= 7 || effBB <= 7 || pos.late)) shove = true;
      else if (hi === 14 && (lo >= 8 || suited || effBB <= 7)) shove = true;
      else if (hi === 13 && (lo >= 10 || (suited && lo >= 8))) shove = true;
      else if (suited && hi >= 12 && lo >= 9) shove = true;
      else if (eq >= pushEq + 0.06) shove = true;
      else if (pos.late && toCall <= bb * 2 && (eq >= pushEq - 0.02)) shove = true;
      if (shove) {
        if (state.canAllIn && state.minRaiseTo !== null) {
          // open-shove when short
          if (toCall <= 0) return { type: 'allin' };
          // facing raise: shove over
          return { type: 'allin' };
        }
        return { type: eq >= potOdds + 0.05 ? 'call' : 'fold' };
      }
      if (toCall <= 0) {
        // shouldn't happen (canCheck false means toCall>0) but safe
        return { type: 'call' };
      }
      // small speculative call only if cheap + deepish implied (pairs/sc)
      var cheap = toCall <= Math.max(bb * 2, eff * 0.12);
      var spec = (pair) || (suited && hi - lo <= 4 && hi >= 10) || (hi === 14 && lo >= 7);
      if (cheap && spec && eq >= potOdds - 0.02) return { type: 'call' };
      return { type: 'fold' };
    }

    // ---- normal stacks ----
    var openBase = pos.headsUp ? 4 : pos.late ? 7 : 9.5;
    if (pos.total >= 6 && !pos.late) openBase += 1;
    if (looseness > 0.6) openBase += 1;      // tighter vs loose tables
    else if (looseness < 0.35) openBase -= 1; // steal wider vs nits

    if (state.canCheck) {
      // BB option or limped pot: attack with anything decent, else free card.
      if (chen >= openBase - 1 || eq >= 1 / (n + 1) + 0.10) {
        if (state.minRaiseTo !== null) {
          var t0 = state.you.bet + Math.max(bb * 3, Math.floor((pot || bb * 2) * 0.7) + bb);
          t0 = Math.max(t0, state.minRaiseTo);
          if (t0 >= state.maxRaiseTo) return { type: 'allin' };
          return { type: 'raise', amount: t0 };
        }
      }
      return { type: 'check' };
    }

    // facing a bet/raise
    var isOpen = toCall <= bb && (state.actions || []).filter(function (x) { return x.street === 'preflop' && (x.type === 'raise' || x.type === 'allin'); }).length === 0;
    // first-in: raise rather than limp (button open / steal). Raise-to ~2.5-3bb.
    if (isOpen && toCall <= bb && state.minRaiseTo !== null) {
      var openThresh = pos.headsUp ? 5 : (pos.late ? openBase - 1 : openBase + 1);
      var openEqNeed = pos.headsUp ? 0.46 : 0.55;
      if (n <= 2 && pos.late) openEqNeed -= 0.03;
      if (chen >= openThresh || eq >= openEqNeed) {
        var openTo = state.you.bet + toCall + Math.max(bb * 2, Math.floor((pot + toCall) * 0.6));
        if (pos.headsUp) openTo = Math.max(openTo, bb * 3);
        else openTo = Math.max(openTo, Math.floor(bb * 2.5));
        return doRaise(state, Math.max(openTo, state.minRaiseTo));
      }
      if (pos.headsUp) {
        // trash button: mostly call getting 3:1, ditch the very worst
        if (eq >= potOdds - 0.08) return { type: 'call' };
        return { type: 'fold' };
      }
    }
    // 3-bet premiums, bigger vs loose + out of position
    var prem = (pair && hi >= 11) || (hi === 14 && lo === 14) || (hi === 14 && lo >= 12) || (pair && hi >= 10 && pos.late);
    var premPlus = (pair && hi >= 12) || (hi === 14 && lo >= 13 && (suited || lo === 14));
    // 4bet/shove giants
    if (premPlus && effBB <= 30 && toCall >= bb * 4 && state.minRaiseTo !== null && Math.random() < 0.7) {
      return { type: 'allin' };
    }
    if (prem && state.minRaiseTo !== null) {
      // occasional flat with AA/KK multiway for deception
      var flatTrap = pair && hi >= 13 && n >= 3 && Math.random() < 0.25;
      if (!flatTrap) {
        var mult = pos.late ? 3 : 3.4;
        var tgt = state.you.bet + toCall + Math.max(bb * 4, Math.floor((pot + toCall) * 0.6));
        // 3-bet to ~3x the open + callers
        var prevMax = state.currentBet;
        tgt = Math.max(tgt, state.you.bet + (prevMax - state.you.bet) * 0 + prevMax + Math.max(bb * 2, Math.floor(pot * 0.5)));
        void mult;
        var r1 = doRaise(state, Math.max(tgt, state.minRaiseTo));
        // don't 3-bet garbage-thin vs huge 4bets? we already filtered by prem
        return r1;
      }
    }
    // flat / fold by equity vs odds with implied-odds discount for playable hands
    var playable = pair || hi === 14 || (suited && hi >= 10) || (hi >= 12 && lo >= 9) || chen >= 7;
    var discount = 0.045; // base margin over raw odds
    if (pair && hi <= 9 && effBB >= 20 && toCall <= bb * 6) discount = -0.06; // set mining
    else if (suited && Math.abs(hi - lo) <= 3 && effBB >= 20 && toCall <= bb * 4) discount = -0.03;
    else if (hi >= 13 && lo >= 10) discount = 0.01;
    if (pos.late) discount -= 0.015;
    if (looseness > 0.65) discount += 0.02; // less dominated-call vs loose
    // heads-up defend much wider
    if (pos.headsUp) discount -= 0.08;
    // big stacks behind give implied odds; short stacks remove them
    var maxOppStack = 0;
    for (var oi = 0; oi < opps.length; oi++) maxOppStack = Math.max(maxOppStack, opps[oi].stack);
    if (maxOppStack < toCall * 4 && (pair && hi <= 10)) discount += 0.05;

    // too expensive for speculative: fold
    var need = potOdds + discount;
    if (pos.headsUp) need = Math.min(need, 0.42);
    if (eq >= need && (playable || eq >= 1 / (n + 1))) {
      // squeeze-call cap: don't cold-call giant 3bets without premium
      if (toCall > bb * 10 && !prem && eq < 0.55) return { type: 'fold' };
      if (toCall > eff * 0.45 && eq < 0.52) {
        // pot-committing call -> shove if any fold equity, else equity call
        if (eq >= 0.5 && state.canAllIn) return { type: 'allin' };
      }
      return { type: 'call' };
    }
    // late steal re-raise bluff vs single opener, rare
    if (isOpen && pos.late && n === 1 && chen >= 8 && state.minRaiseTo !== null && Math.random() < 0.15) {
      return doRaise(state, Math.max(state.minRaiseTo, state.you.bet + toCall + Math.max(bb * 3, Math.floor(pot * 0.6))));
    }
    return { type: 'fold' };
  }

  // ---------------- POSTFLOP ----------------
  var hand = madeHand(state);
  var equity = mcEquity(state, n);
  var boardPair = false;
  try {
    if (state.board.length >= 3) {
      var seen = {};
      for (var bi = 0; bi < state.board.length; bi++) {
        var rk = state.board[bi][0];
        if (seen[rk]) boardPair = true;
        seen[rk] = 1;
      }
    }
  } catch (e) { /* ignore */ }
  var hrank = hand ? hand.rank : 0;
  // overpair / top-pair-ish detection for value sizing boost
  var strongMade = hrank >= 3 || (hrank === 2) || (hrank === 1 && equity > 0.62);

  // thresholds
  var base = 1 / (n + 1);
  var raiseEq = state.street === 'flop' ? Math.max(0.60, base + 0.22)
    : state.street === 'turn' ? Math.max(0.58, base + 0.20)
    : Math.max(0.56, base + 0.16);
  if (n === 1) raiseEq = state.street === 'river' ? 0.58 : 0.63;
  if (n >= 3) raiseEq += 0.04;
  if (looseness > 0.6) raiseEq -= 0.02;  // value wider vs calling stations
  else if (looseness < 0.35) raiseEq += 0.03; // less thin value vs nits
  // draw-friendly boards: charge more, raise tighter on flushy boards? keep simple
  var callMargin = state.street === 'river' ? 0.02 : 0.03;
  // implied odds discount on flop/turn with stacks behind
  var behind = Math.min(eff, (function () { var m = 1e15; for (var k = 0; k < opps.length; k++) if (!opps[k].allIn) m = Math.min(m, opps[k].stack); return m === 1e15 ? 0 : m; })());
  var implied = 0;
  if (state.street !== 'river' && behind > pot * 1.5) implied = 0.03;
  if (state.street === 'flop' && behind > pot * 3) implied = 0.05;

  // short-stack commitment: if toCall is tiny vs pot/stack, never fold decent
  var commitFrac = eff > 0 ? toCall / (eff + toCall) : 1;
  if (commitFrac < 0.08 && equity > 0.25 && state.street !== 'preflop') {
    if (!state.canCheck) return { type: 'call' };
  }

  if (state.canCheck) {
    var bet = false;
    if (equity >= (n === 1 ? 0.55 : base + 0.16)) bet = true;
    else if (strongMade && equity > 0.52) bet = true;
    else {
      // selective aggression: in position, heads-up, some equity -> stab/semi-bluff
      var stab = (pos.late || pos.headsUp) && n === 1 && equity >= 0.38 && equity < 0.55;
      if (stab) {
        // fewer bluffs vs loose tables and on paired boards multiway-averse
        var p = looseness > 0.6 ? 0.18 : 0.38;
        if (state.street === 'river') p = looseness > 0.6 ? 0.06 : 0.14;
        if (Math.random() < p) bet = true;
      }
    }
    if (bet && state.minRaiseTo !== null) {
      var frac = equity >= 0.72 ? 0.75 : equity >= 0.6 ? 0.62 : 0.5;
      if (state.street === 'river' && equity >= 0.6) frac = 0.7;
      var size = state.you.bet + Math.max(bb, Math.floor((pot + 0) * frac));
      size = Math.max(size, state.minRaiseTo);
      if (size >= state.maxRaiseTo || (eff - (size - state.you.bet)) < bb * 2) return { type: 'allin' };
      return { type: 'raise', amount: size };
    }
    return { type: 'check' };
  }

  // facing a bet
  var needEq = potOdds + callMargin - implied;
  // all-in close: pure chip-EV
  var facingAllin = opps.some(function (o) { return o.allIn || (o.bet + o.stack) <= state.currentBet; });
  if (facingAllin || commitFrac > 0.5) needEq = potOdds - 0.01;
  // min-bet / tiny probe: defend wide
  if (toCall <= Math.max(bb, pot * 0.15) && equity > 0.30) needEq = Math.min(needEq, 0.30);

  if (equity >= raiseEq && state.minRaiseTo !== null) {
    // slow-play monsters sometimes vs aggro tables heads-up
    if (hrank >= 6 && n === 1 && Math.random() < 0.25 && toCall <= pot * 0.6) return { type: 'call' };
    var f2 = equity >= 0.75 ? 0.85 : 0.65;
    var rt = state.you.bet + toCall + Math.max(bb * 2, Math.floor((pot + toCall) * f2));
    rt = Math.max(rt, state.minRaiseTo);
    if (rt >= state.maxRaiseTo * 0.7 && equity > 0.7 && behind < pot * 2) return { type: 'allin' };
    return doRaise(state, rt);
  }
  if (equity >= needEq) {
    // raise small draws? no — just call; shove if we're priced in and strong
    if (commitFrac > 0.55 && equity > 0.55 && state.canAllIn) return { type: 'allin' };
    // don't call off entire stack with thin draws
    if (toCall >= eff && equity < Math.max(0.5, potOdds + 0.03)) return { type: 'fold' };
    return { type: 'call' };
  }
  return { type: 'fold' };
}

module.exports = {
  name: 'Aras',
  act: function (state) {
    try {
      var r = decide(state);
      // final legality firewall
      if (!r || typeof r !== 'object') return { type: state.canCheck ? 'check' : 'fold' };
      if (r.type === 'check' && !state.canCheck) return { type: 'fold' };
      if (r.type === 'call' && state.canCheck) return { type: 'check' };
      if (r.type === 'raise') {
        if (state.minRaiseTo === null || !Number.isSafeInteger(r.amount) ||
            r.amount <= state.currentBet || r.amount > state.maxRaiseTo ||
            (r.amount < state.minRaiseTo && r.amount !== state.maxRaiseTo)) {
          if (state.canCheck) return { type: 'check' };
          // fallback: call if price is sane else fold
          return { type: 'call' };
        }
      }
      if (r.type === 'allin' && !state.canAllIn) {
        if (state.canCheck) return { type: 'check' };
        return { type: 'fold' };
      }
      if (['fold', 'check', 'call', 'raise', 'allin'].indexOf(r.type) < 0) {
        return { type: state.canCheck ? 'check' : 'fold' };
      }
      return r;
    } catch (e) {
      try { return { type: state.canCheck ? 'check' : 'fold' }; }
      catch (e2) { return { type: 'fold' }; }
    }
  }
};
