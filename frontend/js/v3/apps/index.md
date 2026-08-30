# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app entries

- `brand-hubs.js` — public brand/product hub surfaces
- `calculator.js` — Calculator
- `camera.js` — Camera
- `games.js` — Arcade/game launcher integration
- `media.js` — media surfaces
- [`notepad/index.md`](notepad/index.md) — manifest-driven, capability-injected Notepad module pilot
- `recycle-bin.js` — Recycle Bin
- `winamp.js` — Winamp-style player
- `workspace.js` — workspace UI
- `worlds.js` — Historical Worlds launcher/integration

## Before changing an app

1. If the app has a local `index.md`, read that first; otherwise read the app file only.
2. Inspect `../registry.js` only if catalog metadata, launch registration or routing changes.
3. Inspect `../capabilities.js` when a migrated app needs a shared service; do not import the concrete implementation into app-private code.
4. Inspect a shared implementation only when changing the capability provider itself or a legacy caller that has not yet migrated.
5. Do not import private internals from another app.
6. Follow `../../../../MODULE_CONTRACT.md` for new boundaries and migration work.

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
        └── capabilities.js   # validates injected module contract
```

The central architecture test for the pilot lives at `../../../../tests/aizanoi-os-notepad-module.test.mjs`; the shared resolver contract lives at `../../../../tests/aizanoi-os-capabilities.test.mjs`. Do not create empty module folders merely to make every tree look identical.

## Pilot result

Notepad proves the full first module boundary while keeping one canonical shell and one public registry: build-time manifest discovery supplies installation state, entry path and declared requirements; the shell resolves those requirements through `../capabilities.js` and injects them into `mount()`; private Notepad logic sees only capability surfaces; and lifecycle cleanup removes module-owned listeners.

Recycle Bin is the lowest-risk next migration candidate because it can reuse the existing filesystem, dialog, notifications and sound capability surfaces. Camera should follow after the reused-capability modules because camera/microphone permission and media-track teardown introduce a new media capability and stronger cleanup requirements.

## Boundary rule

App-private files are private by default. Consumers must use the module public entry or a declared capability rather than reaching into another app's implementation.
