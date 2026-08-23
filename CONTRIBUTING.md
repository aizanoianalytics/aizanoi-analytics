# Contributing to Aizanoi Analytics

Aizanoi combines media products, software, historical research, an adaptive browser shell and source-led interactive worlds. Contributions should preserve historical transparency, cross-device parity and the static-first security model.

## Before you start

Read [README.md](README.md), [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md) and [ROADMAP.md](ROADMAP.md). Historical-world changes must also inspect the relevant city research and methodology material.

## Project principles

### Keep the visitor runtime static by default

Do not introduce a visitor-facing backend or API for browser features unless the requirement, security impact, deployment model and regression contract have been explicitly reviewed. There is no production backend required for local development.

### Preserve historical uncertainty

Identify the research basis, distinguish documented facts from inference and label procedural or atmospheric detail. Visual confidence must not silently become historical confidence.

### Maintain one cross-device product

AizanoiOS has one public catalog. Test desktop windows, tablet focus behavior, mobile fullscreen surfaces, keyboard access, reduced motion, touch targets and overflow rather than creating a second interface.

### Extend shared world systems

Reusable movement, lifecycle, input, evidence, rendering, adaptive-performance and landmark behavior belongs in `frontend/ancient-world/engine/`. City-local data and research belong under `frontend/ancient-cities/<city>/` and `research/`.

### Keep retired scope retired

The retired Workbench included Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Monitor. Do not restore those apps, their deleted files, a remote shell or stale compatibility layers. Propose a current umbrella-brand product instead.

## Local setup

```bash
git clone https://github.com/aizanoianalytics/aizanoi-analytics.git
cd aizanoi-analytics
python3 -m http.server 4173 --directory frontend
```

Open `http://127.0.0.1:4173/`.

## Tests

```bash
node scripts/news/build-news.mjs
node --test tests/*.test.mjs
git diff --check
```

Interactive behavior requires the matching Chromium test, not only source-pattern coverage. CI also runs desktop/tablet/mobile smoke tests, the real-browser service-worker lifecycle gate, Historical World traversal, rendered captures, Lighthouse budgets and security regressions.

## Historical-world contributions

Start a city from `frontend/ancient-cities/_template/` and consume contracts documented in `frontend/ancient-world/engine/README.md`. Keep source data, inferred fabric and runtime implementation distinguishable. Preserve deep links, evidence/source UI, movement and mobile controls.

## AizanoiOS contributions

Canonical owners are:

- `frontend/js/v3/registry.js` — public app/world catalog;
- `frontend/js/v3/store.js` — local shell state;
- `frontend/js/v3/shell.js` — window/router/dialog lifecycle;
- `frontend/js/v3/aizanoi-os.js` — base desktop interactions;
- `frontend/js/v3/brand-platform.js` — brand/device composition;
- `frontend/js/v3/apps/` — lazy public apps;
- `frontend/styles/shell.css` and `frontend/styles/components.css` — base presentation;
- `frontend/styles/device-shell.css` — canonical tablet/mobile presentation.

Static product routes live in `frontend/<product>/index.html` and use `frontend/styles/landing.css`. Preserve distinct title, description, canonical, Open Graph, Twitter and JSON-LD metadata. Do not create duplicate canonical URLs.

## Pull request checklist

Explain what changed, why, affected routes/apps/worlds, cross-device impact, historical evidence impact, security/runtime impact, tests run and visual review when presentation changes. Keep commits focused; concise Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `security:` and `test:` are customary.

Sensitive issues follow [SECURITY.md](SECURITY.md), not a normal public bug report. Contributions are distributed under the [MIT License](LICENSE).
