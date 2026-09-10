# Aizanoi Markets Pipeline

Scope: private ingestion and static publication for `/analytics/markets/`.

## Inputs

- Nasdaq Trader `nasdaqlisted.txt` and `otherlisted.txt` for active US exchange listings.
- `crypto-universe.json` for the owner-selected 35 crypto assets and verified Yahoo symbols.
- Yahoo Finance spark responses for daily and recent four-hour OHLCV.

## Output

`update_markets.py` atomically writes compact runtime JSON under `/var/lib/aizanoi-markets/public/`: `manifest.json`, `summary.json`, `instruments.json`, per-symbol summary items and lazy history shards. The directory stays outside Git and immutable application release trees.

## Modes

- Initial/full rebuild: `python3 scripts/markets/update_markets.py --mode bootstrap --allow-partial`
- Hourly slice: `python3 scripts/markets/update_markets.py --mode hourly --allow-partial`

The default hourly mode refreshes one eighth of US symbols plus all selected crypto assets. This bounds Yahoo traffic while every US symbol rotates through within eight hours. A non-blocking lock suppresses overlap; failed batches preserve last-known-good shards and are reported in the manifest.

## Tests

- `tests/markets_pipeline_test.py` — parsing, symbol filtering, metrics, batch isolation and atomic publication.
- `tests/markets-pipeline.test.mjs` — runs the Python contract from the repository’s Node test gate.
