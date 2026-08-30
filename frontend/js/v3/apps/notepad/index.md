# Notepad Module

Purpose: plain-text editing backed by the local Workspace filesystem.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` is private to this module.

## Required capabilities

- `filesystem` — Documents folder access, text-file read/write/list operations and size formatting
- `dialog` — asynchronous Save / Discard dialog
- `notifications` — shell notifications
- `sound` — shell interaction/notification sounds

`src/capabilities.js` is the compatibility boundary that maps the current AizanoiOS shared implementations into these capabilities. Private application logic must not import `workspace/fs.js` or `workspace/dialog.js` directly.

## Lifecycle

The public `mount()` contract returns `cleanup`, `onOpen` and `beforeClose` hooks expected by the canonical shell. `cleanup` must remove module-owned listeners/resources.

## Storage

Notepad owns no separate database. Documents are stored through the shared Workspace filesystem in the canonical Documents folder.

## Tests

Architecture/runtime wiring is covered by `../../../../../tests/aizanoi-os-notepad-module.test.mjs`.
