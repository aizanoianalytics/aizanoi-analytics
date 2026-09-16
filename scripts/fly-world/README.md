# Fly House Blender pipeline

This is build-time automation, not a visitor-facing backend.

## Operator command

From the repository root:

```bash
python scripts/fly-world/run_pipeline.py
```

The wrapper finds Blender on PATH (or uses `BLENDER_BIN`) and runs `build_scene.py` in background mode. No Blender UI scripting is required.

Outputs are written under:

- `gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house.blend`
- `gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house.glb`
- `gelistirmeler/2026-09-16-fly-world-prototype/build/previews/*.png`

Hero furniture with no approved local asset is represented by a clearly named `PROXY__*` object. Proxy geometry is for composition review only and must not pass the visual-quality gate.

Third-party assets are accepted only when their manifest entry contains a source URL and allowed license. Put source files in `gelistirmeler/2026-09-16-fly-world-prototype/assets/source/<slot-id>/` and set that slot's `localPath` in `asset_manifest.json`.

Supported import formats in v0.1: `.glb`, `.gltf`, `.fbx`, `.obj`.
