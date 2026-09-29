# Frontend

The public product is **Aizanoi** (flagship interactive historical reconstruction) and **Aizanoi Dungeon** (flagship browser game). Index

Scope: production static application served to visitors.

Before changing frontend behavior, read root `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN.md` and the nearest local instructions.

## Route by task

- AizanoiOS shell, registry, device composition or public app runtime → [`js/v3/index.md`](js/v3/index.md)
- Site-wide visual styles → `styles/` (read `DESIGN.md` first)
- Analytics → `analytics/`; News → `news/`; TV → `tv/`; Journal → `journal/`; Forge → `forge/`; Labs → `labs/`; Arcade → `arcade/`
- Aizanoi product landing and the flagship world runtime → [`worlds/`](worlds/)
- Web Editor isolated preview runner → `web-editor-preview/`
- Static media/branding assets → `assets/`
- Service worker / offline behavior → `service-worker.js`
- Public entry document → `index.html`

## Aizanoi world ownership

Aizanoi is the primary interactive world of Aizanoi Analytics, not one entry in a multi-world catalog.

- `worlds/` — public Aizanoi product landing;
- `worlds/shared/` — shared Three.js r174 engine, assets, styles and local vendor files;
- `worlds/aizanoi-225/` — Aizanoi · Roman Phrygia, AD 225.

The AizanoiOS launcher for the world lives at `js/v3/apps/aizanoi/`. `historic-world/`, `ancient-cities/` and `iga/` are compatibility redirects only; do not add runtime code there.

## Boundary

`frontend/` is the browser-facing static runtime. Do not introduce secrets, private-agent execution or a general visitor-facing backend here.
