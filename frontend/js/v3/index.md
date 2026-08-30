# AizanoiOS v3 Index

Scope: canonical AizanoiOS browser runtime.

## Canonical owners

- `main.js` — runtime bootstrap
- `registry.js` — single public app/world catalog
- `shell.js` — canonical window, router and dialog lifecycle
- `aizanoi-os.js` — desktop interaction primitives
- `brand-platform.js` — Aizanoi Analytics home/dock/device composition
- `store.js` — browser-local shell and field-session state
- [`apps/index.md`](apps/index.md) — lazy public applications
- `workspace/` — current shared workspace/filesystem implementation

## Change routing

- Add/remove/change a public app → start at [`apps/index.md`](apps/index.md), then inspect `registry.js` only as required by the current manual registry.
- Change shell/window/dialog behavior → `shell.js`.
- Change desktop primitives → `aizanoi-os.js`.
- Change tablet/mobile/brand composition → `brand-platform.js` plus canonical styles named in root `AGENTS.md`.
- Change shared browser-local state → `store.js`.
- Change filesystem/workspace implementation → `workspace/`; preserve callers until a capability boundary is introduced.

## Modularity direction

The current runtime uses a manual single registry and some applications still import concrete shared implementations. Do not create parallel infrastructure to solve this.

Migration follows `../../../MODULE_CONTRACT.md`:

1. keep one shell and one public catalog;
2. move suitable apps behind self-contained module boundaries one at a time;
3. introduce manifest discovery deterministically;
4. inject shared capabilities instead of importing their private implementations;
5. enforce unplug/dependency checks in CI.

## Scope rule

Do not read every file in `v3/` for an app-only change. Enter through `apps/index.md` and expand to a canonical owner only when the app's documented dependency requires it.