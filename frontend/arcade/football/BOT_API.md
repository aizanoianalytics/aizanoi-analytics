# Football bot API

This is the contract for external algorithm authors and AI-generated entries.
Use the same contract for all competitors. Reference bots are samples, not
AI-model entries.

## Authoring checklist / AI-model prompt

Write a plain JavaScript file `bots/<id>.js`. Export a synchronous function
through `module.exports`, or an object with a `decide` function. The function
receives the JSON-shaped observation below and returns
`{ x: number, y: number, kick: boolean }`.

Do not use imports, packages, DOM APIs, network requests, timers, dates, or
dynamic compilation. No framework or build step is available. Keep each
decision comfortably below 50 ms. Every observation is already oriented so
your team attacks positive x. Do not mirror Blue yourself. You may retain
private variables between calls. Use only the seeded `Math.random` if
randomness is necessary. Do not modify worker messaging or global helpers.

Submit the source file and roster metadata: `id`, `name`, `botName`, `lab`,
`color` as six-digit hex, `file: "bots/<id>.js"`, exact UTF-8 `bytes`, and
`note`. IDs match `^[a-z0-9][a-z0-9.-]*$` and must not contain `..`.
Only reviewed repository-controlled scripts are deployed.

## Rules

This is top-down physics football, not a complete association-football ruleset.

- One to four round players per team. Red defends the world left goal;
  Blue defends the world right goal. Initial kickoff belongs to Red.
- Field: 840 × 400 units, centered on zero. World x is left/right; positive
  y is down. Field lines are x = ±420 and y = ±200.
- Players: radius 15, mass 2. Outer walls are 30 units beyond field lines;
  player centers are constrained to x = ±435 and y = ±215.
- Ball: radius 10, mass 1. Ordinary line-wall bounce is 0.5. Its center
  bounces at y = ±190 and at x = ±410 outside goal openings.
- Goal mouths are on x = ±420, y = -65 through 65. Each goal is 40 deep.
  Posts are radius-8 circles at (±420, ±65), with bounce 0.5.
  Net side/back walls constrain ball centers to y = ±55, x = ±450.
- A goal requires the entire ball to cross: center x strictly beyond ±430,
  with center y between -55 and 55. A shot hitting a post is resolved before
  the goal check.
- One physics step is 1/60 second. Direction is normalized whenever nonzero:
  small nonzero movement vectors are not an analog speed control.
- Per step, acceleration is 0.11 normally or 0.07 while kick is held.
  Player velocity then multiplies by 0.96. Ball velocity multiplies by 0.99.
  Velocities are units per physics step, not units per second.
- Circle collisions have bounce 0.5, inverse-mass-weighted impulse and
  positional correction. Each movement slice uses four contact passes.
  Movement uses deterministic substeps of at most four units per body;
  acceleration/damping/cooldown apply only once per physics step.
- After movement/contact resolution, an eligible kick adds velocity 5 along
  normalized `(ball - player)` if center distance is at most 29.
  At exactly coincident centers the fallback points toward the player's
  attacking goal.
- A rising kick edge is immediately eligible. Continuing to hold kick
  repeats after ten physics steps. Releasing and pressing again is a new
  rising edge and can kick before that held-kick cooldown expires.
  This behavior is intentional.
- Simultaneous kick eligibility/direction uses one pre-kick ball position.
  Successful kicks then apply in the deterministic contact-priority order.
- Kickoff formation is on each team's own side. Before the kickoff team's
  first collision touch or successful kick, opponents must stay in their own
  half with their entire body outside the radius-70 center circle.
  The engine enforces these constraints; there is no kickoff timeout.
- A goal freezes physics for 90 subsequent steps, then resets the ball and
  formation. The conceding team kicks off. Held actions may continue across
  the reset; player kick-edge/cooldown state is reset.
- Match time includes kickoff and goal freezes. Default is 120 seconds.
  Default score limit is three; zero disables early score-limit termination.
  Reaching a positive limit ends immediately, without waiting for celebration.
  A score-limit goal on the final step has priority over time expiry.
- Time expiry awards the higher score; equal scores are a draw. There is no
  overtime or penalty shootout.
- Last two distinct toucher entries determine credit. Consecutive touches
  by the same player update their existing entry. Last toucher gets a goal,
  or an own goal if on the conceding team. The previous entry is an assist
  only if on the scoring team and the goal is not an own goal.
- `touches` counts physics steps with at least one resolved ball contact or
  successful kick for that player. Solver passes do not multiply the count.
  Tangency without penetration or approaching relative velocity is not a
  resolved touch.

Formation and contact ordering do not depend on caller seat-array ordering.
Within each team IDs sort numerically when both are numbers, otherwise by
their string representation. Canonical order interleaves Red/Blue by formation
slot. Odd steps use that order; even steps reverse it. This is also the
tie-break for exactly simultaneous contact attribution. Public player-array
order remains the caller's roster order; array position is not a priority.

## Observation schema

`decide(state)` receives `engine.botState(yourSeatId)` through structured clone.

All listed fields are public. There is no hidden ball/player information.
Opponent private bot memory, future actions, random state, and source code
are not part of an observation.

```text
BotState {
  step: nonnegative integer,
  timeLeft: nonnegative number (seconds),
  phase: "kickoff" | "play" | "goal",
  score: { red: integer, blue: integer },
  ball: { x: number, y: number, vx: number, vy: number },
  players: Player[],
  kickoffTeam: "red" | "blue",
  goalFreezeSteps: integer in [0, 90],
  lastTouches: Touch[] (zero to two entries, oldest first),
  rules: {
    stepsPerSecond: 60,
    time: number (effective duration in seconds),
    scoreLimit: nonnegative integer (0 = disabled),
    decisionEvery: positive integer
  },
  you: Player,
  team: "red" | "blue",
  teammates: Player[] (excludes you),
  opponents: Player[],
  field: {
    width: 840,
    height: 400,
    goalWidth: 130,
    playerRadius: 15,
    ballRadius: 10,
    kickRange: 29,
    ownGoalX: -420,
    enemyGoalX: 420,
    outerMargin: 30,
    goalDepth: 40,
    postRadius: 8,
    centreCircleRadius: 70
  }
}

Player {
  id: string | finite number,
  team: "red" | "blue",
  name: string,
  x: number, y: number, vx: number, vy: number,
  kicking: boolean,
  heldKick: boolean,
  kickCooldown: integer in [0, 10],
  goals: nonnegative integer,
  kicks: nonnegative integer,
  touches: nonnegative integer,
  ownGoals: nonnegative integer
}

Touch {
  id: string | finite number,
  team: "red" | "blue",
  step: nonnegative integer
}
```

IDs are unique by string representation; numeric `1` and string `"1"` cannot
coexist. Preserve an ID's type when looking up a player.

`kicking` is the kick action used in the last simulated step. `heldKick` is
the previous-edge state used to recognize the next rising edge. They normally
agree at observation boundaries. `kickCooldown` is the remaining held-kick
cooldown; it decrements at the beginning of each active physics step.

During a goal freeze, positions, velocities, player kick state, and counters
are frozen. `goalFreezeSteps` counts remaining freeze steps. `step` and
`timeLeft` still advance.

### Coordinate orientation

For a Blue observer only, x and vx of the ball and every player are negated.
Y and vy are unchanged. Both teams therefore defend x = -420 and attack
x = +420 in their observation.

Team names, scores, IDs, touch history, kickoff team, and array membership
are not relabeled. `state.team` tells you your real team color. The runner
negates returned x for Blue; returned y and kick are unchanged.

Do not infer orientation from shirt color. Use the provided coordinates.

`you`, `teammates`, and `opponents` reference the corresponding entries of
`players` within an observation. The entire observation is detached from
the engine; mutation cannot affect the simulation. Do not depend on object
identity across decisions or on retaining a mutated observation.

### Complete realistic example

Initial 1v1 state observed by Blue:

```json
{
  "step": 0,
  "timeLeft": 120,
  "phase": "kickoff",
  "score": { "red": 0, "blue": 0 },
  "ball": { "x": 0, "y": 0, "vx": 0, "vy": 0 },
  "players": [
    {
      "id": "r1", "team": "red", "name": "Sample Chaser",
      "x": 95, "y": 0, "vx": 0, "vy": 0,
      "kicking": false, "heldKick": false, "kickCooldown": 0,
      "goals": 0, "kicks": 0, "touches": 0, "ownGoals": 0
    },
    {
      "id": "b1", "team": "blue", "name": "My Bot",
      "x": -95, "y": 0, "vx": 0, "vy": 0,
      "kicking": false, "heldKick": false, "kickCooldown": 0,
      "goals": 0, "kicks": 0, "touches": 0, "ownGoals": 0
    }
  ],
  "kickoffTeam": "red",
  "goalFreezeSteps": 0,
  "lastTouches": [],
  "rules": {
    "stepsPerSecond": 60,
    "time": 120,
    "scoreLimit": 3,
    "decisionEvery": 3
  },
  "you": {
    "id": "b1", "team": "blue", "name": "My Bot",
    "x": -95, "y": 0, "vx": 0, "vy": 0,
    "kicking": false, "heldKick": false, "kickCooldown": 0,
    "goals": 0, "kicks": 0, "touches": 0, "ownGoals": 0
  },
  "team": "blue",
  "teammates": [],
  "opponents": [
    {
      "id": "r1", "team": "red", "name": "Sample Chaser",
      "x": 95, "y": 0, "vx": 0, "vy": 0,
      "kicking": false, "heldKick": false, "kickCooldown": 0,
      "goals": 0, "kicks": 0, "touches": 0, "ownGoals": 0
    }
  ],
  "field": {
    "width": 840, "height": 400, "goalWidth": 130,
    "playerRadius": 15, "ballRadius": 10, "kickRange": 29,
    "ownGoalX": -420, "enemyGoalX": 420,
    "outerMargin": 30, "goalDepth": 40,
    "postRadius": 8, "centreCircleRadius": 70
  }
}
```

## Return values

Return an object with all three required fields:

```javascript
{ x: 0.5, y: -1, kick: false }
```

- `x` and `y` must be finite JavaScript numbers. Each is clamped to [-1, 1].
- `kick` must be a boolean.
- Extra fields are ignored.
- Missing fields, NaN, infinities, strings, null, promises, and exceptions
  are invalid decisions. Async functions are unsupported.
- A zero movement vector stops acceleration, not existing velocity.
- Bot code must return normally; it must not post its own protocol messages.

## Timing, isolation, and fallback

The page requests a decision at step 0 and every three steps thereafter:
nominally 20 decisions per game second. The selected action is held until a
later valid response. Each seat has a separate worker and separate private
memory, including when several seats select the same bot file.

Startup timeout is five wall-clock seconds. A failed/invalid load leaves
that seat neutral. The initial action is `{ x: 0, y: 0, kick: false }`.

A decision has 50 wall-clock milliseconds, including worker dispatch.
At a decision boundary, all speed modes wait until every requested worker
has answered or timed out before advancing physics. Requests run concurrently.
At ordinary speed this can slow game time under load; never assume wall time
equals game time.

An invalid return or caught exception keeps the previous action; the worker
can answer later requests. A late response or decision timeout terminates
that worker for the rest of the match and keeps its last valid action.
A worker error also terminates it. Stale responses never replace actions.

Pausing cancels outstanding request acceptance. At a paused decision boundary,
resume issues a fresh request with a different serial. Worker-private code
already running cannot be rewound. Avoid relying on decisions occurring while
paused. Startup, decisions, and UI rendering are not a hard real-time system.

A worker loads `engine.js`, validates a bot ID, and imports exactly
`bots/<id>.js`. Neither `file` metadata nor a URL in a message chooses
executable code. A worker is not a security sandbox against hostile
same-origin JavaScript; only reviewed bots are allowed.

## Available globals

- `module.exports` and `exports` for the entry export. Assigning
  `exports = ...` alone does not replace `module.exports`.
- `FootballEngine`, loaded before the bot:
  - `STEPS_PER_SECOND` = 60.
  - `create(seats, options)` creates a separate deterministic simulation.
  - `mirrorInput(input, team)` sanitizes an action and negates x for Blue.
    The page already performs this conversion; do not apply it to your return.
- Standard JavaScript facilities such as `Math`, `JSON`, `Map`, `Set`, arrays,
  and typed arrays.
- `Math.random` is replaced with the per-worker seeded generator before
  importing the bot.
- `self` and the compatibility alias `window` refer to the worker, not a DOM
  window. Console methods are no-ops.

No sample-bot helper globals, package loader, `require`, DOM, or renderer
are supplied. Worker transport functions are infrastructure, not bot APIs.
Keep helper engine simulations bounded by the same decision budget.

## Determinism and replay

The engine does not use `Math.random`, `Date`, or wall-clock time. Same seats,
effective options, and recorded per-step world actions produce the same state
sequence on the same JavaScript numeric implementation.

The runner derives worker seeds from the match seed and the original seat
index, then the worker XORs its seed with `0x9e3779b9`. Its random generator
increments a uint32 accumulator by `0x6d2b79f5`, mixes with `Math.imul`, and
returns a uint32 divided by 4294967296. The sequence starts before bot import,
so top-level random draws consume it too.

Seeded randomness does not make arbitrary code deterministic. Do not use
dates, asynchronous work, network state, platform-dependent ordering, or
unseeded random sources. Changed source, changed seat order, changed random
call count, startup failures, and timeouts can change outcomes.

A match seed alone is not a replay file: worker completion and timeout behavior
depend on wall-clock scheduling. Record effective options, roster/source
versions, and every accepted per-step world input for exact engine replay.
Series swap sides between matches and use different match seeds.

## Minimal bot

This deliberately simple legal example follows the ball. It is not a
recommended competitive policy.

```javascript
'use strict';

module.exports = function decide(state) {
  if (state.phase === 'goal') return { x: 0, y: 0, kick: false };
  const dx = state.ball.x - state.you.x;
  const dy = state.ball.y - state.you.y;
  const distance = Math.hypot(dx, dy);
  return {
    x: distance ? dx / distance : 0,
    y: distance ? dy / distance : 0,
    kick: distance <= state.field.kickRange
  };
};
```

## Engine use outside the browser

`FootballEngine.create(seats, options)` accepts one to four seats per team:

```javascript
const game = FootballEngine.create([
  { id: 'r1', team: 'red', name: 'Red entry' },
  { id: 'b1', team: 'blue', name: 'Blue entry' }
], { time: 120, scoreLimit: 3, decisionEvery: 3 });

const view = game.botState('b1');
const worldAction = FootballEngine.mirrorInput(
  { x: 1, y: 0, kick: false }, 'blue'
);
const events = game.step({ b1: worldAction });
```

`step(inputs)` advances exactly one physics step. Missing engine inputs are
neutral, not held; headless drivers must implement holding themselves.
The engine clamps numeric axes, defaults nonfinite axes to zero, and treats
only literal `true` as kick. This lenient engine sanitation is distinct from
the stricter worker return contract.

Events are `kick { player, x, y }`, `post { x, y }`,
`kickoff { team }`, and
`goal { team, scorer, ownGoal, assist, score }`, each with a `type` field.
Event positions use world coordinates. At most one event per post is emitted
per physics step.

`state()` is an unmirrored detached observation without the bot-specific
`you`, `team`, `teammates`, `opponents`, or `field` fields.
`steps` is a read-only getter. `finished()` reports completion.
`result()` is null until finished, then returns:

```text
{
  winner: "red" | "blue" | null,
  score: { red, blue },
  reason: "score-limit" | "time",
  steps,
  players: [{ id, team, name, goals, kicks, touches, ownGoals }]
}
```

Further `step()` calls after completion return an empty event array and do
not change state.

The engine is a DOM-free UMD file. This repository is ESM, so tests load it
with the existing same-realm `vm.Script` wrapper supplying `module` and
`exports`; direct ESM import does not provide a default engine export.
No worker is necessary for a headless engine run.

## Integration tips

- Validate a bot against both mirrored teams and all supported team sizes.
- Use IDs, not assumptions about player-array ordering.
- Test zero-distance vectors, goal freezes, kickoff restrictions, and
  missing previous touch history.
- Treat the observation as read-only and return a fresh small action object.
- Bound loops and any local engine simulations.
- Check actions are finite before returning.
- Keep a replayable headless test independent of browser timing.
