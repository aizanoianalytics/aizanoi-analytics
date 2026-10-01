# Aizanoi Worlds Context

`frontend/worlds/` contains the public Aizanoi product landing plus the canonical Aizanoi runtime infrastructure.

## What lives here

- `index.html` — the public Aizanoi product landing at the stable `/worlds/` route.
- `aizanoi-225/` — the only maintained interactive world. It owns Aizanoi archaeology, source records, city layout, geometry, builders and presentation.
- `shared/` — genuinely reusable runtime infrastructure used by Aizanoi: traversal, collision, input, water, vegetation, environment, tour, UI and the local Three.js r174 vendor copy.
- `vendor/` — the single local Three.js/GLTFLoader vendor tree.

## Architecture rules

- Aizanoi is the **only maintained interactive world**. Rome, Athens, the Istanbul Airport (İGA) companion experience, Fly World and Fly Simulation are retired. Their runtime directories must not be restored, and new modules must not reintroduce a world catalog, a `launchWorld`/`renderWorldCards` path or a `data-world` handler.
- Keep the visitor runtime static-first and browser-local.
- Shared behavior belongs in `shared/`; Aizanoi-specific evidence, layout and hero geometry stay in `aizanoi-225/`.
- Use the single local Three.js r174 vendor under `shared/vendor/`; do not add CDN imports or world-local vendor copies.
- Preserve source/evidence distinctions. Documented, inferred and reconstructed elements must remain visually and structurally distinct; procedural plausibility must never be presented as verified reconstruction.
- Keep Aizanoi independently loadable and usable with keyboard/mouse, touch and a pointer-lock-free fallback on desktop and mobile.
- Aizanoi requires WebGL 2 (three.js r174). Where WebGL 2 is unavailable, the entry net must render the graceful repair card instead of crashing.
- Do not add build scripts, `.bat`/`.sh` launchers, backend services or runtime accounts.
- Browser changes require desktop/mobile smoke coverage with zero fatal page/console errors.