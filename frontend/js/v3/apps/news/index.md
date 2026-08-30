# Aizanoi News Module

Purpose: AizanoiOS surface for the generated, source-linked daily and weekly News feed.

## Public entry

- Runtime entry → `src/index.js`
- Manifest → `manifest.json`

Everything else in this directory is private module implementation.

## Declared capabilities

None. The module reads its own public static feed from `/news/index.json` and does not need shell, filesystem or app-navigation services.

## Ownership

This module owns:

- News feed rendering inside AizanoiOS;
- category labels and edition-card markup;
- loading/error presentation for the static News feed.

The generated News archive and `/news/index.json` remain owned by the existing News content/build pipeline; this module is only their AizanoiOS presentation surface.

## Cleanup

The current surface registers no persistent listeners, timers or media resources.

## Tests

- `../../../../../tests/aizanoi-os-news-module.test.mjs`
- Phase 6 unplug/private-import guards apply automatically through the manifest.
