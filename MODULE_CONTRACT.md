# Aizanoi Module Contract v1

This contract defines the enforced boundary for independently addable, removable and replaceable repository modules. It complements `ARCHITECTURE.md`; it does not replace the static-first visitor architecture, canonical shell, registry or product contracts.

## Goal

A replaceable module:

- owns its implementation and module-specific assets/state;
- exposes one small public entry surface;
- declares what capabilities it requires and provides;
- does not consume another module's private internals;
- does not import a concrete shared implementation when a capability contract exists;
- can be disabled or removed without breaking unrelated modules or the shell;
- can be understood by entering through its local `index.md` rather than recursively scanning the repository.

The repository now enforces this contract for manifest-driven AizanoiOS modules. Legacy surfaces remain outside the manifest set until they are migrated deliberately.

## Current module shape

```text
module-name/
├── index.md          # short router, ownership and boundary map
├── manifest.json     # machine-readable identity/capabilities
└── src/
    ├── index.js      # only public runtime entry
    ├── app.js        # private app behavior
    └── capabilities.js # optional private narrowing adapter
```

Modules may add owned assets or local tests when needed. Do not create empty folders merely for symmetry.

## Manifest v1

Current shape:

```json
{
  "manifestVersion": 1,
  "id": "notepad",
  "type": "desktop-app",
  "entry": "./src/index.js",
  "enabledByDefault": true,
  "requires": ["dialog", "filesystem", "notifications", "sound"],
  "provides": ["desktop-app"]
}
```

Rules:

1. `manifestVersion` is required and currently equals `1`.
2. `id` is stable, unique, lowercase kebab-case and matches the module directory name.
3. `entry` points to the module public JavaScript entry, stays inside the module directory and must exist.
4. `requires` names declared capability ids, never implementation paths.
5. `provides` names public capabilities or extension points.
6. `enabledByDefault` makes installed/enabled state explicit.
7. Manifest schema changes require a version change or backward-compatible extension.
8. Discovery is build-time only. The visitor runtime does not crawl directories or fetch manifests to construct the app catalog.

## Static discovery and generated wiring

`scripts/modules/build-module-registry.mjs` discovers manifests only from:

`frontend/js/v3/apps/<module-id>/manifest.json`

It generates the committed static browser file:

`frontend/js/v3/module-registry.generated.js`

Generated wiring contains installation state, public entry paths and declared capability metadata. It is **not** a second public product catalog.

- `frontend/js/v3/registry.js` remains the canonical owner of public ids, labels, descriptions, ordering, groups, icons, aliases and search metadata.
- Migrated public apps are addressed by `moduleId`, then resolved through generated wiring.
- Disabled or absent migrated modules are filtered out rather than becoming broken launchers.
- Generated wiring is never hand-edited.
- CI runs `node scripts/modules/build-module-registry.mjs --check` and rejects invalid manifests or stale output.

Because the canonical registry imports generated wiring, that file remains inside the ordinary static/offline shell dependency chain and existing browser/service-worker regression coverage.

## Current platform capabilities

Manifest dependency validation currently recognizes these platform capability ids:

- `apps` — narrow public app navigation: `apps.open(appId, options)`;
- `dialog` — shared confirmation/dialog surface;
- `filesystem` — narrowed Workspace filesystem operations and stable folder ids;
- `media` — browser media availability and `getUserMedia`;
- `notifications` — shell-owned notification surface;
- `sound` — shared UI sound playback.

Adding a platform capability is an architecture change. Update the resolver, generator contract and tests deliberately; do not accept arbitrary requirement strings just to make a manifest pass.

### Capability boundary

The shell resolves only capabilities declared by the module manifest. Public module entry code may receive the host launch envelope, but private module behavior must be narrowed to the declared surfaces rather than receiving the full shell API.

Example:

```js
export async function mount({ container, capabilities }) {
  const app = createApp({
    filesystem: capabilities.filesystem,
    notifications: capabilities.notifications,
  });
  return app.mount(container);
}
```

For app-to-app navigation, the allowed direction is:

```text
module private code
  -> capabilities.apps.open(...)
  -> canonical AIZANOI_OS.openApp(...)
  -> shell
```

Do not create a second router, event bus, dependency container, filesystem or window manager.

## Public vs private boundary

Only documented module public entries are public. Everything under a module is private by default unless its local `index.md` explicitly says otherwise.

Allowed:

```text
consumer -> module public entry
module private code -> declared capability
```

Disallowed:

```text
consumer -> module private source file
module A  -> module B private source file
module    -> workspace/* concrete implementation when a capability exists
module    -> unrelated product internals
```

A browser-importable filename is not automatically a public API.

## Dependency direction

Module dependencies must remain acyclic.

Preferred direction:

```text
optional modules
  -> declared capabilities
  -> canonical shared/core implementations
```

Avoid:

```text
core -> optional module private internals
module A <-> module B
optional module -> concrete shared implementation
```

The generator rejects unavailable required capabilities, ambiguous module capability providers and dependency cycles before generated wiring is accepted.

## Ownership and storage

A migrated module owns:

- its private implementation;
- module-specific assets when applicable;
- module-specific persistent keys/namespaces;
- lifecycle cleanup for listeners, timers, media streams, observers and temporary resources;
- its local `index.md` and manifest;
- focused architecture/regression tests where behavior warrants them.

A module must not silently write into another module's storage namespace. Shared state requires an explicit shared contract.

## Enable, disable and remove semantics

These states are distinct:

- **installed + enabled** — discoverable and launchable;
- **installed + disabled** — code exists but the public catalog does not expose it;
- **not installed** — discovery tolerates absence and unrelated generated wiring survives.

Removing an optional module means removing its module directory and regenerating committed wiring. It must not require edits to unrelated module implementations.

CI simulates removing every migrated module from a temporary module tree and verifies that all unrelated discovered/generated module wiring remains valid.

## Mandatory architecture guards

The manifest-driven module set is protected by mandatory CI checks for:

1. manifest schema and public-entry validation;
2. unique module ids;
3. declared capability availability;
4. ambiguous capability providers;
5. dependency cycles;
6. generated registry consistency;
7. canonical `moduleId` catalog wiring;
8. cross-module private imports;
9. direct Workspace implementation bypasses from migrated modules;
10. per-module unplug/remove simulation;
11. existing product, security, audit, Lighthouse and browser regressions.

Architecture checks are quality gates. Do not weaken them merely to make CI green.

## Current migrated AizanoiOS modules

The manifest-driven set currently consists of:

- `notepad` — filesystem/dialog/notifications/sound;
- `recycle-bin` — filesystem/dialog/notifications/sound;
- `winamp` — filesystem/notifications/sound, with module-owned playlist state;
- `camera` — filesystem/media/notifications/sound, including deterministic media-track/object-URL cleanup;
- `calculator` — sound only;
- `videos` — apps only; Aizanoi TV opens companion apps through the narrow navigation capability.

Each is resolved through the same generator, registry and capability boundary rather than having custom infrastructure.

## Deliberately unmigrated surfaces

Do not convert legacy files merely to increase the module count.

- `games.js` / Arcade: the launcher is simple, but playable scripts/assets are still owned under shared `frontend/games/`. Resolve asset ownership before calling the launcher independently replaceable.
- `workspace.js`: the UI sits directly on the canonical filesystem core and opens other apps. Separate the Workspace UI boundary from filesystem-core ownership before migration.
- `worlds.js`: it consumes canonical world registry and field-session state. Introduce only the minimal world/session capability if migration actually reduces coupling.
- `brand-hubs.js`: one implementation currently serves several public product ids. Decompose only when those products gain independent ownership/behavior; do not manufacture wrapper modules around the same shared private implementation.

Stable legacy surfaces may remain plain `.js` files indefinitely when replacement value is low.

## Navigation contract

Every independently replaceable module has a local `index.md` containing only high-signal routing information:

- purpose;
- public entry;
- declared dependencies/capabilities;
- owned state/assets;
- cleanup expectations;
- relevant tests;
- private boundaries.

Agents should enter through that file first. Repository and area `index.md` files remain routers, not encyclopedias.

## Migration phases — implementation status

### Phase 1 — navigation and contract — completed

Repository/area routers, this contract and token-efficient agent navigation are established.

### Phase 2 — pilot module — completed

Notepad proved the complete manifest/public-entry/private-code/capability/cleanup pattern.

### Phase 3 — static manifest discovery — completed

Build-time discovery, committed deterministic wiring and stale-wiring CI validation are active.

### Phase 4 — capability boundary — completed for the migrated set

Migrated modules no longer consume concrete Workspace implementations directly. Shared and host services are declared and injected. New capability boundaries are added only when a real migration requires them.

### Phase 5 — suitable app migrations — ongoing by design

Recycle Bin, Winamp, Camera, Calculator and Aizanoi TV followed the Notepad pattern. Remaining legacy surfaces are migrated only where ownership and replacement value are real; there is no bulk-conversion target.

### Phase 6 — architecture CI — completed and mandatory

Dependency, cycle, private-import, canonical-catalog and unplug/remove guards are part of the top-level CI gate for the manifest-driven set.

## Non-goals

This contract does **not** authorize:

- a Node/Express visitor runtime;
- npm workspaces merely for organizational symmetry;
- a second window manager, router, registry, filesystem or dependency container;
- runtime manifest/directory crawling;
- public Hermes/private-agent execution;
- unnecessary abstraction of stable code;
- converting every folder or every app into a module;
- moving shared assets into a module without first establishing true ownership.

Modularity exists to reduce coupling and replacement cost, not to maximize folder count.