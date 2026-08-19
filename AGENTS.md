# Aizanoi Analytics — Project Context

## Start here

Before changing code, read this file, then the nearest area-specific `AGENTS.md`, inspect `git diff`/history, and map the affected runtime path. Stability is more important than a broad rewrite.

## Product scope — single publisher

Aizanoi Analytics is a **single-publisher website and interactive portfolio**. The owner publishes the content; visitors may browse, use local workstation tools, play local games and explore historical worlds, but visitors do not interact with one another.

Unless the owner makes a new explicit product decision, **do not add or recommend**:

- visitor/user accounts, sign-in, profiles or identity systems;
- multiplayer or visitor-to-visitor gameplay;
- comments, chat rooms, forums, feeds, follows, likes or other community/social systems;
- public/shared leaderboards or cross-user score services;
- visitor-generated content or collaborative editing;
- databases whose purpose is visitor identity, social state or shared game state.

Local browser preferences, scores and research workspace data are appropriate. A server-side application/API must not be introduced without an explicit product requirement and a separate security review.

## Areas

- **Aizanoi AI / Chat** — external AI integration is removed. `frontend/js/chat.js` is a fail-closed compatibility surface and must not regain network/provider access without a new explicit product decision, privacy review and abuse/security design.
- **Aizanoi OS shell / Aizanoi Field System** — the owner explicitly approved a major shell redesign on 2026-08-18. Preserve the mature window/app/runtime contracts, routes, terminal, games and accessibility work, but **do not treat Windows XP/Luna imitation as the product identity anymore**. The target is an original digital archaeology and intelligence workstation: `frontend/js/os-state.js`, `frontend/js/os-shell.js`, `frontend/css/os-aizanoi-next.css` own the new registry/state/shell/design layer; the older XP-oriented CSS/markup is a compatibility/fallback layer unless deliberately removed after regression coverage proves it safe.
- **Terminal** — `frontend/js/terminal.js`; browser-only virtual shell. It may simulate `pwd`, `whoami`, `date`, `echo`, `ls`, `cat`, `help` and `clear`, but must not use `fetch`, WebSocket, arbitrary shell execution, a server filesystem or a backend API.
- **Games** — `frontend/games/`; games are local single-player experiences. `frontend/games/game-utils.js` owns local score helpers; do not turn local scores into a public leaderboard without an explicit product decision.
- **Ancient World shared engine** — `frontend/ancient-world/engine/` plus `frontend/ancient-world/assets/`. Read `frontend/ancient-world/AGENTS.md` before changing traversal, navigation, lifecycle or reusable historical-world assets.
- **Aizanoi Historic World** — `frontend/historic-world/index.html`; standalone WebGL reconstruction at `/historic-world/`. Read `frontend/historic-world/AGENTS.md` before touching movement, terrain, collision, or UI. Its mature traversal remains an important visual/traversal reference.
- **Late Antique Rome** — `frontend/ancient-cities/rome-410-476/`; modular city data + shared Ancient World contracts + WebGL renderer.
- **Classical Athens** — `frontend/ancient-cities/athens-450-430/`; modular city data + shared Ancient World contracts + WebGL renderer. Do not copy Rome-specific terminology or evidence claims into Athens.
- **Legacy Ancient World launcher** — `frontend/index.html` (`FOLDER_CONTENTS.ancient`, `APPS.ancient`, `wireAncientIfNeeded`); `/ancient-world/` remains an information/entry window, while the Field System may present it under the stronger `Historical Worlds` shell label.
- **Aizanoi Markets** — removed from the current product; do not resurrect `/market/` without an explicit product decision.
- **Infrastructure / deployment** — the public Aizanoi web runtime is static-only behind Nginx. Production Nginx/TLS configuration is outside this public repository. Hermes Agent is a separate private server service and is not part of the visitor-facing web runtime.

## Change rules

1. Never commit `.env`, API keys, tokens, passwords, private keys, certificates, backups, dumps or personal data.
2. Do not edit production first. Stage, syntax-check, test, back up the target, then deploy.
3. Keep the visitor-facing web runtime static. Do not add Node/Express, server-side terminal execution or an application API for a feature that can safely run in the browser.
4. A single-file SPA edit requires inline-script parsing and route/window regression checks. Prefer new isolated CSS/JS modules over growing `frontend/index.html` when a low-risk boundary exists.
5. When a route or launcher changes, verify direct deep link, in-app navigation, back/forward, and return to `/`.
6. Ancient World behaviour (movement/collision/teleport/lifecycle/navigation/mobile controls) should be shared before renderer migration. Do not rewrite all historical cities onto a new 3D library in one change.
7. Historical reconstructions must preserve evidence levels. Do not present plausible/atmospheric infill as archaeologically verified.
8. Do not broaden the product into accounts, multiplayer, comments, community or shared leaderboard infrastructure unless the owner explicitly changes the product scope.
9. Meaningful commits only (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `security:`). Keep production and `main` synchronized after verified deployment.
10. For Aizanoi Field System work, preserve the existing working app/runtime layer unless a test proves a structural rewrite is necessary. New shell features should be real and useful; remove or de-emphasize fake OS affordances rather than adding more simulation for its own sake.

## Required lightweight validation

Before deploying meaningful frontend changes, run the relevant checks below (GitHub Actions is the source of truth for the full set):

```bash
node --check frontend/games/mines.js
node --check frontend/games/snake.js
node --check frontend/games/brick.js
node --check frontend/games/game-utils.js
node --check frontend/js/terminal.js
node --check frontend/js/os-state.js
node --check frontend/js/os-shell.js
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

GitHub Actions also runs real Chromium smoke coverage for Ancient World, the Aizanoi OS desktop/mobile shell and the browser-only terminal on `main`, feature/security branches and pull requests.
