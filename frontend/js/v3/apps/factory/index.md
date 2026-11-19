# Aizanoi Factory

Standalone Ultra HD 3D glass-gilding factory space with two modes: **Free Tour**
exploration (loading ramp, courtyard vehicles, 87 pallet climb course, offices,
kitchen, gilding benches, kiln, and WCs) and **Battle Mode** (Aizanoi Wars
PAC-9 rifle combat against escalating Gull drone and Hound machine waves with
tactical resupply crates). AizanoiOS mounts the standalone `/arcade/factory/`
route in a same-origin iframe; iframe removal on app close releases its
renderer, audio, and global listeners. The standalone route owns the
authoritative CSS and bundled JavaScript.

- `manifest.json` — zero-capability desktop app registration.
- `src/index.js`, `src/app.css` — in-shell launcher and iframe layout.
- [`../../../../arcade/factory/index.md`](../../../../arcade/factory/index.md) — route, building inventory, combat mode, and third-party license.
