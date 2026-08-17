# Aizanoi Analytics Ancient World

Ancient World is a reusable historical first-person platform, not a collection of unrelated WebGL demos.

## Current reference worlds

- `/historic-world/` — Roman Aizanoi; strongest current traversal/elevation/collision implementation.
- `/ancient-cities/rome-410-476/` — Late Antique Rome; strongest separated city/source data model and the first consumer of the shared engine foundation.

## Platform goal

Future worlds (for example Ephesus, Pompeii or another source-led city) should reuse movement, collision, mobile input, teleport, minimap, evidence UI, lifecycle and Aizanoi OS navigation. Adding a city should mostly mean historical research + city data + terrain + monument/urban-fabric builders.

```text
Ancient World engine
├── traversal / collision / support
├── input / lifecycle / navigation
├── evidence / POI / minimap
├── renderer contract
└── shared procedural assets
     ├── materials
     ├── walls / gates
     ├── roads
     ├── insulae / houses
     ├── basilicas / churches
     ├── markets / baths
     └── vegetation / clutter

Cities
├── Aizanoi
├── Rome AD 410–476
└── future city data
```

## Evidence vocabulary

The long-term city contract should explicitly distinguish:

- `archaeological` — physical archaeological evidence supports the represented feature;
- `documented` — historical/topographical sources support it but the exact restitution may be incomplete;
- `plausible` — informed reconstruction used to complete an unresolved urban/architectural gap;
- `atmospheric` — illustrative ambience/clutter that is not a claim about an exact excavated object or placement.

Visual quality must never erase this distinction.

## Renderer/library plan

The shared engine is renderer-independent. Keep current custom WebGL while extracting stable behaviour. When Rome is mechanically reliable, evaluate a locally pinned/vendored Three.js renderer proof-of-concept for:

- GLTF/GLB hero monuments;
- instancing repeated columns/houses/vegetation;
- frustum/LOD support;
- one-light shadow strategy;
- easier material and texture pipelines.

Do not migrate Aizanoi until Rome proves feature and performance parity. Babylon.js remains a valid alternative if future requirements make its terrain/physics stack materially more useful, but there is no current reason to add a full physics engine for walking, ramps and static architecture.

## Asset policy

Use procedural/shared assets for repeatable urban fabric. Use bespoke geometry or GLB only for hero monuments whose identity is lost in a generic builder. Keep runtime CDN dependencies out of the historical worlds; pin assets and libraries in-repo so deployments remain reproducible.
