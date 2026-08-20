# Aizanoi Historic World Context

Aizanoi is served at `/historic-world/` and is now a thin city adapter over the shared Ancient World flat/blocky runtime.

## Ownership

- `app.js` — loader only: city data + urban fabric + shared runtime + compatibility bridge.
- `data/city.js` — Aizanoi landmarks, regions, roads, Penkalas water, sources, bounds and spawn.
- `data/urban-fabric.js` — deterministic plausible residential/workshop infill.
- `../ancient-world/engine/flat-city-runtime.js` — renderer, flat Y=0 ground, camera, movement, teleport, minimap, inspect, audio and UI wiring.
- `../ancient-world/engine/traversal.js` — collision/support/sub-stepped movement.
- `../ancient-world/assets/blocky-asset-library.js` — reusable buildings and hero assets, including `temple-of-zeus`.
- `../ancient-world/assets/city-layout-tools.js` — renderer-neutral layout normalization.

## Hard architecture rules

1. Playable city ground stays flat at **Y=0**. Do not reintroduce city-specific terrain physics in Aizanoi.
2. Do not copy renderer, movement, collision, camera, mobile controls or teleport code back into `historic-world/app.js`.
3. Reusable houses, baths, theatres, bridges, markets, walls etc. belong in the shared asset library.
4. Identity-critical Aizanoi monuments may receive dedicated shared hero assets, but their placement/evidence remains in Aizanoi city data.
5. This is blocky/low-poly, **not** a true voxel/chunk engine.
6. Keep archaeological/documented/plausible/atmospheric evidence distinctions intact.
7. Preserve deep-link `?jump=...`, `__AIZANOI_DEBUG__`, mobile controls, Field System navigation and the AD 225/301/425 UI contract.

## Regression checks

- `node --check` every JS file under `frontend/historic-world` and `frontend/ancient-world`.
- Run regression tests, especially `modular-flat-world.test.mjs`.
- Browser smoke: enter, WASD, mouse look, touch joystick, inspect, atlas, sources, era buttons and all landmark teleports.
- Landmark arrivals must be collision-free and allow an immediate first step.
- `floorY` should normally be 0 on city ground; only authored local walk surfaces such as bridge decks may raise support.
- Verify no console errors and exactly one `← Field System` control.
