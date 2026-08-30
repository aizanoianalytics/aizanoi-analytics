# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app entries

- `brand-hubs.js` — public brand/product hub surfaces
- `calculator.js` — Calculator
- `camera.js` — Camera
- `games.js` — Arcade/game launcher integration
- `media.js` — media surfaces
- [`notepad/index.md`](notepad/index.md) — manifest-driven, capability-injected Notepad module
- [`recycle-bin/index.md`](recycle-bin/index.md) — manifest-driven, capability-injected Recycle Bin module
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

Legacy apps are still individual `.js` files and some directly depend on shared concrete implementations. Migrated apps use the manifest/module shape below instead of adding parallel infrastructure.

```text
apps/
├── notepad/
│   ├── index.md
│   ├── manifest.json
│   └── src/
│       ├── index.js
│       ├── app.js
│       └── capabilities.js
└── recycle-bin/
    ├── index.md
    ├── manifest.json
    └── src/
        ├── index.js
        ├── app.js
        └── capabilities.js
```

The shared resolver contract lives at `../../../../tests/aizanoi-os-capabilities.test.mjs`; each migrated module has a focused architecture test. Do not create empty module folders merely to make every tree look identical.

## Migration result

Notepad established the first complete boundary: build-time manifest discovery supplies installation state, entry path and requirements; the shell resolves those requirements through `../capabilities.js`; private app logic sees only injected surfaces; lifecycle cleanup owns module resources.

Recycle Bin now reuses that same boundary without creating new core services. Its former direct filesystem/dialog imports and no-op cleanup are gone; restore/delete behavior goes through the shared filesystem/dialog/notification/sound capabilities and its owned click listener is removed on teardown.

Winamp is the next low-risk migration candidate because it can reuse filesystem, notifications and sound. Camera should follow after Winamp because camera/microphone permission and media-track teardown introduce a new media capability and stronger cleanup requirements.

## Boundary rule

App-private files are private by default. Consumers must use the module public entry or a declared capability rather than reaching into another app's implementation.
