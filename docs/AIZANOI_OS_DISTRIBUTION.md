# Aizanoi Field System — Distribution Architecture

Aizanoi Field System is the browser-native workspace for Aizanoi Analytics. It is intentionally **not** a Windows, macOS, Ubuntu or Linux desktop clone.

The current product combines a workstation metaphor with Aizanoi's actual content: digital archaeology, interactive historical worlds, local research tools, analytics experiments, projects, games and field documentation.

## Design direction

The distribution layer combines four ideas without copying another operating system:

1. **Workstation discipline** — legible tools, persistent local state, keyboard actions and multi-window workflow where the viewport supports it.
2. **Modern product ergonomics** — search-first navigation, calm spacing, context-aware actions, responsive fullscreen-equivalent mobile apps and clear hierarchy.
3. **Aizanoi visual identity** — survey grids, archaeological geometry, stone/paper/brass materials and restrained instrumentation.
4. **Browser-native capabilities** — IndexedDB/local storage, drag and drop, PWA installation and local file-oriented workflows without a visitor-facing application backend.

Retro cues are treated as texture and interaction heritage, not as an imitation target.

## One product across three form factors

The Field System has one canonical featured application registry across desktop, tablet and mobile.

Current featured applications:

1. Worlds
2. Archive
3. Notes
4. Data
5. Sources
6. Viewer
7. Projects
8. Terminal
9. Monitor
10. TV
11. Games

The form factor changes layout, not product meaning:

- **Desktop** — free multi-window workspace.
- **Tablet** — touch-friendly windowed workspace with stronger clamping and controls.
- **Mobile** — fullscreen-equivalent application surfaces with Home / Search / Open navigation.

## Runtime layers

### Compatibility foundation

The original document/window/application contracts remain the low-level compatibility base. Newer layers progressively normalize behavior rather than rewrite the full project in a framework.

### State and shell

- `frontend/js/os-state.js` — canonical app/world registry, preferences, recents, activity/session and context state.
- `frontend/js/os-shell.js` — primary window/application orchestration, Aizanoi Index and command surfaces.
- `frontend/js/os-v2.js` — lifecycle, accessibility, viewport and compatibility hardening.
- `frontend/js/os-unified.js` — shared desktop/tablet/mobile shell contract.
- `frontend/css/os-unified.css` — unified shell presentation.

### Product-polish layer

- `frontend/js/os-product-polish.js` — final product identity/presentation bridge across legacy and workstation surfaces.
- `frontend/css/os-product-polish.css` — shared application chrome, forms, typography, focus, scrolling and editorial surfaces.
- `frontend/css/os-product-polish-responsive.css` — narrow high-specificity responsive compatibility fixes.

This layer does not create a second window manager. It normalizes presentation around the existing runtime.

### Distribution platform

- `frontend/js/os-platform.js` — capability/loading bridge and Field System platform coordination.
- `frontend/js/os-archive.js` — IndexedDB-backed local research storage/import layer.
- `frontend/js/os-workbench.js` — workbench window lifecycle, Quick Look, file associations and cross-app handoffs.
- `frontend/js/os-workbench-archive.js` — Field Archive and Field Notes renderers.
- `frontend/js/os-workbench-readers.js` — Source Reader and Artifact Viewer renderers.
- `frontend/js/os-workbench-data.js` — Data Lab parser/profile/table workflow.
- `frontend/js/os-workbench-shell.js` — Workspace Monitor, pinned tools and desktop drop integration.
- `frontend/css/os-distribution*` / `frontend/css/os-workbench*` — workstation visual/layout modules under the final product layer.
- `frontend/manifest.webmanifest` + `frontend/service-worker.js` — installable/offline-capable static shell layer.

## Workstation applications

### Field Archive

A local, IndexedDB-backed research inventory. Collections include Notes, Sources, Screenshots, Datasets, Exports and Uploads.

Supported local workflows include CSV, JSON, PDF, Markdown/text and common image formats. Imported content stays in the current browser unless the visitor explicitly exports or downloads it.

On mobile, collections become a horizontal touch-friendly rail rather than disappearing.

### Data Lab

Local CSV/JSON inspection with parsing, row/column/missing-value profile, responsive table preview, filtering, CSV export and handoff to Field Notes.

It is an inspection/workflow tool, not a replacement for a full analytics engine.

Data Lab does not require a public application API and does not send imported datasets to an external model provider.

### Source Reader

PDF and Markdown/text reading surface with local search and Send to Notes workflow.

Source content remains within the local browser workspace unless the user explicitly exports something.

### Artifact Viewer

Local image/artifact viewing with zoom, fit, download and Send to Notes.

### Field Notes

Persistent browser-local Markdown-oriented notes with autosave and export.

Legacy local note content may be migrated where compatibility code explicitly supports it, but Notes do not require a server account or remote synchronization service.

### Workspace Monitor

Shows open workspace apps, browser storage, display/device hints and install/runtime information that the browser can legitimately know.

It is not a fake operating-system task manager and it does not depend on an application `/api/health` endpoint.

### Field Terminal

A browser-only virtual shell with a fixed in-memory filesystem and a fixed command set.

Current identity:

```text
AIZANOI FIELD TERMINAL / LOCAL VIRTUAL SHELL
aizanoi@field:~$
```

Security boundary:

- no arbitrary command execution;
- no server shell;
- no server filesystem access;
- no visitor-facing terminal API;
- no required `fetch`, XMLHttpRequest or WebSocket command channel.

## File workflow

Typical local flow:

```text
Field Archive
   |
   +-- Data Lab
   +-- Source Reader
   +-- Artifact Viewer
           |
           +-- Field Notes
                   |
                   +-- Export
```

File associations are owned by the workstation layer, not by decorative fake drives. The user can import through browser file-selection/drop workflows where supported.

## Static-only boundary

The production Field System does not require a visitor-facing Node/Express backend.

Historical server routes fail closed in production:

- `/api/chat` → `410 Gone`;
- other historical/unknown `/api/*` → `404`.

The service worker does not turn these routes into an offline pseudo-API and does not cache/intercept application API requests.

## PWA / installability

The shell registers a same-origin service worker and web manifest.

The PWA layer exists to improve static shell/app asset delivery and optional installability. It is not a hidden backend or synchronization service.

The website remains usable without installation.

## Product non-goals

Do not turn Aizanoi into a community operating system or app marketplace without a new product decision.

The current distribution intentionally does **not** add:

- visitor accounts/profiles;
- social/chat/community features;
- third-party app marketplace/package repository;
- public shared files;
- collaborative editing;
- server-side Terminal execution;
- external AI chat inside the public Field System;
- the removed Aizanoi Markets product.

## Quality gates

Meaningful Field System changes should continue to pass:

- Node syntax checks;
- repository regression tests;
- desktop/tablet/mobile Chromium smoke tests;
- workstation-specific browser flows;
- browser-only Terminal assertions;
- visual capture for shell/workstation changes;
- Lighthouse budgets;
- static-runtime security checks.

For repository-wide architecture rules, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).
