# Rome Three.js renderer PoC

Experimental renderer only. **Do not deploy this folder as the production Rome experience.** The production route remains `frontend/ancient-cities/rome-410-476/` on `main` until parity is proven.

## Goal

Test whether Three.js materially improves renderer maintainability and future GLB/texture support **without replacing** Aizanoi's existing city contract, evidence model or traversal physics.

The PoC consumes:

- `ROME_MANIFEST` for world bounds and performance policy;
- the existing Late Antique Rome monument/road/region data;
- the existing Rome terrain height function;
- the deterministic inferred urban-fabric generator;
- the shared `createTraversalSystem(...)` collision/support implementation;
- the shared adaptive-quality controller.

It deliberately does **not** create a second physics engine.

## Local setup

```bash
cd experiments/threejs-rome-renderer
npm install
python3 -m http.server 8080 --directory ../..
```

Then open `/experiments/threejs-rome-renderer/` on the local server. `npm install` runs the `prepare` script, which copies the pinned Three.js ES module into the ignored local `vendor/` directory. There is no runtime CDN dependency.

## Acceptance gate before any production migration

The experiment must beat or match the current renderer on all of these before a migration PR is considered:

1. ground-level eye height and stable terrain support;
2. wall/building collision and diagonal slide;
3. bridge ramp/deck traversal and Tiber hazard behaviour;
4. teleport + immediate movement parity;
5. desktop pointer-lock and focus-loss reset;
6. mobile movement/look parity;
7. historical evidence labels remain independent of visual detail;
8. no runtime CDN or tracking dependency;
9. acceptable draw calls/triangles and adaptive DPR on mobile;
10. teardown/lifecycle parity;
11. a clear visual improvement on hero monuments after GLB or dedicated builders are added.

## Current PoC scope

This phase proves renderer plumbing and shared-engine compatibility. Named monuments are still proxy geometry except for lightweight Colosseum/Pantheon treatments. It is **not** evidence that Three.js is automatically visually better; that decision comes after a hero-asset comparison.

## Next experiment

Add one locally licensed/owned GLB hero asset (recommended: Colosseum or Pantheon), load it with a locally vendored Three.js addon, compare:

- load size;
- parse/startup time;
- triangle/draw-call cost;
- visual quality;
- collision alignment;
- mobile performance.

Only then decide whether to migrate Rome's production renderer.
