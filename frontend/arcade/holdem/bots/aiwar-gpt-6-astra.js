'use strict';

var STATS = {};

function rv(rankCh) {
  if (rankCh === 'A') return 14;
  if (rankCh === 'K') return 13;
  if (rankCh === 'Q') return 12;
  if (rankCh === 'J') return 11;
  if (rankCh === 'T') return 10;
  return rankCh.charCodeAt(0) - 48;
}

function chen(c0, c1) {
  var a = rv(c0[0]);
  var b = rv(c1[0]);
  var hi = a >= b ? a : b;
  var lo = a >= b ? b : a;
  function base(r) {
    if (r === 14) return 10;
    if (r === 13) return 8;
    if (r === 12) return 7;
    if (r === 11) return 6;
    return r / 2;
  }
  var score;
  if (a === b) {
    score = base(a) * 2;
    if (score < 5) score = 5;
  } else {
    score = base(hi);
    if (c0[1] === c1[1]) score += 2;
    var gap = hi - lo - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && hi < 12) score += 1;
  }
  return score;
}

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function potTotal(state) {
  var t = 0;
  for (var i = 0; i < state.pots.length; i++) t += state.pots[i].amount;
  return t;
}

function liveOpps(state) {
  var n = 0;
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    if (s.id !== state.you.id && !s.out && !s.folded) n++;
  }
  return n;
}

function activeCount(state) {
  var n = 0;
  for (var i = 0; i < state.seats.length; i++) if (!state.seats[i].out) n++;
  return n;
}

function posDist(state) {
  var n = state.seats.length;
  return (state.you.seat - state.buttonSeat + n * 10) % n;
}

function raiseTo(state, target) {
  target = Math.floor(target);
  if (state.minRaiseTo === null || state.minRaiseTo === undefined) return null;
  if (target < state.minRaiseTo) target = state.minRaiseTo;
  if (target >= state.maxRaiseTo) {
    if (state.canAllIn) return { type: 'allin' };
    target = state.maxRaiseTo;
    if (target <= state.currentBet) return null;
  }
  if (target <= state.currentBet) return null;
  return { type: 'raise', amount: target };
}

function callOrFold(state) {
  if (state.canCheck) return { type: 'check' };
  return { type: 'call' };
}

function noteShowdowns(state) {
  try {
    var h = state.history;
    for (var i = 0; i < h.length; i++) {
      var sd = h[i].showdown || [];
      for (var j = 0; j < sd.length; j++) {
        var e = sd[j];
        var id = e.id;
        if (!STATS[id]) STATS[id] = { hands: 0, loose: 0, seen: {} };
        var hk = h[i].handNumber + ':' + id;
        if (!STATS[id].seen[hk]) {
          STATS[id].seen[hk] = 1;
          STATS[id].hands++;
          if (e.cards && e.cards.length === 2) {
            var r1 = rv(e.cards[0][0]);
            var r2 = rv(e.cards[1][0]);
            var low = r1 < r2 ? r1 : r2;
            var paired = r1 === r2;
            if (!paired && low < 10 && !(r1 === 14 || r2 === 14)) STATS[id].loose++;
          }
        }
      }
    }
    var ids = Object.keys(STATS);
    if (ids.length > 40) {
      for (var m = 0; m < ids.length - 40; m++) delete STATS[ids[m]];
    }
  } catch (e) {}
}

function handAggression(state, id) {
  var n = 0;
  var acts = state.actions;
  for (var k = 0; k < acts.length; k++) {
    if (acts[k].id === id && (acts[k].type === 'raise' || acts[k].type === 'allin')) n++;
  }
  return n;
}

function stickyOpp(state, youId) {
  var calls = {};
  var acts = state.actions;
  for (var k = 0; k < acts.length; k++) {
    if (acts[k].type === 'call') calls[acts[k].id] = (calls[acts[k].id] || 0) + 1;
  }
  for (var id in calls) {
    if (id !== youId && calls[id] >= 2) return true;
  }
  return false;
}

function oppLoose(id) {
  var st = STATS[id];
  if (!st || st.hands < 2) return 0;
  return st.loose / st.hands;
}

function hasFlushDraw(hole, board) {
  var cnt = {};
  var all = hole.concat(board);
  for (var i = 0; i < all.length; i++) {
    var s = all[i][1];
    cnt[s] = (cnt[s] || 0) + 1;
  }
  for (var k in cnt) if (cnt[k] === 4) return true;
  return false;
}

function hasOESD(hole, board) {
  if (board.length < 3) return false;
  try {
    var all = hole.concat(board);
    var set = {};
    for (var i = 0; i < all.length; i++) {
      var r = rv(all[i][0]);
      set[r] = 1;
      if (r === 14) set[1] = 1;
    }
    var usesHole = false;
    var hr = {};
    hr[rv(hole[0][0])] = 1;
    hr[rv(hole[1][0])] = 1;
    if (rv(hole[0][0]) === 14) hr[1] = 1;
    if (rv(hole[1][0]) === 14) hr[1] = 1;
    for (var hi = 14; hi >= 5; hi--) {
      var have = 0;
      var needHole = false;
      for (var o = 0; o < 5; o++) {
        var need = hi - o;
        if (set[need]) {
          have++;
          if (hr[need]) needHole = true;
        }
      }
      if (have === 4 && needHole) {
        var missing = -1;
        for (var o2 = 0; o2 < 5; o2++) if (!set[hi - o2]) missing = o2;
        if (missing === 0 || missing === 4) return true;
      }
    }
  } catch (e) {}
  return false;
}

function decide(state) {
  noteShowdowns(state);
  var you = state.you;
  var hole = you.cards;
  var board = state.board;
  var pot = potTotal(state);
  var toCall = state.toCall;
  var bb = state.blinds[1] > 0 ? state.blinds[1] : 100;
  var nOpp = liveOpps(state);
  if (nOpp > 8) nOpp = 8;
  if (nOpp < 0) nOpp = 0;
  if (nOpp === 0) return callOrFold(state);
  var nActive = activeCount(state);
  var headsUp = (nActive === 2) || (nOpp === 1 && state.street === 'preflop' && nActive <= 2);
  var eff = Math.floor((you.stack + you.bet) / bb);
  var d = posDist(state);
  var inPos = d <= 1;
  var potOdds = toCall <= 0 ? 0 : toCall / Math.max(1, pot + toCall);
  var seedKey = hole[0] + hole[1] + board.join('') + ':' + state.handNumber + ':' + state.street;
  var rnd;
  try {
    rnd = PokerEngine.rng(hashStr(seedKey));
  } catch (e) {
    rnd = Math.random;
  }

  var r1 = rv(hole[0][0]);
  var r2 = rv(hole[1][0]);
  var hiH = r1 >= r2 ? r1 : r2;
  var loH = r1 >= r2 ? r2 : r1;
  var isPair = r1 === r2;
  var suited = hole[0][1] === hole[1][1];
  var score = chen(hole[0], hole[1]);

  var oppAggro = 0;
  var oppLooseAvg = 0;
  var cnt = 0;
  for (var si = 0; si < state.seats.length; si++) {
    var so = state.seats[si];
    if (so.id !== you.id && !so.out && !so.folded) {
      if (handAggression(state, so.id) >= 2) oppAggro++;
      oppLooseAvg += oppLoose(so.id);
      cnt++;
    }
  }
  if (cnt > 0) {
    oppAggro = oppAggro / cnt;
    oppLooseAvg /= cnt;
  }

  var raisesThisStreet = 0;
  var lastRaiseSize = 0;
  var preflopRaises = 0;
  for (var ai = 0; ai < state.actions.length; ai++) {
    var a = state.actions[ai];
    if (a.street === state.street && (a.type === 'raise' || a.type === 'allin')) {
      raisesThisStreet++;
      lastRaiseSize = a.amount;
    }
    if (a.street === 'preflop' && (a.type === 'raise' || a.type === 'allin')) preflopRaises++;
  }
  var facingAggression = raisesThisStreet > 0;

  var myTotal = you.stack + you.bet;
  var commitFrac = toCall / Math.max(1, myTotal);
  var potBB = pot / bb;

  var icmTight = 0;
  try {
    var myChips = you.stack + you.total;
    var stacks = [];
    for (var ti = 0; ti < state.seats.length; ti++) {
      if (!state.seats[ti].out) stacks.push(state.seats[ti].stack + state.seats[ti].total);
    }
    stacks.sort(function (x, y) { return x - y; });
    var shortLine = stacks.length >= 3 ? stacks[1] : 0;
    if (nActive <= 4 && myChips <= shortLine * 1.3 && commitFrac > 0.12) icmTight = 0.04;
    if (state.tournament && state.tournament.maxHands - state.handNumber < 25 && nActive > 2) {
      var avg = 0;
      for (var qi = 0; qi < stacks.length; qi++) avg += stacks[qi];
      avg /= Math.max(1, stacks.length);
      if (myChips < avg * 0.6 && commitFrac > 0.15) icmTight = 0.06;
    }
  } catch (e) {}

  function mcEquity(streetIters) {
    var it = streetIters;
    if (nOpp >= 5) it = Math.min(it, 60);
    else if (nOpp >= 3) it = Math.min(it, 110);
    try {
      return PokerEngine.equity(hole, board, nOpp, it, rnd);
    } catch (e) {
      return 0.5;
    }
  }

  function sizeBet(frac, minBBs) {
    var amt = Math.floor((pot + toCall) * frac);
    var minAmt = Math.floor(bb * (minBBs || 0.5));
    if (amt < minAmt) amt = minAmt;
    return raiseTo(state, you.bet + toCall + amt);
  }

  function shoveOrRaise(target) {
    var r = raiseTo(state, target);
    if (r) return r;
    if (state.canAllIn) return { type: 'allin' };
    return callOrFold(state);
  }

  /* ---------- SHORT STACK push/fold ---------- */
  var shortPush = eff <= 11 && state.street === 'preflop';
  if (shortPush) {
    var eqS = mcEquity(100);
    var firstIn = !facingAggression;
    if (toCall <= 0) {
      var pushThr = headsUp ? 0.5 : (inPos ? 0.52 : 0.55);
      if (eff <= 6) pushThr -= 0.04;
      var scorePush = headsUp ? (score >= 7 || hiH >= 12 || isPair) : (inPos ? score >= 8.5 : score >= 10);
      if (eqS >= pushThr || scorePush) {
        if (state.canAllIn && (state.minRaiseTo === null || state.maxRaiseTo <= state.currentBet + bb)) return { type: 'allin' };
        var rt = raiseTo(state, state.maxRaiseTo);
        if (rt) return rt;
        return callOrFold(state);
      }
      return { type: state.canCheck ? 'check' : 'fold' };
    } else {
      var need = potOdds + 0.02 + icmTight;
      if (commitFrac > 0.35) need -= 0.06;
      if (eqS >= Math.max(need, 0.42) && (eqS >= 0.5 || commitFrac > 0.3 || toCall <= bb * 3)) {
        if (toCall >= you.stack) {
          if (state.canAllIn) return { type: 'allin' };
          return { type: 'call' };
        }
        if (eqS >= 0.55 || commitFrac > 0.4) {
          if (state.canAllIn && (toCall >= myTotal * 0.5 || eqS >= 0.6)) return { type: 'allin' };
        }
        return { type: 'call' };
      }
      return { type: 'fold' };
    }
  }

  /* ---------- PREFLOP ---------- */
  if (state.street === 'preflop') {
    var eq = mcEquity(150);
    var openBase = headsUp ? 6.5 : (inPos ? 7.5 : 9);
    openBase -= Math.max(0, 3 - nOpp) * 0.5;
    if (oppLooseAvg > 0.25) openBase -= 0.7;
    var premium = score >= 13 || (isPair && hiH >= 12) || (hiH === 14 && loH === 13);
    var strong = score >= 11 || (isPair && hiH >= 10);

    if (toCall <= 0) {
      var limpers = 0;
      for (var li = 0; li < state.actions.length; li++) {
        if (state.actions[li].street === 'preflop' && state.actions[li].type === 'call') limpers++;
      }
      var openSize = Math.floor(bb * 2.5) + limpers * bb;
      if (headsUp) openSize = Math.floor(bb * 2.5);
      if (eff <= 22 && strong) {
        if (state.canAllIn && (premium || rnd() < 0.3)) return { type: 'allin' };
      }
      var canOpen = premium || strong || score >= openBase || (headsUp && (isPair || suited || hiH >= 11 || (hiH >= 9 && hiH - loH <= 3) || (hiH >= 7 && hiH - loH <= 1)));
      if (limpers > 0) {
        var iso = premium || strong || (isPair && hiH >= 7) || score >= openBase - 0.5;
        if (iso) return shoveOrRaise(Math.max(state.minRaiseTo || 0, state.currentBet + openSize + bb));
        return { type: 'check' };
      }
      if (canOpen) {
        if (state.minRaiseTo === null) return { type: 'check' };
        var tgt = Math.max(state.minRaiseTo, state.currentBet + openSize);
        if (premium && rnd() < 0.35) tgt = Math.max(tgt, state.currentBet + Math.floor(bb * 4));
        return shoveOrRaise(tgt);
      }
      return { type: 'check' };
    }

    if (premium) {
      if (isPair && hiH >= 13 && eff <= 30) {
        if (state.canAllIn && (commitFrac > 0.3 || toCall >= myTotal * 0.4)) return { type: 'allin' };
      }
      if (state.minRaiseTo !== null && toCall < myTotal * 0.35) {
        var rr = Math.max(state.minRaiseTo, state.currentBet + toCall + Math.floor((pot + toCall) * 0.8) + lastRaiseSize);
        if (hiH === 14 && loH === 14 && rnd() < 0.3) {
          if (!state.canCheck) return { type: 'call' };
          return { type: 'check' };
        }
        return shoveOrRaise(rr);
      }
      if (!state.canCheck) return { type: 'call' };
      return { type: 'check' };
    }

    var margin = 0.05 + 0.02 * Math.max(0, nOpp - 1) + icmTight - (inPos ? 0.015 : 0);
    if (headsUp) margin = 0.01 + icmTight;
    if (oppAggro > 0) margin += 0.03;
    if (preflopRaises >= 2) margin += 0.06;
    else if (preflopRaises >= 1 && !strong) margin += 0.02;

    var callCap = state.street === 'preflop' ? bb * (strong ? 25 : (inPos ? 9 : 6)) : 0;
    if (oppLooseAvg > 0.3) callCap *= 1.4;
    if (commitFrac < 0.03) margin -= 0.05;
    if (toCall <= bb && eq > (headsUp ? 0.28 : 0.32)) {
      if (!state.canCheck) return { type: 'call' };
      return { type: 'check' };
    }
    if (eq >= potOdds + margin && toCall <= Math.max(callCap, pot * (strong ? 1.2 : 0.45))) {
      if (strong && state.minRaiseTo !== null && preflopRaises === 1 && toCall <= myTotal * 0.18 && rnd() < (stickyOpp(state, you.id) ? 0.65 : 0.4)) {
        return shoveOrRaise(Math.max(state.minRaiseTo, state.currentBet + toCall + Math.floor((pot + toCall) * 0.7) + lastRaiseSize));
      }
      if (!state.canCheck) return { type: 'call' };
      return { type: 'check' };
    }
    if (!state.canCheck && commitFrac > 0.4 && eq > 0.4) return { type: 'call' };
    return { type: state.canCheck ? 'check' : 'fold' };
  }

  /* ---------- POSTFLOP ---------- */
  var iters = state.street === 'river' ? 240 : state.street === 'turn' ? 200 : 170;
  var eqp = mcEquity(iters);
  var madeRank = -1;
  var madeBest = null;
  try {
    var ev = PokerEngine.evaluate(hole.concat(board));
    madeRank = ev.rank;
    madeBest = ev;
  } catch (e) {}
  var boardRank = -1;
  try {
    if (board.length >= 5) boardRank = PokerEngine.evaluate(board).rank;
  } catch (e) {}
  var playingBoard = boardRank >= 2 && madeRank <= boardRank;
  var flushDraw = state.street !== 'river' && hasFlushDraw(hole, board);
  var oesd = state.street === 'flop' && hasOESD(hole, board);
  var gutOrOver = false;
  if (state.street === 'flop' && !flushDraw && !oesd && madeRank < 1) {
    var bHi = 0;
    for (var bi = 0; bi < board.length; bi++) {
      var br = rv(board[bi][0]);
      if (br > bHi) bHi = br;
    }
    if (hiH > bHi) gutOrOver = true;
  }
  var draw = flushDraw || oesd;

  var valueThr = 0.52 + 0.04 * nOpp;
  if (headsUp && nOpp === 1) valueThr = 0.52;
  var sticky = stickyOpp(state, you.id);
  if (sticky) valueThr -= 0.03;
  if (state.street === 'river') valueThr += 0.02;
  if (playingBoard) valueThr += 0.1;
  var monster = madeRank >= 5 || (madeRank === 4) || (madeRank === 3 && board.length >= 4) || eqp >= 0.8;

  var spr = myTotal / Math.max(1, pot);
  if (monster && spr < 2.5 && toCall < myTotal) {
    if (state.canAllIn && (toCall > 0 || state.minRaiseTo === null || rnd() < 0.5)) {
      if (toCall <= 0) {
        var sh = raiseTo(state, state.maxRaiseTo);
        if (sh && state.minRaiseTo !== null) return sh;
        if (state.canAllIn) return { type: 'allin' };
      } else {
        if (state.canAllIn) return { type: 'allin' };
        return { type: 'call' };
      }
    }
  }

  if (toCall <= 0) {
    var betEq = eqp;
    if (draw && eqp > 0.32) betEq = eqp + 0.03;
    var shouldBet = betEq >= valueThr || monster;
    if (!shouldBet && draw && eqp >= 0.38 && (inPos || nOpp === 1) && !sticky && rnd() < (inPos ? 0.75 : 0.45)) shouldBet = true;
    if (!shouldBet && state.street !== 'river' && gutOrOver && inPos && nOpp === 1 && madeRank < 1 && !sticky && rnd() < 0.35) shouldBet = true;
    if (!shouldBet && state.street === 'river' && inPos && nOpp === 1 && oppLooseAvg < 0.25 && !sticky && rnd() < 0.07 && !playingBoard) shouldBet = true;
    if (!shouldBet && monster && nOpp === 1 && !inPos && rnd() < 0.3) shouldBet = false;
    if (shouldBet) {
      if (state.minRaiseTo === null) return { type: 'check' };
      var frac = monster ? 0.7 : (eqp >= valueThr + 0.12 ? 0.7 : 0.55);
      if (sticky && eqp >= valueThr) frac = Math.min(1.0, frac + 0.25);
      if (draw && eqp < valueThr) frac = 0.5;
      if (state.street === 'river' && eqp < valueThr) frac = 0.5;
      var b = sizeBet(frac, 0.5);
      if (b) return b;
      return { type: 'check' };
    }
    return { type: 'check' };
  }

  var mg = 0.035 + 0.02 * Math.max(0, nOpp - 1) + icmTight - (inPos ? 0.015 : 0);
  if (raisesThisStreet > 0) mg += 0.04;
  var maxOppAggro = 0;
  for (var gi = 0; gi < state.seats.length; gi++) {
    var gs = state.seats[gi];
    if (gs.id !== you.id && !gs.out && !gs.folded) {
      var ga = handAggression(state, gs.id);
      if (ga > maxOppAggro) maxOppAggro = ga;
    }
  }
  if (maxOppAggro >= 3) mg -= 0.05;
  if (playingBoard) mg += 0.08;
  if (state.street === 'river') mg += 0.01;
  if (commitFrac < 0.02) mg -= 0.04;

  if (eqp >= Math.max(valueThr + 0.16, 0.7) || monster) {
    if (state.minRaiseTo !== null && toCall < myTotal * 0.5) {
      if (spr < 3 && state.canAllIn && eqp > 0.65) return { type: 'allin' };
      var vraise = raiseTo(state, you.bet + toCall + Math.floor((pot + toCall) * 0.65) + Math.floor(bb / 2));
      if (vraise) return vraise;
    }
    if (!state.canCheck) return { type: 'call' };
    return { type: 'check' };
  }
  if (draw && eqp >= 0.35 && nOpp === 1 && !sticky && state.minRaiseTo !== null && toCall <= pot * 0.6 && toCall < myTotal * 0.25 && rnd() < 0.3) {
    var sbr = raiseTo(state, you.bet + toCall + Math.floor((pot + toCall) * 0.55));
    if (sbr) return sbr;
  }
  if (eqp >= potOdds + mg) {
    if (!state.canCheck) return { type: 'call' };
    return { type: 'check' };
  }
  if (!state.canCheck && commitFrac > 0.45 && eqp > 0.35) return { type: 'call' };
  return { type: state.canCheck ? 'check' : 'fold' };
}

module.exports = {
  name: 'Astra Forge',
  botName: 'Astra Forge',
  act: function (state) {
    try {
      var res = decide(state);
      if (!res || typeof res !== 'object') {
        return state.canCheck ? { type: 'check' } : { type: 'fold' };
      }
      var t = res.type;
      if (t === 'fold') return { type: 'fold' };
      if (t === 'check') return state.canCheck ? { type: 'check' } : { type: 'fold' };
      if (t === 'call') {
        if (state.canCheck) return { type: 'check' };
        return { type: 'call' };
      }
      if (t === 'allin') {
        if (state.canAllIn) return { type: 'allin' };
        if (state.canCheck) return { type: 'check' };
        return { type: 'fold' };
      }
      if (t === 'raise') {
        var amt = Math.floor(res.amount);
        if (state.minRaiseTo === null || !(amt > state.currentBet) || amt > state.maxRaiseTo) {
          if (state.canCheck) return { type: 'check' };
          if (state.toCall <= 0) return { type: 'fold' };
          return { type: 'call' };
        }
        if (amt < state.minRaiseTo) {
          if (state.maxRaiseTo < state.minRaiseTo) {
            if (state.canAllIn) return { type: 'allin' };
            if (state.canCheck) return { type: 'check' };
            return { type: 'call' };
          }
          amt = state.minRaiseTo;
        }
        return { type: 'raise', amount: amt };
      }
      return state.canCheck ? { type: 'check' } : { type: 'fold' };
    } catch (e) {
      try {
        return state.canCheck ? { type: 'check' } : { type: 'fold' };
      } catch (e2) {
        return { type: 'fold' };
      }
    }
  }
};
