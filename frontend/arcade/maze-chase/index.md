# Maze Chase

Browser-only asymmetric arena at `/arcade/maze-chase/`. No backend, build step,
framework, external font or external asset dependency.

## Files

- `engine.js`: deterministic, DOM-free UMD simulation.
- `BOT_API.md`: [complete external bot contract](BOT_API.md), including rules,
  exact state fields, examples, deadlines and determinism boundaries.
- `bots/*.js`: dual-role sample implementations.
- `bots.json`: public roster; house samples are not AI-model entries.
- `bot-worker.js`: validates a bot ID, loads its local file and seeds randomness.
- `runner.js`: one worker per bot seat, human input, deadlines and cleanup.
- `renderer.js`: responsive DPR-aware canvas, compact seat markers and reduced motion.
- `game.js`: team builder, input lifecycle, countdown, rounds, scores and QA state.
- `maze-chase.css`: page, dark neon arena, roster and touch controls.

The shared `/arcade/shared/arena-input.js` is used unchanged.

## Play

Choose 1–4 runners and 1–6 ghosts. Every seat accepts a human player or a roster
bot. Repeated bots are allowed; repeated human players are not.

Player 1 uses WASD; Player 2 uses arrow keys. Humans retain their last direction
and use the shared input module's committed-direction behavior.

On coarse pointers the existing touch pad controls Player 1, or Player 2 when
Player 1 is not seated. With both humans seated, Player 2 needs a keyboard.
The pad's accessible name identifies its owner.

Board markers R1–R4 and G1–G6 match the numbered score cards. Full participant
names stay on the cards rather than obscuring maze corridors.

Runners win by clearing all pickups. Ghosts win by eliminating every runner or
reaching tick 1500 with pickups remaining. Clearing pickups takes precedence
over elimination or clock expiry on the same tick.

The engine owns scoring, simultaneous movement, deterministic contested-contact
arbitration, spawn protection, pen releases and fright timing. Protection blocks
catches but does not prevent eating frightened ghosts. See [BOT_API.md](BOT_API.md)
for exact tick-boundary rules.

Slow, Normal and Fast request 180, 120 and 70 ms tick intervals. Instant has no
intentional interval, yields periodically and becomes Normal when humans play.
Worker execution can make intervals longer. Fright telemetry shows authoritative
ticks and explicitly labeled Normal-speed-equivalent seconds, not an estimate
of real time remaining.

Series play exactly 1, 3 or 5 rounds. Seeds advance each round. Generated mode
uses the new seed; the fixed Aizanoi layout remains fixed. Individual scores
reset each round; team wins accumulate.

## Bot interface

Read [the complete bot API and submission guide](BOT_API.md) before implementing
an entrant. One file must support both roles.

A seat has its own simulation ID, such as `r1` or `g2`, separate from its bot ID.
Even identical bots receive separate workers, private memory and seeded streams.

Each move has a 150 ms deadline. Startup has a separate 5-second deadline.
Invalid results or caught exceptions fall back for that turn. A failed or
timed-out worker is terminated; its seat subsequently retains its direction
where possible. Retired workers are not restarted within a round.

The worker imports `engine.js` before importing the validated local bot path.
State mutations by a bot cannot modify the simulation or response tick.
Workers are not a security sandbox for arbitrary hostile code: deploy reviewed
local files only.

Engine replays are deterministic for ordered seats, options and accepted moves.
Live wall-clock timeouts can vary by machine. Save accepted move sequences for
exact replay; seeded random streams alone do not remove deadline variability.

## CSP

Executable scripts and styles are separate same-origin files. The sole inline
script is non-executable JSON-LD metadata. Dynamic colors use CSS custom
properties. No dynamic source compilation is used.

Allow same-origin scripts, workers, styles and roster fetching in the site's
CSP. No additional third-party origins are needed.

## Links and QA

Examples:

- `?runners=sample-tactician&ghosts=sample-hunter,sample-wanderer`
- `?runners=p1&ghosts=sample-hunter,sample-tactician&autostart=1`
- `?runners=p2,sample-wanderer&ghosts=p1,sample-hunter`

Recognized human IDs are `p1` and `p2`. Unknown IDs are discarded, empty teams
fall back to defaults, and team limits are enforced.

`window.__MAZE_CHASE__()` returns a detached snapshot containing bot count,
running state, selected seats, tick, pickup count, ticker, result and card text.
It does not expose the mutable engine, workers or inputs.

## Tests

Requires Node 22 or newer. From the repository root:

    node --test tests/maze-chase-engine.test.mjs tests/maze-chase-regressions.test.mjs tests/maze-chase-worker.test.mjs tests/maze-chase-page.test.mjs

Serve `frontend/` with the site's normal static server, install Playwright and
Chromium, then run:

    node --test tests/browser/maze-chase.test.mjs tests/browser/maze-chase-regressions.test.mjs

Browser tests default to `http://127.0.0.1:4173`.
Set `ANCIENT_WORLD_BASE_URL` to use another server. Service workers are blocked.

Engine and bot tests use the repository's same-realm
`vm.Script(...).runInThisContext()` UMD loader, not CommonJS `require`.

The review records execution status. Added tests are not evidence of a passing
run until these commands and the deployed CSP have actually been exercised.
