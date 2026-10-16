# Tableau Extensions — Security & Data Policy

Applies to every Aizanoi Analytics Tableau dashboard extension published under
`frontend/analytics/tableau/`.

## Pilot policy: `Aizanoi Hello — Tableau Connectivity Test`

- **No data access.** The extension requests no `<permissions>` in its manifest
  and calls no data API (`getUnderlyingDataAsync`, `getSummaryDataAsync`,
  `getLogicalTableDataAsync`, `getConnectionSummariesAsync`, …).
- **No telemetry.** No analytics, tracking, pixel or error-reporting call.
- **No third-party requests.** HTML, CSS, JS, icon and the pinned Extensions API
  library all load from `https://aizanoianalytics.com` only.
- **No credentials.** The extension stores and transmits nothing.
- **Demo honesty.** In a plain browser the app states *Demo / Tableau not
  detected*; it never simulates a Tableau session.

## Inherent risk of hosted extensions

A dashboard extension is a web page executed inside Tableau. Whatever the page
loads today could change tomorrow: public JavaScript is mutable, so a future
edit to this repository (or a compromise of the host) could alter extension
behavior in sessions that load it live.

Mitigations used by this pilot:

1. **Minimal manifest permission** — no `full data` permission is requested.
   This limits the APIs Tableau authorizes for underlying/full data, but it is
   not a universal API sandbox: dashboard metadata and some summary/aggregated
   APIs may remain available without `full data`. The pilot's stronger privacy
   guarantee comes from the audited application code, which calls only
   `initializeAsync()` and contains no data or metadata API calls.
2. **Pinned vendored library** — the Tableau SDK is served from this repository
   at a pinned version (1.10.0, MIT), never from a third-party CDN, so supply
   chain exposure is limited to this domain.
3. **Static asset lane** — no runtime backend, no database, no broker, nothing
   to crash or phish from.
4. **Contract tests** — `tests/tableau-extension-pilot.test.mjs` fails the build
   if an external URL, network call, or a data/settings/filter API appears in
   the extension sources.

Residual risk: integrity of the hosting domain itself. Users who require
stronger guarantees should host the extension app on an internal origin and
point the manifest's `source-location` at it.

## Future extensions that need real data

Any future extension that reads workbook data must additionally have:

- an explicit permission model documented before implementation;
- version pinning and a changelog entry for each behaviour change;
- a security review of the exact published commit;
- employer information-security approval before use with real corporate data;
- a data-access design (what is read, why, retention) reviewed per data class
  (payroll, PDKS, norm/fiil kadro are separate, higher-sensitivity classes).

Corporate security policies and access restrictions must never be bypassed. If
the corporate network, proxy, TLS inspection or extension allowlist blocks the
extension, that outcome is documented as a constraint, not worked around.

## Validation status

This pilot has **not** been validated on the corporate Tableau Desktop
2023.1.22 machine. Success there is a manual, owned test; automated tests cover
the web-side contract and a mocked Tableau API only.
