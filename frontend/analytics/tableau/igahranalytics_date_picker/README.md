# IGA HR Analytics — Date Picker

A Tableau **Dashboard Extension** (NOT a Viz Extension) that applies one
inclusive date range to every explicitly configured worksheet at once —
even when those worksheets use differently named date fields.

- Live app (Tableau loads this):
  `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/`
- Manifest download (add via Tableau Desktop):
  `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex`
- Catalog: `https://aizanoianalytics.com/analytics/tableau/`
- Source: `frontend/analytics/tableau/igahranalytics_date_picker/`

Target: **Tableau Desktop 2023.1.22** (Windows). Extensions API **1.10.0**,
vendored locally (`vendor/tableau.extensions-1.10.0.min.js`, MIT © Tableau);
no CDN. The manifest declares `<min-api-version>1.0</min-api-version>` so
every Tableau that supports dashboard extensions (2018.2+) accepts it, and
the page itself loads the pinned 1.10.0 library. Later SDK releases gate
features behind Tableau 2024.1/2024.2 and are deliberately not used.
Viz-extension APIs (2024.2+) are never called.

## Install (Tableau Desktop 2023.1.22)

1. Download `igahranalytics_date_picker.trex` from the link above.
2. Open a test dashboard, drag **Extension** from the Objects panel onto it.
3. Choose **Access Local Extensions** and select the downloaded `.trex` file.
4. Approve the dialog. The extension shows **Tableau connected**.

Local development: serve this repo (`python3 -m http.server 4173
--directory frontend`) and use `igahranalytics_date_picker.local.trex`,
which points at `http://127.0.0.1:4173/...`. Never use the local manifest
in production.

## Configure / Apply / Reset

1. Right-click the extension zone → **Configure…** (the menu entry exists
   because the app registers a `configure` handler; settings open in a
   Tableau dialog, `config.html`).
2. The dialog lists worksheets of the CURRENT dashboard with the
   DATE/DATETIME filter captions Tableau already exposes — nothing else.
   Opt in per sheet, pick each sheet's own caption
   (e.g. `processing_time` vs `duzeltilmis_max_date` vs `exit_date`),
   choose whether Reset affects it, then **Save**.
3. Back in the extension, pick a preset or a custom start/end range and
   press **Apply**. Draft edits never touch Tableau until Apply.
4. The status line reports truthfully: `Applied`, `Partial success`
   (`Updated X of Y`), per-sheet details, and **Retry failed** (failed
   targets only — successful sheets are left alone).
5. **Reset** clears only mapped fields that opted into reset. It does NOT
   restore previous filter state — Tableau keeps none.

## What it reads, writes, and never touches

- Reads: `initializeAsync`, `dashboardContent.dashboard.worksheets`,
  `getFiltersAsync` + `filter.getFieldAsync` (filter *metadata* only),
  workbook settings (own versioned key).
- Writes: `applyRangeFilterAsync(caption, { min, max, nullOption:
  NonNullValues })` per mapped sheet, `clearFilterAsync` on reset.
- Never: `getUnderlyingDataAsync`, `getSummaryDataAsync`, data extracts,
  parameters-as-filters, network calls, cookies, storage of workbook data,
  analytics, or tracking. Full-data permission is NOT requested.

Dates are inclusive civil days: `01.10.2026–16.10.2026` keeps all of
16 October, including `DATETIME` rows late that day (end-of-day
`23:59:59.999` local). Parsing never goes through UTC `Date('YYYY-MM-DD')`,
so +03:00 Turkey cannot shift a selected day.

## Development

```bash
node --test tests/tableau-date-picker-core.test.mjs
node --test tests/tableau-date-picker.test.mjs
node --test tests/browser/tableau-date-picker.test.mjs
node --test tests/*.test.mjs            # repo-wide gate
node --test tests/audit/*.test.mjs
./tools/eslint/node_modules/.bin/eslint -c eslint.config.js frontend/analytics/tableau/igahranalytics_date_picker tests/tableau-date-picker-core.test.mjs tests/tableau-date-picker.test.mjs tests/browser/tableau-date-picker.test.mjs
node scripts/search/build-search-index.mjs --check
git diff --check
```

In a plain browser the app runs an honestly labeled **standalone mock**
(synthetic sheets, fixed demo mappings) for screenshots and layout checks;
it never claims to be connected. The configuration dialog has its own mock
dashboard. Real Tableau behavior is covered by the SDK-transport browser
suite plus the manual checklist below.

## Status: NOT yet validated on corporate Tableau

Real Tableau Desktop **2023.1.22** acceptance and the HR
business-calculation scenarios (month-crossing turnover, delayed entries,
rehires, as-of headcount, FIXED LODs) are **pending manual validation by
the owner** — see `MANUAL_ACCEPTANCE.md`. Do not use with real employee
data or claim corporate approval until that checklist passes.

See also: `SECURITY.md` (product policy), `MANUAL_ACCEPTANCE.md` (owner
checklist), `AUTHOR_GUIDE.md` (mapping + calculation guidance).
