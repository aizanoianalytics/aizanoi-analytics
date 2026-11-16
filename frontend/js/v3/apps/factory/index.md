# Aizanoi Factory

Standalone free-roam Ultra HD 3D architectural space: the glass-gilding factory
(`Cam Tezyinat Fabrikası`), its loading ramp, courtyard vehicles and enterable
interior rooms (offices, kitchen, gilding benches, kiln, and WCs). AizanoiOS
mounts the standalone `/arcade/factory/` route in a same-origin iframe; iframe
removal on app close releases its renderer, audio and global listeners. The
standalone route owns the authoritative CSS and bundled JavaScript.

- `manifest.json` — zero-capability desktop app registration.
- `src/index.js`, `src/app.css` — in-shell launcher and iframe layout.
- [`../../../../arcade/factory/index.md`](../../../../arcade/factory/index.md) — route, building inventory and third-party license.
