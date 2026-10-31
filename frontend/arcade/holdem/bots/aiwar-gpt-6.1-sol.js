'use strict';

// Aras Holdem: exploitative tight-aggressive bot.
// Preflop: Chen tiers + position + stack-depth (M) + blind defense + push/fold.
// Postflop: Monte-Carlo equity vs active opponents, pot-odds calls with
// street/position/implied margins, pot-sized value bets, selective semi-bluffs
// and river bluffs with blockers, plus a persistent opponent model
// (VPIP/PFR/aggression from actions + showdown history) that widens value
// vs stations and bluffs/folds vs nits/maniacs.

var OPP = {};   // opponent id -> {h,vpip,pfr,agg,call,show,sdAggro}
var MEM = { hand: -1, seen: 0, vpip: {}, pfr: {}, hist: -1 };

function stat(id) {
  var s = OPP[id];
  if (!s) { s = { h: 0, vpip: 0, pfr: 0, agg: 0, call: 0, show: 0 }; OPP[id] = s; }
  return s;
}

function observe(state) {
  try {
    if (state.handNumber !== MEM.hand) {
      var k;
      for (k in MEM.vpip) { if (MEM.vpip[k]) stat(k).vpip++; }
      for (k in MEM.pfr) { if (MEM.pfr[k]) stat(k).pfr++; }
      try {
        var seats0 = state.seats || [];
        for (var s0 = 0; s0 < seats0.length; s0++) {
          if (seats0[s0] && seats0[s0].id !== state.you.id && !seats0[s0].out) stat(seats0[s0].id).h++;
        }
      } catch (e2) { /* ignore */ }
      MEM.hand = state.handNumber; MEM.seen = 0; MEM.vpip = {}; MEM.pfr = {};
    }
    var acts = state.actions || [];
    for (var i = MEM.seen; i < acts.length; i++) {
      var a = acts[i];
      if (!a || a.id === state.you.id) continue;
      var s = stat(a.id);
      if (a.type === 'call' || a.type === 'raise' || a.type === 'allin') MEM.vpip[a.id] = true;
      if (a.street === 'preflop' && (a.type === 'raise' || a.type === 'allin')) MEM.pfr[a.id] = true;
      if (a.type === 'raise' || a.type === 'allin') s.agg++;
      else if (a.type === 'call') s.call++;
    }
    MEM.seen = acts.length;
    var hist = state.history || [];
    for (var j = 0; j < hist.length; j++) {
      var h = hist[j];
      if (!h || h.handNumber <= MEM.hist) continue;
      var sd = h.showdown || [];
      for (var q = 0; q < sd.length; q++) { if (sd[q] && sd[q].id) stat(sd[q].id).show++; }
    }
    if (hist.length) MEM.hist = hist[hist.length - 1].handNumber;
  } catch (e) { /* modeling is best-effort */ }
}

// 0 = unknown, -1 = tight/passive, +1 = loose/aggro
function profile(id) {
  var s = OPP[id];
  if (!s || s.h < 6) return 0;
  var vpip = s.vpip / s.h, pfr = s.pfr / s.h;
  if (vpip < 0.18 && s.agg <= s.call) return -1;      // nit
  if (vpip > 0.42 || (s.agg > 2 * s.call + 3 && s.h >= 8)) return 1; // station/maniac
  if (pfr > 0.3 && vpip < 0.3) return -1;             // tight-aggressive: respect raises
  return 0;
}

var RANKS = '23456789TJQKA';
function rval(c) { return RANKS.indexOf(c[0]) + 2; }
function chenHigh(r) {
  if (r === 14) return 10; if (r === 13) return 8; if (r === 12) return 7;
  if (r === 11) return 6; return r / 2;
}
function chen(cards) {
  var a = rval(cards[0]), b = rval(cards[1]);
  var hi = Math.max(a, b), lo = Math.min(a, b);
  var suited = cards[0][1] === cards[1][1];
  var score;
  if (a === b) score = Math.max(5, chenHigh(a) * 2);
  else {
    score = chenHigh(hi);
    if (suited) score += 2;
    var gap = hi - lo - 1;
    if (gap === 1) score -= 1; else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4; else if (gap >= 4) score -= 5;
    if (gap <= 1 && hi < 12) score += 1;
  }
  return Math.ceil(score * 2) / 2;
}
function preflopClass(cards) {
  var a = rval(cards[0]), b = rval(cards[1]);
  var hi = Math.max(a, b), lo = Math.min(a, b);
  var pair = a === b, suited = cards[0][1] === cards[1][1];
  var score = chen(cards);
  var premium = (pair && hi >= 11) || (hi === 14 && ((lo === 13) || (lo === 12 && suited)));
  var bigAce = hi === 14 && lo >= 11;
  return { a: a, b: b, hi: hi, lo: lo, pair: pair, suited: suited, score: score, premium: premium, bigAce: bigAce };
}

function boardDraws(hole, board) {
  var out = { flush: false, oesd: false };
  try {
    if (board.length >= 5) return out;
    var all = hole.concat(board);
    var suits = {};
    for (var i = 0; i < all.length; i++) suits[all[i][1]] = (suits[all[i][1]] || 0) + 1;
    for (var s in suits) if (suits[s] === 4) out.flush = true;
    var present = {};
    for (var j = 0; j < all.length; j++) present[rval(all[j])] = true;
    if (present[14]) present[1] = true;
    for (var hi = 14; hi >= 5; hi--) {
      var n = 0;
      for (var k = 0; k < 5; k++) if (present[hi - k]) n++;
      if (n === 4) { out.oesd = true; break; }
    }
  } catch (e) { /* ignore */ }
  return out;
}

function nutBlocker(hole, board) {
  try {
    var suits = {};
    for (var i = 0; i < board.length; i++) suits[board[i][1]] = (suits[board[i][1]] || 0) + 1;
    var flushSuit = null;
    for (var s in suits) if (suits[s] >= 3) flushSuit = s;
    if (flushSuit) {
      for (var j = 0; j < hole.length; j++)
        if (hole[j][1] === flushSuit && rval(hole[j]) === 14) return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

function potOf(state) {
  var p = 0, pots = state.pots || [];
  for (var i = 0; i < pots.length; i++) p += pots[i].amount;
  return p;
}

function mkRaise(state, target) {
  target = Math.floor(target);
  if (state.minRaiseTo === null || state.minRaiseTo === undefined) return null;
  if (!(target > 0)) target = state.minRaiseTo;
  if (target >= state.maxRaiseTo) {
    if (state.canAllIn) return { type: 'allin' };
    target = state.maxRaiseTo;
  }
  if (target < state.minRaiseTo) target = state.minRaiseTo;
  if (target <= state.currentBet) return null;
  if (target > state.maxRaiseTo) target = state.maxRaiseTo;
  if (target <= state.currentBet) return null;
  return { type: 'raise', amount: target };
}

function lastAggressor(state) {
  var acts = state.actions || [];
  for (var i = acts.length - 1; i >= 0; i--) {
    var a = acts[i];
    if (!a || a.id === state.you.id) continue;
    if (a.type === 'raise') return a.id;
    if (a.type === 'allin' && a.amount >= (state.blinds ? state.blinds[1] * 2 : 200)) return a.id;
  }
  return null;
}

function liveOpps(state) {
  return state.seats.filter(function (s) { return s.id !== state.you.id && !s.out && !s.folded; });
}

function positionAfter(state, live) {
  // Postflop action order starts left of the button: distances 1..n-1, then
  // the button (0) acts last. `after` = live opponents yet to act after us.
  var n = state.seats.length;
  var dMe = (((state.you.seat - state.buttonSeat) % n) + n) % n;
  var rank = function (d) { return d === 0 ? n : d; };
  var before = 0, total = 0;
  for (var i = 0; i < live.length; i++) {
    var d = (((live[i].seat - state.buttonSeat) % n) + n) % n;
    if (d === dMe) continue;
    total++;
    if (rank(d) < rank(dMe)) before++;
  }
  var after = total - before;
  return { after: after, frac: total ? 1 - after / (total + 1) : 1 };
}

function estimateEquity(state, nOpp, iters) {
  try {
    return PokerEngine.equity(state.you.cards, state.board, Math.min(8, nOpp), iters, Math.random);
  } catch (e) { return -1; }
}

function heuristicEquity(state, cls) {
  // Fallback if Monte Carlo throws.
  if (state.street === 'preflop') return Math.min(0.85, 0.28 + (cls ? cls.score : 6) * 0.035);
  try {
    var made = PokerEngine.evaluate(state.you.cards.concat(state.board));
    return [0.28, 0.55, 0.68, 0.8, 0.82, 0.85, 0.9, 0.93, 0.96][made.rank] || 0.3;
  } catch (e) { return 0.35; }
}

function decide(state) {
  observe(state);
  var you = state.you, bb = state.blinds[1] || 100;
  var pot = potOf(state);
  var toCall = state.toCall || 0;
  var live = liveOpps(state);
  var nOpp = live.length;
  var myChips = you.stack + (you.total || 0);
  var stackBB = myChips / Math.max(1, bb);
  var pos = positionAfter(state, live);
  var late = pos.frac >= 0.6, inPos = pos.after <= 1;
  var aggId = toCall > 0 ? lastAggressor(state) : null;
  var aggProf = aggId ? profile(aggId) : 0;
  var tableTightN = 0, tableTightSum = 0;
  for (var ti = 0; ti < live.length; ti++) {
    var tst = OPP[live[ti].id];
    if (tst && tst.h >= 6) { tableTightN++; tableTightSum += profile(live[ti].id); }
  }
  var tableTight = tableTightN >= 2 ? tableTightSum / tableTightN : 0;
  var nSeats = state.seats.length;
  var dMe = (((you.seat - state.buttonSeat) % nSeats) + nSeats) % nSeats;
  var drank = function (d) { return d === 0 ? nSeats : d; };
  var stationInHand = live.some(function (s) { return profile(s.id) > 0; });
  var stationBehind = live.some(function (s) {
    if (profile(s.id) <= 0) return false;
    var d = (((s.seat - state.buttonSeat) % nSeats) + nSeats) % nSeats;
    return drank(d) > drank(dMe);
  });

  // Everyone else is all-in or gone: no future betting, pure pot-odds call.
  var canRespond = live.some(function (s) { return !s.allIn; });
  if (!canRespond && toCall > 0) {
    var eq0 = nOpp ? estimateEquity(state, nOpp, 120) : 1;
    if (eq0 < 0) eq0 = heuristicEquity(state, null);
    var odds0 = toCall / Math.max(1, pot + toCall);
    if (eq0 + 0.001 >= odds0) return { type: 'call' };
    return { type: 'fold' };
  }
  if (!canRespond && toCall <= 0) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'call' };
  }

  // ---- PREFLOP ----
  if (state.street === 'preflop') {
    var cls = preflopClass(you.cards);
    var raises = 0, limpers = 0, agg = 0;
    var acts = state.actions || [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.street !== 'preflop' || !a || a.id === you.id) continue;
      if (a.type === 'raise' || a.type === 'allin') { raises++; agg += profile(a.id); }
      else if (a.type === 'call') limpers++;
    }
    var facingRaise = state.currentBet > bb;
    var eff = myChips;
    for (var q = 0; q < live.length; q++) eff = Math.min(eff, live[q].stack + (live[q].total || 0));
    var effBB = eff / Math.max(1, bb);

    // Push/fold zone.
    if (stackBB < 9 && effBB < 14) {
      var need = 7.5 - Math.min(2, nOpp * 0.4) + (facingRaise ? 2.5 : 0) - (late ? 1 : 0);
      if (cls.score >= need || cls.premium) {
        if (toCall <= 0 && state.minRaiseTo !== null && state.minRaiseTo !== undefined) {
          if (state.canAllIn) return { type: 'allin' };
        }
        if (toCall > 0) {
          if (cls.score >= need + 1 || toCall <= pot * 0.25) return { type: 'call' };
          return { type: 'fold' };
        }
        if (state.canCheck) return { type: 'check' };
        return { type: 'fold' };
      }
      if (state.canCheck) return { type: 'check' };
      if (toCall > 0 && toCall <= bb && cls.score >= 6) return { type: 'call' };
      return { type: 'fold' };
    }

    if (!facingRaise) {
      // First in (blinds or limpers ahead).
      var openMin = late ? 6 : cls.pair ? 6.5 : 7.5;
      if (nOpp === 1 && inPos) openMin = 4.5;                       // HU button: open wide
      else if (nOpp <= 2 && late) openMin = Math.min(openMin, 5);   // short-handed late: open wide
      if (tableTight < -0.15) openMin -= 1.5;                        // steal vs nits
      if (stationBehind) openMin += 1.5;                             // stations call: open tighter
      if (you.seat === state.bigBlindSeat && limpers > 0) openMin -= 1;
      if (cls.score >= openMin || cls.premium) {
        var size = Math.round(bb * 2.5 + limpers * bb);
        var r = mkRaise(state, Math.max(state.minRaiseTo || 0, you.bet + size));
        if (r) return r;
      }
      if (limpers > 0 && cls.score >= 5.5 && toCall <= bb && effBB > 20) return { type: 'call' };
      if (state.canCheck) return { type: 'check' };
      if (toCall <= bb && (cls.score >= 6 || (cls.suited && cls.hi >= 12) || cls.pair)) return { type: 'call' };
      return { type: 'fold' };
    }

    // Facing a raise.
    var callCap = Math.max(bb * 8, Math.floor(myChips * (effBB > 30 ? 0.09 : 0.06)));
    if (cls.premium || (cls.pair && cls.hi >= 11) || (cls.hi === 14 && cls.lo === 13)) {
      var grow = state.currentBet * 3 + Math.round(pot * 0.25);
      var r3 = mkRaise(state, Math.max(state.minRaiseTo || 0, you.bet + (toCall + grow)));
      if (r3 && raises < 2) return r3;
      if (raises >= 2) {
        // 4bet-or-fold with premiums only.
        if (cls.pair && cls.hi >= 12 || (cls.hi === 14 && cls.lo === 13 && cls.suited)) {
          if (toCall >= myChips * 0.3) { if (state.canAllIn) return { type: 'allin' }; }
          var r4 = mkRaise(state, Math.max(state.minRaiseTo || 0, you.bet + toCall + Math.round(pot * 0.8)));
          if (r4) return r4;
        }
        return { type: 'fold' };
      }
      if (toCall <= callCap || toCall <= myChips * 0.15) return { type: 'call' };
      return { type: 'fold' };
    }
    if (raises >= 2) {
      if (cls.pair && toCall <= myChips * 0.08 && effBB > 25) return { type: 'call' }; // set mine
      return { type: 'fold' };
    }
    var spec = cls.pair || (cls.suited && (cls.hi === 14 || cls.score >= 6.5)) ||
      (cls.score >= 8) || (cls.hi >= 13 && cls.lo >= 10);
    var discount = (you.seat === state.bigBlindSeat) ? bb : 0;
    if (spec && (toCall - discount) <= callCap && effBB > 18 && agg <= 0) return { type: 'call' };
    if ((you.seat === state.bigBlindSeat || you.seat === state.smallBlindSeat) &&
        toCall <= bb * 4 && (cls.score >= 6 || cls.pair || cls.suited || cls.hi === 14)) return { type: 'call' };
    if (toCall <= Math.max(bb, Math.floor(pot * 0.1)) && cls.score >= 5.5) return { type: 'call' };
    return { type: 'fold' };
  }

  // ---- POSTFLOP ----
  var iters = state.street === 'flop' ? 190 : state.street === 'turn' ? 150 : 220;
  var eq = estimateEquity(state, nOpp, iters);
  if (eq < 0) eq = heuristicEquity(state, null);

  var made = null, mrank = -1, topPair = false, overpair = false, secondPair = false;
  try {
    made = PokerEngine.evaluate(you.cards.concat(state.board));
    mrank = made.rank;
    if (mrank === 1 && state.board.length >= 3) {
      var br = state.board.map(rval).sort(function (x, y) { return y - x; });
      var hb = br[0];
      var pairRank = null;
      var hc = you.cards.map(rval);
      if (hc[0] === hc[1]) pairRank = hc[0];
      else if (br.indexOf(hc[0]) >= 0) pairRank = hc[0];
      else if (br.indexOf(hc[1]) >= 0) pairRank = hc[1];
      if (pairRank !== null) {
        if (you.cards[0][0] === you.cards[1][0]) {
          if (pairRank > hb) overpair = true;
        } else if (pairRank === hb) topPair = true;
        else if (pairRank === br[1]) secondPair = true;
      }
    }
  } catch (e) { made = null; }

  var draws = boardDraws(you.cards, state.board);
  // Note: Monte-Carlo equity already includes draw value (it plays out
  // runouts), so only a small implied-odds credit is added on early streets.
  var eqA = eq + (state.street === 'flop' && (draws.flush || draws.oesd) ? 0.02 : 0);

  // Range discount: raw equity assumes random opponent cards, but a bettor's
  // range is stronger than random. Passive players (many calls, few bets)
  // bet only very strong hands -> big discount; frequent bettors -> small.
  var rangeDisc = 0.06; // population prior
  var aggS = aggId ? OPP[aggId] : null;
  if (aggS && aggS.agg + aggS.call >= 6) {
    var pass = aggS.call / (aggS.agg + aggS.call);
    rangeDisc = pass > 0.7 ? 0.12 : pass < 0.45 ? 0.02 : 0.06;
  } else if (aggProf < 0) rangeDisc = 0.12;
  if (state.street === 'river') rangeDisc += 0.02;

  // Tournament endgame: chip leader avoids flips, short stack gambles.
  var endgame = 0;
  try {
    var maxH = (state.tournament && state.tournament.maxHands) || 300;
    if (maxH - state.handNumber <= 30 && maxH > state.handNumber) {
      var avg = 0, cnt = 0;
      for (var si = 0; si < state.seats.length; si++) {
        if (!state.seats[si].out) { avg += state.seats[si].stack; cnt++; }
      }
      avg = cnt ? avg / cnt : 1;
      if (myChips > 1.8 * avg) endgame = 0.05;
      else if (myChips < 0.6 * avg) endgame = -0.04;
    }
  } catch (e) { /* ignore */ }

  var spr = myChips / Math.max(1, pot);
  var vBase = 0.56 + 0.05 * Math.max(0, nOpp - 1) + (state.street === 'river' ? -0.02 : 0.02) + endgame;
  var valueRaiseAt = Math.min(0.85, vBase + 0.06);
  var valueBetAt = Math.min(0.8, vBase);

  function betSize(frac) {
    var target = you.bet + toCall + Math.max(bb, Math.floor((pot + toCall) * frac));
    return mkRaise(state, target);
  }

  if (toCall > 0) {
    var odds = toCall / Math.max(1, pot + toCall);
    var margin = state.street === 'flop' ? 0.02 : state.street === 'turn' ? 0.035 : 0.05;
    if (!inPos) margin += 0.02;
    if (aggProf < 0) margin += 0.02;
    else if (aggProf > 0) margin -= 0.045;
    margin += rangeDisc + endgame;

    // Crumbs: never fold to a tiny bet with any equity/draw.
    if (toCall <= Math.max(1, Math.floor(pot * 0.07)) && (eqA > 0.12 || mrank >= 1 || draws.flush || draws.oesd)) {
      if (eqA > valueRaiseAt + 0.05 && spr > 1.5) {
        var rr = betSize(0.7);
        if (rr) return rr;
      }
      return { type: 'call' };
    }

    var commit = toCall / Math.max(1, you.stack + toCall);
    // Value raise / shove (vs the bettor's stronger-than-random range).
    if (eqA >= valueRaiseAt && (mrank >= 2 || overpair || topPair || eqA > 0.72)) {
      if (commit > 0.28 && state.canAllIn && eqA > 0.62) return { type: 'allin' };
      var vr = betSize(nOpp > 1 ? 0.75 : 0.65);
      if (vr) return vr;
    }
    // Semi-bluff shove with monster draw when committed or great fold equity.
    if (commit > 0.35 && draws.flush && draws.oesd && state.canAllIn && eqA > 0.42 + rangeDisc) return { type: 'allin' };
    if (eqA + (aggProf > 0 ? 0.03 : 0) >= odds + margin) {
      // Occasionally turn a strong draw into a semi-bluff raise instead of calling.
      if (state.street !== 'river' && nOpp === 1 && inPos && aggProf <= 0 && !stationInHand &&
          (draws.flush || draws.oesd) && eqA > 0.38 + rangeDisc && eqA < valueRaiseAt &&
          Math.random() < 0.16 && spr > 2) {
        var sb = betSize(0.7);
        if (sb) return sb;
      }
      // Don't leave dust: shove instead of calling off most of the stack thin.
      if (commit > 0.55 && state.canAllIn && eqA > Math.max(0.5, odds + 0.1) + rangeDisc) return { type: 'allin' };
      return { type: 'call' };
    }
    // Bluff-catch discount vs maniacs with any pair/showdown value.
    if (aggProf > 0 && (mrank >= 1 || topPair || secondPair) && toCall <= pot * 0.6 && eq > odds - 0.06) {
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  // No bet to face: decide bet vs check.
  var strongMade = mrank >= 2 || overpair || (topPair && state.street !== 'river') ||
    (topPair && state.street === 'river' && eq > 0.6);
  var valueBetAdj = valueBetAt + (stationInHand && state.street !== 'flop' ? -0.05 : 0); // thin value vs stations
  if (eqA >= valueBetAdj && (strongMade || eqA > valueBetAdj + 0.1)) {
    // Trap rarely multiway with the nuts; otherwise bet for value/protection.
    if (mrank >= 6 && nOpp > 1 && Math.random() < 0.25) return { type: 'check' };
    var vb = betSize(nOpp > 1 ? 0.7 : state.street === 'river' ? 0.65 : 0.6);
    if (vb) return vb;
    return { type: 'check' };
  }
  // Protection bet with vulnerable top pair on wet boards.
  if ((topPair || overpair) && state.street === 'flop' && (draws.flush || draws.oesd || nOpp > 1)) {
    var pb = betSize(0.55);
    if (pb) return pb;
  }
  // Continuation-bet bluff: I was the last preflop raiser, missed, but the
  // board is dry, field is small and opponents are not stations.
  if (state.street === 'flop' && nOpp <= 2 && mrank < 1 && !draws.flush && !draws.oesd &&
      eq < 0.45 && aggProf <= 0 && !stationInHand && spr > 2) {
    var preAgg = null, preActs = state.actions || [];
    for (var pa = 0; pa < preActs.length; pa++) {
      var pra = preActs[pa];
      if (!pra || pra.street !== 'preflop') continue;
      if (pra.type === 'raise' || pra.type === 'allin') preAgg = pra.id;
    }
    if (preAgg === you.id) {
      var dry = true, bsuits = {}, bpairs = {};
      for (var bi = 0; bi < state.board.length; bi++) {
        bsuits[state.board[bi][1]] = (bsuits[state.board[bi][1]] || 0) + 1;
        bpairs[state.board[bi][0]] = (bpairs[state.board[bi][0]] || 0) + 1;
      }
      for (var bs in bsuits) if (bsuits[bs] >= 3) dry = false;
      for (var bp in bpairs) if (bpairs[bp] >= 2) dry = false;
      var bprs = state.board.map(rval).sort(function (x, y) { return x - y; });
      if (bprs[2] - bprs[0] <= 4) dry = false;
      if (dry && Math.random() < 0.35) {
        var cb = betSize(0.5);
        if (cb) return cb;
      }
    }
  }
  // Semi-bluff: heads-up, in position, strong draw, fold equity vs non-station.
  if (state.street !== 'river' && nOpp === 1 && inPos && (draws.flush || draws.oesd) &&
      eqA > 0.38 && aggProf <= 0 && !stationInHand && spr > 1.5 && Math.random() < 0.3) {
    var bl = betSize(0.55);
    if (bl) return bl;
  }
  // River bluff: missed draw, no showdown value, blocker, position, tight field.
  if (state.street === 'river' && nOpp === 1 && inPos && eq < 0.42 && mrank < 1 &&
      !stationInHand && (nutBlocker(you.cards, state.board) || Math.random() < 0.08) &&
      aggProf <= 0 && spr > 1.2 && Math.random() < 0.22) {
    var rb = betSize(0.6);
    if (rb) return rb;
  }
  return { type: 'check' };
}

module.exports = { name: 'Aras Holdem', act: function (state) {
  try {
    var a = decide(state);
    if (!a || typeof a !== 'object') return { type: 'fold' };
    if (a.type === 'check') return state.canCheck ? { type: 'check' } : { type: 'fold' };
    if (a.type === 'call') {
      if (state.canCheck) return { type: 'check' };
      if (!state.toCall || state.toCall <= 0) return { type: 'check' };
      return { type: 'call' };
    }
    if (a.type === 'allin') return state.canAllIn ? { type: 'allin' } : (state.canCheck ? { type: 'check' } : { type: 'fold' });
    if (a.type === 'raise') {
      if (state.minRaiseTo === null || state.minRaiseTo === undefined) return state.canCheck ? { type: 'check' } : { type: 'fold' };
      var amt = Math.floor(a.amount);
      if (!(amt > state.currentBet)) return state.canCheck ? { type: 'check' } : { type: 'fold' };
      if (amt > state.maxRaiseTo) amt = state.maxRaiseTo;
      if (amt < state.minRaiseTo && amt !== state.maxRaiseTo) amt = state.minRaiseTo;
      if (amt <= state.currentBet || amt > state.maxRaiseTo) return state.canCheck ? { type: 'check' } : { type: 'fold' };
      return { type: 'raise', amount: amt };
    }
    return { type: 'fold' };
  } catch (e) {
    try { return state.canCheck ? { type: 'check' } : { type: 'fold' }; }
    catch (_) { return { type: 'fold' }; }
  }
} };
