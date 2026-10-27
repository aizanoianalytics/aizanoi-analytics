# Capture the Flag

Route: `/arcade/capture-flag/`

A static browser team arena for Aizanoi Arcade and Aizo TV AI War.
Each side has 1–4 seats. A seat is Player 1, Player 2, or a bot.
One bot can fill an entire team; each bot seat gets an independent worker.

## External algorithms

Read [BOT_API.md](BOT_API.md) for the complete bot contract and AI-model
prompt reference: rules, exact state, JSON example, export format, timing,
fallback, deterministic randomness, worker helpers, and headless usage.

## Files

- `engine.js`: deterministic, DOM-free UMD rules engine.
- `BOT_API.md`: external algorithm contract.
- `bots/*.js`: CommonJS-style bot exports, loaded inside workers.
- `bots.json`: roster metadata and file byte sizes.
- `bot-worker.js`: validated local loading and seeded randomness.
- `runner.js`: simultaneous collection, human controls, deadlines, cleanup.
- `renderer.js`: responsive DPR-aware canvas with seat IDs and overlap offsets.
- `game.js`: team builder, match loop, event commentary, series, QA handle.
- `capture-flag.css`: page, arena, mobile layout, touch controls.
- `/arcade/shared/arena-input.js`: existing shared keyboard input, unchanged.

The three included bots are Aizanoi house samples, not AI-model results.

## Play

Defaults are 2v2: West has Player 1 and Sample Squad; East has two
Sample Squad seats.

Player 1 uses WASD. Player 2 uses arrow keys. Hold a direction to move;
release it to stay. Opposite-direction changes are allowed. Each player
may occupy only one seat.

On touch devices, choose Player 1 or Player 2 with the touch-player
selector, then hold or tap the pad. The selector follows the humans
actually selected, including Player 2-only configurations. Keyboard or
assistive-technology activation of a direction button queues one move.
The single pad controls one selected human at a time.

Slow, Normal, Fast, and Instant use 200, 130, 70, and 0 milliseconds per
tick. Instant becomes Normal when a human is selected.

Series play exactly 1, 3, or 5 games, including draws. Lineups swap physical
sides every game; adjacent games share a field seed. The tally follows
the original West and East lineups, not their current physical sides.
Odd series necessarily give one lineup one additional game on its
initial side; they are not perfectly balanced paired benchmarks.

Capture the enemy flag and enter your own half to score. The first team
to 3 captures wins. Equal simultaneous threshold captures draw, without
a tag tiebreaker. At 1200 ticks, captures decide, then tags, then a draw.

The middle column is neutral. Tagging works on the same or orthogonally
adjacent cells and eligible swaps; swaps do not override neutrality.
Jailed agents are frozen. Teammates can rescue them from the enemy jail.
Rescued agents respawn after 3 inactive ticks; jail also releases agents
after 40 ticks. Newly released agents act starting on the following tick.

Tokens display physical seat IDs matching the cards. West uses circles,
East rounded squares; team distinction does not depend on color alone.
Shared-cell tokens receive visual offsets only. The accessible canvas
description exposes agent identities, coordinates, and lifecycle state.

## Bot boundary

Workers receive an initialization object containing `type`, bot `id`,
and `seed`, never a script URL. A validated id resolves to `bots/<id>.js`.
The worker loads `engine.js` first and seeds `Math.random`.

Each move has a 150ms deadline; initialization has a 5-second deadline.
A failed or timed-out worker is terminated and its seat stays still.
A synchronous bot exception or invalid return instead means `stay` for
that tick; the worker remains available.

Workers isolate execution from the DOM, not from every worker platform
capability. Publish only reviewed bot files. Hardware-dependent deadlines
are not an exact deterministic replay mechanism.

## URLs and QA

Example:

`/arcade/capture-flag/?west=sample-squad,sample-squad&east=sample-rusher,sample-rusher&autostart=1`

Human IDs are `p1` and `p2`. Lists are limited to four seats. Unknown
entries and repeated human entries fall back to the default sample bot.

`window.__CAPTURE_FLAG__()` exposes roster count, running state, displayed
seats, tick, score, ticker, result, and card text. Seat IDs remain physical
engine IDs `w1`–`w4` and `e1`–`e4`; `kind` is `human` or `bot`.

## Tests

Requires Node 22 or newer:

    node --test tests/capture-flag-engine.test.mjs tests/capture-flag-page.test.mjs tests/capture-flag-regressions.test.mjs

With Playwright installed and the static site served:

    ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node --test tests/browser/capture-flag.test.mjs tests/browser/capture-flag-accessibility.test.mjs

The existing tests remain intact. Additional regressions cover simultaneous
winning captures, public configuration, object-method exports, exact event
commentary, and selected-human pad routing. Additional browser coverage
checks Player 2-only touch controls and reduced-motion operation.

This revision was statically reviewed; tests and revised screenshots have
not been executed in the review environment.

The page uses external same-origin scripts and styles. Its only inline
script is non-executable JSON-LD metadata. No framework, build step, remote
font, remote game asset, or inline style attribute is required.
