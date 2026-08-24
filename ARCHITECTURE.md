# Aizanoi Analytics Architecture

The Aizanoi Analytics public visitor runtime is **static-first**. Nginx serves HTML, CSS, JavaScript, JSON and assets. Private automation such as Hermes may prepare content and deploy releases, but the browser does not receive a private-agent execution bridge.

## Runtime topology

```text
Browser
  |
  +-- AizanoiOS (/)
  |     +-- brand-platform.js       Aizanoi Analytics + device composition
  |     +-- registry.js             public app + world catalog
  |     +-- store.js                shell + field-session state
  |     +-- shell.js                canonical window/router/dialog lifecycle
  |     +-- device-shell.css        tablet/mobile presentation
  |     +-- apps/*                  lazy public application modules
  |     +-- /news/index.json        static News feed
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

### Registry

`frontend/js/v3/registry.js` contains only public apps and Historical Worlds. The visible analytical product is **Dashboards**; `/analytics/` and the `analytics` app id remain compatibility contracts. Retired Workbench/power tools must not remain directly addressable through `appById`, search, launcher or routing.

### Lazy applications

Public application modules load only when opened. `apps.css` remains lazy.

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

The compiler validates ids, dates, the four published sections (AI, Technology, Economy / Markets and Football), original summary length, author/editor identity, correction history and mandatory source publisher/URL/date provenance. It does not fetch third-party sites itself. Source discovery stays in the private/operator layer. It deterministically generates the current landing, daily edition paths, category archives, JSON edition feed, RSS and News sitemap discovery; `SOURCE_DATE_EPOCH` may pin build metadata. Generation is serialized by an exclusive lock, built and validated in same-filesystem staging, rollback-safe, and recoverable after stale locks or interrupted promotion. The compiler runs in the private checkout; generated outputs must return to Git before an approved exact-SHA production deployment.

`CONTENT_POLICY.md` is the publication contract.

## Historical Worlds

`frontend/ancient-world/engine/` owns shared traversal/input/evidence/presentation behavior. City-specific archaeology and hero decisions stay city-local.

The evidence boundary remains unchanged: documented/source-supported, archaeological/material, inferred, atmospheric and disputed where applicable.

## Responsive contract

The site uses one public catalog but distinct device composition. Product equivalence means the same meaningful public destinations remain reachable; it does not mean identical geometry or navigation chrome.

Phone and tablet layouts must use real browser/device state only. Do not fabricate mobile OS status information.

## Service worker

The service worker precaches the shell, brand/device adapter, device stylesheet and News feed baseline with parallel independent fetches followed by a complete-or-fail cache write. Mutable same-origin assets and successful navigations use network-first behavior with cached offline fallback; non-core runtime entries are capped at 24. Activation removes superseded `aizanoi-field-shell-*` and `aizanoi-os-shell-*` caches. `/api/*` is never intercepted.

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
4. `brand-platform.js` adapts; it does not fork the shell.
5. Aizanoi Analytics remains the company/umbrella brand unless `PRODUCT.md` is explicitly changed by the owner.
6. Retired power tools stay out of the public catalog unless the owner explicitly reverses the decision.
7. No server-backed public terminal or private-agent bridge.
8. No certainty inflation in Historical Worlds.
9. News requires structured source provenance.
10. Preserve public destination parity while giving desktop, tablet and mobile device-appropriate UX.
11. Interactive changes require regression coverage.
