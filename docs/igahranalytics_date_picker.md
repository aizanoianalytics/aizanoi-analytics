# igahranalytics_date_picker — Product & Engineering Specification

**Status:** Planned / engineering handoff (not implemented)
**Priority:** High
**Product type:** Tableau Dashboard Extension (NOT Viz Extension)
**Canonical identifier:** igahranalytics_date_picker
**Display name:** IGA HR Analytics — Date Picker
**Target environment:** Tableau Desktop 2023.1.22 on Windows, with future compatibility for newer Desktop releases.
**Repository:** https://github.com/aizanoianalytics/aizanoi-analytics
**Publisher / hosting:** Aizanoi Analytics; proposed public HTTPS home https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/
**Languages:** Turkish default, English option.
**Data classification for development:** fictional/synthetic dates only. Never commit actual enterprise HR or employee data.

> Engineering brief: Build a beautiful, small, accessible Tableau dashboard date-range controller. A dashboard user picks one inclusive start/end range once; all explicitly configured and compatible worksheets update together, even when individual worksheets have differently named date fields. The initial test target is Tableau Desktop 2023.1.22; a modern API method that only works on Tableau 2024.2+ is NOT an acceptable implementation.

## 1. Context and primary outcome

This project fills the gap left by ordinary Tableau date filters and third-party Date Range Picker extensions that may control only one worksheet. The owner works with dashboards containing headcount, turnover, recruiting/exit, and planned-versus-actual workforce views; a date selection must apply predictably to multiple sheet targets, without needing one date control per sheet.

The product is not a new HR database, an embedded workbook, or a Viz Extension. It is a Tableau **Dashboard Extension** shown in a dashboard object zone. It must coexist with all normal Tableau filters, actions, and calculations. The product should eventually be downloadable by the public from Aizanoi Analytics, but its name and initial functional acceptance tests are IGA HR-centric.

**MVP pass condition:** In one demo dashboard with at least three independent worksheet targets, changing the date range once causes all *selected* compatible worksheet filters to change; an excluded worksheet remains untouched; invalid mappings fail visibly rather than silently.

## 2. Non-negotiable compatibility

- Tableau Desktop version 2023.1.22 is the hard target. Dashboard Extensions were supported well before this version; Viz Extensions require 2024.2+ and must not be used.
- Integrate using the official Tableau Extensions API: tableau.extensions.initializeAsync(); tableau.extensions.dashboardContent.dashboard.worksheets; each worksheet's appropriate date-filter API.
- Main filtering path: worksheet.applyRangeFilterAsync(fieldName, {min: Date, max: Date}) *after proving that the intended date/date-time field and Tableau 2023.1.22 support it*. The name is the **field caption Tableau exposes**, not an assumed raw SQL column name.
- Confirm selected SDK bundle version is compatible with Tableau 2023.1.22. **Do not blindly use the newest SDK**: modern APIs may need newer Tableau versions. Document SDK filename/version and why selected.
- For optional parameter-driven mode, use the supported workbook parameter APIs only after checking target-version compatibility. Changing parameters ALONE does not filter worksheets unless the workbook's own calculated fields/filters are configured to use those parameters.
- Do not use APIs from the separate Tableau JavaScript Embedding API as though they were Extensions API methods.
- Read official docs and the real upstream sample manifests before authoring the .trex file; prove its XML shape and minimum API version with a validator/load test.

Primary engineering references:
- https://tableau.github.io/extensions-api/docs/dashext/trex_getstarted/
- https://tableau.github.io/extensions-api/docs/dashext/trex_manifest/
- https://tableau.github.io/extensions-api/docs/trex_release-notes/
- https://tableau.github.io/extensions-api/docs/trex_api_about/
- https://tableau.github.io/extensions-api/docs/core/trex_configure/
- https://www.tableau.com/developer/learning/update-date-filter-specific-range
- https://tableau.github.io/extensions-api/docs/security/trex_security/
- https://github.com/tableau/extensions-api

## 3. User experience & information architecture

### 3.1 Dashboard-facing compact control

Create a professionally styled, single-row or two-row control that works in a narrow dashboard extension zone. Proposed appearance:

[ calendar icon ] [ Start date: 01.01.2025 ]  →  [ End date: 16.10.2026 ] [ Apply ] [ Clear ] [ gear ]

A clean popover calendar must support monthly navigation, locale-specific week starts, year/month selection, keyboard operation, visual range highlight, and clear disabled states. Do NOT use an enormous permanently open calendar. When a date is selected, the popover closes after completion or with Escape/outside click. No misleading Apply success before Tableau finishes.

Separate **draft selection** from **applied selection**: date edits do not mutate Tableau until user clicks Apply; optional auto-apply can come later, disabled by default. Display Loading / Applied / Partial failure / Not configured states, and a small summary such as “Updated 4 of 5 worksheets” with an expandable per-sheet report. Responsive behavior for approximately 280–900px wide dashboard zones; do not clip menus or lose keyboard focus.

### 3.2 Predefined date presets

Include: This month (first day of current month → today), Last month (complete calendar month), This year (Jan 1 → today), Last year (complete), Last 30 days (including today), Last 12 calendar months (current month + previous 11 months, ending today), and Custom range. “All dates” must NOT silently invent a default date window: clear only date filters managed by this extension, or apply a known valid domain if explicitly configured.

Dates are evaluated using local calendar semantics; support locale tr-TR (Monday-first week) and en-US. Date labels format DD.MM.YYYY (TR) or locale-appropriate English. Be explicit whether Last 12 months means calendar months or 365 days.

### 3.3 Configuration screen

A “Configure” action and explicit gear icon shall offer:

- Discovery/listing of worksheets belonging to the CURRENT dashboard.
- Worksheet enable/disable toggles; default is **opt-in**, not automatically change every sheet.
- Per-worksheet mapping from logical range → the worksheet's correct DATE/DATETIME **field caption**. Persist a mapping by stable available identifiers and use name for display; tolerate worksheet renames and detect stale mappings.
- Show current mapping health: Ready / Missing date field / Unsupported filter / Filter update failed.
- A no-data “connection test” that initializes Tableau and lists accessible worksheet names; it must not read employee rows.
- Defaults and preset availability, locale, field mode/date-time mode, date boundaries, clear behavior, and clear partial-error messages.
- Per-target checkbox for whether the worksheet should be affected by Reset.
- Show that multiple data sources and heterogeneous names (for example processing_time vs duzeltilmis_max_date vs exit_date) may need DIFFERENT per-sheet mappings. Never apply one column name to every sheet blindly.
- Workbook settings should persist through tableau.extensions.settings.set/get/saveAsync when supported in authoring mode. Persist only non-sensitive configuration (names/identifiers/preferences), no rows or credentials. Read/viewer mode must not attempt saveAsync.

### 3.4 Optional phase-two enhancements (do NOT delay MVP)

A more compact dropdown-only preset mode, a dual-month range calendar, theme variants, a date-time toggle, predefined fiscal year start, date-range domain discovery without full-data access, option to switch to two date parameters, tooltips, and configurable label-only mode.

## 4. Filter execution behavior and correctness

### 4.1 Mapping and selected targets

The extension iterates only user-selected dashboard worksheets. For each target, resolve configured date field caption; validate it; call the supported date range filter method. Run with an explicit concurrency limit (recommended 2–3), await each promise, collect individual success/failure, then show truthful status. Never imply an atomic transaction across multiple worksheets: some may succeed while others fail. Provide Retry Failed for failed targets and avoid changing successful targets unnecessarily. Prevent overlapping Apply calls and stale responses; apply the latest committed range deterministically.

DO NOT secretly change other filters (organization, position, gender, etc.). Do not overwrite a user's unrelated date filter on an unconfigured field. The Clear/Reset button must only clear this extension's configured field mappings, with warnings where preexisting filters may be affected. Since Tableau may not restore the prior filter state automatically, document whether Reset means “remove range from mapped date field” rather than “restore everything as it was.”

### 4.2 Date/day boundary and time-zone handling

The range selected by users is **inclusive**: 01.10.2026–16.10.2026 includes all of 16 October, even when source values are timestamps (e.g. 2026-10-16 17:45). Avoid Date('YYYY-MM-DD') blind UTC parsing and the off-by-one-day trap in +03:00 Turkey or other time zones. Parse YYYY-MM-DD into components, construct calendar dates intentionally, and test JavaScript Date values and end-of-day timestamp semantics against actual Tableau behavior. If the Tableau range API cannot preserve inclusive whole-day DATETIME limits on a given mapping, offer and document a correct workaround via calculated DATE-truncated field or user-configured parameter formulas. Do not claim support until tested.

Validate start <= end and real calendar dates (including leap days). Bound supported years sensibly, reject impossible inputs, and handle nullable dates explicitly. Avoid changing data semantics by naïvely converting timestamps to string for filtering.

### 4.3 Special HR analytical warning — essential

A Tableau date filter can change which records enter an aggregation or a FIXED LOD, depending on computation/order of operations, context filters, underlying data, and the metric definition. **This extension is only a filter UI; it does not guarantee headcount, average workforce, or turnover correctness.** Data date fields often have different business meanings:

- processing_time: loading/processing snapshot date.
- duzeltilmis_max_date: reporting date or mapped date for a particular metric; confirm real semantics before mapping.
- exit date vs entry date: different analytical events.
- turnover calculations can require exit date relative to month, snapshots for denominators, delayed HR processing, rehires, and historic as-of status.

Acceptance tests MUST include a synthetic month-crossing case, delayed transaction entry, employee rehire, historical as-of headcount, FIXED LODs, and numerator/denominator preservation under date filtering. Provide a clear workbook-author guide: use per-worksheet specific date mapping and, where needed, **parameter-driven as-of/range calculations** rather than treating a generic data-row range filter as analytically safe. Do not rewrite business formulas in the extension.

### 4.4 Multiple data sources

Worksheets may reference different sources, different business dates and aliases. UI requires manual per-sheet mapping with visible diagnostics. Do not silently report success for a sheet Tableau ignored because the field was absent or its filter mechanism was incompatible. Check actual resulting filter state where API allows and report any mismatch honestly.

### 4.5 Reliability / state lifecycle

Handle disconnected Tableau API, moved/renamed worksheets, deleted fields, unsupported date types, null date values, cleared filters, duplicate extension instances, reloads, delayed async replies, permissions rejections, slow dashboards and no worksheets selected. Set safe empty state and provide actionable errors. Each extension instance should own its configuration and not unexpectedly update another extension zone.

## 5. Security & privacy — mandatory

This is intended for possible use in a corporate HR environment, so do NOT assume being hosted on the owner's personal site automatically makes it corporate-approved.

- Phase one test with fabricated/anonymous dates only. **No real employee, payroll, personnel, or confidential company records in GitHub, demos, logs, screenshots, telemetry, or Aizanoi website.**
- Use only the minimal Tableau APIs needed for setting filters and reading worksheet/filter *metadata*. Do not call getUnderlyingDataAsync, getUnderlyingTableDataAsync, data extracts, or fetch row-level values. Do not request the manifest full-data permission unless later justified and explicitly approved.
- No tracking, analytics, third-party scripts, CDN, external fonts, remote dependencies at runtime, credentials, cookies, IndexedDB/localStorage for HR data, remote logging, or network submission of workbook/filter values. Keep production assets first-party and locally bundled.
- Network-enabled remote hosting still executes site-delivered JavaScript within Tableau. HTTPS and same-origin assets by themselves are NOT a corporate data-leakage guarantee. Apply a restrictive, tested CSP compatible with Tableau embedding (especially frame-ancestors / extension communication); never block the embedding required for Desktop. Audit the source and production artifact.
- Review the separate possibility of a Tableau-hosted **Sandboxed Extension** as a later distribution path if corporate restrictions demand it. Do not mislabel this externally hosted version as sandboxed.
- Gracefully fail if corporate firewall blocks https://aizanoianalytics.com, if Tableau policy blocks custom extensions, or if certificates/origin redirects are invalid. Never bypass corporate restrictions.
- If network access is blocked, document local or internally approved HTTPS hosting alternatives rather than introducing covert tunnels or proxies.
- Maintain a published privacy/security note describing what the code reads/writes and what is not transmitted.

## 6. Proposed implementation structure (adjust to repository conventions)

Keep it independent within the existing public Analytics product family:

frontend/analytics/tableau/igahranalytics_date_picker/
  index.html
  app.js
  ui.css
  config.html (only if required)
  config.js (only if required)
  assets/ (locally owned, light)
  igahranalytics_date_picker.trex
  README.md

Publish an index/listing or product card within the existing canonical Analytics catalog only after first technical validation. Proposed browser URL:
https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/
Proposed .trex download:
https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex

**These paths are targets, not claimed live URLs.** Ensure the .trex source-location is the final canonical HTTPS URL, not http:// or an origin-changing redirect. Keep localhost manifest separately for dev if necessary, with unique ids/version/URL as documented by Tableau. Use static Nginx hosting, no backend, no visitor command execution, no Hermes runtime bridge.

Before changes, read: repository index.md, AGENTS.md, frontend/index.md, frontend/analytics files, PRODUCT.md, ARCHITECTURE.md, DESIGN.md, SECURITY.md, docs/HERMES_OPERATIONS.md for deployment only if needed. Obey existing canonical catalog rules and tests. Do not recursively scan the whole repo and do not modify unrelated products.

## 7. Runtime integration and manifest

- Use a version-compatible tableau.extensions JS SDK bundle and document integrity/provenance. No live CDN.
- Bootstrap via tableau.extensions.initializeAsync(...) and access dashboardContent.dashboard.worksheets. Render a useful offline/static mock only when opened in normal browser, but never show fake “Connected to Tableau.”
- If using “Configure…” context-menu item, include the corresponding .trex manifest declaration and initialization callback; avoid newer multi-dialog API not available on 2023.1.
- XML manifest must include proper unique reverse-domain extension ID, display name, version, minimum supported API, source-location, and a valid embedded icon per Tableau docs. Suggested reverse-domain ID: com.aizanoianalytics.igahranalytics_date_picker.
- Explicitly do not request full-data permission by default.
- Use accessible native input controls when practical; a custom calendar must be keyboard-accessible, ARIA-labeled, focus-managed, and tested on Desktop embedded Chromium (not only latest standalone Chrome).
- Avoid frameworks where a small vanilla JS implementation would suffice. No unrelated package or build-system upheaval.

## 8. Quality gates and test matrix

### Unit / deterministic tests
1. Date parsing, formatting, TR/EN locale, invalid dates, leap day, month/year transitions.
2. Inclusive date boundaries including DateTime records late in the final day; DST behavior for multiple time zones.
3. All presets: month boundaries, leap years, year boundaries, “last 12 months” semantics.
4. Selected/unselected worksheets, unique per-target date field names, unmapped/renamed/missing targets.
5. Multiple concurrent changes, stale request cancellation/serialization, failure of just one of several targets, clear behavior.
6. Settings migration, corruption, persistence across reload, and two separate extension instances.
7. No dangerous DOM injection from worksheet names; no network exfiltration endpoints.

### Browser / functional test
1. Standalone static mock in desktop browser; honest Tableau-not-connected state.
2. Official Tableau mock/sample workbook with at least 3 worksheets, 2 data sources, 2 different date captions; choose one range and verify each target's filters change.
3. Excluded worksheet does not change; unrelated filters persist.
4. Tableau Desktop **2023.1.22 Windows** real smoke check, or explicitly mark “user manual verification pending” if no such runtime available.
5. Narrow dashboard zone 280px, keyboard-only calendar operation, focus trap prevention, popover visibility, readability.
6. Fault injection: offline host, blocked URL, invalid .trex, no selected targets, deleted worksheet, API rejected promise.
7. HR-specific synthetic turnover/headcount case: calculated metrics before/after date selection; disclose mismatches.
8. Security check: production bundle has no external requests; no employee data or credentials; proper CSP and reliable HTTPS; basic regression tests for other existing site modules.

### Repository gates
Run relevant project-provided syntax/tests, git diff --check, link/path checks, local HTTP smoke, browser checks if available. Never weaken CI to pass. README must include exact build/run/test commands and what was actually verified.

## 9. Deliverables — definition of done

- Working Dashboard Extension HTML/CSS/JS and valid .trex file targeting Tableau Desktop 2023.1.22.
- Attractive compact date picker; locale TR/EN; presets; manual start/end; Apply; Reset; busy/error/partial status.
- Per-sheet opt-in and per-sheet date-field mapping, persisted in workbook when allowed.
- Explicit multi-worksheet filtering and diagnostic error report; tests with at least 3 worksheets.
- No full-data permission, no employee data in app/code/repository/logs, no external tracking.
- Synthetic demo instructions/sample, security/privacy note, README (including first install with Dashboard > Extension > Access Local Extensions), troubleshooting blocked corporate access.
- Planned public HTTPS assets/download within existing Analytics site, integrated only after acceptance.
- Pull request to main with screenshots, compatibility evidence, screenshots of narrow and wide layouts, test results, caveats, and rollback notes. **No automatic merge or production deploy.**

## 10. Engineering workflow / agent instructions

1. Read repository rules and this specification before touching code.
2. First produce a short technical design and compatibility proof with actual official API methods for 2023.1.22.
3. Implement minimal end-to-end flow against synthetic fixtures before styling.
4. Implement configuration, presets, robust states, accessibility and tests.
5. Validate security and existing site regressions; prepare manual test checklist for the owner's corporate Tableau Desktop.
6. Create a feature branch and PR; include known limitations and exact test evidence.
7. **STOP at PR; owner decides when to merge/deploy.** Never claim the extension works in the company before a successful on-device test and company authorization.

## 11. Manual acceptance steps for owner

A. From an approved network/PC, download igahranalytics_date_picker.trex via the published Aizanoi Analytics link (after release).
B. In Tableau Desktop 2023.1.22, open a *test* dashboard, drag Extension object, choose **Access Local Extensions**, and select the manifest.
C. Confirm UI renders and status says Connected, with no request for underlying/full data.
D. Configure three synthetic worksheets; map appropriate date fields for each; leave one worksheet unchecked.
E. Select 01.01.2025–31.03.2025; Apply. Verify all selected worksheets change and excluded one does not.
F. Test 2025-12-31 → 2026-01-01 boundary; end-of-day records; changing organization filters; Clear; reload workbook.
G. If approval or network is blocked, stop and report the exact blocker, never circumvent policy.

## 12. Scope exclusions

Do not implement BI calculations or personnel analytics models in the extension. Do not scrape real company data, alter production HR SQL, write into Tableau sources, export rows, add login/account/cloud backend, silently publish to Tableau Exchange, change company Tableau version, or change company security settings. No automatic live deployment.

## 13. Agent reporting template

When implementation is ready, respond with:
- PR link and changed file paths
- Target .trex manifest path and intended HTTPS download path
- Exact Tableau SDK version and 2023.1.22 compatibility reasoning
- Working demo/test procedure and screenshots
- Test results (executed vs not executed)
- Security review and external network request audit
- Known limitations and unverified cases
- Manual actions required from owner/IT before corporate production use

**Bottom line:** Build the reusable extension product, but guard the real business data and the real business calculations. All unverified compatibility or filtering outcomes must be labeled as unverified.
