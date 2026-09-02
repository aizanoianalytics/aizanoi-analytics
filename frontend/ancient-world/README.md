# Aizanoi Analytics Ancient World

Ancient World is one reusable historical first-person platform. Aizanoi, Rome and Athens share the same renderer, traversal/collision system, mobile controls, compatibility layer, share-link contract, Research Lens and blocky procedural asset library. City folders primarily own historical data, chronology, layout choices and optional deterministic urban fabric.

## Runtime architecture

```text
frontend/ancient-world/
├── engine/
│   ├── city-bootstrap.js         # canonical city bootstrap / platform owner
│   ├── flat-city-runtime.js      # shared WebGL renderer + flat Y=0 world
│   ├── traversal.js              # movement, collision, support, safe spawn
│   ├── mobile-controls.js        # analog touch movement/look
│   ├── lifecycle.js              # cleanup / frame lifecycle
│   ├── navigation.js             # ← AizanoiOS escape path
│   ├── city-compatibility.js     # legacy ?jump= + debug compatibility
│   ├── shareable-location.js     # canonical ?at= + declared ?period=
│   ├── evidence.js               # shared evidence vocabulary
│   ├── evidence-mode.js          # interactive Research Lens
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

A city adapter should now be declarative: load its city/source data, choose the shared compaction profile, provide optional urban-fabric generation and call `startAncientCity(...)`. It must not own renderer, traversal, compatibility, Research Lens or mobile-input implementation.

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

## Evidence vocabulary and Research Lens

Visual modularity does not change evidence status. Authored records retain their source labels. The platform supports:

- `archaeological` — physical archaeological evidence supports the represented feature;
- `documented` — historical/topographical sources support it but exact restitution may be incomplete;
- `plausible` — legacy authored label for informed reconstruction;
- `inferred` — Research Lens grouping for informed reconstruction where exact form/placement is unresolved;
- `atmospheric` — illustrative ambience/clutter that is not a claim about an exact excavated object or placement;
- `disputed` — a contested identification or restitution that must remain visibly interpretive.

Research Lens groups legacy `plausible` records under the user-facing **Inferred** category without mutating the authored city data. Procedural urban fabric remains `plausible` in source data and must stay subordinate to named monuments and documented routes.

Press **V** or use the floating **Evidence** control to open Research Lens. It shows the evidence legend plus the nearest labelled landmark, note and distance, and can move the visitor to that record through the same safe teleport system.

## Shareable locations

Canonical links use:

```text
?at=<landmark-id>
?at=<landmark-id>&period=<declared-era>
```

Successful in-world teleports update `at=`. The older `?jump=` form remains supported by `city-compatibility.js` for existing links but is not the canonical share format.

Chronology is city-declared. A period query cannot activate a dormant/unpublished visual layer. Aizanoi currently exposes AD 225 and AD 425 as shareable active periods; the retained AD 301 dataset layer remains dormant.

## Static research surfaces

Interactive reconstruction must not be the only way to inspect the project basis. Rome and Athens retain their static research routes, and Aizanoi exposes `/historic-world/research/` with the reconstruction boundary, evidence vocabulary and project source ledger.

## Adding a city

A new city should normally require:

1. city/source records;
2. regions and streets;
3. named monument placements using existing asset types or a small number of new hero assets;
4. optional deterministic urban-fabric generation;
5. water/layout records;
6. a thin adapter calling `startAncientCity(...)`;
7. browser smoke coverage for movement, landmark teleports, Research Lens and share links where applicable.

Do not fork movement, collision, mobile controls, compatibility or the renderer into a new city-specific `app.js` without an explicit architecture reason.
