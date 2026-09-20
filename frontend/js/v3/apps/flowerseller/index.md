# Flowerseller

Flowerseller is a frontend-only Turkish boutique flower shop proof of concept for AizanoiOS.

- Public entry: `src/index.js`
- Capabilities: none (`requires: []`)
- Catalog: 25 products with sale pricing, ratings, reviews, stock, same-day metadata and 15 locally served WebP photographs
- Variants: every product is configurable by size (`Küçük`/`Orta`/`Büyük`) and optional add-ons (`Çikolata`, `Premium hediye paketi`, `Cam vazo`); cart line identity is `productId::variantId::addons::message` so different variants of the same product stay separate line items
- State: cart, favorites, completed demo orders and the optional `BAHAR10` coupon persist in `localStorage` under `aizanoi.flowerseller.v1.*` keys; PII (recipient name, phone, address, card message) is never persisted
- Money: every total is computed in integer minor units (kuruş) to keep totals deterministic
- Demo semantics: checkout is a 3-step frontend simulation (Teslimat → Alıcı → Ödeme); the payment form carries an explicit "Demo ödeme" notice, never collects or persists card data and never contacts a backend
- Order tracking: each completed demo order receives a deterministic unique id (`FS-XXXXXXXX`) and a simulated status timeline; the orders tab supports lookup and a clean "not found" state for unknown ids
- Accessibility: every overlay records its opener, traps focus, marks the rest of the window `inert`, closes on Escape and restores focus to the opener
- Owned assets: `src/...` (logic + safe DOM helpers) and `assets/photos/flower-01..15.webp` (sourced and attributed in `assets/SOURCES.md`)
- Tests: `tests/aizanoi-os-flowerseller-module.test.mjs`, `tests/aizanoi-os-flowerseller-storage.test.mjs`, `tests/aizanoi-os-flowerseller-safe.test.mjs` and `tests/browser/aizanoi-os-flowerseller.test.mjs`
- Boundary: the POC must not import another module, call `api.*`, or imply real checkout/payment
