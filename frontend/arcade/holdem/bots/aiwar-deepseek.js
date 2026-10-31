'use strict';

(function () {
  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';

  const OFF = [
    [2, 50, 59, 74, 90, 112, 164, 219, 253, 201, 210, 284, 271],
    [0, 7, 136, 124, 155, 192, 305, 329, 350, 341, 397, 427, 457],
    [0, 0, 11, 173, 231, 293, 368, 406, 436, 498, 528, 519, 573],
    [0, 0, 0, 16, 317, 359, 466, 489, 558, 582, 612, 655, 667],
    [0, 0, 0, 0, 20, 445, 510, 603, 591, 697, 724, 733, 763],
    [0, 0, 0, 0, 0, 25, 543, 637, 682, 745, 811, 799, 830],
    [0, 0, 0, 0, 0, 0, 29, 646, 706, 772, 863, 908, 899],
    [0, 0, 0, 0, 0, 0, 0, 40, 754, 790, 884, 920, 959],
    [0, 0, 0, 0, 0, 0, 0, 0, 84, 839, 872, 929, 977],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 146, 851, 938, 968],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 247, 950, 995],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 387, 986],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 479]
  ];
  const SUI = [
    [2, 33, 36, 44, 65, 80, 100, 106, 149, 142, 179, 186, 240],
    [0, 7, 68, 97, 103, 130, 262, 225, 237, 299, 311, 374, 391],
    [0, 0, 11, 118, 183, 259, 278, 323, 383, 377, 451, 421, 483],
    [0, 0, 0, 16, 243, 265, 380, 418, 475, 472, 552, 549, 597],
    [0, 0, 0, 0, 20, 335, 415, 412, 564, 618, 627, 624, 661],
    [0, 0, 0, 0, 0, 25, 504, 534, 567, 621, 688, 676, 739],
    [0, 0, 0, 0, 0, 0, 29, 537, 630, 712, 718, 781, 824],
    [0, 0, 0, 0, 0, 0, 0, 40, 673, 691, 778, 817, 845],
    [0, 0, 0, 0, 0, 0, 0, 0, 84, 715, 784, 857, 893],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 146, 805, 821, 890],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 247, 878, 944],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 387, 914],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 479]
  ];

  const ALL_COMBOS = (function () {
    const deck = [];
    for (const rank of RANKS) for (const suit of SUITS) deck.push(rank + suit);
    const list = [];
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const c1 = deck[i];
        const c2 = deck[j];
        list.push({ c1: c1, c2: c2, pct: handPct(c1, c2) });
      }
    }
    return list;
  })();

  function rankVal(card) {
    return RANKS.indexOf(card[0]) + 2;
  }

  function handPct(c1, c2) {
    const r1 = rankVal(c1);
    const r2 = rankVal(c2);
    const hi = r1 > r2 ? r1 : r2;
    const lo = r1 > r2 ? r2 : r1;
    const i = 14 - hi;
    const j = 14 - lo;
    const suited = c1[1] === c2[1];
    const value = suited ? SUI[i][j] : OFF[i][j];
    return value / 1000;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function computeTendency(state) {
    const seen = {};
    for (const seat of state.seats) seen[seat.id] = { n: 0, sum: 0 };
    for (const hand of state.history) {
      if (!hand.showdown) continue;
      for (const entry of hand.showdown) {
        const data = seen[entry.id];
        if (!data || !entry.cards || entry.cards.length !== 2) continue;
        data.n++;
        data.sum += handPct(entry.cards[0], entry.cards[1]);
      }
    }
    const result = {};
    for (const id in seen) {
      const data = seen[id];
      if (data.n === 0) {
        result[id] = 1;
        continue;
      }
      const average = data.sum / data.n;
      const confidence = Math.min(1, data.n / 4);
      result[id] = clamp(1 + (average - 0.2) * 0.6 * confidence, 0.72, 1.35);
    }
    return result;
  }

  function isPair(c1, c2) {
    return rankVal(c1) === rankVal(c2);
  }

  function isSuitedConnector(c1, c2) {
    if (c1[1] !== c2[1]) return false;
    const gap = Math.abs(rankVal(c1) - rankVal(c2));
    return gap === 1 || gap === 2;
  }

  function makeBoardInfo(board) {
    const ranks = board.map(rankVal);
    const suitCounts = { c: 0, d: 0, h: 0, s: 0 };
    for (const card of board) suitCounts[card[1]]++;
    const rankSet = new Set(ranks);
    const maxRank = ranks.length ? Math.max.apply(null, ranks) : 0;
    return { ranks: ranks, suitCounts: suitCounts, rankSet: rankSet, maxRank: maxRank, count: board.length };
  }

  function boardFit(c1, c2, info) {
    if (info.count < 3) return 0;
    const r1 = rankVal(c1);
    const r2 = rankVal(c2);
    let score = 0;
    const matches = (info.rankSet.has(r1) ? 1 : 0) + (info.rankSet.has(r2) ? 1 : 0);

    if (r1 === r2) {
      score += r1 > info.maxRank ? 0.58 : 0.16;
    }
    if (matches === 2) {
      score += 0.7;
    } else if (matches === 1) {
      const paired = info.rankSet.has(r1) ? r1 : r2;
      if (paired === info.maxRank) score += 0.55;
      else if (paired >= info.maxRank - 2) score += 0.34;
      else score += 0.14;
    }
    if (r1 > info.maxRank) score += 0.07;
    if (r2 > info.maxRank) score += 0.07;

    const sc = {
      c: info.suitCounts.c + (c1[1] === 'c' ? 1 : 0) + (c2[1] === 'c' ? 1 : 0),
      d: info.suitCounts.d + (c1[1] === 'd' ? 1 : 0) + (c2[1] === 'd' ? 1 : 0),
      h: info.suitCounts.h + (c1[1] === 'h' ? 1 : 0) + (c2[1] === 'h' ? 1 : 0),
      s: info.suitCounts.s + (c1[1] === 's' ? 1 : 0) + (c2[1] === 's' ? 1 : 0)
    };
    const maxSuit = Math.max(sc.c, sc.d, sc.h, sc.s);
    const holeSuitCount = sc[c1[1]] >= 4 && (c1[1] === c2[1] || sc[c1[1]] >= 5) ? 1 : 0;
    if (maxSuit >= 5 && holeSuitCount) score += 0.55;
    else if (info.count < 5 && maxSuit >= 4) score += 0.32;

    const allRanks = new Set(info.rankSet);
    allRanks.add(r1);
    allRanks.add(r2);
    if (info.count < 5) {
      let best = 0;
      for (let start = 2; start <= 10; start++) {
        let count = 0;
        for (let k = 0; k < 5; k++) if (allRanks.has(start + k)) count++;
        if (count > best) best = count;
      }
      let wheel = 0;
      for (const rank of [14, 2, 3, 4, 5]) if (allRanks.has(rank)) wheel++;
      if (wheel > best) best = wheel;
      if (best >= 4) score += best === 5 ? 0.4 : 0.26;
    } else {
      let best = 0;
      for (let start = 2; start <= 10; start++) {
        let count = 0;
        for (let k = 0; k < 5; k++) if (allRanks.has(start + k)) count++;
        if (count > best) best = count;
      }
      let wheel = 0;
      for (const rank of [14, 2, 3, 4, 5]) if (allRanks.has(rank)) wheel++;
      if (wheel > best) best = wheel;
      if (best >= 5) score += 0.5;
    }

    return score > 1 ? 1 : score;
  }

  function rangeWeight(pct, width) {
    const x = (pct - width) * 30;
    if (x > 12) return 0.002;
    return 1 / (1 + Math.exp(x)) + 0.002;
  }

  function analyzeActions(state) {
    const seats = state.seats;
    const n = seats.length;
    const byId = {};
    for (const seat of seats) byId[seat.id] = seat.seat;
    const startStack = seats.map(function (seat) { return seat.stack + seat.total; });

    const preBets = new Array(n).fill(0);
    preBets[state.smallBlindSeat] = Math.min(state.blinds[0], startStack[state.smallBlindSeat]);
    preBets[state.bigBlindSeat] = Math.min(state.blinds[1], startStack[state.bigBlindSeat]);
    let preCurrent = state.blinds[1];
    let preRaiseLevel = 0;

    const pre = seats.map(function () {
      return { vol: false, raises: 0, raiseLevel: 0, calls: 0, callLevel: 0, limped: false, folded: false, aggr: 0 };
    });

    const post = {
      flop: seats.map(function () { return { raises: 0, calls: 0, checks: 0, aggr: 0, folded: false }; }),
      turn: seats.map(function () { return { raises: 0, calls: 0, checks: 0, aggr: 0, folded: false }; }),
      river: seats.map(function () { return { raises: 0, calls: 0, checks: 0, aggr: 0, folded: false }; })
    };
    const postCurrent = { flop: 0, turn: 0, river: 0 };
    const postBets = {
      flop: new Array(n).fill(0),
      turn: new Array(n).fill(0),
      river: new Array(n).fill(0)
    };

    for (const action of state.actions) {
      const index = byId[action.id];
      if (index === undefined) continue;
      if (action.street === 'preflop') {
        const info = pre[index];
        const newBet = preBets[index] + action.amount;
        if (action.type === 'fold') {
          info.folded = true;
        } else if (action.type !== 'check') {
          info.vol = true;
          if (newBet > preCurrent) {
            preRaiseLevel++;
            info.raises++;
            info.raiseLevel = preRaiseLevel;
            info.aggr = 1;
            preCurrent = newBet;
          } else {
            info.calls++;
            info.callLevel = preRaiseLevel;
            if (preRaiseLevel === 0) info.limped = true;
          }
        }
        preBets[index] = newBet;
      } else {
        const street = action.street;
        if (!post[street]) continue;
        const info = post[street][index];
        const newBet = postBets[street][index] + action.amount;
        if (action.type === 'fold') {
          info.folded = true;
        } else if (action.type === 'check') {
          info.checks++;
        } else {
          if (newBet > postCurrent[street]) {
            if (postCurrent[street] === 0) {
              info.bets = (info.bets || 0) + 1;
              info.aggr = Math.max(info.aggr, 0.7);
            } else {
              info.raises++;
              info.aggr = 1;
            }
            postCurrent[street] = newBet;
          } else {
            info.calls++;
            if (info.aggr < 0.5) info.aggr = 0.5;
          }
        }
        postBets[street][index] = newBet;
      }
    }

    return { pre: pre, post: post, preRaiseLevel: preRaiseLevel };
  }

  function positionFactor(seat, state) {
    const n = state.seats.length;
    const rel = (seat.seat - state.buttonSeat + n) % n;
    if (rel <= 1) return 1.25;
    if (rel >= n - 2) return 1.15;
    if (rel <= 4) return 0.9;
    return 1.0;
  }

  function preflopWidth(info, seat, state, tendencyFactor) {
    const bb = state.blinds[1];
    const startBB = (seat.stack + seat.total) / Math.max(1, bb);
    let width;

    if (!info.vol) {
      if (seat.seat === state.bigBlindSeat && !info.folded) width = 0.85;
      else width = 0.55;
    } else if (info.raiseLevel >= 1 && info.raiseLevel >= info.callLevel) {
      const level = info.raiseLevel;
      if (level === 1) width = 0.17;
      else if (level === 2) width = 0.07;
      else if (level === 3) width = 0.035;
      else width = 0.025;
      width *= positionFactor(seat, state);
      if (seat.allIn) {
        const base = level === 1 ? 0.26 : level === 2 ? 0.12 : 0.055;
        if (startBB <= 10) width = Math.max(width, base);
        else if (startBB <= 15) width = Math.max(width, base * 0.82);
        else if (startBB <= 25) width = Math.max(width, base * 0.62);
      }
    } else {
      const level = info.callLevel;
      if (level === 0) width = 0.45;
      else if (level === 1) width = 0.3;
      else if (level === 2) width = 0.15;
      else width = 0.09;
      width *= positionFactor(seat, state) * 1.05;
    }

    return clamp(width * tendencyFactor, 0.02, 0.95);
  }

  function adjustForPostflop(width, seat, analysis, state) {
    if (state.street === 'preflop') return width;
    const current = analysis.post[state.street];
    if (current) {
      const info = current[seat.seat];
      if (info.aggr >= 0.9) width *= 0.5;
      else if (info.aggr >= 0.6) width *= 0.7;
      else if (info.aggr > 0) width *= 0.85;
    }
    const order = ['flop', 'turn', 'river'];
    for (const street of order) {
      if (street === state.street) break;
      const info = analysis.post[street][seat.seat];
      if (info.aggr >= 0.9) width *= 0.78;
      else if (info.aggr >= 0.6) width *= 0.85;
      else if (info.calls > 0) width *= 0.88;
    }
    return clamp(width, 0.02, 0.95);
  }

  function lowerBound(cumulative, value) {
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function computeEquity(state, analysis, iterations, tendency) {
    const hero = state.you.cards;
    const board = state.board;
    const excluded = new Set(hero.concat(board));
    const deck = [];
    for (const rank of RANKS) for (const suit of SUITS) {
      const card = rank + suit;
      if (!excluded.has(card)) deck.push(card);
    }

    const opponents = state.seats.filter(function (seat) {
      return seat.id !== state.you.id && !seat.out && !seat.folded;
    });
    if (opponents.length === 0) return 1;

    const boardInfo = makeBoardInfo(board);
    const available = [];
    for (const combo of ALL_COMBOS) {
      if (excluded.has(combo.c1) || excluded.has(combo.c2)) continue;
      available.push({ c1: combo.c1, c2: combo.c2, pct: combo.pct, fit: boardFit(combo.c1, combo.c2, boardInfo) });
    }
    if (available.length < opponents.length) return 0;

    const opponentData = [];
    for (const seat of opponents) {
      let width = preflopWidth(analysis.pre[seat.seat], seat, state, tendency[seat.id] || 1);
      width = adjustForPostflop(width, seat, analysis, state);
      const current = analysis.post[state.street];
      const aggr = current && current[seat.seat] ? current[seat.seat].aggr : 0;
      const cumulative = new Float64Array(available.length);
      let sum = 0;
      for (let i = 0; i < available.length; i++) {
        const combo = available[i];
        let weight = rangeWeight(combo.pct, width);
        if (boardInfo.count >= 3 && aggr > 0) {
          weight *= (1 - aggr * 0.6) + aggr * (0.25 + 1.8 * combo.fit);
        }
        sum += weight;
        cumulative[i] = sum;
      }
      if (sum <= 0) sum = 1;
      opponentData.push({ cumulative: cumulative, sum: sum });
    }

    const used = new Set();
    const needed = 5 - board.length;
    let total = 0;
    for (let trial = 0; trial < iterations; trial++) {
      used.clear();
      const hands = [];
      let valid = true;
      for (let k = 0; k < opponentData.length; k++) {
        const data = opponentData[k];
        let chosen = null;
        for (let attempt = 0; attempt < 24; attempt++) {
          const index = lowerBound(data.cumulative, Math.random() * data.sum);
          const combo = available[index];
          if (!used.has(combo.c1) && !used.has(combo.c2)) {
            chosen = combo;
            break;
          }
        }
        if (!chosen) {
          valid = false;
          break;
        }
        used.add(chosen.c1);
        used.add(chosen.c2);
        hands.push([chosen.c1, chosen.c2]);
      }
      if (!valid) continue;

      let runout;
      if (needed === 0) {
        runout = board;
      } else {
        const remaining = [];
        for (const card of deck) if (!used.has(card)) remaining.push(card);
        for (let i = 0; i < needed; i++) {
          const j = i + Math.floor(Math.random() * (remaining.length - i));
          const temp = remaining[i];
          remaining[i] = remaining[j];
          remaining[j] = temp;
        }
        runout = board.concat(remaining.slice(0, needed));
      }

      const heroValue = PokerEngine.evaluate(hero.concat(runout)).value;
      let ties = 1;
      let beaten = false;
      for (const hand of hands) {
        const value = PokerEngine.evaluate(hand.concat(runout)).value;
        if (value > heroValue) {
          beaten = true;
          break;
        }
        if (value === heroValue) ties++;
      }
      if (!beaten) total += 1 / ties;
    }

    return total / iterations;
  }

  function playersAfter(state) {
    const n = state.seats.length;
    const live = [];
    for (const seat of state.seats) {
      if (seat.out || seat.folded || seat.allIn) continue;
      live.push(seat.seat);
    }
    if (!live.length) return 0;
    let start;
    if (state.street === 'preflop') {
      start = (state.bigBlindSeat + 1) % n;
    } else {
      start = (state.buttonSeat + 1) % n;
    }
    const order = [];
    for (let distance = 0; distance < n; distance++) {
      const index = (start + distance) % n;
      if (live.indexOf(index) >= 0) order.push(index);
    }
    const mine = order.indexOf(state.you.seat);
    if (mine < 0) return 0;
    return order.length - mine - 1;
  }

  function countLimpers(state, analysis) {
    let count = 0;
    for (const seat of state.seats) {
      if (seat.id === state.you.id || seat.out || seat.folded) continue;
      if (analysis.pre[seat.seat].limped) count++;
    }
    return count;
  }

  function raiseTo(state, target) {
    if (state.minRaiseTo === null) return null;
    const min = state.minRaiseTo;
    const max = state.maxRaiseTo;
    if (!Number.isSafeInteger(target)) target = Math.round(target);
    if (target < min) target = min;
    if (target > max) target = max;
    if (target >= max) {
      if (state.canAllIn) return { type: 'allin' };
      return null;
    }
    if (target <= state.currentBet) return null;
    return { type: 'raise', amount: target };
  }

  function openThreshold(after, limpers) {
    let width;
    if (after >= 6) width = 0.1;
    else if (after >= 4) width = 0.14;
    else if (after >= 2) width = 0.2;
    else if (after === 1) width = 0.3;
    else width = 0.42;
    if (limpers >= 1 && after <= 3) width += 0.05;
    return width;
  }

  function pushThreshold(after, level) {
    let width;
    if (after <= 1) width = 0.4;
    else if (after <= 3) width = 0.3;
    else if (after <= 5) width = 0.22;
    else width = 0.16;
    if (level >= 1) width *= 0.55;
    if (level >= 2) width *= 0.6;
    return width;
  }

  function decidePreflop(state, ctx) {
    const hp = handPct(state.you.cards[0], state.you.cards[1]);
    const bb = state.blinds[1];
    const stackBB = state.you.stack / Math.max(1, bb);
    const toCall = state.toCall;
    const pot = ctx.pot;
    const potOdds = toCall / Math.max(1, pot + toCall);
    const level = ctx.analysis.preRaiseLevel;
    const after = playersAfter(state);
    const limpers = countLimpers(state, ctx.analysis);
    const canRaise = state.minRaiseTo !== null;
    const facingRaise = level >= 1;

    if (!facingRaise) {
      if (state.canCheck) {
        if (stackBB <= 12) {
          const width = pushThreshold(0, 0);
          if (hp <= width && state.canAllIn) return { type: 'allin' };
          return { type: 'check' };
        }
        const raiseWidth = ctx.nLive === 1 ? 0.45 : Math.min(0.2, 0.14 + limpers * 0.03);
        if (hp <= raiseWidth) {
          const target = bb * (3 + limpers);
          const action = raiseTo(state, target);
          if (action) return action;
        }
        return { type: 'check' };
      }

      let width = openThreshold(after, limpers);
      if (ctx.nLive === 1 && after === 1) width = Math.max(width, 0.42);
      if (stackBB <= 12) width = Math.max(width, pushThreshold(after, 0));
      if (hp <= width && canRaise) {
        if (stackBB <= 12 && state.canAllIn) return { type: 'allin' };
        let target = bb * (3 + limpers);
        if (state.currentBet > 0) target = Math.max(target, state.currentBet + bb * 2);
        const action = raiseTo(state, target);
        if (action) return action;
      }

      if (toCall <= bb && hp <= Math.min(0.6, width + 0.2) &&
          (state.you.seat === state.smallBlindSeat || state.you.seat === state.bigBlindSeat || after <= 2) &&
          toCall <= Math.max(bb, 0.05 * state.you.stack)) {
        return { type: 'call' };
      }
      return { type: 'fold' };
    }

    const threeBetWidth = level === 1 ? 0.055 : level === 2 ? 0.025 : 0.015;
    if (hp <= threeBetWidth && canRaise) {
      if (stackBB <= 16 || state.maxRaiseTo <= state.currentBet * 2.6) {
        if (state.canAllIn) return { type: 'allin' };
      }
      const target = level === 1 ? state.currentBet * 3 : state.currentBet * 2.2;
      const action = raiseTo(state, target);
      if (action) return action;
    }

    if (stackBB <= 15 && canRaise) {
      const width = pushThreshold(after, level);
      if (hp <= width && state.canAllIn) return { type: 'allin' };
    }

    const margin = toCall > 0.25 * state.you.stack ? 0.06 : 0.03;
    const callOK = ctx.eq >= potOdds + margin;
    const hpCap = level === 1 ? 0.5 : level === 2 ? 0.22 : 0.12;
    const speculative = hp <= 0.2 && stackBB >= 20 && toCall <= 0.06 * state.you.stack &&
      (isPair(state.you.cards[0], state.you.cards[1]) || isSuitedConnector(state.you.cards[0], state.you.cards[1]));
    const cheapBlind = (state.you.seat === state.bigBlindSeat || state.you.seat === state.smallBlindSeat) &&
      toCall <= bb * 2 && after <= 1 && hp <= 0.55 && ctx.eq >= potOdds - 0.01;

    if ((callOK && hp <= hpCap) || speculative || cheapBlind) {
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  function decidePostflop(state, ctx) {
    const eq = ctx.eq;
    const nLive = ctx.nLive;
    const pot = ctx.pot;
    const toCall = state.toCall;
    const potOdds = toCall / Math.max(1, pot + toCall);
    const bb = state.blinds[1];
    const stack = state.you.stack;
    const stackBB = stack / Math.max(1, bb);
    const valueThreshold = 1 / (nLive + 1) + 0.1;
    const raiseThreshold = 1 / (nLive + 1) + 0.2;
    const canRaise = state.minRaiseTo !== null;

    if (state.canCheck) {
      if (eq >= valueThreshold && canRaise) {
        let fraction = 0.6;
        if (eq >= 0.82) fraction = 0.8;
        else if (eq >= 0.7) fraction = 0.7;
        let target = state.you.bet + Math.max(bb, fraction * pot);
        if (stack <= Math.max(bb * 3, 0.55 * pot) || target >= state.maxRaiseTo * 0.85) {
          if (state.canAllIn) return { type: 'allin' };
        }
        const action = raiseTo(state, target);
        if (action) return action;
      }

      if (nLive === 1 && eq < 0.38 && canRaise) {
        const bluffFrequency = state.street === 'river' ? 0.18 : 0.11;
        if (Math.random() < bluffFrequency) {
          const target = state.you.bet + Math.max(bb, 0.5 * pot);
          const action = raiseTo(state, target);
          if (action) return action;
        }
      }
      return { type: 'check' };
    }

    let margin = 0.03;
    if (toCall > 0.5 * pot) margin = 0.06;
    else if (toCall <= 0.2 * pot) margin = 0.02;
    if (state.street === 'river') margin += 0.01;
    let implied = 0;
    if (state.street !== 'river' && stackBB > 20 && toCall <= 0.35 * pot) implied = 0.02;
    const callOK = eq >= potOdds + margin - implied;

    if (eq >= raiseThreshold && canRaise) {
      let fraction = 0.8;
      if (eq >= 0.85) fraction = 1.0;
      let target = state.you.bet + toCall + Math.max(bb, fraction * (pot + toCall));
      if (stack <= Math.max(bb * 3, 0.6 * (pot + toCall)) || target >= state.maxRaiseTo * 0.85) {
        if (state.canAllIn) return { type: 'allin' };
      }
      const action = raiseTo(state, target);
      if (action) return action;
    }

    if (callOK) return { type: 'call' };
    return { type: 'fold' };
  }

  function fallback(state) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'fold' };
  }

  function act(state) {
    try {
      if (!state || !state.you || !state.you.cards || state.you.cards.length !== 2) return fallback(state || {});
      if (state.street === 'preflop' && state.board.length === 0) {
        const analysis = analyzeActions(state);
        const tendency = computeTendency(state);
        const live = state.seats.filter(function (seat) {
          return seat.id !== state.you.id && !seat.out && !seat.folded;
        });
        const pot = state.pots.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
        const iterations = live.length >= 6 ? 1200 : live.length >= 4 ? 1600 : 2000;
        const eq = computeEquity(state, analysis, iterations, tendency);
        return decidePreflop(state, { analysis: analysis, eq: eq, pot: pot, nLive: live.length });
      }

      const analysis = analyzeActions(state);
      const tendency = computeTendency(state);
      const live = state.seats.filter(function (seat) {
        return seat.id !== state.you.id && !seat.out && !seat.folded;
      });
      const pot = state.pots.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
      const iterations = live.length >= 6 ? 1200 : live.length >= 4 ? 1600 : 2000;
      const eq = computeEquity(state, analysis, iterations, tendency);
      return decidePostflop(state, { analysis: analysis, eq: eq, pot: pot, nLive: live.length });
    } catch (error) {
      return fallback(state || {});
    }
  }

  module.exports = {
    name: 'Aizanoi Edge',
    botName: 'Aizanoi Edge',
    act: act
  };
})();
