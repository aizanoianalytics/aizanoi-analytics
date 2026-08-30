# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app entries

- [`analytics/index.md`](analytics/index.md) — manifest-driven Analytics launcher surface with no shared capabilities
- [`calculator/index.md`](calculator/index.md) — manifest-driven Calculator with injected sound
- [`camera/index.md`](camera/index.md) — manifest-driven Camera with explicit media capability
- [`forge/index.md`](forge/index.md) — manifest-driven Forge surface with narrow app navigation to Historical Worlds
- [`games/index.md`](games/index.md) — zero-capability Aizanoi Arcade module owning its launcher, local scores and playable game assets
- [`journal/index.md`](journal/index.md) — zero-capability long-form Journal surface
- [`labs/index.md`](labs/index.md) — Labs surface with narrow app navigation to Arcade
- [`news/index.md`](news/index.md) — manifest-driven Aizanoi News reading its own static publication feed
- [`videos/index.md`](videos/index.md) — manifest-driven Aizanoi TV with narrow app navigation
- [`notepad/index.md`](notepad/index.md) — manifest-driven, capability-injected Notepad module
- [`recycle-bin/index.md`](recycle-bin/index.md) — manifest-driven, capability-injected Recycle Bin module
- [`winamp/index.md`](winamp/index.md) — manifest-driven, capability-injected local audio player
- [`workspace/index.md`](workspace/index.md) — manifest-driven Workspace UI over the shared filesystem core
- [`worlds/index.md`](worlds/index.md) — manifest-driven Historical Worlds index over the shared catalog/session/router

## Before changing an app

1. If the app has a local `index.md`, read that first; otherwise read the app file only.
2. Inspect `../registry.js` only if catalog metadata, launch registration or routing changes.
3. Inspect `../capabilities.js` when a migrated app needs a shared service; do not import the concrete implementation into app-private code.
4. Inspect a shared implementation only when changing the capability provider itself or a legacy caller that has not yet migrated.
5. Do not import private internals from another app.
6. Follow `../../../../MODULE_CONTRACT.md` for new boundaries and migration work.

## Current structure

Manifest-driven apps use one module shape and one shared resolver rather than creating parallel infrastructure.

```text
apps/
├── analytics/
├── calculator/
├── camera/
├── forge/
├── games/
├── journal/
├── labs/
├── news/
├── notepad/
├── recycle-bin/
├── videos/
├── winamp/
├── workspace/
└── worlds/
    ├── index.md
    ├── manifest.json
    └── src/
        ├── index.js
        ├── app.js
        └── capabilities.js  # only when the module has injected requirements
```

A module may additionally own local `assets/` when those assets are replaceable with the module, as Arcade does. Each migrated module follows the same contract, but its implementation, assets and owned storage remain local. The shared resolver contract lives at `../../../../tests/aizanoi-os-capabilities.test.mjs`; each migrated module has a focused architecture test. Do not create empty module folders merely to make every tree look identical.

## Migration result

Notepad established the first complete boundary: build-time manifest discovery supplies installation state, entry path and requirements; the shell resolves those requirements through `../capabilities.js`; private app logic sees only injected surfaces; lifecycle cleanup owns module resources.

Recycle Bin reuses that same boundary without creating new core services. Its former direct filesystem/dialog imports and no-op cleanup are gone; restore/delete behavior goes through the shared filesystem/dialog/notification/sound capabilities and its owned click listener is removed on teardown.

Winamp reuses the filesystem/notifications/sound surfaces. Workspace Music access is exposed only as `filesystem.musicId`; playlist metadata stays in the module-owned `aizanoi-winamp-playlist-v1` namespace; and click, file-input, seek, audio and volume listeners are deterministically removed during cleanup.

Camera adds one explicit `media` capability instead of reaching into `navigator.mediaDevices` from private app code. It still requests camera plus microphone permission on Start, remains photo-only/local-only, stores captures through `filesystem.picturesId`, and owns media-track, object-URL and listener teardown.

Calculator is dependency-light: it declares only `sound`, owns no persistent storage, and removes both its container click listener and document keyboard listener during cleanup.

Aizanoi TV declares only `apps`. Its companion links use the narrow `apps.open()` facade rather than the full shell API, and the former shared `media.js` entry is retired.

Workspace UI declares `apps`, `filesystem`, `notifications` and `sound`. The IndexedDB filesystem core stays canonical under `../workspace/fs.js`; private Workspace UI code no longer imports it. Listener, action-menu, focus-restore and temporary download object-URL resources are module-owned and cleaned up on close.

Historical Worlds declares only `worlds`. Its private UI receives a frozen catalog plus `currentSession()` and `launch()` instead of importing the canonical registry/store or receiving the full shell API.

Aizanoi News is a zero-capability content module. It owns the `/news/index.json` fetch and feed rendering that previously lived inside the retired shared hub.

Analytics is also zero-capability. It owns only the AizanoiOS HR Analytics launcher surface; the actual dashboard product and deterministic build pipeline remain in their canonical `frontend/analytics/` and repo pipeline locations.

Aizanoi Forge declares only `apps`. It owns the branded source/project catalog and canonical GitHub link; Historical Worlds navigation goes through `apps.open()` rather than the full shell API.

Aizanoi Journal is a zero-capability surface and owns its long-form desk presentation independently.

Aizanoi Labs declares only `apps`. It owns experimental/prototype presentation and reaches Arcade only through `apps.open()`; playable game implementation stays owned by Arcade.

Aizanoi Arcade keeps the stable `games` id and is zero-capability. Its launcher, five game assets and `aizanoi-games` local score namespace now move together under `apps/games/`; the old flat launcher and shared `frontend/games/` asset paths are retired.

The former `brand-hubs.js` shared implementation is retired. News, Analytics, Forge, Journal and Labs now have independent module ownership instead of one cross-product source file.

## Boundary rule

App-private files and module-owned assets are private by default. Consumers must use the module public entry or a declared capability rather than reaching into another app's implementation.
