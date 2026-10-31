'use strict';

// ===================== Tunables =====================
var CFG = {
  openThr: { ep: 0.560, mp: 0.525, co: 0.495, btn: 0.455, sb: 0.545, bb: 0.560 },
  callRaiseThr: 0.468,
  call3BetThr: 0.565,
  shoveHU: [ // [bbs, hu-equity cutoff] to jam an unraised pot
    [2, 0.20], [4, 0.37], [6, 0.405], [8, 0.435], [10, 0.452]
  ],
  mwPenalty: 0.045,
  betThr: { flop: 0.565, turn: 0.565, river: 0.585 },
  semiBluff: 0.48,
  tossupBluff: 0.42,
  riverBluffProb: 0.085,
  callMargin: { flop: 0.018, turn: 0.022, river: 0.030 },
  behindMargin: 0.012,
  raiseThr: 0.76,
  riverValueRaise: 0.82,
  milkProbHU: 0.42,
  milkProbMW: 0.15,
  milkOff: false,
  rangeAware: true,
  preBlend: 0.65,   // weight of range-filtered equity in preflop shove decisions
  postRangeEqOn: true,
  rangeRaiseThr: 0.72,
  riverRangeRaise: 0.78
};

// ===================== RNG =====================
var rngState = 0x9E3779B9 ^ 0x1F123BB5;
function rnd() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ===================== Hand classification =====================
var RANKS = '23456789TJQKA';
function classId(a, b) {
  var ra = RANKS.indexOf(a[0]), rb = RANKS.indexOf(b[0]);
  var hi = ra >= rb ? a[0] : b[0];
  var lo = ra >= rb ? b[0] : a[0];
  if (ra === rb) return hi + lo + 'p';
  return a[1] === b[1] ? hi + lo + 's' : hi + lo + 'o';
}

var PREFLOP = {"AKs":[0.6716,0.3558],"AKo":[0.6522,0.3235],"AQs":[0.6626,0.3344],"AQo":[0.6426,0.3046],"AJs":[0.6567,0.3175],"AJo":[0.6363,0.2894],"ATs":[0.6436,0.3116],"ATo":[0.6274,0.2749],"A9s":[0.6279,0.2773],"A9o":[0.6048,0.2467],"A8s":[0.6198,0.2746],"A8o":[0.5976,0.2286],"A7s":[0.6136,0.2628],"A7o":[0.5858,0.2214],"A6s":[0.5973,0.2527],"A6o":[0.5748,0.2091],"A5s":[0.6031,0.2574],"A5o":[0.5774,0.2219],"A4s":[0.5887,0.2521],"A4o":[0.57,0.2159],"A3s":[0.5812,0.2511],"A3o":[0.5598,0.2056],"A2s":[0.5768,0.2343],"A2o":[0.5486,0.198],"AAp":[0.8522,0.5644],"KQs":[0.6344,0.3264],"KQo":[0.6119,0.2895],"KJs":[0.6276,0.3059],"KJo":[0.6017,0.278],"KTs":[0.6182,0.3012],"KTo":[0.5976,0.2635],"K9s":[0.5986,0.2693],"K9o":[0.5808,0.2367],"K8s":[0.5838,0.2503],"K8o":[0.5607,0.2149],"K7s":[0.5727,0.2413],"K7o":[0.5488,0.2065],"K6s":[0.5638,0.2359],"K6o":[0.5438,0.1968],"K5s":[0.5587,0.229],"K5o":[0.5325,0.1916],"K4s":[0.5447,0.2235],"K4o":[0.5269,0.1826],"K3s":[0.5429,0.2232],"K3o":[0.5193,0.1806],"K2s":[0.5299,0.2137],"K2o":[0.5016,0.1659],"KKp":[0.8239,0.4968],"QJs":[0.6031,0.2995],"QJo":[0.5812,0.2732],"QTs":[0.5979,0.2959],"QTo":[0.574,0.2568],"Q9s":[0.5765,0.2639],"Q9o":[0.5579,0.2295],"Q8s":[0.5647,0.2396],"Q8o":[0.5393,0.2037],"Q7s":[0.544,0.2255],"Q7o":[0.5253,0.1842],"Q6s":[0.5363,0.2158],"Q6o":[0.515,0.1767],"Q5s":[0.5324,0.2184],"Q5o":[0.5009,0.1723],"Q4s":[0.5136,0.205],"Q4o":[0.4903,0.1688],"Q3s":[0.5084,0.201],"Q3o":[0.4818,0.1615],"Q2s":[0.504,0.1973],"Q2o":[0.4723,0.156],"QQp":[0.7981,0.4496],"JTs":[0.5726,0.2878],"JTo":[0.5498,0.2508],"J9s":[0.5564,0.2622],"J9o":[0.5348,0.2256],"J8s":[0.5364,0.2426],"J8o":[0.5177,0.2007],"J7s":[0.5192,0.2181],"J7o":[0.4973,0.1813],"J6s":[0.502,0.205],"J6o":[0.4742,0.165],"J5s":[0.5041,0.1962],"J5o":[0.47,0.1644],"J4s":[0.4874,0.1959],"J4o":[0.4663,0.1517],"J3s":[0.4806,0.185],"J3o":[0.448,0.147],"J2s":[0.474,0.1862],"J2o":[0.4421,0.1409],"JJp":[0.7739,0.3975],"T9s":[0.54,0.2563],"T9o":[0.5179,0.2241],"T8s":[0.5252,0.2428],"T8o":[0.4976,0.2056],"T7s":[0.5048,0.2194],"T7o":[0.4822,0.1878],"T6s":[0.4861,0.2069],"T6o":[0.4599,0.1636],"T5s":[0.4719,0.1882],"T5o":[0.4439,0.1452],"T4s":[0.4657,0.1918],"T4o":[0.4338,0.1439],"T3s":[0.456,0.179],"T3o":[0.4275,0.1391],"T2s":[0.4529,0.1737],"T2o":[0.4167,0.1342],"TTp":[0.7486,0.3599],"98s":[0.5077,0.2406],"98o":[0.4834,0.1957],"97s":[0.4872,0.2226],"97o":[0.4621,0.18],"96s":[0.4732,0.2046],"96o":[0.4426,0.1664],"95s":[0.4598,0.1856],"95o":[0.4268,0.1507],"94s":[0.4382,0.1725],"94o":[0.4093,0.1331],"93s":[0.4301,0.1665],"93o":[0.4009,0.1264],"92s":[0.423,0.1625],"92o":[0.3917,0.1185],"99p":[0.7184,0.3228],"87s":[0.4774,0.2213],"87o":[0.4496,0.1806],"86s":[0.4644,0.2033],"86o":[0.4336,0.1761],"85s":[0.4456,0.1902],"85o":[0.4138,0.1528],"84s":[0.4257,0.1715],"84o":[0.3994,0.1353],"83s":[0.4089,0.1648],"83o":[0.3743,0.1176],"82s":[0.4036,0.1583],"82o":[0.3696,0.1159],"88p":[0.6939,0.2993],"76s":[0.454,0.2104],"76o":[0.4207,0.1727],"75s":[0.4355,0.1987],"75o":[0.4014,0.1507],"74s":[0.4171,0.1815],"74o":[0.3793,0.1351],"73s":[0.4016,0.1638],"73o":[0.3647,0.1196],"72s":[0.3798,0.1492],"72o":[0.3456,0.1091],"77p":[0.6628,0.2667],"65s":[0.4325,0.1964],"65o":[0.3987,0.1584],"64s":[0.4138,0.1829],"64o":[0.3819,0.1461],"63s":[0.3951,0.1675],"63o":[0.3589,0.1312],"62s":[0.3746,0.1525],"62o":[0.3441,0.1107],"66p":[0.6333,0.2448],"54s":[0.4166,0.1897],"54o":[0.385,0.1481],"53s":[0.3974,0.1764],"53o":[0.3637,0.1388],"52s":[0.3817,0.1661],"52o":[0.3413,0.1146],"55p":[0.6034,0.2193],"43s":[0.3906,0.1702],"43o":[0.3496,0.1338],"42s":[0.3672,0.1604],"42o":[0.3334,0.114],"44p":[0.5725,0.2052],"32s":[0.3602,0.1523],"32o":[0.3258,0.1092],"33p":[0.5317,0.1917],"22p":[0.4996,0.1747]}; // simulated HU/4-way equity vs random by class // {id:[hu,mw]} swapped in below once generated

function huEq(id) {
  if (PREFLOP && PREFLOP[id]) return PREFLOP[id][0];
  return fallbackHU(id);
}
function fallbackHU(id) {
  var hi = RANKS.indexOf(id[0]), lo = RANKS.indexOf(id[1]);
  var base = hi >= 11 ? 0.44 + hi * 0.017 : 0.44 - (12 - hi) * 0.007;
  var pair = id[2] === 'p' ? 0.05 + hi * 0.011 : 0;
  var suited = id[2] === 's' ? 0.012 + (hi - lo <= 3 ? 0.006 : 0) : -0.005;
  return Math.max(0.28, Math.min(0.88, base + pair + suited));
}
function eqVsN(id, n) {
  var hu = huEq(id);
  if (PREFLOP && PREFLOP[id]) {
    var mw = PREFLOP[id][1];
    if (n <= 4) return hu + (mw - hu) * Math.min(1, Math.max(0, (n - 1) / 3));
    return mw + (mw - hu) * 0.05 * Math.min(4, n - 4);
  }
  return hu * 1.6 / (1.6 + Math.max(0, n - 1) * 1.05);
}

// ===================== Range percentile of preflop classes =====================
var CLASS_PCT = null;
(function buildClassPct() {
  if (!PREFLOP) return;
  var list = [];
  for (var id in PREFLOP) list.push([id, PREFLOP[id][0]]);
  list.sort(function (a, b) { return b[1] - a[1]; });
  var w = function (id) { return id[2] === 'p' ? 6 : id[2] === 's' ? 4 : 12; };
  var tot = 0;
  for (var i = 0; i < list.length; i++) tot += w(list[i][0]);
  var pct = {}, acc = 0;
  for (var j = 0; j < list.length; j++) {
    pct[list[j][0]] = acc / tot;
    acc += w(list[j][0]);
  }
  CLASS_PCT = pct;
})();
function oppPct(holeCards) {
  if (!CLASS_PCT) return 0.5;
  var id = classId(holeCards[0], holeCards[1]);
  return CLASS_PCT[id] || 0.5;
}

// Monte Carlo equity vs opponents constrained to a preflop percentile band.
// board is empty for all-in preflop range math.
function mcRangeEquity(meCards, board, nOpp, rangePct, iters, rnd) {
  var R = '23456789TJQKA', S = 'cdhs';
  var seen = {};
  var i;
  for (i = 0; i < meCards.length; i++) seen[meCards[i]] = 1;
  for (i = 0; i < board.length; i++) seen[board[i]] = 1;
  var deck = [];
  for (var r = 0; r < 13; r++) for (var s = 0; s < 4; s++) {
    var cs = R[r] + S[s];
    if (!seen[cs]) deck.push(cs);
  }
  var needOpp = nOpp * 2, needBoard = 5 - board.length;
  var total = needOpp + needBoard;
  var sum = 0, got = 0, guard = iters * 4 + 40;
  var ev2 = new Array(nOpp + 1);
  while (got < iters && guard-- > 0) {
    var d = deck.slice();
    for (var k = 0; k < total; k++) {
      var j = k + Math.floor(rnd() * (d.length - k));
      var t = d[k]; d[k] = d[j]; d[j] = t;
    }
    var ok = true;
    for (i = 0; i < nOpp; i++) {
      if (oppPct([d[2 * i], d[2 * i + 1]]) > rangePct) { ok = false; break; }
    }
    if (!ok) continue;
    var full = board.slice();
    for (i = 0; i < needBoard; i++) full.push(d[needOpp + i]);
    try {
      for (i = 0; i <= nOpp; i++) {
        ev2[i] = PokerEngine.evaluate([i === 0 ? meCards[0] : d[2 * (i - 1)],
          i === 0 ? meCards[1] : d[2 * (i - 1) + 1],
          full[0], full[1], full[2], full[3], full[4]]);
      }
    } catch (e) { continue; }
    var best = -1;
    for (i = 0; i <= nOpp; i++) if (ev2[i].value > best) best = ev2[i].value;
    var ties = 0;
    for (i = 0; i <= nOpp; i++) if (ev2[i].value === best) ties++;
    if (ev2[0].value === best) sum += 1 / ties;
    got++;
  }
  return got ? sum / got : 0.5;
}

// ===================== Table helpers =====================
function sumPots(pots) {
  var s = 0;
  for (var i = 0; i < pots.length; i++) s += pots[i].amount;
  return s;
}
function liveOpps(state, me) {
  var out = [], seats = state.seats;
  for (var i = 0; i < seats.length; i++) {
    var s = seats[i];
    if (s.id !== me.id && !s.out && !s.folded) out.push(s);
  }
  return out;
}
function ableSeats(state) {
  var out = [];
  for (var i = 0; i < state.seats.length; i++) {
    var s = state.seats[i];
    if (!s.out && !s.folded && !s.allIn) out.push(s);
  }
  return out;
}
// number of able opponents who could still act (re-raise) after me
function oppsBehind(state, me) {
  var able = ableSeats(state);
  var behind = 0;
  for (var i = 0; i < able.length; i++) {
    var s = able[i];
    if (s.id === me.id) continue;
    var d = (s.seat - me.seat + state.seats.length) % state.seats.length;
    if (d > 0) behind++;
  }
  return behind;
}

var seedsHand = 0; // unused guard to keep module state bounded

// ===================== Action constructors =====================
function callA(state) {
  return state.canCheck ? { type: 'check' } : { type: 'call' };
}
function safeAct(state) {
  return state.canCheck ? { type: 'check' } : { type: 'call' };
}
// target = raise-to total street contribution; noJam avoids committing stack with marginal hands
function raiseTo(state, target, noJam) {
  var minTo = state.minRaiseTo, maxTo = state.maxRaiseTo;
  target = Math.round(target);
  if (minTo === null) {
    // no raise right: all-in call is legal only if canAllIn
    if (state.canAllIn && target >= maxTo) return { type: 'allin' };
    return safeAct(state);
  }
  if (target >= maxTo) {
    if (noJam) return null; // caller decides cheap defense
    return { type: 'allin' };
  }
  if (target < minTo) target = minTo;
  if (target > maxTo) return noJam ? null : { type: 'allin' };
  return { type: 'raise', amount: target };
}

// Estimate opponents' preflop continuing-percentile from preflop (and street) actions.
function oppRangePct(state, me, opps) {
  var bb = state.blinds[1];
  var pct = 1.0, anyRaise = false, myRaiseTo = 0;
  var preActs = state.actions.filter(function (a) { return a.street === 'preflop'; });
  var postAggro = false;
  var i, a;
  for (i = 0; i < preActs.length; i++) {
    a = preActs[i];
    if (a.id !== me.id && (a.type === 'raise' || a.type === 'allin')) anyRaise = true;
    if (a.id === me.id && (a.type === 'raise' || a.type === 'allin')) myRaiseTo += a.amount;
  }
  for (i = 0; i < state.actions.length; i++) {
    a = state.actions[i];
    if (a.id !== me.id && a.street !== 'preflop' && a.street !== 'preflop' &&
      (a.type === 'raise' || a.type === 'allin')) postAggro = true;
  }
  for (i = 0; i < preActs.length; i++) {
    a = preActs[i];
    if (a.id === me.id) continue;
    if (a.type === 'call' && a.amount > 0) {
      if (anyRaise) {
        var r = (myRaiseTo || bb * 2.4) / bb;
        pct = Math.min(pct, Math.max(0.16, 0.52 - r * 0.035));
      } else {
        pct = Math.min(pct, 0.78);
      }
    }
  }
  if (postAggro) pct = Math.min(pct, 0.40);
  return pct;
}

// ===================== PREFLOP =====================
function shoveThrBB(dr, nOpp) {
  var t = CFG.shoveHU, last = t[t.length - 1];
  var v;
  if (dr <= t[0][0]) v = t[0][1];
  else if (dr >= last[0]) v = last[1];
  else {
    for (var i = 1; i < t.length; i++) {
      if (t[i][0] >= dr) {
        var a = t[i - 1], b = t[i];
        v = a[1] + (dr - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
        break;
      }
    }
  }
  return v + (nOpp - 1) * CFG.mwPenalty;
}

function decidePreflop(state) {
  var me = state.you;
  var bb = state.blinds[1], sb = state.blinds[0];
  var opps = liveOpps(state, me);
  var nOpp = opps.length;
  var id = classId(me.cards[0], me.cards[1]);
  var hu = huEq(id);
  var eqN = eqVsN(id, nOpp);
  var dr = me.stack / bb;
  var pot = sumPots(state.pots);
  var facing = state.toCall;

  var raises = 0, calls = 0;
  for (var i = 0; i < state.actions.length; i++) {
    var a = state.actions[i];
    if (a.type === 'raise' || a.type === 'allin') raises++;
    else if (a.type === 'call' && a.amount > 0) calls++;
  }
  var limpers = calls;
  // order tier: count active seats that act before me (post-BB order approximation)
  var tier = preflopTier(state);

  // ---------- facing serious pressure: Monte Carlo the all-in ----------
  if (facing >= 6 * bb) {
    var plausible = raises >= 1 || facing >= 4 * bb;
    if (plausible && facing >= 0.22 * me.stack) {
      var mc = PokerEngine.equity(me.cards, [], Math.max(1, nOpp), 240, rnd);
      var odds = facing / (pot + facing);
      var eff = mc;
      if (CFG.rangeAware) {
        var rp = raises >= 2 ? 0.12 : raises === 1
          ? (facing >= 8.5 * bb ? 0.30 : 0.27)
          : (limpers > 0 ? 0.6 : 1.0);
        if (rp < 0.95) {
          var it2 = Math.min(520, Math.round(Math.max(180, 190 / Math.max(0.2, rp))));
          var mcR = mcRangeEquity(me.cards, [], Math.max(1, nOpp), rp, it2, rnd);
          eff = (1 - CFG.preBlend) * mc + CFG.preBlend * mcR;
        }
      }
      if (eff >= odds + 0.012) {
        if (eff > 0.74 && raises === 1 && dr > 14 && state.minRaiseTo !== null && rnd() < 0.65) {
          return raiseTo(state, state.currentBet * 2.5 + bb * calls);
        }
        return callA(state);
      }
      return { type: 'fold' };
    }
  }

  // ---------- short stack: jam / fold mode ----------
  if (dr <= 10) {
    if (raises === 0 && (facing === 0 || facing <= bb)) {
      var thr = shoveThrBB(dr, nOpp);
      var bonus = (tier === 'btn' || tier === 'sb' || tier === 'bb' || tier === 'co' ? 0.022 : 0)
        + Math.min(0.03, limpers * 0.015);
      if (hu >= thr - bonus) return { type: 'allin' };
      if (state.canCheck) return { type: 'check' };
      if (facing <= bb && (hu >= thr - 0.055 && (id[2] === 's' || id[2] === 'p'))) return callA(state);
      return { type: 'fold' };
    }
    if (raises === 1) {
      var odds1 = facing / (pot + facing);
      if (eqN >= Math.max(odds1 + 0.02, shoveThrBB(dr, nOpp) - 0.055)) return callA(state);
      return { type: 'fold' };
    }
  }

  // ---------- unraised pot ----------
  if (raises === 0) {
    if (state.canCheck && facing === 0) {
      // BB checked option / heads-up BB
      if (hu >= 0.615 || (hu >= 0.565 && nOpp <= 2)) {
        return raiseTo(state, me.bet + bb * (3 + limpers), dr > 13 && hu < 0.58);
      }
      return { type: 'check' };
    }
    var openThr = CFG.openThr[tier];
    var drop = Math.max(0, Math.min(0.025, limpers * 0.008));
    if (hu >= openThr - drop) {
      var sizeBB = 2.3 + Math.min(2.5, limpers) * 0.95
        + (tier === 'ep' ? 0.25 : tier === 'btn' ? -0.15 : 0);
      var to = me.bet + Math.round(bb * sizeBB);
      if (to >= state.maxRaiseTo * 0.62) {
        if (dr <= 10 || hu > 0.60) return { type: 'allin' };
        // deep stack: a 60%-of-stack raise is awkward; call cheap instead
        return midDefend(state, facing, pot);
      }
      var act = raiseTo(state, Math.max(to, state.minRaiseTo || 0), false);
      return act || midDefend(state, facing, pot);
    }
    if (state.canCheck) return { type: 'check' };
    if (facing <= bb) {
      var callOk = hu >= CFG.callRaiseThr || (id[2] === 's' && hu >= CFG.callRaiseThr - 0.03) ||
        (hu >= 0.44 && limpers >= 2 && dr >= 14);
      if (callOk) return callA(state);
    }
    return { type: 'fold' };
  }

  // ---------- facing a single raise ----------
  if (raises === 1) {
    var want3Bet = hu >= 0.645 || (hu >= 0.585 && (tier === 'btn' || tier === 'co' || tier === 'sb') && facing <= bb * 3);
    if (want3Bet && state.minRaiseTo !== null) {
      var to3 = state.currentBet * 2.55 + (calls > 0 ? bb : 0);
      var act3 = raiseTo(state, to3, dr > 13 && hu < 0.62);
      if (act3) return act3;
    }
    var odds1b = facing / (pot + facing);
    var implied = (id[2] === 's' ? 0.02 : 0) + (dr >= 15 ? 0.012 : 0);
    if (hu >= CFG.callRaiseThr + 0.008 - implied && (facing <= me.stack * 0.55 || hu >= 0.585)) return callA(state);
    if (eqN >= odds1b + 0.02 && facing <= me.stack * 0.55) return callA(state);
    return { type: 'fold' };
  }

  // ---------- facing 3-bet or more ----------
  if (hu >= CFG.call3BetThr) {
    if (hu >= 0.70 && dr > 12 && state.minRaiseTo !== null) {
      return raiseTo(state, Math.max(state.minRaiseTo, state.currentBet * 2.2), hu < 0.75);
    }
    return callA(state);
  }
  if (hu >= 0.565 && facing <= bb * 3.5 && dr > 14) return callA(state);
  if (state.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

function midDefend(state, facing, pot) {
  if (state.canCheck) return { type: 'check' };
  if (facing <= state.blinds[1] * 1.1) return callA(state);
  return { type: 'fold' };
}

// Position tier by number of live seats that will act after me preflop.
function preflopTier(state) {
  var me = state.you;
  var ns = state.seats.length;
  // preflop act order: seats clockwise from left of BB, with SB and BB last
  var order = [], s = (state.bigBlindSeat + 1) % ns;
  for (var i = 0; i < ns; i++) {
    var seat = state.seats[s];
    if (!seat.out && !seat.folded && !seat.allIn) order.push(seat);
    s = (s + 1) % ns;
  }
  var idx = -1;
  for (var j = 0; j < order.length; j++) if (order[j].id === me.id) { idx = j; break; }
  if (idx < 0) idx = order.length - 1;
  var fromEnd = order.length - 1 - idx; // 0 = last to act (BB)
  if (order.length <= 2) return idx === 0 ? 'btn' : 'sb';
  if (fromEnd === 0) return 'bb';
  if (fromEnd === 1) return 'sb';
  if (fromEnd === 2) return 'btn';
  if (fromEnd === 3) return 'co';
  if (fromEnd <= order.length / 2) return 'mp';
  return 'ep';
}

// ===================== POSTFLOP =====================
function postflopTier(state) {
  var me = state.you;
  var ns = state.seats.length;
  var order = [], s = (state.buttonSeat + 1) % ns;
  for (var i = 0; i < ns; i++) {
    var seat = state.seats[s];
    if (!seat.out && !seat.folded && !seat.allIn) order.push(seat);
    s = (s + 1) % ns;
  }
  var idx = -1;
  for (var j = 0; j < order.length; j++) if (order[j].id === me.id) { idx = j; break; }
  return { inPosition: idx === order.length - 1, idx: idx, n: order.length };
}

function decidePostflop(state) {
  var me = state.you;
  var bb = state.blinds[1];
  var opps = liveOpps(state, me);
  var nOpp = Math.max(1, opps.length);
  var street = state.street;
  var pot = sumPots(state.pots);
  var facing = state.toCall;
  var dr = me.stack / bb;
  var mcIters = street === 'river' ? 360 : (nOpp <= 2 ? 300 : 220);
  var eq = PokerEngine.equity(me.cards, state.board, nOpp, mcIters, rnd);

  var oppAggro = 0;
  for (var i = 0; i < state.actions.length; i++) {
    var a = state.actions[i];
    if (a.id !== me.id && a.street === street && (a.type === 'raise' || a.type === 'allin')) oppAggro++;
  }
  var pos = postflopTier(state);
  var behind = Math.min(3, Math.max(0, oppsBehind(state, me) - (pos.inPosition ? 0 : 1)));

  var potOdds = facing > 0 ? facing / (pot + facing) : 0;
  var vThr = Math.min(0.9, CFG.betThr[street] + Math.max(0, nOpp - 2) * 0.02);
  var margin = CFG.callMargin[street] + behind * CFG.behindMargin;

  // ---------- no one has bet: value bet / semi-bluff / check ----------
  if (state.canCheck) {
    if (street !== 'river' && facing === 0 && nOpp <= 2 && pos.inPosition === false && eq >= CFG.betThr[street]) {
      // out of position value bet slightly stronger only
    }
    if (street === 'river' && nOpp <= 2 && eq < CFG.betThr.river - 0.13 && rnd() < CFG.riverBluffProb) {
      var bs = pot * (nOpp === 1 ? 0.7 : 0.55);
      var noJamBluff = dr > 8;
      var bluff = raiseTo(state, me.bet + Math.round(Math.max(bb, bs)), noJamBluff);
      if (bluff && (bluff.type === 'raise' || bluff.type === 'allin')) return bluff;
    }
    if (eq >= vThr) {
      var frac = street === 'river' ? (eq > 0.92 ? 0.85 : eq > 0.8 ? 0.7 : 0.55)
        : (eq > 0.87 ? 0.75 : 0.62);
      var size = Math.round(pot * frac);
      if (me.stack <= Math.max(pot * 1.25, bb * 3.5)) return { type: 'allin' };
      var act = raiseTo(state, me.bet + Math.max(bb, size), false);
      return act || (state.canAllIn ? { type: 'allin' } : { type: 'check' });
    }
    if (street !== 'river' && nOpp <= 2 && oppAggro === 0 &&
      eq >= (rnd() < 0.5 ? CFG.semiBluff : CFG.tossupBluff) && rnd() < 0.5) {
      var sbSize = Math.round(pot * 0.58);
      var act2 = raiseTo(state, me.bet + Math.max(bb, sbSize), dr > 9);
      if (act2 && act2.type === 'raise') return act2;
      if (act2 && act2.type === 'allin') return act2;
    }
    // milk: betting middling equity folds out almost-equity hands
    if (nOpp <= 2 && !CFG.milkOff) {
      var mp = nOpp === 1 ? CFG.milkProbHU : CFG.milkProbMW;
      if (eq >= 0.30 && rnd() < mp) {
        var mSize = Math.round(pot * (street === 'river' ? 0.5 : 0.55));
        var mAct = raiseTo(state, me.bet + Math.max(bb, mSize), false);
        if (mAct) return mAct;
      }
    }
    return { type: 'check' };
  }

  // ---------- facing a bet ----------
  // range-filtered equity when opponents showed a continuing preflop range
  var eqR = null;
  if (CFG.rangeAware && CFG.postRangeEqOn && nOpp <= 3 && state.board.length >= 3) {
    var pct = oppRangePct(state, me, opps);
    if (pct < 0.92) {
      var itR = Math.min(430, Math.round(Math.max(200, 160 / Math.max(0.18, pct))));
      eqR = mcRangeEquity(me.cards, state.board, nOpp, pct, itR, rnd);
    }
  }
  var eff2 = eqR === null ? eq : (0.7 * eqR + 0.3 * eq);
  var valueRaiseThr = street === 'river' ? CFG.riverValueRaise : CFG.raiseThr + oppAggro * 0.04;
  var rangeRaise = street === 'river' ? CFG.riverRangeRaise : CFG.rangeRaiseThr;
  if (eqR !== null && eqR >= Math.min(valueRaiseThr, rangeRaise) && state.minRaiseTo !== null) {
    var factor = street === 'river' ? (eqR > 0.93 ? 3.1 : 2.55) : (eqR > 0.91 ? 3.4 : 2.85);
    var vr = raiseTo(state, state.currentBet * factor, dr > 14 && eqR < 0.87);
    if (vr) return vr;
  } else if (eq >= valueRaiseThr && state.minRaiseTo !== null) {
    var factor2 = street === 'river' ? (eq > 0.93 ? 3.1 : 2.55) : (eq > 0.91 ? 3.4 : 2.85);
    var vr2 = raiseTo(state, state.currentBet * factor2, dr > 14 && eq < 0.87);
    if (vr2) return vr2;
  }
  if (eff2 >= potOdds + margin * 0.8) return { type: 'call' };
  // implied odds on the flop while deep
  if (street === 'flop' && facing <= me.stack * 0.25 && dr >= 14 && eq >= potOdds + margin - 0.014) return { type: 'call' };
  // tiny bet: sticky
  if (potOdds <= 0.10 && eq >= potOdds + 0.004) return { type: 'call' };
  // very short: shove-or-fold simplification tolerates slight negative chip EV
  if (dr < 2.2 && eq >= potOdds - 0.01) return { type: 'allin' };
  return { type: 'fold' };
}

// ===================== Dispatch =====================
// Final legality snap: every returned action must satisfy the engine contract.
function snap(state, a) {
  if (!a || typeof a.type !== 'string') return safeAct(state);
  if (a.type === 'fold') return { type: 'fold' };
  if (a.type === 'check') return state.canCheck ? { type: 'check' } : { type: 'fold' };
  if (a.type === 'call') return callA(state);
  if (a.type === 'raise') {
    if (state.minRaiseTo === null) return state.canAllIn ? { type: 'allin' } : safeAct(state);
    if (typeof a.amount !== 'number' || !Number.isSafeInteger(a.amount)) return safeAct(state);
    var t = Math.round(a.amount);
    if (t <= state.currentBet) return state.canAllIn && state.maxRaiseTo > state.currentBet ? { type: 'allin' } : safeAct(state);
    if (t > state.maxRaiseTo) t = state.maxRaiseTo;
    if (t < state.minRaiseTo && t !== state.maxRaiseTo) {
      if (state.maxRaiseTo >= state.minRaiseTo) t = state.minRaiseTo;
      else return state.canAllIn ? { type: 'allin' } : safeAct(state);
    }
    return { type: 'raise', amount: t };
  }
  if (a.type === 'allin') return state.canAllIn ? { type: 'allin' } : safeAct(state);
  return safeAct(state);
}

function decide(state) {
  return state.street === 'preflop' ? decidePreflop(state) : decidePostflop(state);
}

module.exports = {
  name: 'Turbo Holdem',
  CFG: CFG,
  act: function (state) {
    try {
      var a = decide(state);
      return snap(state, a);
    } catch (e) {
      try { return state.canCheck ? { type: 'check' } : { type: 'fold' }; } catch (e2) { return { type: 'fold' }; }
    }
  }
};
