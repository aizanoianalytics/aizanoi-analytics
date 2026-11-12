# Aizanoi Wars

Standalone route `/arcade/aizanoi-wars/`. Derived from the owner-supplied `Saltline (Copy).html` (SHA-256 `1bd0a5edc4a9fb212aab7cdc8fa6fc31bcb4f8aa43a8f29da93a226d69e9edcb`). The original remains outside the public repository.

- `index.html`: CSP-compatible page and rebranded boot UI.
- `game.css`: original inline CSS externalized; font-family lists use system fallbacks rather than Google Fonts.
- `game.js`: owner's bundled script externalized, rebranded (`SALTLINE` → `AIZANOI WARS`, `Saltline` → `Aizanoi Wars`), trailing whitespace normalized and two strict-CSP fixes: compass tick labels use DOM nodes with CSSOM position assignments instead of injected `style=` markup, and the optional benchmark overlay uses authored CSS rather than `cssText`. Gameplay loop, combat, assets and renderer otherwise remain as supplied. Original embedded script SHA-256: `8d0057dc4d6dac77e20be2ef1f2b623e19346b5803fde1b3dbabbab508d75d9d`. The bundled Three.js engine is revision 180; the source distribution is minified and has no source map, so separating the vendor without a reproducible original build graph risks changing the game. Do not edit minified symbols without a rebuild.
- `THIRD_PARTY_NOTICES.txt`: upstream Three.js r180 MIT license. https://github.com/mrdoob/three.js/tree/r180

Game loop: launch, sever three uplink relays, survive enemies, extract by boat. Rendering, controls, procedural world, sound and UI remain from the supplied artifact. No backend, network assets or external fonts required.
