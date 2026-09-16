# Hermes handoff — Fly House environment

## Mission

Take the existing `fly-world-prototype` environment package from reference-locked technical blockout to a visual-review candidate. Do **not** redesign the environment and do **not** start the fly/connectome runtime yet.

The canonical target is the approved people-free rustic house illustration already selected by the user: dense old living room, barred window with layered curtains, long divan/cabinet wall, old CRT television, central wood stove with long pipe, layered rugs/clutter, and an open doorway into the connected bedroom.

This branch is intentionally isolated. Another Hermes task may be changing `main` and shared Blender/glTF infrastructure at the same time. Do not overwrite or "clean up" unrelated work. Resolve integration only after the environment work below is complete.

## What is already implemented

- Metric canonical composition: `scene_spec.json`
- Asset slots and license policy: `asset_manifest.json`
- Blender scene builder: `scripts/fly-world/build_scene.py`
- One-command validate/build/render/export wrapper: `scripts/fly-world/run_pipeline.py`
- Preflight validator: `scripts/fly-world/validate_project.py`
- Five fixed benchmark cameras
- Explicit `PROXY__*` blockout naming and visual-approval blocking
- Browser ghost-observer blockout: `frontend/labs/fly-world/`
- Observer/fly separation contract: observer is non-colliding, invisible to future fly sensors, casts no shadow, and never affects fly-world physics
- N-fly-ready semantic root, while the first experiment remains one fly

## Execute in this order

### 1. Verify the package before editing

From repository root:

```bash
python scripts/fly-world/validate_project.py
```

Fix schema/path/license errors first. Missing required hero assets are expected at the start and should appear as visual-approval blockers rather than structural errors.

### 2. Replace required hero proxies

Work through `asset_manifest.json`. Prefer, in order:

1. authored Blender geometry when a reference-specific object matters;
2. CC0 / public-domain source assets;
3. CC-BY-4.0 only when attribution is preserved and the source is trustworthy.

Do not use editorial-only, NC, ND, unknown-license, scraped, or unverified proprietary models.

For every sourced asset, record:

```json
"source": {
  "url": "original asset page",
  "author": "author/studio",
  "license": "CC0-1.0",
  "retrievedAt": "YYYY-MM-DD"
}
```

Place files under `gelistirmeler/2026-09-16-fly-world-prototype/assets/source/<slot-id>/` and set `localPath` in the manifest.

The highest-priority required slots are the objects that establish the room identity: bench/divan, carved cabinet, stove, kettle, old TV, woven basket, main rug, round rug, wooden bed, bedside table, floral curtain, lace curtain, pillow/quilt set, and bed quilt.

### 3. Preserve reference composition

Use `scene_spec.json` anchors and dimensions as the baseline. Small adjustments are allowed to make real assets sit naturally, but do not move walls, doorway, window, stove, divan/cabinet mass, or bedroom composition just to accommodate a convenient downloaded model.

Avoid the "asset-store showroom" look. Materials should be old, lived-in, coherent, slightly worn, and believable, not uniformly pristine. Clutter must feel accumulated rather than procedurally scattered. The room should remain readable at fly scale.

### 4. Run the build repeatedly

```bash
python scripts/fly-world/run_pipeline.py
```

Expected outputs:

```text
gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house.blend
gelistirmeler/2026-09-16-fly-world-prototype/build/fly-house.glb
gelistirmeler/2026-09-16-fly-world-prototype/build/previews/reference-like-wide.png
gelistirmeler/2026-09-16-fly-world-prototype/build/previews/stove-and-doorway.png
gelistirmeler/2026-09-16-fly-world-prototype/build/previews/bench-window.png
gelistirmeler/2026-09-16-fly-world-prototype/build/previews/bedroom-through-door.png
gelistirmeler/2026-09-16-fly-world-prototype/build/previews/fly-scale-floor.png
```

Do not judge the room from one hero shot. Inspect all five fixed views after meaningful changes.

### 5. Pass the strict asset gate

Before calling the environment a visual-review candidate:

```bash
python scripts/fly-world/validate_project.py --strict-assets
```

It must exit successfully. Also inspect the `.blend` for leftover required `PROXY__*` objects. Optional background proxies may remain only if they are visually acceptable and are clearly non-hero elements; do not hide required proxies merely by renaming them.

### 6. Browser handoff

The current browser page is a ghost-observer blockout and deliberately has no fly. Once the separately developed shared glTF/browser infrastructure is available, connect the approved `fly-house.glb` to `frontend/labs/fly-world/` using that shared loader instead of creating a second competing loader stack.

Preserve these runtime rules:

- human observer state must remain outside future fly simulation state;
- observer has no collision or physical influence;
- observer never becomes visible, audible, shadow-casting, heat-emitting, or otherwise detectable to fly sensors;
- mouse/WASD/Q/E ghost navigation remains available for inspection;
- generated scene coordinates/scale stay metric and stable so future sensory and locomotion work can rely on them.

### 7. Stop at environment approval

Do not integrate the connectome, fly body, neural IO, food-seeking logic, reward model, reproduction, or multi-fly simulation in this task. The next stage starts only after the user approves the environment visually.

## Visual acceptance criteria

A candidate is ready to show the user only when all of the following are true:

- the room immediately reads as the selected rustic Fly House, not a generic cabin;
- main room + bedroom relationship is obvious through the open doorway;
- window/curtain, divan/cabinet, stove/pipe, TV, rugs and bed are recognizable and correctly placed;
- required hero assets are authored or correctly licensed and no longer crude primitives;
- scale is believable at both human and fly-height benchmark views;
- five benchmark renders exist and have no obvious clipping, floating furniture, blocked doorway, broken materials or missing textures;
- strict preflight passes;
- no fly/connectome code was added prematurely.

## Deliver back to the user

When finished, report only concrete evidence: branch/commit, strict-preflight result, which asset slots were filled (with licenses), paths to the five benchmark renders, remaining optional proxies if any, and whether the browser GLB integration was completed after the shared infrastructure became available. Do not claim visual approval yourself; the user gives that approval.
