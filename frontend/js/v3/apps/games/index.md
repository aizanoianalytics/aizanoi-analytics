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
- `manifest.json` — installation identity.

## Storage

`localStorage['aizanoi-games']` is owned by Arcade and stores local score history only.

## Legacy compatibility inside the module

The existing game engines are intentionally not rewritten during the ownership migration:

- `game-utils.js` exposes `window.AizanoiGames` for the four owned game assets;
- Blockfall exposes `window.AizanoiArcadeBlocks` as an explicit mount/cleanup factory;
- Snake, Mines and Brick remain self-initializing owned assets and stop their timers/animation loops when their container is disconnected.

These globals are module-internal compatibility surfaces, not public APIs for other AizanoiOS modules. Their legacy inline styling/event patterns are covered by one exact compatibility allow-list in the V3 source guard; the exception must not be widened to the whole module or directory.

## Cleanup

The launcher owns its click listener, active/pending game script nodes and explicit game cleanup. Each launch receives a lifecycle generation; close, switch or module teardown invalidates stale asynchronous continuations before they can request/mount a game after the UI has been closed. Blockfall cancels its animation frame and keyboard listener; the legacy games stop their timer/RAF loops after their module-owned container is removed.

## Tests

- `../../../../../tests/aizanoi-os-games-module.test.mjs` — manifest, ownership, storage, path and cleanup contracts.
- `../../../../../tests/browser/arcade-module.test.mjs` — real Chromium launch/play/close plus pending-load invalidation coverage.

Private files under `src/` and `assets/` are not cross-module APIs.
