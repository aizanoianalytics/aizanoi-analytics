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

## Execution record (2026-09-16, Hermes)

- All 14 required hero slots filled with studio-authored Blender assets
  (`scripts/fly-world/author_heroes.py`, CC0-1.0), placed at spec anchors.
- `validate_project.py --strict-assets` passes (14/14 required ready).
- Full pipeline run: `build/fly-house.blend` (5.0M), `build/fly-house.glb`
  (1.2M), five benchmark renders in `build/previews/`.
- Zero required `PROXY__*` remain in the `.blend`; 21 optional proxies stay
  (18 clutter, blue-bag, bookshelf, bedroom-curtain).
- Browser GLB wiring intentionally deferred: shared glTF loader infrastructure
  was not available on this branch; `frontend/labs/fly-world/` remains the
  ghost-observer blockout. No fly/connectome code added.
- AizanoiOS `Fly World` fullscreen app added (registry + `apps/fly-world/` +
  desktop icon); verified headless from the desktop with zero console errors.

## Explicitly not started

Fly/connectome runtime. The environment must receive user visual approval first.
