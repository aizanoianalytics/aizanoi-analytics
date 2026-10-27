# AI Hold'em bot contract

Contract version: 1, with additive public-state fields.

This document is suitable as the integration portion of an AI-model prompt.
Implement one synchronous JavaScript decision function. Do not implement
dealing, settlement, timers, workers or UI.

## Submission

Place the script at `bots/<id>.js`. An identifier must match
`^[a-z0-9][a-z0-9.-]*$` and must not contain `..`.

Accepted exports:

```js
module.exports = function act(state) {
  return { type: state.canCheck ? 'check' : 'fold' };
};
```

Or:

```js
module.exports = {
  name: 'Example',
  act(state) {
    return state.canCheck ? 'check' : 'fold';
  }
};
```

There is no ES-module loader, package installation or bundler in the worker.
Do not use `import`, `require`, external assets, dynamic code generation,
network access or DOM APIs. The submission must be self-contained.

The roster is `bots.json`:

```json
{
  "version": 1,
  "bots": [
    {
      "id": "example",
      "name": "Example",
      "botName": "Example",
      "lab": "Author or model",
      "color": "#2dd4bf",
      "file": "bots/example.js",
      "bytes": 123,
      "note": "Short provenance and implementation description."
    }
  ]
}
```

`bytes` is the actual UTF-8 file size, including final newline. The example
value is illustrative, not the size of the example above. House samples use
lab `Aizanoi sample` and explicitly say `not an AI-model entry`.

## Rules

- Two through nine fixed, clockwise seats. Eliminated seats retain their
  indices; never renumber a seat after elimination.
- No-limit Texas Hold'em: two private cards, then flop/turn/river community
  cards. A card is rank `23456789TJQKA` plus suit `cdhs`, for example `Ah`.
- Hole cards are dealt one at a time clockwise, starting left of the button,
  for two rounds. A card is burned before each board street.
- Default starting stack: 10,000 play chips per seat.
- Default blinds:
  `[[50,100],[100,200],[150,300],[200,400],[300,600],[400,800],
  [600,1200],[800,1600],[1000,2000],[1500,3000]]`.
  Advance one level every twelve hands, stopping at the final level.
- Normally the next surviving seat becomes the button. On the transition
  to heads-up, the big blind advances from the previous big blind and the
  other survivor becomes the button.
- Heads-up: button posts small blind and acts first preflop, last postflop.
  Otherwise preflop starts left of the big blind, and postflop left of button.
- A bet/raise amount is the seat's TOTAL contribution on this street, not
  additional chips and not its total contribution across the hand.
- Minimum opening bet is the big blind. Minimum raise increment is the last
  full bet/raise increment. Short all-ins are accepted, but do not by
  themselves reopen a player who already acted. Cumulative short raises
  reopen that player once the amount faced since their last action reaches
  a full raise. The house convention also does not reopen a checker facing
  only a short opening all-in.
- A seat cannot raise when no opponent has chips available to respond.
  A lone solvent seat only acts if it still owes chips.
- Side pots are settled separately. Folded chips remain in the pot but folded
  seats cannot win. Unmatched excess is refunded.
- Best five of seven cards wins; ace-low A2345 is a five-high straight.
  Suits have no rank. Tied winners split each pot; odd chips go clockwise
  starting immediately left of the button.
- All live hands at showdown are public, including an eliminated player's
  shown hand. A hand won by folds reveals no hole cards.
- Zero-chip seats are eliminated. Simultaneous eliminations rank larger
  starting-hand stacks higher. Equal starting stacks use button-relative
  order: the first seat left of the button ranks higher.
- End when one survivor remains, or after `maxHands` completed hands
  (default 300). At the hand cap, survivors rank by chips; equal stacks share
  competition places, e.g. `1,1,3`. Already eliminated places are retained.

## Decision state

The runner calls `act(state)` only for the current acting seat, on an active
street: `preflop`, `flop`, `turn` or `river`.

All chip amounts and seat indices are integers. Monetary values do not
exist; these are play chips. IDs and names are strings. Arrays are ordered:
seats by original index, actions chronologically, history oldest first.

Complete first-decision example for a three-seat default table:

```json
{
  "handNumber": 1,
  "street": "preflop",
  "you": {
    "id": "s1",
    "seat": 0,
    "cards": ["Ah", "Kd"],
    "stack": 10000,
    "bet": 0,
    "total": 0
  },
  "board": [],
  "pots": [
    { "amount": 100, "eligible": ["s2", "s3"] },
    { "amount": 50, "eligible": ["s3"] }
  ],
  "toCall": 100,
  "minRaiseTo": 200,
  "maxRaiseTo": 10000,
  "canCheck": false,
  "canAllIn": true,
  "currentBet": 100,
  "lastFullRaise": 100,
  "blinds": [50, 100],
  "buttonSeat": 0,
  "smallBlindSeat": 1,
  "bigBlindSeat": 2,
  "seats": [
    {
      "id": "s1",
      "name": "Example",
      "seat": 0,
      "stack": 10000,
      "bet": 0,
      "total": 0,
      "folded": false,
      "allIn": false,
      "out": false
    },
    {
      "id": "s2",
      "name": "Sample Caller",
      "seat": 1,
      "stack": 9950,
      "bet": 50,
      "total": 50,
      "folded": false,
      "allIn": false,
      "out": false
    },
    {
      "id": "s3",
      "name": "Sample Tight",
      "seat": 2,
      "stack": 9900,
      "bet": 100,
      "total": 100,
      "folded": false,
      "allIn": false,
      "out": false
    }
  ],
  "actions": [],
  "history": [],
  "tournament": {
    "startingStack": 10000,
    "maxHands": 300,
    "handsPerLevel": 12,
    "level": 0,
    "blindSchedule": [
      [50,100],
      [100,200],
      [150,300],
      [200,400],
      [300,600],
      [400,800],
      [600,1200],
      [800,1600],
      [1000,2000],
      [1500,3000]
    ]
  },
  "timeLimitMs": 1000
}
```

The cards above illustrate the schema; no seed is implied.

### Field definitions

- `handNumber`: one-based hand number.
- `street`: active betting street.
- `you.id`: stable runner ID, `s1` through `s9`.
- `you.seat`: zero-based original seat index.
- `you.cards`: exactly two private card strings.
- `you.stack`: uncommitted chips.
- `you.bet`: chips committed on this street.
- `you.total`: chips committed during this whole hand, including blinds.
- `board`: zero, three, four or five public cards.
- `pots`: current contribution layers, each `{amount, eligible}`. Eligibility
  IDs include only nonfolded contributors reaching that layer. Adjacent
  layers with identical eligibility are merged. These are provisional:
  pending calls can change eligibility and unmatched excess is refunded.
  Sum their amounts for total committed chips; do not add street bets again.
- `toCall`: additional chips a call would commit, capped at your stack.
- `currentBet`: outstanding street wager before your capped call.
  Thus `currentBet - you.bet` may exceed `toCall`.
- `minRaiseTo`: minimum full raise-to amount, or `null` if raising is not
  permitted. May exceed `maxRaiseTo`, in which case only a short all-in raise
  is available.
- `maxRaiseTo`: `you.bet + you.stack`.
- `canCheck`: whether check is legal.
- `canAllIn`: whether the `allin` return value is legal, including an all-in
  call. A closed raise right does not prohibit a capped all-in call.
- `lastFullRaise`: minimum full raise increment on this street.
- `blinds`: current nominal `[small,big]`; an actual short blind can be smaller.
- `buttonSeat`, `smallBlindSeat`, `bigBlindSeat`: original zero-based indices.
- `seats`: all original seats, including folded and eliminated seats.
  Each entry has exactly the fields illustrated above. No opponent cards
  are supplied. `folded` means not contesting this hand; `allIn` means no
  chips left to act with; `out` means eliminated from the tournament.
- `actions`: this hand's voluntary actions, excluding blind payments.
  Each entry is `{id, street, type, amount}`. `type` is the accepted submitted
  action type. `amount` is additional chips committed by that action, NOT
  its raise-to amount. Fold/check amounts are zero. An `allin` entry may be
  a call or a raise. Derive its meaning from previous street bets.
- `history`: at most twenty completed public hand summaries, oldest first.
- `tournament.startingStack`: initial chips per original seat.
- `tournament.maxHands`: completed-hand cap.
- `tournament.handsPerLevel`: number of hands per level.
- `tournament.level`: current zero-based level.
- `tournament.blindSchedule`: full schedule, copied for this decision.
- `timeLimitMs`: nominal decision deadline, currently 1000.

History entry shape:

```json
{
  "handNumber": 12,
  "board": ["2c", "7d", "Jh", "Qs", "Ac"],
  "showdown": [
    { "id": "s1", "cards": ["Ah", "Kd"], "hand": "One pair" },
    { "id": "s3", "cards": ["Qc", "9s"], "hand": "One pair" }
  ],
  "winners": [
    { "id": "s1", "amount": 700 }
  ]
}
```

`showdown` is empty for a fold win. `winners.amount` is gross chips awarded,
not net profit; uncalled refunds are not awards. Folded cards, burn cards,
deck order, current seed and opponent private cards never appear in state.

Every decision receives a fresh detached plain object. Mutating it cannot
change engine state. Do not rely on mutation carrying to the next call.

## Return values

Return one of:

```js
{ type: 'fold' }
{ type: 'check' }
{ type: 'call' }
{ type: 'raise', amount: 500 }
{ type: 'allin' }
```

Strings `'fold'`, `'check'`, `'call'` and `'allin'` are also accepted.
`'raise'` alone is invalid because it lacks an amount.

- Fold is legal on every decision, including when checking is possible.
- Check requires `canCheck`.
- Call requires `!canCheck`; it commits exactly `toCall`.
- Raise requires non-null `minRaiseTo`. `amount` must be a safe integer,
  exceed `currentBet`, and not exceed `maxRaiseTo`. It must reach
  `minRaiseTo`, unless it is exactly `maxRaiseTo` for a short all-in.
- All-in requires `canAllIn`; it commits your entire remaining stack.
- There is no separate `bet` action: use `raise` when opening a street.
- Promises/async functions are unsupported. Return the action synchronously.
- Extra return fields are ignored; only a raise's numeric amount is used.

## Timing, failures and lifecycle

Each seat gets a separate classic Web Worker, even if the same bot sits
multiple times. The engine helper loads before the bot script.

Initialization and each decision have a 1000 ms runner deadline. Decision
time includes worker message delivery, computation and response delivery;
it is not a promise of 1000 ms CPU time.

Late, missing, malformed, throwing or engine-invalid answers count as one
error for that decision. Fallback is check if legal, otherwise fold.
A timed-out or broken worker is terminated; its later decisions use the
same fallback and count errors. An invalid action alone does not terminate
a healthy worker.

The worker persists across hands. Module-level memory is allowed, but is
lost when the worker is terminated. Do not start background work, send
protocol messages or overwrite worker globals.

Humans have no decision timeout. Invalid human actions are rejected without
consuming the pending decision.

## Determinism and secrecy

The engine is headless, DOM-free and deterministic for seats, options,
seed and accepted action sequence. `dealHand(seed, handNumber)` depends only
on those two arguments, never on bot computation or prior deck consumption.

Worker `Math.random` is replaced before the bot script loads. It is a
persistent seeded stream, not reset per hand or decision. Its initial seed
is independent of the private deck seed.

`HoldemRunner.start(seats, options)` accepts an optional unsigned 32-bit
`botSeed`, separate from `options.seed`. A tournament harness can privately
record both for replay. Never derive one from the other, reuse the same
value, or publish deck seeds while a match is live. Default worker entropy
comes from `crypto.getRandomValues`, independently of the deck.

Same deck seed alone reproduces decks, not bot randomness. To reproduce
a full bot match, supply the same independent botSeed, seat order, bot
sources and options. Real deadline failures can still differ across
machines. Fixed sample counts avoid wall-clock-dependent decisions.

Do not use Date, performance clocks, unseeded entropy, networking or
environment characteristics to choose actions. Use fixed, bounded work.

Seat rotation preserves positional dealing while the live-seat pattern
is the same. Eliminations and differing actions can diverge later hands'
dealing positions; duplicate decks do not guarantee identical tournaments.

This is a reviewed-code arena, not a hostile-code sandbox. The 32-bit deck
PRNG is not a cryptographic secrecy mechanism. Do not search for the private
seed, reconstruct unrevealed cards, communicate with other bots, or inspect
worker infrastructure. Independently seeded worker streams remove direct
seed disclosure, not the theoretical feasibility of exhaustive seed search.

## Helper globals

`PokerEngine` is a worker global. No explicit import is needed.

### `PokerEngine.evaluate(cards)`

Accepts five through seven distinct valid cards. Returns:

```js
{
  rank: 6,
  value: 5308875,
  name: 'Full house',
  best: ['Ac', 'Ad', 'Ah', 'Ks', 'Kc']
}
```

The numeric value above corresponds to aces full of kings.

Ranks are 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush,
6 full house, 7 quads, 8 straight flush. Higher `value` wins; equal values
tie. `best` contains five input cards realizing that value. Do not use the
choice/order of same-rank suits as a tiebreak.

Invalid counts, malformed cards or duplicates throw.

### `PokerEngine.equity(holeCards, board, opponents, iterations, random)`

Monte Carlo expected fractional pot share against uniformly sampled
opponent cards and runouts. It is not a range model or side-pot payout
calculator.

- `holeCards`: two distinct cards.
- `board`: zero through five cards, distinct from the hole cards.
- `opponents`: integer zero through eight.
- `iterations`: positive integer.
- `random`: function returning numbers in `[0,1)`, normally `Math.random`.

Returns a number in `[0,1]`; ties count fractionally. Invalid parameters
throw. Supply a modest fixed iteration count, particularly at nine seats.

### `PokerEngine.rng(seed)`

Returns a mulberry32 random function producing values in `[0,1)`.
Finite numeric seeds become unsigned 32-bit integers. Other seeds are
stringified and FNV-1a hashed using the engine's code-point iteration.
Use this only for your own deterministic simulations, never deck inference.

### `PokerEngine.dealHand(seed, handNumber)`

Returns a fresh 52-card shuffled order; handNumber is a positive safe
integer. Available for offline test harnesses and duplicate-play tooling,
not for discovering live hidden cards.

### `PokerEngine.create(seats, options)`

Available for independent headless simulations. It creates a separate
game, not access to the live game. The engine API is described in
`index.md` and exported identically through UMD in Node.

Other globals include ordinary JavaScript built-ins, the CommonJS-style
`module`/`exports` shim, and a silent console. `window` aliases the worker
global; it is not a browser DOM window.

## Minimal complete bot

```js
'use strict';

module.exports = {
  name: 'Example Legal Bot',
  act(state) {
    if (state.canCheck) return { type: 'check' };
    return { type: 'fold' };
  }
};
```

This is a legality example, not a competitive strategy.

## Implementation checklist

- Keep seat index, seat ID and bot roster ID separate.
- Use `you.bet + additionalChips` when constructing a raise-to total.
- Do not count `pots` and current street bets twice.
- Respect null `minRaiseTo`; use `canAllIn` for all-in legality.
- Do not infer that a short call matched the outstanding wager.
- Ignore folded/out opponents as contenders, but retain their committed chips.
- Treat history as bounded public information, not a complete tournament log.
- Bound loops and simulation work; leave time for message delivery.
- Test with two and nine seats, short stacks, short all-ins and tied boards.
- Never depend on the identity, cards or implementation of a specific opponent.
