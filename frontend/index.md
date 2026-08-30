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
- Aizanoi Arcade / browser games → `arcade/` and `games/`
- Aizanoi Historical World → `historic-world/`
- Rome / Athens → `ancient-cities/`
- Shared Historical Worlds engine → `ancient-world/engine/`
- Static media/branding assets → `assets/`
- Service worker / offline behavior → `service-worker.js`
- Public entry document → `index.html`

## Boundary

`frontend/` is the browser-facing static runtime. Do not introduce secrets, private-agent execution or a general visitor-facing backend here.

For AizanoiOS plug-in work, use `MODULE_CONTRACT.md` and enter through `js/v3/index.md` instead of scanning all frontend files.