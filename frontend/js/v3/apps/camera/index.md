# Camera Module

Purpose: permission-gated local camera capture with photos stored in Workspace · Pictures or downloaded by the visitor.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` is private to this module.

## Required capabilities

- `filesystem` — Pictures folder id plus photo read/write metadata operations
- `media` — browser media availability and permission-gated `getUserMedia`
- `notifications` — connection/error feedback
- `sound` — interaction and shutter feedback

The canonical shell resolves the manifest requirements through `../../capabilities.js`. Private Camera code must not import Workspace implementation paths or call `navigator.mediaDevices` directly.

## Permission contract

Starting Camera requests `{ video: { facingMode: 'user' }, audio: true }`. The microphone track is requested because this is an explicit owner requirement, but Camera remains photo-only and does not record or upload audio/video.

## Lifecycle

Cleanup must stop every media track, clear the video stream, revoke gallery object URLs, remove Camera-owned click/change/pagehide listeners and leave no capture resource alive after the app closes.

## Storage

Captured JPEGs are stored only through the injected filesystem capability in Workspace · Pictures. Downloads are explicit visitor actions.

## Tests

Architecture wiring is covered by `../../../../../tests/aizanoi-os-camera-module.test.mjs`; real Chromium media constraints, track teardown and object-URL cleanup are covered by `../../../../../tests/browser/workspace-apps.test.mjs`.
