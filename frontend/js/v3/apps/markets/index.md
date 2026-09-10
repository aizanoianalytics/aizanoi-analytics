# Aizanoi Markets Module

Purpose: AizanoiOS surface for the Aizanoi Markets market-intelligence product. It mounts the same shared dashboard runtime used by the standalone `/analytics/markets/` page.

## Stable identity

- Product name: **Aizanoi Markets**
- Stable app/module id: `markets`
- Public entry: `src/index.js`

## Declared capabilities

None. Markets is a zero-capability module. It uses browser-local DOM and `fetch` against public static market shards under `/analytics/markets/data/`.

## Owned implementation

- `src/app.js` — lifecycle adapter that mounts and cleans up the shared public Markets dashboard.
- `manifest.json` — installation identity.

## Boundary

- The module may import the public product runtime at `/analytics/markets/dashboard.js`; it does not import another AizanoiOS module's private files.
- Data stays static-first. The browser never contacts the upstream provider.
- The canonical market catalog stays in `frontend/analytics/catalog.js`; this module does not redefine product identity.
