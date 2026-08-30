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

The manifest is the source of truth for this requirement list. The canonical shell resolves the declared surfaces through `../../capabilities.js` and injects them into the module mount context. `src/capabilities.js` validates that injected contract only; it contains no concrete Workspace implementation imports. Private application logic must not import `workspace/fs.js`, `workspace/dialog.js` or `workspace/sounds.js` directly.

## Lifecycle

The public `mount()` contract returns `cleanup`, `onOpen` and `beforeClose` hooks expected by the canonical shell. `cleanup` must remove module-owned listeners/resources.

## Storage

Notepad owns no separate database. Documents are stored through the injected filesystem capability in the canonical Documents folder.

## Tests

Architecture/runtime wiring is covered by `../../../../../tests/aizanoi-os-notepad-module.test.mjs` and the shared resolver contract by `../../../../../tests/aizanoi-os-capabilities.test.mjs`.
