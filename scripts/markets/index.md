# Aizanoi Markets Pipeline

Scope: private ingestion and static publication for `/analytics/markets/`.

## Inputs

- Nasdaq Trader `nasdaqlisted.txt` and `otherlisted.txt` for active US exchange listings.
- `crypto-universe.json` for the owner-selected 35 crypto assets and verified Binance trading pairs.
- Fintable public API responses for daily US close-price history; Binance public klines for daily and recent four-hour crypto close-price history.

## Output

`update_markets.py` writes active runtime JSON under `/var/lib/aizanoi-markets/public/`: manifest, health, compact breadth snapshots, market summary indexes and chunks, leader payloads, per-symbol summary items and lazy close-history shards. Bootstrap is fail-closed in `/var/lib/aizanoi-markets/staging/bootstrap/`; an explicit validated atomic cutover is required before it can replace `public/`. A compatibility `summary.json` remains for older clients, but current frontends do not fetch it. The directory stays outside Git and immutable application releases.

## Modes

- Initial/full download (staged only): `python3 scripts/markets/update_markets.py --mode bootstrap --data-root /var/lib/aizanoi-markets/public --allow-partial`
- US close refresh: `python3 scripts/markets/update_markets.py --mode us-daily --allow-partial`
- Crypto refresh: `python3 scripts/markets/update_markets.py --mode crypto-hourly --allow-partial`
- Offline schema/metric migration: `python3 scripts/markets/update_markets.py --mode rebuild`
- Local operational audit: `python3 scripts/markets/update_markets.py --mode health-check`

US and crypto schedules are intentionally separate: US runs after the New York close; crypto refreshes hourly. A non-blocking lock suppresses overlap; failed batches preserve last-known-good shards and are typed in health output. Rebuild performs no upstream requests and preserves schema-v3 provider provenance while recomputing derived data.

## Tests

- `tests/markets_pipeline_test.py` — parsing, symbol filtering, metrics, batch isolation and atomic publication.
- `tests/markets_product_test.py` — schema-v2 metrics, quality, snapshots, chunks, correlations and migration.
- `tests/markets-pipeline.test.mjs` — runs the Python contract from the repository’s Node test gate.
