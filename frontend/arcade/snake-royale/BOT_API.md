# Snake Royale bot API

This is the contract for external algorithm authors and AI-model bot prompts. It describes the published benchmark engine, including its nonstandard rules. It is not the official Battlesnake API.

The engine rules and RNG order are unchanged. Browser runner safeguards do not change how a given sequence of actions resolves.

## 1. Submission

Place a classic JavaScript file at `bots/<id>.js`. Register it in `bots.json` with its unique `id`, display `name`, `botName`, `lab`, six-digit hex `color`, `file`, byte count `bytes`, and optional `note`.

Ids must match `^[a-z0-9][a-z0-9.-]*$` and must not contain `..`. The standalone page reserves `player-1` and `player-2` for humans. The worker ignores manifest paths and always loads:

    importScripts(`bots/${id}.js`)

No user-supplied URL is imported. Do not use imports, remote dependencies, DOM APIs, inline scripts, `eval` or `new Function`.

Export one synchronous function using any one of:

    module.exports = function move(state) { return 'up'; };

    module.exports = { move(state) { return 'up'; } };

    function move(state) { return 'up'; }

The worker initializes the CommonJS-style `module` and `exports` globals before loading your script. As in CommonJS, assigning a new value to `exports` alone does not replace `module.exports`.

## 2. Board and match setup

- A duel has two contestants on an 11×11 board.
- More than two contestants use a 19×19 board in the standalone page.
- The browser runner supports 2–12 unique contestants, including humans.
- The pure engine accepts options; do not assume all headless hosts use defaults.
- Coordinates are integer cells. `(0, 0)` is the top-left.
- `x` increases right; `y` increases down.
- There is no wrapping.
- All living snakes and their entire bodies are public.
- Snakes begin at length 3, with all three segments stacked on their spawn cell.
- Initial health is 100 by default.
- Rounded circular spawns use a seeded phase and participant array order. They are not an arbitrary-count collision-free spawn allocator.
- Initial food is selected from an in-bounds diagonal neighbor of each spawn, deduplicated against earlier selected diagonal food, then centre food is added if no spawn head occupies the centre. This initialization does not perform the later general occupancy test or deduplicate centre food against diagonal food.
- The standalone series rotates participant order by one seat per game and increments its base seed by one. It does not expose a seed URL parameter.

Default engine options:

    {
      width: 11,
      height: 11,
      seed: 1,
      maxTurns: 600,
      shrinkStart: 150,
      shrinkEvery: 20,
      minFood: 1,
      foodChance: 0.15,
      startHealth: 100
    }

## 3. Exact state passed to `move`

`game.botState(id)` returns a fresh object for the coming move:

    {
      turn: number,
      width: number,
      height: number,
      you: Snake,
      snakes: Snake[],
      food: Point[],
      hazards: Point[],
      nextShrinkTurn: number
    }

`Point`:

    { x: number, y: number }

`Snake`:

    {
      id: string,
      name: string,
      head: Point,
      body: Point[],
      length: number,
      health: number
    }

There are no additional bot-state fields.

- `turn` is the turn about to execute: the first request has `turn: 1`.
- The engine's current completed turn is `state.turn - 1`.
- `snakes` contains living snakes only, in original engine participant order.
- `you` is the same object as your entry within `snakes` in the engine-generated snapshot. The worker receives a structured clone. The runner requests states only for living contestants.
- `head` equals `body[0]` by coordinates; `body` is head-first.
- `length` equals `body.length`, including stacked segments.
- `food` lists currently available food coordinates. Treat coordinates as cell identities; initialization can produce duplicate food entries.
- `hazards` lists all cells in the currently active outer storm ring, not a forecast of the ring expanded at the end of the coming turn.
- `nextShrinkTurn` is the next scheduled expansion turn greater than or equal to `turn`. It continues reporting the schedule even after the maximum ring is reached.
- No previous direction, seed, RNG state, options, elapsed time, death records, error count, kill count or opponent moves are included.
- The default storm schedule is known from this contract. A headless host changing options must communicate those options separately if its bots need them.
- Display names are not stable identifiers; use `id`.

### Realistic JSON example

This is a pre-move snapshot before turn 42 in an 11×11 default duel. The ring is not active yet.

```json
{
  "turn": 42,
  "width": 11,
  "height": 11,
  "you": {
    "id": "sample-bot",
    "name": "Sample Bot",
    "head": { "x": 4, "y": 5 },
    "body": [
      { "x": 4, "y": 5 },
      { "x": 4, "y": 6 },
      { "x": 3, "y": 6 },
      { "x": 2, "y": 6 }
    ],
    "length": 4,
    "health": 67
  },
  "snakes": [
    {
      "id": "sample-bot",
      "name": "Sample Bot",
      "head": { "x": 4, "y": 5 },
      "body": [
        { "x": 4, "y": 5 },
        { "x": 4, "y": 6 },
        { "x": 3, "y": 6 },
        { "x": 2, "y": 6 }
      ],
      "length": 4,
      "health": 67
    },
    {
      "id": "reference-bot",
      "name": "Reference Bot",
      "head": { "x": 7, "y": 4 },
      "body": [
        { "x": 7, "y": 4 },
        { "x": 7, "y": 3 },
        { "x": 8, "y": 3 }
      ],
      "length": 3,
      "health": 92
    }
  ],
  "food": [
    { "x": 5, "y": 5 },
    { "x": 8, "y": 8 }
  ],
  "hazards": [],
  "nextShrinkTurn": 150
}
```

You may mutate your received state, but doing so does not submit an action or change the match. Each request uses a new snapshot. Do not rely on object identity persisting across turns.

## 4. Actions and fallback

Return one primitive string:

| Value | Movement |
| --- | --- |
| `"up"` | `(0, -1)` |
| `"down"` | `(0, 1)` |
| `"left"` | `(-1, 0)` |
| `"right"` | `(1, 0)` |

The engine lowercases and trims strings, so `" UP "` also becomes `"up"`. Prefer canonical lowercase values.

Objects, arrays, numbers, null, undefined, promises and any other string are invalid. The worker only forwards primitive strings; exceptions become null.

An invalid action:
1. Increments that snake's engine `errors`.
2. Emits `{ type: "error", id }`.
3. Repeats its last normalized valid direction.
4. Uses `"up"` if no valid direction has yet been recorded.

Fallback is not a safety search. It can hit a wall, storm or body. A syntactically valid reversal is allowed by the engine and can cause self-collision. The human input adapter independently prevents reversing into its neck.

## 5. Exact simultaneous turn resolution

Every living contestant receives the same pre-move board, with its own `you`.

The engine executes:

1. Increment completed turn.
2. Normalize all actions and choose fallback for invalid actions.
3. Move every living head one cell and decrement every living snake's health by 1.
4. For every living snake whose new head matches any food coordinate:
   - Restore health to `startHealth`.
   - Increment `eaten`.
   - Keep its tail, increasing length by 1.
   - Record an eat event.
5. Pop the tail of every snake that did not eat.
6. Remove food entries selected by the eating pass.
7. Determine eliminations using all snakes that were alive at the start of this collision pass. A snake scheduled to die still participates.
8. Apply all eliminations and kill credits.
9. Expand the storm if scheduled and below its ring cap. Remove food now in the storm.
10. Attempt one food spawn.

There is no “first player moves first” advantage in movement or elimination. Body and head attribution does have array-order tie behavior, described below.

### Elimination precedence

For each snake, the first applicable cause wins:

1. `wall`: new head outside the board.
2. `storm`: new head inside the previously active storm.
3. `starved`: health is zero or below after possible food restoration.
4. `self` / `body`: new head matches any non-head segment of itself or another living snake.
5. `head-on`: new head matches another living snake's new head whose post-food length is at least its own.

Consequences:

- Eating on the move from health 1 can prevent starvation.
- A snake can eat and grow before dying.
- Two or more heads reaching food can all heal and grow.
- Food growth changes that turn's head-on lengths.
- A nongrowing tail vacates before collisions, so its old cell may be entered.
- A growing tail does not vacate.
- Initially stacked tail segments do not all disappear after one move.
- A head swap normally hits the opponents' new non-head segments.
- Strictly longer heads survive head-on comparisons if they have no earlier elimination cause.
- Equal longest heads sharing a cell all die.
- An already doomed opponent still contributes its body and head to collision checks.
- A head entering an existing hazard dies instantly; this is not health-based hazard damage.

For `body` and `head-on`, `death.by` is the first qualifying opponent in original engine array order. That opponent gets one kill even if it dies in the same turn. Equal head-on eliminations can give both opponents kill credit. Kill credit is attribution, not proof that the credited snake survived or won.

### Food spawning after the turn

The engine enumerates all cells not occupied by a living snake or existing food and outside active hazards, in row-major order.

It consumes two RNG draws on every spawn attempt, including forced attempts and attempts with no free cells: one probability roll and one cell pick.

If food count is below `minFood`, that attempt is forced. Otherwise it spawns with `foodChance`. At most one food cell is added per turn, even when the deficit exceeds one. A full safe board simply produces no new food.

Dead bodies do not obstruct later turns or food spawning.

## 6. Storm timing

With defaults:

- Ring 1 expands at the end of turn 150.
- Ring 2 expands at the end of turn 170.
- Further scheduled expansions are every 20 turns.
- At ring `r`, a cell is hazardous when:

      x < r || y < r || x >= width - r || y >= height - r

- Maximum ring is `floor(min(width, height) / 2) - 1`.
- On 11×11 the cap is ring 4, leaving a 3×3 safe area.
- On 19×19 the cap is ring 8, also leaving a 3×3 safe area.

Collision checks precede expansion. A head newly covered at the end of turn 150 is not eliminated by that expansion. On turn 151 it may move back into the safe area; it dies if its new head remains in an active hazard.

`nextShrinkTurn` is a schedule field, not a guarantee that another expansion will occur. After the cap, compute cap awareness from dimensions and current hazards if needed.

## 7. Completion, ranking and series

The default engine finishes at completed turn 600 or when a multiplayer match has at most one living snake. A directly created solo engine finishes when its snake dies or the turn cap is reached.

Do not call `step` after `finished()` in a headless host: the engine itself does not guard against this. The browser runner does.

Placements:
- Living snakes precede dead snakes.
- All living snakes share place 1, regardless of length.
- Dead snakes rank by later death turn, then longer final length.
- Equal death turn and length share a competition place, for example `1, 1, 3`.
- Kills, food and errors do not break placement ties.

Therefore:
- All surviving snakes at the turn cap draw for first.
- If everyone dies together, unequal final lengths can still produce a sole first-place snake.
- A startup failure is a turn-zero `load-error`; that snake is removed before play.
- All-startup-failure matches produce tied first place when final lengths match.

The standalone series awards one win only for a unique first place. It targets `floor(bestOf / 2) + 1` wins and allows at most `bestOf + 4` games. Thus even Single fight can replay draws, up to five games total. At the game cap, highest accumulated wins determines the result; a tied lead is a draw.

## 8. Timing, errors and lifecycle

Browser runner budgets:
- Initialization: 5,000 ms per bot, including import and top-level execution.
- Move: 400 ms per request, including worker scheduling, transfer and computation.

All bot requests for a turn run concurrently; the engine advances only after they settle. Budgets are wall-clock deadlines, not instruction quotas. Browser scheduling means the boundary is not a CPU-time guarantee.

Initialization failure, worker load error or startup deadline:
- Terminates that worker.
- Marks its snake dead at turn 0 with cause `load-error`.

Move exception or invalid return:
- Produces an invalid action and the engine fallback.
- Does not by itself terminate the worker.

Move deadline or worker/transport error:
- Terminates that worker for the rest of the game.
- Supplies null for the failed request and every subsequent living turn.
- Does not immediately eliminate the snake; the engine continues applying fallback and incrementing errors.

A returned promise is not awaited. Do not schedule an asynchronous answer. A thrown function can retain worker-local state, but must return synchronously on its next request.

The runner accepts only matching `{ type: "move", turn, move }` responses from its worker. Your exported function should simply return a direction; it should not use `postMessage` directly.

Restart, page exit and host stop terminate workers and settle pending waits without executing a canceled turn.

## 9. Determinism and isolation

The engine uses its own Mulberry32 stream derived from `options.seed`; it uses neither `Math.random` nor wall-clock time.

For a bot at engine array index `i`, the browser sends initialization seed:

    options.seed * 31 + i

Before importing that bot, the worker installs:

    Math.random = SnakeEngine.rng(initSeed ^ 0x9e3779b9)

Bitwise operations coerce to 32 bits. Each bot has a separate random stream; calls do not consume engine RNG. Top-level random calls consume that bot's stream too.

Identical ordered ids, options and actions produce identical engine results. Complete bot matches additionally require deterministic bot code and matching timeout outcomes. Wall-clock searches, `Date`, `performance`, asynchronous work, hardware load, humans and changing participant order can change results. Seeded randomness alone is not a universal replay guarantee.

State is structured-cloned into each worker. Mutating a state cannot mutate the engine or another worker. Opponent positions are public, but opponent selected actions, worker globals, private memory and random state are not included.

A worker is not a security sandbox for hostile same-origin JavaScript. Do not submit code that replaces worker handlers, performs network requests, imports further code or manipulates its host protocol. The validated import path protects script selection; it does not make arbitrary bot code trustworthy.

## 10. Helper globals and headless use

`SnakeEngine` is available globally inside the worker before your bot is imported:

- `SnakeEngine.rng(seed)` → independent deterministic random function in `[0, 1)`.
- `SnakeEngine.DIRS` → `{ up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }`.
- `SnakeEngine.DEFAULTS` → default options listed above.
- `SnakeEngine.create(ids, options?)` → independent simulation instance.

Do not mutate helper constants. There are no supplied pathfinding, collision-prediction or legal-move helpers.

The independent engine instance exposes:
- `options`
- `snakes`: internal records using `[x, y]` body pairs
- `food`: `[x, y]` pairs
- `turn`: completed turns
- `hazard`: ring number
- `nextShrinkTurn`
- `botState(id)`
- `step(moves)`
- `finished()`
- `placements()`

`step` accepts an id-to-direction object and returns error/eat/death/shrink events. Placements contain `id`, `place`, `alive`, `length`, `kills`, `eaten`, `death` and `errors`.

The engine is UMD, DOM-free and can run in Node. In this repository, which is ESM, tests load the UMD source through a VM wrapper supplying `module.exports`; preserve that loader style rather than importing it as an ES module.

An engine created inside your worker is a new game, not a clone of the current match. There is no supported state-import API. The bot snapshot omits engine RNG state and some options, so it cannot recreate the live match by seed alone.

Other worker environment notes:
- `self`, `globalThis` and `window` refer to the worker global.
- There is no document or canvas renderer provided to bots.
- `console.log/error/warn/info` are silenced.
- Standard JavaScript collections and typed arrays are available.
- Persistent module variables survive across turns in the same worker.
- A new game creates a new worker and resets those variables.

## 11. Minimal example

This example demonstrates the interface, not a competitive policy. It continues right and does not avoid collisions.

```javascript
'use strict';

module.exports = function move(state) {
  if (!state.you) return 'up';
  return 'right';
};
```

## 12. Integration checklist

- Return one primitive direction string synchronously.
- Use `id`, not display name or array index, to identify yourself.
- Keep coordinates in the documented top-left coordinate system.
- Accept repeated stacked body coordinates.
- Do not assume food or array order encodes a priority.
- Account for simultaneous movement and the documented tail/growth order.
- Distinguish the active hazard list from the expansion schedule.
- Keep runtime comfortably below the browser deadline.
- Test thrown errors, malformed output and deterministic seeds headlessly.
- Record engine options, ordered participants, actions and timeout outcomes when producing an auditable replay.
