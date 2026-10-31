'use strict';
// SharkHoldem v1 — tight-aggressive tournament bot with position, pot-odds,
// fast Monte-Carlo equity, draw-aware semi-bluffs, push/fold short-stack
// play and lightweight opponent modeling. Always legal, bounded work.
module.exports = { name: 'SparkShark', act: act };

// Persistent memory (worker persists across hands). Lost on termination — safe.
var MEM = { lastHand: -1, lastActLen: 0, hands: {}, vpip: {}, pfr: {}, agg: {} };

function R(card) {
  var c = card.charCodeAt(0);
  if (c >= 50 && c <= 57) return c - 48; // 2-9
  if (c === 84) return 10; if (c === 74) return 11; if (c === 81) return 12;
  if (c === 75) return 13; return 14; // A
}

function chenScore(hole) {
  var r1 = R(hole[0]), r2 = R(hole[1]);
  var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  var suited = hole[0][1] === hole[1][1];
  function bv(r) {
    if (r === 14) return 10; if (r === 13) return 8; if (r === 12) return 7;
    if (r === 11) return 6; return r / 2;
  }
  var sc;
  if (r1 === r2) sc = Math.max(5, bv(hi) * 2);
  else {
    sc = bv(hi);
    if (suited) sc += 2;
    var gap = hi - lo - 1;
    if (gap === 1) sc -= 1;
    else if (gap === 2) sc -= 2;
    else if (gap === 3) sc -= 4;
    else if (gap >= 4) sc -= 5;
    if (gap <= 1 && hi < 12) sc += 1;
  }
  return sc; // ~1..20
}

function preflopTier(hole) {
  var r1 = R(hole[0]), r2 = R(hole[1]);
  var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
  var suited = hole[0][1] === hole[1][1];
  var pair = r1 === r2;
  if (pair && hi === 14) return 0; if (pair && hi === 13) return 0;
  if (pair && hi === 12) return 0; if (pair && hi === 11) return 1;
  if ((hi === 14 && lo === 13)) return suited ? 0 : 1; // AK
  if (pair && hi === 10) return 1;
  if (hi === 14 && lo === 12) return suited ? 1 : 2; // AQ
  if (pair && hi >= 8) return 2;
  if (hi === 14 && lo === 11) return suited ? 2 : 3; // AJ
  if (hi === 13 && lo === 12 && suited) return 2; // KQs
  if (hi === 14 && lo >= 10) return 3;
  if (pair) return 4; // small pairs
  if (suited && hi === 14) return 4; // Axs
  if (suited && hi - lo <= 2 && hi >= 10) return 5;
  if (hi >= 13 && lo >= 10) return 5;
  return 6;
}

function potOf(state) {
  var s = 0, i;
  for (i = 0; i < state.pots.length; i++) s += state.pots[i].amount;
  return s;
}

function liveOpps(state) {
  var out = [], i, s;
  for (i = 0; i < state.seats.length; i++) {
    s = state.seats[i];
    if (s.id !== state.you.id && !s.out && !s.folded) out.push(s);
  }
  return out;
}

function posInfo(state) {
  var n = state.seats.length, i, alive = [];
  for (i = 0; i < n; i++) if (!state.seats[i].out) alive.push(state.seats[i].seat);
  var d = (state.you.seat - state.buttonSeat + n) % n;
  var isHU = alive.length === 2;
  var late;
  if (isHU) late = (state.you.seat === state.buttonSeat);
  else late = (d === 0 || d === n - 1 || d === n - 2);
  var early = !isHU && !late && (d >= 2 && d <= 4);
  return { dist: d, late: late, early: early, hu: isHU, btn: state.you.seat === state.buttonSeat, nAlive: alive.length };
}

function track(state) {
  try {
    var h = state.handNumber;
    if (MEM.lastHand !== h) {
      MEM.lastHand = h; MEM.lastActLen = 0;
      var i, s;
      for (i = 0; i < state.seats.length; i++) {
        s = state.seats[i];
        if (!s.out) MEM.hands[s.id] = (MEM.hands[s.id] || 0) + 1;
      }
    }
    var acts = state.actions || [];
    for (var k = MEM.lastActLen; k < acts.length; k++) {
      var a = acts[k];
      if (!a) continue;
      if (a.type === 'call' || a.type === 'raise' || a.type === 'allin') {
        // voluntary money (crude: ignore blind-only preflop calls distinction)
        MEM.vpip[a.id] = (MEM.vpip[a.id] || 0) + 1;
      }
      if (a.type === 'raise' || a.type === 'allin') {
        MEM.pfr[a.id] = (MEM.pfr[a.id] || 0) + 1;
        MEM.agg[a.id] = (MEM.agg[a.id] || 0) + 1;
      }
    }
    MEM.lastActLen = acts.length;
  } catch (e) { /* ignore */ }
}

function tableLoose(state) {
  var sum = 0, n = 0, i, s;
  for (i = 0; i < state.seats.length; i++) {
    s = state.seats[i];
    if (s.id === state.you.id || s.out) continue;
    var hd = MEM.hands[s.id] || 0;
    if (hd >= 3) { sum += (MEM.vpip[s.id] || 0) / hd; n++; }
  }
  if (!n) return 0.35;
  return sum / n;
}

function raiseTo(state, target) {
  if (state.minRaiseTo === null || state.minRaiseTo === undefined) return null;
  if (!state.canAllIn && state.maxRaiseTo > state.currentBet) {
    // closed action edge: fall through only if a normal raise is legal
  }
  var min = state.minRaiseTo, max = state.maxRaiseTo;
  target = Math.floor(target);
  if (!isFinite(target)) return null;
  if (max <= state.currentBet) return null;
  if (target >= max) return state.canAllIn ? { type: 'allin' } : null;
  if (min > max) {
    // only short all-in available
    return state.canAllIn ? { type: 'allin' } : null;
  }
  if (target < min) target = min;
  if (target > max) target = max;
  if (target <= state.currentBet) return null;
  return { type: 'raise', amount: target };
}

function fallback(state) {
  if (state.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

function callOrFold(state, eq, pot, margin) {
  if (state.canCheck) return { type: 'check' };
  var odds = state.toCall / Math.max(1, pot + state.toCall);
  if (eq >= odds + margin) return { type: 'call' };
  // tiny bets are always worth a look with any equity
  if (state.toCall <= state.blinds[1] && eq > 0.25) return { type: 'call' };
  return { type: 'fold' };
}

function fastEquity(hole, board, opps) {
  try {
    if (typeof PokerEngine !== 'undefined' && PokerEngine && PokerEngine.equity) {
      var it = Math.floor(700 / (opps + 1));
      if (it < 50) it = 50;
      if (it > 150) it = 150;
      var e = PokerEngine.equity(hole, board, opps, it, Math.random);
      if (isFinite(e)) return Math.max(0, Math.min(1, e));
    }
  } catch (e) { /* fall through */ }
  return -1;
}

function heuristicEq(hole, board, madeRank) {
  // crude fallback if equity helper unavailable
  if (!board.length) {
    var t = preflopTier(hole);
    return [0.85, 0.75, 0.65, 0.58, 0.52, 0.47, 0.38][Math.min(6, t)];
  }
  var base = [0.25, 0.42, 0.62, 0.68, 0.6, 0.66, 0.8, 0.9, 0.95][Math.max(0, Math.min(8, madeRank))];
  return base;
}

function draws(hole, board) {
  var all = hole.concat(board);
  var suits = { c: 0, d: 0, h: 0, s: 0 }, i;
  for (i = 0; i < all.length; i++) suits[all[i][1]]++;
  var fd = false, nutFD = false;
  for (var su in suits) if (suits[su] === 4) {
    fd = true;
    // nut flush draw: hero holds ace of that suit
    for (i = 0; i < 2; i++) if (hole[i][1] === su && R(hole[i]) === 14) nutFD = true;
  }
  // straight draws: windows of 5 with 4 present (hero-involved)
  var set = {};
  for (i = 0; i < all.length; i++) { set[R(all[i])] = true; if (R(all[i]) === 14) set[1] = true; }
  var holeRanks = {};
  holeRanks[R(hole[0])] = true; holeRanks[R(hole[1])] = true;
  if (holeRanks[14]) holeRanks[1] = true;
  var oesd = false, gut = false;
  for (var hi = 14; hi >= 5; hi--) {
    var cnt = 0, heroIn = false, missing = [];
    for (var r = hi - 4; r <= hi; r++) {
      if (set[r]) { cnt++; if (holeRanks[r]) heroIn = true; }
      else missing.push(r);
    }
    if (cnt === 4 && heroIn) {
      // open-ended if missing an end, else gutshot
      var m = missing[0];
      if (m === hi || m === hi - 4) oesd = true; else gut = true;
    }
  }
  // pair / overcard info
  var hr1 = R(hole[0]), hr2 = R(hole[1]);
  var bRanks = board.map(R);
  var bMax = bRanks.length ? Math.max.apply(null, bRanks) : 0;
  var overcards = (hr1 > bMax ? 1 : 0) + (hr2 > bMax ? 1 : 0);
  var paired = bRanks.indexOf(hr1) >= 0 || bRanks.indexOf(hr2) >= 0;
  return { fd: fd, nutFD: nutFD, oesd: oesd, gut: gut, overcards: overcards, paired: paired };
}

function madeHand(hole, board) {
  try {
    if (typeof PokerEngine !== 'undefined' && PokerEngine.evaluate && hole.length + board.length >= 5) {
      return PokerEngine.evaluate(hole.concat(board));
    }
  } catch (e) { /* ignore */ }
  return null;
}

function act(state) {
  try {
    track(state);
    var pot = potOf(state);
    var bb = state.blinds[1] || 100;
    var opps = liveOpps(state);
    var nOpp = opps.length;
    var pos = posInfo(state);
    var heroBB = state.you.stack / Math.max(1, bb);
    var toCall = state.toCall;
    var facingBet = !state.canCheck && toCall > 0;
    var loose = tableLoose(state);

    // Count aggression on current street
    var streetAgg = 0, k;
    for (k = 0; k < state.actions.length; k++) {
      var a = state.actions[k];
      if (a.street === state.street && (a.type === 'raise' || a.type === 'allin')) streetAgg++;
    }
    var preflopRaise = state.street === 'preflop' && state.currentBet > bb;

    // ---- no opponents edge ----
    if (nOpp === 0) {
      if (state.canCheck) return { type: 'check' };
      return { type: 'call' };
    }

    // effective stack in BB (shallowest live contender)
    var eff = state.you.stack;
    for (k = 0; k < opps.length; k++) if (opps[k].stack < eff) eff = opps[k].stack;
    var effBB = eff / Math.max(1, bb);

    // ================= PREFlOP =================
    if (state.street === 'preflop') {
      var chen = chenScore(state.you.cards);
      var tier = preflopTier(state.you.cards);
      var r1 = R(state.you.cards[0]), r2 = R(state.you.cards[1]);
      var pair = r1 === r2;

      // ---- short-stack push/fold (<=11bb effective) ----
      if (effBB <= 11 && heroBB <= 14) {
        var jamT = pos.hu ? 5 : (pos.late ? 4 : 3); // tier <= jamT => jam
        if (pos.hu) jamT = 5;
        else if (pos.btn) jamT = 4;
    // who is the current aggressor? (last raise/allin actor) + how hot is this hand?
    var totalAgg = 0, lastAggId = null;
    for (k = 0; k < state.actions.length; k++) {
      var ac = state.actions[k];
      if (ac.type === 'raise' || ac.type === 'allin') { totalAgg++; lastAggId = ac.id; }
    }
    var facingRaise = state.street !== 'preflop' && streetAgg >= 2;
    var aggGames = lastAggId ? (MEM.hands[lastAggId] || 0) : 0;
    var aggRate = aggGames >= 3 ? ((MEM.agg[lastAggId] || 0) / aggGames) : 0.3;
    var aggTight = aggGames >= 3 && aggRate < 0.22;
    var aggStation = aggGames >= 5 && ((MEM.vpip[lastAggId] || 0) / aggGames) > 0.6;
    // stations call with worse: value-bet them wider, never bluff
    if (aggStation || loose > 0.55) { vStrong -= 0.04; vMonster -= 0.02; }
    // bet sizing tell: big bets + multi-street heat skew to value
    var betSizeExtra = 0;
    if (facingBet) {
      var sizeFrac = toCall / Math.max(1, pot);
      betSizeExtra += 0.03 + Math.min(0.08, sizeFrac * 0.10);
    }
    if (totalAgg >= 2) betSizeExtra += 0.04;
    if (aggTight) betSizeExtra += 0.06;

    if (!facingBet) {
          if (tier <= jamT || (heroBB <= 6 && tier <= 5)) {
            if (state.minRaiseTo !== null && state.canAllIn) {
              // open-shove short
              return { type: 'allin' };
            }
            if (state.canCheck) return { type: 'check' };
            return { type: 'call' };
          }
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        } else {
          // facing bet short: call/jam on odds + strength
          var eqS = fastEquity(state.you.cards, [], Math.min(nOpp, 3));
          if (eqS < 0) eqS = heuristicEq(state.you.cards, [], 0);
          // need better equity when busting; premium pairs/AK snap
          var need = toCall / Math.max(1, pot + toCall) + 0.04;
          if (tier <= 1) {
            if (state.canAllIn && (toCall >= state.you.stack * 0.35 || tier === 0)) return { type: 'allin' };
            return callOrFold(state, 0.6, pot, -0.05);
          }
          if (eqS >= need + 0.03 || (toCall <= bb * 3 && tier <= 4)) {
            if (toCall >= state.you.stack) return eqS >= need ? { type: 'allin' } : { type: 'fold' };
            return { type: 'call' };
          }
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        }
      }

      // ---- normal stacks ----
      if (!facingBet) {
        // open spot (includes completing SB / checking BB option)
        var openNeed = pos.hu ? 6 : (pos.late ? 7.5 : (pos.early ? 9.5 : 8.5));
        if (nOpp <= 3) openNeed -= 1.5;
        if (pos.btn) openNeed -= 0.5;
        // blind escalation: steal wider late
        var lvl = (state.tournament && state.tournament.level) || 0;
        if (pos.late && lvl >= 3) openNeed -= 1;
        var limpers = 0;
        for (k = 0; k < state.actions.length; k++)
          if (state.actions[k].street === 'preflop' && state.actions[k].type === 'call') limpers++;
        if (limpers) openNeed -= 0.5;
        var premium = tier <= 1 || chen >= 12;
        if (state.canCheck && state.currentBet === 0) {
          // shouldn't happen preflop except BB option with no raise... check unless monster to trap-raise? just check weak, raise monster if limpers
          if (premium && limpers > 0 && state.minRaiseTo !== null) {
            var t0 = state.you.bet + toCall + Math.max(bb * 3, Math.floor((pot + toCall) * 0.8) + bb * limpers);
            var rr0 = raiseTo(state, Math.max(state.minRaiseTo, t0));
            if (rr0) return rr0;
          }
          return { type: 'check' };
        }
        if (chen >= openNeed || premium || (pos.hu && pos.btn && (chen >= 5 || Math.max(r1, r2) >= 12 || state.you.cards[0][1] === state.you.cards[1][1] || Math.abs(r1 - r2) <= 2))) {          var size = (pos.late || pos.hu) ? 2.3 * bb : 2.8 * bb;
          size += limpers * bb;
          if (effBB < 25) size = 2.2 * bb + limpers * bb;
          var tgt = state.you.bet + toCall + Math.max(bb * 2, Math.floor(size));
          tgt = Math.max(tgt, state.minRaiseTo !== null ? state.minRaiseTo : tgt);
          var open = raiseTo(state, tgt);
          if (open) return open;
          if (state.canCheck) return { type: 'check' };
          return { type: 'call' };
        }
        if (state.canCheck) return { type: 'check' };
        // complete SB cheaply with speculative, else fold
        if (toCall <= bb * 0.5 + 0 && (tier <= 4 || chen >= 6)) return { type: 'call' };
        return { type: 'fold' };
      } else {
        // facing open / 3bet (or small-blind complete spot when raises==0)
        var raises = streetAgg;
        var toCallBB = toCall / Math.max(1, bb);
        var oddsP = toCall / Math.max(1, pot + toCall);
        // ---- unopened pot, small blind to complete (toCall <= 1bb, no raise yet) ----
        if (raises === 0 && toCall <= bb) {
          if (pos.hu) {
            // heads-up SB: open wide for value, otherwise complete — never fold getting 3:1
            var huOpen = tier <= 2 || chen >= 5 || Math.max(r1, r2) >= 12 ||
              state.you.cards[0][1] === state.you.cards[1][1] || Math.abs(r1 - r2) <= 2;
            if (huOpen) {
              var huT = state.you.bet + toCall + Math.floor(2.4 * bb);
              var huR = raiseTo(state, Math.max(state.minRaiseTo || 0, huT));
              if (huR) return huR;
            }
            if (state.canCheck) return { type: 'check' };
            return { type: 'call' };
          }
          var sbStrong = tier <= 1 || chen >= (pos.late ? 9 : 11);
          if (sbStrong) {
            var sbT = state.you.bet + toCall + Math.max(bb * 3, Math.floor((pot + toCall) * 0.8));
            var sbR = raiseTo(state, Math.max(state.minRaiseTo || 0, sbT));
            if (sbR) return sbR;
          }
          var sbPlay = pair || state.you.cards[0][1] === state.you.cards[1][1] ||
            Math.abs(r1 - r2) <= 2 || chen >= 4.5 || Math.max(r1, r2) === 14;
          if (sbPlay) {
            if (state.canCheck) return { type: 'check' };
            return { type: 'call' };
          }
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        }
        // 4bet+ (facing 3bet): only premiums continue
        if (raises >= 2) {
          if (tier === 0 || (pair && Math.max(r1, r2) >= 12)) {
            if (state.canAllIn && (toCall >= state.you.stack * 0.3 || effBB < 30)) return { type: 'allin' };
            var t4 = state.you.bet + toCall + Math.max(bb * 4, Math.floor((pot + toCall) * 0.9));
            var r4 = raiseTo(state, Math.max(state.minRaiseTo || 0, t4));
            if (r4) return r4;
          }
          if (state.canCheck) return { type: 'check' };
          // set-mine only if tiny relative
          if (pair && toCall <= state.you.stack * 0.08) return { type: 'call' };
          return { type: 'fold' };
        }
        // facing single raise: 3bet premiums
        if (tier <= 1 || (pair && Math.max(r1, r2) >= 11 && heroBB < 60) || chen >= 13) {
          // AA-QQ/AK: 3bet; mix call with QQ/JJ/AK OOP deep sometimes — keep simple: always 3bet tier0, 3bet tier1 unless deep multiway
          var three = state.currentBet * 3 + Math.max(0, toCall - state.currentBet);
          if (pos.late || pos.hu) three = state.currentBet * 3;
          else three = state.currentBet * 3.5;
          three = Math.floor(three) + state.you.bet - state.you.bet; // raise-to total basis below
          var tgt3 = Math.max(state.currentBet * 2.5, state.you.bet + toCall + Math.max(bb * 3, Math.floor((pot + toCall) * 0.75)));
          if (toCall >= state.you.stack * 0.35 || effBB < 22) {
            if (state.canAllIn) return { type: 'allin' };
          }
          var r3 = raiseTo(state, Math.max(state.minRaiseTo || 0, Math.floor(tgt3)));
          if (r3) return r3;
          return callOrFold(state, 0.6, pot, 0);
        }
        // flat range: pairs, suited broadways/aces, KQ/AJ, position suited connectors
        var spec = pair || (state.you.cards[0][1] === state.you.cards[1][1] && (Math.max(r1, r2) === 14 || chen >= 7)) || chen >= 8.5 || (pos.late && chen >= 7);
        // vs a proven nit raiser, dominated broadways are mucked (pairs still set-mine)
        var lastPreAgg = null;
        for (k = state.actions.length - 1; k >= 0; k--) {
          if (state.actions[k].street === 'preflop' && (state.actions[k].type === 'raise' || state.actions[k].type === 'allin')) {
            lastPreAgg = state.actions[k].id; break;
          }
        }
        if (lastPreAgg && (MEM.hands[lastPreAgg] || 0) >= 5 &&
            ((MEM.pfr[lastPreAgg] || 0) / MEM.hands[lastPreAgg]) < 0.14 &&
            !pair && tier >= 3 && oddsP > 0.22) {
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        }
        if (spec) {
          // stack-depth & odds gate for speculative
          var frac = toCall / Math.max(1, state.you.stack);
          var maxFrac = pair ? 0.12 : (chen >= 9 ? 0.14 : 0.08);
          if (pos.late) maxFrac += 0.02;
          if (frac <= maxFrac || (toCallBB <= 3 && chen >= 7)) {
            // squeeze-3bet bluff occasionally with blockers late vs 1 raiser + callers? keep rare
            if (pos.btn && tier <= 3 && raises === 1 && nOpp >= 2 && Math.random() < 0.08) {
              var sq = raiseTo(state, Math.max(state.minRaiseTo || 0, state.you.bet + toCall + Math.floor((pot + toCall) * 0.9)));
              if (sq) return sq;
            }
            if (state.canCheck) return { type: 'check' };
            // don't call huge raises with small pairs
            if (oddsP < 0.35 || tier <= 3) return { type: 'call' };
            return { type: 'fold' };
          }
          // too deep-priced: fold unless getting odds
          if (oddsP <= 0.25 && chen >= 8) return { type: 'call' };
          if (state.canCheck) return { type: 'check' };
          return { type: 'fold' };
        }
        // defend BB getting discount (+ wide heads-up defense: no ICM, chip-EV)
        if (pos.hu && raises <= 1 && toCallBB <= 3.5 && (chen >= 4.5 || Math.max(r1, r2) === 14 || pair || Math.max(r1, r2) >= 11)) {
          if (state.canCheck) return { type: 'check' };
          return { type: 'call' };
        }
        if (toCallBB <= 2 && (chen >= 6.5 || Math.max(r1, r2) === 14 || pair)) {
          if (state.canCheck) return { type: 'check' };
          return { type: 'call' };
        }
        if (state.canCheck) return { type: 'check' };
        return { type: 'fold' };
      }
    }

    // ================= POSTFLOP =================
    var board = state.board;
    var made = madeHand(state.you.cards, board);
    var mRank = made ? made.rank : 0;
    var mVal = made ? made.value : 0;
    var dr = draws(state.you.cards, board);
    var eq = fastEquity(state.you.cards, board, nOpp);
    if (eq < 0) eq = heuristicEq(state.you.cards, board, mRank);

    // board-plays discount on river: if our value equals board-only value, crush equity
    if (board.length >= 5) {
      try {
        if (typeof PokerEngine !== 'undefined' && PokerEngine.evaluate) {
          var bv = PokerEngine.evaluate(board).value;
          if (mVal <= bv) eq = Math.min(eq, 1 / (nOpp + 1) * 0.9);
        }
      } catch (e) { /* ignore */ }
    }

    // draw boost for semi-bluff willingness (not raw eq — MC already includes it)
    var drawBoost = (dr.fd ? 0.06 : 0) + (dr.oesd ? 0.06 : 0) + (dr.gut ? 0.025 : 0) + (dr.nutFD ? 0.02 : 0);
    var hasDraw = dr.fd || dr.oesd || dr.gut;

    // street-based value thresholds (tighter multiway / facing aggression)
    var vMonster = nOpp === 1 ? 0.68 : 0.62;
    var vStrong = nOpp === 1 ? 0.56 : 0.54;
    if (state.street === 'river') { vMonster -= 0.03; vStrong -= 0.02; }
    if (streetAgg >= 2) { vMonster += 0.06; vStrong += 0.05; }
    // made-hand override: two-pair+ on non-scary spot is monster regardless of MC noise
    var monsterMade = (mRank >= 3) || (mRank === 2) || (mRank >= 5);
    // top-pair-ish: treat eq>=0.55 as strong
    var margin = 0.03;
    if (streetAgg >= 1) margin = 0.06;
    if (streetAgg >= 2) margin = 0.09;
    if (nOpp >= 3) margin += 0.02;
    if (state.street === 'river' && streetAgg >= 1) margin += 0.02;
    // survival premium when calling for stacks (only multiway tournaments — heads-up is chip-EV)
    var bust = toCall >= state.you.stack && state.you.stack > 0;
    if (bust && pos.nAlive > 2 && state.handNumber < (state.tournament ? state.tournament.maxHands - 20 : 280)) {
      if (heroBB > 15) margin += 0.06;
      if (heroBB > 30) margin += 0.03;
    }

    var committed = toCall / Math.max(1, pot + toCall + state.you.stack);
    var potCommitted = toCall > 0 && (toCall / Math.max(1, state.you.stack) > 0.35);

    function valueBet(fracMin, fracMax) {
      var frac = fracMin + Math.random() * Math.max(0, fracMax - fracMin);
      // bigger multiway / wet
      if (nOpp >= 3) frac += 0.1;
      if (dr.fd || dr.oesd) frac += 0.05;
      if (frac > 1.1) frac = 1.1;
      var t = state.you.bet + toCall + Math.max(bb, Math.floor((pot + toCall) * frac));
      return raiseTo(state, Math.max(state.minRaiseTo || 0, t));
    }

    if (!facingBet) {
      // ----- free option -----
      var monster = eq >= vMonster || (monsterMade && eq >= 0.55);
      var strong = eq >= vStrong;
      if (monster) {
        // slowplay full houses/quads multiway sometimes
        if (mRank >= 6 && nOpp >= 2 && Math.random() < 0.25) return { type: 'check' };
        var b1 = valueBet(0.55, 0.85);
        if (b1) return b1;
        return { type: 'check' };
      }
      if (strong) {
        // check back some medium-strong multiway / scary boards
        if (nOpp >= 3 && Math.random() < 0.3) return { type: 'check' };
        var b2 = valueBet(0.45, 0.7);
        if (b2) return b2;
        return { type: 'check' };
      }
      // medium + draw: semi-bluff c-bet heads-up / in position
      var bluffFreq = 0.35;
      if (loose > 0.55) bluffFreq = 0.12; // never bluff stations
      else if (loose < 0.3) bluffFreq = 0.5;
      var wantSemi = hasDraw && eq >= 0.42 && nOpp <= 2 && (pos.late || pos.hu || pos.btn);
      // pure bluff: tight table, heads-up, no showdown value, blocker-ish (ace high / missed draw)
      var pureBluff = !hasDraw && eq >= 0.3 && eq < vStrong && nOpp === 1 && !pos.early &&
        (state.street === 'river' ? mRank === 0 : (mRank <= 1 && !dr.paired)) && loose < 0.45;
      if (wantSemi && Math.random() < bluffFreq) {
        var bs = valueBet(0.4, 0.6);
        if (bs) return bs;
        return { type: 'check' };
      }
      if (pureBluff && Math.random() < (state.street === 'river' ? 0.22 : 0.12) && loose < 0.38) {
        var pb = valueBet(0.5, 0.65);
        if (pb) return pb;
      }
      return { type: 'check' };
    } else {
      // ----- facing bet -----
      var odds = toCall / Math.max(1, pot + toCall);
      var monsterF = eq >= vMonster || (monsterMade && eq >= 0.55);
      // vs a RAISE (not a plain bet): the range is narrow — need a real hand, never inflate without the nuts
      if (facingRaise) {
        var needR = state.street === 'river' ? 0.66 : (nOpp === 1 ? 0.60 : 0.62);
        if (monsterF) {
          if (bust || potCommitted) {
            if (state.canAllIn && eq > 0.6) return { type: 'allin' };
            return { type: 'call' };
          }
          var rt2 = state.you.bet + toCall + Math.max(bb * 2, Math.floor((pot + toCall) * 0.75));
          var rv2 = raiseTo(state, Math.max(state.minRaiseTo || 0, rt2));
          if (rv2) return rv2;
          return { type: 'call' };
        }
        if (eq >= needR) return { type: 'call' };
        // drawing odds only for tiny prices with backup
        if (toCall <= pot * 0.22 && effEq > 0.35) return { type: 'call' };
        return { type: 'fold' };
      }
      var betMargin = margin + betSizeExtra;
      // commit with the nuts
      if (monsterF) {
        if (bust || potCommitted) {
          if (state.canAllIn && eq > 0.55) return { type: 'allin' };
          return { type: 'call' };
        }
        // raise for value; slowplay trap 20% heads-up small bets
        if (nOpp === 1 && toCall <= pot * 0.5 && Math.random() < 0.2 && state.street !== 'river') return { type: 'call' };
        var rfrac = state.street === 'river' ? 0.8 : 0.7;
        var rt = state.you.bet + toCall + Math.max(bb * 2, Math.floor((pot + toCall) * rfrac));
        // shove if raise would commit us
        if (state.maxRaiseTo > 0 && rt >= state.maxRaiseTo * 0.6 && eq >= 0.7 && state.canAllIn && effBB < 30) return { type: 'allin' };
        var rv = raiseTo(state, Math.max(state.minRaiseTo || 0, rt));
        if (rv) {
          // avoid tiny scared raises that give odds; otherwise take it
          return rv;
        }
        return { type: 'call' };
      }
      var strongF = eq >= vStrong;
      if (strongF) {
        if (bust) {
          // call off with strong+ unless horrid odds multiway
          if (eq >= odds + betMargin - 0.02) {
            if (state.canAllIn && eq >= 0.6 && toCall >= state.you.stack * 0.5) return { type: 'allin' };
            return { type: 'call' };
          }
          return { type: 'fold' };
        }
        // raise sometimes as value/protection heads-up
        if (nOpp === 1 && eq >= vStrong + 0.08 && toCall <= pot * 0.6 && Math.random() < 0.3 && state.street !== 'river') {
          var rs = raiseTo(state, Math.max(state.minRaiseTo || 0, state.you.bet + toCall + Math.floor((pot + toCall) * 0.7)));
          if (rs) return rs;
        }
        return callOrFold(state, eq, pot, betMargin);
      }
      // medium / draws: continue on odds
      var effEq = eq + (state.street !== 'river' && hasDraw ? 0.015 : 0);
      // raise-fold-equity semi-bluff: small bet, HU, position, decent backup
      if (!bust && nOpp === 1 && hasDraw && (dr.fd || dr.oesd) && eq + drawBoost >= 0.45 &&
          toCall <= pot * 0.6 && (pos.late || pos.hu) && streetAgg <= 1 && loose < 0.55 && Math.random() < 0.22) {
        var semi = raiseTo(state, Math.max(state.minRaiseTo || 0, state.you.bet + toCall + Math.floor((pot + toCall) * 0.75)));
        if (semi) return semi;
      }
      // straight pot-odds call, with overcall caution multiway facing big bet
      var m2 = betMargin;
      if (state.street === 'flop' && hasDraw && nOpp <= 2) m2 -= 0.02; // implied odds
      if (effEq >= odds + m2) return { type: 'call' };
      // backdoor/overcard cheap peel
      if (toCall <= pot * 0.25 && effEq > 0.28) return { type: 'call' };
      return { type: 'fold' };
    }
  } catch (err) {
    try { if (state && state.canCheck) return { type: 'check' }; } catch (e) { /* ignore */ }
    return { type: 'fold' };
  }
}
