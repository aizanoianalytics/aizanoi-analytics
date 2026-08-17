# Ancient World shared engine

This directory is the convergence layer for Aizanoi Analytics historical first-person experiences.

The near-term rule is **share behaviour before replacing the renderer**. Aizanoi Historic World already has mature traversal; Late Antique Rome has the stronger separated city-data model. The engine combines those strengths without forcing a risky all-at-once rewrite.

## Stable contracts

- `traversal.js` — player radius, spatial-grid collision, walk surfaces, ramps, step-up/down limits, sub-stepped wall sliding, support height, hazards and safe spawn resolution.
- `lifecycle.js` — event-listener cleanup, requestAnimationFrame ownership and AudioContext cleanup.
- `navigation.js` — consistent `← Aizanoi OS` escape path for every city.
- `evidence.js` — shared evidence vocabulary and presentation helpers: `archaeological`, `documented`, `plausible`, `atmospheric`.
- `../assets/materials.js` — renderer-neutral material vocabulary shared by procedural cities.

## City contract

A city should increasingly be data + builders, not a new movement engine. A future city module should describe:

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
  ambience
}
```

The engine must not know what a temple, basilica or theatre means. City/building code registers visual geometry plus generic colliders/walk surfaces. Visible terrain and physical support height should come from the same city terrain function.

## Evidence contract

Visual detail must never silently increase historical confidence. A procedurally generated street block can look convincing and still remain `plausible`. A decorative cart, tree or crowd prop can remain `atmospheric`. Named/source-led places may be `documented`, while a feature directly supported by physical archaeology can be marked `archaeological` when the city research data justifies it.

## Renderer contract

Traversal, input, navigation and evidence must stay independent of rendering. The current custom WebGL renderer is allowed. A future Three.js proof-of-concept should replace only the renderer/builder layer and consume the same city/traversal contracts.

Do **not** migrate both cities to Three.js/Babylon.js in one change. First prove parity in Rome, including collision, terrain, stairs/ramps, mobile controls, teleport, evidence labels, performance and teardown.

## Shared asset direction

Prefer reusable parametric vocabulary for repeated urban fabric (wall, gate, insula, basilica, church, market, bath, road, column, roof, vegetation). Reserve bespoke high-detail geometry/GLB assets for hero monuments where generic builders visibly fail.
