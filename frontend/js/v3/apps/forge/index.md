# Aizanoi Forge Module

Purpose: AizanoiOS launcher surface for source, builds and open projects.

## Public entry

- `src/index.js` — the only runtime entry consumed by generated module wiring.

## Declared capabilities

- `apps` — narrow application navigation used only to open Historical Worlds.

The module does not receive the full shell API and does not own repository source, deployment or build infrastructure.

## Owned implementation

- `src/app.js` — Forge cards, canonical GitHub link and module-owned click listener.
- `src/capabilities.js` — validates the declared `apps.open()` surface.
- `manifest.json` — installation identity and capability declaration.

## Canonical source boundary

GitHub remains the source of truth for the repository. Forge is only the branded AizanoiOS project/source surface; it must not become a second source-code mirror with independent state.

## Cleanup

The module removes its container click listener on teardown.

## Tests

- `../../../../../tests/aizanoi-os-forge-module.test.mjs` — manifest, registry wiring, capability boundary, legacy-hub removal and cleanup contract.

Private files under `src/` are not cross-module APIs.
