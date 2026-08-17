# Ancient World Context

`frontend/ancient-world/` is the shared foundation for historical first-person experiences. `/ancient-world/` in the desktop shell remains the launcher; individual cities stay independently loadable so a renderer failure cannot take down Aizanoi OS.

## Architecture rule

Share behaviour before replacing renderers. The reusable contract lives under `engine/`; city-specific facts, placement and reconstruction choices live with each city.

- `engine/traversal.js` — player radius, spatial-grid collision, walk surfaces, ramps, height support, substeps, wall slide and safe spawn.
- `engine/lifecycle.js` — RAF/listener/audio teardown.
- `engine/navigation.js` — `← Aizanoi OS` control.
- `assets/materials.js` — renderer-neutral procedural material tokens.

Aizanoi Historic World is currently the traversal reference. Rome is the modular/data-driven reference. Do not copy a new movement implementation into another city.

## Future renderer/library rule

Do not migrate both cities to Three.js/Babylon.js in one change. Keep traversal/input/navigation/evidence independent from rendering. If a Three.js proof-of-concept is introduced, prove parity in Rome first and vendor/pin it locally rather than adding a runtime CDN dependency.

## Historical-data rule

Preserve the distinction between archaeologically supported/documented content and inferred/atmospheric reconstruction. Shared procedural assets must not make an inferred building look more certain than its source metadata supports.

## Regression rule

Any shared-engine change must retest:

- wall/diagonal collision and tunnelling under long frames;
- step-up/down, ramps, bridges and safe spawn;
- teleport followed by immediate movement;
- desktop pointer lock and focus-loss reset;
- mobile movement/look controls;
- `← Aizanoi OS` from normal, pointer-lock and fullscreen states;
- destroy/pagehide cleanup;
- debug API invariants.
