# Module Discovery

Scope: build-time validation, dependency guards and deterministic wiring for manifest-driven AizanoiOS modules.

## Entry

- Generator / validator → `build-module-registry.mjs`
- Module contract → `../../MODULE_CONTRACT.md`
- Generated browser wiring → `../../frontend/js/v3/module-registry.generated.js`
- Mandatory boundary/unplug guards → `../../tests/aizanoi-os-module-boundaries.test.mjs`
- Discovery/dependency graph tests → `../../tests/aizanoi-os-module-discovery.test.mjs`

## Source and output

Source manifests are discovered only at `frontend/js/v3/apps/<module-id>/manifest.json`.

The generated file is committed so the static visitor runtime never needs filesystem discovery or a server-side registry. `registry.js` remains the single public app catalog; generated wiring only tells it which migrated modules are installed/enabled and what public entry each exposes.

## Capability and dependency contract

`build-module-registry.mjs` owns the v1 platform-capability id list used by manifest validation. Current shared/host capability ids are `apps`, `dialog`, `filesystem`, `media`, `notifications` and `sound`.

- `apps` is the narrow application-navigation facade backed by canonical `AIZANOI_OS.openApp`; it is not the full shell `appApi` object.
- capability consumers receive only names declared in their manifest.

Discovery fails before registry generation when a module:

- requires a capability that neither the platform nor one module provides;
- requires a module-provided capability with multiple ambiguous providers;
- participates in a module dependency cycle.

A future capability addition must update the contract deliberately; do not accept arbitrary requirement strings merely to make a manifest pass.

## Architecture guards

The mandatory top-level regression suite also checks that:

- migrated modules never import another module's private source;
- migrated modules never bypass capability injection with direct Workspace implementation imports;
- canonical app metadata addresses migrated apps through `moduleId` and filters absent/disabled modules;
- every currently migrated optional module can be removed from a temporary discovery tree while all unrelated module wiring remains intact;
- each module public source entry stays `src/index.js`.

These are replacement-safety tests, not style lint. Do not weaken them to accommodate a shortcut.

## Commands

- Regenerate: `node scripts/modules/build-module-registry.mjs`
- Validate without writing: `node scripts/modules/build-module-registry.mjs --check`
- Run architecture guards: `node --test tests/aizanoi-os-module-discovery.test.mjs tests/aizanoi-os-module-boundaries.test.mjs`

CI must use `--check` and the top-level regression suite. A stale generated file, invalid manifest, duplicate id, escaped/missing public entry, invalid dependency graph, private cross-import or failed unplug simulation is a build failure.
