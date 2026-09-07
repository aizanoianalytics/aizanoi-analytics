# Worlds Context

`frontend/worlds/` is the canonical runtime for Aizanoi, Rome, Athens and the Istanbul Airport companion experience.

- Keep the visitor runtime static-first and browser-local.
- Shared behavior belongs in `shared/`; world-specific evidence, layout and hero geometry stay world-local.
- Use the single local Three.js r174 vendor under `shared/vendor/`; do not add CDN imports or world-local vendor copies.
- Preserve source/evidence distinctions. Procedural plausibility must never be presented as verified reconstruction.
- Keep all four worlds independently loadable and usable with keyboard/mouse and touch controls.
- Do not add build scripts, `.bat`/`.sh` launchers, backend services or runtime accounts.
- Browser changes require desktop/mobile smoke coverage with zero fatal page/console errors.
