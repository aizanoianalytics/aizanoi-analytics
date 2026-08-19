# Aizanoi Field System — Distribution Architecture

Aizanoi Field System is the browser-native shell for Aizanoi Analytics. It is intentionally **not** a Windows, macOS, Ubuntu or Linux desktop clone. The product combines a workstation metaphor with Aizanoi's actual content: AI, analytics, digital archaeology, interactive historical worlds, research material and experiments.

## Design direction

The 2.1 distribution layer combines four ideas without copying another OS:

1. **Workstation discipline** — dense but legible tools, persistent state, keyboard actions and a serious multi-window workflow.
2. **Modern product ergonomics** — search-first navigation, calm spacing, context-aware actions, responsive full-screen mobile apps and clear hierarchy.
3. **Aizanoi visual identity** — survey grids, contour lines, archaeological geometry, stone/paper/brass materials and restrained cyan instrumentation.
4. **Browser-native capabilities** — IndexedDB, drag and drop, PWA installation, local browser storage and explicit contextual AI actions.

Retro cues are treated as texture and interaction heritage, not as an imitation target. Futuristic cues are restrained to instrumentation, motion and information hierarchy rather than neon decoration.

## Runtime layers

### Compatibility runtime

The original window manager, routes, application contracts and accessibility/lifecycle hardening remain the foundation. The distribution work does not rewrite historical-world renderers or grant AI arbitrary execution rights.

### Field System shell

- `frontend/js/os-state.js` — app/world registry, preferences, recents, activity, session and context state.
- `frontend/js/os-shell.js` — Aizanoi Index, Command, System Panel, mobile shell and existing window orchestration.
- `frontend/css/os-aizanoi-next.css` — Field System compatibility skin.

### Distribution platform

- `frontend/js/os-platform.js` — capability registry, cross-app events, contextual command providers, PWA install state, storage/system information and notification bridge.
- `frontend/js/os-archive.js` — IndexedDB-backed local research storage and import layer.
- `frontend/js/os-workbench.js` — workbench window lifecycle, Quick Look, file associations and cross-app handoffs.
- `frontend/js/os-workbench-archive.js` — Field Archive and Field Notes renderers.
- `frontend/js/os-workbench-readers.js` — Source Reader and Artifact Viewer renderers.
- `frontend/js/os-workbench-data.js` — Data Lab parser/profile/table workflow.
- `frontend/js/os-workbench-shell.js` — Workspace Monitor, pinned tools, contextual commands and desktop drop integration.
- `frontend/css/os-distribution.css` plus the `os-distribution-*` / `os-workbench-*` modules — 2.1 visual system for the shell and workstation apps.
- `frontend/manifest.webmanifest` + `frontend/service-worker.js` — installable/offline shell layer.

## Workstation applications

### Field Archive

A local, IndexedDB-backed research inventory. Collections: Notes, Sources, Screenshots, Datasets, Exports and Uploads. Supported import/open paths include CSV, JSON, PDF, Markdown/text and common image formats. Files are local to the current browser unless the visitor explicitly downloads or exports them.

### Data Lab

CSV/JSON inspection with local parsing, row/column/missing-value profile, responsive table preview, filtering, CSV export, Send to Field Notes and an explicit Ask Aizanoi AI action using a bounded sample/context. It is an inspection/workflow tool, not a replacement for a full analytics engine.

### Source Reader

PDF and Markdown/text reading surface with search, Send to Notes and contextual AI action.

### Artifact Viewer

Local image viewing with zoom, fit, download and Send to Notes. The current AI endpoint is text-oriented, so image analysis is not falsely presented as supported.

### Field Notes

Persistent browser-local Markdown-oriented notes with autosave, export and explicit AI review. Legacy Notepad text is migrated once when available.

### Workspace Monitor

Shows open workspace apps, browser storage, API health, network/display/device hints and installation state. It reports browser-visible information only; it is not a fake operating-system task manager.

## File workflow

Typical flow:

`Field Archive → Data Lab / Source Reader / Artifact Viewer → Field Notes / Aizanoi AI → Export`

File associations are owned by the workstation layer, not by decorative fake drives. The user can import from the picker, drop files on the archive/desktop and, on supporting browsers, read the top level of a selected local folder after explicit permission.

## AI boundary

AI remains visitor-controlled and explicit: current historical-world context, a text/Markdown source, a bounded CSV/JSON sample/profile, or a Field Note can be sent deliberately to Aizanoi AI. The browser AI does **not** receive arbitrary server/system execution privileges and cannot silently operate the host machine.

## PWA / installability

The shell registers a same-origin service worker and web manifest. API requests are never cached by the service worker. Navigations use network-first behavior with the root shell as an offline fallback; static same-origin shell assets use cache-first/background-refresh behavior. The website remains fully usable without installation.

## Product non-goals

Do not turn Aizanoi into a community operating system or app marketplace without a new owner decision. The distribution does not add visitor accounts/profiles, social/chat/community features, third-party app marketplace/package repository, public shared files, collaborative editing, arbitrary AI system execution, or the removed Aizanoi Markets product.

## Quality gates

Meaningful changes must continue to pass Node syntax checks, repository regression tests, desktop/mobile Chromium smoke tests, workstation-specific browser flows, visual regression capture for shell/workstation/historical worlds, and existing Lighthouse budgets.
