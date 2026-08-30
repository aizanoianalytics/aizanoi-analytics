# Aizanoi Labs Module

Purpose: AizanoiOS experimental/prototype surface while playable games remain a separate Arcade product.

## Public entry

- `src/index.js` — the only runtime entry consumed by generated module wiring.

## Declared capabilities

- `apps` — narrow application navigation used only to open Aizanoi Arcade.

Labs does not receive the full shell API and does not own Arcade game implementation.

## Owned implementation

- `src/app.js` — Labs cards and module-owned click listener.
- `src/capabilities.js` — validates the declared `apps.open()` surface.
- `manifest.json` — installation identity and capability declaration.

## Ownership boundary

Labs owns prototypes and experimental presentation. Playable games belong to Arcade; Labs may navigate there through the public app capability but must not import Arcade internals.

## Cleanup

The module removes its container click listener on teardown.

## Tests

- `../../../../../tests/aizanoi-os-labs-module.test.mjs` — manifest, registry wiring, capability boundary, Arcade separation and cleanup contract.

Private files under `src/` are not cross-module APIs.
