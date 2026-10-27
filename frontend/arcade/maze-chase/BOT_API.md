# Maze Chase bot contract

Write one reviewed, local, synchronous JavaScript file that plays either role.
Choose behavior from `state.you.role`, not from your filename or seat ID.

## Submission

Place the file at `bots/<id>.js`. IDs match
`^[a-z0-9][a-z0-9.-]*$`, must not contain `..`, and must not be `p1` or `p2`.

Export either:

```javascript
module.exports = function move(state) {
  return 'stay';
};
```

or:

```javascript
module.exports = {
  name: 'Example',
  move(state) {
    return 'stay';
  }
};
```

Object methods retain their `this` receiver. The optional `name` does not
override the public roster. A legacy global `move` function is also accepted,
but module exports are preferred.

Add a roster entry to `bots.json`:

```json
{
  "id": "example",
  "name": "Example entrant",
  "botName": "Example",
  "lab": "Your organization or author",
  "color": "#4477cc",
  "file": "bots/example.js",
  "bytes": 123,
  "note": "An accurate description."
}
```

`bytes` must equal the deployed file's actual byte length; 123 above is only an
illustration. The manifest shape is `{ "version": 1, "bots": [ ... ] }`.
House samples are explicitly labeled `Aizanoi sample`, not model entries.

No network dependencies, external assets, DOM access, dynamic compilation,
asynchronous move results or imported third-party libraries are required.

## Rules

- There are 1–4 runners and 1–6 ghosts.
- Coordinates are integer cells: `(0,0)` is top-left; x increases rightward,
  y downward. Access a cell as `state.grid[y][x]`.
- `#` is wall, `.` pellet, `o` power pellet, space empty floor, `G` pen,
  `-` pen door.
- Movement is one cardinal cell per simulation tick, resolved simultaneously.
  Agents do not block teammates. `stay` deliberately stops movement.
- Runners cannot enter `G` or `-`. Ghosts cross between pen and exterior only
  through the door: direct `G` ↔ exterior-floor transitions are forbidden.
- Only horizontal moves from `tunnelRow` wrap across the left/right edge.
  There is no vertical wrapping.
- Ghosts are eligible to cross from `G` into the door at ticks 0, 8, 16, etc.
  according to their order among the ghost seats. Tick 0 is setup; the first
  actual move is tick 1. Release eligibility is not automatic movement.
- `inPen` includes the door. Ghosts may move inside the pen while waiting,
  but cannot cross into its door before their release deadline.
- Runners start spread across the lowest available floor row, with three
  lives. Spawn and initial release assignment follow role-specific seat order.
- A pellet awards 10; a power pellet awards 50. All pickups happen after
  movement and before contacts. Standing on a pickup collects it too.
- A power pellet starts/resets global fright for `frightDuration` ticks,
  resets the ghost-score chain, and frightens all ghosts, including ghosts
  that were immune to the preceding fright.
- Ghosts already frightened at the start of a movement phase only move on
  even ticks. A power collected during that tick affects contact immediately
  but does not retroactively cancel that tick's movement.
- A ghost eaten during the current fright is immune to that fright when
  returned to the pen. Another power pellet removes that immunity.
- Contact means equal destination cells or a head-on swap of previous cells.
  No additional swept-path or diagonal collisions exist.
- A non-frightened exterior ghost catches an unprotected runner: runner loses
  one life; ghost earns 200 and one catch. At most one life per runner per tick.
- A surviving caught runner is absent until tick `caughtTick + 10`. On that
  tick it reappears at its spawn, stays still for that movement phase and is
  protected through `respawnTick + 9`. It may collect its spawn's pickup.
- Protection prevents catches, not eating frightened ghosts.
- A runner contacting both dangerous and edible ghosts is caught first unless
  protected. A caught runner cannot eat ghosts in that tick.
- Each edible ghost is eaten at most once per tick. Rewards are 200, 400, 800,
  then 1600 for every subsequent ghost within the same global fright.
  This chain is shared by the runner team; points go to the actual eater.
- Eaten ghosts immediately return to their own pen spawn, with `stay` heading.
  They may move inside it but cannot enter the door before `eatenTick + 20`.
- Zero lives eliminates a runner permanently. Ghosts do not lose lives.
- End-condition precedence after the complete tick:
  1. No pickups remain: runners win, including simultaneous final elimination.
  2. No living runners remain: ghosts win.
  3. `tick >= maxTicks`: ghosts win.
- There are no round draws. The page offers odd-length series.

### Simultaneous arbitration

For each role independently, sort all its seat IDs by JavaScript string
comparison, then rotate left by `(newTick - 1) % roleSeatCount`.
Eliminated/respawning seats remain in this priority cycle.

Use runner priority for contested pickups and contested edible ghosts.
Use ghost priority to credit a catch when multiple dangerous ghosts contact
one runner. Resolve edible ghosts in ghost priority order, assigning successive
chain rewards. Dangerous contacts are resolved before edible contacts.

This makes ties deterministic without letting seat-array traversal decide
collision outcomes. IDs and seat assignments are part of the match setup.

## State

`move(state)` receives a fresh plain structured-cloneable object representing
the end of `state.tick`. Its return controls movement into tick `state.tick + 1`.

There is no hidden board information. All agent positions, timers, score
counters and spawn coordinates are public. Bot private memory and opponents'
requested moves are not exposed.

### Top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `tick` | integer | Completed ticks, initially 0 |
| `maxTicks` | positive integer | Match clock limit |
| `width`, `height` | integer | Actual grid dimensions |
| `grid` | string[] | Current rows, pickups removed as collected |
| `you` | Agent | Your seat |
| `runners`, `ghosts` | Agent[] | All seats, in role-specific original seat order |
| `pellets` | integer | Remaining ordinary plus power pickups |
| `powerPellets` | `{x,y}[]` | Remaining powers, row-major order |
| `frightTicksLeft` | integer | `max(0, frightUntil - tick)` |
| `frightDuration` | positive integer | Duration configured for each new power |
| `ghostChain` | integer | Ghosts eaten since the latest power; retained after expiry |
| `nextGhostPoints` | integer | `200 * 2 ** min(ghostChain, 3)` |
| `tunnelRow` | integer | Horizontal wrapping row |

A fright with one tick left expires at the beginning of the next step.
A release countdown of one permits door entry on the next step.
A respawn countdown of one causes reappearance on the next step.
One protection tick left means protection expires on the next step.

`frightTicksLeft` is simulation time, not elapsed wall-clock time.
`nextGhostPoints` is the chain value, not a promise of an available edible
ghost; check `frightened` on the relevant ghost.

### Agent fields

All agents contain exactly these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | Stable seat ID and display name |
| `role` | `"runner"` or `"ghost"` | Team |
| `x`, `y` | integer | Current or last physical position |
| `dir` | direction string | Current heading, initially `"stay"` |
| `alive` | boolean | False only for eliminated runners |
| `lives` | integer | Runner lives, 0 for ghosts |
| `score` | integer | Individual score |
| `catches` | integer | Successful catches credited to this agent |
| `ghostsEaten` | integer | Edible ghosts credited to this agent |
| `eaten` | integer | Times this ghost was eaten |
| `frightened` | boolean | Currently subject to fright and half-speed |
| `inPen` | boolean | Ghost currently on `G` or `-`; false for runners |
| `respawnIn` | integer | Runner countdown, otherwise 0 |
| `invulnerable` | boolean | Runner currently protected |
| `invulnerableTicksLeft` | integer | Protection countdown |
| `releaseIn` | integer | Ghost pen-release countdown; 0 outside pen |
| `frightImmune` | boolean | Ghost immune to the active fright after being eaten |
| `spawn` | `{x,y}` | This agent's respawn/pen spawn |

A runner with `alive: true, respawnIn > 0` is absent: ignore its coordinates for
collision planning. An eliminated runner's last position is not an obstacle.
Ghost `alive` stays true; ghost `lives`, `respawnIn` and protection fields stay
zero/false. Runner `eaten`, `releaseIn`, `frightened`, `frightImmune` and `inPen`
stay zero/false.

`you` is a separate copy, not a shared reference into either team array.
Every snapshot and nested spawn object is detached from the engine.

### Exact JSON example

This is an initial state for a small trusted test layout, not the production
27×27 maze. Both production and test layouts use the same state shape.
The grid contains one ordinary pellet, one power, nine pen cells and one door.

```json
{
  "tick": 0,
  "maxTicks": 300,
  "width": 9,
  "height": 9,
  "grid": [
    "#########",
    "#.      #",
    "#   -   #",
    "#  GGG  #",
    "   GGG   ",
    "#  GGG  #",
    "#       #",
    "#  o    #",
    "#########"
  ],
  "you": {
    "id": "r",
    "role": "runner",
    "name": "Runner",
    "x": 4,
    "y": 7,
    "dir": "stay",
    "alive": true,
    "lives": 3,
    "score": 0,
    "catches": 0,
    "ghostsEaten": 0,
    "eaten": 0,
    "frightened": false,
    "inPen": false,
    "respawnIn": 0,
    "invulnerable": false,
    "invulnerableTicksLeft": 0,
    "releaseIn": 0,
    "frightImmune": false,
    "spawn": { "x": 4, "y": 7 }
  },
  "runners": [
    {
      "id": "r",
      "role": "runner",
      "name": "Runner",
      "x": 4,
      "y": 7,
      "dir": "stay",
      "alive": true,
      "lives": 3,
      "score": 0,
      "catches": 0,
      "ghostsEaten": 0,
      "eaten": 0,
      "frightened": false,
      "inPen": false,
      "respawnIn": 0,
      "invulnerable": false,
      "invulnerableTicksLeft": 0,
      "releaseIn": 0,
      "frightImmune": false,
      "spawn": { "x": 4, "y": 7 }
    }
  ],
  "ghosts": [
    {
      "id": "g0",
      "role": "ghost",
      "name": "g0",
      "x": 3,
      "y": 3,
      "dir": "stay",
      "alive": true,
      "lives": 0,
      "score": 0,
      "catches": 0,
      "ghostsEaten": 0,
      "eaten": 0,
      "frightened": false,
      "inPen": true,
      "respawnIn": 0,
      "invulnerable": false,
      "invulnerableTicksLeft": 0,
      "releaseIn": 0,
      "frightImmune": false,
      "spawn": { "x": 3, "y": 3 }
    }
  ],
  "pellets": 2,
  "powerPellets": [{ "x": 3, "y": 7 }],
  "frightTicksLeft": 0,
  "frightDuration": 60,
  "ghostChain": 0,
  "nextGhostPoints": 200,
  "tunnelRow": 4
}
```

## Return values and deadlines

Return exactly one primitive string:

`"up"`, `"down"`, `"left"`, `"right"` or `"stay"`.

`null`, `undefined`, a thrown exception, an unknown string, a Promise or any
other value means fallback: keep the current heading if legal, otherwise remain
in place. An explicitly valid but blocked direction also leaves the agent in
place; it does not turn automatically or try another direction. A blocked
request does not change the previous heading. `"stay"` changes heading to stay.

Each bot seat owns one dedicated classic Web Worker:
- Startup: 5 seconds, including importing the bot.
- Per requested move: 150 ms, requested concurrently with other seats.
- Invalid results and caught move exceptions use fallback for that turn.
- A startup failure, worker error, cloning error or timeout retires that worker.
  Its seat uses fallback for the rest of the round. There is no retry backlog.
- A late reply is never used for a later tick.
- Dead and respawning runners are not asked for moves. Pen ghosts are asked.
- Each round creates a new worker, resetting module memory and random state.

The worker always imports local `engine.js`, validates the bot ID, then imports
`bots/${id}.js`. It never imports a script URL supplied by a message.

## Globals and helpers

Available during bot import and every move:

- `module`, `exports`: CommonJS-style export support. Assign to `module.exports`;
  replacing `exports` alone does not replace the module.
- `MazeEngine.DIRS`: frozen direction dictionary and frozen `[dx,dy]` vectors,
  including `stay: [0,0]`.
- `MazeEngine.rng(seed)`: independent Mulberry32 PRNG returning numbers in `[0,1)`.
- `MazeEngine.generateMaze(seed, width = 27, height = 27)`.
- `MazeEngine.LAYOUTS.aizanoi`: the fixed layout.
- `MazeEngine.create(seats, options)`: DOM-free simulation; see below.
- Seeded `Math.random`.
- Ordinary worker JavaScript built-ins, including `Map`, `Set`, JSON and arrays.
- `self`; `window` is an alias for the worker, not a DOM window.
- Console methods are intentionally silent.

There is no exported BFS, pathfinding, legal-move or direction-reversal helper.

Workers isolate computation from the page, not all browser capabilities.
This is not a hostile-code sandbox. Only publish reviewed local bot files.
Do not replace worker handlers, post protocol messages, modify helpers, fetch
resources or use timers to affect decisions.

## Determinism and memory

The engine has no clock or random-source dependency beyond the supplied seed.
Identical ordered seats, options and accepted moves reproduce the match.

For worker seat index `i` in the complete ordered seat array:

1. Match seed is converted to unsigned 32-bit, defaulting to 1 in the runner.
2. Worker seed is `(Math.imul(matchSeed, 31) + i) >>> 0`.
3. Worker `Math.random` is initialized with
   `MazeEngine.rng(workerSeed ^ 0x9e3779b9)` before importing the bot.

Module-level memory persists during the round. Random calls during import also
consume the stream. Repeated uses of the same bot have separate workers and
streams. Changing seat order changes spawns, release slots and worker streams.

Do not use dates, timers, network responses or unseeded entropy in decisions.
Wall-clock deadlines can produce different retirements on different machines;
record accepted moves and replay them headlessly for exact simulation replay.
Random seeding does not make arbitrary browser APIs deterministic.

## Minimal dual-role example

This deliberately simple example demonstrates legal movement, wrapping and pen
eligibility without prescribing a competitive strategy.

```javascript
'use strict';

module.exports = function move(state) {
  const a = state.you;
  const from = state.grid[a.y][a.x];
  const nextTick = state.tick + 1;
  if (!a.alive || a.respawnIn) return 'stay';
  if (a.role === 'ghost' && a.frightened && nextTick % 2) return 'stay';

  const legal = ['up', 'right', 'down', 'left'].filter(dir => {
    const [dx, dy] = MazeEngine.DIRS[dir];
    let x = a.x + dx;
    const y = a.y + dy;
    if (a.y === state.tunnelRow) x = (x + state.width) % state.width;
    const cell = state.grid[y] && state.grid[y][x];
    if (!cell || cell === '#') return false;
    if (a.role === 'runner') return cell !== 'G' && cell !== '-';
    if (from === 'G' && cell !== 'G' && cell !== '-') return false;
    if (cell === 'G' && from !== 'G' && from !== '-') return false;
    if (a.inPen && a.releaseIn > 1 && cell !== 'G') return false;
    return true;
  });
  return legal.length
    ? legal[Math.floor(Math.random() * legal.length)]
    : 'stay';
};
```

Implementation tips: use grid dimensions rather than assuming 27; account for
tunnel edges in any graph; exclude absent agents; budget bounded work; use
explicit tie-breaking; test both roles and both maze layouts. Avoid using
display names as unique identifiers.

## Headless engine

The engine is UMD: `module.exports` in a CommonJS environment, otherwise
`globalThis.MazeEngine`. The repository is ESM, so its tests load it using the
same-realm `vm.Script(...).runInThisContext()` wrapper, not `require()`.

```javascript
const game = MazeEngine.create([
  { id: 'r1', role: 'runner', name: 'Runner' },
  { id: 'g1', role: 'ghost', name: 'Ghost' }
], {
  seed: 42,
  layout: 'generated',
  width: 27,
  height: 27,
  maxTicks: 1500,
  frightTicks: 60
});
```

Generated dimensions must be odd integers from 19 through 61. Fixed `aizanoi`
ignores width/height and is 27×27. Tick durations must be positive integers.

Public methods/properties:
- `tick` getter, `width`, `height`.
- `grid()` and `agents()`: detached snapshots.
- `botState(id)`: detached state; unknown ID throws `RangeError`.
- `step(moves = {})`: apply one simultaneous tick using own ID properties.
- `finished()`: boolean.
- `result()`: null before completion, otherwise a detached result.
- After completion, `step()` returns `[]` without changing the match.

`LAYOUTS` is trusted configuration, not an algorithm action API. Tests may
replace its rows before creating a fixture; each created game owns a copy.
Never modify it during competition. No custom layout is accepted from a worker
message.

Events returned by `step()`:
- `{type:"pellet"|"power", id, x, y}`
- `{type:"catch", id: runnerId, by: ghostId}`
- `{type:"eaten", id: ghostId, by: runnerId, points}`
- `{type:"out"|"respawn", id}`
- `{type:"fright-end"}`

`result()`:
```json
{
  "winner": "ghosts",
  "reason": "time",
  "tick": 1500,
  "pelletsLeft": 12,
  "scores": [
    {
      "id": "r1",
      "role": "runner",
      "score": 2800,
      "catches": 0,
      "eaten": 0,
      "lives": 1,
      "ghostsEaten": 2
    },
    {
      "id": "g1",
      "role": "ghost",
      "score": 400,
      "catches": 2,
      "eaten": 2,
      "lives": 0,
      "ghostsEaten": 0
    }
  ]
}
```

Winner is `"runners"` or `"ghosts"`; reason is `"pellets"`, `"caught"` or `"time"`.
Scores remain in original seat order and are not a sorted individual ranking.
