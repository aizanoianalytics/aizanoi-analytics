# Status

Branch: `fix/fly-world-final-environment-closure` (Stage A candidate only; current production source is the latest `origin/main` lineage; historical prototype folders are not canonical)

Current environment: **Fly House v0.3 — reference detail pass**. The target remains the approved people-free illustrated cottage: cluttered living room, barred/layered-curtain window, carved divan/cabinet wall, CRT cabinet, central stove/flue, layered rugs and an open doorway into the connected bedroom.

## Current implementation

The branch now contains a reference-driven browser and Blender implementation rather than the original sparse blockout.

- Main room enlarged to about **9.6 × 8.0 × 2.85 m**; bedroom about **5.0 × 6.2 × 2.85 m**.
- Human ghost observer has **collision ON by default**. `N` is debug noclip only. The observer still casts no shadow, is invisible to future fly sensors and does not affect fly physics.
- `frontend/labs/fly-world/main-v3.js` is the detailed authored fallback.
- `frontend/labs/fly-world/reference-dressing.js` adds the small/medium reference-specific props and dense lived-in dressing.
- `frontend/labs/fly-world/glb-runtime-v3.js` loads the Blender scene and gives explicit `collision=solid/none` metadata precedence over legacy name fallbacks.
- `scripts/fly-world/build_scene_v3.py` is the production Blender builder.
- `scripts/fly-world/detail_pass_v3.py` mirrors the reference-detail pass in Blender and adds restrained material variation.
- `scripts/fly-world/run_pipeline.py` now runs v0.3.
- `scene_spec.json` is aligned with the enlarged footprint, collision-first observer semantics, five review cameras and a Z-up browser/Blender contract.
- `REFERENCE_BREAKDOWN_V3.md` is the visual-composition contract.

## Reference-detail additions

The v0.3 pass explicitly adds or strengthens: broad green carpet under the smaller rugs, heavy doorway casing, wall clock, carved cabinet overlays/rosettes, cabinet-top books/lace/fruit/photo/blue ornament, CRT lower shelf/louvers/cups/doily/figurine, stove hearth/ash pan/tools, hanging laundry and ornament near the flue, clustered floor toys/notebook/yarn/marbles/slippers, green knitting bag, orange ball, plaster wear, tulip vase/light switch, and a denser bedroom continuation with bedside objects, wall picture, plants, folded bedding, basket and high shelf.

The v0.2 heavy ceiling-beam treatment is intentionally removed in v0.3 because it changed the identity of the reference house; the approved illustration reads as a low plain ceiling rather than a timber-hall interior.

## Blender / browser axis decision

Fly World is Z-up in the browser. v0.3 exports the Fly House GLB with `export_yup=false` so Blender placement, browser camera coordinates and collision boxes remain in the same coordinate convention.

## Validation / execution state

The source code and scene contract are prepared for the v0.3 production run. The earlier 14 required hero assets remain governed by `asset_manifest.json` and the strict asset gate.

The v0.3 Blender binary outputs and five reference-review PNGs are generated in this checkout by the canonical pipeline. They are review artifacts, not owner approval; rerun the command after any source change:

```bash
python scripts/fly-world/run_pipeline.py --strict-assets
```

on the Blender-capable host. That command publishes `frontend/labs/fly-world/assets/fly-house.glb` and writes the five fixed review renders.

## Visual approval rule

A passing validator or successful Blender command is not visual approval. Compare `01-reference-wide` against the approved people-free cottage first, then inspect eye-level, window-to-stove, doorway-bedroom and fly-scale views plus a live walkthrough. Continue environment iteration if the result still reads as a generic rustic house.

## Historical Stage A boundary

The original Stage A handoff intentionally deferred fly/connectome work until visual review. That was a historical gate for the prototype branch, not current main status. Current main contains the Stage B authoritative reduced-order simulation, experimental LC4 escape controller, and read-only spectator service.
