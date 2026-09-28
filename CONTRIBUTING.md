# Contributing to Aizanoi Analytics

Aizanoi Analytics combines media products, software, historical research, an adaptive browser shell and source-led interactive worlds. Contributions should preserve historical transparency, cross-device parity, the static-first security model and the company/product hierarchy defined in `PRODUCT.md`.

## Before you start

Read [README.md](README.md), [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

## Project principles

### Keep the visitor runtime static by default

Do not introduce a visitor-facing backend or API for browser features unless the requirement, security impact, deployment model and regression contract have been explicitly reviewed. There is no production backend required for local development.

### Preserve historical uncertainty

Identify the research basis, distinguish documented facts from inference and label procedural or atmospheric detail. Visual confidence must not silently become historical confidence.

### Maintain one cross-device product

AizanoiOS has one public catalog. Test desktop windows, tablet focus behavior, mobile fullscreen surfaces, keyboard access, reduced motion, touch targets and overflow rather than creating a second interface.

### Extend shared world systems

Reusable movement, collision, input, evidence UI, environment and procedural asset behavior belongs in `frontend/worlds/shared/`. World-local data stays with the world package.

### Keep retired scope retired

The retired Workbench included Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Monitor. Do not restore those apps, their deleted files, a remote shell or stale compatibility layers. Propose a current **Aizanoi Analytics** product instead.

### Preserve product naming contracts

**Aizanoi Analytics** is the company and umbrella brand. **Analytics** is the visible analytical product; `/analytics/` is its stable route and `analytics` is its internal app id. Dashboards are a format within Analytics. Do not invert that hierarchy or rename stable identifiers casually.

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

Interactive behavior requires the matching Chromium test, not only source-pattern coverage.

### Test ownership

Tests are split by cost, so routine CI stays fast without leaving anything unowned:

| Owner | Runs | Covers |
|---|---|---|
| **Aizanoi CI** (required on every PR/main push) | `validate`, `browser-smoke`, `lighthouse` | JavaScript syntax, ESLint, module-registry integrity, News build, Node regression + audit contract tests, Python Markets/Worlds contracts, whitespace, the desktop/tablet/mobile critical shell smoke, the production-Nginx policy gate, representative accessibility, Lighthouse budgets, and the real-browser service-worker lifecycle gate |
| **Aizanoi Full QA** (weekly schedule + manual dispatch) | `browser-products`, `worlds-and-fly`, `visual-captures` | The expensive per-app browser suites, Markets/Recruitment Analytics/PACS real-browser QA, Historical World traversal, Fly World runtime validation, Dungeon/Flowerseller/Labs interaction, and the visual capture suites |
| **Cross-browser critical smoke** (weekly + manual) | Firefox/WebKit | The critical cross-engine smoke |
| **Local / operator-only** | manual | Anything needing Blender, a GPU, the private Fly Simulation service or production credentials — for example the Fly House `build_scene*.py` / `environment_export.py` pipeline, which requires Blender and cannot run in CI |

Full QA is deliberately **not** a required status check, so a routine change is not gated on the entire product universe. Run it manually (`workflow_dispatch`) before a release or after a change that touches a product's interaction layer. Its visual artifacts are evidence that a page rendered, not proof of pixel-perfect correctness — the repository has no deterministic image baselines.

## Historical-world contributions

Start from the contracts in `frontend/worlds/README.md` and the nearest `frontend/worlds/AGENTS.md`. Keep source data, inferred fabric and runtime implementation distinguishable; never copy the shared engine into a world-local folder.

## AizanoiOS contributions

Canonical owners are:

- `frontend/js/v3/registry.js` — public app/world catalog;
- `frontend/js/v3/store.js` — local shell state;
- `frontend/js/v3/shell.js` — window/router/dialog lifecycle;
- `frontend/js/v3/aizanoi-os.js` — base desktop interactions;
- `frontend/js/v3/brand-platform.js` — Aizanoi Analytics brand/device composition;
- `frontend/js/v3/apps/` — lazy public apps;
- `frontend/styles/shell.css` and `frontend/styles/components.css` — base presentation;
- `frontend/styles/device-shell.css` — canonical tablet/mobile presentation.

Static product routes live in `frontend/<product>/index.html` and use `frontend/styles/landing.css`. Preserve distinct title, description, canonical, Open Graph, Twitter and JSON-LD metadata. Do not create duplicate canonical URLs.

## Pull request checklist

Explain what changed, why, affected routes/apps/worlds, cross-device impact, historical evidence impact, security/runtime impact, tests run and visual review when presentation changes. Keep commits focused; concise Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `security:` and `test:` are customary.

Sensitive issues follow [SECURITY.md](SECURITY.md), not a normal public bug report. Contributions are distributed under the [MIT License](LICENSE).
