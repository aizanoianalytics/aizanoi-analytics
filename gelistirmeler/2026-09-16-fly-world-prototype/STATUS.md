# Status

Branch: `fly-world-prototype`

Current environment: **Fly House** — rustic living room + connected bedroom based on the approved people-free reference illustration.

## Technical package

**Handoff-ready.** The reference-locked environment package now contains:

- canonical metric scene specification;
- asset/license manifest and source-asset intake contract;
- Blender build/render/GLB export pipeline;
- preflight validation, including a strict visual-asset gate;
- five fixed benchmark cameras;
- browser ghost-observer blockout;
- explicit separation between human observer state and the future fly sensory/physics world;
- a detailed Hermes execution handoff in `HERMES_HANDOFF.md`.

## Remaining execution work

The required hero asset slots are intentionally not represented as fake "final" art. Hermes must source or author them, preserve provenance/license metadata, run the Blender pipeline, iterate against all five benchmark views, and pass `validate_project.py --strict-assets` before presenting a visual-review candidate.

Browser GLB integration should use the separately developed shared glTF infrastructure once that work lands; this branch should not create a competing loader stack.

## Explicitly not started

Fly/connectome runtime. The environment must receive user visual approval first.
