# Fly World Prototype — Fly House

Isolated visual/technical prototype for the future long-running fly/connectome experiment.

## Canonical environment

The environment is no longer an Aizanoi courtyard. The canonical reference is the user-approved, people-free illustration of a dense rustic living room connected through an open doorway to a bedroom.

The goal is to reproduce that composition as closely as practical in 3D, not merely create a generic rustic room.

## Technical package

The branch contains:

1. a metric, reference-locked room and object specification in `scene_spec.json`;
2. licensed/authored asset slots and provenance rules in `asset_manifest.json`;
3. Blender build/render/export automation under `scripts/fly-world/`;
4. five fixed benchmark camera views;
5. a browser ghost-observer blockout at `frontend/labs/fly-world/`;
6. a preflight validator that prevents broken manifests and unlicensed asset intake;
7. a detailed execution handoff for Hermes in `HERMES_HANDOFF.md`.

## Validate first

From repository root:

```bash
python scripts/fly-world/validate_project.py
```

This validates the project structure while allowing missing hero assets to remain explicit visual-approval blockers.

Before presenting a visual-review candidate:

```bash
python scripts/fly-world/validate_project.py --strict-assets
```

The strict gate requires every asset marked `requiredForVisualApproval` to be configured, licensed correctly and present locally.

## Build

With Blender installed or `BLENDER_BIN` set:

```bash
python scripts/fly-world/run_pipeline.py
```

The wrapper performs preflight validation first, then writes the `.blend`, `.glb`, and five preview renders under `build/`.

## Quality rule

Procedural boxes/cylinders are permitted only as explicit `PROXY__*` blockout objects. They are not acceptable as the visually approved final hero furniture. The fly/connectome must not be integrated until the environment passes user visual review.
