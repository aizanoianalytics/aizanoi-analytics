# Athens · 450–430 BCE Context

Athens is served at `/ancient-cities/athens-450-430/`. The historical frame remains 450–430 BCE and the rendered monument set stays anchored around c. 432–430 BCE, but live city traversal now uses the shared flat/blocky Ancient World runtime.

## Ownership

- `index.html` — city UI shell, controls and research entry points.
- `js/app.js` — thin adapter only.
- `data/city-source.js` — preserved source/research ledger.
- `data/city.js` — period-correct c. 432–430 BCE monument/district/road view.
- `data/urban-fabric.js` — deterministic plausible Athens/Piraeus massing.
- `data/terrain.js` — **archived Attic topography research/reference**; it does not drive live traversal.
- `data/manifest.js` — renderer-neutral historical manifest/reference.
- `../../ancient-world/engine/flat-city-runtime.js` — live renderer + flat Y=0 city ground.
- `../../ancient-world/assets/blocky-asset-library.js` — reusable assets plus Parthenon/Propylaea hero builders.

## Chronology rules

- Keep the visible snapshot near c. 432–430 BCE.
- Do not restore the later Classical Athena Nike temple, Erechtheion, Athenian Asklepieion or Pompeion as completed buildings in this snapshot.
- Preserve the conservative Classical Theatre of Dionysus treatment rather than a later monumental stone theatre.
- Preserve evidence labels and the source-led distinction between named monuments and plausible domestic massing.

## Hard architecture rules

1. Live playable ground stays **Y=0**. Acropolis/Pnyx/Areopagus hill data remains research/reference unless topography is deliberately reintroduced platform-wide.
2. Do not copy renderer, movement, collision, mobile, camera or teleport logic into Athens `app.js`.
3. Reusable architecture belongs in the shared asset library; Parthenon/Propylaea identity belongs in dedicated shared hero assets.
4. This is blocky/low-poly, not a voxel/chunk engine.
5. Preserve deep-link jumps, mobile controls, evidence/source UI and `← Field System` navigation.
6. Procedural urban fabric is always `plausible`.

## Required validation

- `node --check` the Athens adapter/data and shared Ancient World JS.
- Run Athens chronology tests, modular-flat-world tests and shared engine/regression tests.
- Browser: enter, WASD, mouse look, touch movement, all landmark teleports followed by immediate movement, atlas/evidence/sources and no console errors.
- Normal city ground should resolve to floorY 0; only authored local surfaces may raise support.
