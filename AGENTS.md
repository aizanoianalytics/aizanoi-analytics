# Aizanoi Analytics — Project Context

## Start here

Before changing code, read this file, then the nearest area-specific `AGENTS.md`, inspect `git diff`/history, and map the affected runtime path. Stability is more important than a broad rewrite.

## Product scope — single publisher

Aizanoi Analytics is a **single-publisher website and interactive portfolio**. The owner publishes the content; visitors may browse, use Aizanoi AI, play local games and explore historical worlds, but visitors do not interact with one another.

Unless the owner makes a new explicit product decision, **do not add or recommend**:

- visitor/user accounts, sign-in, profiles or identity systems;
- multiplayer or visitor-to-visitor gameplay;
- comments, chat rooms, forums, feeds, follows, likes or other community/social systems;
- public/shared leaderboards or cross-user score services;
- visitor-generated content or collaborative editing;
- databases whose purpose is visitor identity, social state or shared game state.

Local browser preferences and scores (`localStorage`) are appropriate. Server-side storage may still be introduced for owner-published content, operational needs or other non-social features if there is a concrete requirement, but it must not silently turn the product into a community platform.

## Areas

- **Aizanoi AI / Chat** — `backend/server.js`, frontend chat window in `frontend/index.html`; `/api/chat`; provider keys stay in production `.env` and never enter Git. The chat is visitor-to-assistant only, not visitor-to-visitor.
- **Aizanoi OS shell** — `frontend/index.html`, `frontend/css/aizanoi-polish.css`, `frontend/css/os-v2.css`, `frontend/js/os-v2.js`; boot, desktop, windows, taskbar, Start menu, routing, metadata, search and mobile shell. Keep the retro desktop identity while improving usability incrementally.
- **Games** — `frontend/games/`; games are local single-player experiences. `frontend/games/game-utils.js` owns local score helpers; do not turn local scores into a public leaderboard without an explicit product decision.
- **Ancient World shared engine** — `frontend/ancient-world/engine/` plus `frontend/ancient-world/assets/`. Read `frontend/ancient-world/AGENTS.md` before changing traversal, navigation, lifecycle or reusable historical-world assets.
- **Aizanoi Historic World** — `frontend/historic-world/index.html`; standalone WebGL reconstruction at `/historic-world/`. Read `frontend/historic-world/AGENTS.md` before touching movement, terrain, collision, or UI. Its mature traversal remains an important visual/traversal reference.
- **Late Antique Rome** — `frontend/ancient-cities/rome-410-476/`; modular city data + shared Ancient World contracts + WebGL renderer.
- **Classical Athens** — `frontend/ancient-cities/athens-450-430/`; modular city data + shared Ancient World contracts + WebGL renderer. Do not copy Rome-specific terminology or evidence claims into Athens.
- **Legacy Ancient World launcher** — `frontend/index.html` (`FOLDER_CONTENTS.ancient`, `APPS.ancient`, `wireAncientIfNeeded`); `/ancient-world/` remains the XP-style information/entry window.
- **Aizanoi Markets** — removed from the current product; do not resurrect `/market/` without an explicit product decision.
- **Backend** — `backend/server.js`; Express API, CORS, rate limits, sandbox boundary and provider fallback chain.
- **Infrastructure / deployment** — production-only nginx/systemd configuration is outside this public repository. Live frontend root is `/var/www/aizanoianalytics.com`; backend is `/opt/aizanoi-backend`; credentials remain there.

## Change rules

1. Never commit `.env`, API keys, tokens, passwords, private keys, certificates, backups, dumps or personal data.
2. Do not edit production first. Stage, syntax-check, test, back up the target, then deploy.
3. A single-file SPA edit requires inline-script parsing and route/window regression checks. Prefer new isolated CSS/JS modules over growing `frontend/index.html` when a low-risk boundary exists.
4. When a route or launcher changes, verify direct deep link, in-app navigation, back/forward, and return to `/`.
5. Ancient World behaviour (movement/collision/teleport/lifecycle/navigation/mobile controls) should be shared before renderer migration. Do not rewrite all historical cities onto a new 3D library in one change.
6. Historical reconstructions must preserve evidence levels. Do not present plausible/atmospheric infill as archaeologically verified.
7. Do not broaden the product into accounts, multiplayer, comments, community or shared leaderboard infrastructure unless the owner explicitly changes the product scope.
8. Meaningful commits only (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`). Keep production and `main` synchronized after verified deployment.

## Required lightweight validation

Before deploying meaningful frontend/backend changes, run the relevant checks below (GitHub Actions is the source of truth for the full set):

```bash
node --check backend/server.js
node --check frontend/games/mines.js
node --check frontend/games/snake.js
node --check frontend/games/brick.js
node --check frontend/games/game-utils.js
node --check frontend/js/os-v2.js
node --check frontend/ancient-world/engine/traversal.js
node --check frontend/ancient-world/engine/lifecycle.js
node --check frontend/ancient-world/engine/navigation.js
node --check frontend/ancient-world/engine/mobile-controls.js
node --check frontend/ancient-world/engine/surface-shader.js
node --check frontend/ancient-world/engine/environment-renderer.js
node --check frontend/ancient-world/assets/materials.js
node --check frontend/ancient-cities/rome-410-476/js/app.js
node --check frontend/ancient-cities/athens-450-430/js/app.js
node --test tests/*.test.mjs
```

GitHub Actions also runs real Chromium smoke coverage for Ancient World and the Aizanoi OS desktop/mobile shell on `main`, `fix/**`, `feat/**` branches and pull requests.
