# Aizanoi Markets Pipeline

Scope: private ingestion and static publication for `/analytics/markets/`.

## Inputs

- Nasdaq Trader `nasdaqlisted.txt` and `otherlisted.txt` for active US exchange listings.
- `crypto-universe.json` for the owner-selected 35 crypto assets and verified Binance trading pairs.
- Fintable public API responses for daily US close-price history; Binance public klines for daily and recent four-hour crypto close-price history.

## Output

`update_markets.py` atomically writes runtime JSON under `/var/lib/aizanoi-markets/public/`: manifest, health, compact breadth snapshots, market summary indexes and chunks, leader payloads, per-symbol summary items and lazy close-history shards. A compatibility `summary.json` remains for older clients, but current frontends do not fetch it. The directory stays outside Git and immutable application releases.

## Modes

- Initial/full download: `python3 scripts/markets/update_markets.py --mode bootstrap --allow-partial`
- Hourly slice: `python3 scripts/markets/update_markets.py --mode hourly --allow-partial`
- Offline schema/metric migration: `python3 scripts/markets/update_markets.py --mode rebuild`

The default hourly mode refreshes one eighth of US symbols plus all selected crypto assets. Every US symbol rotates through within eight hours. A non-blocking lock suppresses overlap; failed batches preserve last-known-good shards and are reported in the manifest. Rebuild mode performs no upstream requests: it removes legacy non-close candle fields, recomputes derived metrics, and publishes schema-v2 indexes from existing history.

## Tests

- `tests/markets_pipeline_test.py` — parsing, symbol filtering, metrics, batch isolation and atomic publication.
- `tests/markets_product_test.py` — schema-v2 metrics, quality, snapshots, chunks, correlations and migration.
- `tests/markets-pipeline.test.mjs` — runs the Python contract from the repository’s Node test gate.
