# Aizanoi Analytics — Agent Context

## Start here

Before changing code or content, read `PRODUCT.md`, this file, `CONTENT_POLICY.md`, `DESIGN.md`, `ARCHITECTURE.md`, the nearest area-specific `AGENTS.md`, the affected runtime path and current Git history.

**Aizanoi Analytics** is the company and umbrella brand for media, data, software, research and interactive worlds in this repository. `Aizanoi` is permitted as short-form identity inside product names, but must not be redefined as a separate umbrella company above Aizanoi Analytics.

## Product scope

Current public families are:
- Aizanoi News;
- Aizanoi TV;
- Aizanoi Journal;
- Analytics;
- Aizanoi Forge;
- Historical Worlds;
- Aizanoi Labs;
- Aizanoi Arcade.

**Analytics** is the user-facing data-product area. Its stable route is `/analytics/` and its internal AizanoiOS app id is `analytics`; dashboards are one format within this product family.

The former Workbench/power-tool product is retired from the visitor-facing catalog. Do not add Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal or Workspace Monitor back to navigation, search, deep-link routing or public product documentation without an explicit owner decision.

## Public architecture

The visitor-facing runtime remains static-first behind Nginx:

```text
Browser
   |
   +-- AizanoiOS
   |     +-- Aizanoi Analytics public products
   |     +-- static News feed
   |     +-- adaptive desktop/tablet/mobile shell
   |
   +-- Historical Worlds
   |     +-- Aizanoi
   |     +-- Rome
   |     +-- Athens
   |
Nginx -> static HTML/CSS/JS/JSON/assets
```

Do not introduce a visitor-facing Node/Express app, remote shell, secret-bearing browser code or general public backend merely because Aizanoi Analytics covers multiple subjects. Build-time/private automation may exist outside the visitor runtime.

## AizanoiOS canonical owners

- `frontend/js/v3/registry.js` — public app/world catalog;
- `frontend/js/v3/store.js` — browser-local shell state and field-session state;
- `frontend/js/v3/shell.js` — canonical window/router/dialog lifecycle;
- `frontend/js/v3/aizanoi-os.js` — base desktop interaction adapter;
- `frontend/js/v3/brand-platform.js` — Aizanoi Analytics home/dock/device composition;
- `frontend/styles/shell.css` — base shell/window/dock behavior;
- `frontend/styles/components.css` — controls/dialogs/launcher;
- `frontend/styles/device-shell.css` — canonical tablet/mobile home and compact launcher adaptation;
- `frontend/js/v3/apps/` — lazy public app modules.

Do not add compatibility wrappers such as `final.css`, `polish.css`, `unified.css`, `responsive-fix.css` or a second window manager. `device-shell.css` is a deliberate canonical device presentation layer, not a patch layer.

## Device navigation decision

### Desktop
Permanent shortcuts/dock priorities:
1. Aizanoi News
2. Aizanoi TV
3. Analytics
4. Historical Worlds
5. Aizanoi Forge

Journal, Labs and Arcade remain discoverable through Applications/Search.

### Tablet
Tablet is not a scaled desktop. Use a touch-first two-pane home with larger app targets, feature/supporting panes and focused large windows.

### Mobile
Mobile is not a miniature desktop. Use a phone-like home screen with:
- all public apps available as a clear icon grid;
- a small number of glanceable Aizanoi Analytics widgets;
- a compact bottom dock for core navigation;
- fullscreen-equivalent app surfaces.

Do not fabricate battery, Wi-Fi, weather, server health or other system telemetry merely to imitate a phone OS.

## Content and News

`CONTENT_POLICY.md` is mandatory.

Aizanoi News must publish original summaries with source links. Never copy full articles, fabricate sources, or use an LLM's memory as a source. The public News feed is generated from Git-tracked records by `scripts/news/build-news.mjs`.

Primary public language is English.

## Historical Worlds

Historical evidence rules are unchanged. `frontend/ancient-world/engine/` owns shared behavior; city-local data and evidence claims stay city-local.

Never present plausible, inferred or atmospheric reconstruction as verified fact.

## Hermes

Hermes is a separate private operator/automation agent. It must use `docs/HERMES_OPERATIONS.md`. Never connect the public browser runtime directly to private Hermes/server execution.

## Deployment

GitHub is the source of truth. A merge is not a production deployment. Production rollout must use a verified exact Git SHA, a known rollback point and post-deploy smoke checks.

## Change rules

1. Never commit secrets, credentials, TLS material, backups or personal data.
2. Git first; production is never the source of truth.
3. Preserve the static-first visitor boundary by default.
4. Modify canonical owners rather than adding compatibility layers.
5. Preserve one public app catalog while adapting presentation to each device class.
6. Preserve Historical World evidence levels.
7. Obey `CONTENT_POLICY.md` for sourced/publication work.
8. Do not add accounts, comments/forums, social feeds, multiplayer or public AI chat without explicit owner direction.
9. Use meaningful commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `content:`, `security:`, `chore:`).
10. Security-sensitive and navigation changes require regression coverage.
11. Never weaken a failing safety/quality test merely to make CI green.
12. Never claim production or manual verification that was not actually performed.
13. Never describe Aizanoi as the umbrella company or Aizanoi Analytics as a subordinate product unless the owner explicitly changes `PRODUCT.md`.
14. Keep `/analytics/`, app id `analytics` and public label **Analytics** aligned; treat dashboards as a format within that product family.

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

GitHub Actions remains the full release gate. Browser smoke must cover desktop, tablet and mobile as distinct product presentations.
