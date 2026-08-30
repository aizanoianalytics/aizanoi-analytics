# Workspace Module

Purpose: local file-explorer UI over the canonical browser-local Aizanoi Workspace filesystem core.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else in this directory is private module implementation.

## Declared capabilities

- `apps` — open Notepad, Camera or Winamp for supported file types
- `filesystem` — browse/create/import/rename/trash/read local Workspace nodes
- `notifications` — user-facing import/error/status messages
- `sound` — local UI feedback

The IndexedDB filesystem implementation remains owned by `../../../workspace/fs.js`; this UI module must never import it directly.

## Ownership

Workspace UI owns:

- explorer markup and interactions;
- action-menu lifecycle;
- file-input listeners;
- temporary download object URLs and their timers.

It does **not** own the filesystem database or special-folder implementation.

## Cleanup

Closing Workspace removes container/file-input/document listeners, closes the action menu, cancels focus-restore work and revokes any outstanding download object URLs.

## Tests

- `../../../../../tests/aizanoi-os-workspace-module.test.mjs`
- shared capability contract → `../../../../../tests/aizanoi-os-capabilities.test.mjs`
- Phase 6 unplug/private-import guards apply automatically through the manifest.
