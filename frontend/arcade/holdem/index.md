# AI Hold'em

Browser-only no-limit Texas Hold'em at `/arcade/holdem/`. Play chips only.
Two to nine seats can mix humans sharing one device and independently
executed bots. No backend, framework, build step or third-party assets.

## Modules

- `engine.js`: deterministic tournament rules, deck generation, hand evaluation
  and equity helper. Browser global `PokerEngine`; UMD export for Node.
- `runner.js`: `HoldemRunner.start(seats, options)`. Normalizes seat identities
  to `s1` through `s9`. Each bot entry uses `{ kind: 'bot', botId, name }`;
  each human uses `{ kind: 'human', name }`.
- `bot-worker.js`: loads the engine and a validated local bot identifier.
  Bot scripts export a function or `{ name, act }`.
- `table.js`: DOM table renderer. Private cards supplied by the controller
  carry `private: true`; only `revealFor` can reveal those cards. Unmarked
  cards in public engine state are already shown showdown cards.
- `game.js`: seat builder, tournament loop, hot-seat privacy, action controls,
  roster, standings and QA handle.
- `holdem.css`: light page, dark table and responsive phone controls.
- `bots.json`: local roster; file paths are informational, never worker URLs.

`runner.next()` resolves to a `hand`, `action`, `finished` or `stopped` event.
An action event includes its seat, normalized action, engine events, error
count and any completed hand result. Invalid human submissions do not
consume the pending decision. Bot failures check when legal, otherwise fold.
Timed-out workers are terminated; subsequent decisions use the fallback.
`stop()` resolves pending work, clears timers and terminates all workers.

The engine owns dealing, blind levels, pots, chip conservation, tournament
placements and the last twenty public hand histories. The page never gives
a bot another seat's private cards.

## Privacy and controls

A single human's cards remain visible. With multiple humans, every decision
starts behind an opaque pass-device dialog. Private cards are removed from
the rendered DOM between decisions. Showdown cards remain public.

Use F to fold, C to check/call and R to raise when no form field has focus.
Raise amounts are street totals. The range advances by the big blind;
the numeric field permits exact chip amounts. Quick controls offer half-pot,
pot and all-in.

`?seats=human,sample-equity,sample-tight&autostart=1` selects seats and starts.
Speed and hand limits remain selectable before starting.
`window.__HOLDEM__()` exposes public QA status without private cards.

## Security

Classic scripts and workers use same-origin files. No generated executable
code, inline handlers, inline styles or external dependencies are required.
Only the head's structured-data block is inline. CSS custom properties are
set with `style.setProperty`. Bot identifiers must match
`^[a-z0-9][a-z0-9.-]*$` and must not contain `..`.

Workers isolate bot execution and provide a decision deadline; they are not
a network security boundary. Publish only reviewed local bot scripts.

## Integration and tests

This page package expects `engine.js` and the three `bots/sample-*.js` files
from the engine/bot implementation.

The requested roster starts with `bytes: 0`. Before release, replace each
zero with the corresponding bot file's actual byte length. The static test
deliberately asserts exact byte sizes; it will fail until that integration
step is completed. Do not exempt zero-sized metadata or disable the check.

Run static checks with Node 22 or newer:

    node --test tests/holdem-page.test.mjs

Serve `frontend/` at the site root, install Playwright and its Chromium
browser, then run:

    node --test tests/browser/holdem.test.mjs

Set `ANCIENT_WORLD_BASE_URL` to override `http://127.0.0.1:4173`.
Browser tests block service workers and fail on page errors, worker
fallbacks in the all-bot match, privacy leaks or horizontal phone overflow.
