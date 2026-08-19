# Aizanoi Analytics Architecture

This document is the maintained component map for the public Aizanoi Analytics platform.

The central architecture decision is simple: **the visitor-facing production application is static-only**. Interactive behavior lives in the browser unless a future product requirement is strong enough to justify a separate security and operations review.

## Runtime topology

```text
Browser
  |
  +-- Aizanoi Field System (/)
  |     +-- app/world registry + persistent local state
  |     +-- unified desktop/tablet/mobile shell
  |     +-- final product-polish/accessibility layers
  |     +-- local research workstation
  |     |     +-- Field Archive
  |     |     +-- Field Notes
  |     |     +-- Data Lab
  |     |     +-- Source Reader
  |     |     +-- Artifact Viewer
  |     |     +-- Workspace Monitor
  |     +-- Projects / Games / TV
  |     +-- browser-only Field Terminal
  |
  +-- Historical Worlds
  |     +-- /historic-world/                 Aizanoi reference world
  |     +-- /ancient-cities/rome-410-476/   Late Antique Rome
  |     +-- /ancient-cities/athens-450-430/ Classical Athens
  |             |
  |             +-- /ancient-world/engine/* shared traversal/input/evidence/render helpers
  |
  +-- HTTPS --> Nginx --> static frontend files only

Historical /api/chat       -> 410 Gone
Other historical /api/*   -> 404
Public application backend -> none
```

There is intentionally **no visitor-facing Node/Express application service** in the current production web architecture.

## Field System layers

The Field System grew from an older desktop-style shell, so the current architecture uses layered compatibility rather than an unnecessary framework rewrite.

### `frontend/index.html`

Owns the core document structure, legacy application factories and foundational window markup.

New work should avoid making this file more monolithic. The preferred direction is careful mechanical extraction while preserving browser behavior and test coverage.

### `frontend/js/os-state.js`

Owns shared application/world state and the canonical app registry.

The featured launcher is intentionally synchronized across desktop, tablet and mobile. Device layout may change, but the product catalog should not silently become three separate products.

### `frontend/js/os-shell.js`

Owns the primary shell/window behavior, launch flows and shared desktop interactions.

It is the window-management foundation; enhancement layers must not become competing window managers.

### `frontend/js/os-unified.js`

Owns the unified responsive shell contract.

- desktop: free windowed workspace;
- tablet: touch-friendly windowed workspace with stronger clamping/targets;
- mobile: fullscreen-equivalent app surfaces with shared product identity.

Breakpoints change layout, not the meaning of the application.

### `frontend/js/os-v2.js`

Progressive hardening/accessibility layer: viewport recovery, semantics, keyboard/focus improvements and compatibility behavior.

### `frontend/js/os-product-polish.js`

Final product presentation bridge for legacy and workstation surfaces.

It normalizes visible product identity, application chrome and stale compatibility copy without reimplementing mature application logic.

### `frontend/js/os-platform.js`

Coordinates the modern Field System loader chain and cross-device presentation assets.

### `frontend/service-worker.js`

Owns static PWA caching only.

The service worker must not intercept historical `/api/*` paths or become a hidden synchronization/backend layer. Cache namespace bumps are used when rollout consistency matters across already-installed clients.

## Local workstation applications

### `frontend/js/os-workbench*.js`

Own local research tools:

- Field Archive;
- Field Notes;
- Data Lab;
- Source Reader;
- Artifact Viewer;
- Workspace Monitor;
- shared workbench shell behavior.

Workspace content is local-first. These modules should not silently transmit imported files, notes or datasets to external services.

### `frontend/js/terminal.js`

Owns the browser-only Field Terminal.

Its security contract is intentionally narrow:

- fixed command set;
- fixed in-memory virtual filesystem;
- no arbitrary process execution;
- no host/server filesystem access;
- no WebSocket shell;
- no visitor-facing terminal endpoint dependency;
- no required network primitives for command execution.

Any proposal to turn this into a real remote shell is an architecture/security change, not a Terminal feature tweak.

## Games and project surfaces

### `frontend/games/`

Each game owns its game rules/rendering. `game-utils.js` owns local-only score persistence and shared toolbar primitives.

Public/shared leaderboards are intentionally out of current scope.

Projects and TV remain browser-facing presentation layers, not reasons to add accounts or a general application backend.

## Historical World architecture

### `frontend/ancient-world/engine/`

Renderer-neutral shared behavior. City implementations consume these contracts instead of cloning movement/input logic:

- `traversal.js` — collision, substeps, support surfaces, safe spawn;
- `lifecycle.js` — listeners/RAF/audio teardown;
- `mobile-controls.js` — touch movement/look/run UI;
- `navigation.js` — return to Aizanoi Field System;
- `evidence.js` — archaeological/documentary/inferred presentation;
- `performance.js` — adaptive quality policy;
- `surface-shader.js`, `environment-renderer.js` — shared visual pipeline;
- `landmark-framing.js` — sightline-aware landmark arrival selection;
- `city-contract.js`, `city-grounding.js` — reusable city contract/grounding helpers.

### City directories

`frontend/ancient-cities/<city>/data/` owns historically scoped city facts, terrain, named structures, urban-fabric assumptions and source metadata.

`js/app.js` owns city-specific geometry/readability.

Procedural detail must not upgrade the evidence certainty of inferred content.

### `frontend/historic-world/`

Aizanoi remains the project's mature historical reference environment and product center.

Refactoring should be behavior-preserving and evidence-aware. Shared behavior can move outward gradually; a renderer rewrite is not a prerequisite for improving the historical experience.

## Research boundary

Research is deliberately visible in the repository.

- `research/rome_410_476/` — Rome research and verified source material;
- `research/athens_450_430/` — Athens research and verified source material;
- city-level `data/` / methodology modules — implementation-facing historical assumptions;
- evidence UI — communicates certainty without pretending all reconstructed detail is equally sourced.

Historical-world contributions should preserve the difference between documented evidence, interpretation and atmosphere.

## Deployment boundary

### `infra/`

Sanitized deployment examples only.

Production files live on the server. Nginx owns:

- HTTPS/static routing;
- real HTTP error behavior;
- security headers;
- fail-closed historical API paths.

There is no Aizanoi application service for Nginx to proxy to.

Production secrets, private TLS material, backups and server-specific operational files do not belong in this repository.

## Change rules

1. **Git first.** No direct production-only application fixes; source changes should exist in Git before deployment.
2. **Keep the public web runtime static by default.** Do not add a server/API for a browser feature without a demonstrated requirement and separate security review.
3. **One product across devices.** Desktop/tablet/mobile may adapt layout but should preserve application identity and feature equivalence.
4. **No new movement engine per city.** Extend shared Ancient World contracts when behavior is reusable.
5. **No certainty inflation.** Atmospheric/procedural reconstruction stays identifiable as interpretation rather than fact.
6. **Keep local tools local.** Do not silently externalize Archive/Notes/Data Lab/Terminal data.
7. **No social scope creep by accident.** Accounts, comments, multiplayer and shared leaderboards require an explicit product decision.
8. **Measure before heavyweight rewrites.** No framework/renderer migration merely because a newer architecture exists.
9. **Regression first.** Shared engine, OS lifecycle, routing, Terminal, storage and mobile changes need automated coverage plus browser smoke where behavior is interactive.

## Release gate

A change is release-ready when applicable checks pass:

- JavaScript syntax validation;
- Node regression suite (test runner only; not a production backend);
- static-runtime security regression checks;
- `git diff --check`;
- desktop/tablet/mobile Chromium Field System smoke;
- Terminal browser smoke with no application API dependency;
- workstation application smoke;
- Rome/Athens movement, deep-link and teleport/landmark behavior;
- visual capture review for presentation changes;
- Lighthouse budgets for the production-like static shell;
- deployment config review when Nginx behavior changes.

Manual real-device touch checks and assistive-technology checks such as NVDA/VoiceOver remain human release checks because CI cannot faithfully reproduce those environments.
