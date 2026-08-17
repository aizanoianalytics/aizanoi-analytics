# Historic World Context

`index.html` is a self-contained WebGL reconstruction of Roman Aizanoi. It has no CDN or runtime API dependency and is served at `/historic-world/`.

## System map

- **Player movement** — keyboard/touch state, `moveWithSubsteps`, `updatePlayer`, focus-loss reset.
- **Collision** — collider registry/grid and `collide`; building geometry may register solid colliders.
- **Terrain / elevation** — walk surfaces, `absoluteSupportAt`, `resolveSupport`, `floorY`, `surfaceTag`.
- **Stairs / ramps** — `stairFlights`, `registerWalkRect`, `registerWalkRampBetween`, tread-by-tread geometry.
- **Gravity / jump** — verify the actual current implementation before adding or changing behavior; do not assume a feature exists because the UI has movement.
- **Jump To / travel** — `teleportTo`, `teleportViews`, `resetMovementState`, spawn resolution and travel lock/flash.
- **Camera** — `player.yaw`, `player.pitch`, eye height and WebGL view/projection setup.
- **Buildings / world interaction** — builders, landmarks, inspect prompts, labels, atlas, sources and historical eras.
- **Lighting / rendering** — WebGL shaders, sky, render loop, quality settings and mobile detail reduction.

## Regression rule

Any change to collision must retest movement, stairs, terrain support, jump/vertical state if present, and building boundaries. Any change to Jump To must retest player position, `floorY`, camera state, movement lock, and normal WASD/touch movement afterward. Any terrain/elevation change must retest camera height, stairs, collisions and all important spawn points.

## Required checks

- Parse every inline script with Node before deployment.
- Test desktop WASD, mouse look/pointer-lock fallback, touch controls, wall/diagonal collision, stairs up/down, terrain/elevation transitions, inspect, atlas, eras, time slider and every Jump To target.
- Check console errors and WebGL initialization failure fallback.
- Compare mobile and desktop performance; do not add large external assets without a budget review.
- Keep archaeological certainty labels and source links intact. Separate excavated facts from inferred visual detail.
