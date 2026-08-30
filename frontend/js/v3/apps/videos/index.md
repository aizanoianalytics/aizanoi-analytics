# Aizanoi TV Module

Purpose: English-language Aizanoi video-channel surface and companion links into other public AizanoiOS products.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else under `src/` is private to this module.

## Required capabilities

- `apps` — narrow canonical app navigation via `apps.open(appId, options)`

TV does not receive the full shell `appApi` and owns no filesystem or persistent storage.

## Lifecycle

The module owns one container click listener and removes it during cleanup.

## Storage

None. Series metadata is module-local source data.

## Tests

- Module architecture → `../../../../../tests/aizanoi-os-videos-module.test.mjs`
- Capability facade → `../../../../../tests/aizanoi-os-capabilities.test.mjs`
- Cross-module/unplug enforcement → `../../../../../tests/aizanoi-os-module-boundaries.test.mjs`

## Private boundary

Other modules must not import TV private files. TV opens News, Analytics and Forge only through the declared `apps` capability.
