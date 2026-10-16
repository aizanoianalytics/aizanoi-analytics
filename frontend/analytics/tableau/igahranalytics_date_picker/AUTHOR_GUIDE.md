# Workbook author guide — mapping the date picker to HR calculations

Companion to the IGA HR Analytics — Date Picker:

- Live app (Tableau loads this):
  `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/`
- Manifest download:
  `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex`
- Install and validation state: see `MANUAL_ACCEPTANCE.md`
  (corporate Tableau Desktop 2023.1.22 run is **manual verification
  pending**); security boundaries: see `SECURITY.md`.

This extension is a **filter UI, not a calculation engine**. A date filter
changes which records enter aggregations and FIXED LODs depending on filter
order, context and metric definitions. Map deliberately; verify metrics on
synthetic data before trusting any number.

## Per-sheet mapping

- Give every worksheet its own correct DATE/DATETIME **field caption**
  (the name Tableau exposes, not a SQL column): e.g. headcount snapshots
  on `processing_time`, reporting views on `duzeltilmis_max_date`, exits
  on `exit_date`. Never reuse one caption blindly across sheets.
- `processing_time` is a loading/snapshot date; `duzeltilmis_max_date` is a
  reporting/mapped date — confirm real semantics with the data owner.
- Entry date vs exit date are different analytical events: turnover
  numerators usually need exit dates relative to the month; denominators
  need snapshot headcount. One generic row-range filter is NOT
  analytically safe for both — use parameter-driven as-of/range
  calculations in the workbook where needed, and keep the extension on
  the date fields those calculations consume.
- DATETIME sources rely on the inclusive end-of-day bound
  (`23:59:59.999` local). If a mapping cannot preserve it, add a
  calculated DATE-truncated field and map that instead.

## Required filters and discovery diagnostics

The extension deliberately discovers only **existing worksheet filter
metadata** (`getFiltersAsync()` + `getFieldAsync()`); it never enumerates rows
or requests full-data permission. Before Configure, put the intended raw date
or date-time field on each worksheet's Filters shelf. Configure shows Tableau's
`date` and `date-time` types as `DATE` and `DATETIME`. Builds before the
field-discovery fix incorrectly accepted `DATETIME` but rejected Tableau's real
`DataType.DateTime` value, `date-time`, hiding valid filters.

If no candidate appears, enable the worksheet checkbox and read its diagnostic.
`0/1` means Tableau exposed one filter but its field metadata was unreadable;
`1/1` with no candidate means the filter was inspected but was neither typed
as a date nor exposed as a date-shaped RangeFilter/RelativeDateFilter. The
diagnostic also prints Tableau's observed field type(s). Date-shaped range
inference checks both boundaries (ISO or locale dates) and deliberately rejects
numeric ranges, so salary/measure sliders cannot become date candidates.
Use the raw field, not a string-formatted date or a discrete `YEAR(...)` /
`MONTH(...)` part.

## Synthetic verification cases (run before sign-off)

1. Month-crossing hire/exit; 2. late-entered (delayed) transaction;
   3. rehired employee; 4. historical as-of headcount; 5. a FIXED LOD
   metric — compare numerator/denominator before and after Apply and
   disclose any mismatch instead of shipping it.

## Reset semantics

Reset removes the range from mapped reset-enabled fields; it does NOT
restore prior filter state. Document the workbook's default filter state
so users can return to it manually.
