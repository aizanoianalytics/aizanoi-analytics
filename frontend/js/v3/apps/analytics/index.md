# Analytics Module

Scope: the AizanoiOS Analytics launcher surface for the public HR Analytics Full Set.

## Public entry

- `src/index.js` — shell-facing `mount()` entry
- `manifest.json` — installation state and zero-capability dependency declaration

## Private implementation

- `src/app.js` — Analytics spotlight markup and public dashboard/download links

## Dependencies

None. This surface renders static public links and does not require shell, filesystem, store or other shared capabilities.

## Ownership

This module owns only the AizanoiOS Analytics launcher surface. The actual dashboard product remains under `frontend/analytics/dashboards/hr-analytics-full-set/` with its existing pipeline, tests and publication contract.

## Boundary

Do not move dashboard generation or data-pipeline implementation into this app module. Removing this module should remove the AizanoiOS launcher surface without deleting the underlying public Analytics product.

## Tests

- `tests/aizanoi-os-analytics-module.test.mjs`
- Phase 6 manifest/private-import/unplug guards apply automatically.
