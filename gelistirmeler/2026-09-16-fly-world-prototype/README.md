# Fly World Prototype — Fly House v0.3

Isolated visual/technical prototype for the future long-running fly/connectome experiment.

## Canonical environment

The environment is the user-approved, people-free illustrated cottage: a dense old living room connected through an open doorway to a bedroom. The goal is to reproduce that specific composition as closely as practical in navigable 3D, not merely create a generic rustic house.

The visible reference anchors and current acceptance bar are documented in `REFERENCE_BREAKDOWN_V3.md`.

## Current technical package

The branch contains:

1. a metric reference-driven room/object contract in `scene_spec.json`;
2. licensed/authored hero-asset slots and provenance rules in `asset_manifest.json`;
3. Blender v0.3 build/render/export automation under `scripts/fly-world/`;
4. a dedicated v0.3 detail pass for the small reference-specific household dressing;
5. five fixed benchmark camera views;
6. a collision-capable browser fallback at `frontend/labs/fly-world/main-v3.js`;
7. Blender GLB loading at `frontend/labs/fly-world/glb-runtime-v3.js`;
8. a preflight validator covering scale, observer semantics, quality gates and asset intake;
9. a current-branch AizanoiOS `Fly World` desktop integration;
10. a build/review handoff for the current branch (not a private runtime bridge);

## Observer contract

The human visitor is a **ghost relative to the future fly simulation**, not a noclip camera. Normal navigation collides with the house, windows and major furniture. `N` is debug noclip only. The observer remains invisible to future fly sensors, casts no fly-world shadow/sound/heat and does not affect fly physics.

## Validate

From repository root:

```bash
python scripts/fly-world/validate_project.py --strict-assets
```

The strict gate requires every hero asset marked `requiredForVisualApproval` to be configured, correctly licensed and present locally. A passing validator is necessary but does not itself grant visual approval.

## Build v0.3

With Blender installed or `BLENDER_BIN` set:

```bash
python scripts/fly-world/run_pipeline.py --strict-assets
```

The wrapper builds the v0.3 `.blend`, exports a browser-ready Z-up `fly-house.glb`, and renders the five review cameras. The browser copy is published to `frontend/labs/fly-world/assets/fly-house.glb` so `bootstrap.js` automatically switches from the authored fallback to the Blender scene.

## Quality rule

Visual approval requires comparison of the five renders and a live walkthrough against the approved people-free reference. If the environment still reads as a generic rustic house rather than this particular cottage, continue iterating. Do not add the fly/connectome runtime until the environment receives user visual approval.
