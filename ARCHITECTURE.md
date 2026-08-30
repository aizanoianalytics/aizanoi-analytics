# Aizanoi Analytics Architecture

The Aizanoi Analytics public visitor runtime is **static-first**. Nginx serves HTML, CSS, JavaScript, JSON and assets. Private automation such as Hermes may prepare content and deploy releases, but the browser does not receive a private-agent execution bridge.

## Runtime topology

```text
Browser
  |
  +-- AizanoiOS (/)
  |     +-- brand-platform.js             Aizanoi Analytics + device composition
  |     +-- registry.js                   canonical public app + world catalog
  |     +-- module-registry.generated.js  installed/enabled module wiring
  |     +-- capabilities.js               declared host capability bridge
  |     +-- store.js                      shell + field-session state
  |     +-- shell.js                      canonical window/router/lifecycle host
  |     +-- device-shell.css              tablet/mobile presentation
  |     +-- apps/<id>/                    lazy manifest-driven public applications
  |     +-- /news/index.json              static News feed
  |
  +-- Historical Worlds
  |     +-- /historic-world/                 Aizanoi
  |     +-- /ancient-cities/rome-410-476/   Rome
  |     +-- /ancient-cities/athens-450-430/ Athens
  |
Nginx -> static files only
```

Historical `/api/chat` remains failed closed. Other `/api/*` paths remain unavailable unless the owner deliberately changes the public architecture.

## AizanoiOS layers

### Base shell

`frontend/js/v3/aizanoi-os.js` owns desktop interaction primitives such as wallpaper desktop, top chrome, dock behavior, launcher lifecycle, window motion and snapping.

### Brand/device adapter

`frontend/js/v3/brand-platform.js` owns the current Aizanoi Analytics composition:
- five core desktop shortcuts/dock apps;
- desktop contextual widget;
- phone home app grid/widgets;
- tablet two-pane home;
- public catalog presentation.

It may adapt presentation, but must not create a second window manager or route system.

### Device presentation

`frontend/styles/device-shell.css` is the canonical style owner for compact and tablet-specific home composition. It complements `shell.css`; it is not a compatibility or “fix” stylesheet.

Breakpoints:
- Compact `<600px`: phone-like home + fullscreen-equivalent apps.
- Medium `600–839px`: tablet two-pane home with a tighter app grid.
- Expanded `840–1199px`: larger tablet home + focused large windows.
- Large `>=1200px`: wallpaper-first desktop + freeform windows.

### Registry and module wiring

`frontend/js/v3/registry.js` is the single human-authored public catalog for app/world labels, ordering, groups, icons, descriptions and search metadata. The visible analytical product is **Analytics**; `/analytics/` and the `analytics` app id are stable contracts, while dashboards are a format inside the product. Retired Workbench/power tools must not remain directly addressable through `appById`, search, launcher or routing.

Every current public AizanoiOS application lives under `frontend/js/v3/apps/<id>/` with a manifest and `src/index.js` public entry. `scripts/modules/build-module-registry.mjs` discovers manifests at build time and produces committed `module-registry.generated.js` containing installation/enabled state, public entry paths and declared requirements only. The browser never crawls directories or fetches manifests to construct the catalog.

The registry combines public product metadata with generated installation wiring. Missing/disabled optional modules are filtered instead of becoming broken launchers. Shared host behavior is resolved through `capabilities.js`; module-private code must not import another module's private implementation or a concrete shared provider when a capability contract exists.

See `MODULE_CONTRACT.md` for ownership, cleanup, unplug and CI rules.

### Lazy applications

Public application modules load only when opened. `apps.css` remains lazy. Module-owned assets and persistent namespaces move with the module where applicable; cleanup must release or invalidate listeners, timers, media, object URLs and pending asynchronous work.

## Aizanoi News pipeline

```text
Hermes / operator research
        ↓
content/news/items/*.json
        ↓
scripts/news/build-news.mjs
        ↓
frontend/news/* + frontend/sitemap.xml
        ↓
Aizanoi News app / public discovery
```

The compiler validates ids, dates, the four published sections (AI, Technology, Economy / Markets and Football), editorial priority, original summary length, author/editor identity, optional image provenance, correction history and mandatory source publisher/URL/date provenance. It does not fetch third-party sites itself. Source discovery stays in the private/operator layer.

Daily items use `kind: "daily"` (default) and publish at `news/YYYY-MM-DD/`. Weekly items add `"kind": "weekly"` plus a `"week": "YYYY-Www"` label that must match the ISO week of the publication date, publish at `news/weekly/YYYY-MM-DD/`, require summaries of at least 240 characters and are surfaced via a parallel `weeklyEditions` array in the edition feed.

It deterministically generates the current landing, daily edition paths, **permanent article pages**, category archives, `/news/about/`, the JSON edition feed, RSS, a dedicated `/news/sitemap.xml` and root sitemap discovery. `SOURCE_DATE_EPOCH` may pin build metadata. Generation is serialized by an exclusive lock, built and validated in same-filesystem staging, rollback-safe, and recoverable after stale locks or interrupted promotion. The compiler runs in the private checkout; generated outputs must be rebuilt and reviewed before an approved exact-SHA production deployment.

`CONTENT_POLICY.md` is the publication contract.

## Historical Worlds

`frontend/ancient-world/engine/` owns shared traversal/input/evidence/presentation behavior. City-specific archaeology and hero decisions stay city-local.

The evidence boundary remains unchanged: documented/source-supported, archaeological/material, inferred, atmospheric and disputed where applicable. Inferred/schematic massing must never become `documented` merely because its contextual source record exists.

Historical World UI must advertise only behaviors the shared runtime actually owns. Dormant legacy controls are hidden rather than shown as false affordances until they have canonical implementation and browser regression coverage.

## Responsive contract

The site uses one public catalog but distinct device composition. Product equivalence means the same meaningful public destinations remain reachable; it does not mean identical geometry or navigation chrome.

Phone and tablet layouts must use real browser/device state only. Do not fabricate mobile OS status information.

## Service worker

The service worker precaches the shell, brand/device adapter, generated module wiring, device stylesheet and News feed baseline with parallel independent fetches followed by a complete-or-fail cache write. Mutable same-origin assets and successful navigations use network-first behavior with cached offline fallback; non-core runtime entries are capped at 24. Activation removes superseded `aizanoi-field-shell-*` and `aizanoi-os-shell-*` caches. `/api/*` is never intercepted.

AizanoiOS is a stateful shell, so **updates do not call `skipWaiting()` automatically**. A newly installed worker waits for clients using the previous worker to close/reload before activation. First-time installs activate normally. This avoids forcing a new cache/import graph over a document that booted with an older shell version. If an explicit in-app update flow is introduced later, it must coordinate activation with a deliberate reload and browser regression coverage.

## Deployment boundary

GitHub is source of truth. A merge is not a deployment.

Production rollout requires:
- exact approved Git SHA;
- known rollback SHA/snapshot;
- applicable tests/builds;
- static deployment using the existing server procedure;
- post-deploy smoke checks;
- no production-only hot fix that bypasses Git.

See `docs/HERMES_OPERATIONS.md`.

## Change rules

1. Git first.
2. Static-first visitor runtime by default.
3. One registry and one window lifecycle.
4. All current public AizanoiOS apps remain behind manifest-driven module directories; flat app implementations must not return.
5. Generated module wiring contains installation/entry/requirements data only; human-authored product metadata stays in the canonical registry.
6. Module-private imports and undeclared host-service dependencies are forbidden; use public entries or declared capabilities.
7. `brand-platform.js` adapts; it does not fork the shell.
8. Aizanoi Analytics remains the company/umbrella brand unless `PRODUCT.md` is explicitly changed by the owner.
9. Retired power tools stay out of the public catalog unless the owner explicitly reverses the decision.
10. No server-backed public terminal or private-agent bridge.
11. No certainty inflation in Historical Worlds.
12. News requires structured source provenance.
13. Preserve public destination parity while giving desktop, tablet and mobile device-appropriate UX.
14. Interactive changes require regression coverage.
