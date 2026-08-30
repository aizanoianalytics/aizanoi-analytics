# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app entries

- `brand-hubs.js` — public brand/product hub surfaces
- `calculator.js` — Calculator
- `camera.js` — Camera
- `games.js` — Arcade/game launcher integration
- `media.js` — media surfaces
- [`notepad/index.md`](notepad/index.md) — migrated Notepad module pilot
- `recycle-bin.js` — Recycle Bin
- `winamp.js` — Winamp-style player
- `workspace.js` — workspace UI
- `worlds.js` — Historical Worlds launcher/integration

## Before changing an app

1. If the app has a local `index.md`, read that first; otherwise read the app file only.
2. Inspect `../registry.js` only if catalog metadata, launch registration or routing changes.
3. Inspect a shared implementation only when the app actually imports or invokes it.
4. Do not import private internals from another app.
5. Follow `../../../../MODULE_CONTRACT.md` for new boundaries and migration work.

## Current vs target structure

Most apps are still individual `.js` files and some directly depend on shared concrete implementations. This directory is therefore **not yet fully plug-and-play**.

Notepad is the first migrated pilot:

```text
apps/
└── notepad/
    ├── index.md
    ├── manifest.json
    └── src/
        ├── index.js          # public entry
        ├── app.js            # private UI/lifecycle logic
        └── capabilities.js   # private shared-service adapter
```

The central architecture test for the pilot lives at `../../../../tests/aizanoi-os-notepad-module.test.mjs`. Do not create empty module folders merely to make every tree look identical.

## Pilot result

Notepad proves the first boundary without changing the canonical shell: the registry imports only the module public entry; private Notepad logic consumes declared capabilities; only its adapter knows the current Workspace filesystem/dialog implementation paths; and lifecycle cleanup removes module-owned listeners.

Camera should follow only after this pilot is validated because camera/media permissions introduce stronger cleanup requirements.

## Boundary rule

App-private files are private by default. Consumers must use the module public entry or a declared capability rather than reaching into another app's implementation.
