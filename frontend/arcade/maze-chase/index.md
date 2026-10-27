# Maze Chase

Browser-only asymmetric arena at `/arcade/maze-chase/`. No backend, build step,
framework, external font or external asset dependency.

## Files

- `engine.js`: deterministic, DOM-free UMD simulation, supplied by the engine module.
- `bots/*.js`: dual-role sample bot implementations, supplied with the engine module.
- `bots.json`: public roster; house samples are explicitly not AI-model entries.
- `bot-worker.js`: validates a bot id, loads the local bot and seeds its randomness.
- `runner.js`: one worker per bot seat, human input, deadlines and worker cleanup.
- `renderer.js`: responsive DPR-aware canvas, interpolation and reduced-motion support.
- `game.js`: team builder, input lifecycle, countdown, rounds, scores and QA state.
- `maze-chase.css`: page, arena, roster and touch controls.

The shared `/arcade/shared/arena-input.js` is used unchanged.

## Play

Choose 1–4 runners and 1–6 ghosts. Every seat accepts either human player or any
roster bot. Repeated bots are allowed; repeated human players are not.

Player 1 uses WASD and the touch direction pad on coarse pointers. Player 2 uses
arrow keys. Humans retain their last direction and use the shared input module's
committed-direction behavior.

Runners win by clearing all pellets. Ghosts win by eliminating every runner or
reaching tick 1500 with pellets remaining. The engine owns scoring, movement,
spawn protection, pen releases, fright timing and all collision rules.

Slow, Normal and Fast request 180, 120 and 70 ms tick intervals. Instant has no
intentional tick interval, yields periodically to the browser and becomes Normal
when humans play. Worker execution can make an interval longer. The fright HUD
converts ticks to seconds at Normal speed; simulation time is always tick-based.

Series play exactly 1, 3 or 5 rounds. Seeds advance each round, producing a new
seeded maze in generated mode. The fixed Aizanoi layout remains fixed. Scores
reset each round; team wins accumulate in the tally.

## Bot interface

A seat has its own simulation id, such as `r1` or `g2`, separate from its `botId`.
Even identical bots receive separate workers and seeded random streams.

Bots export `module.exports = function move(state) { ... }` or `{ name, move }`.
The worker loads `engine.js` before the bot. Replies contain
`{ type: 'move', tick, move }`. The runner accepts only the requested tick and
valid direction strings, including `stay` for bots.

Each move has a 150 ms deadline. Startup has a separate 5-second deadline.
A failed or timed-out worker is terminated to prevent a backlog or an infinite
loop; its seat thereafter submits null, letting the engine retain its direction.
Workers isolate execution from the page, but are not a security sandbox for
arbitrary hostile code. Only deploy reviewed local bot files.

## CSP

Executable scripts and styles are separate same-origin files. The sole inline
script is non-executable JSON-LD metadata in the document head. Dynamic colors
use CSS custom properties. No dynamic source compilation is used.

Allow same-origin scripts, workers, styles and roster fetching in the site's
CSP. No additional third-party origins are needed.

## Links and QA

Examples:

- `?runners=sample-tactician&ghosts=sample-hunter,sample-wanderer`
- `?runners=p1&ghosts=sample-hunter,sample-tactician&autostart=1`
- `?runners=p2,sample-wanderer&ghosts=p1,sample-hunter`

Recognized human ids are `p1` and `p2`. Unknown ids are discarded, empty teams
fall back to defaults, and team limits are enforced.

`window.__MAZE_CHASE__()` returns a detached snapshot containing bot count,
running state, selected seats, tick, pellet count, ticker, result and card text.
It does not expose the mutable engine, workers or inputs.

## Tests

Requires Node 22 or newer. Run static checks from the repository root:

    node --test tests/maze-chase-page.test.mjs

Serve `frontend/` with the site's normal static server, install Playwright and
its Chromium browser, then run:

    node --test tests/browser/maze-chase.test.mjs

The browser tests default to `http://127.0.0.1:4173`.
Set `ANCIENT_WORLD_BASE_URL` to test another server. Service workers are blocked
so stale cached files cannot mask failures.

Engine and bot tests should load UMD files with the repository's same-realm
`vm.Script(...).runInThisContext()` loader, not CommonJS `require`.
