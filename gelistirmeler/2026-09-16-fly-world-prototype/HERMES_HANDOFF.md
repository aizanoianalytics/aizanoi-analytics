# Hermes handoff — Fly House v0.3 operator run

## Mission

The canonical production path is now the current branch and committed `main` lineage. This document records the operator/build procedure; it is not an operator-only assumption or a claim of owner visual approval.

The canonical visual contract is `REFERENCE_BREAKDOWN_V3.md`, backed by `scene_spec.json`. The target is the approved people-free illustrated cottage, not a generic rustic room.

- `fix/fly-world-final-environment-closure` / current `main` lineage (historical prototype branch is not a source of truth)

- `gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json`
- `gelistirmeler/2026-09-16-fly-world-prototype/asset_manifest.json`
- `gelistirmeler/2026-09-16-fly-world-prototype/REFERENCE_BREAKDOWN_V3.md`
- `scripts/fly-world/build_scene_v3.py`
- `scripts/fly-world/detail_pass_v3.py`
- `scripts/fly-world/run_pipeline.py`
- `scripts/fly-world/validate_project.py`
- `frontend/labs/fly-world/bootstrap.js`
- `frontend/labs/fly-world/main-v3.js`
- `frontend/labs/fly-world/reference-dressing.js`
- `frontend/labs/fly-world/glb-runtime-v3.js`

The browser fallback and Blender scene deliberately implement the same reference pass. Fly World is Z-up; v0.3 Blender export uses `export_yup=false` so browser camera/collision coordinates remain aligned.

## Execute

From repository root on the Blender-capable host:

```bash
python scripts/fly-world/run_pipeline.py --strict-assets
```

If Blender is not on `PATH`, set `BLENDER_BIN` to the executable and rerun. Do not rewrite the pipeline merely because the executable lives at a different path.

Expected v0.3 outputs:

```text
gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house-v3.blend
gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house-v3.glb
frontend/labs/fly-world/assets/fly-house.glb
gelistirmeler/2026-09-16-fly-world-prototype/review/01-reference-wide.png
gelistirmeler/2026-09-16-fly-world-prototype/review/02-room-eye-level.png
gelistirmeler/2026-09-16-fly-world-prototype/review/03-window-to-stove.png
gelistirmeler/2026-09-16-fly-world-prototype/review/04-doorway-bedroom.png
gelistirmeler/2026-09-16-fly-world-prototype/review/05-fly-scale.png
```

## Required checks

After the build:

1. confirm `validate_project.py --strict-assets` exits successfully;
2. confirm `frontend/labs/fly-world/assets/fly-house.glb` exists and is non-empty;
3. open Fly World from the AizanoiOS desktop app and verify it loads the Blender GLB path rather than falling back because of a missing asset;
4. verify collision is ON by default and walls/major furniture cannot be crossed during normal navigation;
5. verify `N` is debug noclip only;
6. inspect all five review renders for clipping, missing textures, floating props or broken scale;
7. do **not** begin fly/connectome/body/neural work.

The human observer may collide with the environment for navigation while still remaining invisible/non-physical to the future fly simulation. Do not revert observer collision to `false` in the scene contract.

## Visual review boundary

The first review image, `01-reference-wide.png`, must be compared directly with the approved people-free cottage composition. Pay special attention to the left barred window/curtains, long carved divan/cabinet wall, CRT cabinet, stove/hearth/flue/laundry, layered floor textiles and clutter, thick bedroom doorway casing and the visible red/patchwork bed beyond it.

A successful render command is not permission to redesign or declare visual approval. If a Blender/API compatibility error prevents the authored pipeline from running, fix only the smallest execution compatibility issue and report it precisely. Do not replace the reference-specific scene with a simpler improvised room.

## Report back

Return concrete evidence only: exact branch/head SHA, strict-validator output, Blender version, generated `.blend`/`.glb` paths and sizes, the five review image paths, whether AizanoiOS loaded the GLB successfully, and any execution error that remains. Do not claim user visual approval.
