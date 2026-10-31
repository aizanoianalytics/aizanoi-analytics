'use strict';

module.exports = {
  name: 'Aras',
  act: function act(state) {
    try {
      return decide(state);
    } catch (e) {
      return state.canCheck ? { type: 'check' } : { type: 'fold' };
    }
  }
};

var RANKS = '23456789TJQKA';

function rankOf(card) { return RANKS.indexOf(card[0]) + 2; }

function hash32(n) {
  n = n >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507);
  n = Math.imul(n ^ (n >>> 13), 3266489909);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function decide(state) {
  var you = state.you;
  var hole = you.cards;
  var board = state.board;
  var street = state.street;
  var stack = you.stack;
  var toCall = state.toCall;
  var cur = state.currentBet;
  var bb = state.blinds[1];
  if (!(bb > 0)) bb = 100;

  var live = [];
  var i, s;
  for (i = 0; i < state.seats.length; i++) {
    s = state.seats[i];
    if (!s.out) live.push(s);
  }
  var opps = [];
  for (i = 0; i < live.length; i++) {
    if (live[i].id !== you.id && !live[i].folded) opps.push(live[i]);
  }
  var nOpp = opps.length;
  var liveCount = live.length;
  var headsUp = liveCount === 2;

  var pot = 0;
  for (i = 0; i < state.pots.length; i++) pot += state.pots[i].amount;

  // Position: distance left of button among live seats. Larger = later.
  var n = state.seats.length;
  var myDist = (you.seat - state.buttonSeat - 1 + n * 2) % n;
  var maxDist = 0;
  for (i = 0; i < live.length; i++) {
    var d = (live[i].seat - state.buttonSeat - 1 + n * 2) % n;
    if (d > maxDist) maxDist = d;
  }
  var onButton = you.seat === state.buttonSeat;
  var late = onButton || myDist >= maxDist - 1;
  var early = !headsUp && !late && myDist < maxDist - 3;

  // Current-hand aggression read.
  var raises = 0, limpers = 0, aggIds = {};
  for (i = 0; i < state.actions.length; i++) {
    var a = state.actions[i];
    if (a.id === you.id) continue;
    if (a.street !== street) continue;
    if (a.type === 'raise') { raises++; aggIds[a.id] = 1; }
    else if (a.type === 'allin' && a.amount > 0) { raises++; aggIds[a.id] = 1; }
    else if (a.type === 'call') limpers++;
  }

  // Table looseness from public history: frequent showdowns => stations.
  var sdHands = 0, sdTotal = 0;
  for (i = 0; i < state.history.length; i++) {
    sdTotal++;
    if (state.history[i].showdown && state.history[i].showdown.length > 1) sdHands++;
  }
  var stationTable = sdTotal >= 4 && sdHands / sdTotal > 0.55;

  // Tournament pressure.
  var totalChips = 0;
  for (i = 0; i < live.length; i++) totalChips += live[i].stack;
  var avg = totalChips / Math.max(1, liveCount);
  var mBB = stack / bb;
  var handsLeft = (state.tournament.maxHands || 300) - state.handNumber;
  var desperate = handsLeft < 25 && stack < avg * 0.7;
  var covered = false;
  for (i = 0; i < opps.length; i++) {
    if (opps[i].stack + opps[i].bet + opps[i].total > stack + you.bet + you.total) { covered = true; break; }
  }

  if (nOpp === 0) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'call' };
  }

  if (street === 'preflop') {
    return preflop(state, you, hole, pot, bb, stack, toCall, cur, mBB, late, early,
      onButton, headsUp, nOpp, raises, limpers, desperate, covered, avg);
  }
  return postflop(state, you, hole, board, street, pot, bb, stack, toCall, cur,
    mBB, late, onButton, headsUp, nOpp, raises, stationTable, desperate, covered);
}

// ---------------- preflop ----------------

function chenScore(hole) {
  var hi = Math.max(rankOf(hole[0]), rankOf(hole[1]));
  var lo = Math.min(rankOf(hole[0]), rankOf(hole[1]));
  var base;
  if (hi === 14) base = 10;
  else if (hi === 13) base = 8;
  else if (hi === 12) base = 7;
  else if (hi === 11) base = 6;
  else base = hi / 2;
  var score;
  if (hi === lo) {
    score = base * 2;
    if (score < 5) score = 5;
  } else {
    score = base;
    if (hole[0][1] === hole[1][1]) score += 2;
    var gap = hi - lo - 1;
    if (gap === 0) { if (hi < 12) score += 1; }
    else if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else score -= 5;
    if (gap <= 1 && hi < 12) score += 1;
  }
  return score;
}

function preflop(state, you, hole, pot, bb, stack, toCall, cur, mBB, late, early,
    onButton, headsUp, nOpp, raises, limpers, desperate, covered, avg) {
  var chen = chenScore(hole);
  var hi = Math.max(rankOf(hole[0]), rankOf(hole[1]));
  var lo = Math.min(rankOf(hole[0]), rankOf(hole[1]));
  var pair = hi === lo;
  var open = cur <= bb && raises === 0;

  // Pot odds call helper uses raw chen-implied continue threshold.
  var odds = toCall > 0 ? toCall / Math.max(1, pot + toCall) : 0;

  // ---- short stack: push / fold ----
  if (mBB <= 12) {
    var pushBar = open ? (headsUp ? 4.5 : late ? 6.5 : onButton ? 6.5 : 8) : 0;
    if (desperate) pushBar -= 1.5;
    if (open) {
      if (chen >= pushBar) return goAllin(state);
      if (state.canCheck) return { type: 'check' };
      // In blinds facing a shove/raise: call tight, wider when priced in.
      if (toCall >= stack) {
        var need = toCall / Math.max(1, pot + toCall) + (covered && !desperate ? 0.04 : 0);
        var eq = mcEquity(hole, [], 1, 120, state.handNumber);
        if (eq > need + 0.02) return goAllin(state);
        return { type: 'fold' };
      }
      if (chen >= 9 || odds < 0.18) return { type: 'call' };
      return { type: 'fold' };
    }
    // Facing a raise short: shove premiums & good aces/pairs, else fold.
    var facingAllin = toCall >= stack * 0.7;
    if (headsUp && facingAllin) {
      if (pair || hi === 14 || chen >= 7 || odds < 0.3) return goAllin(state);
      return { type: 'fold' };
    }
    var shoveChen = nOpp > 2 ? 10.5 : 9;
    if (desperate) shoveChen -= 1.5;
    if (chen >= 12.5 || (chen >= shoveChen && (pair || hi === 14))) {
      if (toCall >= stack) return goAllin(state);
      if (state.minRaiseTo !== null && state.minRaiseTo < state.maxRaiseTo) return goAllin(state);
      return { type: 'call' };
    }
    if (state.canCheck) return { type: 'check' };
    if (odds < 0.12 && chen >= 7) return { type: 'call' };
    return { type: 'fold' };
  }

  // ---- normal stacks ----
  if (open) {
    var bar = headsUp ? 3.5 : late ? 7.5 : early ? 9.5 : 8.5;
    if (desperate) bar -= 1;
    if (state.canCheck && cur <= bb && toCall <= 0) {
      // BB option, nobody raised: raise premiums, else check.
      if (chen >= 12) return makeRaise(state, bb * 3.5 + limpers * bb);
      return { type: 'check' };
    }
    if (chen >= bar || (late && chen >= 6.5 && limpers > 0)) {
      var openTo = Math.round(bb * (headsUp ? 2.2 : late ? 2.5 : 3)) + limpers * bb;
      if (chen >= 13) openTo = Math.round(openTo * 1.15);
      return makeRaise(state, openTo);
    }
    if (state.canCheck) return { type: 'check' };
    // Facing limpers only with a speculative hand and good price: limp along.
    if (odds < 0.2 && (pair || hi === 14 || (hole[0][1] === hole[1][1] && hi >= 10))) {
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  // Facing raise(s).
  if (headsUp && raises === 1 && cur <= bb * 4) {
    // BB vs button open: 3-bet strong, defend wide with position/price.
    if (chen >= 11.5) {
      var hu3 = Math.round(cur * 3.2);
      if (hu3 >= stack * 0.4) return goAllin(state);
      var hr = makeRaise(state, hu3);
      if (hr.type === 'raise' || hr.type === 'allin') return hr;
    }
    if (state.canCheck) return { type: 'check' };
    if (chen >= 4.5 || odds < 0.3 || toCall <= bb) return { type: 'call' };
    return { type: 'fold' };
  }
  if (raises >= 2 && chen < 13) {
    if (state.canCheck) return { type: 'check' };
    if (odds < 0.14 && (pair && hi >= 7)) return { type: 'call' }; // set mine
    return { type: 'fold' };
  }
  // 3-bet premiums (and late resteals vs a lone steal).
  var stealSpot = late && raises === 1 && cur <= Math.round(bb * 3.2);
  if (chen >= 13 || (stealSpot && chen >= 11.5 && !stationTable)) {
    var threeTo = Math.round(cur * 3) + limpers * bb;
    if (threeTo >= stack * 0.4) return goAllin(state);
    var r = makeRaise(state, threeTo);
    if (r.type === 'raise' || r.type === 'allin') return r;
  }
  if (state.canCheck) return { type: 'check' };
  // Calls: pairs & suited/connected & big aces when stacks allow implied odds.
  var effStack = stack;
  var callFrac = toCall / Math.max(1, effStack);
  var spec = pair || hi === 14 || (hole[0][1] === hole[1][1]) || (hi - lo <= 2 && hi >= 10);
  if (pair && hi >= 5 && callFrac <= 0.12) return { type: 'call' }; // set mine
  var eqPre = mcEquity(hole, [], Math.min(nOpp, 3), 100, state.handNumber) - 0.08;
  var margin = covered && mBB < 30 ? 0.04 : 0.02;
  if ((eqPre > odds + margin && callFrac <= 0.14 && (spec || odds < 0.25)) ||
      (odds < 0.16 && chen >= 7.5)) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}

// ---------------- postflop ----------------

function analyze(hole, board) {
  var cards = hole.concat(board);
  var made = PokerEngine.evaluate(cards);
  var suits = {};
  var i;
  for (i = 0; i < cards.length; i++) suits[cards[i][1]] = (suits[cards[i][1]] || 0) + 1;
  var flushDraw = false, flushMade = false;
  for (var k in suits) {
    if (suits[k] === 4) flushDraw = true;
    if (suits[k] >= 5) flushMade = true;
  }
  var ranks = [];
  for (i = 0; i < cards.length; i++) {
    var r = rankOf(cards[i]);
    if (ranks.indexOf(r) < 0) ranks.push(r);
  }
  ranks.sort(function (x, y) { return y - x; });
  // Open-ender / gutshot on 4-5 card boards.
  var present = {};
  for (i = 0; i < ranks.length; i++) present[ranks[i]] = 1;
  if (present[14]) present[1] = 1;
  var oesd = false, gut = false;
  for (var high = 14; high >= 5; high--) {
    var have = 0, missing = 0;
    for (var o = 0; o < 5; o++) {
      if (present[high - o]) have++; else missing++;
    }
    if (have === 4 && missing === 1) {
      // missing an end card => open-ender (approx; middle-missing counts as gut)
      var missEnd = !present[high] || !present[high - 4];
      if (missEnd) oesd = true; else gut = true;
    }
  }
  var bRanks = [];
  for (i = 0; i < board.length; i++) bRanks.push(rankOf(board[i]));
  bRanks.sort(function (x, y) { return y - x; });
  var hi = Math.max(rankOf(hole[0]), rankOf(hole[1]));
  var lo = Math.min(rankOf(hole[0]), rankOf(hole[1]));
  var top = bRanks[0] || 0;
  var pairType = null;
  if (made.rank === 1) {
    if (hi === lo) pairType = hi > top ? 'over' : (hi === top ? 'topPocket' : (hi > (bRanks[1] || 0) ? 'second' : 'under'));
    else if (hi === top || lo === top) pairType = 'top';
    else if (hi === (bRanks[1] || 0) || lo === (bRanks[1] || 0)) pairType = 'second';
    else pairType = 'under';
  }
  var overcards = 0;
  if (hi > top) overcards++;
  if (lo > top && lo !== hi) overcards++;
  return {
    made: made, flushDraw: flushDraw && !flushMade, flushMade: flushMade,
    oesd: oesd, gutshot: gut && !oesd, pairType: pairType, top: top, hi: hi, lo: lo
  };
}

function boardDry(board) {
  // Dry: unconnected high board, no 3-flush, no pair.
  var i, suits = {}, ranks = [];
  for (i = 0; i < board.length; i++) {
    suits[board[i][1]] = (suits[board[i][1]] || 0) + 1;
    ranks.push(rankOf(board[i]));
  }
  for (var k in suits) if (suits[k] >= 3) return false;
  ranks.sort(function (x, y) { return x - y; });
  for (i = 1; i < ranks.length; i++) if (ranks[i] === ranks[i - 1]) return false;
  var span = ranks[ranks.length - 1] - ranks[0];
  return span >= 5;
}

function postflop(state, you, hole, board, street, pot, bb, stack, toCall, cur,
    mBB, late, onButton, headsUp, nOpp, raises, stationTable, desperate, covered) {
  var eq;
  if (street === 'river') {
    eq = nOpp === 1 ? exactRiver(hole, board) : mcEquity(hole, board, Math.min(nOpp, 4), 160, state.handNumber);
  } else {
    var iters = nOpp <= 1 ? 180 : nOpp === 2 ? 130 : nOpp <= 4 ? 90 : 60;
    eq = mcEquity(hole, board, Math.min(nOpp, 8), iters, state.handNumber + street.length * 7919);
  }
  var an = analyze(hole, board);
  var rank = an.made.rank;

  var monster = rank >= 3 ||
    (rank === 2 && street !== 'river') ||
    (rank === 1 && (an.pairType === 'over' || an.pairType === 'topPocket')) ||
    (an.flushMade && rank >= 5);
  var strongDraw = (an.flushDraw && (an.oesd || an.pairType === 'top' || an.pairType === 'over' || an.overcards === 2)) ||
    (an.flushDraw && an.made.rank === 1);

  // Range discount: bettor is stronger than random.
  var discount = street === 'river' ? 0.06 : street === 'turn' ? 0.05 : 0.04;
  discount += Math.max(0, nOpp - 1) * 0.02;
  if (raises >= 2) discount += 0.03;

  // ---- no bet to face ----
  if (state.canCheck) {
    var betBar = headsUp ? 0.55 : nOpp === 2 ? 0.6 : 0.66;
    if (stationTable) betBar -= 0.03; // value wider, bluff never
    if (desperate) betBar -= 0.04;
    if (monster || eq > betBar || (strongDraw && (headsUp || eq > 0.5))) {
      var frac = an.flushDraw || an.oesd ? 0.75 : 0.62;
      if (board.length >= 4 && (an.flushDraw)) frac = 0.8;
      var size = Math.max(bb, Math.floor(pot * frac));
      return makeRaise(state, you.bet + size);
    }
    // Position bluff on dry boards, heads-up only, vs non-stations.
    if (!stationTable && headsUp && (late || onButton) && street !== 'preflop' &&
        boardDry(board) && rank <= 1 && !an.flushDraw && !an.oesd &&
        hash32(state.handNumber * 31 + holeRankHash(hole) * 101 + board.length) < (street === 'river' ? 0.22 : 0.16)) {
      return makeRaise(state, you.bet + Math.max(bb, Math.floor(pot * 0.55)));
    }
    return { type: 'check' };
  }

  // ---- facing a bet ----
  var odds = toCall / Math.max(1, pot + toCall);
  var eqAdj = eq - discount;
  var drawCredit = (an.flushDraw || an.oesd) && stack > toCall + pot ? 0.02 : 0;
  var need = odds + (nOpp >= 3 ? 0.03 : 0.02) - drawCredit;
  if (desperate) need -= 0.03;
  var allinCall = toCall >= stack;
  if (allinCall && covered && mBB > 15 && !desperate) need += 0.04; // ICM: don't bust marginal

  // Commitment: big pot, small remainder => go with strong equity.
  var spr = stack / Math.max(1, pot);
  if (spr < 1 && eqAdj > 0.45) {
    if (state.canAllIn) return { type: 'allin' };
    return { type: 'call' };
  }

  var raiseBar = headsUp ? 0.64 : nOpp === 2 ? 0.7 : 0.76;
  var wantRaise = monster || eqAdj > raiseBar || (strongDraw && headsUp && eq > 0.52 && raises === 0);
  // Don't slow-play into scary multiway boards with one pair.
  if (wantRaise && state.minRaiseTo !== null) {
    if (allinCall || toCall > stack * 0.35) {
      if (eqAdj > need) return goAllin(state);
    } else {
      var extra = Math.max(state.lastFullRaise * 2, Math.floor(pot * 0.7));
      var target = you.bet + toCall + extra;
      if (target >= state.maxRaiseTo * 0.85) {
        if (eqAdj > need) return goAllin(state);
      } else {
        return makeRaise(state, target);
      }
    }
  }

  if (eqAdj >= need) {
    if (allinCall) return goAllin(state);
    return { type: 'call' };
  }
  return { type: 'fold' };
}

function holeRankHash(hole) {
  return rankOf(hole[0]) * 20 + rankOf(hole[1]) + (hole[0][1] === hole[1][1] ? 3 : 0);
}

function mcEquity(hole, board, opponents, iterations, seedNum) {
  try {
    var seed = (seedNum >>> 0) * 2654435761 + holeRankHash(hole) * 97 + board.length * 13 + opponents;
    var rnd = PokerEngine.rng(seed >>> 0);
    return PokerEngine.equity(hole, board, Math.max(0, Math.min(8, opponents)), iterations, rnd);
  } catch (e) {
    return 0.3;
  }
}

function exactRiver(hole, board) {
  try {
    var hero = PokerEngine.evaluate(hole.concat(board)).value;
    var used = {};
    var i;
    for (i = 0; i < hole.length; i++) used[hole[i]] = 1;
    for (i = 0; i < board.length; i++) used[board[i]] = 1;
    var deck = [];
    var r, s;
    for (r = 0; r < RANKS.length; r++) {
      var suits = 'cdhs';
      for (s = 0; s < 4; s++) {
        var c = RANKS[r] + suits[s];
        if (!used[c]) deck.push(c);
      }
    }
    var win = 0, tie = 0, total = 0;
    var runout = board;
    for (var a = 0; a < deck.length; a++) {
      for (var b = a + 1; b < deck.length; b++) {
        var v = PokerEngine.evaluate([deck[a], deck[b]].concat(runout)).value;
        total++;
        if (v < hero) win++;
        else if (v === hero) tie++;
      }
    }
    if (!total) return 0.5;
    return (win + tie * 0.5) / total;
  } catch (e) {
    return 0.5;
  }
}

function goAllin(state) {
  if (state.canAllIn) return { type: 'allin' };
  if (state.canCheck) return { type: 'check' };
  if (state.toCall <= 0) return { type: 'fold' };
  return { type: 'call' };
}

function makeRaise(state, target) {
  if (state.minRaiseTo === null) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'fold' };
  }
  var t = Math.floor(target);
  if (t < state.minRaiseTo) t = state.minRaiseTo;
  if (t >= state.maxRaiseTo) return goAllin(state);
  if (t <= state.currentBet) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'call' };
  }
  return { type: 'raise', amount: t };
}
