# Aizanoi Markets Frontend

Scope: the static visitor dashboard at `/analytics/markets/`.

## Owners

- `index.html` — metadata, US/Crypto tab shell, methodology and non-advisory disclosure.
- `markets.css` — responsive desktop, tablet and mobile presentation.
- `app.js` — static snapshot loading, filtering, ranking and lazy instrument detail.
- `metrics.js` — pure browser-side metric contract used by tests and interactive views.

## Data boundary

The browser reads `/analytics/markets/data/manifest.json`, `summary.json` and symbol shards under `history/{us,crypto}/`. Production Nginx aliases that URL to `/var/lib/aizanoi-markets/public/`; runtime snapshots are not committed and the browser never contacts Yahoo Finance directly.

The private writer is `scripts/markets/update_markets.py`. This directory owns no credentials, server process or Yahoo ingestion logic.

## Tests

- `tests/aizanoi-markets.test.mjs`
- `tests/markets-pipeline.test.mjs`
