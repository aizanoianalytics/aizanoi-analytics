# Calculator Module

Purpose: standard four-function local calculator with memory keys and keyboard input.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` is private to this module.

## Required capabilities

- `sound` — local AizanoiOS click/error feedback

Calculator does not require filesystem, dialog, network, storage or another application.

## Lifecycle

The public `mount()` contract returns deterministic cleanup for the module-owned container click listener and document keyboard listener.

## Storage

Calculator owns no persistent storage. Memory-register state is session-local and disappears when the app closes.

## Tests

- Module architecture → `../../../../../tests/aizanoi-os-calculator-module.test.mjs`
- Existing real browser arithmetic gate → `../../../../../tests/browser/workspace-apps.test.mjs`
- Cross-module/unplug enforcement → `../../../../../tests/aizanoi-os-module-boundaries.test.mjs`

## Private boundary

Do not import `src/app.js` or `src/capabilities.js` from another module. Consumers launch Calculator through the canonical registry/module public entry.
