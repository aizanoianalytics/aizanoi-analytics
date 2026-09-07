# Frontend Index

Scope: production static application served to visitors.

Before changing frontend behavior, read root `AGENTS.md`, `ARCHITECTURE.md`, `DESIGN.md` and the nearest local instructions.

## Route by task

- AizanoiOS shell, registry, device composition or public app runtime → [`js/v3/index.md`](js/v3/index.md)
- Site-wide visual styles → `styles/` (read `DESIGN.md` first)
- Analytics → `analytics/`; News → `news/`; TV → `tv/`; Journal → `journal/`; Forge → `forge/`; Labs → `labs/`; Arcade → `arcade/`
- Historical Worlds portal, Aizanoi, Rome, Athens, Istanbul Airport and shared WebGL runtime → [`worlds/`](worlds/)
- `historic-world/`, `ancient-cities/` and `iga/` → legacy redirect shells only; do not add runtime code there
- Web Editor isolated preview runner → `web-editor-preview/`
- Static media/branding assets → `assets/`
- Service worker / offline behavior → `service-worker.js`
- Public entry document → `index.html`

## Worlds ownership

`worlds/shared/` is the single runtime owner. Each world under `worlds/<world-id>/` owns only its scene data, evidence records and dedicated procedural builders. The AizanoiOS launcher remains under `js/v3/apps/worlds/`.

## Historical Worlds naming map

Historical Worlds now has one canonical static runtime family:

- `worlds/` — public portal and canonical world routes;
- `worlds/shared/` — shared Three.js r174 engine, assets, styles and local vendor files;
- `worlds/aizanoi-225/` — Aizanoi · AD 225;
- `worlds/rome-410-476/` — Rome · AD 410–476;
- `worlds/athens-450-430/` — Athens · 450–430 BCE;
- `worlds/iga-airport/` — Istanbul Airport / İGA present-day spatial study.

`historic-world/`, `ancient-cities/` and `iga/` are compatibility redirects only. The retired `ancient-world/` shared runtime is not a production owner. Research and source methodology remain under `../research/`, separate from browser runtime code.

## Boundary

`frontend/` is the browser-facing static runtime. Do not introduce secrets, private-agent execution or a general visitor-facing backend here.
