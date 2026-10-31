'use strict';
// Luna — tight-aggressive equity bot with position-aware preflop, pot-odds calls,
// short-stack push/fold and selective value-heavy postflop aggression.
module.exports = { name: 'Luna', act: decide };

var R = '23456789TJQKA';
var RV = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
var AGGRO = {}; // opp id -> {agr: aggressive actions, pas: calls+checks}
var SEENH = '';
var LASTH = 0;       // last handNumber observed (for VPIP model)
var SEEN = {};       // opp id -> hands observed
var ENTERED = {};    // opp id -> hands voluntarily entered preflop
var ENTEREDH = {};   // opp id -> last handNumber counted as entered

function rv(c) { return RV[c[0]]; }
function suited(h) { return h[0][1] === h[1][1]; }
function potOf(s) { var t = 0, i; for (i = 0; i < s.pots.length; i++) t += s.pots[i].amount; return t; }
function clampRaise(s, x) {
  if (s.minRaiseTo === null) return null;
  x = Math.floor(x);
  if (!(x > s.currentBet)) x = s.minRaiseTo;
  if (x < s.minRaiseTo) x = s.minRaiseTo;
  if (x >= s.maxRaiseTo) return { type: 'allin' };
  return { type: 'raise', amount: x };
}
function doRaise(s, x) {
  var r = clampRaise(s, x);
  if (r) return r;
  if (s.canCheck) return { type: 'check' };
  return { type: 'fold' };
}
function contenders(s) {
  var n = 0, i, q;
  for (i = 0; i < s.seats.length; i++) { q = s.seats[i]; if (q.id !== s.you.id && !q.out && !q.folded) n++; }
  return n;
}
function aliveCount(s) {
  var n = 0, i;
  for (i = 0; i < s.seats.length; i++) if (!s.seats[i].out) n++;
  return n;
}
// late position? distance ahead of button in live order
function positionInfo(s) {
  var live = [], i;
  for (i = 0; i < s.seats.length; i++) if (!s.seats[i].out) live.push(s.seats[i].seat);
  live.sort(function (a, b) { return a - b; });
  var n = live.length, me = s.you.seat, b = s.buttonSeat;
  var distMe = 0, k;
  for (k = 1; k <= s.seats.length; k++) { if ((b + k) % s.seats.length === me) { distMe = k; break; } }
  // players still to act behind preflop approx: those between me and BB...
  var frac = n <= 1 ? 1 : distMe / s.seats.length;
  var btn = (me === b);
  var late = btn || frac > 0.62;
  var early = !late && frac < 0.35;
  return { n: n, btn: btn, late: late, early: early, frac: frac, live: live };
}
function chen(h) {
  var a = rv(h[0]), b = rv(h[1]), hi = Math.max(a, b), lo = Math.min(a, b);
  var base = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
  var pair = a === b;
  var sc;
  if (pair) sc = Math.max(5, base * 2);
  else {
    sc = base;
    if (suited(h)) sc += 2;
    var gap = hi - lo - 1;
    if (gap === 0) sc += hi < 12 ? 1 : 0.5;
    else if (gap === 1) sc -= 1;
    else if (gap === 2) sc -= 2;
    else if (gap === 3) sc -= 4;
    else sc -= 5;
    if (gap <= 1 && lo < 12 && hi === 14) sc += 1; // A-soft connectors bonus-ish
    if (gap >= 0 && gap <= 1 && hi === 13 && lo >= 10) sc += 0.5;
  }
  return sc;
}
function trackActions(s) {
  // incremental cheap opponent model from this hand's voluntary actions
  // + per-opponent VPIP (hands voluntarily entered / hands seen)
  if (s.handNumber !== LASTH) {
    LASTH = s.handNumber;
    var j;
    for (j = 0; j < s.seats.length; j++) {
      var q = s.seats[j];
      if (q.id !== s.you.id && !q.out) SEEN[q.id] = (SEEN[q.id] || 0) + 1;
    }
  }
  var key = s.handNumber + ':' + s.actions.length + ':' + s.you.id;
  if (key === SEENH) return;
  SEENH = key;
  var i, a;
  for (i = 0; i < s.actions.length; i++) {
    a = s.actions[i];
    if (a.id === s.you.id || a._t) continue;
    a._t = 1; // harmless: detached state object
    var st = AGGRO[a.id] || (AGGRO[a.id] = { agr: 0, pas: 0 });
    if (a.type === 'raise' || a.type === 'allin') st.agr++;
    else st.pas++;
    if (a.street === 'preflop' && ENTEREDH[a.id] !== s.handNumber) {
      ENTEREDH[a.id] = s.handNumber;
      ENTERED[a.id] = (ENTERED[a.id] || 0) + 1;
    }
  }
}
function vpip(id) {
  var n = SEEN[id] || 0;
  if (n < 5) return 0.4; // unknown: assume average
  return (ENTERED[id] || 0) / n;
}
function isTight(id) { return (SEEN[id] || 0) >= 5 && vpip(id) < 0.26; }
function isLoose(id) { return (SEEN[id] || 0) >= 5 && vpip(id) > 0.45; }
function tableLoose(s) {
  // fraction of live opponents who voluntarily entered this hand preflop
  var entered = {}, i, a;
  for (i = 0; i < s.actions.length; i++) {
    a = s.actions[i];
    if (a.street === 'preflop' && (a.type === 'call' || a.type === 'raise' || a.type === 'allin')) entered[a.id] = 1;
  }
  var opp = contenders(s) + 1, n = 0, k;
  for (k in entered) n++;
  return opp > 1 ? n / opp : 0.5;
}
function iRaisedPre(s) {
  var i, a, last = null;
  for (i = 0; i < s.actions.length; i++) {
    a = s.actions[i];
    if (a.street !== 'preflop') continue;
    if (a.type === 'raise' || a.type === 'allin') last = a.id;
  }
  return last === s.you.id;
}
function facingAggr(s) {
  // number of raises this street before our action, and whether last aggressor looks tight
  var n = 0, last = null, i, a;
  for (i = 0; i < s.actions.length; i++) {
    a = s.actions[i];
    if (a.street !== s.street) continue;
    if (a.type === 'raise' || a.type === 'allin') { n++; last = a.id; }
  }
  var tight = false, loose = false;
  if (last && last !== s.you.id && AGGRO[last]) {
    var st = AGGRO[last], tot = st.agr + st.pas;
    if (tot >= 4 && st.agr / tot < 0.25) tight = true;
  }
  if (last && last !== s.you.id) {
    if (isTight(last)) tight = true;
    if (isLoose(last)) loose = true;
  }
  return { n: n, last: last, tight: tight, loose: loose };
}
function boardTexture(board) {
  var flush3 = false, pair = false, i, j, sc = {}, sr = {};
  for (i = 0; i < board.length; i++) {
    sc[board[i][1]] = (sc[board[i][1]] || 0) + 1;
    sr[board[i][0]] = (sr[board[i][0]] || 0) + 1;
  }
  for (var k in sc) if (sc[k] >= 3) flush3 = true;
  for (var k2 in sr) if (sr[k2] >= 2) pair = true;
  // straight-y: 3+ cards within a 5-span
  var vals = [], seen = {};
  for (i = 0; i < board.length; i++) { var v = rv(board[i]); if (!seen[v]) { seen[v] = 1; vals.push(v); } }
  if (seen[14]) vals.push(1);
  vals.sort(function (a, b) { return a - b; });
  var conn = false;
  for (i = 0; i < vals.length; i++) {
    var c = 1;
    for (j = i + 1; j < vals.length && vals[j] - vals[i] <= 4; j++) if (vals[j] !== vals[j - 1]) c++;
    if (c >= 3) { conn = true; break; }
  }
  return { flush3: flush3, pair: pair, conn: conn, dry: !flush3 && !conn };
}

function decide(s) {
  try { return act(s); } catch (e) { return s.canCheck ? { type: 'check' } : { type: 'fold' }; }
}

function act(s) {
  trackActions(s);
  var hole = s.you.cards, board = s.board;
  var bb = s.blinds[1] || 100;
  var pot = potOf(s);
  var opp = contenders(s);
  if (opp <= 0) return s.canCheck ? { type: 'check' } : { type: 'call' };
  var pos = positionInfo(s);
  var eff = (s.you.stack + s.you.bet) / bb; // my effective BB
  var a = Math.max(rv(hole[0]), rv(hole[1])), b = Math.min(rv(hole[0]), rv(hole[1]));
  var pair = a === b, st = suited(hole);
  var ch = chen(hole);
  var toCallBB = s.toCall / bb;

  // ---------- stack-pressure: short stack push/fold ----------
  var minOppStackBB = 1e9, i, q;
  for (i = 0; i < s.seats.length; i++) {
    q = s.seats[i];
    if (q.id !== s.you.id && !q.out && !q.folded) minOppStackBB = Math.min(minOppStackBB, (q.stack + q.bet) / bb);
  }
  var effBB = Math.min(eff, minOppStackBB);

  if (s.street === 'preflop') return preflop(s, hole, a, b, pair, st, ch, bb, pot, opp, pos, eff, effBB, toCallBB);
  return postflop(s, hole, board, bb, pot, opp, pos, eff, toCallBB);
}

function preflop(s, hole, a, b, pair, st, ch, bb, pot, opp, pos, eff, effBB, toCallBB) {
  var hi = a;
  // ---- short stack: push / fold ----
  if (effBB <= 9 && s.you.stack > 0) {
    var push = false;
    if (pair) push = effBB <= 5 ? true : pos.late ? hi >= 3 : pos.btn ? hi >= 2 : hi >= 5;
    else if (hi === 14) push = effBB <= 5 ? true : pos.late ? (st || b >= 4) : b >= 7 || (st && b >= 2);
    else if (hi === 13) push = effBB <= 4 ? (st || b >= 8) : pos.late ? (st ? b >= 5 : b >= 9) : (st && b >= 9) || b >= 11;
    else if (hi === 12) push = effBB <= 4 ? (st || b >= 9) : pos.late && (st ? b >= 7 : b >= 10);
    else if (pos.late) push = effBB <= 4 ? (st && hi >= 10) : (st && hi >= 11 && b >= 8);
    if (s.toCall > 0) {
      // calling a shove / open short: pot-odds aware
      var shoveOdds = s.toCall / Math.max(1, pot + s.toCall);
      var premium = (pair && hi >= 9) || (hi === 14 && b >= 10) || (pair && hi >= 7 && s.toCall <= s.you.stack * 0.35);
      if (!premium && s.toCall <= s.you.stack * 0.45) {
        // getting ~2:1 or better: any pair, any ace, KQ/KJ, QJs
        premium = pair || hi === 14 || (hi === 13 && b >= 11) || (st && hi === 12 && b === 11);
      }
      if (!premium) {
        // wide shover (loose profile): call wider
        var sh = null, si;
        for (si = 0; si < s.actions.length; si++) {
          var as = s.actions[si];
          if (as.street === 'preflop' && (as.type === 'raise' || as.type === 'allin') && as.id !== s.you.id) sh = as.id;
        }
        if (sh && isLoose(sh)) premium = (pair && hi >= 5) || (hi === 14 && b >= 7) || (hi === 13 && b >= 12);
      }
      if (s.toCall >= s.you.stack) return premium ? { type: 'call' } : { type: 'fold' };
      if (!push) return premium ? { type: 'call' } : { type: 'fold' };
      if (premium && s.minRaiseTo !== null && s.toCall < s.you.stack * 0.6) {
        if (s.canAllIn && (pair && hi >= 11 || hi === 14 && b >= 12)) return { type: 'allin' };
        return { type: 'call' };
      }
      return premium ? { type: 'call' } : { type: 'fold' };
    }
    if (push) {
      if (!s.canAllIn) return s.canCheck ? { type: 'check' } : { type: 'fold' };
      if (s.minRaiseTo !== null && effBB > 4) {
        // open-shove directly when very short, else big open
        if (effBB <= 6) return { type: 'allin' };
      }
      if (s.canCheck) {
        if (effBB <= 6) return { type: 'allin' };
        return doRaise(s, s.you.bet + Math.max(s.minRaiseTo - s.you.bet, Math.ceil(bb * 2.5)));
      }
      return { type: 'allin' };
    }
    if (s.canCheck) return { type: 'check' };
    return s.toCall <= bb * 0.5 ? { type: 'call' } : { type: 'fold' };
  }

  var fa = facingAggr(s);
  var opened = s.toCall > 0 && !s.canCheck;
  var loose = tableLoose(s);

  // opening thresholds (chen) by position & table size
  var openNeed = pos.btn ? 6.5 : pos.late ? 7 : pos.early ? 8.5 : 7.5;
  if (opp <= 2) openNeed -= 1.5;           // heads-up / 3-way: play wide
  else if (opp >= 5) openNeed += 0.5;
  if (loose > 0.6) openNeed += 0.5;        // don't steal into calling stations

  if (!opened) {
    // nobody bet: check option or open
    var steal = pos.late && ch >= 5.5;
    // late open-shove with 9-13bb and a real hand: deny equity, avoid SPR traps
    if (eff <= 13 && s.canAllIn && !pos.early && opp <= 4 &&
        (pair || hi === 14 || (hi >= 12 && b >= 9) || (st && hi >= 11))) {
      return { type: 'allin' };
    }
    if (ch >= openNeed || steal) {
      if (s.minRaiseTo === null) return { type: 'check' };
      var limpers = 0, k;
      for (k = 0; k < s.actions.length; k++) if (s.actions[k].street === 'preflop' && s.actions[k].type === 'call') limpers++;
      var size = bb * (pos.btn ? 2.2 : 2.5) + limpers * bb;
      if (ch >= 11 || (pair && hi >= 11)) size = Math.max(size, pot * 0.8 + s.toCall);
      var target = s.you.bet + s.toCall + Math.max(bb * 2, Math.ceil(size));
      if (target < s.minRaiseTo) target = s.minRaiseTo;
      return doRaise(s, target);
    }
    return { type: 'check' };
  }

  // ---- facing an open ----
  var raiseSizeBB = (s.currentBet) / bb;
  var bigOpen = raiseSizeBB >= 6;
  var premiumH = (pair && hi >= 11) || (hi === 14 && b === 13 && st) || (hi === 14 && b >= 13);
  var strongH = premiumH || (pair && hi >= 9) || (hi === 14 && b >= 11) || (hi === 13 && b >= 12);
  var specH = !strongH && (pair || (st && hi >= 11) || (hi === 14 && b >= 6) || (st && a - b <= 1 && hi >= 9) || (a - b <= 0 && hi >= 12));
  // first opener = villain to exploit / respect
  var opener = null, k2;
  for (k2 = 0; k2 < s.actions.length; k2++) {
    var ao = s.actions[k2];
    if (ao.street === 'preflop' && (ao.type === 'raise' || ao.type === 'allin') && ao.id !== s.you.id) { opener = ao.id; break; }
  }
  var vsTight = fa.tight || (opener && isTight(opener));
  var vsLoose = fa.loose || (opener && isLoose(opener));
  // heads-up: button steals wide; BB defends with 3bet-or-fold vs tight
  if (opp === 1) {
    var preRaise = false, m;
    for (m = 0; m < s.actions.length; m++) {
      var ap = s.actions[m];
      if (ap.street === 'preflop' && (ap.type === 'raise' || ap.type === 'allin')) { preRaise = true; break; }
    }
    if (!preRaise && pos.btn && s.minRaiseTo !== null) {
      // BTN vs blind: steal wide
      if (ch >= 5 || (ch >= 4 && Math.random() < 0.5)) {
        return doRaise(s, Math.max(s.minRaiseTo, Math.ceil(s.you.bet + s.toCall + bb * 2.2)));
      }
      if (s.canCheck) return { type: 'check' };
      if (s.toCall <= bb) return { type: 'call' }; // cheap limp behind with odds
      return { type: 'fold' };
    }
    if (preRaise && !pos.btn) {
      // BB facing a BTN open
      if (premiumH && s.minRaiseTo !== null) {
        return doRaise(s, Math.max(s.minRaiseTo, Math.ceil(s.you.bet + s.toCall + s.currentBet * 2)));
      }
      if (vsTight && !strongH) return { type: 'fold' };
      if (strongH || specH || ch >= 8) return { type: 'call' };
      if ((ch >= 5.5 || vsLoose) && toCallBB <= 2.5) return { type: 'call' };
      return { type: 'fold' };
    }
  }
  // ---- medium stack (9-22bb): no speculative flats; 3bet-shove value ----
  if (effBB <= 22 && effBB > 9 && s.toCall > 0 && s.canAllIn) {
    var commit = s.toCall / (s.you.stack + s.you.bet);
    var shoveH = premiumH || (pair && hi >= 8) || (hi === 14 && b >= 11) || (hi === 13 && b >= 12 && pos.late);
    if (vsLoose) shoveH = shoveH || (strongH && pos.late) || (pair && hi >= 6 && pos.late);
    if (vsTight) shoveH = premiumH;
    if (shoveH && commit >= 0.1) return { type: 'allin' };
    if (shoveH && s.minRaiseTo !== null && !bigOpen) {
      return doRaise(s, Math.max(s.minRaiseTo, Math.ceil(s.you.bet + s.toCall + s.currentBet * 2)));
    }
    // fold specs without implied odds; only continue with odds + position + tiny price
    if (!strongH) {
      var mOdds = s.toCall / Math.max(1, pot + s.toCall);
      if (!(mOdds <= 0.15 && pos.late && specH)) return { type: 'fold' };
    }
  }
  // 4bet/shove giants
  if (pair && hi === 14 || (hi === 14 && b === 13 && st)) {
    if (fa.n >= 2 && s.canAllIn && s.toCall > s.you.stack * 0.25) return { type: 'allin' };
  }
  // 3-bet premiums (and strong value vs loose openers / late)
  var can3 = premiumH || (strongH && (pos.late || vsLoose)) || (vsLoose && pair && fa.n === 1 && !bigOpen);
  if (can3 && s.minRaiseTo !== null) {
    if (!(fa.tight && !premiumH) && !(bigOpen && !premiumH) && !(vsTight && !premiumH)) {
      // 3x the open (+1bb per cold caller already in)
      var t3 = Math.max(s.minRaiseTo, Math.ceil(s.you.bet + s.toCall + s.currentBet * 2));
      if (s.toCall >= s.you.stack * 0.4 && premiumH) return s.canAllIn ? { type: 'allin' } : { type: 'call' };
      if (!bigOpen || premiumH) return doRaise(s, t3);
    }
  }
  if (fa.tight && !strongH) return { type: 'fold' };
  // flat range with odds & position (wider vs loose openers we can outplay/value)
  var odds = s.toCall / Math.max(1, pot + s.toCall);
  if (vsTight && !strongH) {
    // dominated-spec folds vs tight openers; only set-mine / nut-draw odds
    if (!(pair && hi <= 8 && odds <= 0.12 && pos.late)) return { type: 'fold' };
  }
  var callCap = pos.late ? 5 : 3.5;
  var oddsCap = pos.late ? 0.3 : 0.22;
  if (vsTight && !strongH) { callCap = 0; oddsCap = 0.12; }
  if (vsLoose) { callCap += 1.5; oddsCap += 0.05; }
  if (opp >= 4 && !strongH) { callCap = Math.min(callCap, 3); oddsCap = Math.min(oddsCap, 0.18); }
  var want = strongH || (specH && (toCallBB <= callCap || odds <= oddsCap));
  if (opp <= 2 && ch >= 7 && toCallBB <= 4) want = true; // HU defend wide
  if (want) {
    if (s.toCall >= s.you.stack * 0.5) {
      return (strongH && s.canAllIn) ? { type: 'allin' } : (strongH ? { type: 'call' } : { type: 'fold' });
    }
    return { type: 'call' };
  }
  return { type: 'fold' };
}

function postflop(s, hole, board, bb, pot, opp, pos, eff, toCallBB) {
  var eq, iters = board.length === 3 ? 90 : board.length === 4 ? 110 : 90;
  var capped = Math.min(opp, 8);
  try {
    eq = PokerEngine.equity(hole, board, capped, iters, Math.random);
  } catch (e) { eq = 0.35; }
  if (!(eq >= 0) || !(eq <= 1)) eq = 0.35;

  var me, br = -1;
  try {
    me = PokerEngine.evaluate(hole.concat(board));
    if (board.length >= 5) br = PokerEngine.evaluate(board).rank;
  } catch (e) { me = { rank: 0, value: 0 }; }
  var made = me.rank;
  var beatsBoard = made > br;
  var tex = boardTexture(board);
  var fa = facingAggr(s);
  var loose = tableLoose(s);
  var odds = s.toCall / Math.max(1, pot + s.toCall);
  var spr = pot > 0 ? (s.you.stack) / pot : 99;

  // discount raw random-range equity when facing tight aggression / many opponents
  var eqA = eq;
  if (fa.tight) eqA -= 0.08;
  if (fa.n >= 2) eqA -= 0.05;
  if (opp >= 4) eqA -= 0.03;

  var nutty = (made >= 6) || (made === 5 && tex.flush3 === false || made >= 3 && board.length >= 5 && beatsBoard && made >= 4);
  if (made >= 5 && beatsBoard) nutty = true;
  if (board.length === 5 && !beatsBoard && made <= 2) eqA = Math.min(eqA, 0.35);

  // value threshold rises multiway
  var vNeed = opp <= 1 ? 0.58 : opp === 2 ? 0.64 : opp === 3 ? 0.68 : 0.72;
  if (loose > 0.6) vNeed -= 0.04;   // stations pay: value thinner
  if (fa.tight) vNeed += 0.04;

  // ---- facing a bet ----
  if (!s.canCheck) {
    // commit SHORT all-in calls liberally with any decent equity
    if (s.toCall >= s.you.stack && s.canAllIn) {
      return (eqA > Math.max(odds - 0.05, 0.38) || (made >= 2 && beatsBoard)) ? { type: 'call' } : { type: 'fold' };
    }
    // raise for value (thinner vs loose stations who overcall)
    var raiseNeed = fa.loose ? vNeed : vNeed + 0.06;
    if (s.minRaiseTo !== null && (eqA >= raiseNeed || nutty)) {
      if (spr < 2.5 && eqA > 0.6 && s.canAllIn) return { type: 'allin' };
      var vt = s.you.bet + s.toCall + Math.max(s.blinds[1], Math.ceil((pot + s.toCall) * (nutty ? 0.85 : 0.7)));
      if (fa.n >= 1 && nutty) vt = s.you.bet + s.toCall + Math.ceil((pot + s.toCall) * 1.0);
      return doRaise(s, vt);
    }
    // semi-bluff raise occasionally: strong draw, 1 opp, position
    if (s.minRaiseTo !== null && opp === 1 && board.length <= 4 && eqA > 0.42 && eqA < vNeed &&
        (pos.late || iRaisedPre(s)) && fa.n <= 1 && Math.random() < 0.18) {
      return doRaise(s, s.you.bet + s.toCall + Math.ceil((pot + s.toCall) * 0.65));
    }
    // call with odds (+ implied for draws)
    // tighter base margin; respect tight bets, exploit loose ones
    var margin = 0.04;
    if (fa.n >= 2) margin += 0.03;
    if (fa.tight) margin += 0.05;
    else if (fa.loose) margin -= 0.02;
    if (s.street === 'river' && fa.tight) margin += 0.03;
    if (opp >= 3) margin += 0.02;
    var drawBonus = (board.length === 3 && eqA > 0.28) ? 0.03 : 0;
    if (eqA + drawBonus >= odds + margin) {
      // don't bleed huge calls with dominated medium hands
      if (s.toCall > s.you.stack * 0.55 && eqA < 0.55 && !nutty) return { type: 'fold' };
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  // ---- no bet to face: bet or check ----
  if (s.minRaiseTo !== null) {
    var betNeed = vNeed - 0.03;
    if (eqA >= betNeed || nutty) {
      var frac = nutty ? 0.8 : eqA > 0.72 ? 0.72 : 0.55;
      if (loose > 0.6) frac = Math.min(0.9, frac + 0.1);
      var bt = s.you.bet + Math.max(s.blinds[1], Math.ceil(pot * frac));
      return doRaise(s, bt);
    }
    // c-bet as preflop raiser on decent boards; no pure air bluffs into stations
    var stationy = loose > 0.55 && !nutty;
    if (iRaisedPre(s) && opp <= 2 && (tex.dry || eqA > 0.5) && !(stationy && eqA < 0.5) &&
        Math.random() < (opp === 1 ? (stationy ? 0.4 : 0.65) : 0.4)) {
      return doRaise(s, s.you.bet + Math.max(s.blinds[1], Math.ceil(pot * 0.5)));
    }
    // probe/bluff: 1 opp, position, dry or scare, capped random; never vs stations
    if (opp === 1 && (pos.late || pos.btn) && !fa.tight && !stationy && Math.random() < 0.22 &&
        (tex.dry || board.length === 5) && spr > 1.2) {
      return doRaise(s, s.you.bet + Math.max(s.blinds[1], Math.ceil(pot * 0.5)));
    }
  }
  return { type: 'check' };
}
