'use strict';
/* Luna Hold'em: tight-aggressive, position-aware, short-stack push/fold, pot-odds + MC equity postflop, adaptive vs opponent stats. */
module.exports = {
  name: 'Luna Edge',
  act(state) {
    try {
      return decide(state);
    } catch (e) {
      return state.canCheck ? { type: 'check' } : { type: 'fold' };
    }
  }
};

var STATS = {}; // opp id -> {hands, vpip, pfr, agg}
var LAST_HAND = 0;

function decide(s) {
  track(s);
  var bb = s.blinds[1] || 100;
  var sb = s.blinds[0] || 50;
  var pot = 0;
  for (var i = 0; i < s.pots.length; i++) pot += s.pots[i].amount;
  var toCall = s.toCall || 0;
  var myStack = s.you.stack;
  var myBet = s.you.bet;
  var myTotal = myStack + myBet;
  var live = s.seats.filter(function (p) { return !p.out; });
  var oppsInHand = s.seats.filter(function (p) { return p.id !== s.you.id && !p.out && !p.folded; });
  var nOpp = oppsInHand.length;
  var nLive = live.length;
  if (nOpp === 0) return s.canCheck ? { type: 'check' } : { type: 'call' };

  var effOpp = 0;
  for (var k = 0; k < oppsInHand.length; k++) {
    var o = oppsInHand[k];
    var ost = o.stack + o.bet;
    if (k === 0 || ost < effOpp) effOpp = ost;
  }
  var eff = Math.min(myTotal, effOpp);
  var effBB = eff / bb;
  var myBB = myTotal / bb;
  var toCallBB = toCall / bb;
  // position: distance after button
  var n = s.seats.length;
  var myDist = (s.you.seat - s.buttonSeat + n) % n;
  var maxDist = 0, lateCount = 0;
  for (var j = 0; j < s.seats.length; j++) {
    var p = s.seats[j];
    if (p.out || p.folded || p.id === s.you.id) continue;
    var d = (p.seat - s.buttonSeat + n) % n;
    if (d > maxDist) maxDist = d;
    if (d > myDist) lateCount++;
  }
  var isButton = s.you.seat === s.buttonSeat;
  var position = (isButton || lateCount === 0) ? 2 : (lateCount <= Math.max(1, Math.floor(nOpp / 2)) || myDist > n / 2 ? 1 : 0); // 0 early 1 mid 2 late
  var closing = lateCount === 0;

  // tournament end pressure: chip rank
  var myChips = myTotal;
  var poorer = 0, richer = 0;
  for (var q = 0; q < s.seats.length; q++) {
    var t = s.seats[q];
    if (t.out || t.id === s.you.id) continue;
    var c = t.stack + t.bet + t.total;
    if (c < myChips) poorer++; else richer++;
  }
  var endGame = s.tournament && s.tournament.maxHands ? (s.tournament.maxHands - s.handNumber) <= 25 : false;
  var desperate = endGame && richer > 0 && (poorer / Math.max(1, nLive - 1)) < 0.4;
  var comfortable = endGame && poorer >= richer + 1;

  if (s.street === 'preflop') return preflop(s, bb, sb, pot, toCall, toCallBB, effBB, myBB, myTotal, nOpp, nLive, position, isButton, closing, desperate, comfortable);
  return postflop(s, bb, pot, toCall, effBB, myTotal, nOpp, position, closing, desperate, comfortable);
}

// ---------- opponent tracking (module memory, bounded) ----------
function track(s) {
  if (s.handNumber !== LAST_HAND) {
    LAST_HAND = s.handNumber;
    // mark hands seen for players dealt in (not out)
    for (var i = 0; i < s.seats.length; i++) {
      var p = s.seats[i];
      if (p.out) continue;
      var st = STATS[p.id] || (STATS[p.id] = { hands: 0, vpip: 0, pfr: 0, agg: 0, seen: 0 });
      if (s.street === 'preflop' && s.actions.length === 0) { st.hands++; }
    }
  }
  // scan current-hand preflop actions for vpip/pfr (approx, idempotent-ish: recount capped)
  // cheap: only update on preflop streets using actions list, mark counted via index
  for (var a = 0; a < s.actions.length; a++) {
    var act = s.actions[a];
    if (act.street !== 'preflop') continue;
    var key = s.handNumber + ':' + a;
    var st2 = STATS[act.id];
    if (!st2) continue;
    if (st2['c' + key]) continue;
    st2['c' + key] = 1;
    if (act.type === 'call' || act.type === 'allin') st2.vpip++;
    if (act.type === 'raise' || act.type === 'allin') { st2.vpip++; st2.pfr++; }
    if (act.type === 'raise') st2.agg++;
  }
  // prune dynamic keys if too many
  var ids = Object.keys(STATS);
  if (ids.length > 9) { for (var x = 0; x < ids.length - 9; x++) delete STATS[ids[x]]; }
}

function oppTight(id) { // returns -1 loose, 0 unknown, 1 tight
  var st = STATS[id];
  if (!st || st.hands < 8) return 0;
  var v = st.vpip / Math.max(1, st.hands);
  var r = st.pfr / Math.max(1, st.hands);
  if (v < 0.18 && r < 0.10) return 1;
  if (v > 0.38 || r > 0.24) return -1;
  return 0;
}

function raiserTight(s) {
  // tightness of the opponent who made last aggressive action this street
  for (var i = s.actions.length - 1; i >= 0; i--) {
    var a = s.actions[i];
    if (a.street !== s.street) break;
    if ((a.type === 'raise' || a.type === 'allin') && a.id !== s.you.id) return oppTight(a.id);
  }
  return 0;
}

// ---------- preflop ----------
function preflop(s, bb, sb, pot, toCall, toCallBB, effBB, myBB, myTotal, nOpp, nLive, pos, isButton, closing, desperate, comfortable) {
  var cards = s.you.cards;
  var R = '23456789TJQKA';
  var r1 = R.indexOf(cards[0][0]) + 2, r2 = R.indexOf(cards[1][0]) + 2;
  var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  var pair = r1 === r2;
  var suited = cards[0][1] === cards[1][1];
  var gap = hi - lo - 1;
  var ace = hi === 14;

  // Chen-ish base score -> tier 0..7
  var tier;
  if (pair) tier = hi >= 13 ? 7 : hi === 12 ? 6 : hi >= 9 ? 5 : hi >= 6 ? 4 : 3;
  else if (hi === 14 && lo === 13) tier = suited ? 7 : 6;
  else if (hi === 14 && lo >= 10) tier = suited ? 6 : (lo >= 12 ? 6 : 5);
  else if (hi === 14 && lo >= 7) tier = suited ? 5 : 3;
  else if (hi === 14) tier = suited ? 4 : 2;
  else if (hi === 13 && lo === 12) tier = suited ? 6 : 5;
  else if (hi === 13 && lo >= 10) tier = suited ? 5 : 4;
  else if (hi === 13 && lo >= 8) tier = suited ? 4 : 2;
  else if (hi === 12 && lo === 11) tier = suited ? 5 : 4;
  else if (hi >= 11 && lo >= 9 && gap <= 1) tier = suited ? 4 : 3;
  else if (suited && hi >= 12) tier = 3;
  else if (!suited && hi >= 12 && lo >= 9) tier = 3;
  else if (suited && gap <= 1 && hi >= 8) tier = 3;
  else if (hi >= 11 && lo >= 7) tier = 2;
  else if (suited && ace) tier = 2;
  else tier = hi + lo >= 18 ? 2 : (hi >= 10 && gap <= 2 ? 1 : 0);

  var facing = toCall > 0 && !s.canCheck;
  var openPot = !facing; // nobody bet (BB checking option counts as facing 0)
  var short = effBB <= 12;
  var micro = effBB <= 6;

  // loosen/tighten by position and table size and endgame
  var posBonus = pos === 2 ? 1 : pos === 1 ? 0 : -0.5;
  if (nLive <= 3) posBonus += 0.7;
  else if (nLive <= 5) posBonus += 0.3;
  if (desperate) posBonus += 1;
  if (comfortable) posBonus -= 0.3;
  var adj = tier + posBonus;

  // --- short-stack push/fold ---
  if (short) {
    var jamNeed = micro ? 1.2 : 2.2; // adj threshold to shove first-in
    if (!facing) {
      // first in: shove wide, more so late/short-handed/desperate
      if (adj >= jamNeed && s.canAllIn) return { type: 'allin' };
      if (adj >= jamNeed - 0.4 && s.minRaiseTo !== null && tier >= 4) return raiseTo(s, pot, toCall, bb, 2.2);
      return s.canCheck ? { type: 'check' } : { type: 'fold' };
    }
    // facing bet/shove: call shove with tier-based range on odds
    var potOdds = toCall / Math.max(1, pot + toCall);
    var need = 0.32 + toCallBB * 0.008;
    if (pos === 0) need += 0.03;
    if (raiserTight(s) === 1) need += 0.06;
    if (raiserTight(s) === -1) need -= 0.05;
    if (desperate) need -= 0.06;
    var eq = preflopEq(hi, lo, pair, suited, gap, nOpp);
    if (toCall >= myTotal - 1 || toCall >= s.you.stack) {
      // all-in call decision
      if (eq > need && adj >= 2.5) return { type: 'call' };
      if (micro && eq > need - 0.05 && adj >= 1.5) return { type: 'call' };
      return { type: 'fold' };
    }
    // facing non-allin raise while short: shove over with strong, else fold
    if (s.canAllIn && adj >= 4 && tier >= 4) return { type: 'allin' };
    if (eq > potOdds + 0.08 && toCallBB <= 3 && tier >= 3) return { type: 'call' };
    return { type: 'fold' };
  }

  // --- deep/mid stack ---
  if (openPot) {
    if (s.canCheck) {
      // BB option or checked to us: raise strong for value, else check
      if (tier >= 5 && s.minRaiseTo !== null) return raiseTo(s, pot, toCall, bb, 0.6);
      if (tier === 4 && (pos === 2 || s.minRaiseTo !== null) && s.minRaiseTo !== null && (pos === 2 || nOpp <= 3))
        return raiseTo(s, pot, toCall, bb, 0.55);
      return { type: 'check' };
    }
    // first to act (nobody opened): raise-or-fold, no open limp
    var openNeed = pos === 2 ? 2.0 : pos === 1 ? 2.6 : 3.2;
    if (nLive <= 3) openNeed -= 1.0;
    else if (nLive <= 5) openNeed -= 0.4;
    if (desperate) openNeed -= 0.8;
    if (comfortable && pos === 0) openNeed += 0.3;
    if (adj >= openNeed && s.minRaiseTo !== null) {
      var mult = tier >= 6 ? 0.7 : 0.55;
      return raiseTo(s, pot, toCall, bb, mult, 2.5, 3.5);
    }
    return { type: 'fold' };
  }

  // facing a raise
  var rt = raiserTight(s);
  // 3-bet premiums
  var premium = pair && hi >= 11 || (hi === 14 && lo === 13) || (hi === 14 && lo >= 12) || (pair && hi >= 10 && pos === 2);
  if (premium && s.minRaiseTo !== null) {
    // bigger 3-bet vs loose, shove if eff short-ish
    if (effBB < 25 && tier >= 6 && s.canAllIn && (toCallBB >= effBB * 0.3 || micro)) return { type: 'allin' };
    return raiseTo(s, pot, toCall, bb, 0.75, 3, 4);
  }
  // 3-bet bluff vs late raisers with blockers, sparingly
  if (s.minRaiseTo !== null && effBB > 20 && toCallBB <= 3.5 && closing && ace && lo <= 9 && rt !== 1) {
    if (hash01(s.handNumber, s.you.seat) < 0.12) return raiseTo(s, pot, toCall, bb, 0.7, 3, 3.5);
  }
  var odds = toCall / Math.max(1, pot + toCall);
  var eq2 = preflopEq(hi, lo, pair, suited, gap, nOpp);
  var margin = 0.04 + toCallBB * 0.004;
  if (pos === 2 || closing) margin -= 0.015;
  if (rt === 1) margin += 0.05;
  else if (rt === -1) margin -= 0.03;
  if (toCallBB > 12) margin += 0.06; // big bets need real hands
  if (desperate) margin -= 0.03;
  // speculative multiway discount: small pairs/suited get odds
  if ((pair && hi <= 8) || (suited && gap <= 2 && hi <= 12)) margin -= 0.02;
  if (eq2 >= odds + margin && toCallBB <= (tier >= 5 ? 30 : tier >= 3 ? 10 : 5)) return { type: 'call' };
  // squeeze-call small opens in position wide-ish
  if (toCallBB <= 2.5 && (pos === 2) && tier >= 2 && eq2 + 0.02 >= odds) return { type: 'call' };
  return { type: 'fold' };
}

function preflopEq(hi, lo, pair, suited, gap, nOpp) {
  // rough hot/cold equity vs nOpp random hands
  var base;
  if (pair) base = 0.50 + (hi - 2) * 0.016 + 0.10; // 22 ~0.60? vs 1 — too high; scale below
  else base = (hi * 2 + lo) / 62 + (suited ? 0.025 : 0) - gap * 0.012;
  // normalize: AA ~0.85, KK ~0.82, QQ ~0.79, AKs ~0.67, T2o ~0.35 heads-up
  if (pair) base = 0.52 + (hi - 2) * 0.0275; // 22=0.52 ... AA=0.852
  else {
    base = 0.30 + hi * 0.014 + lo * 0.010 + (suited ? 0.03 : 0) - Math.min(4, gap) * 0.014 + (hi === 14 ? 0.02 : 0);
    if (hi === 14 && lo === 13) base = suited ? 0.67 : 0.65;
    else if (hi === 14 && lo === 12) base = suited ? 0.66 : 0.63;
  }
  if (nOpp <= 1) return clamp01(base);
  // multiway decay toward 1/(n+1)
  var w = 1 / (nOpp + 1);
  var k = Math.min(0.75, 0.30 + nOpp * 0.12);
  return clamp01(base * (1 - k) + w * k * (base / 0.5));
}

// ---------- postflop ----------
function postflop(s, bb, pot, toCall, effBB, myTotal, nOpp, pos, closing, desperate, comfortable) {
  var board = s.board;
  var cards = s.you.cards.concat(board);
  var me, bord = null;
  try { me = PokerEngine.evaluate(cards); } catch (e) { return s.canCheck ? { type: 'check' } : { type: 'fold' }; }
  if (board.length >= 5) { try { bord = PokerEngine.evaluate(board); } catch (e) { bord = null; } }
  var playingBoard = bord && me.value === bord.value;
  var cat = me.rank; // 0..8

  var R = '23456789TJQKA';
  var hr = cards.map(function (c) { return R.indexOf(c[0]) + 2; });
  var holeR = [R.indexOf(s.you.cards[0][0]) + 2, R.indexOf(s.you.cards[1][0]) + 2];
  var holeSuits = [s.you.cards[0][1], s.you.cards[1][1]];
  var boardSuits = board.map(function (c) { return c[1]; });
  var boardRanks = board.map(function (c) { return R.indexOf(c[0]) + 2; });

  // draw/overcard texture
  var flushDraw = false, overs = 0, straightDraw = false, gut = false;
  (function () {
    var cnt = {};
    var all = s.you.cards.concat(board);
    for (var i = 0; i < all.length; i++) cnt[all[i][1]] = (cnt[all[i][1]] || 0) + 1;
    // need exactly 4 of a suit including hole cards for a draw (not already flush)
    if (cat < 5) {
      for (var k in cnt) {
        if (cnt[k] === 4) {
          // at least one hole card of that suit
          if (holeSuits[0] === k || holeSuits[1] === k) flushDraw = true;
        }
      }
    }
    var bmax = Math.max.apply(null, boardRanks);
    for (var j = 0; j < 2; j++) if (holeR[j] > bmax) overs++;
    // straight draws using all 5-7 ranks
    var set = {};
    for (var q = 0; q < hr.length; q++) set[hr[q]] = 1;
    if (set[14]) set[1] = 1;
    var bestRun = 0, open = false;
    for (var lo = 1; lo <= 11; lo++) {
      var run = 0;
      for (var d = 0; d < 5; d++) if (set[lo + d]) run++;
      if (run === 4) {
        // open-ended if missing an end, else gutshot — need a hole card involved
        gut = true;
        var missLow = !set[lo], missHigh = !set[lo + 4];
        if ((missLow || missHigh)) {
          // check hole involvement crudely: any hole rank in window
          if (set[holeR[0]] && holeR[0] >= lo && holeR[0] <= lo + 4 || set[holeR[1]] && holeR[1] >= lo && holeR[1] <= lo + 4) {
            if ((missLow && set[lo + 1] && set[lo + 2] && set[lo + 3] && set[lo + 4]) ||
                (missHigh && set[lo] && set[lo + 1] && set[lo + 2] && set[lo + 3])) {
              // could still be gutshot; mark open only if both ends plausible — simplify: treat as draw either way
              straightDraw = true;
            }
          }
        }
      }
      if (run === 5) { straightDraw = false; break; } // already straight, category handles
    }
    if (cat >= 4) { straightDraw = false; gut = false; }
  })();

  // effective strength score
  var made = cat >= 2 || (cat === 1 && topPairPlus(s, holeR, boardRanks));
  var weakPair = cat === 1 && !topPairPlus(s, holeR, boardRanks);
  var drawVal = (flushDraw ? 0.09 : 0) + (straightDraw ? 0.08 : gut && !straightDraw ? 0.035 : 0) + overs * 0.02;

  // Monte Carlo equity postflop (bounded iterations)
  var iters = s.street === 'flop' ? (nOpp >= 4 ? 60 : 90) : s.street === 'turn' ? (nOpp >= 4 ? 80 : 120) : (nOpp >= 4 ? 120 : 180);
  var eq;
  try { eq = PokerEngine.equity(s.you.cards, board, Math.min(8, nOpp), iters, Math.random); }
  catch (e) { eq = fallbackEq(cat, flushDraw, straightDraw, overs, nOpp); }
  if (!(eq >= 0 && eq <= 1)) eq = fallbackEq(cat, flushDraw, straightDraw, overs, nOpp);
  // blend MC with draw-aware floor (MC already includes draws, but low-iters noise: shrink slightly)
  eq = clamp01(eq);

  var odds = toCall / Math.max(1, pot + toCall);
  var rt = raiserTight(s);

  // value thresholds
  var vNeed = nOpp === 1 ? 0.55 : nOpp === 2 ? 0.42 : 0.34;
  if (s.street === 'river') vNeed += 0.03;
  if (rt === 1) vNeed += 0.03;
  if (desperate) vNeed -= 0.04;
  if (comfortable) vNeed += 0.02;

  var canRaise = s.minRaiseTo !== null;

  // playing the board: no edge, just check/call tiny
  if (playingBoard) {
    if (s.canCheck) return { type: 'check' };
    return { type: odds < 0.12 ? 'call' : 'fold' };
  }

  // all-in facing (call decision): pure pot-odds + small margin
  if (!s.canCheck && (toCall >= s.you.stack || toCall >= myTotal * 0.7) && !canRaise) {
    var m = 0.02 + (rt === 1 ? 0.03 : 0);
    return { type: eq >= odds + m ? 'call' : 'fold' };
  }

  // free option: check or bet
  if (s.canCheck) {
    if (!canRaise) return { type: 'check' };
    var bet = eq >= vNeed + 0.10 || cat >= 6 || (cat >= 3 && eq > 0.6);
    if (bet) return raiseTo(s, pot, toCall, bb, eq > 0.75 ? 0.7 : 0.55);
    // semi-bluff strong draws heads-up in position / button
    if (nOpp === 1 && (flushDraw || straightDraw) && eq > 0.38 && (pos === 2 || s.street !== 'river')) {
      if (hash01(s.handNumber, s.you.seat + 7) < (pos === 2 ? 0.45 : 0.25)) return raiseTo(s, pot, toCall, bb, 0.55);
    }
    // rare pure bluff on dry boards IP heads-up
    if (nOpp === 1 && s.street === 'river' && pos === 2 && eq < 0.3 && boardDry(board)) {
      if (hash01(s.handNumber * 3, s.you.seat) < 0.12) return raiseTo(s, pot, toCall, bb, 0.6);
    }
    return { type: 'check' };
  }

  // facing a bet
  var margin = 0.03 + (toCall / Math.max(1, pot)) * 0.01;
  if (!closing) margin += 0.015;
  if (pos === 0) margin += 0.01;
  if (rt === 1) margin += 0.045;
  else if (rt === -1) margin -= 0.025;
  if (effBB < 15) margin -= 0.01;
  if (desperate) margin -= 0.03;
  if (s.street === 'river' && weakPair && !closing) margin += 0.03;

  // raise for value
  if (canRaise && (eq >= Math.max(vNeed + 0.08, 0.62) || cat >= 6)) {
    // protect against min-raise traps: just call with monsters sometimes multiway? keep raising, simpler
    return raiseTo(s, pot, toCall, bb, eq > 0.78 ? 0.75 : 0.6);
  }
  // semi-bluff raise with strong combo draws getting good price
  if (canRaise && nOpp <= 2 && (flushDraw || straightDraw) && eq > 0.42 && eq > odds && toCall <= pot * 0.8) {
    if (hash01(s.handNumber * 5, s.you.seat + 3) < 0.35) return raiseTo(s, pot, toCall, bb, 0.6);
  }
  if (eq + drawVal * 0.15 >= odds + margin) return { type: 'call' };
  // last-ditch: overpair-ish weak pair heads-up closing with tiny bet
  if (nOpp === 1 && closing && odds < 0.15 && (weakPair || eq > 0.28)) return { type: 'call' };
  return { type: 'fold' };
}

function topPairPlus(s, holeR, boardRanks) {
  var bmax = Math.max.apply(null, boardRanks.length ? boardRanks : [0]);
  var bmax2 = boardRanks.slice().sort(function (a, b) { return b - a; })[0];
  // top pair good kicker or overpair
  var overpair = holeR[0] === holeR[1] && holeR[0] > bmax;
  if (overpair) return true;
  for (var i = 0; i < 2; i++) {
    if (holeR[i] === bmax2) {
      var kick = holeR[1 - i];
      if (holeR[i] >= 11 && kick >= 10) return true;
      if (bmax2 <= 10 && kick >= Math.max(11, bmax2 + 1)) return true;
    }
  }
  return false;
}

function boardDry(board) {
  if (board.length < 3) return false;
  var R = '23456789TJQKA';
  var rs = board.map(function (c) { return R.indexOf(c[0]) + 2; }).sort(function (a, b) { return a - b; });
  var suits = board.map(function (c) { return c[1]; });
  var flushy = suits[0] === suits[1] && suits[1] === suits[2];
  if (flushy) return false;
  for (var i = 1; i < rs.length; i++) if (rs[i] - rs[i - 1] <= 2 && rs[i] >= 9) return false;
  return true;
}

function fallbackEq(cat, fd, sd, overs, nOpp) {
  var b = [0.28, 0.42, 0.62, 0.72, 0.74, 0.78, 0.88, 0.93, 0.97][cat] || 0.3;
  b += (fd ? 0.06 : 0) + (sd ? 0.05 : 0) + overs * 0.015;
  return clamp01(b - Math.max(0, nOpp - 1) * 0.09);
}

function raiseTo(s, pot, toCall, bb, frac, minX, maxX) {
  var target = s.you.bet + toCall + Math.max(bb, Math.floor((pot + toCall) * frac));
  if (s.street === 'preflop' && minX) {
    var std = s.currentBet + Math.max(bb * 2, Math.floor(s.currentBet * minX));
    // open-raise standardization preflop: 2.5-3.5x
    if (toCall === 0 && s.currentBet > 0) target = Math.max(target, Math.floor(s.currentBet * (minX + maxX) / 2));
    else target = Math.max(target, std);
  }
  target = Math.max(target, s.minRaiseTo);
  target = Math.min(target, s.maxRaiseTo);
  if (target >= s.maxRaiseTo) {
    if (s.canAllIn) return { type: 'allin' };
    return s.canCheck ? { type: 'check' } : { type: 'fold' };
  }
  if (target < s.minRaiseTo) {
    if (s.canAllIn && s.maxRaiseTo > s.currentBet) return { type: 'allin' };
    return s.canCheck ? { type: 'check' } : { type: 'call' };
  }
  return { type: 'raise', amount: target };
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function hash01(a, b) {
  var h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x85EBCA6B, 0xC2B2AE35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
