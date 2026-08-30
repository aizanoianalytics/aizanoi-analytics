# AizanoiOS v3 Index

Scope: canonical AizanoiOS browser runtime.

## Canonical owners

- `main.js` — runtime bootstrap
- `registry.js` — single human-authored public app/world catalog: labels, ordering, groups, icons and search metadata
- `module-registry.generated.js` — generated installed-module wiring: enabled state, public entry and declared requirements; never a second public catalog and never hand-edited
- `capabilities.js` — shared capability bridge; concrete shared implementations stay behind this boundary
- `shell.js` — canonical window, router, lifecycle and capability-injection host
- `aizanoi-os.js` — desktop interaction primitives
- `brand-platform.js` — Aizanoi Analytics home/dock/device composition
- `store.js` — browser-local shell and field-session state
- [`apps/index.md`](apps/index.md) — all current lazy public application modules
- `workspace/` — canonical shared workspace/filesystem implementation

## Change routing

- Add/remove/change an application implementation → start at its local `apps/<id>/index.md`, update its manifest/public entry as needed, then regenerate wiring with `node ../../../scripts/modules/build-module-registry.mjs`.
- Add a brand-new public app → create the module/manifest and add its human-authored public presentation row to `registry.js`; do not put labels/order/icons into generated wiring.
- Remove/disable an existing optional app → remove/disable its manifest/module and regenerate wiring; `registry.js` filters absent/disabled modules so unrelated implementations do not need edits.
- Change public app metadata/order/search terms → `registry.js`.
- Change manifest validation/generation → `../../../scripts/modules/`.
- Add/change a shared capability provider → `capabilities.js`; app internals must not import the concrete provider directly.
- Change shell/window/dialog/lifecycle or capability injection → `shell.js`.
- Change desktop primitives → `aizanoi-os.js`.
- Change tablet/mobile/brand composition → `brand-platform.js` plus canonical styles named in root `AGENTS.md`.
- Change shared browser-local state → `store.js`.
- Change filesystem/workspace implementation → `workspace/`; app consumers stay behind `capabilities.js`.

## Current modularity state

AizanoiOS has one canonical shell and one canonical public catalog. **All current public applications are manifest-driven modules** under `apps/<id>/` with a local `index.md`, `manifest.json` and `src/index.js` public entry.

Build-time discovery reads those manifests and deterministically generates `module-registry.generated.js`. The browser never scans directories or fetches manifests to assemble the app set. `registry.js` combines its human-authored product metadata with generated installed/enabled/entry/requirements wiring and drops an absent or disabled optional module instead of exposing a broken launcher.

Shared host behavior is injected through declared capabilities. Zero-capability products declare no requirements. Module-private source and module-owned assets remain private by default, and CI checks cross-module imports, dependency cycles, generated consistency and unplug behavior.

The stable baseline is defined by `../../../MODULE_CONTRACT.md`:

1. one shell and one public catalog;
2. module-directory ownership for every current public app;
3. deterministic build-time manifest discovery and committed static wiring;
4. declared capability injection instead of private implementation imports;
5. deterministic cleanup/invalidation of module-owned resources;
6. mandatory dependency, private-import, cycle and unplug regression guards.

## Scope rule

Do not read every file in `v3/` for an app-only change. Enter through `apps/index.md` or the app's local `index.md` and expand to a canonical owner only when the documented dependency requires it.
