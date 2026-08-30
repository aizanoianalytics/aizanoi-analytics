# Aizanoi Module Contract v1

This contract defines the enforced boundary for independently addable, removable and replaceable AizanoiOS application modules. It complements `ARCHITECTURE.md`; it does not replace the static-first visitor architecture, canonical shell, registry or product contracts.

## Goal

A module behaves like a replaceable component:

- it owns its implementation and local assets;
- it exposes a small public surface;
- it declares what it needs and what it provides;
- consumers do not import its private internals;
- disabling or removing an optional module does not break unrelated modules or the shell;
- an agent can understand the module by reading its local `index.md` before exploring implementation files.

All current public AizanoiOS applications follow this contract. New application work must preserve it rather than reintroducing flat app implementations or private cross-module imports.

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

A module may omit folders it does not need. Do not create empty structure for appearance alone. Repository-level focused tests are valid when they protect shared architecture contracts.

## Manifest v1

Plug-in-style applications use a manifest with an explicit schema version.

Illustrative shape:

```json
{
  "manifestVersion": 1,
  "id": "notepad",
  "type": "desktop-app",
  "entry": "./src/index.js",
  "enabledByDefault": true,
  "requires": ["filesystem", "dialog"],
  "provides": ["desktop-app"]
}
```

Rules:

1. `manifestVersion` is required for manifest discovery.
2. `id` is stable and unique within its registry scope and matches the module directory name.
3. `entry` points only to the module public JavaScript entry, remains inside the module directory and must exist.
4. `requires` names capabilities/contracts, not private implementation paths.
5. `provides` describes public capabilities or extension points.
6. Optional enable/disable state is explicit; absence is not treated as a fatal condition unless the dependency is declared required.
7. Manifest schema changes require a version change or backward-compatible extension.
8. Manifest discovery is build-time only. The visitor runtime must not crawl directories, fetch manifest files to construct the catalog, or require a server-side module registry.

## Static discovery and generated wiring

AizanoiOS app manifests are discovered by `scripts/modules/build-module-registry.mjs` from `frontend/js/v3/apps/<module-id>/manifest.json`.

The generator produces `frontend/js/v3/module-registry.generated.js`, which is committed and served as a normal static browser module. It contains installation state, declared capabilities and public entry paths only.

The generated wiring is **not** a second public app catalog:

- `frontend/js/v3/registry.js` remains the canonical owner of public labels, descriptions, ordering, groups, icons and search metadata;
- generated wiring tells that registry whether a module is installed/enabled and which public entry to launch;
- a disabled or absent module is omitted from the public catalog instead of becoming a broken launcher;
- generated wiring is never hand-edited;
- CI runs `node scripts/modules/build-module-registry.mjs --check` and fails when manifests are invalid or generated wiring is stale.

Because the canonical registry imports the generated wiring, the generated file is part of the offline shell dependency chain and remains covered by service-worker browser tests.

Adding a completely new public application intentionally has two declarative steps: add its module/manifest and add its public presentation metadata to the single canonical `registry.js` catalog. This keeps installation mechanics separate from human-authored product ordering/copy without coupling consumers to private implementation paths. Removing or disabling an existing optional module requires no unrelated implementation edits; regeneration removes its installed wiring and the registry filters its public launcher.

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

Dependencies form a directed acyclic graph wherever practical.

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

Cross-module behavior uses a declared capability, event, public adapter or registry contract instead of a private import.

## Capability injection

Applications do not need to know which concrete implementation provides filesystem, dialogs, window lifecycle, media, storage or similar shared services.

Canonical style:

```js
export function createApp(context) {
  const filesystem = context.capabilities.filesystem;
  const dialog = context.capabilities.dialog;
}
```

Zero-capability modules declare `requires: []`. Modules needing host behavior receive only declared surfaces through the canonical resolver. Do not create a second shell or duplicate service implementation to make a module self-contained.

## Ownership and storage

Each module owns:

- its private implementation;
- module-specific assets;
- module-specific persistent keys/namespaces;
- focused tests and fixtures where applicable;
- its local `index.md` and manifest.

A module must not silently write into another module's storage namespace. Shared state requires an explicit shared contract.

## Enable, disable and remove semantics

For optional modules, these states are distinct:

- **installed + enabled** — discoverable and usable;
- **installed + disabled** — code may exist, but the public catalog must not expose or launch it;
- **not installed** — discovery and generated wiring tolerate absence; the canonical registry must not expose a launcher with no installed module behind it.

Removing an optional module removes its generated registration, launcher/search presence and owned assets without requiring unrelated module implementation edits. Regenerating committed wiring after manifest install/remove is part of that operation.

## Cleanup contract

A module that registers listeners, timers, media streams, observers, asynchronous loads or temporary resources must release or invalidate them when its lifecycle ends. Replaceability requires deterministic teardown as well as deterministic startup.

## Navigation contract

Every independently replaceable module has a local `index.md` containing only the information needed to route work:

- purpose;
- public entry points;
- declared dependencies/capabilities;
- owned storage/assets;
- relevant tests;
- explicit private boundaries;
- links to deeper files only when needed.

Agents enter through that file rather than recursively reading the module.

## Enforced architecture guards

CI currently enforces:

1. manifest schema validation;
2. unique module ids;
3. declared dependency/capability validation;
4. no cross-module private imports;
5. no dependency cycles;
6. generated registry consistency;
7. per-module unplug discovery/wiring simulation;
8. public-entry containment (`src/index.js`);
9. product, security, service-worker and browser regression gates;
10. focused module lifecycle/ownership tests for migrated applications.

Architecture checks are quality gates. Do not weaken them merely to make CI green. Narrow compatibility exceptions must name and lock the exact legacy assets they protect rather than exempting an open directory or module.

## Migration phases — completed baseline

### Phase 1 — navigation and contract — completed

Repository and area `index.md` routers, this Module Contract and token-efficient agent navigation were introduced without runtime behavior changes.

### Phase 2 — pilot module — completed

Notepad established the first self-contained manifest module with one public entry, private implementation, capability adapter and deterministic lifecycle cleanup while preserving the canonical shell.

### Phase 3 — manifest discovery — completed

Validated manifests and deterministic committed module wiring feed the single canonical public registry. Discovery is build-time/static-first; CI rejects invalid manifests and stale generated wiring.

### Phase 4 — capability boundary — completed

Current applications that need shared host behavior consume declared injected capability contracts rather than importing concrete shared implementations. Dependency validation rejects undeclared or unavailable requirements.

### Phase 5 — current public application migration — completed

All current public AizanoiOS applications live behind module directories with manifests and `src/index.js` public entries. Shared product hubs and flat app implementations have been retired; module-specific assets/storage move with their owners where applicable.

### Phase 6 — architecture CI — completed

Dependency boundaries, cycles, private imports, generated consistency and per-module unplug behavior are mandatory regression checks in the top-level CI suite.

Future modules extend this baseline. They do not restart or bypass these phases.

## Non-goals

This contract does **not** authorize:

- a Node/Express visitor runtime;
- npm workspaces merely for organizational symmetry;
- a second window manager, router, registry or filesystem implementation;
- runtime directory/manifest crawling to build the visitor app catalog;
- public Hermes/private-agent execution;
- unnecessary abstraction of stable, non-replaceable code;
- converting every folder into a module;
- moving canonical public product ordering/copy into generated wiring merely to claim zero-touch installation.

Modularity exists to reduce coupling and replacement cost, not to maximize folder count or abstraction count.
