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

## What the experiment has proven

- Renderer migration does not require a second physics engine.
- Shared terrain/support/collision/evidence contracts survive the renderer swap.
- Three.js materially improves the maintainability of instanced architectural detail.
- A detailed hero facade can remain inside the automated scene-complexity ceiling.
- Better graphics must not alter evidence confidence; the Colosseum hero remains tagged `plausible` at the renderer layer.
- The renderer can be destroyed while the reconstruction methodology UI remains functional.

## Remaining visual gate

Do not promote this branch merely because Three.js is easier to extend. A migration proposal should first show one of these outcomes:

1. the **whole Rome streetscape** reaches or exceeds the production renderer's tonal/material cohesion without breaking mobile budgets; or
2. a small number of owned/licensed hero assets or dedicated builders creates a clearly superior visitor experience while the shared engine remains unchanged.

Until then, production stays on the current renderer and this branch remains an experiment.
