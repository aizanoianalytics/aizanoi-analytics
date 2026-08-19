# Aizanoi Analytics — Project Context

## Start here

Before changing code, read this file, then the nearest area-specific `AGENTS.md`, inspect `git diff`/history, and map the affected runtime path. Stability and product truth are more important than a broad rewrite.

Also use the repository-level sources of truth:

- `README.md` — public product overview;
- `ARCHITECTURE.md` — current ownership/runtime boundaries;
- `SECURITY.md` — public security boundary and reporting policy;
- `ROADMAP.md` — current product direction.

## Product scope — single publisher

Aizanoi Analytics is a **single-publisher website and interactive portfolio** centered on Aizanoi, interactive historical worlds and browser-native research tools.

Visitors may browse, use local workstation tools, play local games and explore historical worlds, but visitors do not interact with one another.

Unless the owner makes a new explicit product decision, **do not add or recommend**:

- visitor/user accounts, sign-in, profiles or identity systems;
- multiplayer or visitor-to-visitor gameplay;
- comments, chat rooms, forums, feeds, follows, likes or other community/social systems;
- public/shared leaderboards or cross-user score services;
- visitor-generated public content or collaborative editing;
- databases whose purpose is visitor identity, social state or shared game state.

Local browser preferences, scores and research workspace data are appropriate. A visitor-facing server application/API must not be introduced without an explicit product requirement and a separate security review.

## Current public architecture

The public Aizanoi web runtime is **static-only behind Nginx**.

```text
Browser
   |
   +-- Aizanoi Field System
   +-- Historical Worlds
   +-- local browser tools
   +-- browser-only Field Terminal
   |
Nginx -> static HTML/CSS/JS/assets
```

Current production contract:

- no visitor-facing Node/Express application backend;
- no public terminal execution service;
- historical `/api/chat` fails closed;
- other historical/unknown `/api/*` paths fail closed;
- production server/TLS configuration stays outside this repository.

Hermes Agent is a separate private server service and is not part of the visitor-facing Aizanoi web runtime.

## Areas

### Aizanoi Field System

The owner approved a major shell redesign in August 2026. Preserve the mature application/window/runtime contracts, but **do not treat Windows XP/Luna imitation as the product identity**.

The target is an original digital-archaeology field workstation with one product across desktop, tablet and mobile.

Important layers:

- `frontend/js/os-state.js` — canonical app/world registry and shared state;
- `frontend/js/os-shell.js` — primary shell/window behavior;
- `frontend/js/os-v2.js` — lifecycle/accessibility/compatibility hardening;
- `frontend/js/os-unified.js` — synchronized desktop/tablet/mobile shell;
- `frontend/js/os-product-polish.js` — final product presentation/identity bridge;
- `frontend/js/os-platform.js` — platform/loading coordination;
- `frontend/css/os-unified.css` — shared responsive shell;
- `frontend/css/os-product-polish*.css` — final application/UI presentation.

The older XP-oriented CSS/markup is a compatibility/fallback layer unless deliberately removed after regression coverage proves it safe.

Do not solve a device-specific bug by creating a second app registry or independent mobile product.

### Local workstation

- `frontend/js/os-archive.js`
- `frontend/js/os-workbench.js`
- `frontend/js/os-workbench-archive.js`
- `frontend/js/os-workbench-readers.js`
- `frontend/js/os-workbench-data.js`
- `frontend/js/os-workbench-shell.js`

These own Field Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Workspace Monitor and related local workflows.

Keep workspace content browser-local by default. Do not silently upload imported files, notes or datasets to external services.

### External AI / chat compatibility

External AI integration is removed. `frontend/js/chat.js` and any remaining legacy AI-compatible markup are **fail-closed compatibility surfaces**, not an active product.

Do not restore provider/network access, AI launcher entries or a public AI route without a new explicit product decision, privacy review and abuse/security design.

### Field Terminal

`frontend/js/terminal.js` owns a browser-only virtual shell.

It may simulate the fixed command set (`pwd`, `whoami`, `date`, `echo`, `ls`, `cat`, `help`, `clear`) against its in-memory virtual filesystem.

It must not gain:

- `fetch`/XHR/WebSocket command transport;
- arbitrary shell/process execution;
- server filesystem access;
- a visitor-facing terminal backend/API.

### Games

`frontend/games/` contains local single-player experiences. `frontend/games/game-utils.js` owns local score helpers.

Do not turn local scores into a public/shared leaderboard without an explicit product decision.

### Ancient World shared engine

`frontend/ancient-world/engine/` plus `frontend/ancient-world/assets/` owns reusable historical-world behavior.

Read `frontend/ancient-world/AGENTS.md` before changing traversal, navigation, lifecycle, evidence, performance or reusable rendering assets.

Reusable movement/collision/input/evidence behavior belongs in shared contracts rather than being cloned per city.

### Aizanoi Historic World

`frontend/historic-world/` — standalone WebGL reconstruction at `/historic-world/`.

Read `frontend/historic-world/AGENTS.md` before touching movement, terrain, collision, support surfaces or historical-world UI.

Aizanoi is the center of the project and remains the strongest product/historical reference world.

### Late Antique Rome

`frontend/ancient-cities/rome-410-476/` — modular city data + shared Ancient World contracts + WebGL renderer.

### Classical Athens

`frontend/ancient-cities/athens-450-430/` — modular city data + shared Ancient World contracts + WebGL renderer.

Do not copy Rome-specific terminology or evidence claims into Athens.

### Historical evidence

Historical reconstructions must preserve evidence levels. Do not present plausible, inferred or atmospheric infill as archaeologically verified fact.

Research lives both in city-facing data/methodology modules and under `research/`.

### Legacy Ancient World launcher

`frontend/index.html` still contains compatibility/launcher wiring for the Ancient World area. The Field System may present it under the stronger `Historical Worlds` product label.

### Aizanoi Markets

Removed from the current product. Do not resurrect `/market/` without an explicit product decision.

### Infrastructure / deployment

`infra/` contains sanitized static Nginx examples only. Production Nginx/TLS configuration is outside this public repository.

A Git merge does not automatically deploy to the live Hetzner server.

## Change rules

1. Never commit `.env`, API keys, tokens, passwords, private keys, certificates, backups, dumps or personal data.
2. Do not edit production first. Change Git, test it, take a rollback backup, then deploy the verified source.
3. Keep the visitor-facing web runtime static by default. Do not add Node/Express, server-side Terminal execution or a public application API for a feature that can safely run in the browser.
4. Prefer isolated CSS/JS modules over growing `frontend/index.html` when a low-risk boundary exists; do not perform a wholesale framework rewrite without measured need.
5. When a route or launcher changes, verify direct deep link, in-app navigation, back/forward and return-to-home behavior where relevant.
6. Field System changes must preserve desktop/tablet/mobile product equivalence even when layout differs.
7. Ancient World behavior (movement/collision/teleport/lifecycle/navigation/mobile controls/evidence) should be shared before renderer migration. Do not rewrite all cities onto a new 3D library in one change.
8. Historical reconstructions must preserve evidence levels. Do not silently upgrade procedural atmosphere into historical certainty.
9. Do not broaden the product into accounts, multiplayer, comments, community or shared leaderboard infrastructure unless the owner explicitly changes the product scope.
10. Meaningful commits only (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `security:`, `chore:`). Keep production and `main` synchronized after verified runtime deployment.
11. New Field System features should be real/useful; remove or de-emphasize fake OS affordances rather than adding simulation for its own sake.
12. Security-sensitive runtime changes need explicit regression coverage; do not weaken a fail-closed test merely to make CI green.

## Required lightweight validation

Run the checks relevant to the changed area. GitHub Actions is the source of truth for the full release gate.

Useful local baseline:

```bash
node --check frontend/games/mines.js
node --check frontend/games/snake.js
node --check frontend/games/brick.js
node --check frontend/games/game-utils.js
node --check frontend/js/chat.js
node --check frontend/js/terminal.js
node --check frontend/js/os-state.js
node --check frontend/js/os-shell.js
node --check frontend/js/os-intent.js
node --check frontend/js/os-v2.js
node --check frontend/js/os-unified.js
node --check frontend/js/os-product-polish.js
node --check frontend/js/os-platform.js
node --check frontend/js/os-archive.js
node --check frontend/js/os-workbench.js
node --check frontend/js/os-workbench-archive.js
node --check frontend/js/os-workbench-readers.js
node --check frontend/js/os-workbench-data.js
node --check frontend/js/os-workbench-shell.js
node --check frontend/service-worker.js
node --check frontend/ancient-world/engine/traversal.js
node --check frontend/ancient-world/engine/lifecycle.js
node --check frontend/ancient-world/engine/navigation.js
node --check frontend/ancient-world/engine/evidence.js
node --check frontend/ancient-world/engine/mobile-controls.js
node --check frontend/ancient-world/engine/performance.js
node --check frontend/ancient-cities/rome-410-476/js/app.js
node --check frontend/ancient-cities/athens-450-430/js/app.js
node --test tests/*.test.mjs
git diff --check
```

GitHub Actions additionally runs real Chromium coverage for:

- Ancient World / Rome / Athens;
- Aizanoi Field System desktop, tablet and mobile;
- workstation applications;
- browser-only Field Terminal;
- disabled/fail-closed AI command surfaces;
- final visual-review capture;
- Lighthouse budgets;
- static-runtime security gates.

Manual real-device touch and assistive-technology checks remain human release checks where CI cannot reproduce the environment faithfully.
