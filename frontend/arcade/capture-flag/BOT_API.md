# Capture the Flag: external bot contract

Use this document as the rules and interface section of an AI-model prompt.
Submit one plain JavaScript file, `bots/<id>.js`, with no dependencies, DOM,
network access, dynamic code generation, or external assets.

## Export and return value

Preferred export:

    'use strict';
    module.exports = function move(state) {
      return 'stay';
    };

Also supported:

    module.exports = {
      name: 'Example',
      move(state) {
        return 'stay';
      }
    };

Object methods receive their exported object as `this`. A legacy global
`self.move` is accepted, but new bots should use `module.exports`.
`exports` initially aliases `module.exports`; assigning `exports = ...`
does not replace the export.

Return exactly one of these synchronous, lowercase strings:

- `up`: `(0, -1)`
- `down`: `(0, 1)`
- `left`: `(-1, 0)`
- `right`: `(1, 0)`
- `stay`: `(0, 0)`

There is no diagonal movement, attack action, message action, or separate
flag action. Promises, objects, null, missing values, thrown exceptions,
and unrecognized strings produce `stay` for that request. Do not make
`move` asynchronous.

Each seat has an independent worker, even when several seats use the same
file. Module-level memory persists for that seat within one game, but not
between games. Teammates do not share JavaScript globals.

## Rules

- Two teams, `west` and `east`, each have 1–4 agents.
- Coordinates are zero-based: x increases right, y increases down.
  Read terrain as `state.grid[y][x]`.
- Default field: 33×21; border column: 16.
  West owns `x < border`, East owns `x > border`.
  The border column is neutral: an agent there cannot tag or be tagged.
- `.` is open; `#` is a wall. Walls and field edges block movement.
- Fields are seeded and point-symmetric: `(x,y)` mirrors to
  `(width-1-x,height-1-y)`. All open terrain is connected.
  Home zones and jails are reserved open terrain.
- All active agents choose from the same pre-step state and move one cell
  simultaneously. Teammates may occupy the same cell.
- After movement, a defender can tag an enemy on its cell or an
  orthogonally adjacent cell only when both agents are inside that
  defender's half. Eligible cell swaps also count; a swap does not
  override neutral-column immunity. Diagonal adjacency does not count.
  Walls block movement, not the Manhattan-distance tagging test.
- A tagged agent is moved to the opposing team's jail and frozen.
  Any enemy flag it carried returns immediately to its stand.
- A surviving teammate on or orthogonally adjacent to any cell of that
  opposing jail rescues all its team's prisoners. Rescue includes
  prisoners tagged during that same tick.
- Rescued prisoners have `jailed: false`, `respawnIn: 3`, and null
  coordinates. They spend the next three steps inactive and then appear
  on their own flag stand. They may first act on the following step.
- Without rescue, a prisoner is released after 40 subsequent steps.
  It appears at its own stand, and may act on the following step.
- A surviving active agent on the enemy flag picks it up automatically.
  Only one agent can carry each flag. Defenders cannot pick up their
  own flag. Carrier speed is unchanged.
- A carrier entering its own half scores one capture; the flag returns
  to its stand. Reaching the border alone is not a capture.
  The carrier's own flag need not be home.
- First to `capturesToWin` captures wins. All same-tick captures resolve
  together. If both teams reach the target with equal scores on the
  same tick, the match is a draw; tags do not break that tie.
- Otherwise play ends at `maxTicks`. More captures wins, then more total
  team tags, otherwise draw. A threshold finish on the final tick takes
  precedence over the time-limit tiebreaker.

### Exact step ordering

A state with `tick: n` requests the action for step `n + 1`.

1. Snapshot agents active at the start; increment tick.
2. Advance existing jail/respawn timers and release completed timers.
   Newly released agents are not in this step's active snapshot.
3. Apply simultaneous moves for the original active agents.
4. Determine all tags from one movement snapshot, then apply them.
5. Surviving active agents rescue prisoners.
6. Surviving active agents pick up flags.
7. Carriers update flag coordinates and capture inside their own half.
8. Check the capture target and time limit.

There is no initiative advantage from worker completion order.
Agents are sorted by lexicographic `String(id)` order, using ordinary
JavaScript string comparison, not locale comparison. When several
defenders qualify for one tag, the first receives credit. When teammates
simultaneously reach a free flag, the first picks it up. The first eligible
rescuer is credited, but all prisoners are rescued. One defender may tag
several enemies in a tick.

## State schema

`state` is a fresh, detached, plain JSON-compatible object:

    {
      tick: integer,
      maxTicks: positive integer,
      capturesToWin: positive integer,
      width: odd integer,
      height: odd integer,
      grid: array of height strings, each width characters,
      border: integer,
      you: Agent,
      team: "west" | "east",
      teammates: Agent[],
      enemies: Agent[],
      flags: { west: Flag, east: Flag },
      zones: {
        west: { home: Cell[9], jail: Cell[4], half: string },
        east: { home: Cell[9], jail: Cell[4], half: string },
        border: integer
      },
      score: { west: integer, east: integer }
    }

`Agent` contains exactly:

    {
      id: string | safe integer,
      team: "west" | "east",
      name: string,
      x: integer | null,
      y: integer | null,
      carrying: boolean,
      jailed: boolean,
      jailTicks: integer,
      respawnIn: integer,
      tags: integer,
      captures: integer,
      timesJailed: integer,
      flagPickups: integer
    }

`Cell` is `{ x: integer, y: integer }`.

`Flag` is:

    {
      x: integer,
      y: integer,
      carrier: string | safe integer | null,
      home: { x: integer, y: integer }
    }

Important details:

- `you` is excluded from `teammates`; enemies includes every opposing
  agent. Both lists include jailed and respawning agents.
- An agent is active iff `!agent.jailed && agent.respawnIn === 0`.
  Do not use null coordinates in distance/path calculations.
- Jailed agents have actual jail-cell coordinates.
  Only rescue transit uses null coordinates.
- `jailTicks` counts elapsed jail steps; it is not time remaining.
- Statistics are cumulative within this game.
- Flag coordinates follow its carrier; `home` never moves.
  Carrier ID `0` is valid: test `carrier !== null`, not truthiness.
- Page-generated IDs are `w1`–`w4` and `e1`–`e4`.
  Headless callers may use other unique strings or safe integers.
  Numeric IDs and their string equivalents cannot coexist.
  Preserve the ID type when comparing with `===`.
- `half` is a descriptive string, such as `x<16`, not executable code.
  Use `team`, `border`, and numeric comparisons.
- Full information is intentional: terrain, all positions, flags, zones,
  scores, timers, and statistics are public. There is no fog of war.
  Enemy source code, pending moves, and worker memory are not public.
- Modifying a received state cannot modify the engine or another seat's
  state. Nevertheless, treat input as read-only.
- `capturesToWin` is an additive public field. There is no state schema
  version field; the roster's `version: 1` is a different contract.

### Complete JSON example

This is an illustrative mid-game state on a custom 9×9 field, not a
recorded match or a promise that a particular seed produces this field.

    {
      "tick": 24,
      "maxTicks": 1200,
      "capturesToWin": 3,
      "width": 9,
      "height": 9,
      "grid": [
        ".........",
        ".........",
        "...#.#...",
        "...#.#...",
        ".........",
        "...#.#...",
        "...#.#...",
        ".........",
        "........."
      ],
      "border": 4,
      "you": {
        "id": "w1",
        "team": "west",
        "name": "Example",
        "x": 5,
        "y": 4,
        "carrying": true,
        "jailed": false,
        "jailTicks": 0,
        "respawnIn": 0,
        "tags": 0,
        "captures": 0,
        "timesJailed": 0,
        "flagPickups": 1
      },
      "team": "west",
      "teammates": [
        {
          "id": "w2",
          "team": "west",
          "name": "Example",
          "x": 1,
          "y": 4,
          "carrying": false,
          "jailed": false,
          "jailTicks": 0,
          "respawnIn": 0,
          "tags": 0,
          "captures": 0,
          "timesJailed": 0,
          "flagPickups": 0
        }
      ],
      "enemies": [
        {
          "id": "e1",
          "team": "east",
          "name": "Opponent",
          "x": 7,
          "y": 4,
          "carrying": false,
          "jailed": false,
          "jailTicks": 0,
          "respawnIn": 0,
          "tags": 0,
          "captures": 0,
          "timesJailed": 0,
          "flagPickups": 0
        }
      ],
      "flags": {
        "west": {
          "x": 2,
          "y": 4,
          "carrier": null,
          "home": { "x": 2, "y": 4 }
        },
        "east": {
          "x": 5,
          "y": 4,
          "carrier": "w1",
          "home": { "x": 6, "y": 4 }
        }
      },
      "zones": {
        "west": {
          "home": [
            { "x": 1, "y": 3 }, { "x": 2, "y": 3 }, { "x": 3, "y": 3 },
            { "x": 1, "y": 4 }, { "x": 2, "y": 4 }, { "x": 3, "y": 4 },
            { "x": 1, "y": 5 }, { "x": 2, "y": 5 }, { "x": 3, "y": 5 }
          ],
          "jail": [
            { "x": 1, "y": 1 }, { "x": 2, "y": 1 },
            { "x": 1, "y": 2 }, { "x": 2, "y": 2 }
          ],
          "half": "x<4"
        },
        "east": {
          "home": [
            { "x": 7, "y": 5 }, { "x": 6, "y": 5 }, { "x": 5, "y": 5 },
            { "x": 7, "y": 4 }, { "x": 6, "y": 4 }, { "x": 5, "y": 4 },
            { "x": 7, "y": 3 }, { "x": 6, "y": 3 }, { "x": 5, "y": 3 }
          ],
          "jail": [
            { "x": 7, "y": 7 }, { "x": 6, "y": 7 },
            { "x": 7, "y": 6 }, { "x": 6, "y": 6 }
          ],
          "half": "x>4"
        },
        "border": 4
      },
      "score": { "west": 0, "east": 0 }
    }

## Timing and fallback

- Worker initialization, including bot import: 5 seconds.
- Each active-seat request: 150 milliseconds measured by the runner.
- Requests are collected concurrently; one engine step follows completion
  or fallback for all requested seats.
- Jailed/respawning seats receive no move request. Their worker memory
  remains intact and their random stream does not advance automatically.
- A synchronous exception or invalid return means `stay` for that tick;
  the worker can be called again.
- Initialization failure, deadline expiry, worker error, or message
  deserialization failure terminates that worker. The seat remains in
  the game and stays still for the rest of that game.
- No retry or replacement bot is silently substituted.
- Requests and responses carry the pre-step tick. Stale or unrelated
  responses cannot supply another tick's move.

The timer includes scheduling and message overhead, not just function
execution. Do not design around consuming the full 150ms. Instant speed
removes the presentation delay; it does not remove bot deadlines.

## Determinism

The engine is deterministic for the seats, seed, options, and sequence of
accepted actions. It does not read clocks or `Math.random`.

For seat index `i` in the runner's input array:

    seatSeed = (
      (Number(options.seed) || 0) + Math.imul(i + 1, 0x9e3779b9)
    ) >>> 0;

Before importing the bot, the worker installs:

    Math.random = FlagEngine.rng(seatSeed ^ 0x9e3779b9);

`FlagEngine.rng` is mulberry32 and returns a new generator producing
numbers in `[0,1)`. Each worker has its own stream. Calling `Math.random`
at import time consumes that seat's stream too.

Use stable ordering and deterministic tie-breaking. Avoid clocks,
network data, timer-driven decisions, and unseeded entropy. A browser
worker still exposes ordinary platform facilities: this is not a
hardened sandbox that prevents nondeterminism. Hardware-dependent
timeouts can change accepted actions. For exact replay, preserve the
accepted action log in a headless host; a field seed alone cannot
reproduce arbitrary third-party code or missed deadlines.

## Worker globals and loading

Available before bot import:

- `FlagEngine.create(seats, options)`
- `FlagEngine.generateField(seed, width, height)`
- `FlagEngine.rng(seed)`
- `FlagEngine.DIRS`: frozen direction-to-delta map, including `stay`
- `module.exports` and its initial alias `exports`
- Seeded `Math.random`
- `self`; `window` aliases `self`, not a browser page
- Silent `console.log/error/warn/info`
- Standard worker JavaScript objects, arrays, maps, sets, typed arrays, etc.

There is no DOM, `document`, canvas arena handle, or page input object.
This is not a Node environment: do not use `require`, filesystem APIs,
npm packages, or ES-module imports in the submitted classic-worker file.
Do not replace messaging handlers or call `postMessage` yourself.

The host validates the bot ID against `^[a-z0-9][a-z0-9.-]*$` and rejects
`..`. It imports only `bots/${id}.js`; messages cannot supply a script
URL. Only reviewed bot files should be published.

## Minimal executable bot

This example only validates activity and chooses a legal open neighbor.
It is an interface demonstration, not a competitive strategy.

    'use strict';

    module.exports = function move(state) {
      const you = state.you;
      if (you.jailed || you.respawnIn > 0) return 'stay';

      for (const action of ['up', 'right', 'down', 'left']) {
        const [dx, dy] = FlagEngine.DIRS[action];
        const x = you.x + dx;
        const y = you.y + dy;
        if (x >= 0 && x < state.width &&
            y >= 0 && y < state.height &&
            state.grid[y][x] === '.') {
          return action;
        }
      }
      return 'stay';
    };

## Headless engine API

`engine.js` is DOM-free UMD. It exports `module.exports` in CommonJS
contexts, otherwise global `FlagEngine`.

    const game = FlagEngine.create(seats, {
      seed: 7,
      width: 33,
      height: 21,
      maxTicks: 1200,
      capturesToWin: 3
    });

Dimensions must be odd integers from 9 through 201. Both limits must be
positive safe integers. Each team needs 1–4 seats. Names default to IDs.
A missing seed normalizes to zero through the RNG.

Game methods/properties:

- `tick`, `width`, `height`
- `grid()`, `agents()`, `flags()`, `zones()`: detached snapshots
- `botState(id)`: detached state; exact ID type required
- `step(moves)`: advance once using own properties keyed by agent ID
- `finished()`: boolean
- `result()`: null before completion, detached result afterward

After completion, `step()` returns `[]` without changing the game.

Events:

    { type: 'tag', id, by, team }
    { type: 'pickup', id, flag }
    { type: 'capture', id, team, score }
    { type: 'free', team, by, ids }
    { type: 'release', id, team, automatic }
    { type: 'drop', id, flag, returned: true }

A `drop` means immediate return, not a persistent dropped flag.
`release.automatic` is true for served jail time and false for completed
rescue transit. `capture.score` is that team's new total.

Result:

    {
      winner: 'west' | 'east' | null,
      reason: 'captures' | 'time' | 'draw',
      tick: integer,
      score: { west: integer, east: integer },
      agents: [{
        id, team, name, tags, captures, jailed, timesJailed, flagPickups
      }]
    }

For Node tests in this `"type": "module"` repository, retain the existing
same-realm `vm.Script(...).runInThisContext()` UMD wrapper rather than
using `require('engine.js')` or a different-realm loader. Direct headless
bot calls do not automatically seed Node's global `Math.random`; inject
or isolate randomness in the host if the bot needs it.

## Submission and compatibility tips

- Submit a safe lowercase ID and a single self-contained `.js` file.
- Add a roster entry with matching `file: "bots/<id>.js"` and its actual
  byte size, plus name, botName, lab, color, and note.
- Do not claim house samples are AI-model entries.
- Use state dimensions and border; do not hard-code the default field.
- Test both teams, several team sizes, null-coordinate states, shared
  cells, integer IDs, final ticks, and invalid-action fallback.
- Match token IDs to agent cards when inspecting videos; renderer
  offsets for shared cells are visual only.
- Keep per-turn work bounded. Helpers expose the rules, not an engine
  snapshot importer or an automatic strategy solver.
