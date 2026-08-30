# Aizanoi Journal Module

Purpose: AizanoiOS long-form analysis, essays and commentary surface.

## Public entry

- `src/index.js` — the only runtime entry consumed by generated module wiring.

## Declared capabilities

None. Journal is currently a static zero-capability surface.

## Owned implementation

- `src/app.js` — Journal shell and empty-state copy.
- `manifest.json` — installation identity and zero-dependency declaration.

## Ownership boundary

Journal owns only its AizanoiOS surface. Future publication content or pipelines should receive their own explicit ownership contract rather than coupling Journal to News internals.

## Cleanup

Journal currently allocates no listeners, timers, observers or external resources; its public mount still returns a deterministic cleanup function.

## Tests

- `../../../../../tests/aizanoi-os-journal-module.test.mjs` — manifest, registry wiring, zero-capability boundary and shared-hub retirement contract.

Private files under `src/` are not cross-module APIs.
