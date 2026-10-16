# IGA HR Analytics — Date Picker: Security & Data Policy

## What this extension can reach today

- `tableau.extensions.initializeAsync({ configure })` — handshake plus the
  context-menu **Configure…** entry.
- `dashboardContent.dashboard.worksheets` — sheet identities of the current
  dashboard only.
- `worksheet.getFiltersAsync()` + `filter.getFieldAsync()` — existing
  filter *metadata* (field names, DATE/DATETIME types). No values are read.
- `worksheet.applyRangeFilterAsync(caption, { min, max, nullOption })` and
  `worksheet.clearFilterAsync(caption)` — only for explicitly mapped
  captions; unmapped sheets and unrelated filters are never touched.
`- Own workbook settings under the single key
  `igahranalytics_date_picker` (sheet ids/names, captions, locale, UI
  preferences). Written exclusively from the configuration dialog.

No full-data permission is requested: the manifest carries no
`<permissions>` element at all.

## What it cannot do (even if hosted code changed, without new review)

- Read row-level data: `getUnderlyingDataAsync`, `getSummaryDataAsync`,
  extracts and table APIs are absent from the code (contract-tested), and
  the manifest requests **no `<permissions>`**, so Tableau does not
  authorize full-data access.
- Exfiltrate: no `fetch`/XHR/WebSocket/pixels/fonts/CDN — every byte loads
  from the hosting origin. Contract tests fail the build on any external
  URL or network call.
- Persist sensitive data: settings serialization allowlists schema fields;
  passwords, rows and credentials are dropped, never stored.

## Residual risk (hosted-code mutability)

Like every hosted dashboard extension, this is a web page executed inside
Tableau: a future edit to the published JavaScript could change behavior.
Mitigations: zero data permissions, pinned vendored SDK (1.10.0, MIT,
shipped with license), static hosting with no backend, and contract tests
that reject data APIs, network calls and external URLs. Behavior changes
require version bumps, changelog entries and a fresh security review.
Users needing stronger guarantees should host the app on an internal
origin and repoint the manifest `source-location`.

## Corporate use

NOT approved for corporate HR data. Synthetic/demo dates only until the
owner completes `MANUAL_ACCEPTANCE.md` on Tableau Desktop 2023.1.22 and
information security approves. Blocked network/policy outcomes are
documented as constraints, never bypassed.
