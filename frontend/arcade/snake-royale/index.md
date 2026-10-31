# AI Snake Royale

Static page at `/arcade/snake-royale/`: visitors select AI-written bots, add seats for a 19×19 royale, or join locally as Player 1/2 using WASD/arrows. Player 1 also has a touch direction pad. No backend or build step.

## Files

- `engine.js` — unchanged deterministic benchmark rules and RNG order. UMD for page, worker and Node.
- `bot-worker.js` — one worker per bot; validates the fighter id and imports `bots/<id>.js`, never a URL supplied by a message.
- `runner.js` — worker lifecycle, 5-second initialization deadline, 400 ms move deadline, serialized simultaneous turns, direct human input and cancellation.
- `../shared/arena-input.js` — shared keyboard/touch adapter. Ignores typing in form controls and prevents scrolling only while enabled.
- `renderer.js` — shared dependency-free Canvas renderer, also used by AizanoiOS.
- `game.js`, `snake-royale.css`, `index.html` — picker, humans, series, standings, announcements and responsive presentation.
- `bots.json` and `bots/*.js` — original, unedited benchmark contestants.
- [BOT_API.md](BOT_API.md) — complete bot-author and AI-prompt contract, state JSON, rules, timing, helpers, determinism and example.

## Match and series

Two contestants use 11×11; more than two use 19×19, up to 12 total. Humans start after a countdown and use ticks of at least 120 ms, or 140 ms when Instant is selected. Their controls are disabled after elimination.

Best-of series require a majority of wins and permit at most four extra games for draws. This also applies to Single fight: drawn games can be retried, at most five games total. A capped series is decided by highest accumulated wins; a tied lead is a draw.

Selections can be edited during play; Restart fight uses those new selections. The current match retains its captured seats, speed and control schemes.

URL parameters remain `a=<fighter-id>`, `b=<fighter-id>` and `autostart=1`. There is no seed parameter.

## Bot integration

See [the complete contract](BOT_API.md). In brief:

    module.exports = function move(state) {
      return 'up';
    };

State remains exactly:

    { turn, width, height, you, snakes, food, hazards, nextShrinkTurn }

No engine rules or state fields were changed. Notable benchmark semantics include food before collisions, instantly lethal active storm cells, storm expansion after collision checks, array-order kill attribution, and shared first place for all turn-limit survivors.

## Worker failures and cancellation

- Roster fetch, parsing or validation failure: standalone controls are disabled and the ticker explains the failure.
- Initialization exception/error or no response within 5 seconds: terminate that worker and record turn-zero `load-error`.
- Move exception or invalid return: repeat the engine's last valid direction, initially `up`, and increment errors.
- Move deadline or worker/transport error: terminate the worker for that game; its snake continues receiving invalid-action fallback until eliminated or the match ends.
- Stale or unrelated worker responses do not settle a move.
- Stop settles pending initialization/move waits, clears deadlines and terminates workers.
- Concurrent `turn()` calls share one in-flight operation. Finished matches do not advance again.

Worker separation protects engine snapshots from bot mutation. It is not a hostile-code sandbox; bot files are trusted same-origin scripts.

## Shared presentation API

`SnakeArenaRenderer.create(canvas, options?)` returns `{ update(game, colors, metadata?), destroy() }`.

`update` accepts:
- The engine game.
- Fighter-id-to-hex-color mapping.
- Optional `fighters` array to preserve seat identity.
- Optional `duration`, capped at 260 ms; 0 snaps immediately.

The renderer copies visual state, never retains/mutates engine inputs and never executes bots. Its `snapshot` and `interpolate` exports remain available for numerical tests.

Connected neon tubes, eyes, rear seat badges, apples, storm hatch and bounded eat/death particles are paint-only. Disconnected runs, teleports, resets and skipped turns snap instead of sweeping across the board.

`destroy()` is idempotent, cancels RAF and removes the motion listener. Idle animation settles within 700 ms. Reduced motion renders immediately without scheduling RAF and responds to live preference changes.

Explicit `duration`, `reducedMotion`, `now`, `requestAnimationFrame`, `cancelAnimationFrame` and `mediaQuery` options support deterministic presentation tests.

Script order: engine → shared input → runner → renderer → game. The shell uses the same public engine/runner/renderer APIs and owns its renderer lifecycle.

## Accessibility and QA

Cards keep stable seat order. Current length, health, wins and final placements are text, not color-only signals. Only the event ticker and result are live regions; card updates are not continuously announced.

`window.__SNAKE_ROYALE__()` preserves the existing fields: `bots`, `running`, `fighters`, `ticker`, `result`, `cards`, `seats` and `mode`.

## Replay guarantees

The unchanged engine reproduces results for identical ordered ids, options and actions. Seeded worker `Math.random` is independent of engine randomness. Wall-clock searches, browser deadlines, device scheduling and human input can change complete match outcomes. Do not claim universal video-identical results from a seed alone.

## Tests

Existing:
- `tests/snake-royale.test.mjs`
- `tests/snake-royale-runner-cleanup.test.mjs`
- `tests/browser/snake-royale.test.mjs`
- Shell module and browser tests.

Additional regressions:
- `tests/snake-royale-runner-lifecycle.test.mjs`
- `tests/snake-royale-contract.test.mjs`
- `tests/browser/snake-royale-accessibility.test.mjs`

The review deliverable was produced without execution access; these tests require execution in the repository environment.
