# AI Snake Royale

Static page at `/arcade/snake-royale/`: visitor picks two AI-written snake bots and watches them fight, adds more bots for a 19×19 royale (up to 12 snakes), or joins as Player 1/2 from the keyboard (WASD / arrows, on-screen pad on touch). Local play only; no backend, all code runs in the browser.

## Files

- `engine.js` — pure deterministic rules (Battlesnake-style, 11×11 duel, storm after turn 150). UMD: page, worker, Node tests.
- `bot-worker.js` — one worker per bot; loads `bots/<id>.js` with `importScripts` (CSP `script-src 'self'`, no eval).
- `runner.js` — hosts the workers, 400 ms per move, a late/invalid move repeats the last direction. Human seats (`{ human: true, input }`, ids `player-1`/`player-2`) get no worker; their move is the shared input's current direction.
- `../shared/arena-input.js` — `window.ArenaInput.create('wasd' | 'arrows')`: keyboard + touch pad direction input shared by the arcade arenas; ignores keys in form fields, prevents scrolling only while enabled.
- `renderer.js` — shared public Canvas renderer, UMD `window.SnakeArenaRenderer` / Node export. Both this page and the shell use it; no dependencies, DOM styles or remote assets.
- `game.js`, `snake-royale.css`, `index.html` — picker, extra bot seats, Player 1/2 controls, canvas, series (single / best of 3 / 5). More than two snakes = 19×19 royale; humans play at a tick of at least 120 ms after a 3-2-1 countdown. No inline script or style (CSP).
- `bots.json` + `bots/*.js` — the contestants: original, unedited bot code written by each AI model in the Aizo TV benchmark (test 10, snake-royale). Add a fighter = drop `bots/<id>.js` and add a `bots.json` entry (id, name, lab, color, file).

## Shared presentation API

`SnakeArenaRenderer.create(canvas, options?)` returns `{ update(game, colors, metadata?), destroy() }`.
Call `update` after each engine turn; `colors` maps fighter ids to roster hex colors. Optional metadata: `fighters: [fighterAId, fighterBId]` keeps A/B identity across alternating spawns, and `duration` sets interpolation milliseconds (0 = instant; capped at 260). The renderer copies all visual state, never retains/mutates the engine or colors, and never executes bots.

Rounded connected tubes, head/eyes with rear A/B badges, animated apples, a clipped storm hatch/boundary and bounded deterministic eat/death sparks are paint-only. Animation interpolates only valid consecutive one-cell body shifts; resets, skipped turns, disconnected topology and row wraps snap, never sweep across the board. Disconnected source runs are never bridged.

`destroy()` is idempotent: cancels RAF, unregisters the motion-preference listener, releases snapshots and ignores later updates. Idle animation settles within 700 ms of the final update; reduced motion draws a stable still immediately without scheduling RAF and responds to preference changes. Hosts must call destroy on teardown. Options `duration`, `reducedMotion`, `now`, `requestAnimationFrame`, `cancelAnimationFrame`, `mediaQuery` provide explicit preferences and deterministic test scheduling. Pure `snapshot` and `interpolate` exports support numerical regression tests; consumers normally use only `create`.

Standalone script order: engine → runner → renderer → game. The shell loads the same public scripts with its existing loader and owns its renderer lifecycle; no private cross-module imports.

## Contract for a bot

`module.exports = function move(state)` (or `{ move }`, or a global `move`) returning `'up' | 'down' | 'left' | 'right'`.
`state` = `{ turn, width, height, you, snakes[], food[], hazards[], nextShrinkTurn }`; snake = `{ id, name, head{x,y}, body[{x,y}], length, health }`. `Math.random` is seeded per match.

## Failure states

- `bots.json` unreachable or unparsable: the page says the fighters could not be loaded, disables **Fight**/**Random pair** and logs the reason. It never renders an empty picker as if it were a working page.
- A bot that fails to load or answers in under 400 ms per move is marked `load-error` / keeps its last direction; the match still finishes and the ticker names the cause.
- `window.__SNAKE_ROYALE__()` returns the live state (fighter count, running flag, selected pair, ticker, verdict, card text) so browser tests read state instead of timing canvas frames.

## Notes

- Replays match the original benchmark engine exactly for the same seed, except bots that use a wall-clock search budget (Opus, Sonnet, Gemini 4 Argon, GPT-6.1 Sol, GPT-5.6 Sol, Kimi K3.1 Pro), which can differ run to run.
- Tests: `tests/snake-royale.test.mjs`.
