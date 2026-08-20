# Rome 410–476 Context

Rome is served at `/ancient-cities/rome-410-476/` and uses the shared Ancient World flat/blocky runtime.

## Ownership

- `index.html` — city UI shell and controls.
- `js/app.js` — thin adapter only.
- `data/city-source.js` / `data/city.js` — source-backed Late Antique city records and authored framing metadata.
- `data/urban-fabric.js` — deterministic plausible district massing.
- `data/terrain.js` — **archived topography research/reference**; it does not drive live traversal.
- `data/manifest.js` — renderer-neutral historical manifest/reference.
- `../../ancient-world/engine/flat-city-runtime.js` — live renderer + flat Y=0 world.
- `../../ancient-world/assets/blocky-asset-library.js` — reusable historical assets and Rome hero assets.

## Hard architecture rules

1. Live playable ground stays **Y=0**. Do not connect `terrainHeightAt` back to movement or building support without an explicit platform-wide decision.
2. Do not fork shared renderer/movement/collision/mobile/teleport code into Rome `app.js`.
3. Use `expandPerimeterWalls(...)` for city-scale wall envelopes such as the Aurelian circuit; never render a whole city-boundary record as one solid box.
4. Reusable building vocabulary belongs in the shared asset library. Colosseum and Pantheon keep dedicated hero builders there.
5. Urban fabric remains explicitly `plausible` and subordinate to named monuments/roads.
6. Keep historical `state` separate from evidence confidence.
7. Preserve deep-link jumps, mobile controls, inspect/evidence/source UI and `← Field System` navigation.

## Required validation

- `node --check` the Rome adapter/data and shared Ancient World JS.
- Run regression tests including Rome, modular-flat-world and shared engine tests.
- Browser: enter, WASD, mouse look, touch movement, landmark teleports followed by movement, atlas, evidence, sources and no console errors.
- All teleport arrivals must be collision-free and allow an immediate first step.
- Normal city ground must resolve to floorY 0; bridge decks/local authored surfaces may be above 0.
