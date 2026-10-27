# AI Chess Arena: bot contract

This document is the contract for external authors and AI-model submissions.
Implement one reviewed, local JavaScript file. No framework, build step, network
dependency, external asset, dynamic code compilation or DOM access is required.

## Submission and exports

Save the implementation as `bots/<id>.js`.

Identifiers match `/^[a-z0-9][a-z0-9.-]*$/`, must not contain `..`, must be
unique in the manifest, and cannot be `human`.

Preferred export:

```js
'use strict';

module.exports = function move(state) {
  return state.legalMoves[0];
};
```

An object exporting `move(state)` is also supported; its method is called with
the exported object as its receiver. A legacy global `move` function remains
supported.

Return a synchronous string selected from `state.legalMoves`. Promises, objects,
missing return values, thrown errors and illegal moves cause a forfeit; there is
no fallback move.

## State

Each call receives a detached, structured-cloned state object:

- `variant`: `standard` or `chess960`.
- `initialFen`: the normalized starting FEN for this match.
- `fen`: the current FEN.
- `board`: eight rows, rank 8 first, with files a–h in each row. Empty squares
  are `null`; pieces are `wP`, `wN`, `wB`, `wR`, `wQ`, `wK` or their `b` equivalents.
- `turn`, `you`: the side to move, `w` or `b`.
- `legalMoves`: sorted canonical UCI strings.
- `history`: canonical UCI strings from the initial position.
- `ply`: match-relative number of completed plies, equal to `history.length`.
- `moveNumber`: the current FEN fullmove number.
- `halfmoveClock`: plies since the last pawn move or capture.
- `maxPlies`: the configured match-relative limit, normally 400.
- `inCheck`: whether the side to move is in check.
- `status`: `{ over, result, reason }`, with `detail` on forfeits.
- `timeLimitMs`: 1000.

### Complete example

After `e2e4` from the standard starting position:

```json
{
  "variant": "standard",
  "initialFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "board": [
    ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
    ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, "wP", null, null, null],
    [null, null, null, null, null, null, null, null],
    ["wP", "wP", "wP", "wP", null, "wP", "wP", "wP"],
    ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"]
  ],
  "turn": "b",
  "you": "b",
  "legalMoves": [
    "a7a5", "a7a6", "b7b5", "b7b6", "b8a6", "b8c6",
    "c7c5", "c7c6", "d7d5", "d7d6", "e7e5", "e7e6",
    "f7f5", "f7f6", "g7g5", "g7g6", "g8f6", "g8h6",
    "h7h5", "h7h6"
  ],
  "history": ["e2e4"],
  "ply": 1,
  "moveNumber": 1,
  "halfmoveClock": 0,
  "maxPlies": 400,
  "inCheck": false,
  "status": {
    "over": false,
    "result": null,
    "reason": null
  },
  "timeLimitMs": 1000
}
```

## Moves and castling

Ordinary moves use origin and destination squares, for example `e2e4`.
Promotions append a lowercase `q`, `r`, `b` or `n`, for example `a7a8n`.

Canonical castling is always king-to-friendly-rook, including standard chess.
For example, standard White kingside castling is `e1h1`, not `e1g1`.
The engine accepts standard king-destination aliases for human input, but bots
must return an entry from `state.legalMoves`. Chess960 does not accept those
aliases; an ordinary king step must remain distinguishable from castling.

Chess960 FEN output uses Shredder file-letter castling rights.
`ChessEngine.start960(518)` retains its compatibility result equal to
`ChessEngine.STANDARD_FEN`.

## Headless engine

The worker loads the DOM-free engine as `globalThis.ChessEngine` before loading
the bot. Reconstruct a search root with:

```js
const root = globalThis.ChessEngine.fromBotState(state);
const child = root.clone();
const result = child.move(state.legalMoves[0]);
```

`fromBotState` replays canonical history from `initialFen`, validates the final
FEN, and preserves repetition counts, clocks, match-relative ply, configured
limit and forfeits. Creating a game from `state.fen` alone loses
history-dependent draw context.

Available operations include `create(options)`, `fromBotState(state)`,
`start960(number)`, `perft(fen, depth, variant)`, `rng(seed)`,
`squareName(file, rank)` and `parseSquare(name)`. Game methods include `clone()`,
`fen()`, `board()`, `legalMoves()`, `move(uci)`, `inCheck()`, `status()` and
`botState()`.

`move(uci)` returns `{ ok: false, error }` without changing the game on failure.
Successful results include `ok`, `san`, `capture`, `check`, `mate`, `castle` and
`promotion`. `history` exposes detached `{ uci, san, fen }` entries.

## Results and arena rules

Results are `1-0`, `0-1` or `1/2-1/2`; an ongoing game's result and reason are
`null`. Terminal reasons are `checkmate`, `stalemate`, `threefold`,
`fifty-move`, `insufficient`, `max-plies` and `forfeit`.

Threefold repetition and the fifty-move rule are automatic arena draws, not
FIDE claim procedures. Repetition includes an en passant target only when an
en passant capture is legal. A draw ends the game immediately, even if it
occurs partway through a planned repetition cycle.

Insufficient material includes bare kings, one bishop or knight against a bare
king, and any number of bishops all confined to the same square colour.
Opposite-colour bishops, two knights, and bishop-plus-knight material are not
automatically declared insufficient.

Checkmate and stalemate take precedence over draw counters. The normal match
limit is 400 plies. One bot's initialization failure loses; failures from both
bots produce a double-forfeit draw.

## Timing, randomness and isolation

Each worker initialization and move response has a 1000 ms deadline. Responses
at or after the deadline are late. Budget conservatively for reconstruction
and search; a worker can be terminated when its deadline expires.

`Math.random` is seeded by the worker. Paired series keep participant seed
streams attached to the participant when colours swap. Repeatable randomness
does not make wall-clock-limited search deterministic.

Workers import exactly one validated local `bots/<id>.js` file. Workers isolate
execution but are not a hostile-code security sandbox. Publish reviewed local
bots only; do not access the network, DOM, private services or external assets.

The supplied random, greedy and minimax bots are house examples attributed to
`Aizanoi sample`, not AI-model submissions.
