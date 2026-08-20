# Aizanoi Analytics Ancient World

Ancient World is now one reusable historical first-person platform. Aizanoi, Rome and Athens share the same runtime, movement/collision system, mobile controls and blocky procedural asset library; city folders primarily own historical data and layout.

## Runtime architecture

```text
frontend/ancient-world/
├── engine/
│   ├── flat-city-runtime.js      # shared WebGL renderer + flat Y=0 world
│   ├── traversal.js              # movement, collision, support, safe spawn
│   ├── mobile-controls.js        # analog touch movement/look
│   ├── lifecycle.js              # cleanup / frame lifecycle
│   ├── navigation.js             # ← Field System
│   ├── city-compatibility.js     # deep links + legacy debug API
│   └── ...
└── assets/
    ├── blocky-asset-library.js   # houses, temples, baths, theatres, bridges...
    ├── city-layout-tools.js      # large-wall normalization / layout transforms
    ├── materials.js              # shared historical material vocabulary
    └── urban-fabric-tools.js     # deterministic city infill placement
```

City-owned data remains separate:

```text
frontend/historic-world/data/                 # Aizanoi
frontend/ancient-cities/rome-410-476/data/    # Rome
frontend/ancient-cities/athens-450-430/data/  # Athens
```

Each city adapter now mainly does four things: load city data, generate explicitly plausible urban fabric, normalize layout records where needed, and call `startFlatBlockyCity(...)`.

## Flat-ground rule

Playable city ground is intentionally **Y=0 everywhere**. The shared traversal runtime supplies `baseHeightAt: () => 0`.

Historical terrain datasets for Rome and Athens are retained in their city folders as research/reference data, but they do not drive live traversal. Monument podiums, bridge decks and other authored structures may still create local walk surfaces above Y=0.

This trades topographic realism for predictable movement, collision, teleport and city expansion. If topography returns later, it must be introduced as an explicit reusable asset/platform feature rather than city-specific physics.

## Asset rule

This is **blocky / low-poly**, not a true Minecraft-style voxel engine. A building may look as though it is assembled from blocks, but the renderer uses a small number of procedural boxes/cylinders/roof primitives rather than millions of 1 m³ voxels, chunks or greedy-mesh rebuilds.

Shared assets cover repeatable vocabulary such as:

- houses, shops and villas;
- temples, basilicas, churches and sanctuaries;
- baths, theatres, stadiums, amphitheatres and markets;
- walls, gates, bridges, roads and water;
- cemeteries, columns, statues and civic massing.

Identity-critical monuments keep dedicated hero builders. Current examples include the Parthenon, Propylaea, Colosseum, Pantheon and Aizanoi Temple of Zeus.

## Evidence vocabulary

Visual modularity does not change evidence status:

- `archaeological` — physical archaeological evidence supports the represented feature;
- `documented` — historical/topographical sources support it but exact restitution may be incomplete;
- `plausible` — informed reconstruction used to complete an unresolved urban/architectural gap;
- `atmospheric` — illustrative ambience/clutter that is not a claim about an exact excavated object or placement.

Procedural urban fabric remains `plausible` and must stay subordinate to named monuments and documented routes.

## Adding a city

A new city should normally require:

1. city/source records;
2. regions and streets;
3. named monument placements using existing asset types or a small number of new hero assets;
4. optional deterministic urban-fabric generation;
5. water/layout records;
6. a thin adapter calling the shared runtime;
7. browser smoke coverage for movement and landmark teleports.

Do not fork movement, collision, mobile controls or the renderer into a new city-specific `app.js` without an explicit architecture reason.
