# Manual acceptance — IGA HR Analytics Date Picker (owner-owned)

Status: **manual verification pending** — the checklist below has not been
run on a corporate machine yet. Automated tests cover the web-side contract
and a mocked Tableau transport only.

Environment: approved network/PC, **Tableau Desktop 2023.1.22 (Windows)**,
test dashboard with at least three synthetic worksheets on two data
sources and two different date captions, plus one worksheet that must stay
excluded. Use fabricated dates only — no real employee records.

## Install & connect

- [ ] A. Download `igahranalytics_date_picker.trex` from
  `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex`
  (after release deploy).
- [ ] B. Drag **Extension** onto the dashboard → **Access Local Extensions**
  → select the manifest. UI renders, status says **Tableau connected**,
  no prompt for underlying/full data.
- [ ] C. Plain-browser load of the same URL shows **Standalone mock** and
  never claims a Tableau connection.

## Mapping & apply

- [ ] D. Via right-click **Configure…**, map three synthetic worksheets to
  their own date captions; leave one worksheet unchecked.
- [ ] E. Apply `01.01.2025–31.03.2025`: all three mapped filters change,
  the excluded worksheet does not, unrelated (organization etc.) filters
  persist. Details list per-sheet `applied-verified`.
- [ ] F. Boundary `2025-12-31 → 2026-01-01`; an end-of-day timestamp record
  (e.g. `2026-01-01 17:45`) stays inside an inclusive DATETIME range;
  change an organization filter and re-apply (no interference); **Reset**
  clears only mapped reset-enabled fields; reload the workbook and confirm
  mappings persist.

## Robustness & policy

- [ ] Faults: no mapped targets (honest “not configured”), deleted/renamed
  worksheet (visible stale mapping, no silent success), one failing target
  (partial status + Retry failed fixes only it), offline host / blocked URL
  (actionable error, no bypass attempted).
- [ ] Layout: 280px narrow zone (no clipping, keyboard-only Apply works),
  900px wide zone.
- [ ] G. If approval, network or extension policy blocks any step: STOP,
  record the exact blocker, never circumvent.

## Business calculations (workbook-author scenarios)

Synthetic month-crossing turnover, delayed transaction entry, employee
rehire, historical as-of headcount, FIXED LOD numerator/denominator —
see `AUTHOR_GUIDE.md`. The extension is only a filter UI; metric
correctness must be verified per workbook, never assumed.

Result: ___ PASS / ___ BLOCKED (blocker: __________). Date, tester: ______.
