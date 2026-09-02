# Frontend Index

Scope: production static application served to visitors.

Before changing frontend behavior, read root `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN.md` and the nearest local instructions.

## Route by task

- AizanoiOS shell, registry, device composition or public app runtime → [`js/v3/index.md`](js/v3/index.md)
- Site-wide visual styles → `styles/` (read `DESIGN.md` first)
- Analytics public route → `analytics/`
- Aizanoi News generated/public output → `news/` (source records live under `../content/news/`)
- Aizanoi TV → `tv/`
- Aizanoi Journal → `journal/`
- Aizanoi Forge → `forge/`
- Aizanoi Labs → `labs/`
- Aizanoi Arcade public landing → `arcade/`; AizanoiOS Arcade launcher/game runtime → [`js/v3/apps/games/index.md`](js/v3/apps/games/index.md)
- Aizanoi Historical World → `historic-world/`
- Rome / Athens → `ancient-cities/`
- Shared Historical Worlds engine → `ancient-world/engine/`
- Historical Worlds public index route → `worlds/`
- Web Editor isolated preview runner → `web-editor-preview/` (sandbox-only execution surface with route-scoped Nginx/CSP policy; not a standalone product)
- Static media/branding assets → `assets/`
- Service worker / offline behavior → `service-worker.js`
- Public entry document → `index.html`

## Historical Worlds naming map

The similarly named paths have distinct owners and should not be renamed casually because public routes, tests, cache and SEO depend on them:

- `historic-world/` — the Aizanoi visitor world;
- `ancient-cities/` — Rome and Athens visitor worlds;
- `ancient-world/engine/` — shared Historical Worlds runtime;
- `worlds/` — public world index route;
- `js/v3/apps/worlds/` — AizanoiOS Historical Worlds launcher module.

## Boundary

`frontend/` is the browser-facing static runtime. Do not introduce secrets, private-agent execution or a general visitor-facing backend here.

For AizanoiOS plug-in work, use `MODULE_CONTRACT.md` and enter through `js/v3/index.md` instead of scanning all frontend files.
