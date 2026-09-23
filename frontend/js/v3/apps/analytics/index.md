# Analytics Module

Scope: the AizanoiOS Analytics launcher surface for the public Analytics product families.

## Public entry

- `src/index.js` — shell-facing `mount()` entry
- `manifest.json` — installation state and zero-capability dependency declaration

## Private implementation

- `src/app.js` — Analytics spotlight markup and public set links

## What the launcher exposes

The Analytics launcher surfaces every collection registered in the canonical public catalog. Today the catalog (`frontend/analytics/catalog.js`) exposes three sets:

- **HR Analytics — Full Set** — `id: 'hr-analytics-full-set'` (10 dashboard surfaces)
- **Aizanoi Markets** — `id: 'aizanoi-markets'` (US + crypto daily close intelligence)
- **New HR Collection** — `id: 'new-hr-collection'` (PACS + Recruitment Analytics)

Each set has its own landing page, source link, methodology description and download surface. New sets are registered by adding an entry to `frontend/analytics/catalog.js`; both `/analytics/` and the AizanoiOS Analytics app consume the same catalog.

## Dependencies

None. This surface renders static public links and does not require shell, filesystem, store or other shared capabilities.

## Ownership

This module owns only the AizanoiOS Analytics launcher surface. The actual dashboard products remain under `frontend/analytics/dashboards/*` with their own pipelines, tests and publication contracts; the Aizanoi Markets product lives under `frontend/analytics/markets/`.

## Boundary

Do not move dashboard generation or data-pipeline implementation into this app module. Removing this module should remove the AizanoiOS launcher surface without deleting the underlying public Analytics product.

## Tests

- `tests/aizanoi-os-analytics-module.test.mjs`
- Phase 6 manifest/private-import/unplug guards apply automatically.