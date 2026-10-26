# AI Snake Royale

Static page at `/arcade/snake-royale/`: visitor picks two AI-written snake bots and watches them fight. No backend; all code runs in the browser.

## Files

- `engine.js` — pure deterministic rules (Battlesnake-style, 11×11 duel, storm after turn 150). UMD: page, worker, Node tests.
- `bot-worker.js` — one worker per bot; loads `bots/<id>.js` with `importScripts` (CSP `script-src 'self'`, no eval).
- `runner.js` — hosts the workers, 400 ms per move, a late/invalid move repeats the last direction.
- `game.js`, `snake-royale.css`, `index.html` — picker, canvas, series (single / best of 3 / 5). No inline script or style (CSP).
- `bots.json` + `bots/*.js` — the contestants: original, unedited bot code written by each AI model in the Aizo TV benchmark (test 10, snake-royale). Add a fighter = drop `bots/<id>.js` and add a `bots.json` entry (id, name, lab, color, file).

## Contract for a bot

`module.exports = function move(state)` (or `{ move }`, or a global `move`) returning `'up' | 'down' | 'left' | 'right'`.
`state` = `{ turn, width, height, you, snakes[], food[], hazards[], nextShrinkTurn }`; snake = `{ id, name, head{x,y}, body[{x,y}], length, health }`. `Math.random` is seeded per match.

## Notes

- Replays match the original benchmark engine exactly for the same seed, except bots that use a wall-clock search budget (Opus, Sonnet, Gemini 4 Argon, GPT-6.1 Sol, GPT-5.6 Sol, Kimi K3.1 Pro), which can differ run to run.
- Tests: `tests/snake-royale.test.mjs`.
