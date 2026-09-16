# Fly House Blender pipeline

This is build-time automation for the Fly World environment, not a visitor-facing backend.

The current production path is **v0.3 reference detail**. `build_scene_v3.py` reuses the enlarged v0.2 architectural/hero-asset base and applies `detail_pass_v3.py`, which adds the smaller reference-specific household dressing and worn surface treatment documented in `gelistirmeler/2026-09-16-fly-world-prototype/REFERENCE_BREAKDOWN_V3.md`.

## Operator command

From the repository root:

```bash
python scripts/fly-world/run_pipeline.py --strict-assets
```

The wrapper validates the current scene/asset contract, finds Blender on `PATH` (or uses `BLENDER_BIN`) and runs Blender headless. No Blender UI automation or new scene code is required from the operator.

To regenerate the GLB without the five review renders:

```bash
python scripts/fly-world/run_pipeline.py --strict-assets --no-render
```

## Outputs

The v0.3 pipeline writes:

- `gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house-v3.blend`
- `gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house-v3.glb`
- `gelistirmeler/2026-09-16-fly-world-prototype/review/01-reference-wide.png`
- `gelistirmeler/2026-09-16-fly-world-prototype/review/02-room-eye-level.png`
- `gelistirmeler/2026-09-16-fly-world-prototype/review/03-window-to-stove.png`
- `gelistirmeler/2026-09-16-fly-world-prototype/review/04-doorway-bedroom.png`
- `gelistirmeler/2026-09-16-fly-world-prototype/review/05-fly-scale.png`
- `frontend/labs/fly-world/assets/fly-house.glb` — browser-ready production scene

Fly World uses a **Z-up** runtime. v0.3 exports with `export_yup=false`; do not change this casually because camera and collision coordinates depend on the same axis convention.

## Runtime contract

`frontend/labs/fly-world/bootstrap.js` loads the Blender GLB when it exists. Otherwise it loads the authored v0.3 browser fallback. The two paths intentionally share the same composition and collision semantics.

Observer collision is ON by default. `N` is debug noclip only. The human observer remains excluded from future fly sensors/physics even though it collides with the house for navigation.

## Asset contract

Hero assets remain governed by `asset_manifest.json`. Every third-party asset must record source URL, author, license and retrieval date. Studio-authored assets keep their declared CC0 provenance. `validate_project.py --strict-assets` is the preflight gate; a green validator is necessary but **not** sufficient for visual approval.

Final visual approval requires the five fixed renders plus a live walkthrough against the approved people-free reference image. Do not add the fly/connectome runtime until the environment is visually accepted.
