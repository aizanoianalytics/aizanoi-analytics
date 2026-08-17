# Ancient World shared engine

This directory is the convergence layer for Aizanoi Analytics historical first-person experiences.

The near-term rule is **share behaviour before replacing the renderer**. Aizanoi Historic World already has mature traversal; Late Antique Rome has the stronger separated city-data model. The engine combines those strengths without forcing a risky all-at-once rewrite.

## Stable contracts

- `traversal.js` — player radius, spatial-grid collision, walk surfaces, ramps, step-up/down limits, sub-stepped wall sliding, support height, hazards and safe spawn resolution.
- `lifecycle.js` — event-listener cleanup, requestAnimationFrame ownership and AudioContext cleanup.
- `navigation.js` — consistent `← Aizanoi OS` escape path for every city.
- `evidence.js` — shared evidence vocabulary and presentation helpers: `archaeological`, `documented`, `plausible`, `atmospheric`.
- `city-contract.js` — renderer-neutral city manifest validation, bounds/spawn/teleport checks and capability summary.
- `performance.js` — hysteresis-based adaptive render-quality controller that can lower/recover DPR without changing city data or traversal.
- `../assets/materials.js` — renderer-neutral material vocabulary shared by procedural cities.

## City contract

A city should increasingly be data + builders, not a new movement engine. `defineAncientCity(...)` validates the common contract before deployment:

```js
{
  id,
  title,
  period,
  spawn,
  bounds,
  districts,
  roads,
  monuments,
  teleportTargets,
  evidence,
  terrain,
  ambience,
  performance
}
```

The contract rejects duplicate record IDs, out-of-bounds spawn/travel positions and teleport references to missing monuments. The engine must not know what a temple, basilica or theatre means. City/building code registers visual geometry plus generic colliders/walk surfaces. Visible terrain and physical support height should come from the same city terrain function.

Rome exposes a real contract adapter at `../../ancient-cities/rome-410-476/data/manifest.js`. New cities start from `../../ancient-cities/_template/` rather than copying Rome's renderer.

## Evidence contract

Visual detail must never silently increase historical confidence. A procedurally generated street block can look convincing and still remain `plausible`. A decorative cart, tree or crowd prop can remain `atmospheric`. Named/source-led places may be `documented`, while a feature directly supported by physical archaeology can be marked `archaeological` when the city research data justifies it.

## Performance contract

Performance policy belongs beside the city manifest, not scattered as magic DPR constants across renderers. A renderer may use `createAdaptiveQualityController(...)` to react to sustained frame-time pressure. Downgrades happen quickly enough to protect interaction; upgrades require a longer stable period to avoid oscillation. Physics, evidence and city geometry semantics never change when the visual tier changes.

## Renderer contract

Traversal, input, navigation, evidence, city manifests and quality policy must stay independent of rendering. The current custom WebGL renderer is allowed. A future Three.js proof-of-concept should replace only the renderer/builder layer and consume the same city/traversal contracts.

Do **not** migrate both cities to Three.js/Babylon.js in one change. First prove parity in Rome, including collision, terrain, stairs/ramps, mobile controls, teleport, evidence labels, adaptive quality, performance and teardown.

## Shared asset direction

Prefer reusable parametric vocabulary for repeated urban fabric (wall, gate, insula, basilica, church, market, bath, road, column, roof, vegetation). Reserve bespoke high-detail geometry/GLB assets for hero monuments where generic builders visibly fail. A renderer migration should make that asset vocabulary easier to render, not force city research data to be rewritten.
