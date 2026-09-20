# Flowerseller

Flowerseller is a temporary, frontend-only boutique flower shop proof of concept for AizanoiOS.

- Public entry: `src/index.js`
- Capabilities: none (`requires: []`)
- Owned state: in-memory basket and UI tab state only; no network or persistence
- Owned assets: product visuals are CSS/SVG treatments in `src/app.js`, with the catalog icon at `frontend/assets/icons/aizanoi-flowerseller.svg`
- Tests: `tests/aizanoi-os-flowerseller-module.test.mjs` and `tests/browser/aizanoi-os-flowerseller.test.mjs`
- Boundary: this POC must not import another module, call `api.*`, or imply real checkout/payment
