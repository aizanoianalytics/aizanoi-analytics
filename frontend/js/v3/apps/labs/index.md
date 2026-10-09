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
- `assets/roman-history.mp4` — the original Grok Roman History experiment output.
- `assets/roman-history-prompt.md` — the original Grok provenance prompt.
- `assets/istanbul-fethi-1453.mp4` — the separate Step 5 Preview Conquest of Istanbul experiment output.
- `assets/istanbul-fethi-prompt.md` — the English HTML/JS/SVG/GSAP prompt shown in the workspace.

## Ownership boundary

Labs owns prototypes and experimental presentation. Playable games belong to Arcade; Labs may navigate there through the public app capability but must not import Arcade internals.

## Cleanup

The module removes its container click listener on teardown.

## Tests

- `../../../../../tests/aizanoi-os-labs-module.test.mjs` — manifest, registry wiring, capability boundary, Arcade separation and cleanup contract.

Private files under `src/` are not cross-module APIs.
