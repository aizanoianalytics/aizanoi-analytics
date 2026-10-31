# AI Chess Arena

Static browser chess at `/arcade/chess/`. No backend, framework, build step,
external fonts or third-party runtime assets.

## Files

- `engine.js`: deterministic UMD engine, legal moves, SAN, FEN and results.
- `bot-worker.js`: engine and one validated local bot identifier.
- `runner.js`: workers, deadlines, input, adjudication and cleanup.
- `renderer.js`: responsive DPR-aware board, pointer and keyboard input.
- `game.js`: roster, human interaction, promotion, pacing and paired series.
- `index.html`, `chess.css`: light page shell and dark neon arena.
- `bots.json`: roster metadata; `bytes: 0` means unspecified.
- `bots/<id>.js`: reviewed submissions and labelled house examples.
- [BOT_API.md](BOT_API.md): complete external-author and AI-model contract.

Sample bots are explicitly attributed to `Aizanoi sample`, not AI-model entries.

## CSP

Scripts and styles are external. The only inline script is the
`application/ld+json` metadata block. There are no inline handlers, style
attributes, dynamic code compilers or remote runtime dependencies.

Bot colours are validated hexadecimal values applied through
`style.setProperty('--c', value)`. Canvas drawing needs no inline-style
permission. Same-origin fetches, workers and worker imports must be allowed.

The worker validates identifiers and imports exactly `bots/${id}.js`, never
a message-supplied URL. Workers isolate execution but are not a hostile-code
security sandbox. Publish reviewed bot files only.

## Bots and headless engine

See [BOT_API.md](BOT_API.md) for the full state, rules, examples and timing.

Bots export a synchronous function or `{ name, move }`; the legacy global
`move` fallback remains supported. Return one canonical UCI string from
`state.legalMoves`. Castling is king-to-friendly-rook, including standard chess.

`ChessEngine.fromBotState(state)` restores initial position, canonical history,
repetition counts, clocks, match-relative ply, configured limit and forfeits.
Recreating only `state.fen` intentionally loses history-dependent draw context.

The engine is DOM-free and deterministic. Under this repository's ESM setup,
Node tests retain the same-realm `vm.Script(...).runInThisContext()` UMD loader.

Threefold repetition and the fifty-move rule are automatic arena draws, not
FIDE claim procedures. The normal match limit is 400 plies. All-bishop material
on a single square colour is insufficient, including promoted bishops.

`start960(518)` retains its existing `STANDARD_FEN` compatibility result.
Chess960 `game.fen()` emits Shredder file-letter rights.

## Runner

```js
const match = ChessRunner.start({
  white: { human: true },
  black: { id: 'sample-minimax', name: 'Sample Minimax' },
  variant: 'standard',
  seed: 123
});

await match.loaded;
const event = await match.next();
```

`seed` is optional; when present it must be an unsigned 32-bit integer.
`position960` selects a Scharnagl start.
`swapSeedSeats: true` follows original participant random streams when seats
are reversed in a paired series.

A human `next()` waits for valid `submitHuman(uci)`. Invalid human moves return
`{ ok: false, error }` without consuming the turn. Concurrent `next()` calls
share a promise.

Events are `move`, `forfeit`, `over` or `stopped`. Move events include colour,
UCI, SAN/move metadata and status. A single bot failure forfeits to its opponent.
Two initialization failures draw with reason `forfeit`, retaining both details.
`forfeitBoth(detail)` is also available on engine games.

Initialization and moves each have independent 1000 ms deadlines. Loading,
worker or communication errors, exceptions, non-string returns, illegal moves
and late responses forfeit. There is no fallback move. `loaded` always settles,
including after stopping.

`stop()` is idempotent, terminates workers, clears deadlines and settles pending
requests. It does not independently adjudicate a game.

## Page behaviour

White defaults to Human, Black to Sample Minimax.

Existing URL parameters remain:

```text
?white=sample-greedy&black=sample-random&variant=standard&autostart=1
```

Unknown seat and variant values are ignored. Fetch or manifest failure disables
Start and displays the loading-error message.

Human input supports touch, mouse, keyboard and the labelled UCI form:

- Select a piece, then a highlighted square.
- Focus the board; arrows move focus, Enter/Space activates, Escape clears.
- Home/End move to a row edge; Shift+Home/End move to a board corner.
- Castling always works by selecting the king then its rook.
- A king's g/c destination is a convenience castling target only when it is not
  also a legal ordinary king move. This avoids hiding legal Chess960 moves.
- Promotion uses the native four-piece modal; Escape or Cancel commits nothing.
- UCI input exposes every legal move unambiguously, including underpromotion.
- Resign acts on the human whose turn it is.
- Black-only human play automatically faces Black. Flip board remains available.

Pacing is a minimum 900/450/150/0 ms per displayed bot turn, including response
time; it never extends thinking time. Speed remains adjustable during play.

Series contain 1, 2 or 4 games. Colours alternate, points follow original
participants, draws award half a point, and each pair shares its starting
position and participant random seeds. Chess960 positions use unbiased
rejection sampling. Wall-clock-budgeted bots can still differ across devices.

## QA handle

`window.__CHESS_ARENA__()` remains a fresh, deeply frozen snapshot:

```js
{ bots, running, seats: [white, black], variant, ticker, result, moves, fen }
```

`moves` contains SAN strings. It cannot mutate the engine or runner.

## Tests

Node 22 or newer:

```sh
node --test tests/chess-engine.test.mjs tests/chess-page.test.mjs tests/chess-review.test.mjs
```

After installing Playwright and Chromium, serve `frontend/` on port 4173:

```sh
node --test tests/browser/chess.test.mjs tests/browser/chess-review.test.mjs
```

Override the browser origin using `ANCIENT_WORLD_BASE_URL`. Browser contexts
block service workers.

Existing perft, rule, manifest, CSP-source, bot and page regressions are retained.
Additional tests cover history-aware reconstruction, draw context, promoted
bishops, simultaneous load failures, request correlation, export receivers,
timeouts, participant seeds, keyboard/UCI input and Chess960 destination
ambiguity.

The review deliverable was prepared without execution access. These commands
must be run before treating it as verified.
