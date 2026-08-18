# Aizanoi Analytics Architecture

This document is the maintained component map for the single-publisher Aizanoi Analytics platform.

## Runtime topology

```text
Browser
  |
  +-- Aizanoi OS static shell (/)
  |     +-- OS core + app registry
  |     +-- /js/os-v2.js progressive hardening/accessibility
  |     +-- /games/* local arcade games
  |     +-- virtual routes: /hr-analytics/, /games/, /projects/, ...
  |
  +-- Ancient World launcher (/ancient-world/ inside the OS)
  |     +-- /historic-world/                 Roman Aizanoi reference world
  |     +-- /ancient-cities/rome-410-476/   modular Rome
  |     +-- /ancient-cities/athens-450-430/ modular Athens
  |             |
  |             +-- /ancient-world/engine/* shared traversal/input/evidence/render helpers
  |
  +-- /api/chat -----------------------------+
  +-- /api/terminal/exec --------------------+--> nginx --> Node backend (127.0.0.1:3001)
                                                      +-- Groq -> Google fallback chain
                                                      +-- terminal command whitelist/sandbox
```

## Ownership boundaries

### `frontend/index.html`

Owns the Aizanoi OS document structure, desktop/application registry and legacy core runtime. New features should prefer external modules rather than increasing this file. The target direction is mechanical extraction, not a framework rewrite.

### `frontend/js/os-v2.js`

Progressive enhancement only: accessibility semantics, viewport recovery, scoped DOM observation, local chat/game UX polish and compatibility hardening. It must not become a second independent window manager.

### `frontend/games/`

Each game owns game rules/rendering. `game-utils.js` owns local-only score persistence and shared toolbar primitives. Public/shared leaderboards remain out of scope.

### `frontend/ancient-world/engine/`

Renderer-neutral shared behavior. City implementations consume these contracts instead of cloning movement/input logic:

- `traversal.js` — collision, substeps, support surfaces, safe spawn
- `lifecycle.js` — listeners/RAF/audio teardown
- `mobile-controls.js` — touch movement/look/run UI
- `navigation.js` — return to Aizanoi OS
- `evidence.js` — archaeological/documentary/inferred presentation
- `performance.js` — adaptive quality policy
- `surface-shader.js`, `environment-renderer.js` — shared visual pipeline
- `landmark-framing.js` — sightline-aware landmark arrival selection

### City directories

`frontend/ancient-cities/<city>/data/` owns historically scoped city facts, terrain, named structures, urban-fabric assumptions and source metadata. `js/app.js` owns city-specific geometry/readability. Procedural detail must not upgrade the evidence certainty of inferred content.

### `frontend/historic-world/`

Roman Aizanoi remains the mature traversal/experience reference. Refactoring is mechanical and behavior-preserving. Shared behavior should move outward gradually; a renderer rewrite is not a prerequisite.

### `backend/server.js`

Loopback-only Node service. Provider credentials remain server-side. `/api/chat` has bounded request history and provider fallback. `/api/terminal/exec` is command-whitelisted and path-contained; never replace it with arbitrary shell execution.

### `infra/`

Sanitized deployment examples only. Production files live on the server. Nginx owns public routing, real HTTP error behavior, security headers and proxy timeout alignment.

## Change rules

1. **No direct production-only fixes.** Code/config changes should exist in Git first, then be deployed.
2. **No new movement engine per city.** Extend shared engine contracts if a reusable behavior is missing.
3. **No certainty inflation.** Atmospheric/procedural reconstruction stays labelled as such.
4. **No social scope creep.** Accounts, comments, multiplayer and shared leaderboards are intentionally excluded unless product scope explicitly changes.
5. **Measure before heavyweight architecture changes.** No React/Next/Three.js-wide migration without a demonstrated product/performance benefit.
6. **Regression first.** Shared engine, OS lifecycle, routing, AI composer and mobile changes need automated coverage plus browser smoke where behavior is interactive.

## Release gate

A change is release-ready when applicable checks pass:

- JavaScript syntax validation
- Node regression suite
- `git diff --check`
- desktop/mobile Chromium OS smoke
- Rome/Athens movement + teleport smoke
- visual capture review for historical-world presentation changes
- Lighthouse budgets for the production-like static shell
- deployment config review when nginx/backend behavior changes

Manual NVDA/VoiceOver and real-device touch checks remain human release checks because GitHub Actions cannot faithfully emulate those assistive-technology environments.
