# Aizanoi Repository Index

This file is the shortest path into the repository. It is a **router, not a full architecture document**.

## Agent / contributor rule

1. Start here instead of recursively scanning the repository.
2. Open the `index.md` for the area you need.
3. Read only the canonical files and dependencies named there.
4. Expand scope only when the local index or an explicit dependency requires it.
5. For code changes, also obey `AGENTS.md`, the nearest area-specific `AGENTS.md`, and `MODULE_CONTRACT.md` where applicable.

## I need to work on...

- Public website, AizanoiOS, apps, device UI, Historical Worlds or browser games → [`frontend/index.md`](frontend/index.md)
- News source records and publishable content → [`content/index.md`](content/index.md)
- Analytics source/data work outside the production frontend → [`analytics/index.md`](analytics/index.md)
- Build/publishing/maintenance scripts → [`scripts/index.md`](scripts/index.md)
- Automated regression, browser, security or visual validation → [`tests/index.md`](tests/index.md)
- Historical/source research → [`research/index.md`](research/index.md)
- Deployment and sanitized infrastructure references → [`infra/index.md`](infra/index.md)
- Maintained documentation and operator runbooks → [`docs/index.md`](docs/index.md)

## Canonical repository contracts

Read these only when relevant to the change:

- Brand/product boundaries → [`PRODUCT.md`](PRODUCT.md)
- Agent rules → [`AGENTS.md`](AGENTS.md)
- Runtime architecture → [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Modular plug-in boundaries → [`MODULE_CONTRACT.md`](MODULE_CONTRACT.md)
- UI/interaction rules → [`DESIGN.md`](DESIGN.md)
- Publishing/source rules → [`CONTENT_POLICY.md`](CONTENT_POLICY.md)
- Security boundary → [`SECURITY.md`](SECURITY.md)
- Product direction → [`ROADMAP.md`](ROADMAP.md)

## Navigation principle

`index.md` files must remain short and high-signal. They should answer **where to go next**, not duplicate implementation documentation. When a new top-level area or independently replaceable module is introduced, add or update the nearest index in the same change.