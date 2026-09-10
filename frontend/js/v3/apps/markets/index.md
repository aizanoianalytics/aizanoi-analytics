# Aizanoi Markets Module

Purpose: self-contained AizanoiOS surface for the Aizanoi Markets market-intelligence product. The desktop app renders the same live snapshot the standalone `/analytics/markets/` page serves, without wrapping another module's code.

## Stable identity

- Product name: **Aizanoi Markets**
- Stable app/module id: `markets`
- Public entry: `src/index.js`

## Declared capabilities

None. Markets is a zero-capability module. It uses browser-local DOM and `fetch` against the public static market shards under `/analytics/markets/data/` (the same nginx-served snapshots the standalone page reads).

## Owned implementation

- `src/app.js` — market dashboard UI: US/Crypto tabs, search, ranking, standout signals and a per-instrument detail view with a sparkline and recent observations.
- `manifest.json` — installation identity.

## Boundary

- Reads only public market data URLs; it never imports the standalone page's scripts (`/analytics/markets/app.js`) or another module's private files.
- The canonical market catalog stays in `frontend/analytics/catalog.js`; this module renders its own market view and links out to the full standalone page for the deep experience.
