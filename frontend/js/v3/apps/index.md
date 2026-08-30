# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app entries

- `brand-hubs.js` — public brand/product hub surfaces
- `calculator.js` — Calculator
- [`camera/index.md`](camera/index.md) — manifest-driven Camera with explicit media capability
- `games.js` — Arcade/game launcher integration
- `media.js` — media surfaces
- [`notepad/index.md`](notepad/index.md) — manifest-driven, capability-injected Notepad module
- [`recycle-bin/index.md`](recycle-bin/index.md) — manifest-driven, capability-injected Recycle Bin module
- [`winamp/index.md`](winamp/index.md) — manifest-driven, capability-injected local audio player
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

Legacy apps remain individual `.js` files until migrated deliberately. Manifest-driven apps use one module shape and one shared resolver rather than creating parallel infrastructure.

```text
apps/
├── camera/
├── notepad/
├── recycle-bin/
└── winamp/
    ├── index.md
    ├── manifest.json
    └── src/
        ├── index.js
        ├── app.js
        └── capabilities.js
```

Each migrated module follows the same contract, but its implementation and owned storage remain local. The shared resolver contract lives at `../../../../tests/aizanoi-os-capabilities.test.mjs`; each migrated module has a focused architecture test. Do not create empty module folders merely to make every tree look identical.

## Migration result

Notepad established the first complete boundary: build-time manifest discovery supplies installation state, entry path and requirements; the shell resolves those requirements through `../capabilities.js`; private app logic sees only injected surfaces; lifecycle cleanup owns module resources.

Recycle Bin reuses that same boundary without creating new core services. Its former direct filesystem/dialog imports and no-op cleanup are gone; restore/delete behavior goes through the shared filesystem/dialog/notification/sound capabilities and its owned click listener is removed on teardown.

Winamp reuses the filesystem/notifications/sound surfaces. Workspace Music access is exposed only as `filesystem.musicId`; playlist metadata stays in the module-owned `aizanoi-winamp-playlist-v1` namespace; and click, file-input, seek, audio and volume listeners are deterministically removed during cleanup.

Camera now adds one explicit `media` capability instead of reaching into `navigator.mediaDevices` from private app code. It still requests camera plus microphone permission on Start, remains photo-only/local-only, stores captures through `filesystem.picturesId`, and owns media-track, object-URL and listener teardown.

## Boundary rule

App-private files are private by default. Consumers must use the module public entry or a declared capability rather than reaching into another app's implementation.
