# Rome 410–476 WebGL Context

Standalone static WebGL experience served at `/ancient-cities/rome-410-476/`.

## Files

- `index.html` — UI, controls, intro and responsive styling.
- `js/app.js` — Rome-specific renderer/builders, city interaction and adapter wiring into the shared Ancient World engine.
- `data/city.js` — source IDs, named monuments, streets, regions and teleports. Keep historical claims in data rather than embedding unsupported copy into renderer logic.
- `data/terrain.js` — schematic hill/Tiber elevation field used by both renderer and traversal. It is not a surveyed DEM.
- `data/urban-fabric.js` — deterministic inferred district massing. It must stay subordinate to named monuments, major roads and evidence metadata.
- `research/index.html` — browser-readable research summary.
- `../../ancient-world/engine/` — shared traversal, lifecycle, evidence and Back-to-OS navigation. Do not fork these behaviours locally without an explicit reason.

## Current engine contract

Rome uses the shared player contract: human-scale eye height, walk/sprint speed, spatial-grid collision, support height, sub-stepped movement, wall slide, hazards, safe spawn and complete teleport state. Terrain physics and visible terrain must use the same height function.

## Safety / archaeology rules

1. Do not use CDN assets, map tiles, analytics, tracking or runtime APIs.
2. Audio must remain user-initiated: browsers block autoplay; use Web Audio only after an explicit click.
3. The `modern overlay` is schematic orientation only, not a claimed exact modern cadastral map.
4. Keep `state` distinct from `evidence`: state describes the 410–476 visual treatment; evidence describes confidence in the reconstruction.
5. Evidence vocabulary is `archaeological`, `documented`, `plausible`, `atmospheric`.
6. Do not make fifth-century visual claims in the UI without a source/evidence record.
7. Domestic massing from `urban-fabric.js` is `plausible` by design, not an individually excavated restitution.
8. Terrain preserves major hill/valley relationships but local elevation remains schematic until a validated DEM/topographic dataset is deliberately introduced.
9. Shared procedural building vocabulary may improve legibility but must not imply unsupported archaeological precision.

## Required validation

- `node --test tests/rome-world.test.mjs tests/rome-world-rebuild.test.mjs tests/ancient-world-engine.test.mjs tests/ancient-world-integration.test.mjs`
- `node --check frontend/ancient-cities/rome-410-476/data/terrain.js`
- `node --check frontend/ancient-cities/rome-410-476/data/urban-fabric.js`
- `node --check frontend/ancient-cities/rome-410-476/js/app.js`
- Browser: ground-level eye height, hill/valley transitions, Tiber hazard, WASD speed, wall/building collision, diagonal slide, bridge ramp/deck, all landmark teleports followed by immediate movement, atlas region travel, evidence badge, mobile D-pad/look, pointer lock, Back to Aizanoi OS and no console errors.
- Before production: copy the whole Rome folder plus `frontend/ancient-world/`; keep nginx exact/prefix routes so SPA fallback does not swallow JS modules; backup first; `nginx -t`; reload; HTTP smoke test.
