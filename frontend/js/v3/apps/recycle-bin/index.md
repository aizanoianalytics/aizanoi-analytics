# Recycle Bin Module

Purpose: restore or permanently delete items moved to the shared Workspace recycle folder.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` is private to this module.

## Required capabilities

- `filesystem` — recycle folder id, list/restore/delete/empty operations and file-size formatting
- `dialog` — destructive-action confirmation
- `notifications` — shell notifications
- `sound` — restore/delete feedback

The canonical shell resolves the manifest requirements through `../../capabilities.js` and injects them into the module. Recycle Bin private code must not import Workspace implementation files directly.

## Lifecycle

The public `mount()` result owns and removes the module click listener during cleanup.

## Storage

Recycle Bin owns no separate storage namespace. It operates only through the shared filesystem capability.

## Tests

Architecture wiring is covered by `../../../../../tests/aizanoi-os-recycle-bin-module.test.mjs`; real restore behavior remains covered by `../../../../../tests/browser/workspace-apps.test.mjs`.
