# AI Football

Browser-only physics football at `/arcade/football/`. No backend, build step,
framework, remote fonts, or remote game assets.

## Files

- `engine.js`: deterministic fixed-step simulation and mirrored bot snapshots.
- `runner.js`: keyboard input, per-seat workers, scheduling, pause, and cleanup.
- `bot-worker.js`: validated local bot loading and seeded bot randomness.
- `renderer.js`: DPR-aware, interpolated canvas drawing.
- `game.js`: team builder, touch controls, HUD, countdown, series, and QA handle.
- `football.css`: responsive light page and dark arena.
- `bots.json`: public roster.
- `bots/`: sample implementations supplied with the engine module.

## Play

Red starts on the left. Blue starts on the right. Teams have one to four seats;
multiple seats may use the same bot, each in its own worker.

Player 1 uses WASD and Space. Player 2 uses arrows and Enter or Slash.
Hold two keys to move diagonally. P pauses or resumes while focus is outside
form controls. Player 1 also has touch controls on coarse-pointer devices.
Each human control scheme can occupy only one seat.

Human matches have a three-second countdown and always run in real time.
Bot-only matches also support 2x, 4x, and Max. Series play exactly one, three,
or five matches; teams exchange sides between matches. The tally follows the
original teams, not the current shirt colors.

Example:

`/arcade/football/?red=p1&blue=sample-striker&autostart=1&speed=max`

The human seat forces this example to real time. Comma-separated `red` and
`blue` values configure up to four seats per team. Optional `time` is seconds
from the time selector; `limit`, `series`, and `speed` use selector values.

## Bots

A script exports a function or `{ name, decide }` through `module.exports`.
It receives `engine.botState(seatId)` and returns finite numeric `x`, `y`,
and boolean `kick`. Axes are clamped to `[-1, 1]`. Every bot attacks toward
positive x; the runner mirrors Blue inputs back into world coordinates.

Decisions are requested every three physics steps. Replies must match the
current three-step window and arrive within 50 ms. Invalid or late replies
do not replace the previous action. A timed-out worker is terminated and its
last valid action remains held. Failed loads remain neutral. Worker startup
has a separate five-second timeout.

Max mode yields to workers at decision boundaries and yields to the event
loop at least every 16 ms. It accelerates simulation without blocking the page.
Wall-clock worker scheduling is not a deterministic replay format; the engine
is deterministic for a recorded sequence of per-step inputs.

Workers import the local engine first, validate a plain bot id, then import
`bots/<id>.js`. No manifest path or page-provided URL is executed. Seeded
randomness is provided for bot use. Workers isolate execution from the DOM;
they are not a security sandbox for untrusted same-origin code. Only reviewed,
repository-controlled bots should be deployed.

## Statistics and QA

The engine snapshot contract does not expose live player counters. The page
therefore displays provisional live contact counts, kick events, and positions.
When provided by the engine, snapshot counters take precedence. Final player
statistics always come from `game.result().players`.

`window.__FOOTBALL__()` returns detached QA data: roster count, running and
paused flags, active seats, score, clock, time remaining, ticker, result,
per-player cards including positions, and series tally.

## CSP

All executable scripts and styles are same-origin files. The only inline
script is non-executable JSON-LD metadata. Touch feedback and roster accents
use CSS custom properties. No dynamic source compilation is used.

## Tests

Requires Node 22 or newer:

`node --test tests/football-page.test.mjs`

With Playwright installed and the static site served:

`node --test tests/browser/football.test.mjs`

Set `ANCIENT_WORLD_BASE_URL` to override `http://127.0.0.1:4173`.

The supplied manifest intentionally has the requested zero-byte placeholders.
Before deployment, replace each `bytes` value with the corresponding bot
file's actual UTF-8 byte length. The strict manifest-size test deliberately
rejects placeholders for nonempty bot files.
