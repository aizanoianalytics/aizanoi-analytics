# Aizanoi Architecture

The public visitor runtime is **static-first**. Nginx serves HTML, CSS, JavaScript, JSON and assets. Private automation such as Hermes may prepare content and deploy releases, but the browser does not receive a private-agent execution bridge.

## Runtime topology

```text
Browser
  |
  +-- AizanoiOS (/)
  |     +-- brand-platform.js       umbrella-brand desktop/dock adaptation
  |     +-- registry.js             app + world catalog
  |     +-- store.js                workspace + field-session state
  |     +-- shell.js                canonical window/router/dialog lifecycle
  |     +-- apps/*                  lazy application modules
  |     +-- IndexedDB               local Workbench records
  |     +-- /content/news/index.json static News feed
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

`frontend/js/v3/aizanoi-os.js` owns the desktop interaction layer: wallpaper desktop, top chrome, dock behavior, launcher lifecycle, window motion and snapping.

### Brand adapter

`frontend/js/v3/brand-platform.js` owns the current umbrella-brand presentation on top of the base OS:
- core dock apps;
- sparse public desktop shortcuts;
- Today at Aizanoi / resume widget;
- hiding Workbench internals from the public launcher.

It may adapt presentation, but must not create a second window manager or route system.

### Registry

`frontend/js/v3/registry.js` is the canonical app/world catalog. Public families are first-class entries. Internal Workbench apps remain addressable by id but may be hidden from the launcher/search surface.

### Lazy applications

`frontend/js/v3/apps/brand-hubs.js` mounts News, Analytics, Forge, Journal, Labs and Workbench hub surfaces. TV and Arcade retain dedicated modules.

## Aizanoi News pipeline

```text
Hermes / operator research
        ↓
content/news/items/*.json
        ↓
scripts/news/build-news.mjs
        ↓
frontend/content/news/index.json
        ↓
Aizanoi News app
```

The compiler validates ids, dates, categories, summary length and mandatory source URLs. It does not fetch third-party sites itself. Source discovery stays in the private/operator layer.

`CONTENT_POLICY.md` is the publication contract.

## Workbench privacy

Archive, Notes, Data Lab, Source Reader and Artifact Viewer remain browser-local unless the visitor explicitly exports data. Browser/user storage controls may delete local material.

Field Terminal remains browser-only and may never gain arbitrary server/process execution, server filesystem access or command transport to Hermes.

## Historical Worlds

`frontend/ancient-world/engine/` owns shared traversal/input/evidence/presentation behavior. City-specific archaeology and hero decisions stay city-local.

The evidence boundary remains unchanged: documented/source-supported, archaeological/material, inferred, atmospheric and disputed where applicable.

## Responsive contract

- Compact `<600px`: fullscreen-equivalent app surfaces + mobile navigation.
- Medium `600–839px`: single focus workspace.
- Expanded `840–1199px`: large touch-friendly focus workspace.
- Large `>=1200px`: freeform windows.

One app registry serves every device class.

## Service worker

The service worker precaches the shell, brand adapter and News feed baseline. Mutable same-origin static assets use network-first behavior with cached fallback. `/api/*` is never intercepted.

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
5. No Workbench upload path without explicit product decision.
6. No server-backed public terminal.
7. No certainty inflation in Historical Worlds.
8. News requires structured source provenance.
9. Preserve desktop/tablet/mobile equivalence.
10. Interactive changes require regression coverage.
