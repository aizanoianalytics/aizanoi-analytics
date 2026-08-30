# Module Discovery

Scope: build-time validation and deterministic wiring for manifest-driven AizanoiOS modules.

## Entry

- Generator / validator → `build-module-registry.mjs`
- Module contract → `../../MODULE_CONTRACT.md`
- Generated browser wiring → `../../frontend/js/v3/module-registry.generated.js`

## Source and output

Source manifests are discovered only at `frontend/js/v3/apps/<module-id>/manifest.json`.

The generated file is committed so the static visitor runtime never needs filesystem discovery or a server-side registry. `registry.js` remains the single public app catalog; generated wiring only tells it which migrated modules are installed/enabled and what public entry each exposes.

## Commands

- Regenerate: `node scripts/modules/build-module-registry.mjs`
- Validate without writing: `node scripts/modules/build-module-registry.mjs --check`

CI must use `--check`. A stale generated file, invalid manifest, duplicate id, escaped entry path or missing public entry is a build failure.
