# AI Hold'em

Browser-only no-limit Texas Hold'em at `/arcade/holdem/`. Play chips only.
Two to nine seats mix humans sharing one device and independently executed
bots. No backend, framework, build step or third-party assets.

## Bot author contract

Read [BOT_API.md](BOT_API.md) for the complete decision schema, rules,
worker exports, timing, fallback, seeded randomness and examples. Use that
document as the integration contract in AI-model bot prompts.

## Modules

- `engine.js`: deterministic, DOM-free rules, decks, evaluation and equity.
  Browser global `PokerEngine`; UMD export for Node.
- `runner.js`: `HoldemRunner.start(seats, options)`. Normalizes identities to
  `s1` through `s9`. Bot seats use `{kind:'bot', botId, name}`; human seats
  use `{kind:'human', name}`.
- `bot-worker.js`: engine followed by a validated local bot identifier.
  Exports are a function or `{name, act}`.
- `table.js`: DOM table renderer. Controller-supplied private cards carry
  `private:true`; only the matching `revealFor` can reveal them. Unmarked
  engine cards are public showdown cards.
- `game.js`: seat builder, tournament loop, hot-seat privacy, controls,
  roster, standings and `window.__HOLDEM__()`.
- `holdem.css`: light page, dark neon table, responsive human controls.
- `bots.json`: reviewed local roster; paths are metadata, never worker URLs.

## Engine API

`PokerEngine.create([{id,name}, ...], options)` accepts:

- `seed`, default 1; normalized and snapshotted at creation.
- `stack`, default 10000.
- `blinds`, default schedule documented in BOT_API.
- `handsPerLevel`, default 12.
- `maxHands`, default 300.

Game methods:

- Getters `handNumber`, `level` (zero-based), `blinds`.
- `startHand()` returns events, or an empty array if unavailable.
- `toAct()` returns a seat ID or null.
- `legalActions(id)` returns
  `{canFold,canCheck,callAmount,minRaiseTo,maxRaiseTo,canAllIn}`.
- `act(id,{type,amount?})` returns `{ok:true,events}` or
  `{ok:false,error}` without changing the game.
- `publicState()` returns a fresh table snapshot with no private cards.
- `botState(id)` returns a detached decision snapshot. Only request an
  acting seat's state for actual bot decisions.
- `handOver()`, `handResult()`, `finished()`, `result()`.

`publicState().seats` includes total hand contributions; the table snapshot
also includes `smallBlindSeat` and `bigBlindSeat`. Extended bot fields and
their exact meanings are documented in BOT_API.

`result()` contains `{placements:[{id,place,chips}],hands}`. At the hand cap,
equal survivor stacks share competition places. Simultaneous busts are
ordered by starting-hand stack, then first left of button. Results before
the tournament ends are provisional.

Static exports: `evaluate`, `dealHand`, `rng`, `equity`.

## Runner

`runner.next()` resolves to `hand`, `action`, `finished` or `stopped`.
An action includes seat, normalized action, engine events, error count and
any completed hand result.

Invalid human submissions do not consume the pending decision. Bot errors
check if legal, otherwise fold. Timed-out workers are terminated.
`stop()` resolves pending work, clears timers and terminates workers.

`options.seed` is the private deck seed. `options.botSeed` is an optional
independent unsigned 32-bit seed for worker random streams. By default the
latter uses independent cryptographic entropy. A replay harness must record
both privately and keep them independent. Never derive botSeed from seed.

Fixed seeds and bounded deterministic bots reproduce accepted decisions
unless a real timeout or runtime failure differs. Deck generation itself
never uses clocks or ambient randomness.

## Privacy and controls

A single human's cards remain visible. With multiple humans, every decision
starts behind an opaque pass-device dialog; background regions are inert.
Private faces are removed from the DOM between decisions. Public showdown
cards, including those of players eliminated at showdown, remain visible.

F folds, C checks/calls and R raises when no editable field has focus.
Raise amounts are street totals. Both range and numeric controls support
exact integer chips. Quick controls offer half-pot, pot and legal all-in.
Controls sit immediately below the arena, before mobile standings/logs.

`?seats=human,sample-equity,sample-tight&autostart=1` selects seats and starts.
Speed and hand limits remain selectable before starting.

`window.__HOLDEM__()` exposes public QA status without private cards.
Its additive `errors` map retains cumulative per-seat bot error counts
after completion; the last thirty log messages alone are not an error audit.

## Security

Scripts and workers use same-origin files. No generated executable code,
inline handlers, inline styles or external dependencies are required.
Only the head's structured-data block is inline. Layout uses external CSS;
positions and roster colors use `style.setProperty` custom properties.

Bot identifiers match `^[a-z0-9][a-z0-9.-]*$` and cannot contain `..`.
The worker only imports `bots/${id}.js` after validation.

Workers isolate execution and enforce a deadline, not a hostile-code
security boundary. The reproducible 32-bit deck PRNG is not cryptographic.
Publish only reviewed bots; do not permit seed search, networking,
infrastructure tampering or cross-seat communication.

## Tests

Node 22 or newer; the repository is ESM. UMD tests use the existing
same-realm VM-wrapper pattern.

    node --test tests/holdem-engine.test.mjs tests/holdem-page.test.mjs tests/holdem-regressions.test.mjs tests/holdem-runner-regressions.test.mjs

The roster test asserts actual UTF-8 file byte counts. Keep LF line endings
and a final newline when installing the supplied bot files.

Serve `frontend/` at the site root, install Playwright and Chromium, then:

    node --test tests/browser/holdem.test.mjs tests/browser/holdem-regressions.test.mjs

Set `ANCIENT_WORLD_BASE_URL` to override `http://127.0.0.1:4173`.
Browser contexts block service workers. Added checks cover hot-seat
inertness, action placement, retained errors and nine-seat geometry.

The review was static. None of these commands was executed as part of it.
