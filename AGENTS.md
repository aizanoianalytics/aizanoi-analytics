# Aizanoi — Agent Context

## Start here

Before changing code or content, read `PRODUCT.md`, this file, `CONTENT_POLICY.md`, `DESIGN.md`, `ARCHITECTURE.md`, the nearest area-specific `AGENTS.md`, the affected runtime path and current Git history.

Aizanoi is no longer scoped as only a digital-archaeology project. It is an independent digital studio for **media, data, software, research and interactive worlds**.

## Product scope

The umbrella brand is **Aizanoi**. Current public families are:
- Aizanoi News;
- Aizanoi TV;
- Aizanoi Journal;
- Aizanoi Analytics;
- Aizanoi Forge;
- Historical Worlds;
- Aizanoi Labs;
- Aizanoi Arcade;
- Aizanoi Workbench.

Aizanoi Analytics is one product family, not the umbrella brand. Historical Worlds remain a distinctive flagship experience but do not define the entire product scope.

## Public architecture

The visitor-facing runtime remains static-first behind Nginx:

```text
Browser
   |
   +-- AizanoiOS
   |     +-- media/studio/explore hubs
   |     +-- local Workbench tools
   |     +-- static News feed
   |     +-- browser-only Field Terminal
   |
   +-- Historical Worlds
   |     +-- Aizanoi
   |     +-- Rome
   |     +-- Athens
   |
Nginx -> static HTML/CSS/JS/JSON/assets
```

Do not introduce a visitor-facing Node/Express app, remote shell, secret-bearing browser code or general public backend merely because Aizanoi now covers more subjects. Build-time/private automation may exist outside the visitor runtime.

## AizanoiOS canonical owners

- `frontend/js/v3/registry.js` — app/world catalog;
- `frontend/js/v3/store.js` — workspace and field-session state;
- `frontend/js/v3/shell.js` — canonical window/router/dialog lifecycle;
- `frontend/js/v3/aizanoi-os.js` — base desktop interaction adapter;
- `frontend/js/v3/brand-platform.js` — umbrella-brand desktop/dock/launcher adaptation;
- `frontend/js/v3/apps/` — lazy app modules;
- `frontend/styles/*` — canonical `--az-*` presentation layers.

Do not add compatibility wrappers such as `final.css`, `polish.css`, `unified.css`, `responsive-fix.css` or a second window manager.

## Public navigation decision

The permanent desktop surface stays intentionally sparse. Core pinned apps are:
1. Aizanoi News
2. Aizanoi TV
3. Aizanoi Analytics
4. Historical Worlds
5. Aizanoi Forge

Journal, Labs, Arcade and Workbench remain discoverable through Applications/Search. Workbench owns the local research/power-tool surface so Archive/Notes/Data Lab/Source Reader/Artifact Viewer/Terminal/Monitor do not dominate the public shell.

## Content and News

`CONTENT_POLICY.md` is mandatory.

Aizanoi News must publish original summaries with source links. Never copy full articles, fabricate sources, or use an LLM's memory as a source. The public News feed is generated from Git-tracked records by `scripts/news/build-news.mjs`.

Primary public language is English.

## Historical Worlds

Historical evidence rules are unchanged. `frontend/ancient-world/engine/` owns shared behavior; city-local data and evidence claims stay city-local.

Never present plausible, inferred or atmospheric reconstruction as verified fact.

## Workbench privacy

Archive, Notes, Data Lab, Source Reader and Artifact Viewer remain browser-local unless the visitor explicitly exports/downloads data. Do not add silent upload or telemetry paths for private workspace content.

Field Terminal remains browser-only and must never gain arbitrary process execution, server filesystem access or network command transport.

## Hermes

Hermes is a separate private operator/automation agent. It must use `docs/HERMES_OPERATIONS.md`. Never connect the public terminal or browser runtime directly to private Hermes/server execution.

## Deployment

GitHub is the source of truth. A merge is not a production deployment. Production rollout must use a verified exact Git SHA, a known rollback point and post-deploy smoke checks.

## Change rules

1. Never commit secrets, credentials, TLS material, backups or personal data.
2. Git first; production is never the source of truth.
3. Preserve the static-first visitor boundary by default.
4. Modify canonical owners rather than adding compatibility layers.
5. Preserve desktop/tablet/mobile product equivalence.
6. Preserve Historical World evidence levels.
7. Obey `CONTENT_POLICY.md` for sourced/publication work.
8. Do not add accounts, comments/forums, social feeds, multiplayer or public AI chat without explicit owner direction.
9. Use meaningful commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `content:`, `security:`, `chore:`).
10. Security-sensitive and navigation changes require regression coverage.
11. Never weaken a failing safety/quality test merely to make CI green.
12. Never claim production or manual verification that was not actually performed.

## Validation

At minimum run applicable syntax/tests including:

```bash
node --check frontend/js/v3/main.js
node --check frontend/js/v3/registry.js
node --check frontend/js/v3/brand-platform.js
node --check frontend/js/v3/apps/brand-hubs.js
node --check frontend/service-worker.js
node scripts/news/build-news.mjs
node --test tests/*.test.mjs
git diff --check
```

GitHub Actions remains the full release gate.
