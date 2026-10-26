# AI Snake Royale AizanoiOS app

First-party in-shell arena. Public entry: `src/index.js`; zero host capabilities and no storage. Reuses the public deterministic engine, runner and bot roster of [`../../../../arcade/snake-royale/index.md`](../../../../arcade/snake-royale/index.md), not an iframe. Workers are terminated on close/restart; fetch and delays are cancelled. CSS and UI belong to this module; standalone page stays independent.

Tests: `tests/aizanoi-os-snake-royale-module.test.mjs`, `tests/browser/aizanoi-os-snake-royale.test.mjs`. Private implementation must not be imported by other modules.
