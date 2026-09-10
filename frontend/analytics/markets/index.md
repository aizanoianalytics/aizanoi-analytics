# Aizanoi Markets Frontend

Scope: the static visitor product at `/analytics/markets/` and its shared AizanoiOS dashboard runtime.

## Owners

- `index.html` — metadata, product shell, methodology and non-advisory disclosure.
- `markets.css` — responsive standalone and AizanoiOS presentation.
- `app.js` — standalone mount entry.
- `dashboard.js` — shared market overview, signals, explorer, crypto-risk and data-health views.
- `core.js` — pure formatting, filtering, watchlist, CSV and technical-indicator helpers.
- `instrument/` — generic per-instrument chart workspace with frequency, timeframe, overlays and oscillators.
- `metrics.js` — backwards-compatible pure close-price metric helper used by tests.

## Data boundary

The browser reads versioned static files below `/analytics/markets/data/`: manifest, compact pulse/health snapshots, lazy market summary chunks, per-symbol summary items and close-price history shards. Production Nginx aliases that URL to `/var/lib/aizanoi-markets/public/`; runtime snapshots are not committed and the browser never contacts Yahoo Finance directly.

The private writer is `scripts/markets/update_markets.py`. This directory owns no credentials, server process or upstream ingestion logic.

## Tests

- `tests/aizanoi-markets.test.mjs`
- `tests/markets-product-core.test.mjs`
- `tests/markets-product-ui.test.mjs`
- `tests/browser/aizanoi-markets.test.mjs`

## AizanoiOS app

`js/v3/apps/markets/` is the AizanoiOS desktop module. Its public entry imports the shared public `dashboard.js` owner rather than duplicating product logic. The Analytics app remains independent and no module-private implementation is imported.
