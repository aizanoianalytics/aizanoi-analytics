# AI Football

Browser-only physics football at `/arcade/football/`. No backend, build step,
framework, remote fonts, or remote game assets.

## Files

- `engine.js`: deterministic fixed-step simulation and mirrored bot snapshots.
- `runner.js`: keyboard input, per-seat workers, scheduling, pause, and cleanup.
- `bot-worker.js`: validated local bot loading and seeded bot randomness.
- `renderer.js`: DPR-aware, interpolated canvas drawing with screen-space labels.
- `game.js`: team builder, touch controls, HUD, countdown, series, and QA handle.
- `football.css`: responsive light page and dark arena.
- `bots.json`: public roster with exact UTF-8 source byte lengths.
- `bots/`: sample implementations supplied with the engine module.
- [`BOT_API.md`](BOT_API.md): complete external bot contract, rules,
  observation schema/example, AI-model authoring prompt, and headless API.

## Play

Red starts on the left. Blue starts on the right. Teams have one to four seats;
multiple seats may use the same bot, each in its own worker.

Player 1 uses WASD and Space. Player 2 uses arrows and Enter or Slash.
Hold two keys to move diagonally. P pauses or resumes while focus is outside
form controls. Player 1 also has touch controls on coarse-pointer devices.
Each human control scheme can occupy only one seat.

Human matches have a three-second countdown and always select real-time speed.
Bot-only matches also support 2x, 4x, and Max. All speeds wait for workers at
decision boundaries; a heavily loaded device may run slower than target speed.
After a suspended browser tab, catch-up is bounded.

Series play exactly one, three, or five matches; teams exchange sides between
matches. The tally follows original teams, not current shirt colors. Red has
the initial kickoff, so an odd-length series does not give both original teams
the same number of initial kickoffs. Do not interpret an odd-length series as
a balanced tournament format; use paired, side-swapped headless matches for
competition scoring.

Example:

`/arcade/football/?red=p1&blue=sample-striker&autostart=1&speed=max`

The human seat forces this example to real time. Comma-separated `red` and
`blue` values configure up to four seats per team. Optional `time` is seconds
from the time selector; `limit`, `series`, and `speed` use selector values.
`limit=0` disables the score limit.

## Bots

Read [`BOT_API.md`](BOT_API.md) before submitting a bot.

A script exports a function or `{ name, decide }` through `module.exports`.
It receives `engine.botState(seatId)` and returns finite numeric `x`, `y`,
and boolean `kick`. Axes are clamped to `[-1, 1]`. Every bot attacks toward
positive x; the runner mirrors Blue inputs back into world coordinates.

Decisions are requested every three physics steps. All speed modes wait at
each decision boundary for responses or a 50 ms timeout. Invalid decisions
keep the previous action. A timed-out worker is terminated and its last valid
action remains held. Failed loads remain neutral. Worker startup has a separate
five-second timeout. Step and request serial must both match; a response from
before pause cannot satisfy a replacement request after resume.

Max mode yields to workers at decision boundaries and yields to the event
loop at least every 16 ms of simulation work. It accelerates simulation
without intentionally blocking the page.

The engine is deterministic for recorded per-step inputs. Seeded bot randomness
alone does not make wall-clock worker execution a deterministic replay format.
Formation/contact ordering is independent of caller roster-array ordering;
the API documents deterministic simultaneous-contact tie-breaks.

Workers import the local engine first, validate a plain bot id, then import
`bots/<id>.js`. No manifest path or page-provided URL is executed. Workers
isolate execution from the DOM; they are not a security sandbox for untrusted
same-origin code. Only reviewed, repository-controlled bots should be deployed.

## Statistics and QA

Snapshots expose authoritative live goals, kicks, touches, and own goals,
plus kick cooldown/edge state, remaining goal-freeze steps, and last two
touch entries. The page's existing snapshot-counter path uses these values.
Its provisional compatibility fallback is not used by the bundled engine.
Final player statistics come from `game.result().players`.

A touch counter increases at most once per player per physics step, regardless
of contact-solver passes or simultaneous contact and kick.

`window.__FOOTBALL__()` returns detached QA data: roster count, running and
paused flags, active seats, score, clock, time remaining, ticker, result,
per-player cards including positions, and series tally.

## Presentation and accessibility

The surrounding page stays light and the arena stays dark. Score and clock
use tabular numerals. Field direction markers, seat identities, team colors,
kick rings, and kickoff/goal banners distinguish match state without flashing.
Canvas labels use CSS-pixel sizing and collision-aware placement; phone labels
use short seat identities, mapped to the adjacent roster cards.

Existing labels, status regions, keyboard focus indicators, pointer capture,
blur/visibility input resets, and reduced-motion styling remain in place.
Touch controls are fixed with reserved phone page space and pitch scroll
margins; short screens may still require scrolling to avoid overlaying content.

## CSP

All executable scripts and styles are same-origin files. The only inline
script is non-executable JSON-LD metadata. Touch feedback and roster accents
use CSS custom properties. No dynamic source compilation is used.

## Tests

Requires Node 22 or newer:

`node --test tests/football-engine.test.mjs tests/football-page.test.mjs tests/football-regressions.test.mjs tests/football-runner.test.mjs`

With Playwright installed and the static site served:

`node --test tests/browser/football.test.mjs`

Set `ANCIENT_WORLD_BASE_URL` to override `http://127.0.0.1:4173`.

The manifest-size test checks actual source byte lengths; update metadata
whenever a bot source changes.

The review delivery was statically reasoned, not executed. Run both suites
and capture new desktop/phone screenshots before deploying.
