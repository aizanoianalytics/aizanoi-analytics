# Tableau Dashboard Extensions

Development, distribution, install and constraint notes for Aizanoi Analytics
Tableau dashboard extensions.

## What is published

| Artifact | URL |
|---|---|
| Extension catalog | `https://aizanoianalytics.com/analytics/tableau/` |
| Pilot web app (Tableau loads this) | `https://aizanoianalytics.com/analytics/tableau/hello/` |
| `.trex` manifest (downloaded by the user) | `https://aizanoianalytics.com/analytics/tableau/hello/aizanoi-hello.trex` |
| Date picker web app (Tableau loads this) | `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/` |
| Date picker `.trex` manifest (downloaded by the user) | `https://aizanoianalytics.com/analytics/tableau/igahranalytics_date_picker/igahranalytics_date_picker.trex` |

Date picker identity (v1.0.1+, issue #362 fix):

- Extension id: `com.aizanoianalytics.igahranalytics.datepicker`
  (reverse-domain, no underscores — Tableau XSD rejects the old
  `com.aizanoianalytics.igahranalytics_date_picker` with FD722608).
- Version: `1.0.1`
- Type: **Dashboard Extension** (`<dashboard-extension>`), never a worksheet/viz
  extension.
- Local development manifest: `igahranalytics_date_picker.local.trex`
  (id `...datepicker.local`, loopback URL). Never ship it to production.
- Migration: the id change is a new manifest identity — any workbook that
  used the pre-1.0.1 manifest must re-add the extension from a freshly
  downloaded `.trex` (never reuse a cached copy of the old file).

Pilot identity:

- Extension id: `com.aizanoianalytics.tableau.hello`
- Version: `0.1.0`
- Type: **Dashboard Extension** (`<dashboard-extension>`), never a worksheet/viz
  extension. Viz extensions require Tableau 2024.2+, which is outside the
  supported target range.

## Layout

```text
frontend/analytics/tableau/
  index.html                 # public catalog / install / privacy page
  catalog.css
  hello/
    index.html               # app shell loaded inside Tableau
    app.js                   # connectivity logic (no data access)
    style.css
    aizanoi-hello.trex       # downloadable manifest (XML)
    icon.png                 # 70x70 extension icon (Tableau limit)
    vendor/
      tableau.extensions-1.10.0.min.js
      LICENSE-tableau-extensions.txt
  igahranalytics_date_picker/
    index.html               # date picker shell loaded inside Tableau
    config.html              # mapping dialog (only settings writer)
    app.js                   # filter UI (metadata read + range/clear write)
    config.js                # opt-in mapping + settings.set/saveAsync
    ui.css
    core/                    # pure date/preset/settings/apply/discovery modules
    igahranalytics_date_picker.trex        # production manifest (XML)
    igahranalytics_date_picker.local.trex  # loopback development manifest
    icon.png                 # 70x70 extension icon (Tableau limit)
    vendor/                  # pinned SDK 1.10.0 + license (same-origin only)
    README.md                # install/configure/build/test, live URLs, status
    SECURITY.md              # product capability policy
    MANUAL_ACCEPTANCE.md     # owner-owned corporate checklist (pending)
    AUTHOR_GUIDE.md          # per-sheet mapping + calculation guidance
    mock-narrow.png          # labeled standalone capture, 280px zone
    mock-wide.png            # labeled standalone capture, 900px zone
docs/tableau-extensions/
  README.md
  SECURITY.md
tests/tableau-extension-pilot.test.mjs
tests/tableau-date-picker-core.test.mjs       # dates/presets/settings/apply units
tests/tableau-date-picker.test.mjs             # static/manifest/API/catalog/screenshot gates
tests/browser/tableau-date-picker.test.mjs    # real app + stubbed Tableau API
```

## Extensions API version

The vendored library is pinned to **1.10.0** (`tableau.extensions.1.10.0.min.js`,
MIT, Tableau copyright, license shipped alongside). Rationale:

- 1.10.0 is fully usable on Tableau Desktop 2018.2+ — which includes the
  corporate target, **Tableau Desktop 2023.1.22**.
- Later releases (1.11.0, 1.12.x, 1.13+) add features gated behind Tableau
  2024.1 / 2024.2 / Viz Extensions APIs that this pilot must not depend on.
- The manifest declares `<min-api-version>1.0</min-api-version>`: the smallest
  honest floor for dashboard extensions. Keeping it at 1.0 maximizes the set of
  Tableau versions that accept the manifest; the page itself loads the pinned
  1.10.0 library from the same origin.

## Running locally

```bash
python3 -m http.server 4173 --directory frontend
# http://127.0.0.1:4173/analytics/tableau/
# http://127.0.0.1:4173/analytics/tableau/hello/
```

In a plain browser the pilot shows **Demo / Tableau not detected**; nothing is
sent to Tableau. To exercise the Tableau path, add the manifest from Tableau
Desktop: *Objects → Extension → Access Local Extensions*.

## Tests

```bash
node --test tests/tableau-extension-pilot.test.mjs
node --test tests/*.test.mjs      # repo-wide gate
git diff --check
```

The contract test asserts the static boundary (no external URLs, no
`fetch`/`XHR`/WebSocket), the manifest shape (dashboard extension, id,
version, icon, no `<permissions>`), the absence of every data/settings/filter
API in app code, and the presence of the documented catalog sections.

## Mock-based connectivity checks

`tests/browser/tableau-hello.test.mjs` serves the real app from a local static
server with an injected mock `tableau.extensions.initializeAsync` and verifies
the connected, failure and Demo states in a real browser. This is **not** a
substitute for validation on the actual corporate Tableau Desktop 2023.1.22.

## Release checklist

1. Bump `extension-version` in the manifest (semantic `Major.Minor` per Tableau
   guidance — minor upgrades must stay backwards compatible).
2. Keep the vendored SDK pinned and license intact; upgrading it requires
   re-checking the supported Tableau matrix.
3. Verify over HTTPS that the manifest returns real XML and `source-location`
   returns real HTML — no 404, no SPA fallback:
   ```bash
   curl -sI https://aizanoianalytics.com/analytics/tableau/hello/aizanoi-hello.trex
   ```
4. Merge to `main`. Deployment is a separate, owner-approved step — a merge is
   not a production deploy.
5. Reproduce the corporate manual acceptance test from the brief.

## Constraints carried from the brief

- Static-first hosting only; no backend, database, proxy or Hermes bridge.
- No third-party CDN, fonts, analytics, pixels, trackers or external API calls.
- No corporate data (payroll, PDKS, norm/fiil kadro) is read, copied, stored or
  transmitted — the pilot requests zero permissions.
- Do not modify AizanoiOS shell, registry, existing dashboards, News, Games or
  Worlds for this feature; `/analytics/tableau/` is a standalone route.
