# Contributing to Aizanoi Analytics

Thank you for contributing to Aizanoi Analytics.

This repository combines interactive history, historical research, a browser-native workspace and a static production architecture. Contributions are most useful when they improve one of those areas **without weakening historical transparency, cross-device parity or the static-first security model**.

## Before you start

Please read:

- [README.md](README.md) — product overview;
- [ARCHITECTURE.md](ARCHITECTURE.md) — ownership boundaries and change rules;
- [SECURITY.md](SECURITY.md) — security-sensitive areas and reporting policy;
- [ROADMAP.md](ROADMAP.md) — current product direction.

For historical-world work, also inspect the research and methodology material for the city you are changing.

## Project principles

### 1. Keep the public runtime static by default

A browser feature should not introduce a visitor-facing backend merely for convenience.

Do not add a server/API dependency unless:

- the product requirement cannot reasonably be met in the browser;
- the security and operational impact is explicitly reviewed;
- the deployment model is updated intentionally;
- regression coverage proves the old static-only guarantees have changed by design rather than accidentally.

### 2. Do not inflate historical certainty

A visually convincing reconstruction is not automatically a historically certain reconstruction.

When adding or changing historical content:

- identify the source or research basis;
- distinguish documented facts from inference;
- keep procedural / atmospheric detail labelled appropriately;
- avoid presenting a convenient visual assumption as established fact.

### 3. Maintain one product across desktop, tablet and mobile

Do not fix one viewport by creating a second unrelated interface.

For Field System changes, consider:

- desktop window behavior;
- tablet touch targets and clamping;
- mobile fullscreen-equivalent app surfaces;
- keyboard access;
- reduced-motion behavior;
- overflow and horizontal escape.

### 4. Extend shared historical-world systems before cloning them

Reusable movement, lifecycle, input, evidence, rendering, adaptive-performance and landmark behavior belongs in `frontend/ancient-world/engine/`.

Do not create a new movement engine for every city if the missing behavior belongs in a shared contract.

### 5. Keep local tools local

Archive, Notes, Data Lab and Terminal are intentionally browser-native.

Do not add silent external uploads, analytics of local workspace content, remote terminal execution or background synchronization of user data.

## Local setup

Clone the repository and serve the static frontend:

```bash
git clone https://github.com/aizanoianalytics/aizanoi-analytics.git
cd aizanoi-analytics
python3 -m http.server 4173 --directory frontend
```

Open:

```text
http://127.0.0.1:4173/
```

No production backend is required.

## Core regression tests

Run the Node test suite:

```bash
node --test tests/*.test.mjs
```

Check whitespace errors before opening a PR:

```bash
git diff --check
```

GitHub Actions additionally run:

- syntax checks;
- Chromium desktop/tablet/mobile smoke tests;
- Terminal browser-only assertions;
- historical-world movement / deep-link coverage;
- visual capture;
- Lighthouse budgets;
- security regression checks.

Interactive changes should not rely solely on static tests when browser behavior is the thing being changed.

## Historical-world contributions

For Rome and Athens, keep source data and implementation concerns separate where the current structure already does so:

```text
frontend/ancient-cities/<city>/
├── data/          # historically scoped facts, terrain, fabric, manifests
├── js/            # city implementation and methodology UI
└── research/      # city-facing research material where present
```

Broader research material also lives under `research/`.

When proposing a new city, start with:

- [`frontend/ancient-cities/_template/`](frontend/ancient-cities/_template/)
- [`frontend/ancient-world/engine/README.md`](frontend/ancient-world/engine/README.md)

A new city should consume shared engine contracts rather than copy an existing city and diverge silently.

## Field System contributions

The modern product shell is layered deliberately. Avoid solving visual issues by adding another independent window manager or another device-specific application catalog.

Important areas include:

- `frontend/js/os-state.js` — application/world state and registry;
- `frontend/js/os-shell.js` — shell and window behavior;
- `frontend/js/os-unified.js` — synchronized desktop/tablet/mobile shell;
- `frontend/js/os-product-polish.js` — final product presentation bridge;
- `frontend/js/os-workbench*.js` — local research applications;
- `frontend/js/terminal.js` — browser-only virtual Terminal;
- `frontend/css/os-unified.css` and product-polish styles — cross-device presentation.

Preserve the current fail-closed AI behavior unless product scope explicitly changes.

## Pull request checklist

A good pull request should explain:

- **what** changed;
- **why** it is needed;
- which routes/apps/worlds are affected;
- desktop/tablet/mobile impact;
- historical evidence impact, if any;
- security/runtime impact;
- tests run;
- screenshots or visual review when presentation changes.

Keep pull requests focused enough that a regression can be traced to a clear change.

## Commit style

The repository commonly uses concise Conventional-Commit-style prefixes:

```text
feat: ...
fix: ...
docs: ...
security: ...
test: ...
chore: ...
```

This is a convention, not a reason to split one coherent change into artificial commits.

## Security issues

Do not use a normal public bug report for sensitive exploit details. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution may be distributed under the repository's [MIT License](LICENSE).
