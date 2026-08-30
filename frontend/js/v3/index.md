# AizanoiOS v3 Index

Scope: canonical AizanoiOS browser runtime.

## Canonical owners

- `main.js` — runtime bootstrap
- `registry.js` — single public app/world catalog
- `module-registry.generated.js` — generated installed-module wiring; never a second public catalog and never hand-edited
- `capabilities.js` — shared capability bridge for migrated modules; concrete shared implementations stay behind this boundary
- `shell.js` — canonical window, router, lifecycle and capability-injection host
- `aizanoi-os.js` — desktop interaction primitives
- `brand-platform.js` — Aizanoi Analytics home/dock/device composition
- `store.js` — browser-local shell and field-session state
- [`apps/index.md`](apps/index.md) — lazy public applications
- `workspace/` — current shared workspace/filesystem implementation

## Change routing

- Add/remove/change a migrated manifest-driven app → start at its local `apps/<id>/index.md`, update its manifest/public entry, then regenerate wiring with `node ../../../scripts/modules/build-module-registry.mjs`.
- Add/remove/change a legacy app → start at [`apps/index.md`](apps/index.md), then inspect `registry.js` only as required.
- Change public app metadata/order/search terms → `registry.js`; generated wiring intentionally does not duplicate those catalog fields.
- Change manifest validation/generation → `../../../scripts/modules/`.
- Add/change a shared capability provider → `capabilities.js`; optional app internals must not import the concrete provider directly.
- Change shell/window/dialog/lifecycle or capability injection → `shell.js`.
- Change desktop primitives → `aizanoi-os.js`.
- Change tablet/mobile/brand composition → `brand-platform.js` plus canonical styles named in root `AGENTS.md`.
- Change shared browser-local state → `store.js`.
- Change filesystem/workspace implementation → `workspace/`; keep migrated app consumers behind `capabilities.js`.

## Current modularity state

The runtime still has one shell and one exported public catalog. Migrated modules are discovered at build time from `apps/<id>/manifest.json`; a deterministic generated wiring file supplies installation state, declared requirements and public entry paths to `registry.js`. The browser does not scan directories or need a server-side registry.

Notepad is the first manifest-driven and capability-injected pilot. Its private implementation consumes only its declared `filesystem`, `dialog`, `notifications` and `sound` capability surfaces. The canonical shell resolves those declarations through `capabilities.js` and injects them into the app mount context. Legacy apps remain directly registered until migrated one at a time.

Migration follows `../../../MODULE_CONTRACT.md`:

1. keep one shell and one public catalog;
2. move suitable apps behind self-contained module boundaries one at a time;
3. validate/discover manifests deterministically and keep generated wiring synchronized;
4. inject shared capabilities instead of importing their private implementations;
5. enforce unplug/dependency checks in CI.

## Scope rule

Do not read every file in `v3/` for an app-only change. Enter through `apps/index.md` or the migrated app's local `index.md` and expand to a canonical owner only when the documented dependency requires it.
