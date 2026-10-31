# Shared arcade browser modules

These are dependency-free classic scripts. Load them with external script tags
before the game code that uses them.

## arena-input.js

Exposes `window.ArenaInput.create('wasd' | 'arrows')`.

Each controller provides:

- `dir`: current direction.
- `set(direction)`: requests a direction, excluding reversal against the committed direction.
- `reset(direction)`: sets both the current and committed direction.
- `enable(boolean)`: enables or disables keyboard and attached-pad input.
- `attachPad(element)`: handles buttons with `data-dir="up|down|left|right"`.
- `onKey(callback)`: subscribes to direction/action events; returns an unsubscribe function.
- `destroy()`: removes listeners and subscriptions.

WASD uses Space for action; arrows use Enter. Input ignores editable controls
and modified/composing keyboard events. Call `reset` with the engine's committed
direction after each simulation step.

## custom-bot.js

Exposes `window.ArenaCustomBot`:

- `pick({ game })`: opens the hidden `#arena-custom-file` picker. Resolves to
  `{ name, code, bytes }`, or `null` on cancellation. Rejects invalid files,
  files larger than 256 KB (262,144 bytes), and read failures.
- `get(game)`: returns that game's most recent upload, or `null`.
- `forget(game)`: removes that game's retained upload.
- `createWorker({ game, workerUrl, scripts, code })`: fetches same-origin
  worker/engine scripts and returns a Promise for a classic Blob Worker.

Call `pick` directly from a user gesture. Contents are kept only in memory:
no upload, session storage, or local storage. The picker is shared and permits
only one outstanding selection. Report rejected picker promises in the game's UI.

Pass engine scripts in dependency order; for Anatolian Pact, map data precedes
the engine. Script addresses are resolved relative to the document. Cross-origin
addresses and redirects are rejected. Fetching has a 15-second ceiling.

Custom workers receive `__ARENA_INLINE__` and `__ARENA_BOT__`. They must skip
regular engine and roster-bot imports in inline mode. A caught top-level bot
exception is supplied as `__ARENA_LOAD_ERROR__`; report it through the worker's
normal initialization failure message. Syntax/startup errors arrive through
`Worker.onerror` and must become normal runner load failures.

Bots can export a function, export an object containing the game's entry point,
or, for move-based games, declare `function move(state)`. The game worker still
validates the appropriate contract. Seeded randomness is installed at init:
top-level bot code must not depend on `Math.random`.

The caller owns worker initialization, deadlines, event handlers and termination.
If a game stops or times out while creation is pending, terminate any worker
that arrives afterward. Forgetting an upload does not affect already-running
workers or seat snapshots.

CSP requires `script-src 'self'` and `worker-src 'self' blob:`. Page code does
not compile JavaScript strings. Workers isolate computation, but are not a
sandbox for hostile JavaScript: load only bot code you trust.
