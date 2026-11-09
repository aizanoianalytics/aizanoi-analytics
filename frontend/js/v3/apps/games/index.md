# Aizanoi Arcade Module

Purpose: self-contained AizanoiOS launcher and asset owner for the playable browser games published as Aizanoi Arcade.

## Stable identity

- Product name: **Aizanoi Arcade**
- Stable app/module id: `games`
- Public entry: `src/index.js`

The `games` id is intentionally preserved so existing launchers and the `arcade -> games` alias do not break.

## Declared capabilities

None. Arcade is a zero-capability module. It uses browser-local DOM, Canvas, animation/timer APIs and its own module-owned assets.

## Owned implementation and assets

- `src/app.js` — launcher, game switching and lifecycle cleanup.
- `assets/game-utils.js` — score/toolbar compatibility surface.
- `assets/snake.js` — Signal Snake.
- `assets/mines.js` — Survey Mines.
- `assets/brick.js` — Strata Breaker.
- `assets/blockfall.js` — Blockfall.
- `assets/sudoku.js` — Sudoku: bounded local puzzle bank, game state and mount/cleanup factory. See [Sudoku validation](../../../../../tests/sudoku.test.mjs).
- `assets/solitaire.js` — Klondike Solitaire: seeded 52-card deal, stock/waste/foundation/tableau rules, undo, win/dead-end detection and mount/cleanup factory. See [Solitaire validation](../../../../../tests/solitaire.test.mjs).
- `manifest.json` — installation identity.

## Sudoku

Sudoku lives in this existing module, not a second app or shell. It has its own cabinet tile and public landing card. Three original offline-authored unique puzzles per level are varied with digit permutations, band/stack and within-band/stack permutations, and transpose; all preserve Sudoku constraints and uniqueness. No solver/generator runs on the phone UI thread and no external service is used.

Difficulty is a collection-relative technique/search proxy, not a universal rating: Easy solves with naked singles; Medium needs hidden singles; Hard and Expert stall under both. The independent test enumerator needs at most 100 nodes after singles for each authored Hard puzzle and over 100 for Expert. Transformations preserve logical structure, though search ordering and perceived difficulty vary. Tests recompute ratings rather than trusting bank metadata.

Controls: select a cell; 1–9 or the large keypad enters; Delete/Backspace/Erase clears; arrows and Home/End move; Undo or Ctrl/⌘+Z restores a move. Fixed clues are protected, duplicates receive both × and accessible conflict labels, and only a complete valid grid wins. New game and changing difficulty start fresh. No persistence or hints are implied. The board fits narrow phones with compact cells; the separate keypad and actions retain 44px touch targets.

`tests/browser/sudoku.test.mjs` is routine CI acceptance: actual launcher clicks, four levels/new games, desktop keyboard solves, mobile touchscreen solve, protected clues/conflicts/undo, responsive layout and teardown.

## Solitaire

Solitaire lives in this existing module, not a second app or shell. It has its own cabinet tile and public landing card. Klondike draw-1/draw-3 from a seeded shuffle; tableau builds down in alternating colours, only kings fill gaps, foundations build up by suit from aces, exposed tableau cards flip, every mutation is undoable, and the status line reports win, dead-end (no legal move with empty stock), or cards-home progress.

Controls: tap/click the stock to draw or recycle; select a card then its destination; double-tap/double-click sends a card home; Auto-home, Undo (or `U`), draw with `S`, auto-home with `F`, new game with `N`, `Esc` deselects. No persistence beyond the score toolbar; the seven columns collapse gracefully to 320px phones with 44px action targets.

`tests/browser/solitaire.test.mjs` is routine CI acceptance: actual launcher clicks, stock draw/undo round-trip, keyboard draw/undo, redeal validity, responsive layout and teardown.

## Storage

`localStorage['aizanoi-games']` is owned by Arcade and stores local score history only.

## Legacy compatibility inside the module

The existing game engines are intentionally not rewritten during the ownership migration:

- `game-utils.js` exposes `window.AizanoiGames` for the legacy owned game assets;
- Blockfall exposes `window.AizanoiArcadeBlocks` as an explicit mount/cleanup factory;
- Snake, Mines and Brick expose mount/dispose factories (`AizanoiArcadeSnake`, `AizanoiArcadeMines`, `AizanoiArcadeBrick`) like Blockfall; `assets/arcade.css` is the shared cabinet stylesheet, loaded ref-counted by the launcher.

These globals are module-internal compatibility surfaces, not public APIs for other AizanoiOS modules. Their legacy inline styling/event patterns are covered by one exact compatibility allow-list in the V3 source guard; the exception must not be widened to the whole module or directory.

## Cleanup

The launcher owns its click listener, active/pending game script nodes and explicit game cleanup. Each launch receives a lifecycle generation; close, switch or module teardown invalidates stale asynchronous continuations before they can request/mount a game after the UI has been closed. Blockfall cancels its animation frame and keyboard listener; the legacy games stop their timer/RAF loops after their module-owned container is removed.

## Tests

- `../../../../../tests/aizanoi-os-games-module.test.mjs` — manifest, ownership, storage, path and cleanup contracts.
- `../../../../../tests/browser/arcade-module.test.mjs` — real Chromium launch/play/close plus pending-load invalidation coverage.

Private files under `src/` and `assets/` are not cross-module APIs.
