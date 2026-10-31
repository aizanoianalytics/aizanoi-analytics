'use strict';

const RANKS = '23456789TJQKA';

function rankOf(card) {
  return RANKS.indexOf(card[0]) + 2;
}

function chenScore(hole) {
  const r1 = rankOf(hole[0]);
  const r2 = rankOf(hole[1]);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const face = r => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r === 10 ? 5 : r / 2);
  if (hi === lo) return Math.max(5, face(hi) * 2);
  let s = face(hi) + face(lo);
  const gap = hi - lo - 1;
  if (gap === 1) s -= 1;
  else if (gap === 2) s -= 2;
  else if (gap === 3) s -= 4;
  else if (gap >= 4) s -= 5;
  if (hole[0][1] === hole[1][1]) s += 2;
  if (gap === 0 && hi <= 10) s += 1;
  return s;
}

function potSum(state) {
  let total = 0;
  for (const p of state.pots) total += p.amount;
  return total;
}

function liveOpps(state) {
  const list = [];
  for (const s of state.seats) {
    if (s.id !== state.you.id && !s.out && !s.folded) list.push(s);
  }
  return list;
}

function oppCount(state) {
  return liveOpps(state).length;
}

function actingOpps(state) {
  let n = 0;
  for (const s of state.seats) {
    if (s.id !== state.you.id && !s.out && !s.folded && !s.allIn) n++;
  }
  return n;
}

function postflopActorsAfter(state) {
  const N = state.seats.length;
  const button = state.buttonSeat;
  const you = state.you.seat;
  const key = d => (d === 0 ? N : d);
  const ky = key((you - button + N) % N);
  let count = 0;
  for (const s of state.seats) {
    if (s.out || s.folded || s.seat === you) continue;
    if (key((s.seat - button + N) % N) > ky) count++;
  }
  return count;
}

function preflopActorsAfter(state) {
  const actedIds = new Set();
  for (const a of state.actions) {
    if (a.street === 'preflop') actedIds.add(a.id);
  }
  const N = state.seats.length;
  const you = state.you.seat;
  let count = 0;
  for (let i = 1; i < N; i++) {
    const s = state.seats[(you + i) % N];
    if (s.out || s.folded || s.allIn) continue;
    if (actedIds.has(s.id)) continue;
    count++;
  }
  return count;
}

function preflopAggressor(state) {
  for (const a of state.actions) {
    if (a.street === 'preflop' && (a.type === 'raise' || a.type === 'allin')) return a.id;
  }
  return null;
}

function effectiveStack(state) {
  let best = state.you.stack;
  for (const s of state.seats) {
    if (s.id !== state.you.id && !s.out && !s.folded) best = Math.min(best, s.stack);
  }
  return best;
}

const model = { lastHand: 0, nSeen: 0, raised: false, ids: {} };

function observe(state) {
  if (state.handNumber !== model.lastHand) {
    model.lastHand = state.handNumber;
    model.nSeen = 0;
    model.raised = false;
  }
  const acts = state.actions;
  for (let i = model.nSeen; i < acts.length; i++) {
    const a = acts[i];
    const isRaise = a.type === 'raise' || a.type === 'allin';
    if (a.id === state.you.id) {
      if (isRaise) model.raised = true;
      continue;
    }
    let st = model.ids[a.id];
    if (!st) st = model.ids[a.id] = { bets: 0, calls: 0, folds: 0, faced: 0, foldFaced: 0, decisions: 0 };
    st.decisions++;
    if (model.raised) {
      st.faced++;
      if (a.type === 'fold') st.foldFaced++;
    }
    if (isRaise) {
      st.bets++;
      model.raised = true;
    } else if (a.type === 'call') st.calls++;
    else if (a.type === 'fold') st.folds++;
  }
  model.nSeen = acts.length;
}

function foldinessOf(state, id) {
  const st = model.ids[id];
  if (!st || st.faced < 5) return 0.42;
  return st.foldFaced / st.faced;
}

function bluffScale(state, opps) {
  let minF = 1;
  let any = false;
  for (const o of opps) {
    const st = model.ids[o.id];
    if (!st || st.decisions < 5) continue;
    any = true;
    minF = Math.min(minF, foldinessOf(state, o.id));
  }
  if (!any) return 0.65;
  return Math.max(0, Math.min(1, (minF - 0.25) / 0.45));
}

function stationOf(state, opps) {
  let best = 0;
  for (const o of opps) {
    const st = model.ids[o.id];
    if (!st || st.decisions < 5) continue;
    const aggression = st.bets / st.decisions;
    const f = foldinessOf(state, o.id);
    let s = 0;
    if (aggression < 0.1) s += 0.55;
    if (f < 0.2) s += 0.45;
    s *= Math.min(1, st.decisions / 12);
    best = Math.max(best, Math.min(1, s));
  }
  return best;
}

function drawFeatures(hole, board) {
  const all = hole.concat(board);
  const suitCount = { c: 0, d: 0, h: 0, s: 0 };
  const present = new Set();
  for (const card of all) {
    suitCount[card[1]]++;
    present.add(rankOf(card));
  }
  let fd = false;
  for (const s of 'cdhs') {
    if (suitCount[s] === 4 && (hole[0][1] === s || hole[1][1] === s)) fd = true;
  }
  let oesd = false;
  let gutter = false;
  const hasAny = r => (r === 1 ? present.has(14) : present.has(r));
  for (let a = 2; a <= 10; a++) {
    if (hasAny(a) && hasAny(a + 1) && hasAny(a + 2) && hasAny(a + 3)) {
      const low = a - 1 >= 1 && !hasAny(a - 1);
      const high = !hasAny(a + 4);
      if (low && high) oesd = true;
      else if (low || high) gutter = true;
    }
  }
  if (present.has(14) && hasAny(2) && hasAny(3) && hasAny(4)) {
    if (!hasAny(5)) gutter = true;
  }
  for (let a = 2; a <= 10; a++) {
    let missing = 0;
    let interior = true;
    for (let i = 0; i < 5; i++) {
      if (!hasAny(a + i)) {
        missing++;
        if (i === 0 || i === 4) interior = false;
      }
    }
    if (missing === 1 && interior) gutter = true;
  }
  return { fd, oesd, gutter };
}

function wetness(board) {
  if (board.length < 3) return 0;
  let w = 0;
  const suits = {};
  const ranks = new Set();
  for (const c of board) {
    suits[c[1]] = (suits[c[1]] || 0) + 1;
    ranks.add(rankOf(c));
  }
  let maxSuit = 0;
  for (const k in suits) maxSuit = Math.max(maxSuit, suits[k]);
  if (maxSuit >= 2) w += 1;
  const rs = [...ranks].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < rs.length; i++) {
    if (rs[i] - rs[i - 1] === 1) conn++;
  }
  if (conn >= 2) w += 1;
  else if (conn === 1) {
    let near = false;
    for (let i = 1; i < rs.length; i++) if (rs[i] - rs[i - 1] === 2) near = true;
    if (near) w += 0.5;
  }
  return w;
}

function makeRaise(state, target) {
  const min = state.minRaiseTo;
  const max = state.maxRaiseTo;
  if (min == null) return null;
  if (!Number.isFinite(target)) target = min;
  if (min > max) {
    if (state.canAllIn && max > state.currentBet) return { type: 'allin' };
    return null;
  }
  let t = Math.round(target);
  if (t < min) t = min;
  if (t > max) t = max;
  if (t <= state.currentBet) {
    return state.canAllIn ? { type: 'allin' } : null;
  }
  return { type: 'raise', amount: t };
}

function makeBet(state, fraction, pot) {
  if (state.minRaiseTo == null) return state.canCheck ? { type: 'check' } : null;
  let t = Math.floor(pot * fraction);
  if (state.currentBet === 0) t = Math.max(t, state.blinds[1]);
  else t = Math.max(t, state.currentBet + state.lastFullRaise);
  t = Math.max(t, state.minRaiseTo);
  if (t > state.maxRaiseTo) {
    if (state.canAllIn) return { type: 'allin' };
    t = state.maxRaiseTo;
    if (t <= state.currentBet) return state.canCheck ? { type: 'check' } : null;
    if (t < state.minRaiseTo) return null;
    return { type: 'raise', amount: t };
  }
  return { type: 'raise', amount: t };
}

function openAction(state, ch, stackBB, opp, limpers) {
  const bb = state.blinds[1];
  if (stackBB <= 8.5) return { type: 'allin' };
  let base = opp === 1 ? 2.2 : opp <= 3 ? 2.5 : 2.7;
  if (limpers > 0) base += 0.55 * limpers;
  base += Math.min(0.6, ch / 30);
  if (stackBB <= 14 && ch >= 13.5) return { type: 'allin' };
  const action = makeRaise(state, Math.round(base * bb));
  if (action) return action;
  if (state.canAllIn) return { type: 'allin' };
  return { type: 'check' };
}

function raiserPosition(state) {
  const rid = preflopAggressor(state);
  if (!rid) return 2;
  const raiser = state.seats.find(s => s.id === rid);
  if (!raiser) return 2;
  const N = state.seats.length;
  const key = d => (d === 0 ? N : d);
  const rKey = key((raiser.seat - state.buttonSeat + N) % N);
  let after = 0;
  for (const s of state.seats) {
    if (s.out || s.folded || s.seat === raiser.seat) continue;
    if (key((s.seat - state.buttonSeat + N) % N) > rKey) after++;
  }
  return after;
}

function preflopDecision(state) {
  const hole = state.you.cards;
  const ch = chenScore(hole);
  const opps = liveOpps(state);
  const opp = opps.length;
  const bb = state.blinds[1];
  const stack = state.you.stack;
  const stackBB = stack / bb;
  const toCall = state.toCall;
  const pot = potSum(state);
  const raised = state.actions.some(a => a.type === 'raise' || a.type === 'allin');
  const effBB = effectiveStack(state) / bb;
  const isHU = opp === 1;
  const onButton = state.buttonSeat === state.you.seat;
  const station = stationOf(state, opps);
  const bScale = bluffScale(state, opps);

  if (!raised) {
    let openTh;
    if (isHU) {
      openTh = onButton ? 1.5 - 0.5 * station : 6.5;
    } else {
      const aa = postflopActorsAfter(state);
      openTh = aa >= 4 ? 8.6 : aa === 3 ? 7.2 : aa === 2 ? 6.3 : 5.3;
      if (aa <= 1) openTh -= 0.8 * station;
    }
    const limpers = state.actions.filter(a => a.type === 'call').length;
    openTh += limpers * (station > 0.5 ? 1.1 : 1.5);

    if (toCall === 0) {
      if (ch >= openTh || (effBB <= 12 && stackBB <= 14 && ch >= openTh - 1.3 && station < 0.4)) {
        return openAction(state, ch, stackBB, opp, limpers);
      }
      return { type: 'check' };
    }

    const potOdds = toCall / Math.max(1, pot + toCall);
    if (isHU && onButton) {
      if (stackBB <= 9) {
        if (ch >= 2.0) return { type: 'allin' };
        return { type: 'fold' };
      }
      if (ch >= 1.6) return openAction(state, ch, stackBB, opp, 0);
      if (ch >= -1 && potOdds <= 0.22) return { type: 'call' };
      return { type: 'fold' };
    }
    if (stackBB <= 9 || effBB <= 8) {
      if (ch >= openTh - 0.8 && state.canAllIn) return { type: 'allin' };
      return { type: 'fold' };
    }
    if (ch >= openTh + 1.2) return openAction(state, ch, stackBB, opp, limpers);
    if (ch >= openTh - 2.8 && potOdds <= 0.34) return { type: 'call' };
    return { type: 'fold' };
  }

  const raiseTo = state.currentBet;
  const raiseSizeBB = raiseTo / bb;
  const behind = preflopActorsAfter(state);
  const potOdds = toCall / Math.max(1, pot + toCall);
  const committed = toCall >= stack * 0.8;

  if (committed) {
    const eq = PokerEngine.equity(hole, [], Math.max(1, opp), 500, Math.random);
    const callTh = isHU ? 0.42 : 0.47 + 0.03 * (opp - 2);
    const req = potOdds + (isHU ? 0.05 : 0.08) + (opp >= 3 ? 0.03 : 0);
    const chFloor = isHU ? 2.5 : 6.5;
    if (eq >= Math.max(req, callTh) && ch >= chFloor) return { type: 'call' };
    if (state.canAllIn && isHU && behind <= 1 && ch >= 13.5 && raiseSizeBB <= 12) {
      return { type: 'allin' };
    }
    return { type: 'fold' };
  }

  if (isHU) {
    if (onButton) {
      if (ch >= 13.5) {
        const a = makeRaise(state, Math.max(state.minRaiseTo || 0, raiseTo + bb * 3));
        if (a) return a;
      }
      if (ch >= 8.5) {
        const a = makeRaise(state, Math.max(state.minRaiseTo || 0, raiseTo + bb * 2.5));
        if (a) return a;
      }
      if (ch >= 4.5 && bScale > 0.5 && Math.random() < 0.25 * bScale) {
        const a = makeRaise(state, Math.max(state.minRaiseTo || 0, raiseTo + bb * 3));
        if (a) return a;
      }
      return { type: 'fold' };
    }
    if (ch >= 13.5) {
      const a = makeRaise(state, Math.max(state.minRaiseTo || 0, raiseTo + bb * 3));
      if (a) return a;
    }
    if (ch >= 4.2 && potOdds <= 0.42) return { type: 'call' };
    return { type: 'fold' };
  }

  const valueTh = raiseSizeBB <= 2.6 ? 13.6 : raiseSizeBB <= 3.5 ? 14.4 : 15.2;
  if (ch >= valueTh) {
    const a = makeRaise(state, Math.max(state.minRaiseTo || 0, raiseTo + bb * (3 + Math.min(1, raiseSizeBB * 0.3))));
    if (a) return a;
  }

  const suitedAceLow = hole[0][1] === hole[1][1] && Math.max(rankOf(hole[0]), rankOf(hole[1])) === 14 &&
    Math.min(rankOf(hole[0]), rankOf(hole[1])) <= 5;
  const suitedConnector = hole[0][1] === hole[1][1] &&
    Math.abs(rankOf(hole[0]) - rankOf(hole[1])) <= 2 &&
    Math.max(rankOf(hole[0]), rankOf(hole[1])) <= 11 &&
    Math.max(rankOf(hole[0]), rankOf(hole[1])) >= 5;
  const bluff3 = behind <= 1 && toCall <= bb * 2.2 && Math.random() < 0.34 * bScale &&
    ((suitedAceLow && ch >= 7.5) || (suitedConnector && ch >= 9.5 && Math.random() < 0.4));
  if (bluff3 && state.minRaiseTo != null) {
    const a = makeRaise(state, Math.max(state.minRaiseTo, raiseTo + bb * 3));
    if (a) return a;
  }

  const raiserAA = raiserPosition(state);
  let callTh = raiserAA >= 4 ? 10.2 : raiserAA >= 2 ? 8.8 : 7.6;
  if (behind >= 2) callTh += 1.4;
  if (behind >= 4) callTh += 1.2;
  callTh -= Math.min(2.2, Math.max(0, 0.42 - potOdds) * 8);
  if (station > 0.5) callTh -= 0.8;

  const implied = (suitedConnector || (hole[0][1] === hole[1][1] && Math.abs(rankOf(hole[0]) - rankOf(hole[1])) === 3)) &&
    postflopActorsAfter(state) <= 2 && ch >= 8.5;
  if (ch >= callTh || (implied && ch >= 8.5 && potOdds <= 0.34 && Math.random() < 0.55)) {
    if (effBB <= 10 && ch < 12) {
      const eq = PokerEngine.equity(hole, [], opp, 400, Math.random);
      if (eq >= potOdds + 0.1) return { type: 'call' };
      return { type: 'fold' };
    }
    return { type: 'call' };
  }
  return { type: 'fold' };
}

function postflopDecision(state) {
  const hole = state.you.cards;
  const board = state.board;
  const opps = liveOpps(state);
  const opp = opps.length;
  const toCall = state.toCall;
  const pot = potSum(state);
  const stack = state.you.stack;
  const iters = board.length === 3 ? 700 : board.length === 4 ? 900 : 1200;
  const eq = PokerEngine.equity(hole, board, Math.max(1, opp), iters, Math.random);
  const made = PokerEngine.evaluate(hole.concat(board)).rank;
  const feats = drawFeatures(hole, board);
  const wet = wetness(board);
  const inPos = postflopActorsAfter(state) === 0;
  const canAct = actingOpps(state);
  const multiAdj = 0.045 * Math.max(0, opp - 1);
  const bb = state.blinds[1];
  const raiseAgg = preflopAggressor(state) === state.you.id;
  const station = stationOf(state, opps);
  const bScale = bluffScale(state, opps);
  const valueTh = 0.57 - 0.16 * station + multiAdj + (inPos ? 0 : 0.02);
  const raiseThV = 0.71 - 0.05 * station + multiAdj + (inPos ? 0 : 0.02);

  if (toCall === 0) {
    if (canAct === 0) return { type: 'check' };

    let frac = 0;
    if (eq >= 0.88 + multiAdj) frac = 0.78 + 0.1 * wet;
    else if (eq >= 0.71 - 0.03 * station + multiAdj) frac = 0.62 + 0.12 * wet;
    else if (eq >= valueTh) frac = 0.5 + 0.1 * wet;
    else if (station > 0.4 && opp <= 2 && eq >= 0.32) frac = 0.36;
    else if ((feats.fd || feats.oesd) && eq >= 0.3 && eq <= 0.55 &&
      Math.random() < (opp <= 2 ? (inPos ? 0.7 : 0.5) : 0.28)) {
      frac = 0.55 + 0.1 * wet;
    } else if (opp === 1 && raiseAgg && state.street === 'flop' && eq > 0.32 &&
      eq < 0.56 && Math.random() < 0.55 * bScale) {
      frac = 0.38 + 0.08 * wet;
    } else if (opp === 1 && raiseAgg && state.street === 'turn' && eq > 0.35 &&
      eq < 0.55 && Math.random() < 0.42 * bScale) {
      frac = 0.42 + 0.08 * wet;
    } else if (opp === 1 && state.street === 'river' && eq < 0.4 && eq > 0.1 &&
      Math.random() < 0.3 * bScale && pot >= bb * 1.5) {
      frac = 0.52;
    } else if (opp === 1 && state.street === 'river' && eq >= 0.4 && eq < valueTh &&
      Math.random() < 0.65) {
      frac = 0.36;
    }

    if (frac > 0) {
      if (stack <= pot * 1.05 && eq >= 0.55) return { type: 'allin' };
      const a = makeBet(state, frac, pot);
      if (a && a.type !== 'check') return a;
    }
    return { type: 'check' };
  }

  const facingBet = Math.max(toCall, state.currentBet - state.you.bet);
  const sfrac = facingBet / Math.max(1, pot);
  const potOdds = toCall / Math.max(1, pot + toCall);
  const facingAllin = toCall >= stack * 0.85;

  if (facingAllin) {
    const callTh = opp === 1 ? 0.5 : 0.52 + 0.035 * (opp - 2);
    if (eq >= callTh || (opp === 1 && made >= 3 && eq >= 0.47)) return { type: 'call' };
    if (opp === 1 && (feats.fd || feats.oesd) && eq >= 0.45 && Math.random() < 0.25) {
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  let req = potOdds + 0.04 + 0.2 * Math.min(1.3, sfrac) + multiAdj * 0.45 + (inPos ? 0 : 0.015);
  if (wet >= 1.5 && sfrac > 0.7) req += 0.025;
  if (state.street === 'river' && sfrac > 1.0) req += 0.03;

  const canRaise = state.minRaiseTo != null;
  if (canRaise && eq >= raiseThV && sfrac < 1.6) {
    if (!(made <= 1 && eq < 0.78 && sfrac > 1.1)) {
      const target = state.you.bet + toCall + Math.floor((pot + toCall) * (0.52 + 0.16 * wet));
      const cap = state.currentBet + Math.floor(pot * 1.1);
      const a = makeRaise(state, Math.min(target, Math.max(cap, state.minRaiseTo)));
      if (a && a.type !== 'check') return a;
    }
  }

  if (canRaise && sfrac < 0.95 && (feats.fd || feats.oesd) && eq >= 0.33 && eq < raiseThV &&
    Math.random() < (opp === 1 ? (inPos ? 0.45 : 0.3) : 0.12) + 0.2 * station) {
    const target = state.you.bet + toCall + Math.floor((pot + toCall) * 0.55);
    const a = makeRaise(state, target);
    if (a && a.type !== 'check') return a;
  }

  if (opp === 1 && canRaise && state.street === 'river' && !feats.fd && !feats.oesd &&
    eq < 0.3 && sfrac < 0.7 && potOdds < 0.2 && Math.random() < 0.14 * bScale) {
    const target = state.you.bet + toCall + Math.floor((pot + toCall) * 0.65);
    const a = makeRaise(state, target);
    if (a && a.type !== 'check') return a;
  }

  if (eq >= req) {
    if (eq >= 0.62 + multiAdj && stack >= toCall * 3 && canRaise && sfrac < 0.8) {
      const target = state.you.bet + toCall + Math.floor((pot + toCall) * 0.5);
      const a = makeRaise(state, target);
      if (a && a.type !== 'check') return a;
    }
    return { type: 'call' };
  }

  if (toCall <= Math.max(bb * 0.5, pot * 0.055) && eq > 0.27 && opp <= 2) return { type: 'call' };
  if (opp === 1 && toCall <= pot * 0.12 && eq > 0.33 && feats.fd) return { type: 'call' };

  return { type: 'fold' };
}

function fallback(state) {
  return state.canCheck ? { type: 'check' } : { type: 'fold' };
}

function validate(action, state) {
  if (!action || typeof action !== 'object') return fallback(state);
  switch (action.type) {
    case 'fold':
      return action;
    case 'check':
      return state.canCheck ? action : fallback(state);
    case 'call':
      return !state.canCheck && state.toCall > 0 ? action : (state.canCheck ? { type: 'check' } : fallback(state));
    case 'allin':
      return state.canAllIn ? action : fallback(state);
    case 'raise': {
      const a = action.amount;
      if (!Number.isSafeInteger(a) || state.minRaiseTo == null) return fallback(state);
      if (a <= state.currentBet || a > state.maxRaiseTo) return fallback(state);
      if (a < state.minRaiseTo && a !== state.maxRaiseTo) return fallback(state);
      return action;
    }
    default:
      return fallback(state);
  }
}

module.exports = {
  name: 'Mimo Edge',
  act(state) {
    try {
      observe(state);
      let action;
      if (state.street === 'preflop') action = preflopDecision(state);
      else action = postflopDecision(state);
      return validate(action, state);
    } catch (e) {
      return fallback(state);
    }
  }
};
