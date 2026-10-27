(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PokerEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';
  const NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  const DEFAULT_BLINDS = [[50, 100], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200], [800, 1600], [1000, 2000], [1500, 3000]];
  const DECK = Array.from(RANKS, rank => Array.from(SUITS, suit => rank + suit)).flat();
  const copy = value => JSON.parse(JSON.stringify(value));

  function seedValue(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
    let hash = 2166136261;
    for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return hash;
  }

  function rng(seed) {
    let a = seedValue(seed);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(cards, random) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function dealHand(seed, handNumber) {
    if (!Number.isSafeInteger(handNumber) || handNumber < 1) throw new RangeError('Invalid hand number');
    return shuffle(DECK.slice(), rng(seedValue(seed) ^ Math.imul(handNumber, 0x9E3779B1)));
  }

  function validCards(cards, min, max) {
    if (!Array.isArray(cards) || cards.length < min || cards.length > max || new Set(cards).size !== cards.length || cards.some(card => typeof card !== 'string' || !/^[2-9TJQKA][cdhs]$/.test(card))) {
      throw new TypeError('Invalid cards');
    }
  }

  function straightHigh(ranks) {
    const present = new Set(ranks);
    if (present.has(14)) present.add(1);
    for (let high = 14; high >= 5; high--) {
      if ([0, 1, 2, 3, 4].every(offset => present.has(high - offset))) return high;
    }
    return 0;
  }

  function evaluate(cards) {
    validCards(cards, 5, 7);
    const groups = Array.from({ length: 15 }, () => []);
    const suits = { c: [], d: [], h: [], s: [] };
    for (const card of cards) {
      groups[RANKS.indexOf(card[0]) + 2].push(card);
      suits[card[1]].push(card);
    }
    const ranks = [];
    for (let rank = 14; rank >= 2; rank--) if (groups[rank].length) ranks.push(rank);
    const flush = Object.values(suits).find(group => group.length >= 5);
    const flushRanks = flush ? flush.map(card => RANKS.indexOf(card[0]) + 2).sort((a, b) => b - a) : [];
    const sf = straightHigh(flushRanks);
    const straight = straightHigh(ranks);
    const quads = ranks.filter(rank => groups[rank].length === 4);
    const trips = ranks.filter(rank => groups[rank].length >= 3);
    const pairs = ranks.filter(rank => groups[rank].length >= 2);
    let category;
    let keys;
    let best;
    const straightCards = (high, pool) => Array.from({ length: 5 }, (_, i) => pool.find(card => RANKS.indexOf(card[0]) + 2 === (high - i === 1 ? 14 : high - i)));
    const take = (rank, count) => groups[rank].slice(0, count);
    if (sf) {
      category = 8;
      keys = [sf];
      best = straightCards(sf, flush);
    } else if (quads.length) {
      category = 7;
      keys = [quads[0], ranks.find(rank => rank !== quads[0])];
      best = [...take(keys[0], 4), ...take(keys[1], 1)];
    } else if (trips.length && pairs.some(rank => rank !== trips[0])) {
      category = 6;
      keys = [trips[0], pairs.find(rank => rank !== trips[0])];
      best = [...take(keys[0], 3), ...take(keys[1], 2)];
    } else if (flush) {
      category = 5;
      keys = flushRanks.slice(0, 5);
      best = keys.map(rank => flush.find(card => RANKS.indexOf(card[0]) + 2 === rank));
    } else if (straight) {
      category = 4;
      keys = [straight];
      best = straightCards(straight, cards);
    } else if (trips.length) {
      category = 3;
      keys = [trips[0], ...ranks.filter(rank => rank !== trips[0]).slice(0, 2)];
      best = [...take(keys[0], 3), ...keys.slice(1).flatMap(rank => take(rank, 1))];
    } else if (pairs.length >= 2) {
      category = 2;
      keys = [pairs[0], pairs[1], ranks.find(rank => rank !== pairs[0] && rank !== pairs[1])];
      best = [...take(keys[0], 2), ...take(keys[1], 2), ...take(keys[2], 1)];
    } else if (pairs.length) {
      category = 1;
      keys = [pairs[0], ...ranks.filter(rank => rank !== pairs[0]).slice(0, 3)];
      best = [...take(keys[0], 2), ...keys.slice(1).flatMap(rank => take(rank, 1))];
    } else {
      category = 0;
      keys = ranks.slice(0, 5);
      best = keys.map(rank => groups[rank][0]);
    }
    let value = category;
    for (let i = 0; i < 5; i++) value = value * 15 + (keys[i] || 0);
    return { rank: category, value, name: NAMES[category], best };
  }

  function equity(holeCards, board, opponents, iterations, random) {
    validCards(holeCards, 2, 2);
    validCards(board, 0, 5);
    validCards([...holeCards, ...board], 2, 7);
    if (!Number.isInteger(opponents) || opponents < 0 || opponents > 8 || !Number.isInteger(iterations) || iterations < 1 || typeof random !== 'function') throw new TypeError('Invalid equity parameters');
    const available = DECK.filter(card => !holeCards.includes(card) && !board.includes(card));
    let share = 0;
    for (let trial = 0; trial < iterations; trial++) {
      const deck = available.slice();
      const needed = 5 - board.length + opponents * 2;
      for (let i = 0; i < needed; i++) {
        const j = i + Math.floor(random() * (deck.length - i));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const runout = [...board, ...deck.slice(0, 5 - board.length)];
      const hero = evaluate([...holeCards, ...runout]).value;
      let ties = 1;
      let beaten = false;
      for (let opponent = 0; opponent < opponents; opponent++) {
        const offset = 5 - board.length + opponent * 2;
        const other = evaluate([...deck.slice(offset, offset + 2), ...runout]).value;
        if (other > hero) {
          beaten = true;
          break;
        }
        if (other === hero) ties++;
      }
      if (!beaten) share += 1 / ties;
    }
    return share / iterations;
  }

  function create(inputSeats, options = {}) {
    if (!Array.isArray(inputSeats) || inputSeats.length < 2 || inputSeats.length > 9) throw new TypeError('Use 2 to 9 seats');
    if (inputSeats.some(seat => !seat || typeof seat.id !== 'string' || !seat.id || typeof seat.name !== 'string') || new Set(inputSeats.map(seat => seat.id)).size !== inputSeats.length) throw new TypeError('Invalid seats');
    const stack = options.stack ?? 10000;
    const schedule = copy(options.blinds ?? DEFAULT_BLINDS);
    const handsPerLevel = options.handsPerLevel ?? 12;
    const maxHands = options.maxHands ?? 300;
    const positive = number => Number.isSafeInteger(number) && number > 0;
    if (!positive(stack) || !Number.isSafeInteger(stack * inputSeats.length) || !positive(handsPerLevel) || !positive(maxHands) || !Array.isArray(schedule) || !schedule.length || schedule.some(pair => !Array.isArray(pair) || pair.length !== 2 || !pair.every(positive) || pair[0] > pair[1] || !Number.isSafeInteger(pair[1] * 2))) throw new TypeError('Invalid options');
    const seed = seedValue(options.seed ?? 1);
    const seats = inputSeats.map((seat, index) => ({
      id: seat.id, name: seat.name, seat: index, stack, bet: 0, total: 0,
      folded: false, allIn: false, out: false, place: null, cards: [], startStack: stack
    }));
    let handNumber = 0;
    let button = -1;
    let smallBlindSeat = null;
    let bigBlindSeat = null;
    let previousActiveCount = 0;
    let street = 'idle';
    let board = [];
    let deck = [];
    let cursor = 0;
    let actor = null;
    let over = true;
    let done = false;
    let currentBet = 0;
    let lastRaise = 0;
    let pending = new Set();
    let acted = new Map();
    let actions = [];
    let history = [];
    let lastResult = null;
    let revealed = false;
    let events = [];

    const level = () => Math.min(schedule.length - 1, Math.floor(Math.max(0, handNumber - 1) / handsPerLevel));
    const blinds = () => schedule[level()].slice();
    const live = () => seats.filter(seat => !seat.out && !seat.folded);
    const able = () => live().filter(seat => !seat.allIn);
    const next = (index, predicate) => {
      for (let distance = 1; distance <= seats.length; distance++) {
        const candidate = (index + distance) % seats.length;
        if (predicate(seats[candidate])) return candidate;
      }
      return null;
    };
    const leftOrder = seat => (seat.seat - button - 1 + seats.length) % seats.length;
    const emit = (type, data = {}) => events.push({ type, ...data });

    function pay(seat, amount) {
      seat.stack -= amount;
      seat.bet += amount;
      seat.total += amount;
      seat.allIn = seat.stack === 0;
    }

    function pots() {
      if (over) return [];
      const levels = [...new Set(seats.map(seat => seat.total).filter(Boolean))].sort((a, b) => a - b);
      let previous = 0;
      const layers = levels.map(cap => {
        const contributors = seats.filter(seat => seat.total >= cap);
        const pot = {
          amount: (cap - previous) * contributors.length,
          eligible: contributors.filter(seat => !seat.folded && !seat.out).map(seat => seat.id)
        };
        previous = cap;
        return pot;
      });
      return layers.reduce((merged, pot) => {
        const last = merged[merged.length - 1];
        const same = last && last.eligible.length === pot.eligible.length &&
          last.eligible.every((id, index) => id === pot.eligible[index]);
        if (same) last.amount += pot.amount;
        else merged.push(pot);
        return merged;
      }, []);
    }

    function finishTournament() {
      const survivors = seats.filter(seat => !seat.out).sort((a, b) => b.stack - a.stack || a.seat - b.seat);
      if (survivors.length === 1 || handNumber >= maxHands) {
        done = true;
        let place = 1;
        survivors.forEach((seat, index) => {
          if (index && seat.stack !== survivors[index - 1].stack) place = index + 1;
          seat.place = place;
        });
        emit('finished', { placements: placements() });
      }
    }

    function placements() {
      const ordered = seats.slice().sort((a, b) =>
        done ? a.place - b.place || a.seat - b.seat :
          Number(a.out) - Number(b.out) ||
          (a.out ? a.place - b.place : b.stack - a.stack || a.seat - b.seat));
      return ordered.map((seat, index) => ({ id: seat.id, place: seat.place ?? index + 1, chips: seat.stack }));
    }

    function settle(showdown) {
      const contributors = seats.slice().sort((a, b) => b.total - a.total);
      const excess = contributors[0].total - contributors[1].total;
      if (excess > 0) {
        contributors[0].total -= excess;
        contributors[0].stack += excess;
        contributors[0].bet = Math.max(0, contributors[0].bet - excess);
        emit('uncalled', { id: contributors[0].id, amount: excess });
      }
      revealed = showdown;
      const contenders = live();
      const evaluations = new Map(showdown ? contenders.map(seat => [seat.id, evaluate([...seat.cards, ...board])]) : []);
      const awards = new Map();
      for (const pot of pots()) {
        const eligible = contenders.filter(seat => pot.eligible.includes(seat.id));
        if (!eligible.length) throw new Error('Pot has no eligible seat');
        const best = showdown ? Math.max(...eligible.map(seat => evaluations.get(seat.id).value)) : 0;
        const winners = eligible.filter(seat => !showdown || evaluations.get(seat.id).value === best).sort((a, b) => leftOrder(a) - leftOrder(b));
        const share = Math.floor(pot.amount / winners.length);
        let odd = pot.amount % winners.length;
        for (const seat of winners) {
          const amount = share + (odd-- > 0 ? 1 : 0);
          seat.stack += amount;
          awards.set(seat.id, (awards.get(seat.id) || 0) + amount);
        }
      }
      lastResult = {
        winners: [...awards].map(([id, amount]) => ({ id, amount, hand: evaluations.get(id)?.name ?? null })),
        showdown: showdown ? contenders.map(seat => ({ id: seat.id, cards: seat.cards.slice(), hand: evaluations.get(seat.id).name })) : []
      };
      over = true;
      actor = null;
      pending.clear();
      street = 'complete';
      seats.forEach(seat => {
        seat.bet = 0;
        seat.total = 0;
        seat.allIn = false;
      });
      const busted = seats.filter(seat => !seat.out && seat.stack === 0).sort((a, b) => a.startStack - b.startStack || leftOrder(b) - leftOrder(a));
      let remaining = seats.filter(seat => !seat.out).length;
      for (const seat of busted) {
        seat.out = true;
        seat.place = remaining--;
        emit('eliminated', { id: seat.id, place: seat.place });
      }
      history.push({
        handNumber, board: board.slice(), showdown: copy(lastResult.showdown),
        winners: lastResult.winners.map(({ id, amount }) => ({ id, amount }))
      });
      history = history.slice(-20);
      emit('handOver', { result: copy(lastResult) });
      finishTournament();
    }

    function advanceStreet() {
      if (street === 'river') {
        settle(true);
        return;
      }
      cursor++;
      const count = street === 'preflop' ? 3 : 1;
      board.push(...deck.slice(cursor, cursor + count));
      cursor += count;
      street = street === 'preflop' ? 'flop' : street === 'flop' ? 'turn' : 'river';
      seats.forEach(seat => { seat.bet = 0; });
      currentBet = 0;
      lastRaise = blinds()[1];
      acted.clear();
      pending = new Set(able().map(seat => seat.seat));
      emit('street', { street, board: board.slice() });
    }

    function progress(after) {
      while (!over) {
        if (live().length === 1) {
          settle(false);
          return;
        }
        const capable = able();
        for (const index of pending) {
          if (seats[index].folded || seats[index].allIn || seats[index].out) pending.delete(index);
        }
        if (capable.length <= 1) {
          const opposingBet = Math.max(0, ...live().filter(seat => seat !== capable[0]).map(seat => seat.bet));
          currentBet = Math.min(currentBet, opposingBet);
          pending = new Set(capable.filter(seat => seat.bet < currentBet).map(seat => seat.seat));
        }
        if (pending.size) {
          actor = next(after, seat => pending.has(seat.seat));
          return;
        }
        advanceStreet();
        after = button;
      }
    }

    function startHand() {
      if (!over || done) return [];
      events = [];
      handNumber++;
      const active = seats.filter(seat => !seat.out);
      if (active.length === 2 && previousActiveCount > 2) {
        const nextBig = next(bigBlindSeat, seat => !seat.out);
        button = next(nextBig, seat => !seat.out);
      } else {
        button = next(button, seat => !seat.out);
      }
      over = false;
      revealed = false;
      lastResult = null;
      board = [];
      actions = [];
      acted.clear();
      deck = dealHand(seed, handNumber);
      cursor = 0;
      street = 'preflop';
      seats.forEach(seat => {
        seat.bet = 0;
        seat.total = 0;
        seat.folded = seat.out;
        seat.allIn = false;
        seat.cards = [];
        seat.startStack = seat.stack;
      });
      smallBlindSeat = active.length === 2 ? button : next(button, seat => !seat.out);
      bigBlindSeat = next(smallBlindSeat, seat => !seat.out);
      previousActiveCount = active.length;
      let dealSeat = next(button, seat => !seat.out);
      for (let round = 0; round < 2; round++) {
        for (let i = 0; i < active.length; i++) {
          seats[dealSeat].cards.push(deck[cursor++]);
          dealSeat = next(dealSeat, seat => !seat.out);
        }
      }
      const [sb, bb] = blinds();
      pay(seats[smallBlindSeat], Math.min(sb, seats[smallBlindSeat].stack));
      pay(seats[bigBlindSeat], Math.min(bb, seats[bigBlindSeat].stack));
      currentBet = bb;
      lastRaise = bb;
      pending = new Set(able().map(seat => seat.seat));
      emit('handStart', { handNumber, button: seats[button].id, blinds: blinds() });
      emit('blind', { id: seats[smallBlindSeat].id, amount: seats[smallBlindSeat].bet });
      emit('blind', { id: seats[bigBlindSeat].id, amount: seats[bigBlindSeat].bet });
      progress(bigBlindSeat);
      return copy(events);
    }

    function legalActions(id) {
      const seat = seats.find(candidate => candidate.id === id);
      if (over || !seat || seat.seat !== actor) {
        return { canFold: false, canCheck: false, callAmount: 0, minRaiseTo: null, maxRaiseTo: 0, canAllIn: false };
      }
      const rights = !acted.has(actor) || currentBet - acted.get(actor) >= lastRaise;
      const maximum = seat.bet + seat.stack;
      const canRaise = rights && maximum > currentBet && able().some(other => other !== seat);
      return {
        canFold: true,
        canCheck: seat.bet >= currentBet,
        callAmount: Math.min(seat.stack, Math.max(0, currentBet - seat.bet)),
        minRaiseTo: canRaise ? (currentBet === 0 ? blinds()[1] : currentBet + lastRaise) : null,
        maxRaiseTo: maximum,
        canAllIn: seat.stack > 0 && (maximum <= currentBet || canRaise)
      };
    }

    function act(id, action) {
      const invalid = error => ({ ok: false, error });
      if (over || actor === null || seats[actor].id !== id) return invalid('Not your turn');
      if (!action || typeof action !== 'object') return invalid('Invalid action');
      const seat = seats[actor];
      const legal = legalActions(id);
      const type = action.type;
      let target = seat.bet;
      if (!['fold', 'check', 'call', 'raise', 'allin'].includes(type)) return invalid('Unknown action');
      if (type === 'check' && !legal.canCheck) return invalid('Cannot check');
      if (type === 'call' && legal.canCheck) return invalid('Nothing to call');
      if (type === 'call') target += legal.callAmount;
      if (type === 'allin') {
        if (!legal.canAllIn) return invalid('Betting is not reopened');
        target = legal.maxRaiseTo;
      }
      if (type === 'raise') {
        target = action.amount;
        if (!Number.isSafeInteger(target) || target <= currentBet || target > legal.maxRaiseTo) return invalid('Invalid raise amount');
      }
      if ((type === 'raise' || type === 'allin') && target > currentBet) {
        if (legal.minRaiseTo === null) return invalid('Betting is not reopened');
        if (target < legal.minRaiseTo && target !== legal.maxRaiseTo) return invalid('Raise below minimum');
      }
      events = [];
      const previousActor = actor;
      const previousBet = seat.bet;
      const oldBet = currentBet;
      if (type === 'fold') seat.folded = true;
      else pay(seat, target - seat.bet);
      pending.delete(previousActor);
      if (target > oldBet) {
        const full = target >= (oldBet === 0 ? blinds()[1] : oldBet + lastRaise);
        currentBet = target;
        if (full) {
          lastRaise = oldBet === 0 ? target : target - oldBet;
          pending = new Set(able().filter(other => other !== seat).map(other => other.seat));
        } else {
          for (const other of able()) if (other !== seat && other.bet < currentBet) pending.add(other.seat);
        }
      }
      acted.set(previousActor, currentBet);
      const record = { id, street, type, amount: seat.bet - previousBet };
      actions.push(record);
      emit('action', record);
      progress(previousActor);
      return { ok: true, events: copy(events) };
    }

    function publicState() {
      return {
        seats: seats.map(seat => ({
          id: seat.id, name: seat.name, stack: seat.stack, bet: seat.bet,
          total: seat.total, folded: seat.folded, allIn: seat.allIn, out: seat.out,
          place: seat.place, isButton: seat.seat === button,
          cards: revealed && lastResult.showdown.some(entry => entry.id === seat.id) ? seat.cards.slice() : null
        })),
        board: board.slice(), pots: pots(), street, handNumber, blinds: blinds(),
        smallBlindSeat, bigBlindSeat,
        toAct: actor === null ? null : seats[actor].id
      };
    }

    function botState(id) {
      const seat = seats.find(candidate => candidate.id === id);
      if (!seat) throw new TypeError('Unknown seat');
      const legal = legalActions(id);
      return {
        handNumber, street,
        you: { id, seat: seat.seat, cards: seat.cards.slice(), stack: seat.stack, bet: seat.bet, total: seat.total },
        board: board.slice(), pots: pots(),
        toCall: legal.callAmount,
        minRaiseTo: legal.minRaiseTo,
        maxRaiseTo: legal.maxRaiseTo,
        canCheck: legal.canCheck,
        canAllIn: legal.canAllIn,
        currentBet,
        lastFullRaise: lastRaise,
        blinds: blinds(),
        buttonSeat: button,
        smallBlindSeat,
        bigBlindSeat,
        seats: seats.map(other => ({
          id: other.id, name: other.name, seat: other.seat,
          stack: other.stack, bet: other.bet, total: other.total,
          folded: other.folded, allIn: other.allIn, out: other.out
        })),
        actions: copy(actions),
        history: copy(history),
        tournament: {
          startingStack: stack, maxHands, handsPerLevel,
          level: level(), blindSchedule: copy(schedule)
        },
        timeLimitMs: 1000
      };
    }

    return {
      get handNumber() { return handNumber; },
      get level() { return level(); },
      get blinds() { return blinds(); },
      startHand,
      toAct: () => actor === null ? null : seats[actor].id,
      legalActions,
      act,
      publicState,
      botState,
      handOver: () => over,
      handResult: () => lastResult ? copy(lastResult) : null,
      finished: () => done,
      result: () => ({ placements: placements(), hands: handNumber })
    };
  }

  return { create, evaluate, dealHand, rng, equity };
});
