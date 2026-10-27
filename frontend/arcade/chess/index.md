# AI Chess Arena

Static browser chess at `/arcade/chess/`. No backend, framework, build step,
external fonts or third-party runtime assets.

## Files

- `engine.js`: deterministic UMD chess engine, legal moves, SAN, FEN and results.
- `bot-worker.js`: loads the engine and one validated local bot identifier.
- `runner.js`: workers, loading deadlines, move deadlines, human input and cleanup.
- `renderer.js`: responsive, DPR-aware canvas board and square pointer input.
- `game.js`: roster, seats, human interaction, promotions, pacing and series.
- `index.html`, `chess.css`: page, controls and responsive layout.
- `bots.json`: roster metadata.
- `bots/<id>.js`: sample bots and future reviewed AI-model entries.

The engine and the three sample bot implementations are supplied by the engine/bot
module. Sample bots are explicitly labelled `Aizanoi sample`, not model entries.

## CSP and structured metadata

The page uses external scripts and styles only. It needs same-origin fetches,
workers and worker script imports. It does not need inline script/style
permission or dynamic JavaScript compilation.

Bot colours are validated hexadecimal values and applied using
`style.setProperty('--c', value)`.

The only inline `<script>` is the `application/ld+json` metadata block (data, not code), as on the other arcade pages.

## Bot contract

A bot exports a synchronous function:

    module.exports = function move(state) {
      return state.legalMoves[0];
    };

An object `{ name, move }` is also accepted, as is the house worker's legacy
global `move` fallback. Asynchronous returns are invalid.

The engine is available as `self.ChessEngine`. Bots may construct an analysis
position using `ChessEngine.create({ fen: state.fen, variant: state.variant })`.

`state` contains variant, FEN, board, side to move, legal UCI strings, UCI history,
ply counters, check state and `timeLimitMs: 1000`. Return exactly one string from
`state.legalMoves`. Castling uses king-takes-own-rook UCI, including in standard
chess. Promotion suffixes are `q`, `r`, `b` or `n`.

Each seat gets its own worker and seeded `Math.random`. This makes random-number
sequences reproducible for a given seed; wall-clock-budgeted searches can still
vary by device and load.

Only a lowercase identifier matching `/^[a-z0-9][a-z0-9.-]*$/`, without `..`,
can select `bots/<id>.js`. Manifest file paths are informational; the runner
never sends a script URL.

Workers provide execution isolation and can be terminated. They are not a
security sandbox for hostile same-origin JavaScript. Publish reviewed bot files
only; do not add user-supplied code or arbitrary remote imports.

## Runner

    const match = ChessRunner.start({
      white: { human: true },
      black: { id: 'sample-minimax', name: 'Sample Minimax' },
      variant: 'standard'
    });

    await match.loaded;
    const event = await match.next();

For human turns, `next()` stays pending until a valid
`submitHuman(uci)` call. Invalid human moves return `{ ok: false, error }`
without consuming the turn. Concurrent `next()` calls share one promise.

Events have `type` equal to `move`, `forfeit`, `over` or `stopped`.
Move events include `ok`, `color`, `uci`, SAN/move metadata and current status.
Forfeit events include the losing colour, detail and current status.
`loaded` always settles, including after `stop()`.

Both initialization and each bot move have a 1000 ms deadline. Loading failures,
worker errors, unreadable responses, exceptions, non-string moves and illegal
moves forfeit. A forfeit terminates both workers. `stop()` is idempotent,
cancels pending requests, clears their deadlines, terminates workers and settles
pending human input. It does not independently adjudicate a game.

## Page behaviour

White defaults to Human; Black defaults to Sample Minimax. URL parameters:

    ?white=sample-greedy&black=sample-random&variant=standard&autostart=1

Unknown seat/variant values are ignored. Fetch or manifest validation failure
disables Start and displays `The players could not be loaded…`.

Click a human piece, then a target. Castling can target the rook or the king's
g/c destination; in Chess960, castling takes precedence when a normal king move
shares that destination. Promotion opens the four-piece dialog. Escape or
Cancel leaves the move uncommitted.

Resign acts only on the human whose turn it is. Black-only human play
automatically flips the board. Two humans use hot-seat.

Pacing is a minimum of 900/450/150/0 ms per bot turn, including worker response
time, and never extends its thinking deadline. Speed remains adjustable while
playing; other setup controls are locked.

Series contain exactly 1, 2 or 4 games. Colours alternate, points follow the
original participants, draws award half a point, and each Chess960 pair shares
one randomly selected Scharnagl position.

## QA handle

`window.__CHESS_ARENA__()` returns a fresh, deeply frozen snapshot:

    { bots, running, seats: [white, black], variant, ticker, result, moves, fen }

`moves` contains SAN strings. The handle cannot mutate the runner or engine.

## Tests

Requires Node 22 or newer:

    node --test tests/chess-page.test.mjs

After installing Playwright and its Chromium browser, serve `frontend/` as the
web root at port 4173, then run:

    node --test tests/browser/chess.test.mjs

Override the base URL with `ANCIENT_WORLD_BASE_URL`. Browser contexts block
service workers so cached responses cannot hide changes.

Static tests inspect every chess JavaScript file, HTML CSP constraints, worker
path construction, runner messages and manifest file existence. Browser tests
cover a completed bot game, human e2-e4 followed by a bot reply, roster counts,
page errors and a 390×844 layout.
