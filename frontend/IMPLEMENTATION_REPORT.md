# Aizanoi Analytics — Current Implementation Report

**Updated:** 2026-08-18

This document describes the current repository architecture. For product constraints and change rules, read the root `AGENTS.md` first. For upcoming work, see `frontend/NEXT_PHASE_TODO.md`.

## Product model

Aizanoi Analytics is a **single-publisher interactive website / portfolio**. Visitors can browse owner-published content, use Aizanoi AI, play local single-player games and explore historical worlds. The product intentionally does **not** include visitor accounts, multiplayer, comments/community, visitor-to-visitor messaging or shared/public leaderboards.

## Main product areas

- **Aizanoi OS** — retro desktop shell and application launcher
- **Aizanoi AI** — HR & People Analytics assistant
- **Ancient World** — research-led first-person historical reconstructions
- **Games** — Mines, Snake and Brick Breaker
- **Projects / Docs / Changelog / Aizanoi TV** — owner-published portfolio/content surfaces

## Frontend architecture

### Aizanoi OS shell

Primary shell: `frontend/index.html`.

The shell still contains the legacy SPA/window-manager core, but new polish is being separated into low-risk modules instead of growing the monolith indefinitely:

- `frontend/css/aizanoi-polish.css` — first visual refinement layer
- `frontend/css/os-v2.css` — current product/mobile/accessibility polish layer
- `frontend/js/os-v2.js` — current window/taskbar/Start-menu/accessibility enhancement layer

Current OS features include:

- boot, lock, shutdown and screensaver flows;
- draggable/resizable/maximizable/minimizable windows;
- taskbar and Start menu;
- custom Aizanoi branding, icons and wallpapers;
- Show Desktop and viewport clamping;
- mobile safe-area / dynamic-viewport sizing;
- Control Panel themes/preferences;
- keyboard/focus/ARIA improvements;
- direct URL routing for public app routes.

### Aizanoi AI frontend

The chat window remains hosted by the OS shell. Assistant responses use the existing HTML-escaping Markdown renderer before being inserted into the UI. Current chat UX includes:

- starter prompts;
- loading/error states;
- formatted Markdown answers;
- per-answer copy;
- copy-last-answer;
- clear local conversation state.

Chat history is local in the current page session; there is no visitor account or community chat system.

### Games

Game modules:

- `frontend/games/mines.js`
- `frontend/games/snake.js`
- `frontend/games/brick.js`
- shared helper: `frontend/games/game-utils.js`

Games are local single-player experiences. Scores are stored in `localStorage['aizanoi-games']`; there is no server-side or public leaderboard. The shared helper provides local best-score display and common toolbar behavior. Games support pause/restart and clean up active timers when their containers are removed.

## Ancient World architecture

Ancient World is no longer a one-off city demo. The repository now has a shared engine layer plus city-specific data/rendering.

### Shared engine

`frontend/ancient-world/engine/` contains reusable contracts for:

- traversal / sub-stepped first-person movement;
- spatial collision;
- support surfaces / height handling;
- teleport safety;
- lifecycle cleanup;
- Back to Aizanoi OS navigation;
- analog mobile movement and drag-look;
- renderer-neutral city manifests;
- evidence/certainty levels;
- adaptive render quality;
- shared procedural surface shading;
- shared sky and animated water passes.

`frontend/ancient-world/assets/` contains shared renderer-neutral material tokens.

### Aizanoi Historic World

Path: `frontend/historic-world/index.html`
Route: `/historic-world/`

This remains the most hand-authored historical environment and an important quality reference. It includes mature terrain/traversal, collision, walk surfaces, stairs, river/bridges, monuments, evidence UI and historical layers.

### Late Antique Rome

Path: `frontend/ancient-cities/rome-410-476/`
Route: `/ancient-cities/rome-410-476/`

Rome consumes the shared Ancient World contracts and has city-specific:

- terrain/topography and Tiber valley;
- roads and urban fabric;
- named monuments and regions;
- evidence metadata;
- city-specific renderer/builders;
- atmospheric palette, procedural surface detail, shared sky/water;
- analog mobile controls and desktop mouse/WASD controls.

### Classical Athens

Path: `frontend/ancient-cities/athens-450-430/`
Route: `/ancient-cities/athens-450-430/`

Athens also consumes the shared contracts and has city-specific:

- Attic schematic topography;
- Acropolis/Agora/Piraeus-related city data;
- Classical monuments and roads;
- plausible deterministic urban infill;
- evidence metadata;
- dedicated hero builders including Parthenon and Propylaea;
- city-specific atmosphere and shared sky/water/mobile input.

### Historical evidence model

Reconstructions distinguish evidence levels so visual infill is not silently presented as certain archaeology. The shared model supports categories such as archaeological, documented, plausible and atmospheric/illustrative evidence.

## Backend

Primary backend: `backend/server.js`.

Current responsibilities include:

- `GET /api/health`
- `POST /api/chat`
- `POST /api/terminal/exec`
- Groq primary model provider
- Google fallback provider
- rate/sandbox/security boundaries

Provider secrets remain production-side in `.env`; they are not committed to the repository. The backend is intended to remain behind the reverse proxy and bound to loopback in production.

## Routing / retired surfaces

Important public behaviors include:

- `/` — Aizanoi OS
- `/hr-analytics/` — Aizanoi AI route
- `/ancient-world/` — XP-style Ancient World launcher/information window
- `/historic-world/` — Aizanoi Historic World
- `/ancient-cities/rome-410-476/` — Late Antique Rome
- `/ancient-cities/athens-450-430/` — Classical Athens
- `/games/` — Games
- `/projects/`, `/videos/`, `/about/`, `/docs/`, `/changelog/`, `/privacy/`, `/terms/` — owner-published/application surfaces
- `/ai/` — legacy redirect to `/hr-analytics/`
- `/market/` — retired; must not be resurrected without an explicit product decision

Production nginx behavior must be verified against the production-only configuration; repository infrastructure examples are reference material, not a blind replacement for live config.

## CI / regression protection

`.github/workflows/ci.yml` validates meaningful branches and pull requests.

Current coverage includes:

- JavaScript syntax checks for backend, games, Aizanoi OS V2 and Ancient World modules;
- Node regression tests;
- whitespace checks;
- real headless Chromium smoke tests for Rome/Athens desktop + mobile controls;
- real headless Chromium smoke tests for Aizanoi OS desktop/mobile window behavior;
- lightweight frontend file-size budgets.

The Chromium tests verify behavior rather than only searching source strings.

## Security / privacy principles

- secrets never enter Git;
- AI/provider keys remain server-side;
- visitor accounts are intentionally absent;
- game scores/preferences are browser-local;
- no community/social state is collected by product design;
- historical uncertainty must remain visible rather than being hidden by visual polish;
- production deployment is separate from code review/merge and should preserve `.env` and production-only configuration.

## Current technical debt

The largest remaining frontend debt is still `frontend/index.html`. It is functional and regression-tested, but it remains a large mixed HTML/CSS/JS shell. New work should prefer isolated modules when a safe boundary exists rather than performing a risky wholesale framework rewrite.

Other meaningful future work is documented in `frontend/NEXT_PHASE_TODO.md`; the highest-value direction is deeper city/landmark content quality, measured performance/accessibility work and continued low-risk modularization—not accounts/community feature expansion.
