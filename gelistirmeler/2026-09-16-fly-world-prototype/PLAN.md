# Fly House implementation plan

## Product decision

- Build the user-approved people-free illustrated cottage interior rather than the earlier 12×12 m ancient courtyard concept.
- Reproduce the visible reference composition closely: barred window + layered curtains, wall clock/cage detail, long carved divan/cabinet wall, old CRT cabinet, central wood stove/hearth/long pipe, layered floor textiles and dense household clutter, open doorway and connected bedroom.
- Keep the house slightly roomier than the literal illustration so it remains comfortable to inspect and later supports a fly-scale simulation without feeling like a cramped diorama.
- Human visitors are ghost observers **relative to the fly simulation**: they are invisible to fly sensors, cast no fly-world shadow/sound/heat and never affect fly physics. For human navigation, wall/window/major-furniture collision is ON by default; `N` is debug noclip only.
- Architecture remains N-fly-ready but the first experiment will use one fly.
- Browser fallback and Blender GLB must describe the same house, scale and coordinate convention. Fly World is Z-up.

## Current sequence

1. Reference-locked room shell and five benchmark views — implemented.
2. Authored hero assets and license manifest — implemented; strict asset gate exists.
3. Enlarged collision-capable room + browser/GLB loading — implemented.
4. v0.3 reference-detail pass — implemented in browser and Blender source.
5. Run Blender v0.3 and visually review the five fixed renders + live walkthrough.
6. Iterate until the environment is visually approved.
7. Only then: world physics/sensory semantics and Fly #001/connectome integration.

The visual gate is human review, not simply successful code execution. A scene that functions but reads as a generic rustic house is still unfinished.
