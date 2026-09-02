# AizanoiOS Apps Index

Scope: lazy public application modules used by the canonical AizanoiOS registry.

## Current app entries

- [`analytics/index.md`](analytics/index.md) — Analytics launcher surface
- [`browser/index.md`](browser/index.md) — sandboxed HTTPS browser surface
- [`calculator/index.md`](calculator/index.md) — Calculator
- [`camera/index.md`](camera/index.md) — local Camera with explicit media capability
- [`forge/index.md`](forge/index.md) — Aizanoi Forge
- [`games/index.md`](games/index.md) — Aizanoi Arcade launcher and games
- [`journal/index.md`](journal/index.md) — Aizanoi Journal
- [`labs/index.md`](labs/index.md) — Aizanoi Labs
- [`news/index.md`](news/index.md) — Aizanoi News
- [`notepad/index.md`](notepad/index.md) — Notepad
- [`recycle-bin/index.md`](recycle-bin/index.md) — Recycle Bin
- [`videos/index.md`](videos/index.md) — Aizanoi TV
- [`web-editor/index.md`](web-editor/index.md) — single-file browser-local Web Editor with isolated preview runner
- [`winamp/index.md`](winamp/index.md) — local audio player
- [`workspace/index.md`](workspace/index.md) — Workspace UI over the shared filesystem core
- [`worlds/index.md`](worlds/index.md) — Historical Worlds launcher

## Before changing an app

1. Start at that app's local `index.md`.
2. Inspect `../registry.js` only if catalog metadata, launch registration or routing changes.
3. Inspect `../capabilities.js` when the app needs a shared service; do not import concrete shared implementations into app-private code.
4. Do not import private internals from another app.
5. Follow [`../../../../MODULE_CONTRACT.md`](../../../../MODULE_CONTRACT.md) for ownership, dependencies, lifecycle and replacement rules.

## Canonical module shape

Every current public app participates in manifest discovery and owns its private implementation locally:

```text
apps/<id>/
├── index.md
├── manifest.json
├── src/
│   ├── index.js
│   ├── app.js
│   └── capabilities.js  # only when the module validates injected requirements
└── assets/              # optional, only when replaceable with the module
```

Do not create empty folders merely for visual symmetry. The shared Workspace filesystem remains canonical under `../workspace/`, while app consumers reach shared behavior only through declared capabilities.

## Boundary rule

App-private files and module-owned assets are private by default. Consumers must use the module public entry or a declared capability rather than reaching into another app's implementation. Build-time discovery and CI enforce manifest validity, dependency safety, generated registry consistency, module shape and unplug behavior.
