# Winamp Module

Purpose: local-first audio playback from user-selected files and the shared Workspace Music folder.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` is private to this module.

## Required capabilities

- `filesystem` — Music folder id, audio blob reads and imported-file persistence
- `notifications` — load/playback feedback
- `sound` — shell interaction sounds

The canonical shell resolves the manifest requirements through `../../capabilities.js`. Private Winamp code must not import Workspace implementation paths directly.

## Lifecycle and storage

- Playlist metadata uses module-owned localStorage key `aizanoi-winamp-playlist-v1`.
- Imported audio is stored through the shared filesystem capability so Workspace-backed tracks survive reloads.
- Cleanup pauses playback, revokes the active blob URL and removes Winamp-owned DOM/media listeners.

## Tests

Architecture wiring is covered by `../../../../../tests/aizanoi-os-winamp-module.test.mjs`; import/reload persistence remains covered by `../../../../../tests/browser/workspace-apps.test.mjs`.
