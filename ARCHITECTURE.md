# Aizanoi Analytics Architecture

The visitor-facing product is **static-only**. Nginx serves HTML, CSS, JavaScript and assets; application state and research records live in the browser. There is no visitor-facing Node/Express service, terminal endpoint or application API.

## Runtime topology

```text
Browser
  |
  +-- Aizanoi Field System (/)
  |     +-- js/v3/registry.js        app + world definitions
  |     +-- js/v3/store.js           workspace + field-session state
  |     +-- js/v3/shell.js           canonical window/router/dialog/commands
  |     +-- js/v3/archive-store.js   IndexedDB local archive
  |     +-- js/v3/apps/*             lazy application modules
  |     +-- styles/tokens.css        canonical --az-* tokens
  |     +-- styles/base.css          reset/base
  |     +-- styles/shell.css         responsive shell/windows
  |     +-- styles/components.css    dialogs/commands/components
  |     +-- styles/apps.css          lazy application presentation
  |
  +-- Historical Worlds
  |     +-- /historic-world/                 Aizanoi reference world
  |     +-- /ancient-cities/rome-410-476/   Late Antique Rome
  |     +-- /ancient-cities/athens-450-430/ Classical Athens
  |     +-- /ancient-world/engine/*          shared traversal/evidence/UI helpers
  |
  +-- HTTPS -> Nginx -> static files only

Historical /api/chat -> 410 Gone
Other /api/*         -> 404
Application backend  -> none
```

## Field System v3

Field System v3 deliberately replaces the old compatibility stack instead of layering another theme over it. The root document is a small semantic bootstrap: four initial stylesheets and one ES module. Research/tool applications load only when opened.

### Registry

`frontend/js/v3/registry.js` is the only application/world catalog.

Each app defines an id, label, icon, group, lazy module and searchable metadata. Device-specific launchers do not maintain separate catalogs.

### Workspace Store

`frontend/js/v3/store.js` owns:

- open app ids;
- active app intent;
- desktop window rectangles;
- recents/activity;
- preferences;
- browser-local Historical World session context.

The URL represents the **active app intent** (`?app=<id>`), not a serialized desktop snapshot. Back/forward may change focus without destroying unrelated open windows.

### Shell / WindowFrame / Router / Commands / Dialogs

`frontend/js/v3/shell.js` is the canonical lifecycle.

It owns:

- responsive Home hierarchy;
- app open/focus/minimize/maximize/close;
- desktop drag/resize and keyboard move/resize path;
- task shelf and app switcher;
- route intent synchronization;
- command palette;
- modal focus trap, background inert state and opener focus restore;
- lazy app loading.

Applications mount content into a supplied container and may return cleanup logic. They do not create a second window manager.

### Local Archive

`frontend/js/v3/archive-store.js` owns IndexedDB research records.

The Archive is local-first, not cloud-synced. Imported files and notes are not silently sent to a service. Browser/user storage controls can delete local data, so important material should be exported outside the browser when long-term retention matters.

### Research applications

`frontend/js/v3/apps/research.js` mounts:

- Field Archive;
- Field Notes;
- Data Lab;
- Source Reader;
- Artifact Viewer.

The applications share Archive records and metadata instead of duplicating storage systems.

### Field Terminal

`frontend/js/v3/apps/terminal.js` is a browser-only task shell. It exposes domain commands such as `worlds`, `open`, `find`, `session` and `evidence` plus a tiny fixed virtual file set.

It intentionally has no arbitrary process execution, host filesystem access, server hostname/process simulation, WebSocket shell or terminal API dependency.

### Workspace Monitor

`frontend/js/v3/apps/monitor.js` reports only facts that the browser can actually measure: storage estimate, open apps, service-worker state, connectivity, viewport, installation mode and local field-session state. It does not invent CPU/RAM/server-health telemetry.

## CSS architecture

Canonical Field System styles use one namespace: `--az-*`.

```css
@layer reset, tokens, base, shell, components, apps, utilities;
```

The old global `frontend/css/` compatibility stack is retired. New presentation work must modify the canonical layer that owns the behavior instead of creating another override/polish file.

See [DESIGN.md](DESIGN.md).

## Responsive contract

- Compact `<600px`: fullscreen-equivalent apps + bottom navigation.
- Medium `600–839px`: single focus workspace.
- Expanded `840–1199px`: large touch-friendly focus workspace.
- Large `>=1200px`: freeform desktop windows.

Input capability still matters: coarse-pointer targets use a 44 px floor and required actions cannot depend on hover.

## Historical Worlds

Historical Worlds remain city-specific where history demands it and shared where behavior is genuinely reusable.

`frontend/ancient-world/engine/` contains shared traversal, lifecycle, input, evidence and presentation helpers. City data and hero monument decisions stay in their own city directories.

`city-experience.js` also maintains a lightweight `aizanoi-field-session-v1` record. Entering or changing a landmark updates this browser-local context; the Explore drawer includes a Field System return action. The OS can then offer **Continue Field Session** without putting private note/archive payloads in the URL.

The prior 51-landmark Aizanoi/Rome/Athens walk QA remains a regression gate.

## Evidence boundary

The project distinguishes documented/source information, archaeological evidence, explicit inference and atmospheric reconstruction. Generic shared geometry or urban-fabric helpers never upgrade the evidence certainty of city-local content.

## Service worker

`frontend/service-worker.js` caches only static shell/assets. It must never intercept `/api/*`, become a hidden sync layer or cache a visitor backend that does not exist. Root/service-worker updates revalidate promptly; lazy application files use bounded caching until content-hashed production assets are introduced.

## Deployment boundary

`infra/nginx/aizanoianalytics.com.conf.example` is a sanitized static deployment baseline. It includes:

- fail-closed historical API paths;
- gzip static compression;
- explicit PWA manifest MIME;
- no-cache shell/service-worker policy;
- bounded static asset caching;
- security headers;
- `/.well-known/security.txt`;
- no application proxy.

Provider/server actions such as production rollout, branch protection, off-site backups and accepted-login alerts require evidence outside the repository and must not be marked complete merely because guidance exists here.

## Change rules

1. Git first; no production-only application fixes.
2. Keep visitor runtime static by default.
3. One registry and one window lifecycle.
4. One product across desktop/tablet/mobile.
5. No new movement engine per city.
6. No certainty inflation in reconstruction.
7. Keep local research local unless export is explicit.
8. No new override/polish compatibility layer.
9. Measure before framework/renderer rewrites.
10. Interactive changes need regression tests plus rendered browser review.

## Release gate

Applicable release checks include:

- JavaScript syntax validation;
- Node regression suite used only as a test runner;
- Field System v3 source/security contract;
- desktop/tablet/mobile Chromium smoke;
- axe serious/critical gate on canonical shell surfaces;
- route/window/dialog lifecycle checks;
- Historical Worlds traversal/deep-link/landmark regression;
- visual capture review;
- Lighthouse budgets;
- `git diff --check`;
- Nginx example review when delivery behavior changes.

Manual NVDA/VoiceOver/TalkBack and real-device touch checks remain human QA rather than being falsely claimed as automated.