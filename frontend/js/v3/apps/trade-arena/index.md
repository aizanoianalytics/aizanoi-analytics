# AI Trade Arena AizanoiOS app

Independent desktop app. Public entry: `src/index.js`; manifest: `manifest.json`. Requires no host capabilities. Embeds the first-party public [Trade Arena](../../../../arcade/trade-arena/index.md) document; no cross-app private imports. Close navigates the frame to about:blank, removes it and releases its stylesheet, terminating its worker/RAF document tree. All simulation state and storage belong to the standalone arena.

Tests: `tests/trade-arena.test.mjs`, `tests/browser/trade-arena.test.mjs`. Private implementation: `src/`.
