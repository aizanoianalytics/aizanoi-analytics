# Fly House Blender pipeline

This is build-time automation for the Fly World environment, not a visitor-facing backend.

The current production path is **v0.3 reference detail**. `build_scene_v3.py` reuses the enlarged v0.2 architectural/hero-asset base and applies `detail_pass_v3.py`, which adds the smaller reference-specific household dressing and worn surface treatment documented in `scripts/fly-world/source/REFERENCE_BREAKDOWN_V3.md`.

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

## Canonical inputs

The repository-owned Fly House source package lives under `scripts/fly-world/source/`: scene specification, asset manifest, reference notes and the small authored hero-asset set. Local experiment/review workspaces such as `gelistirmeler/` are intentionally ignored and are not part of the product source of truth.

## Outputs

Generated Blender and review artifacts stay under ignored `artifacts/fly-world/`. The v0.3 pipeline writes:

- `artifacts/fly-world/build/fly-house-v3.blend`
- `artifacts/fly-world/build/fly-house-v3.glb`
- `artifacts/fly-world/review/01-reference-wide.png`
- `artifacts/fly-world/review/02-room-eye-level.png`
- `artifacts/fly-world/review/03-window-to-stove.png`
- `artifacts/fly-world/review/04-doorway-bedroom.png`
- `artifacts/fly-world/review/05-fly-scale.png`
- `frontend/labs/fly-world/assets/fly-house.glb` — browser-ready production scene

Fly World uses a **Z-up** runtime. v0.3 exports with `export_yup=false`; do not change this casually because camera and collision coordinates depend on the same axis convention.

## Runtime contract

`frontend/labs/fly-world/bootstrap.js` loads the Blender GLB when it exists. Otherwise it loads the authored v0.3 browser fallback. The two paths intentionally share the same composition and collision semantics.

Observer collision is ON by default. `N` is debug noclip only. The human observer remains excluded from future fly sensors/physics even though it collides with the house for navigation.

## Asset contract

Hero assets remain governed by `asset_manifest.json`. Every third-party asset must record source URL, author, license and retrieval date. Studio-authored assets keep their declared CC0 provenance. `validate_project.py --strict-assets` is the preflight gate; a green validator is necessary but **not** sufficient for visual approval.

Final visual approval requires the five fixed renders plus a live walkthrough against the approved people-free reference image. Do not add the fly/connectome runtime until the environment is visually accepted.
