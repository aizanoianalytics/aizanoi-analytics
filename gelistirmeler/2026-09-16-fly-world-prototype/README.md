# Fly World Prototype — Fly House

Isolated visual/technical prototype for the future long-running fly/connectome experiment.

## Canonical environment

The environment is no longer an Aizanoi courtyard. The canonical reference is the user-approved, people-free illustration of a dense rustic living room connected through an open doorway to a bedroom.

The goal is to reproduce that composition as closely as practical in 3D, not merely create a generic rustic room.

## Current milestone

1. Build the room shell and reference-locked blockout.
2. Replace hero proxies with authored or correctly licensed free assets through Blender.
3. Render the five benchmark camera views.
4. Expose a browser ghost-observer view that is not part of fly physics or fly sensory input.
5. Do not integrate the fly/connectome until the environment passes visual review.

Canonical dimensions and object anchors are in `scene_spec.json`. Asset acquisition slots and licensing rules are in `asset_manifest.json`.

The Blender automation lives under `scripts/fly-world/`. The browser blockout lives at `frontend/labs/fly-world/`.
