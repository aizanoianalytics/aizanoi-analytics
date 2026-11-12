# Aizanoi Wars

Independent first-person harbor-action game. AizanoiOS mounts the standalone `/arcade/aizanoi-wars/` route in a same-origin iframe; iframe removal on app close releases its renderer, audio and global listeners. The standalone game owns the authoritative CSS and bundled JavaScript. This is separate from Aizanoi Dungeon and the seven Arcade mini-games.

- `manifest.json` — zero-capability desktop app registration.
- `src/index.js`, `src/app.css` — in-shell launcher and iframe layout.
- [`../../../../arcade/aizanoi-wars/index.md`](../../../../arcade/aizanoi-wars/index.md) — game/provenance/third-party license.
