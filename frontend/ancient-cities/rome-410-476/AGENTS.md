# Rome 410–476 WebGL Context

Standalone static WebGL experience served at `/ancient-cities/rome-410-476/`.

## Files

- `index.html` — UI, controls, intro and responsive styling.
- `js/app.js` — Rome-specific renderer/builders, city interaction and adapter wiring into the shared Ancient World engine.
- `data/city.js` — source IDs, monuments, streets, regions and teleports. Keep archaeological claims in data rather than embedding unsupported copy into renderer logic.
- `research/index.html` — browser-readable research summary.
- `../../ancient-world/engine/` — shared traversal, lifecycle and Back-to-OS navigation. Do not fork these behaviours locally without an explicit reason.

## Current engine contract

Rome uses the shared player contract: human-scale eye height, walk/sprint speed, spatial-grid collision, support height, sub-stepped movement, wall slide, safe spawn and complete teleport state. Any change here must preserve the equivalent Aizanoi behaviours.

## Safety / archaeology rules

1. Do not use CDN assets, map tiles, analytics, tracking or runtime APIs.
2. Audio must remain user-initiated: browsers block autoplay; use Web Audio only after an explicit click.
3. The `modern overlay` is schematic orientation only, not a claimed exact modern cadastral map.
4. Keep `state` distinct from evidence: it communicates the 410–476 visual treatment (`standing`, `working`, `damaged`, `ruined`, `spoliated`, `inferred`).
5. Do not make fifth-century visual claims in the UI without a source entry.
6. Treat domestic massing and unresolved elevation as schematic/inferred.
7. Shared procedural building vocabulary may improve legibility but must not imply unsupported archaeological precision.

## Required validation

- `node --test tests/rome-world.test.mjs tests/ancient-world-engine.test.mjs tests/ancient-world-integration.test.mjs`
- `node --check frontend/ancient-cities/rome-410-476/js/app.js`
- Browser: ground-level eye height, WASD speed, wall/building collision, diagonal slide, bridge ramp/deck, all landmark teleports followed by immediate movement, atlas region travel, mobile D-pad/look, pointer lock, Back to Aizanoi OS and no console errors.
- Before production: copy the whole folder plus `frontend/ancient-world/`, create nginx exact/prefix routes so SPA fallback does not swallow JS modules; backup first; `nginx -t`; reload; HTTP smoke test.
