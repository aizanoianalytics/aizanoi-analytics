# Historical Worlds Module

Purpose: public AizanoiOS index UI for entering or resuming evidence-aware Historical Worlds.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else in this directory is private module implementation.

## Declared capability

- `worlds` — frozen world catalog, current field session and canonical world launch

Private module code must not import `registry.js`, `store.js` or `shell.js` directly.

## Ownership

This module owns only the Historical Worlds index UI and its click listener. The canonical world catalog, field-session state and world routing remain shared platform concerns behind the capability boundary.

## Cleanup

Closing the app removes its container click listener. Historical world scenes and field-session persistence are not owned by this module.

## Tests

- `../../../../../tests/aizanoi-os-worlds-module.test.mjs`
- shared capability contract → `../../../../../tests/aizanoi-os-capabilities.test.mjs`
- Phase 6 unplug/private-import guards apply automatically through the manifest.
