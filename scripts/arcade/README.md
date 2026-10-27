# Headless Aizanoi Arcade

Requires Node.js 22 or newer. No dependencies or browser changes are needed.

Run commands from the repository root:

```sh
node scripts/arcade/arena.mjs snake-royale \
  --seat sample-random --seat ./my-bot.js \
  --games 10 --seed 1 --out results.json --replays ./replays
```

Paths are relative to the working directory. Roster identifiers resolve to
`frontend/arcade/<game>/bots/<id>.js`. Each occurrence of `--seat` creates an
independent participant, even when the bot identifiers or paths are identical.

Without `--seat`, the CLI selects `sample-random`, or the first alphabetically
sorted `sample-*` script, and fills the adapter's default seat count.

## Bot contracts

The game-specific contracts, not a generic move format, are authoritative:

- [Snake Royale](../../frontend/arcade/snake-royale/BOT_API.md)
- [Chess](../../frontend/arcade/chess/BOT_API.md)
- [Maze Chase](../../frontend/arcade/maze-chase/BOT_API.md)
- [Capture the Flag](../../frontend/arcade/capture-flag/BOT_API.md)
- [Holdem](../../frontend/arcade/holdem/BOT_API.md)
- [Football](../../frontend/arcade/football/BOT_API.md)
- [Anatolian Pact](../../frontend/arcade/anatolian-pact/BOT_API.md)

Bots are synchronous scripts, not ES modules. Do not use `import`, Node APIs, or
asynchronous return values.

For Snake, Chess, Maze Chase, and Capture the Flag:

```js
module.exports = function move(state) {
  // Return the game's documented move.
};
```

An exported `{ move(state) {} }` object or a global `move` function also works.

Holdem exports a function or `{ act(state) {} }`, returning an action string or
`{ type, amount }` according to its contract.

Football exports a function or `{ decide(state) {} }`, returning
`{ x, y, kick }`.

Anatolian Pact exports an object with `orders(state)`. Its optional methods are
`propose`, `answer`, `retreats`, and `builds`.

Bots have a fresh `module`/`exports`, `self`, `window`, the game's engine global,
a silent console, seeded `Math.random`, and `structuredClone`. Pact also has
`PactMapData`. Browser DOM, network, timers, and Node facilities are not supplied.

## Seats and roles

```sh
node scripts/arcade/arena.mjs chess --seat opus --seat ./challenger.js --swap
node scripts/arcade/arena.mjs maze-chase \
  --seat ./runner.js@runner --seat ./ghost.js@ghost
node scripts/arcade/arena.mjs capture-flag \
  --seat ./a.js@red --seat ./b.js@blue
node scripts/arcade/arena.mjs football \
  --seat ./a.js@red --seat ./b.js@blue
```

Role suffixes are part of each seat argument, not separate `--team` flags.
Maze defaults to one runner followed by ghosts. Capture the Flag and Football
default to alternating red and blue seats. Snake, Chess, Holdem, and Pact reject
role suffixes. `west` and `east` are recognized suffix tokens but are not valid
roles for these supplied runner contracts.

Pact requires one seat per `PactEngine.MAP.powers` entry, in canonical map order.
Football accepts one to four players per team.

`--swap` rotates participants through fixed slots. For two seats, alternating
games exchange colours, roles, or teams. Every full rotation shares an engine
seed; the next rotation increments it. `--games` is the total number of games,
not the number of pairs.

Chess preserves participant seed offsets across its colour swap. Other games
use their browser's slot-based bot seed derivation.

## Options

- `--games N`: positive integer, default 10.
- `--seed S`: unsigned 32-bit integer, default 1.
- `--swap`: rotate participants through slots.
- `--timeout MS`: decision deadline, 1–5000 milliseconds.
- `--out FILE`: write the complete aggregate JSON.
- `--replays DIR`: write one replay per game.
- `--quiet`: suppress result lines and the aggregate table. Errors use stderr.

Decision deadlines match the browser:

| Game | Milliseconds |
| --- | ---: |
| Snake Royale | 400 |
| Chess | 1000 |
| Maze Chase | 150 |
| Capture the Flag | 150 |
| Holdem | 1000 |
| Football | 50 |
| Anatolian Pact | 2000 |

Startup deadlines also match the supplied runners. A missed deadline immediately
terminates that worker and disables its seat for the rest of the game. This is
stricter than a five-second hang watchdog and follows the browser's retirement
policy. Later requests use the game's fallback without re-running that bot.

Chess forfeits on failure rather than substituting an arbitrary legal move.
Snake marks load failures dead. Maze uses null input; Capture the Flag stays.
Holdem checks when possible and otherwise folds. Football retains its last
accepted input, initially zero. Pact uses its runner's empty submissions and
lexically first legal retreats.

Randomness follows browser seed formulas and engine generators. Holdem uses a
deterministic public `botSeed = seed XOR 0xa511e9b3` instead of the browser's
cryptographic default, then uses the browser's PokerEngine seed expansion.
This makes CLI runs repeatable without deriving worker seeds directly from
deck RNG output. This is a reproducibility convention, not cryptographic
separation from a public CLI seed.

Results are deterministic for synchronous, clock-independent bots that meet
their deadlines. Wall-clock deadline enforcement necessarily depends on machine
load. `vm` is a compatibility context, not a security boundary: run untrusted
third-party bots inside an OS/container sandbox.

## Results

`--out` writes:

```json
{
  "game": "chess",
  "seed": 1,
  "seats": [],
  "games": [],
  "table": []
}
```

Each game preserves the engine's native result in `result`, records actual
seat assignments, the game seed, participant identities, and per-seat errors.
The aggregate table tracks participants rather than board slots.

Scoring extraction recognizes native winner identifiers and common
placements/standings fields. Unavailable place or points metrics are `null`,
not fabricated zeroes. Unrecognized winner encodings remain unclassified in
wins/draws/losses; the native engine result remains available for downstream
game-specific analysis.

Errors count failed bot decisions, load failures, transport failures, and
invalid payload fallbacks. Requests after retirement are not transport errors,
but decisions requiring a fallback can still count as failed decisions.

## Replays

Snake preserves the video renderer envelope:

```text
{
  meta: { kind, seed, field, turns, placements, winner, file },
  opts,
  names: { seatId: displayName },
  frames: [
    { turn, hazard, food, snakes: [{ id, body, health, alive }], events }
  ]
}
```

Coordinates are `[x, y]`. Placement entries retain engine fields and add
`errors`. Frame zero is the starting position after worker-load outcomes have
been applied. Each subsequent frame follows one engine step.

Other games use the analogous versioned envelope:

```text
{
  meta: {
    schema: "aizanoi-arena-replay-v1",
    kind, seed, field, turns, placements, winner, file,
    seats, result, errors, botSeed?
  },
  opts,
  names,
  frames: [
    { state, views: { seatId: botState }, events, ...gameSpecificFields }
  ]
}
```

`state` is the engine's `state()` or `snapshot()` output when available,
otherwise its serializable data fields. Functions are omitted; Sets become
arrays and Maps become records.

`views` captures each seat's documented engine bot state, so renderers can
interpret game-specific boards, cards, agents, and options without relying on
private engine field names. These are offline, omniscient replays and can
contain hidden information. Do not stream them to live contestants.

Chess frames add `status` and `turn`. Pact frames add `phase`, `units`, and
`owners`. Football records every physics step, with decisions every third step.
Holdem records initial state, hand starts, and actions. Pact records each
resolved phase. Maze and Capture the Flag record each tick.

Replay file names are `<game>-0001.json`, `<game>-0002.json`, and so on.
Existing files at those paths are overwritten.

## Loading a bot in the browser

The existing browser workers load only validated roster identifiers. They do
not accept arbitrary filesystem paths or uploads.

To use an external bot without an upload integration:

1. Copy its script to `frontend/arcade/<game>/bots/<valid-id>.js`.
2. Add its entry to that game's `bots.json`, following existing entries.
3. Serve the static site and select that roster entry.

Identifiers must match `[a-z0-9][a-z0-9.-]*` and must not contain `..`.
This CLI does not modify browser files, manifests, or CSP.

## Tests

```sh
node --test tests/arcade-cli.test.mjs
```

The integration tests spawn the real CLI for all seven games, check aggregate
JSON, exercise hanging and load-throwing bots, and validate replay envelopes.
