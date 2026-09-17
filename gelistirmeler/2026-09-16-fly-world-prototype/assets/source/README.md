# Fly House source assets

This directory is the intake area for third-party or authored source assets used by the Fly House Blender pipeline.

## Directory convention

Use one directory per `asset_manifest.json` slot:

```text
assets/source/
  wood-stove/
    wood-stove.glb
  old-tv/
    old-tv.glb
  ...
```

Then point that manifest slot's `localPath` at the actual file.

## Required provenance

A slot is not accepted just because a model file exists. Its `source` object in `asset_manifest.json` must contain all of:

```json
{
  "url": "https://original-source.example/item",
  "author": "Original author or studio",
  "license": "CC0-1.0",
  "retrievedAt": "2026-09-16"
}
```

Use the original asset page when possible, not a repost or search-result URL. The license identifier must be allowed by the manifest policy. `CC-BY-4.0` is allowed only with attribution retained; unknown, NC, ND, editorial-only, or unverified proprietary assets are rejected.

## Before Blender

Run:

```bash
python scripts/fly-world/validate_project.py
```

For a visual-review candidate, run the strict gate:

```bash
python scripts/fly-world/validate_project.py --strict-assets
```

The strict gate must pass before the scene can be described as visually approval-ready.

## Geometry rule

Do not silently replace the reference-locked composition. Imported assets should be prepared to approximately match the dimensions and anchor in `scene_spec.json`. If an asset needs destructive reshaping to fit, choose another asset or author a better one in Blender instead of distorting the room around it.
