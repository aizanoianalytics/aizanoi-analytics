# Rome renderer A/B visual evaluation

Status: **HOLD — do not migrate the production Rome renderer yet.**

The experiment uses `scripts/capture-ab-baseline.mjs` to render the current production renderer and the Three.js PoC at the same 1280×720 viewport and the same Colosseum street-level camera. UI is hidden for the comparison. Screenshots are treated as generated artifacts rather than permanent source files so they cannot silently become stale as the renderer changes.

## Evaluation history

### V1 — renderer plumbing

Three.js successfully consumed the shared city/traversal contracts, but the visual result was clearly worse than production. The Colosseum read as a large simple cylinder, terrain was flat, and the surrounding city lacked the production renderer's tonal cohesion.

**Verdict:** architecture proof only; no visual case for migration.

### V2 — instanced Colosseum facade

The opaque outer Colosseum shell was replaced with a recessed inner mass, structural bands, 216 instanced facade piers and attic slots. The landmark became substantially more readable, but an InstancedMesh color/material mistake made inferred urban walls black and the terrain remained too flat.

**Verdict:** hero landmark improved; whole-scene quality still worse.

### V3 — readable urban fabric and facade arches

The black-wall issue was removed, inferred blocks gained low-cost roof silhouettes, and the Colosseum received 216 instanced half-torus arcade heads. The monument became architecturally more legible than the production proxy, but direct numeric vertex colors caused the terrain to render far too pale because display-space values were being treated as working-space vertex color channels.

**Verdict:** Colosseum direction validated; color-management bug blocked scene parity.

### V4 — color-managed terrain palette

Terrain colors now enter Three.js through `THREE.Color(...)` and a dedicated color-managed sampler; urban walls, roofs, sky and fog share a centralized renderer palette. The pale-ground error is gone and inferred wall colors are stable. The Colosseum's three arcade levels, dark openings and attic rhythm are now clearly readable from the matched street-level camera.

At this point the **Three.js Colosseum hero is more architecturally legible than the production Colosseum proxy**, while the **production renderer still has the stronger overall city atmosphere**: its ground micro-variation, distance toning and surrounding massing feel more integrated. Three.js district blocks remain visibly procedural boxes even with roof silhouettes.

**Verdict:** Three.js is now a credible renderer candidate, but the overall scene has not yet demonstrated enough visual advantage to justify production migration.

### V5 — terrain micro-variation and inferred-building eaves

The terrain sampler combines deterministic broad and finer spatial variation. Inferred urban blocks receive one shared instanced eave/cornice layer between their walls and roof silhouettes, adding a readable horizontal break without per-building draw objects or evidence claims.

The technical cost remained small in real Chromium: desktop moved from roughly 9,964 triangles / 160 calls to 11,344 triangles / 161 calls, while mobile stayed around 6.5k triangles / mid-70s calls. Desktop, pointer-lock, mobile, regression and whitespace gates passed.

The matched image shows a **modest streetscape improvement**, but the foreground terrain still appeared too broad and tonally flat.

**Verdict:** keep the low-cost eave layer and deterministic terrain variation; whole-scene parity remains open.

### V6 — reduced ambient fill experiment (rejected)

V6 changed only two lighting coefficients: hemisphere fill dropped from `2.45` to `1.75` and directional sun from `3.85` to `3.65`. Geometry, fog, tone mapping, traversal, quality policy and evidence data were unchanged. The exact V6 state passed desktop/input/mobile Chromium and regression checks before visual evaluation.

The matched capture did **not** solve the remaining problem. Compared with V5, the city and Colosseum became roughly 12–13 RGB levels darker on average and the foreground roughly 7 levels darker, while terrain relief did not become materially more legible.

**Verdict:** reject V6 and restore the validated V5 light balance (`HemisphereLight` 2.45, directional sun 3.85).

### V7 — terrain-only per-fragment grain

Inspection of the production renderer identified an important structural difference: production applies deterministic world-space grain in the fragment shader, while the Three.js PoC had been relying mostly on vertex colors interpolated across a relatively coarse terrain mesh. V7 therefore moved the missing micro-variation into a **terrain-only fragment material** without changing terrain geometry, collision, lighting, fog, city data or evidence confidence.

The first `0.035` hash-cell version compiled and passed real Chromium with the same scene complexity as V5 (`11,344` desktop triangles / `161` calls; `6,562` mobile triangles / `74` calls). It increased near-field variation but remained visually subtle. Raising the hard-cell amplitude to `0.075` made the effect easier to see but exposed square cell boundaries, so that tuning was rejected.

The retained V7.2 implementation uses smooth deterministic value noise: four neighboring hash samples are blended with a smoothstep-style interpolation. `cellScale` remains `0.72`; amplitude is `0.12`. This removes the blocky cell boundaries while keeping visible near-field tonal variation. The renderer still adds no geometry or draw calls for the effect.

As a screenshot diagnostic, mean adjacent-pixel luminance change in the matched foreground rose from about `0.0078` in V5 to about `0.0598` in retained V7.2 — roughly **7.6× more local variation** — while production remains around `0.2337`. The number is not an FPS or quality score; it is only a consistent matched-image indicator that the foreground is no longer almost perfectly flat.

V7.2 passed both push and PR CI, including real desktop/input/mobile Chromium, shader compilation, evidence teardown, complexity limits and all regression tests.

**Verdict:** keep V7.2. It is the first terrain experiment that improves the matched image without darkening the scene or introducing visible grid artifacts. It narrows the ground-cohesion gap, but does not by itself justify renderer migration.

## What the experiment has proven

- Renderer migration does not require a second physics engine.
- Shared terrain/support/collision/evidence contracts survive the renderer swap.
- Three.js materially improves the maintainability of instanced architectural detail.
- A detailed hero facade can remain inside the automated scene-complexity ceiling.
- Better graphics must not alter evidence confidence; the Colosseum hero remains tagged `plausible` at the renderer layer.
- The renderer can be destroyed while the reconstruction methodology UI remains functional.
- Matched A/B evaluation can reject technically valid changes when they do not produce a visual benefit.
- Terrain micro-detail can be improved at fragment level without increasing scene geometry or draw calls.

## Remaining visual gate

Do not promote this branch merely because Three.js is easier to extend. A migration proposal should first show one of these outcomes:

1. the **whole Rome streetscape** reaches or exceeds the production renderer's tonal/material cohesion without breaking mobile budgets; or
2. a small number of owned/licensed hero assets or dedicated builders creates a clearly superior visitor experience while the shared engine remains unchanged.

The next useful visual work should target broader streetscape/material cohesion rather than more Colosseum detail, lower ambient fill or expensive dynamic shadows.

Until that gate is met, production stays on the current renderer and this branch remains an experiment.
