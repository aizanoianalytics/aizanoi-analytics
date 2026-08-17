# Rome renderer A/B visual evaluation

Status: **HOLD — do not migrate the production Rome renderer yet.**

The experiment uses `scripts/capture-ab-baseline.mjs` to render the current production renderer and the Three.js PoC at the same 1280×720 viewport. The permanent harness now captures two matched scenarios: a Colosseum hero view and a Via Sacra streetscape view. UI and the production `Back to Aizanoi OS` link are hidden so renderer comparisons measure scene output rather than chrome.

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

Terrain colors now enter Three.js through `THREE.Color(...)` and a dedicated color-managed sampler; urban walls, roofs, sky and fog share a centralized renderer palette. The pale-ground error is gone and inferred wall colors are stable. The Colosseum's three arcade levels, dark openings and attic rhythm are clearly readable from the matched street-level camera.

At this point the **Three.js Colosseum hero is more architecturally legible than the production Colosseum proxy**, while the **production renderer still has the stronger overall city atmosphere**.

**Verdict:** Three.js is a credible renderer candidate, but the overall scene has not yet demonstrated enough visual advantage to justify production migration.

### V5 — terrain micro-variation and inferred-building eaves

The terrain sampler combines deterministic broad and finer spatial variation. Inferred urban blocks receive one shared instanced eave/cornice layer between their walls and roof silhouettes, adding a readable horizontal break without per-building draw objects or evidence claims.

The matched image showed a modest streetscape improvement, but the foreground terrain still appeared too broad and tonally flat.

**Verdict:** keep the low-cost eave layer and deterministic terrain variation; whole-scene parity remains open.

### V6 — reduced ambient fill experiment (rejected)

V6 changed only two lighting coefficients: hemisphere fill dropped from `2.45` to `1.75` and directional sun from `3.85` to `3.65`. Geometry, fog, tone mapping, traversal, quality policy and evidence data were unchanged. The exact V6 state passed desktop/input/mobile Chromium and regression checks before visual evaluation.

The matched capture did **not** solve the remaining problem. The scene became darker while terrain relief did not become materially more legible.

**Verdict:** reject V6 and restore the validated V5 light balance (`HemisphereLight` 2.45, directional sun 3.85).

### V7 — terrain-only per-fragment grain

Inspection of the production renderer identified an important structural difference: production applies deterministic world-space grain per fragment, while the Three.js PoC had been relying mostly on vertex colors interpolated across a relatively coarse terrain mesh. V7 therefore moved the missing micro-variation into a terrain-only fragment material without changing terrain geometry, collision, lighting, fog, city data or evidence confidence.

The first `0.035` hard-cell version was too subtle. Raising hard-cell amplitude to `0.075` exposed square cell boundaries and was rejected. The retained V7.2 implementation uses smooth deterministic four-corner value noise with `cellScale=0.72` and `amplitude=0.12`.

As a matched-image diagnostic, mean adjacent-pixel luminance change in the foreground rose from about `0.0078` in V5 to about `0.0598` in V7.2 — roughly 7.6× more local variation — while production remains richer. This is only a consistent screenshot diagnostic, not an FPS or quality score.

**Verdict:** keep V7.2. It improves ground micro-detail without geometry or draw-call growth.

### V8 — instanced Roman roads

The earlier Three.js road implementation created a separate box mesh for each terrain-following segment. Production instead renders a road bed plus two subtle edge bands. V8 moved the Three.js renderer to shared instanced road geometry: one instanced bed layer and one instanced edge layer for the whole road network.

The first V8 box-based version cut draw calls dramatically but increased triangles:

- desktop: about `17,212` triangles / `82` calls, versus V7.2 `11,344` / `161`;
- mobile: about `11,314` triangles / `40` calls, versus V7.2 roughly `6,562` / `74`.

This proved the batching architecture, but the first edge material appeared cream/white. The cause was color-space interpretation: shared material RGB tokens were being passed to Three.js as working-space values instead of sRGB source values.

#### V8.1 — color-managed, narrower edge bands

Road and edge tokens were decoded through `THREE.SRGBColorSpace`; edge width was reduced and the shared semantic material tokens remained unchanged. The bright-edge artifact disappeared.

The Via Sacra benchmark also exposed an unrelated capture bug: production's custom view matrix and Three.js' default `-Z` camera use different yaw sign conventions. The matched Three camera now uses `atan2(-dx, -dz)`. The Colosseum camera had hidden this bug because its `dx` was zero.

#### V8.2 — flat quads and tighter sampling

Road beds/edges changed from thin boxes to flat instanced `PlaneGeometry`, removing slab side faces. Desktop/mobile terrain-following subdivision ceilings were tightened to `14 m / 20 m`.

This preserved the draw-call win while reducing the box-version geometry cost:

- desktop: about `12,100` triangles / `82` calls;
- mobile: about `7,372` triangles / `40` calls.

The matched image changed only slightly, showing that slab side faces were not the main visual mismatch.

#### V8.3 — renderer-specific road response

The Via Sacra image showed the Three road family shifting too warm under the PoC lighting/tone response. Instead of changing the shared Ancient World material vocabulary, Three applies a renderer-only response compensation before sRGB decoding. This moved visible road pixels into the same neutral stone family as production.

The same benchmark then revealed the actual foreground defect: a large warm area was terrain covering the road. Centerline-only pitch did not account for cross-slope on the Capitoline terrain.

#### V8.4 — retained terrain-tangent roads

V8.4 exposes the shared `terrainNormalAt` function through the Rome adapter. Each road instance is oriented on the local terrain tangent plane, so longitudinal and cross-slope are both represented. The road remains renderer-only visual geometry; traversal/collision/evidence data are unchanged.

At the matched Via Sacra camera, regression checks require the road plane to remain above the local terrain while staying under `9 cm` separation. The road is now visibly continuous from the foreground toward the Colosseum rather than being buried by the hill. Representative visible Three road pixels are roughly `99/98/87` RGB versus production road pixels around `105/95/77`: close enough that further color chasing would be overfitting this single camera.

Real Chromium on the V8.4 source state passed desktop, pointer-lock and mobile rendering. Representative scene complexity remained well inside the existing ceiling:

- desktop: about **12,100 triangles / 82 calls**;
- mobile: about **7,504 triangles / 47 calls**.

The only red gate on that source commit was a stale regression fixture expecting an older shared road token; the renderer/browser tests themselves passed. The fixture was corrected during cleanup to the actual shared tokens (`road=[0.34,0.31,0.25]`, `roadEdge=[0.23,0.21,0.18]`).

**Verdict:** retain V8.4. Road batching roughly halves desktop draw calls versus V7.2, keeps mobile call count materially lower, fixes the color-space artifact, and resolves the visible cross-slope burial without touching the shared historical/physics contracts.

## What the experiment has proven

- Renderer migration does not require a second physics engine.
- Shared terrain/support/collision/evidence contracts survive the renderer swap.
- Three.js materially improves the maintainability of instanced architectural detail.
- A detailed hero facade can remain inside the automated scene-complexity ceiling.
- Better graphics must not alter evidence confidence; the Colosseum hero remains tagged `plausible` at the renderer layer.
- The renderer can be destroyed while reconstruction methodology UI remains functional.
- Matched A/B evaluation can reject technically valid changes when they do not produce a visual benefit.
- Terrain micro-detail can improve at fragment level without geometry/draw-call growth.
- Road visual geometry can consume shared terrain normals without becoming a second traversal/physics system.
- A two-scenario capture harness is necessary: hero-landmark and streetscape changes require different matched cameras.

## Remaining visual gate

Do not promote this branch merely because Three.js is easier to extend or now cheaper in draw calls. A migration proposal should first show one of these outcomes:

1. the **whole Rome streetscape** reaches or exceeds the production renderer's tonal/material cohesion without breaking mobile budgets; or
2. a small number of owned/licensed hero assets or dedicated builders creates a clearly superior visitor experience while the shared engine remains unchanged.

The next useful visual work should move beyond Colosseum and roads toward **terrain/material balance, distance/fog cohesion and broader urban massing/material variation**. Expensive dynamic shadows remain a poor next step.

Until the whole-scene gate is met, production stays on the current renderer and this branch remains an experiment.
