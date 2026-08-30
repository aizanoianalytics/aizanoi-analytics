# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app files

- `brand-hubs.js` — public brand/product hub surfaces
- `calculator.js` — Calculator
- `camera.js` — Camera
- `games.js` — Arcade/game launcher integration
- `media.js` — media surfaces
- `notepad.js` — Notepad
- `recycle-bin.js` — Recycle Bin
- `winamp.js` — Winamp-style player
- `workspace.js` — workspace UI
- `worlds.js` — Historical Worlds launcher/integration

## Before changing an app

1. Read the app file only.
2. Inspect `../registry.js` only if catalog metadata, launch registration or routing changes.
3. Inspect a shared implementation only when the app actually imports or invokes it.
4. Do not import private internals from another app.
5. Follow `../../../../MODULE_CONTRACT.md` for new boundaries and migration work.

## Current vs target structure

Today these apps are mostly individual `.js` files and some directly depend on shared concrete implementations. This directory is therefore **not yet fully plug-and-play**.

Target for suitable independently replaceable apps:

```text
apps/
└── notepad/
    ├── index.md
    ├── manifest.json
    ├── src/index.js
    └── tests/
```

Migrate one app at a time. Do not bulk-move all files merely to match the target tree.

## Pilot

Notepad is the preferred first migration because it exercises useful shared boundaries (filesystem, dialogs, window lifecycle) without requiring camera/media permission cleanup. Camera should follow after the capability and cleanup contracts are proven.

## Boundary rule

App-private files are private by default. Future consumers must use the module public entry or a declared capability rather than reaching into another app's implementation.