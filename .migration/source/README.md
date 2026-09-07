# Historical Worlds runtime

`frontend/worlds/` is the canonical public home for Aizanoi Analytics interactive worlds.

## Public routes

- `/worlds/aizanoi-225/` — Roman Aizanoi, AD 225.
- `/worlds/rome-410-476/` — Late Antique Rome, AD 410–476.
- `/worlds/athens-450-430/` — Classical Athens, 450–430 BCE.
- `/worlds/iga-airport/` — present-day Istanbul Airport interpretation.

The branded `/worlds/` portal remains the product landing. Legacy `/historic-world/`, `/ancient-cities/*` and `/iga/` URLs are redirects only.

## Runtime contract

All four experiences are static ES modules over one shared runtime. `shared/` owns controls, collision, UI, environment, water, vegetation, particles, audio, common procedural assets and the locally vendored Three.js r174 modules. World-local folders own scene data and dedicated procedural builders.

There is no runtime CDN, build step, account/backend requirement or external model dependency. Do not add `.gltf`/`.glb` or a second Three.js copy without an explicit architecture decision.

Historical confidence is separate from visual detail. Documented/source-supported, archaeological/material, inferred/plausible and atmospheric reconstruction must remain distinguishable. The Istanbul Airport world follows the same source/transparency discipline even though it is a present-day companion rather than a historical reconstruction.
