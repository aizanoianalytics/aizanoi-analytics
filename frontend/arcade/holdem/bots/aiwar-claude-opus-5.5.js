'use strict';
// Range-aware Monte Carlo hold'em bot with opponent modelling and push/fold endgame.

var RANKS = '23456789TJQKA';
var SUITS = 'cdhs';
function cardInt(s) { return RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]); }

// ---------- fast evaluator ----------
var STRAIGHT = new Int8Array(8192);
(function () {
  for (var m = 0; m < 8192; m++) {
    var h = -1;
    for (var top = 12; top >= 4; top--) {
      var need = 31 << (top - 4);
      if ((m & need) === need) { h = top; break; }
    }
    if (h < 0 && (m & 0x100F) === 0x100F) h = 3;
    STRAIGHT[m] = h;
  }
})();
var CNT = new Int8Array(13);
var SM = new Int32Array(4);
var SC = new Int8Array(4);
function topBits(mask, n) {
  var v = 0, k = 0;
  for (var r = 12; r >= 0 && k < n; r--) if (mask & (1 << r)) { v = (v << 4) | r; k++; }
  while (k < n) { v <<= 4; k++; }
  return v;
}
var EVALS = 0;
var SCB = new Int8Array(4);
function evalCards(cards, n) {
  EVALS++;
  var i, c, r, s;
  for (i = 0; i < 13; i++) CNT[i] = 0;
  SM[0] = SM[1] = SM[2] = SM[3] = 0; SC[0] = SC[1] = SC[2] = SC[3] = 0;
  var all = 0;
  for (i = 0; i < n; i++) { c = cards[i]; r = c >> 2; s = c & 3; CNT[r]++; SM[s] |= 1 << r; SC[s]++; all |= 1 << r; }
  var flushSuit = -1;
  for (s = 0; s < 4; s++) if (SC[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    var sf = STRAIGHT[SM[flushSuit]];
    if (sf >= 0) return (8 << 20) | sf;
  }
  var quad = -1, trip = -1, p1 = -1, p2 = -1, p3 = -1;
  for (r = 12; r >= 0; r--) {
    c = CNT[r];
    if (c === 4) quad = r;
    else if (c === 3) { if (trip < 0) trip = r; else if (p1 < r) { p3 = p2; p2 = p1; p1 = r; } else if (p2 < 0) p2 = r; }
    else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else if (p3 < 0) p3 = r; }
  }
  if (quad >= 0) return (7 << 20) | (quad << 16) | (topBits(all & ~(1 << quad), 1) << 12);
  if (trip >= 0 && p1 >= 0) return (6 << 20) | (trip << 16) | (p1 << 12);
  if (flushSuit >= 0) return (5 << 20) | topBits(SM[flushSuit], 5);
  var st = STRAIGHT[all];
  if (st >= 0) return (4 << 20) | st;
  if (trip >= 0) return (3 << 20) | (trip << 16) | (topBits(all & ~(1 << trip), 2) << 8);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (topBits(all & ~(1 << p1) & ~(1 << p2), 1) << 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (topBits(all & ~(1 << p1), 3) << 4);
  return topBits(all, 5);
}

// ---------- deterministic rng for init ----------
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var rand = (typeof Math !== 'undefined' && Math.random) ? function () { return Math.random(); } : mulberry(7);

// ---------- preflop class percentile ----------
function classIdx(c1, c2) {
  var r1 = c1 >> 2, r2 = c2 >> 2;
  var hi = r1 > r2 ? r1 : r2, lo = r1 > r2 ? r2 : r1;
  if (hi === lo) return hi * 13 + hi;
  return (c1 & 3) === (c2 & 3) ? hi * 13 + lo : lo * 13 + hi; // suited: upper, offsuit: lower
}
var PCT = new Float32Array(169); // 0 = best
(function () {
  var R = mulberry(12345);
  var score = new Float32Array(169), combos = new Float32Array(169);
  var buf = new Int32Array(7), used = new Uint8Array(52);
  for (var hi = 0; hi < 13; hi++) for (var lo = 0; lo <= hi; lo++) for (var suited = 0; suited < 2; suited++) {
    if (hi === lo && suited) continue;
    var a = hi * 4, b = lo * 4 + (suited ? 0 : 1);
    var idx = classIdx(a, b);
    combos[idx] = hi === lo ? 6 : (suited ? 4 : 12);
    var win = 0, N = 260;
    for (var t = 0; t < N; t++) {
      for (var k = 0; k < 52; k++) used[k] = 0;
      used[a] = used[b] = 1;
      var draw = [];
      while (draw.length < 7) { var x = (R() * 52) | 0; if (!used[x]) { used[x] = 1; draw.push(x); } }
      buf[0] = a; buf[1] = b; for (k = 0; k < 5; k++) buf[2 + k] = draw[k];
      var hv = evalCards(buf, 7);
      buf[0] = draw[5]; buf[1] = draw[6];
      var ov = evalCards(buf, 7);
      win += hv > ov ? 1 : hv === ov ? 0.5 : 0;
    }
    var eq = win / N;
    // playability tweaks
    if (suited) eq += 0.02;
    if (hi !== lo && hi - lo <= 2) eq += 0.01;
    if (hi === lo) eq += 0.02;
    score[idx] = eq;
  }
  var order = [];
  for (var i = 0; i < 169; i++) if (combos[i]) order.push(i);
  order.sort(function (x, y) { return score[y] - score[x]; });
  var cum = 0;
  for (i = 0; i < order.length; i++) { PCT[order[i]] = (cum + combos[order[i]] / 2) / 1326; cum += combos[order[i]]; }
})();
function handPct(c1, c2) { return PCT[classIdx(c1, c2)]; }

// ---------- opponent stats ----------
var STATS = {};
var seenHand = -1, seenActs = 0, handFlags = {};
function stat(id) {
  if (!STATS[id]) STATS[id] = { hands: 0, vpip: 0, pfr: 0, aggr: 0, pass: 0, foldBet: 0, faceBet: 0 };
  return STATS[id];
}
function updateStats(state) {
  if (state.handNumber !== seenHand) {
    seenHand = state.handNumber; seenActs = 0; handFlags = {};
    state.seats.forEach(function (s) { if (!s.out && s.id !== state.you.id) { stat(s.id).hands++; handFlags[s.id] = {}; } });
  }
  var acts = state.actions;
  // replay to know raise vs call
  var bets = {}, maxBet = state.blinds[1], street = 'preflop';
  for (var i = 0; i < acts.length; i++) {
    var a = acts[i];
    if (a.street !== street) { street = a.street; bets = {}; maxBet = 0; }
    var prevMax = maxBet;
    bets[a.id] = (bets[a.id] || 0) + a.amount;
    if (a.street === 'preflop' && bets[a.id] === a.amount) {
      // add blind posts approximately
      var seat = null;
      for (var j = 0; j < state.seats.length; j++) if (state.seats[j].id === a.id) seat = state.seats[j];
      if (seat && seat.seat === state.bigBlindSeat) bets[a.id] += state.blinds[1];
      else if (seat && seat.seat === state.smallBlindSeat) bets[a.id] += state.blinds[0];
    }
    var isRaise = bets[a.id] > maxBet && a.type !== 'fold' && a.type !== 'check';
    if (bets[a.id] > maxBet) maxBet = bets[a.id];
    if (i < seenActs || a.id === state.you.id) continue;
    var st = stat(a.id), f = handFlags[a.id] || (handFlags[a.id] = {});
    if (a.street === 'preflop') {
      if ((a.type === 'call' || isRaise) && !f.v) { f.v = 1; st.vpip++; }
      if (isRaise && !f.p) { f.p = 1; st.pfr++; }
    } else {
      if (isRaise) st.aggr++; else if (a.type === 'call') st.pass++;
      if (prevMax > 0 && !isRaise) { st.faceBet++; if (a.type === 'fold') st.foldBet++; }
    }
  }
  seenActs = acts.length;
}
function profile(id) {
  var s = stat(id);
  var n = s.hands;
  var vpip = (s.vpip + 0.3 * 8) / (n + 8);
  var pfr = (s.pfr + 0.15 * 8) / (n + 8);
  var af = (s.aggr + 1) / (s.pass + 1);
  var fold = (s.foldBet + 0.45 * 6) / (s.faceBet + 6);
  return { vpip: vpip, pfr: pfr, af: af, fold: fold, n: n };
}

// ---------- hand-specific analysis ----------
function analyze(state) {
  var info = {};
  var acts = state.actions, bets = {}, maxBet = state.blinds[1], street = 'preflop';
  state.seats.forEach(function (s) { info[s.id] = { preRaises: 0, preCall: 0, postAggr: 0, streetAggr: 0, postCalls: 0, allInRaise: false }; });
  var preRaiseTotal = 0, lastAggressor = null, preAggressor = null;
  for (var i = 0; i < acts.length; i++) {
    var a = acts[i];
    if (a.street !== street) { street = a.street; bets = {}; maxBet = 0; lastAggressor = null; }
    var before = bets[a.id] || 0;
    if (a.street === 'preflop' && !(a.id in bets)) {
      for (var j = 0; j < state.seats.length; j++) if (state.seats[j].id === a.id) {
        if (state.seats[j].seat === state.bigBlindSeat) before = state.blinds[1];
        else if (state.seats[j].seat === state.smallBlindSeat) before = state.blinds[0];
      }
    }
    bets[a.id] = before + a.amount;
    var isRaise = bets[a.id] > maxBet && a.type !== 'fold' && a.type !== 'check';
    if (bets[a.id] > maxBet) maxBet = bets[a.id];
    var inf = info[a.id];
    if (!inf) continue;
    if (a.street === 'preflop') {
      if (isRaise) { inf.preRaises++; preRaiseTotal++; inf.preRaiseLevel = preRaiseTotal; preAggressor = a.id; if (a.type === 'allin') inf.allInRaise = true; }
      else if (a.type === 'call' || a.type === 'allin') inf.preCall++;
    } else {
      if (isRaise) { inf.postAggr++; if (a.street === state.street) inf.streetAggr++; lastAggressor = a.id; }
      else if (a.type === 'call' || a.type === 'allin') inf.postCalls++;
    }
  }
  return { info: info, preRaiseTotal: preRaiseTotal, preAggressor: preAggressor };
}

function oppModel(state, an, s) {
  var inf = an.info[s.id], p = profile(s.id);
  var bb = state.blinds[1];
  var top = 1;
  var startStackBB = (s.stack + s.total) / bb;
  if (inf.preRaises > 0) {
    var lvl = inf.preRaiseLevel || 1;
    var base = Math.min(0.55, Math.max(0.07, p.pfr * 1.1));
    top = lvl === 1 ? base : lvl === 2 ? Math.max(0.04, base * 0.4) : Math.max(0.025, base * 0.2);
    if (inf.allInRaise) top = Math.max(top, startStackBB < 12 ? 0.4 : startStackBB < 20 ? 0.22 : top);
  } else if (inf.preCall > 0) {
    top = an.preRaiseTotal > 0 ? Math.min(0.5, Math.max(0.15, p.vpip * 0.8)) : Math.min(0.8, Math.max(0.3, p.vpip * 1.3));
  }
  var bluff = Math.min(2.5, Math.max(0.5, p.af / 1.2));
  return { top: top, aggr: inf.postAggr, streetAggr: inf.streetAggr, calls: inf.postCalls, bluff: bluff };
}

// post-flop weight of an opponent holding given current board
function postWeight(h0, h1, board, bn, boardVal, m, buf) {
  if (bn === 0 || (m.aggr === 0 && m.calls === 0)) return 1;
  buf[0] = h0; buf[1] = h1;
  for (var i = 0; i < bn; i++) buf[2 + i] = board[i];
  var v = evalCards(buf, bn + 2);
  var cat = v >> 20, bcat = boardVal >> 20;
  var lvl; // 0 nothing, 1 weak pair/draw, 2 good pair, 3 strong
  if (cat >= 2 && cat > bcat) lvl = 3;
  else if (cat === 1 && bcat === 0) {
    var pr = (v >> 16) & 15, bmax = 0;
    for (i = 0; i < bn; i++) if ((board[i] >> 2) > bmax) bmax = board[i] >> 2;
    lvl = pr >= bmax ? 2 : 1;
  } else lvl = 0;
  if (lvl < 2 && bn < 5) {
    // draw detection
    var sc = SCB, mask = 0; sc[0] = sc[1] = sc[2] = sc[3] = 0;
    for (i = 0; i < bn + 2; i++) { sc[buf[i] & 3]++; mask |= 1 << (buf[i] >> 2); }
    var fd = sc[h0 & 3] >= 4 || sc[h1 & 3] >= 4;
    var sd = false;
    if (mask & 0x1000) mask = (mask << 1) | 1; else mask <<= 1;
    for (var t = 0; t <= 10 && !sd; t++) { var w = (mask >> t) & 31; var cnt = 0; while (w) { cnt += w & 1; w >>= 1; } if (cnt >= 4) sd = true; }
    if (fd || sd) lvl = lvl === 1 ? 2 : 1.5;
  }
  var w;
  if (m.streetAggr >= 2 || m.aggr >= 3) w = lvl >= 3 ? 1 : lvl >= 2 ? 0.4 : lvl >= 1.5 ? 0.25 : lvl >= 1 ? 0.12 : 0.04 * m.bluff;
  else if (m.aggr >= 1) w = lvl >= 3 ? 1 : lvl >= 2 ? 0.85 : lvl >= 1.5 ? 0.6 : lvl >= 1 ? 0.4 : 0.15 * m.bluff;
  else w = lvl >= 2 ? 1 : lvl >= 1 ? 0.8 : 0.35; // passive caller
  return w > 1 ? 1 : w;
}

function preWeight(pct, top) {
  if (pct <= top) return 1;
  var d = pct - top;
  return d < 0.08 ? 0.45 : d < 0.2 ? 0.12 : 0.03;
}

function equity(hero, board, models, iters) {
  var bn = board.length;
  var used = new Uint8Array(52);
  used[hero[0]] = used[hero[1]] = 1;
  for (var i = 0; i < bn; i++) used[board[i]] = 1;
  var buf = new Int32Array(7), wbuf = new Int32Array(7);
  var boardVal = bn >= 3 ? evalCards(board, bn) : 0;
  if (bn >= 3) boardVal = (function () { var b = new Int32Array(bn); for (var q = 0; q < bn; q++) b[q] = board[q]; return evalCards(b, bn); })();
  var no = models.length, oh = new Int32Array(no * 2), full = new Int32Array(5);
  var marks = [];
  var share = 0, start = EVALS, t;
  for (t = 0; t < iters; t++) {
    if (t >= 120 && EVALS - start > 14000) break;
    marks.length = 0;
    for (var o = 0; o < no; o++) {
      var m = models[o], a, b;
      for (var tries = 0; tries < 14; tries++) {
        do { a = (rand() * 52) | 0; } while (used[a]);
        do { b = (rand() * 52) | 0; } while (used[b] || b === a);
        var w = preWeight(handPct(a, b), m.top);
        if (w >= 1 || rand() < w) {
          var pw = postWeight(a, b, board, bn, boardVal, m, wbuf);
          if (pw >= 1 || rand() < pw) break;
        }
      }
      used[a] = used[b] = 1; marks.push(a, b);
      oh[o * 2] = a; oh[o * 2 + 1] = b;
    }
    for (i = 0; i < bn; i++) full[i] = board[i];
    for (i = bn; i < 5; i++) { var c; do { c = (rand() * 52) | 0; } while (used[c]); used[c] = 1; marks.push(c); full[i] = c; }
    buf[0] = hero[0]; buf[1] = hero[1];
    for (i = 0; i < 5; i++) buf[2 + i] = full[i];
    var hv = evalCards(buf, 7), ties = 1, lost = false;
    for (o = 0; o < no; o++) {
      buf[0] = oh[o * 2]; buf[1] = oh[o * 2 + 1];
      var ov = evalCards(buf, 7);
      if (ov > hv) { lost = true; break; }
      if (ov === hv) ties++;
    }
    if (!lost) share += 1 / ties;
    for (i = 0; i < marks.length; i++) used[marks[i]] = 0;
  }
  return share / t;
}

// ---------- action helpers ----------
function potSize(state) { var p = 0; state.pots.forEach(function (x) { p += x.amount; }); return p; }
function raiseTo(state, amt) {
  if (state.minRaiseTo === null) return state.canCheck ? { type: 'check' } : { type: 'call' };
  amt = Math.floor(amt);
  if (amt < state.minRaiseTo) amt = state.minRaiseTo;
  if (amt >= state.maxRaiseTo || amt > state.you.bet + state.you.stack * 0.8) {
    if (state.canAllIn) return { type: 'allin' };
    amt = state.maxRaiseTo;
  }
  if (amt <= state.currentBet) return state.canCheck ? { type: 'check' } : { type: 'call' };
  return { type: 'raise', amount: amt };
}
function passive(state) { return state.canCheck ? { type: 'check' } : { type: 'fold' }; }
function callOr(state) { return state.canCheck ? { type: 'check' } : { type: 'call' }; }
function shove(state) {
  if (state.canAllIn) return { type: 'allin' };
  return callOr(state);
}

// ---------- main ----------
function decide(state) {
  updateStats(state);
  var me = state.you, bb = state.blinds[1];
  var hero = [cardInt(me.cards[0]), cardInt(me.cards[1])];
  var board = state.board.map(cardInt);
  var opps = state.seats.filter(function (s) { return s.id !== me.id && !s.out && !s.folded; });
  if (!opps.length) return callOr(state);
  var pot = potSize(state);
  var toCall = state.toCall;
  var an = analyze(state);
  var models = opps.map(function (s) { return oppModel(state, an, s); });
  var alive = state.seats.filter(function (s) { return !s.out; }).length;
  var maxOppStack = 0;
  opps.forEach(function (s) { if (s.stack + s.bet > maxOppStack) maxOppStack = s.stack + s.bet; });
  var effStack = Math.min(me.stack + me.bet, maxOppStack);
  var effBB = effStack / bb;
  var odds = toCall / (pot + toCall);

  if (state.street === 'preflop') {
    var pct = handPct(hero[0], hero[1]);
    // players to act after me
    var n = state.seats.length, behind = 0;
    var bbSeat = state.bigBlindSeat;
    var pos = me.seat;
    // count non-folded, non-allin opponents who haven't voluntarily acted and sit after me up to BB
    for (var d = 1; d < n; d++) {
      var idx = (pos + d) % n;
      var s = state.seats[idx];
      if (!s.out && !s.folded) behind++;
      if (idx === bbSeat) break;
    }
    if (pos === bbSeat) behind = 0;
    var raised = state.currentBet > bb;
    var limpers = 0;
    an && state.actions.forEach(function (a) { if (a.street === 'preflop' && a.type === 'call') limpers++; });

    if (!raised) {
      // unopened or limped pot
      var openPct = behind <= 1 ? (alive === 2 ? 0.75 : 0.5) : behind === 2 ? 0.42 : behind === 3 ? 0.3 : behind === 4 ? 0.24 : behind === 5 ? 0.19 : 0.15;
      if (limpers) openPct = Math.min(openPct, 0.3) - 0.03 * limpers;
      if (effBB <= 13) {
        var pushPct = Math.min(0.85, openPct * (1.2 + (13 - effBB) * 0.12));
        if (behind <= 1 && alive === 2) pushPct = Math.min(0.9, 0.5 + (13 - effBB) * 0.04);
        if (pct <= pushPct) return shove(state);
        if (state.canCheck) return { type: 'check' };
        if (me.seat === state.smallBlindSeat && behind === 1 && pct < 0.6 && effBB > 6) return { type: 'call' };
        return passive(state);
      }
      if (pct <= openPct) {
        var size = (alive === 2 ? 2.3 : 2.5) * bb + limpers * bb;
        if (rand() < 0.5 && pct > openPct * 0.6 && state.canCheck) return { type: 'check' };
        return raiseTo(state, size);
      }
      if (state.canCheck) return { type: 'check' };
      if (me.seat === state.smallBlindSeat && behind === 1 && pct < 0.65) return { type: 'call' };
      if (limpers && pct < 0.4 && toCall <= bb) return { type: 'call' };
      return { type: 'fold' };
    }
    // facing a raise
    var activeModels = [];
    opps.forEach(function (s, i) {
      var inf = an.info[s.id];
      if (inf.preRaises || inf.preCall || s.allIn) activeModels.push(models[i]);
    });
    if (!activeModels.length) activeModels = models.slice(0, 1);
    var eq = equity(hero, board, activeModels.slice(0, 4), 900);
    var potIfCall = pot + toCall;
    var commitFrac = toCall / (me.stack + 1);
    var minTop = 1;
    activeModels.forEach(function (m) { if (m.top < minTop) minTop = m.top; });
    var fair = 1 / (activeModels.length + 1);
    // value re-raise
    var reraise = pct <= Math.max(0.025, minTop * 0.3) || eq > Math.max(0.6, fair + 0.3);
    if (reraise && state.minRaiseTo !== null) {
      if (effBB < 30 || commitFrac > 0.3) return shove(state);
      var target = state.currentBet * (behind > 0 ? 3.3 : 3) + (pot - state.currentBet - me.bet) ;
      return raiseTo(state, target);
    }
    if (commitFrac >= 0.45 || toCall >= me.stack) {
      // effectively all-in decision
      var need = Math.min(me.stack, toCall) / (pot + Math.min(me.stack, toCall));
      if (eq >= need + 0.02) return commitFrac >= 0.6 ? callOr(state) : shove(state);
      return passive(state);
    }
    // short stack resteal
    if (effBB <= 18 && state.minRaiseTo !== null && an.preRaiseTotal === 1 && eq > fair + 0.08 && pct < 0.25) return shove(state);
    var implied = (effStack - toCall) > toCall * 8 ? 0.06 : 0.02;
    if (pct > 0.5) implied = 0.0;
    if (eq >= odds - implied + 0.03) return callOr(state);
    return passive(state);
  }

  // ---------- postflop ----------
  var iters = opps.length >= 4 ? 450 : opps.length >= 2 ? 700 : 1000;
  var e = equity(hero, board, models.slice(0, 6), iters);
  var nOpp = opps.length;
  var fairShare = 1 / (nOpp + 1);
  var amPreAgg = an.preAggressor === me.id;
  var oppProf = nOpp === 1 ? profile(opps[0].id) : null;
  var oppFold = oppProf ? oppProf.fold : 0.35;
  var station = oppProf && oppProf.fold < 0.3 && oppProf.n > 15;
  var spr = me.stack / Math.max(1, pot);
  var river = state.street === 'river';
  var valueTh = nOpp === 1 ? 0.6 : fairShare + 0.25;
  if (station) valueTh -= 0.04;

  if (state.canCheck) {
    if (e >= valueTh) {
      var frac = e > 0.85 ? 0.8 : 0.6;
      if (river && e > 0.9) frac = 1.0;
      if (spr < 1.2) return shove(state);
      if (e < 0.75 && rand() < 0.2 && !river) return { type: 'check' };
      return raiseTo(state, me.bet + Math.max(bb, pot * frac));
    }
    if (nOpp === 1 && !station) {
      var bluffP = 0;
      if (state.street === 'flop' && amPreAgg) bluffP = 0.45 + (oppFold - 0.45);
      else if (!river && e > 0.3) bluffP = 0.3;
      else if (river && e < 0.25) bluffP = 0.12 + (oppFold - 0.45) * 0.6;
      if (rand() < bluffP) return raiseTo(state, me.bet + Math.max(bb, pot * (river ? 0.7 : 0.5)));
    } else if (nOpp === 2 && state.street === 'flop' && amPreAgg && e > 0.25 && rand() < 0.3) {
      return raiseTo(state, me.bet + Math.max(bb, pot * 0.5));
    }
    return { type: 'check' };
  }
  // facing a bet
  var raiseTh = nOpp === 1 ? 0.78 : Math.max(0.6, fairShare + 0.4);
  if (e >= raiseTh && state.minRaiseTo !== null) {
    if (spr < 2 || toCall > me.stack * 0.35) return shove(state);
    return raiseTo(state, state.currentBet * 2.8 + (pot - state.currentBet - me.bet) * 0.6);
  }
  var margin = river ? 0.01 : 0.04;
  if (toCall >= me.stack) margin = 0.02;
  if (e >= odds + margin) return callOr(state);
  // semi-bluff raise occasionally
  if (nOpp === 1 && !river && e > 0.33 && state.minRaiseTo !== null && rand() < 0.12 && oppFold > 0.4 && toCall < me.stack * 0.25) {
    return raiseTo(state, state.currentBet * 3);
  }
  return passive(state);
}

function act(state) {
  try {
    var r = decide(state);
    return sanitize(state, r);
  } catch (err) {
    return { type: state.canCheck ? 'check' : 'fold' };
  }
}
function sanitize(state, r) {
  if (!r || !r.type) return { type: state.canCheck ? 'check' : 'fold' };
  if (r.type === 'check' && !state.canCheck) return { type: 'fold' };
  if (r.type === 'call' && state.canCheck) return { type: 'check' };
  if (r.type === 'allin' && !state.canAllIn) return state.canCheck ? { type: 'check' } : { type: 'call' };
  if (r.type === 'raise') {
    var a = r.amount;
    if (state.minRaiseTo === null || !Number.isSafeInteger(a) || a <= state.currentBet || a > state.maxRaiseTo || (a < state.minRaiseTo && a !== state.maxRaiseTo)) {
      return state.canCheck ? { type: 'check' } : { type: 'call' };
    }
  }
  return r;
}

module.exports = { name: 'Opus Range Reader', act: act };
module.exports.botName = 'Opus Range Reader';
module.exports.lab = 'claude-opus-5.5';
