# Capture the Flag

Route: `/arcade/capture-flag/`

A static, browser-only team arena for Aizanoi Arcade and Aizo TV AI War.
Each side has 1–4 seats. A seat is Player 1, Player 2, or a bot.
One bot can fill an entire team; each bot seat gets an independent worker.

## Files

- `engine.js`: deterministic, DOM-free UMD rules engine.
- `bots/*.js`: CommonJS-style bot exports, loaded only inside workers.
- `bots.json`: roster metadata; `bytes: 0` is an unspecified size.
- `bot-worker.js`: validated local bot loading and seeded randomness.
- `runner.js`: simultaneous input collection, worker deadlines, and cleanup.
- `renderer.js`: responsive, DPR-aware canvas rendering.
- `game.js`: team builder, human input, match loop, series, and QA handle.
- `capture-flag.css`: page, arena, mobile layout, and touch controls.
- `/arcade/shared/arena-input.js`: existing shared input module, unchanged.

The engine and sample bot implementations are supplied by the engine module.
The three included roster entries are Aizanoi house samples, not AI-model results.

## Play

Defaults are 2v2: West has Player 1 and Sample Squad; East has two Sample Squad seats.
Player 1 uses WASD or the touch pad. Player 2 uses arrow keys.
Hold a direction to move; release it to stay. Opposite-direction changes are allowed.
Each player may occupy only one seat.

Slow, Normal, Fast, and Instant use 200, 130, 70, and 0 milliseconds per tick.
Instant becomes Normal when a human is selected.
Series play exactly 1, 3, or 5 games, including draws.
Lineups swap physical sides every game; adjacent games share a field seed.
The series tally follows the original West and East lineups, not their current sides.

Capture the enemy flag and enter your own half to score.
The first team to 3 captures wins. At 1200 ticks, captures decide, then tags.
The middle column is neutral. Tagging works on the same or adjacent cells and on swaps.
Jailed agents are frozen. Teammates can rescue them from the enemy jail.
Rescued agents respawn after 3 ticks; jail also releases agents after 40 ticks.

## Bot boundary

Workers receive an initialization object containing `type`, bot `id`, and `seed`.
They never receive a script URL. A validated id resolves to `bots/<id>.js`.
The worker loads `engine.js` before the bot and seeds `Math.random`.

A bot exports a function or `{ name, move }` and returns a direction or `stay`.
Move requests contain the full engine state.
Each move has a 150 ms deadline; initialization has a 5-second deadline.
A failed or timed-out worker is terminated to prevent stale requests accumulating.
Its seat remains in the match and stays still.

Workers isolate execution from the DOM; they are not a general-purpose security sandbox.
Publish only reviewed bot files.

## URLs and QA

Example all-bot setup:

`/arcade/capture-flag/?west=sample-squad,sample-squad&east=sample-rusher,sample-rusher&autostart=1`

Human ids in URL lists are `p1` and `p2`.
Lists are limited to four seats. Unknown entries fall back to the default sample bot.
Repeated human entries also fall back to a bot.

`window.__CAPTURE_FLAG__()` exposes roster count, running state, displayed seats,
tick, score, ticker, result, and card text. Seat ids are physical engine ids
`w1`–`w4` and `e1`–`e4`; `kind` is `human` or `bot`.

## Tests

Requires Node 22 or newer:

`node --test tests/capture-flag-page.test.mjs`

With Playwright installed and the static site served:

`ANCIENT_WORLD_BASE_URL=http://127.0.0.1:4173 node --test tests/browser/capture-flag.test.mjs`

Browser tests block service workers, run an Instant all-bot match, exercise held
human input, and check the phone layout.

The page uses external same-origin scripts and styles. Its only inline script is
non-executable JSON-LD metadata. No framework, build step, remote font, or remote
game asset is required.
