# Aizanoi Analytics — Project Context

## Start here

Before changing code, read this file, then the nearest area-specific `AGENTS.md`, inspect `git diff`/history, and map the affected runtime path. Stability is more important than a broad rewrite.

## Areas

- **Aizanoi Chat** — `backend/server.js`, frontend chat window in `frontend/index.html`; `/api/chat`; provider keys stay in production `.env` and never enter Git.
- **Ancient World shared engine** — `frontend/ancient-world/engine/` plus `frontend/ancient-world/assets/`. Read `frontend/ancient-world/AGENTS.md` before changing traversal, navigation, lifecycle or reusable historical-world assets.
- **Aizanoi Historic World** — `frontend/historic-world/index.html`; standalone WebGL reconstruction at `/historic-world/`. Read `frontend/historic-world/AGENTS.md` before touching movement, terrain, collision, or UI. Its mature traversal is the current reference implementation.
- **Late Antique Rome** — `frontend/ancient-cities/rome-410-476/`; modular city data + WebGL experience. It should consume shared Ancient World contracts instead of inventing a second movement engine.
- **Legacy Ancient World launcher** — `frontend/index.html` (`FOLDER_CONTENTS.ancient`, `APPS.ancient`, `wireAncientIfNeeded`); `/ancient-world/` remains the XP-style information/entry window.
- **Aizanoi Markets** — removed from the current product; do not resurrect `/market/` without an explicit product decision.
- **Shared frontend/navigation** — `frontend/index.html`; XP boot, desktop, windows, route map, metadata, search index and launcher.
- **Backend** — `backend/server.js`; Express API, CORS, rate limits, sandbox boundary and provider fallback chain.
- **Infrastructure / deployment** — production-only nginx/systemd configuration is outside this public repository. Live frontend root is `/var/www/aizanoianalytics.com`; backend is `/opt/aizanoi-backend`; credentials remain there.

## Change rules

1. Never commit `.env`, API keys, tokens, passwords, private keys, certificates, backups, dumps or personal data.
2. Do not edit production first. Stage, syntax-check, test, back up the target, then deploy.
3. A single-file SPA edit requires inline-script parsing and route/window regression checks.
4. When a route or launcher changes, verify direct deep link, in-app navigation, back/forward, and return to `/`.
5. Ancient World behaviour (movement/collision/teleport/lifecycle/navigation) should be shared before renderer migration. Do not rewrite both historical cities onto a new 3D library in one change.
6. Meaningful commits only (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`). Keep production and `main` synchronized after verified deployment.

## Required lightweight validation

Before deploying meaningful frontend/backend changes, run:

```bash
node --check backend/server.js
node --check frontend/games/mines.js
node --check frontend/games/snake.js
node --check frontend/games/brick.js
node --check frontend/ancient-world/engine/traversal.js
node --check frontend/ancient-world/engine/lifecycle.js
node --check frontend/ancient-world/engine/navigation.js
node --check frontend/ancient-world/assets/materials.js
node --check frontend/ancient-cities/rome-410-476/js/app.js
node --test tests/*.test.mjs
```

GitHub Actions runs the same lightweight validation on `main`, `fix/**`, `feat/**` branches and pull requests.
