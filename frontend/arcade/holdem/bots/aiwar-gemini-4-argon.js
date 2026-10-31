'use strict';

// ============================================================================
// ARGON - Advanced Adaptive No-Limit Hold'em Tournament Bot
// ============================================================================

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';

// Ultra-fast lookup tables for 52 cards (0..51)
const CARD_TO_INDEX = Object.create(null);
const CARD_RANK = new Uint8Array(52); // 2..14
const CARD_SUIT = new Uint8Array(52); // 0..3
for (let r = 0; r < 13; r++) {
  for (let s = 0; s < 4; s++) {
    const idx = r * 4 + s;
    const str = RANKS[r] + SUITS[s];
    CARD_TO_INDEX[str] = idx;
    CARD_RANK[idx] = r + 2;
    CARD_SUIT[idx] = s;
  }
}

// Fast 7-card evaluator returning integer score where higher always beats lower
const STRAIGHT_MASK_HIGH = new Uint8Array(8192);
(function initStraightMasks() {
  for (let mask = 0; mask < 8192; mask++) {
    let hi = 0;
    for (let top = 12; top >= 4; top--) {
      const m = 0x1F << (top - 4);
      if ((mask & m) === m) {
        hi = top + 2;
        break;
      }
    }
    if (!hi && (mask & 0x100F) === 0x100F) {
      hi = 5;
    }
    STRAIGHT_MASK_HIGH[mask] = hi;
  }
})();

function eval7Fast(c0, c1, c2, c3, c4, c5, c6) {
  const r0 = CARD_RANK[c0], s0 = CARD_SUIT[c0];
  const r1 = CARD_RANK[c1], s1 = CARD_SUIT[c1];
  const r2 = CARD_RANK[c2], s2 = CARD_SUIT[c2];
  const r3 = CARD_RANK[c3], s3 = CARD_SUIT[c3];
  const r4 = CARD_RANK[c4], s4 = CARD_SUIT[c4];
  const r5 = CARD_RANK[c5], s5 = CARD_SUIT[c5];
  const r6 = CARD_RANK[c6], s6 = CARD_SUIT[c6];

  const sc0 = (s0 === 0) + (s1 === 0) + (s2 === 0) + (s3 === 0) + (s4 === 0) + (s5 === 0) + (s6 === 0);
  const sc1 = (s0 === 1) + (s1 === 1) + (s2 === 1) + (s3 === 1) + (s4 === 1) + (s5 === 1) + (s6 === 1);
  const sc2 = (s0 === 2) + (s1 === 2) + (s2 === 2) + (s3 === 2) + (s4 === 2) + (s5 === 2) + (s6 === 2);
  const sc3 = 7 - sc0 - sc1 - sc2;

  let flushMask = 0;
  if (sc0 >= 5) flushMask = ((s0 === 0) << (r0 - 2)) | ((s1 === 0) << (r1 - 2)) | ((s2 === 0) << (r2 - 2)) | ((s3 === 0) << (r3 - 2)) | ((s4 === 0) << (r4 - 2)) | ((s5 === 0) << (r5 - 2)) | ((s6 === 0) << (r6 - 2));
  else if (sc1 >= 5) flushMask = ((s0 === 1) << (r0 - 2)) | ((s1 === 1) << (r1 - 2)) | ((s2 === 1) << (r2 - 2)) | ((s3 === 1) << (r3 - 2)) | ((s4 === 1) << (r4 - 2)) | ((s5 === 1) << (r5 - 2)) | ((s6 === 1) << (r6 - 2));
  else if (sc2 >= 5) flushMask = ((s0 === 2) << (r0 - 2)) | ((s1 === 2) << (r1 - 2)) | ((s2 === 2) << (r2 - 2)) | ((s3 === 2) << (r3 - 2)) | ((s4 === 2) << (r4 - 2)) | ((s5 === 2) << (r5 - 2)) | ((s6 === 2) << (r6 - 2));
  else if (sc3 >= 5) flushMask = ((s0 === 3) << (r0 - 2)) | ((s1 === 3) << (r1 - 2)) | ((s2 === 3) << (r2 - 2)) | ((s3 === 3) << (r3 - 2)) | ((s4 === 3) << (r4 - 2)) | ((s5 === 3) << (r5 - 2)) | ((s6 === 3) << (r6 - 2));

  if (flushMask) {
    const sfHi = STRAIGHT_MASK_HIGH[flushMask];
    if (sfHi) return 8 * 759375 + sfHi * 50625;
  }

  const rankMask = (1 << (r0 - 2)) | (1 << (r1 - 2)) | (1 << (r2 - 2)) | (1 << (r3 - 2)) | (1 << (r4 - 2)) | (1 << (r5 - 2)) | (1 << (r6 - 2));

  let loCounts = 0;
  let hiCounts = 0;
  if (r0 <= 8) loCounts += 1 << ((r0 - 2) * 4); else hiCounts += 1 << ((r0 - 9) * 4);
  if (r1 <= 8) loCounts += 1 << ((r1 - 2) * 4); else hiCounts += 1 << ((r1 - 9) * 4);
  if (r2 <= 8) loCounts += 1 << ((r2 - 2) * 4); else hiCounts += 1 << ((r2 - 9) * 4);
  if (r3 <= 8) loCounts += 1 << ((r3 - 2) * 4); else hiCounts += 1 << ((r3 - 9) * 4);
  if (r4 <= 8) loCounts += 1 << ((r4 - 2) * 4); else hiCounts += 1 << ((r4 - 9) * 4);
  if (r5 <= 8) loCounts += 1 << ((r5 - 2) * 4); else hiCounts += 1 << ((r5 - 9) * 4);
  if (r6 <= 8) loCounts += 1 << ((r6 - 2) * 4); else hiCounts += 1 << ((r6 - 9) * 4);

  let quad = 0;
  let trip1 = 0, trip2 = 0;
  let pair1 = 0, pair2 = 0;
  let single1 = 0, single2 = 0, single3 = 0, single4 = 0, single5 = 0;

  for (let r = 14; r >= 2; r--) {
    const c = r <= 8 ? ((loCounts >>> ((r - 2) * 4)) & 0xF) : ((hiCounts >>> ((r - 9) * 4)) & 0xF);
    if (c === 0) continue;
    if (c === 4) {
      quad = r;
    } else if (c === 3) {
      if (!trip1) trip1 = r;
      else trip2 = r;
    } else if (c === 2) {
      if (!pair1) pair1 = r;
      else if (!pair2) pair2 = r;
      else if (!single1) single1 = r;
    } else {
      if (!single1) single1 = r;
      else if (!single2) single2 = r;
      else if (!single3) single3 = r;
      else if (!single4) single4 = r;
      else if (!single5) single5 = r;
    }
  }

  if (quad) {
    const kicker = Math.max(trip1, pair1, single1);
    return 7 * 759375 + quad * 50625 + kicker * 3375;
  }
  if (trip1 && (trip2 || pair1)) {
    const housePair = Math.max(trip2, pair1);
    return 6 * 759375 + trip1 * 50625 + housePair * 3375;
  }
  if (flushMask) {
    let fScore = 5 * 759375;
    let mult = 50625;
    let found = 0;
    for (let r = 14; r >= 2; r--) {
      if (flushMask & (1 << (r - 2))) {
        fScore += r * mult;
        mult = (mult / 15) | 0;
        if (++found === 5) break;
      }
    }
    return fScore;
  }
  const stHi = STRAIGHT_MASK_HIGH[rankMask];
  if (stHi) {
    return 4 * 759375 + stHi * 50625;
  }
  if (trip1) {
    return 3 * 759375 + trip1 * 50625 + single1 * 3375 + single2 * 225;
  }
  if (pair1 && pair2) {
    const k = Math.max(single1, 0);
    return 2 * 759375 + pair1 * 50625 + pair2 * 3375 + k * 225;
  }
  if (pair1) {
    return 1 * 759375 + pair1 * 50625 + single1 * 3375 + single2 * 225 + single3 * 15;
  }
  return single1 * 50625 + single2 * 3375 + single3 * 225 + single4 * 15 + single5;
}

// Fast 169 preflop hand rank / percentile table (1.0 = AA, 0.005 = 72o)
const PREFLOP_PCT_BY_CARDS = new Float32Array(52 * 52);
(function initPreflopTable() {
  const ordered169 = [
    'AA','KK','QQ','JJ','TT','AKs','99','AQs','AKo','AJs','KQs','88','ATs','AQo','KJs',
    'KTs','QJs','AJo','KQo','77','A9s','ATo','QTs','KJo','66','JTs','A8s','K9s','Q9s',
    'A7s','KTo','QJo','55','A5s','A9o','A6s','QTo','J9s','A4s','T9s','K8s','A8o','A3s',
    'K9o','44','JTo','Q8s','K7s','A7o','A2s','98s','T8s','Q9o','J8s','K6s','33','A5o',
    '87s','K5s','A6o','Q7s','K8o','T9o','A4o','97s','J9o','K4s','76s','Q6s','22','T7s',
    'A3o','K7o','86s','K3s','Q5s','J7s','65s','98o','A2o','Q8o','K2s','Q4s','75s','T8o',
    '96s','J8o','K6o','54s','Q3s','85s','64s','T6s','J6s','87o','Q2s','K5o','76o','97o',
    'J5s','53s','74s','K4o','Q7o','T7o','J4s','65o','86o','95s','43s','J7o','K3o','Q6o',
    'T5s','63s','J3s','84s','54o','75o','K2o','Q5o','96o','T4s','J2s','52s','73s','T3s',
    '64o','85o','Q4o','42s','94s','T6o','T2s','J6o','62s','83s','93s','Q3o','53o','74o',
    '32s','82s','92s','J5o','Q2o','43o','72s','95o','J4o','63o','84o','T5o','J3o','52o',
    '73o','T4o','J2o','42o','94o','T3o','62o','83o','32o','93o','T2o','82o','92o','72o'
  ];
  const map169 = new Map();
  const total = ordered169.length;
  for (let i = 0; i < total; i++) {
    const h = ordered169[i];
    const r1 = RANKS.indexOf(h[0]) + 2;
    const r2 = RANKS.indexOf(h[1]) + 2;
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);
    const suited = h.length === 3 && h[2] === 's' ? 1 : 0;
    map169.set(hi * 100 + lo * 2 + suited, 1 - i / total);
  }
  for (let c1 = 0; c1 < 52; c1++) {
    for (let c2 = 0; c2 < 52; c2++) {
      if (c1 === c2) continue;
      const r1 = CARD_RANK[c1], r2 = CARD_RANK[c2];
      const hi = r1 > r2 ? r1 : r2;
      const lo = r1 > r2 ? r2 : r1;
      const suited = CARD_SUIT[c1] === CARD_SUIT[c2] ? 1 : 0;
      PREFLOP_PCT_BY_CARDS[c1 * 52 + c2] = map169.get(hi * 100 + lo * 2 + suited) || 0.2;
    }
  }
})();

function getPreflopPercentile(card1Str, card2Str) {
  const c1 = CARD_TO_INDEX[card1Str];
  const c2 = CARD_TO_INDEX[card2Str];
  return PREFLOP_PCT_BY_CARDS[c1 * 52 + c2];
}

// Persistent Opponent Modeling State
const memory = {
  lastHandNumber: -1,
  lastActionIndex: 0,
  processedShowdowns: new Set(),
  players: new Map(),
  handState: {
    preflopAggressor: null,
    streetAggressor: null,
    threeBetters: new Set(),
    vpipThisHand: new Set(),
    pfrThisHand: new Set(),
    sawFlopThisHand: new Set(),
    cbetOppThisHand: new Set(),
    postflopRaisers: new Set()
  }
};

function getPlayerStats(id) {
  let st = memory.players.get(id);
  if (!st) {
    st = {
      handsDealt: 0,
      vpip: 0,
      pfr: 0,
      threeBet: 0,
      threeBetOpp: 0,
      foldToPF3Bet: 0,
      pf3BetFaced: 0,
      postflopBetsRaises: 0,
      postflopCalls: 0,
      postflopFolds: 0,
      postflopChecks: 0,
      cbet: 0,
      cbetOpp: 0,
      foldToCbet: 0,
      cbetFaced: 0,
      wentToShowdown: 0,
      sawFlop: 0,
      showdownStrong: 0,
      showdownBluff: 0,
      allInsPreflop: 0
    };
    memory.players.set(id, st);
  }
  return st;
}

function updateTracking(state) {
  if (Array.isArray(state.history)) {
    for (const h of state.history) {
      if (!h || memory.processedShowdowns.has(h.handNumber)) continue;
      memory.processedShowdowns.add(h.handNumber);
      if (Array.isArray(h.showdown) && h.showdown.length > 0) {
        for (const sd of h.showdown) {
          const st = getPlayerStats(sd.id);
          st.wentToShowdown++;
          if (sd.cards && sd.cards.length === 2 && h.board && h.board.length === 5) {
            try {
              const ev = PokerEngine.evaluate([...sd.cards, ...h.board]);
              if (ev.rank >= 2) st.showdownStrong++;
              else if (ev.rank === 0) st.showdownBluff++;
            } catch (e) {}
          }
        }
      }
    }
  }

  if (state.handNumber !== memory.lastHandNumber) {
    if (memory.lastHandNumber > state.handNumber) {
      memory.players.clear();
      memory.processedShowdowns.clear();
    }
    memory.lastHandNumber = state.handNumber;
    memory.lastActionIndex = 0;
    memory.handState = {
      preflopAggressor: null,
      streetAggressor: null,
      threeBetters: new Set(),
      vpipThisHand: new Set(),
      pfrThisHand: new Set(),
      sawFlopThisHand: new Set(),
      cbetOppThisHand: new Set(),
      postflopRaisers: new Set()
    };
    for (const seat of state.seats) {
      if (!seat.out) {
        getPlayerStats(seat.id).handsDealt++;
      }
    }
  }

  if (state.street !== 'preflop') {
    for (const seat of state.seats) {
      if (!seat.out && !seat.folded && !memory.handState.sawFlopThisHand.has(seat.id)) {
        memory.handState.sawFlopThisHand.add(seat.id);
        getPlayerStats(seat.id).sawFlop++;
      }
    }
  }

  const actions = state.actions || [];
  let pfRaises = 0;
  for (let i = 0; i < memory.lastActionIndex && i < actions.length; i++) {
    if (actions[i].street === 'preflop' && (actions[i].type === 'raise' || (actions[i].type === 'allin' && actions[i].amount > state.blinds[1]))) {
      pfRaises++;
    }
  }

  for (let i = memory.lastActionIndex; i < actions.length; i++) {
    const a = actions[i];
    const st = getPlayerStats(a.id);
    if (a.street === 'preflop') {
      const isRaise = a.type === 'raise' || (a.type === 'allin' && a.amount > state.blinds[1]);
      if (a.type === 'allin') st.allInsPreflop++;
      if (a.type === 'call' || isRaise) {
        if (!memory.handState.vpipThisHand.has(a.id)) {
          memory.handState.vpipThisHand.add(a.id);
          st.vpip++;
        }
      }
      if (pfRaises === 1 && a.id !== memory.handState.preflopAggressor) {
        st.threeBetOpp++;
        if (isRaise) {
          st.threeBet++;
          memory.handState.threeBetters.add(a.id);
        }
      }
      if (isRaise) {
        pfRaises++;
        memory.handState.preflopAggressor = a.id;
        memory.handState.streetAggressor = a.id;
        if (!memory.handState.pfrThisHand.has(a.id)) {
          memory.handState.pfrThisHand.add(a.id);
          st.pfr++;
        }
      }
      if (pfRaises >= 2 && a.id === memory.handState.pfrThisHand.values().next().value) {
        st.pf3BetFaced++;
        if (a.type === 'fold') st.foldToPF3Bet++;
      }
    } else {
      const isBetOrRaise = a.type === 'raise' || (a.type === 'allin' && a.amount > 0);
      if (a.street === 'flop' && a.id === memory.handState.preflopAggressor && !memory.handState.cbetOppThisHand.has(a.id)) {
        memory.handState.cbetOppThisHand.add(a.id);
        st.cbetOpp++;
        if (isBetOrRaise) st.cbet++;
      }
      if (isBetOrRaise) {
        st.postflopBetsRaises++;
        memory.handState.streetAggressor = a.id;
        memory.handState.postflopRaisers.add(a.id);
      } else if (a.type === 'call') {
        st.postflopCalls++;
      } else if (a.type === 'fold') {
        st.postflopFolds++;
        if (a.street === 'flop' && memory.handState.streetAggressor === memory.handState.preflopAggressor && memory.handState.preflopAggressor) {
          st.cbetFaced++;
          st.foldToCbet++;
        }
      } else if (a.type === 'check') {
        st.postflopChecks++;
      }
    }
  }
  memory.lastActionIndex = actions.length;
}

// Fast Monte Carlo Equity (both Uniform and Range-Weighted blended to prevent over-optimism)
const availBuffer = new Uint8Array(52);
function computeEquity(holeCards, board, opponentRanges, iterations) {
  const numOpps = opponentRanges.length;
  if (numOpps === 0) return { equity: 1, rawEquity: 1, rangeEquity: 1 };

  const h0 = CARD_TO_INDEX[holeCards[0]];
  const h1 = CARD_TO_INDEX[holeCards[1]];
  const bLen = board.length;
  const b0 = bLen > 0 ? CARD_TO_INDEX[board[0]] : 255;
  const b1 = bLen > 1 ? CARD_TO_INDEX[board[1]] : 255;
  const b2 = bLen > 2 ? CARD_TO_INDEX[board[2]] : 255;
  const b3 = bLen > 3 ? CARD_TO_INDEX[board[3]] : 255;
  const b4 = bLen > 4 ? CARD_TO_INDEX[board[4]] : 255;

  let availLen = 0;
  for (let c = 0; c < 52; c++) {
    if (c !== h0 && c !== h1 && c !== b0 && c !== b1 && c !== b2 && c !== b3 && c !== b4) {
      availBuffer[availLen++] = c;
    }
  }

  const neededBoard = 5 - bLen;
  const neededTotal = neededBoard + numOpps * 2;
  let totalWeight = 0;
  let weightedShare = 0;
  let rawShare = 0;

  for (let trial = 0; trial < iterations; trial++) {
    for (let i = 0; i < neededTotal; i++) {
      const j = i + ((Math.random() * (availLen - i)) | 0);
      const tmp = availBuffer[i];
      availBuffer[i] = availBuffer[j];
      availBuffer[j] = tmp;
    }

    const rB0 = bLen > 0 ? b0 : availBuffer[0];
    const rB1 = bLen > 1 ? b1 : availBuffer[1 - bLen];
    const rB2 = bLen > 2 ? b2 : availBuffer[2 - bLen];
    const rB3 = bLen > 3 ? b3 : availBuffer[3 - bLen];
    const rB4 = bLen > 4 ? b4 : availBuffer[4 - bLen];

    const heroVal = eval7Fast(h0, h1, rB0, rB1, rB2, rB3, rB4);

    let sampleWeight = 1.0;
    let beaten = false;
    let ties = 1;

    for (let opp = 0; opp < numOpps; opp++) {
      const c1 = availBuffer[neededBoard + opp * 2];
      const c2 = availBuffer[neededBoard + opp * 2 + 1];
      const pct = PREFLOP_PCT_BY_CARDS[c1 * 52 + c2];
      const rangeTightness = opponentRanges[opp];
      const cutoff = 1 - rangeTightness;
      if (pct < cutoff) {
        const excess = cutoff - pct;
        const w = excess > 0.45 ? 0.08 : Math.exp(-excess * 5.0);
        sampleWeight *= w;
      }

      const oppVal = eval7Fast(c1, c2, rB0, rB1, rB2, rB3, rB4);
      if (oppVal > heroVal) {
        beaten = true;
      } else if (oppVal === heroVal) {
        ties++;
      }
    }

    totalWeight += sampleWeight;
    if (!beaten) {
      const share = 1 / ties;
      rawShare += share;
      weightedShare += sampleWeight * share;
    }
  }

  const rawEq = rawShare / iterations;
  const rangeEq = totalWeight > 0 ? weightedShare / totalWeight : rawEq;
  // Blend rangeEq and rawEq (conservatively leaning toward the lower of the two when facing action)
  const blended = Math.min(rawEq, rangeEq) * 0.65 + Math.max(rawEq, rangeEq) * 0.35;
  return { equity: blended, rawEquity: rawEq, rangeEquity: rangeEq };
}

function analyzeBoard(holeCards, board) {
  if (!board || board.length < 3) {
    return { paired: false, tripsOnBoard: false, monotone: false, twoTone: false, connected: false, wetness: 0, heroRank: 0, playsBoard: false, nutted: false, overpair: false, topPair: false, topPairGoodKicker: false, secondPair: false, flushDraw: false, straightDraw: false };
  }
  const boardRanks = board.map(c => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a);
  const boardSuits = { c: 0, d: 0, h: 0, s: 0 };
  const rankCounts = {};
  for (let i = 0; i < board.length; i++) {
    const r = boardRanks[i];
    rankCounts[r] = (rankCounts[r] || 0) + 1;
    boardSuits[board[i][1]]++;
  }
  const maxSuitOnBoard = Math.max(boardSuits.c, boardSuits.d, boardSuits.h, boardSuits.s);
  const maxRankCount = Math.max(...Object.values(rankCounts));
  const paired = maxRankCount >= 2;
  const tripsOnBoard = maxRankCount >= 3;
  const monotone = (maxSuitOnBoard >= 3 && board.length === 3) || maxSuitOnBoard >= 4;
  const twoTone = (maxSuitOnBoard === 2 && board.length === 3) || (maxSuitOnBoard === 3 && board.length >= 4);

  const uniqueRanks = [...new Set(boardRanks)].sort((a, b) => b - a);
  if (uniqueRanks.includes(14)) uniqueRanks.push(1);
  let maxConnected = 1;
  for (let i = 0; i < uniqueRanks.length; i++) {
    let within4 = 1;
    for (let j = i + 1; j < uniqueRanks.length; j++) {
      if (uniqueRanks[i] - uniqueRanks[j] <= 4) within4++;
    }
    if (within4 > maxConnected) maxConnected = within4;
  }
  const connected = maxConnected >= 3;
  const wetness = (monotone ? 0.45 : twoTone ? 0.2 : 0) + (connected ? 0.35 : maxConnected === 2 ? 0.15 : 0) + (paired ? 0.1 : 0);

  const heroEval = PokerEngine.evaluate([...holeCards, ...board]);
  const boardEval = board.length === 5 ? PokerEngine.evaluate(board) : null;
  const hRanks = holeCards.map(c => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a);
  const topBoardRank = boardRanks[0];
  const secondBoardRank = uniqueRanks.length > 1 ? uniqueRanks[1] : 0;

  const overpair = hRanks[0] === hRanks[1] && hRanks[0] > topBoardRank;
  const topPair = !paired && (hRanks[0] === topBoardRank || hRanks[1] === topBoardRank);
  const kicker = hRanks[0] === topBoardRank ? hRanks[1] : hRanks[0];
  const topPairGoodKicker = topPair && kicker >= 11;
  const secondPair = !paired && !topPair && (hRanks[0] === secondBoardRank || hRanks[1] === secondBoardRank || (hRanks[0] === hRanks[1] && hRanks[0] > secondBoardRank));

  let flushDraw = false;
  let straightDraw = false;
  if (board.length < 5) {
    const allCards = [...holeCards, ...board];
    const suitCounts = { c: 0, d: 0, h: 0, s: 0 };
    for (const c of allCards) suitCounts[c[1]]++;
    for (const s of ['c', 'd', 'h', 's']) {
      if (suitCounts[s] === 4 && (holeCards[0][1] === s || holeCards[1][1] === s)) {
        flushDraw = true;
      }
    }
    const allRanks = new Set(allCards.map(c => RANKS.indexOf(c[0]) + 2));
    if (allRanks.has(14)) allRanks.add(1);
    let fourWindows = 0;
    for (let hi = 14; hi >= 5; hi--) {
      let count = 0;
      for (let d = 0; d < 5; d++) if (allRanks.has(hi - d)) count++;
      if (count === 4) fourWindows++;
    }
    if (fourWindows >= 1 && heroEval.rank < 4) straightDraw = true;
  }

  const playsBoard = Boolean(boardEval && heroEval.value === boardEval.value);
  const nutted = !playsBoard && (heroEval.rank >= 6 || (heroEval.rank >= 4 && !paired && maxSuitOnBoard < 4) || (heroEval.rank === 3 && !tripsOnBoard));

  return {
    paired,
    tripsOnBoard,
    monotone,
    twoTone,
    connected,
    wetness,
    heroRank: heroEval.rank,
    heroValue: heroEval.value,
    playsBoard,
    nutted,
    overpair,
    topPair,
    topPairGoodKicker,
    secondPair,
    flushDraw,
    straightDraw
  };
}

function makeLegalAction(state, desired) {
  if (!desired || typeof desired !== 'object') {
    return { type: state.canCheck ? 'check' : 'fold' };
  }
  const type = desired.type;
  if (type === 'check' || type === 'fold') {
    return { type: state.canCheck ? 'check' : 'fold' };
  }
  if (type === 'call') {
    if (state.canCheck) return { type: 'check' };
    if (state.toCall >= state.you.stack && state.canAllIn) return { type: 'allin' };
    return { type: 'call' };
  }
  if (type === 'allin') {
    if (state.canAllIn) return { type: 'allin' };
    if (!state.canCheck) return { type: 'call' };
    return { type: 'check' };
  }
  if (type === 'raise') {
    if (state.minRaiseTo === null) {
      if (!state.canCheck) return { type: 'call' };
      return { type: 'check' };
    }
    let amt = Math.round(Number(desired.amount) || state.minRaiseTo);
    if (amt >= state.maxRaiseTo) {
      if (state.canAllIn) return { type: 'allin' };
      amt = state.maxRaiseTo;
    }
    if (amt < state.minRaiseTo) {
      if (state.maxRaiseTo < state.minRaiseTo) {
        return state.canAllIn ? { type: 'allin' } : { type: state.canCheck ? 'check' : 'call' };
      }
      amt = state.minRaiseTo;
    }
    if (amt <= state.currentBet) {
      return { type: state.canCheck ? 'check' : 'call' };
    }
    return { type: 'raise', amount: amt };
  }
  return { type: state.canCheck ? 'check' : 'fold' };
}

function act(state) {
  try {
    updateTracking(state);

    const you = state.you;
    const bb = state.blinds[1] || 100;
    const sb = state.blinds[0] || 50;
    const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);

    const activeSeats = state.seats.filter(s => !s.out);
    const liveOpponents = state.seats.filter(s => s.id !== you.id && !s.out && !s.folded);
    const numOpps = liveOpponents.length;
    const isHeadsUp = activeSeats.length === 2;

    if (numOpps === 0) {
      return makeLegalAction(state, { type: state.canCheck ? 'check' : 'call' });
    }

    const numTotalSeats = state.seats.length;
    const postflopOrder = activeSeats.slice().sort((a, b) => {
      const da = (a.seat - state.buttonSeat - 1 + numTotalSeats) % numTotalSeats;
      const db = (b.seat - state.buttonSeat - 1 + numTotalSeats) % numTotalSeats;
      return da - db;
    });
    const myPostflopIdx = postflopOrder.findIndex(s => s.id === you.id);
    const liveBehindPostflop = postflopOrder.slice(myPostflopIdx + 1).filter(s => !s.folded && !s.allIn).length;
    const inPositionPostflop = liveBehindPostflop === 0;

    let playersToActPreflop = 0;
    if (isHeadsUp) {
      playersToActPreflop = you.seat === state.buttonSeat ? 1 : 0;
    } else {
      const preflopOrder = activeSeats.slice().sort((a, b) => {
        const da = (a.seat - state.bigBlindSeat - 1 + numTotalSeats) % numTotalSeats;
        const db = (b.seat - state.bigBlindSeat - 1 + numTotalSeats) % numTotalSeats;
        return da - db;
      });
      const myPreflopIdx = preflopOrder.findIndex(s => s.id === you.id);
      playersToActPreflop = preflopOrder.length - 1 - myPreflopIdx;
    }

    const maxOppTotalStack = Math.max(...liveOpponents.map(s => s.stack + s.bet));
    const myTotalStack = you.stack + you.bet;
    const effectiveStack = Math.min(myTotalStack, maxOppTotalStack);
    const effBB = effectiveStack / bb;
    const myBB = you.stack / bb;

    // Estimate opponent ranges and profiles
    let avgFoldFreq = 0;
    let avgAggression = 0;
    let callingStationPresent = false;
    let maniacPresent = false;
    let nitRaiserPresent = false;

    const oppRanges = liveOpponents.map(opp => {
      const st = getPlayerStats(opp.id);
      const hands = st.handsDealt;
      const obsVpip = hands >= 6 ? (st.vpip / hands) : (isHeadsUp ? 0.55 : 0.35);
      const obsPfr = hands >= 6 ? (st.pfr / hands) : (isHeadsUp ? 0.30 : 0.18);
      const postTotal = st.postflopBetsRaises + st.postflopCalls + st.postflopFolds + st.postflopChecks;
      const foldRate = postTotal >= 5 ? st.postflopFolds / Math.max(1, st.postflopFolds + st.postflopCalls + st.postflopBetsRaises) : 0.40;
      const aggRate = postTotal >= 5 ? st.postflopBetsRaises / postTotal : 0.25;

      avgFoldFreq += foldRate;
      avgAggression += aggRate;
      if (hands >= 8 && obsVpip > 0.55 && foldRate < 0.28 && obsPfr < 0.22) {
        callingStationPresent = true;
      }
      if (hands >= 8 && (obsPfr > 0.45 || st.allInsPreflop / hands > 0.22 || aggRate > 0.52)) {
        maniacPresent = true;
      }
      if (hands >= 8 && obsPfr < 0.20 && aggRate < 0.22 && (opp.bet > 0 || memory.handState.postflopRaisers.has(opp.id))) {
        nitRaiserPresent = true;
      }

      let range = Math.max(0.14, Math.min(0.95, obsVpip * 1.15));
      if (memory.handState.threeBetters.has(opp.id)) {
        range = Math.max(0.05, Math.min(0.28, obsPfr * 0.55));
      } else if (memory.handState.pfrThisHand.has(opp.id)) {
        range = Math.max(0.08, Math.min(0.45, obsPfr * 1.10));
      } else if (!memory.handState.vpipThisHand.has(opp.id)) {
        range = 0.88;
      }

      if (state.street !== 'preflop' && (opp.bet > 0 || memory.handState.streetAggressor === opp.id)) {
        range = Math.max(0.06, range * Math.min(0.85, 0.42 + aggRate));
      }
      return range;
    });

    avgFoldFreq /= numOpps;
    avgAggression /= numOpps;

    const handPct = getPreflopPercentile(you.cards[0], you.cards[1]);
    const r1 = RANKS.indexOf(you.cards[0][0]) + 2;
    const r2 = RANKS.indexOf(you.cards[1][0]) + 2;
    const hiRank = Math.max(r1, r2);
    const loRank = Math.min(r1, r2);
    const isPair = r1 === r2;
    const isSuited = you.cards[0][1] === you.cards[1][1];

    // Fast Monte Carlo Equity (500-750 iterations)
    const iterCount = numOpps === 1 ? 650 : numOpps <= 3 ? 450 : 320;
    const eqInfo = computeEquity(you.cards, state.board, oppRanges, iterCount);
    const equity = eqInfo.equity;
    const rawEquity = eqInfo.rawEquity;

    const potOdds = state.toCall / Math.max(1, pot + state.toCall);

    // Tournament Survival / ICM Pressure Factor
    const allInRiskFraction = state.toCall / Math.max(1, you.stack);
    let icmBuffer = 0;
    if (!isHeadsUp && activeSeats.length >= 3 && allInRiskFraction > 0.30) {
      const minOtherStack = Math.min(...activeSeats.filter(s => s.id !== you.id).map(s => s.stack + s.total));
      const bubbleFactor = minOtherStack < myTotalStack * 0.65 ? 1.45 : 1.05;
      icmBuffer = Math.min(0.09, 0.045 * allInRiskFraction * bubbleFactor * Math.min(2.0, activeSeats.length / 3));
    }

    // ========================================================================
    // PREFLOP STRATEGY
    // ========================================================================
    if (state.street === 'preflop') {
      const unopened = state.currentBet <= bb;
      const limpers = state.actions.filter(a => a.street === 'preflop' && a.type === 'call').length;

      // 1. Short-stack Push/Fold Mode (<= 12 BB effective or hero stack <= 12 BB)
      if (effBB <= 12 || myBB <= 12) {
        if (unopened) {
          const shoveThreshold = isHeadsUp
            ? Math.max(0.28, 0.66 - (12 - Math.min(12, effBB)) * 0.03)
            : Math.max(0.50, 0.86 - (12 - Math.min(12, effBB)) * 0.022 - (6 - Math.min(6, playersToActPreflop)) * 0.04);
          const goodBlocker = hiRank === 14 || (isPair && hiRank >= 6) || (isSuited && hiRank >= 12 && loRank >= 9);
          if (handPct >= shoveThreshold || (effBB <= 7 && goodBlocker && playersToActPreflop <= 2)) {
            return makeLegalAction(state, { type: 'allin' });
          }
          if (state.canCheck) return makeLegalAction(state, { type: 'check' });
          if (state.toCall <= sb && handPct >= (isHeadsUp ? 0.25 : 0.45)) return makeLegalAction(state, { type: 'call' });
          return makeLegalAction(state, { type: 'fold' });
        } else {
          const reqEq = potOdds + icmBuffer + (isHeadsUp ? 0.01 : 0.035);
          if (equity >= reqEq || (isPair && hiRank >= 9) || (hiRank === 14 && loRank >= 12) || handPct >= 0.90) {
            return makeLegalAction(state, { type: 'allin' });
          }
          return makeLegalAction(state, { type: state.canCheck ? 'check' : 'fold' });
        }
      }

      // 2. Unopened Pot (or limped pot)
      if (unopened) {
        if (isHeadsUp) {
          const oppId = liveOpponents[0].id;
          const oppSt = getPlayerStats(oppId);
          const oppFoldRate = oppSt.handsDealt >= 6 ? Math.max(0, 1 - oppSt.vpip / oppSt.handsDealt) : 0.45;
          if (you.seat === state.buttonSeat) {
            // If opponent folds BB often (>45%), min-raise steal with 80% of hands!
            const huOpenThresh = oppFoldRate >= 0.42 ? 0.20 : 0.35;
            if (handPct >= huOpenThresh && state.minRaiseTo !== null) {
              const raiseSize = Math.round(bb * 2.0);
              return makeLegalAction(state, { type: 'raise', amount: raiseSize });
            }
            if (handPct >= 0.16 && state.toCall <= sb) {
              return makeLegalAction(state, { type: 'call' });
            }
            return makeLegalAction(state, { type: 'fold' });
          } else {
            if (handPct >= 0.56 && state.minRaiseTo !== null) {
              return makeLegalAction(state, { type: 'raise', amount: Math.round(bb * 3.0) });
            }
            return makeLegalAction(state, { type: 'check' });
          }
        }

        // Multi-handed Positional Opening Thresholds (Disciplined TAG)
        let openPctThreshold = 0.80;
        if (playersToActPreflop <= 1) openPctThreshold = 0.54; // SB or BB vs limpers
        else if (playersToActPreflop === 2) openPctThreshold = 0.50; // BTN
        else if (playersToActPreflop === 3) openPctThreshold = 0.64; // CO
        else if (playersToActPreflop === 4) openPctThreshold = 0.74; // HJ
        else openPctThreshold = 0.80; // EP

        if (playersToActPreflop <= 3 && avgFoldFreq > 0.50 && !callingStationPresent) {
          openPctThreshold -= 0.06;
        }
        if (limpers > 0) {
          openPctThreshold += Math.min(0.16, limpers * 0.05);
        }

        if (handPct >= openPctThreshold && state.minRaiseTo !== null) {
          const baseMult = playersToActPreflop === 1 ? 3.0 : 2.25;
          const raiseSize = Math.round(bb * (baseMult + limpers * 0.9));
          return makeLegalAction(state, { type: 'raise', amount: raiseSize });
        }

        if (state.canCheck) {
          return makeLegalAction(state, { type: 'check' });
        }
        if (state.toCall <= sb && (handPct >= 0.38 || (isSuited && hiRank >= 10) || isPair)) {
          return makeLegalAction(state, { type: 'call' });
        }
        if (limpers >= 1 && state.toCall <= bb && (isPair || (isSuited && (hiRank === 14 || (hiRank - loRank <= 2 && loRank >= 6))))) {
          return makeLegalAction(state, { type: 'call' });
        }
        return makeLegalAction(state, { type: 'fold' });
      }

      // 3. Facing a Raise / 3-Bet / 4-Bet Preflop
      const raiseBbs = state.currentBet / bb;
      const isPremium = handPct >= 0.945; // QQ+, AKs, AKo
      const isStrong = handPct >= (isHeadsUp ? 0.84 : 0.89); // HU: 88+, ATs+, AQo+, KQs; Multi: TT+, AQs+, AQo

      if (state.minRaiseTo !== null) {
        if (isPremium || (isStrong && raiseBbs <= 4.0 && numOpps <= 2)) {
          const mult = inPositionPostflop ? 2.75 : 3.25;
          const target = Math.max(state.minRaiseTo, Math.round(state.currentBet * mult));
          if (target >= you.stack * 0.45) {
            return makeLegalAction(state, { type: 'allin' });
          }
          return makeLegalAction(state, { type: 'raise', amount: target });
        }
      }

      // Calling a preflop raise or all-in shove
      // When facing an all-in or large raise (> 30% of our stack), only call with top-tier hands or clear equity edge!
      if (state.toCall >= you.stack * 0.30) {
        const shoveCallReq = potOdds + icmBuffer + (isHeadsUp ? 0.02 : 0.045);
        if (isPremium || (handPct >= 0.88 && equity >= shoveCallReq)) {
          return makeLegalAction(state, { type: 'call' });
        }
        return makeLegalAction(state, { type: 'fold' });
      }

      const impliedBonus = (effBB >= 22 && state.toCall <= effectiveStack * 0.10 && (isPair || (isSuited && hiRank - loRank <= 2 && loRank >= 6))) ? 0.055 : 0;
      const posBonus = inPositionPostflop ? 0.025 : -0.015;
      const bbDiscount = you.seat === state.bigBlindSeat && raiseBbs <= 3.2 ? (isHeadsUp ? 0.045 : 0.03) : 0;

      if (equity + impliedBonus + posBonus + bbDiscount >= potOdds + icmBuffer + (isHeadsUp ? 0.015 : 0.03)) {
        return makeLegalAction(state, { type: 'call' });
      }

      return makeLegalAction(state, { type: state.canCheck ? 'check' : 'fold' });
    }

    // ========================================================================
    // POSTFLOP STRATEGY (Flop, Turn, River)
    // ========================================================================
    const boardInfo = analyzeBoard(you.cards, state.board);
    const spr = effectiveStack / Math.max(1, pot);
    const isPFAggressor = memory.handState.preflopAggressor === you.id;
    const hasStrongDraw = boardInfo.flushDraw || boardInfo.straightDraw;
    const drawBonus = state.street === 'flop' ? (boardInfo.flushDraw && boardInfo.straightDraw ? 0.09 : hasStrongDraw ? 0.045 : 0)
      : state.street === 'turn' ? (hasStrongDraw ? 0.025 : 0) : 0;

    // 1. Checked to Hero (state.canCheck === true)
    if (state.canCheck) {
      if (state.minRaiseTo === null) {
        return makeLegalAction(state, { type: 'check' });
      }

      const fairShare = 1 / (numOpps + 1);
      // Match & exceed Sample Equity's value threshold while respecting board texture
      const strongValue = !boardInfo.playsBoard && (
        rawEquity >= Math.max(0.58, fairShare + 0.17) ||
        (boardInfo.heroRank >= 2 && !boardInfo.paired) ||
        boardInfo.nutted
      );
      const mediumValue = !boardInfo.playsBoard && (
        rawEquity >= Math.max(0.52, fairShare + 0.12) &&
        (boardInfo.heroRank >= 1 || boardInfo.overpair || boardInfo.topPair)
      );

      // Value Betting
      if (strongValue) {
        let sizeFrac = Math.max(0.55, Math.min(0.95, rawEquity * 0.90)) + (callingStationPresent ? 0.15 : 0);
        if (spr <= 1.25 && rawEquity >= 0.70) {
          return makeLegalAction(state, { type: 'allin' });
        }
        const betAmt = you.bet + Math.max(bb, Math.round(pot * sizeFrac));
        return makeLegalAction(state, { type: 'raise', amount: betAmt });
      }

      if (mediumValue) {
        if (numOpps <= 2 && (inPositionPostflop || state.street !== 'river' || callingStationPresent || avgAggression < 0.35)) {
          const sizeFrac = state.street === 'river' ? 0.45 : (0.48 + boardInfo.wetness * 0.12);
          const betAmt = you.bet + Math.max(bb, Math.round(pot * sizeFrac));
          return makeLegalAction(state, { type: 'raise', amount: betAmt });
        }
      }

      // Continuation Betting & Semi-Bluffing (Selective)
      if (!callingStationPresent && numOpps <= 2) {
        const canCbetFlop = state.street === 'flop' && isPFAggressor && (
          (numOpps === 1 && (!boardInfo.connected || hasStrongDraw || rawEquity >= 0.36 || avgFoldFreq >= 0.42)) ||
          (numOpps === 2 && (hasStrongDraw || rawEquity >= 0.48))
        );
        const canProbeTurn = state.street === 'turn' && numOpps === 1 && (inPositionPostflop || isPFAggressor) && (hasStrongDraw || (rawEquity >= 0.38 && avgFoldFreq >= 0.42));
        const canRiverBluff = state.street === 'river' && numOpps === 1 && inPositionPostflop && avgFoldFreq >= 0.46 && rawEquity < 0.22 && !boardInfo.playsBoard && spr >= 1.4;

        if (canCbetFlop || canProbeTurn) {
          const sizeFrac = boardInfo.wetness > 0.4 ? 0.46 : 0.34;
          const betAmt = you.bet + Math.max(bb, Math.round(pot * sizeFrac));
          return makeLegalAction(state, { type: 'raise', amount: betAmt });
        }
        if (canRiverBluff) {
          const betAmt = you.bet + Math.max(bb, Math.round(pot * 0.50));
          return makeLegalAction(state, { type: 'raise', amount: betAmt });
        }
      }

      return makeLegalAction(state, { type: 'check' });
    }

    // 2. Facing a Bet or Raise Postflop (state.canCheck === false)
    if (boardInfo.playsBoard && rawEquity < potOdds + 0.08) {
      return makeLegalAction(state, { type: 'fold' });
    }

    const betToPotRatio = state.toCall / Math.max(1, pot - state.toCall);
    // Respect tight/passive postflop raisers (like Sample Tight which only raises 2-pair+)
    const nitPenalty = nitRaiserPresent && boardInfo.heroRank < 2 ? 0.12 : 0;
    const sizingPenalty = state.street === 'river' && betToPotRatio > 0.70 && avgAggression < 0.28 ? 0.05 : 0;

    // Raising for Value vs a Bet (Only raise true 2-pair+ or very high equity hands, do not bloat pot with 1-pair!)
    if (state.minRaiseTo !== null && !boardInfo.playsBoard) {
      const monsterHand = boardInfo.nutted || rawEquity >= 0.78 || (boardInfo.heroRank >= 3 && rawEquity >= 0.70) || (boardInfo.heroRank >= 2 && !boardInfo.paired && rawEquity >= 0.72);
      const monsterComboDraw = state.street === 'flop' && boardInfo.flushDraw && boardInfo.straightDraw && rawEquity >= 0.54 && numOpps === 1 && avgFoldFreq >= 0.40;

      if (monsterHand || monsterComboDraw) {
        const raisePot = pot + state.toCall;
        const target = Math.max(state.minRaiseTo, you.bet + state.toCall + Math.round(raisePot * 0.75));
        if (target >= you.stack * 0.65 || spr <= 1.6) {
          return makeLegalAction(state, { type: 'allin' });
        }
        return makeLegalAction(state, { type: 'raise', amount: target });
      }
    }

    // Calling Decision
    const effectiveEq = equity + drawBonus + (inPositionPostflop && state.street !== 'river' ? 0.02 : 0);
    const requiredEq = potOdds + icmBuffer + sizingPenalty + nitPenalty + (isHeadsUp ? 0.015 : 0.022);

    if (effectiveEq >= requiredEq) {
      if (state.street === 'river' && state.toCall > you.stack * 0.50 && boardInfo.heroRank <= 1 && !boardInfo.overpair && rawEquity < potOdds + 0.06) {
        return makeLegalAction(state, { type: 'fold' });
      }
      return makeLegalAction(state, { type: 'call' });
    }

    // Cheap peel on flop with pair or strong draw when pot odds are close
    if (state.street === 'flop' && state.toCall <= bb * 2 && (boardInfo.heroRank >= 1 || hasStrongDraw) && !nitPenalty && equity + 0.055 >= potOdds) {
      return makeLegalAction(state, { type: 'call' });
    }

    return makeLegalAction(state, { type: 'fold' });
  } catch (err) {
    return { type: state && state.canCheck ? 'check' : 'fold' };
  }
}

module.exports = {
  name: 'Argon',
  botName: 'Argon',
  act
};
