# Aizanoi Module Contract v1

This contract defines the target boundary for independently addable, removable and replaceable repository modules. It complements `ARCHITECTURE.md`; it does not replace the static-first visitor architecture, canonical shell, registry or product contracts.

## Goal

A module should behave like a replaceable component:

- it owns its implementation and local assets;
- it exposes a small public surface;
- it declares what it needs and what it provides;
- consumers do not import its private internals;
- disabling or removing an optional module must not break unrelated modules or the shell;
- an agent should be able to understand the module by reading its local `index.md` before exploring implementation files.

This is the direction of travel. Existing code may temporarily violate parts of this contract while it is migrated in controlled phases.

## Target module shape

```text
module-name/
├── index.md          # short router and ownership map
├── manifest.json     # machine-readable identity/capabilities/dependencies
├── src/
│   └── index.js      # public runtime entry when applicable
├── assets/           # module-owned assets when applicable
└── tests/            # module-local tests when applicable
```

A module may omit folders it does not need. Do not create empty structure for appearance alone.

## Manifest v1

New plug-in-style modules should converge on a manifest with an explicit schema version.

Illustrative shape:

```json
{
  "manifestVersion": 1,
  "id": "notepad",
  "type": "desktop-app",
  "entry": "./src/index.js",
  "enabledByDefault": true,
  "requires": ["filesystem", "dialog", "window-manager"],
  "provides": ["desktop-app"]
}
```

Rules:

1. `manifestVersion` is required once a module is migrated to manifest discovery.
2. `id` is stable and unique within its registry scope and matches the module directory name.
3. `entry` points only to the module public JavaScript entry, remains inside the module directory and must exist.
4. `requires` names capabilities/contracts, not private implementation paths.
5. `provides` describes public capabilities or extension points.
6. Optional enable/disable state is explicit; absence is not treated as a fatal condition unless the dependency is declared required.
7. Manifest schema changes require a version change or backward-compatible extension.
8. Manifest discovery is build-time only. The visitor runtime must not crawl directories, fetch manifest files to construct the catalog, or require a server-side module registry.

## Static discovery and generated wiring

Migrated AizanoiOS app manifests are discovered by `scripts/modules/build-module-registry.mjs` from `frontend/js/v3/apps/<module-id>/manifest.json`.

The generator produces `frontend/js/v3/module-registry.generated.js`, which is committed and served as a normal static browser module. It contains installation state, declared capabilities and public entry paths only.

The generated wiring is **not** a second public app catalog:

- `frontend/js/v3/registry.js` remains the canonical owner of public labels, descriptions, ordering, groups, icons and search metadata;
- generated wiring tells that registry whether a migrated module is installed/enabled and which public entry to launch;
- a disabled or absent migrated module is omitted from the public catalog instead of becoming a broken launcher;
- generated wiring is never hand-edited;
- CI runs `node scripts/modules/build-module-registry.mjs --check` and fails when manifests are invalid or generated wiring is stale.

Because the canonical registry imports the generated wiring, the generated file is part of the offline shell dependency chain and must remain covered by service-worker browser tests.

## Public vs private boundary

Only documented module entry points are public. Everything else is private by default.

Allowed direction:

```text
consumer -> module public entry / declared capability
```

Disallowed direction:

```text
consumer -> module private source file
module A  -> module B private source file
app       -> concrete core implementation when a capability contract exists
```

A filename being importable by the browser does not make it a public API.

## Dependency direction

Dependencies must form a directed acyclic graph wherever practical.

Preferred direction:

```text
modules -> shared contracts/capabilities -> canonical core
```

Avoid:

```text
core -> optional module internals
module A <-> module B
module -> unrelated product internals
```

Cross-module behavior should use a declared capability, event, public adapter or registry contract instead of a private import.

## Capability injection

Optional applications should not need to know which concrete implementation provides filesystem, dialogs, window lifecycle, media, camera, storage or similar shared services.

Target style:

```js
export function createApp(context) {
  const filesystem = context.capabilities.filesystem;
  const dialog = context.capabilities.dialog;
}
```

The exact API will be introduced incrementally. Existing direct imports are migration candidates, not reasons to create a second shell or duplicate service implementation.

## Ownership and storage

Each module owns:

- its private implementation;
- module-specific assets;
- module-specific persistent keys/namespaces;
- local tests and fixtures;
- its local `index.md` and manifest once migrated.

A module must not silently write into another module's storage namespace. Shared state requires an explicit shared contract.

## Enable, disable and remove semantics

For optional modules, these states are distinct:

- **installed + enabled** — discoverable and usable;
- **installed + disabled** — code may exist, but the public catalog must not expose or launch it;
- **not installed** — discovery and generated wiring tolerate absence; the canonical registry must not expose a migrated launcher with no installed module behind it.

Removing an optional module should remove its generated registration, launcher/search presence and owned assets without requiring unrelated module implementation edits. Regenerating committed wiring after manifest install/remove is part of that operation.

## Cleanup contract

A module that registers listeners, timers, media streams, observers or temporary resources must release them when its lifecycle ends. Replaceability requires deterministic cleanup, not only deterministic startup.

## Navigation contract

Every independently replaceable module should eventually have a local `index.md` containing only:

- purpose;
- public entry points;
- declared dependencies/capabilities;
- owned storage/assets;
- relevant tests;
- explicit private boundaries;
- links to deeper files only when needed.

Agents should enter through that file rather than recursively reading the module.

## Automated architecture guards

The target CI guard set is:

1. manifest schema validation;
2. unique module ids;
3. declared dependency/capability validation;
4. no cross-module private imports;
5. no dependency cycles;
6. generated registry consistency;
7. optional-module disable/remove smoke tests;
8. existing product, security and browser regression tests.

Manifest validation and generated-wiring consistency become mandatory in Phase 3. The remaining dependency/private-import/unplug guards are added incrementally as the capability boundary and additional modules are migrated.

Architecture checks are quality gates. Do not weaken them merely to make CI green.

## Migration phases

### Phase 1 — navigation and contract

Completed: repository and area `index.md` routers, this Module Contract and token-efficient agent navigation were introduced without runtime behavior changes.

### Phase 2 — pilot module

Completed: Notepad was migrated into a self-contained module with a manifest, one public entry, private implementation, capability adapter and deterministic listener cleanup while preserving the canonical shell.

### Phase 3 — manifest discovery

Validated manifests and deterministic committed module wiring feed the single canonical public registry. Discovery remains build-time/static-first; CI rejects invalid manifests and stale generated wiring.

### Phase 4 — capability boundary

Replace direct optional-app imports of concrete shared implementations with injected capability contracts.

### Phase 5 — remaining modules

Move Camera, Winamp, Recycle Bin and other suitable applications one at a time. Do not perform a risky all-at-once rewrite.

### Phase 6 — architecture CI

Make dependency-boundary, cycle, private-import and unplug tests mandatory across the migrated module set.

## Non-goals

This contract does **not** authorize:

- a Node/Express visitor runtime;
- npm workspaces merely for organizational symmetry;
- a second window manager, router, registry or filesystem implementation;
- runtime directory/manifest crawling to build the visitor app catalog;
- public Hermes/private-agent execution;
- unnecessary abstraction of stable, non-replaceable code;
- converting every folder into a module.

Modularity exists to reduce coupling and replacement cost, not to maximize folder count.
