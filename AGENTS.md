# Aizanoi Analytics — Project Context

## Start here

Before changing code, read this file, then the nearest area-specific `AGENTS.md`, inspect the affected runtime path and check current Git history. Stability, historical truth and one coherent product are more important than broad rewrites.

Repository-level sources of truth:

- `README.md` — public product overview;
- `DESIGN.md` — Field System visual/interaction contract;
- `ARCHITECTURE.md` — current runtime/component ownership;
- `SECURITY.md` — public security boundary and reporting policy;
- `ROADMAP.md` — product direction;
- `docs/OPERATIONS.md` — server/provider work that requires independent evidence.

## Product scope — single publisher

Aizanoi Analytics is a **single-publisher digital-archaeology project** centered on Aizanoi, comparative Historical Worlds and browser-local research tools.

Visitors may browse, use the local workspace, play local experiments and explore historical worlds, but visitors do not interact with one another.

Unless the owner makes a new explicit product decision, **do not add or recommend**:

- visitor/user accounts, sign-in, profiles or identity systems;
- multiplayer or visitor-to-visitor gameplay;
- comments, chat rooms, forums, feeds, follows, likes or other community/social systems;
- public/shared leaderboards or cross-user score services;
- visitor-generated public content or collaborative editing;
- a visitor-facing server application/API for functionality that can stay safely browser-native;
- public AI chat or a remote shell.

Local browser preferences, research records, scores and field-session state are appropriate.

## Public architecture

The visitor-facing runtime is **static-only behind Nginx**.

```text
Browser
   |
   +-- Field System v3
   |     +-- local IndexedDB archive
   |     +-- lazy research/tool apps
   |     +-- browser-only Field Terminal
   |
   +-- Historical Worlds
   |     +-- Aizanoi
   |     +-- Rome
   |     +-- Athens
   |
Nginx -> static HTML/CSS/JS/assets only
```

Public contract:

- no visitor-facing Node/Express application backend;
- no public terminal execution service;
- historical `/api/chat` fails closed;
- other `/api/*` paths fail closed;
- production secrets/server/TLS configuration stay outside this repository;
- Hermes Agent is a separate private service, not part of the visitor-facing site.

## Field System v3

Field System v3 is the canonical product. The former XP/AI/compatibility/polish stack was deliberately retired; do not recreate it.

Canonical owners:

- `frontend/js/v3/registry.js` — the only app/world catalog;
- `frontend/js/v3/store.js` — workspace and field-session state;
- `frontend/js/v3/shell.js` — Home, windows, routes, commands, dialogs and responsive lifecycle;
- `frontend/js/v3/archive-store.js` — shared IndexedDB records;
- `frontend/js/v3/apps/` — lazy app modules;
- `frontend/styles/tokens.css` — canonical `--az-*` design tokens;
- `frontend/styles/base.css` — reset/base;
- `frontend/styles/shell.css` — shell/windows/responsive behavior;
- `frontend/styles/components.css` — canonical controls/dialogs/commands;
- `frontend/styles/apps.css` — app presentation, loaded lazily.

Do **not** create a new `final.css`, `polish.css`, `unified.css`, `responsive-fix.css` or another wrapper around `openApp`. Fix the owning module/style instead.

Home product hierarchy is intentional:

1. Mission / Continue Field Session
2. Historical Worlds
3. Research Workspace
4. Tools & Experiments

Desktop/tablet/mobile are one catalog and product with adaptive presentation, not separate registries.

### Window and route semantics

`?app=<id>` represents active app intent. The Workspace Store owns the full open-app/window snapshot. Back/Forward may change focus without destroying unrelated open apps. Closing the active app must leave the URL aligned with visible active state.

Dialogs must preserve opener, initial focus, Tab containment, background `inert`, Escape close and focus restore.

### Local research workspace

Field Archive, Notes, Data Lab, Source Reader and Artifact Viewer share `archive-store.js`. Imported files/notes/datasets stay browser-local unless the user explicitly exports/downloads them. Do not add silent telemetry or upload paths for workspace content.

### Field Terminal

`frontend/js/v3/apps/terminal.js` is a browser-only domain command surface. It may provide useful field commands such as `worlds`, `open`, `find`, `session`, `evidence`, `pwd`, `ls`, `cat`, `help` and `clear` against fixed local state.

It must not gain:

- fetch/XHR/WebSocket command transport;
- arbitrary process execution;
- server filesystem access;
- fake server/process/network output;
- a visitor-facing terminal backend/API.

### Workspace Monitor

`frontend/js/v3/apps/monitor.js` may show only facts the browser can measure: storage estimate, open apps, service-worker state, connectivity, viewport/input mode, install state and local field-session state. Do not fabricate CPU/RAM/server-health metrics.

### Experiments

`frontend/games/` contains local single-player/interaction experiments. Keep them visually and semantically secondary to Worlds and research tools. Do not turn local scores into public/shared leaderboards without a new product decision.

## Historical Worlds

`frontend/ancient-world/engine/` and `frontend/ancient-world/assets/` own reusable behavior. Read `frontend/ancient-world/AGENTS.md` before touching traversal, navigation, lifecycle, evidence, performance or reusable rendering assets.

Reusable movement/collision/input/evidence behavior belongs in shared contracts rather than being cloned per city.

### Aizanoi

`frontend/historic-world/` is the reference world at `/historic-world/`. Read its scoped `AGENTS.md` before movement, terrain, collision/support or world-UI changes.

### Rome

`frontend/ancient-cities/rome-410-476/` contains city-local source/data/rendering decisions for AD 410–476.

### Athens

`frontend/ancient-cities/athens-450-430/` contains city-local source/data/rendering decisions for Classical Athens. Never copy Rome-specific terminology/evidence claims into Athens.

### Field Session bridge

`frontend/ancient-world/engine/city-experience.js` may persist only a lightweight browser-local world/landmark/route/timestamp context. Large private Archive/Notes payloads do not belong in URLs or world session metadata.

### Historical evidence

Do not present plausible, inferred or atmospheric infill as archaeologically verified fact. Generic shared geometry never upgrades evidence certainty.

Research lives near the city implementations and under `research/`.

## Infrastructure / deployment

`infra/` contains sanitized static Nginx references only. Production Nginx/TLS configuration is outside this public repository.

A merge does not deploy the Hetzner server. Production deployment requires a verified exact Git SHA, rollback snapshot, source↔production checksum parity and post-deploy smoke checks.

Provider/GitHub-admin operations such as branch protection, Dependabot settings, accepted-login alerts and off-site backups must not be reported complete without independent evidence.

## Change rules

1. Never commit `.env`, API keys, tokens, passwords, private keys, certificates, backups, dumps or personal data.
2. Git first; do not edit production as the source of truth.
3. Keep visitor runtime static by default.
4. Modify canonical v3 owners; do not recreate compatibility layers.
5. Route/launcher changes need deep-link, in-app, Back/Forward and close/home verification.
6. Preserve desktop/tablet/mobile product equivalence even when interaction/layout differs.
7. Required coarse-pointer controls target at least 44×44 px; functional text stays at least 11–12 px.
8. Historical World behavior should be shared before renderer migration. Do not rewrite all cities onto a new 3D library merely for novelty.
9. Preserve evidence levels and city-local historical claims.
10. Do not broaden into accounts/multiplayer/community/shared leaderboards without explicit owner decision.
11. Meaningful commits only (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `security:`, `chore:`).
12. Security-sensitive changes need explicit regression coverage; never weaken a fail-closed test merely to make CI green.
13. Do not claim production/provider/manual-AT verification that was not actually performed.

## Validation

Useful local baseline:

```bash
node --check frontend/js/v3/main.js
node --check frontend/js/v3/registry.js
node --check frontend/js/v3/store.js
node --check frontend/js/v3/shell.js
node --check frontend/js/v3/archive-store.js
node --check frontend/js/v3/apps/research.js
node --check frontend/js/v3/apps/terminal.js
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

GitHub Actions is the full release gate. It additionally covers:

- Field System v3 source/security contract;
- desktop/tablet/mobile Chromium + axe checks;
- route/window/dialog lifecycle;
- lazy loading;
- Historical World UI/deep-link/traversal regression;
- current 51-landmark walk test;
- final rendered visual review;
- Lighthouse budgets.

Manual real-device touch and NVDA/VoiceOver/TalkBack checks remain human release tasks where CI cannot reproduce the environment faithfully.