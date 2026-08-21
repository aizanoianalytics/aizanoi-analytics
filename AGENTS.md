# Aizanoi Analytics — Project Context

## Start here

Before changing code, read this file, `DESIGN.md`, `ARCHITECTURE.md`, the nearest area-specific `AGENTS.md`, the affected runtime path and current Git history. Stability, historical truth and one coherent product are more important than fashionable rewrites.

## Product scope

Aizanoi Analytics is a single-publisher digital-archaeology project centered on Aizanoi, comparative Historical Worlds and browser-local research tools. The visitor-facing shell is **AizanoiOS**, a browser-native archaeology desktop.

Visitors may browse, use local workspace tools, play local experiments and explore Historical Worlds. Unless the owner explicitly changes scope, do not add accounts, multiplayer, comments/forums/social feeds, shared leaderboards, public collaborative editing, a visitor-facing backend for browser-native features, public AI chat or a remote shell.

## Public architecture

The visitor-facing runtime is static-only behind Nginx:

```text
Browser
   |
   +-- AizanoiOS
   |     +-- local IndexedDB archive
   |     +-- lazy research/tool apps
   |     +-- browser-only Field Terminal
   |
   +-- Historical Worlds
   |     +-- Aizanoi
   |     +-- Rome
   |     +-- Athens
   |
Nginx -> static HTML/CSS/JS/assets only
```

No visitor-facing Node/Express app, terminal execution service or public `/api/*` functionality should be introduced. Production secrets and server/TLS configuration stay outside this public repository. Hermes Agent is separate and private.

## AizanoiOS canonical owners

- `frontend/js/v3/registry.js` — only app/world catalog;
- `frontend/js/v3/store.js` — workspace and field-session state;
- `frontend/js/v3/shell.js` — canonical window lifecycle, routes, commands, dialogs and root event delegation;
- `frontend/js/v3/aizanoi-os.js` — AizanoiOS desktop presentation adapter: wallpaper desktop, top menu, dock magnification and Applications launcher;
- `frontend/js/v3/archive-store.js` — shared IndexedDB records;
- `frontend/js/v3/apps/` — lazy app modules;
- `frontend/styles/tokens.css` — canonical `--az-*` tokens;
- `frontend/styles/base.css` — reset, wallpaper and base document styling;
- `frontend/styles/shell.css` — OS shell/windows/dock/responsive behavior;
- `frontend/styles/components.css` — controls/dialogs/search/launcher;
- `frontend/styles/apps.css` — app presentation, loaded lazily.

Do not add `final.css`, `polish.css`, `unified.css`, `responsive-fix.css` or another wrapper around `openApp`. Fix the owning module/style.

### Current product decision: desktop, not dashboard

The former dark “Field System” Home dashboard and its Mission → Worlds → Research → Tools card hierarchy are retired. Do not restore them.

AizanoiOS Home is a wallpaper-first desktop with sparse shortcuts, a small optional session widget, top system bar and centered dock. Applications live in windows; the Applications launcher and Search expose the full catalog. See `DESIGN.md` for the current visual contract.

Reference products may inspire interaction patterns, but do not copy their branding, proprietary assets or layout verbatim.

### Window and route semantics

`?app=<id>` represents active app intent. The Workspace Store owns the full open-app/window snapshot. Back/Forward may change focus without destroying unrelated open apps. Closing the active app must leave URL and visible state aligned.

Dialogs must preserve opener, initial focus, Tab containment, background `inert`, Escape close and focus restore.

Desktop/tablet/mobile use one catalog with adaptive presentation, not separate registries. Required coarse-pointer controls target at least 44×44 px; functional text stays at least 11–12 px.

### Local research workspace

Field Archive, Notes, Data Lab, Source Reader and Artifact Viewer share `archive-store.js`. Imported files/notes/datasets stay browser-local unless the visitor explicitly exports/downloads them. Do not add silent telemetry or upload paths for workspace content.

### Field Terminal

`frontend/js/v3/apps/terminal.js` is browser-only. It may expose useful local domain commands but must never gain arbitrary process execution, server filesystem access, fetch/XHR/WebSocket command transport, fake server/process/network output or a terminal backend.

### Workspace Monitor

Only show browser-measurable facts such as storage estimate, open apps, service-worker state, connectivity, viewport/input mode, install state and local field-session state. Never fabricate CPU/RAM/server-health metrics.

## Historical Worlds

`frontend/ancient-world/engine/` and `frontend/ancient-world/assets/` own reusable Historical World behavior. Read scoped `AGENTS.md` files before changing traversal, navigation, lifecycle, evidence, performance or city-local rendering.

- Aizanoi: `frontend/historic-world/`
- Rome: `frontend/ancient-cities/rome-410-476/`
- Athens: `frontend/ancient-cities/athens-450-430/`

The browser-local Field Session bridge remains lightweight. Existing `from=field-system`/source compatibility values may remain internal contracts even though the public shell is branded AizanoiOS; do not break deep links merely for naming cleanup.

Never present plausible, inferred or atmospheric infill as archaeologically verified fact. Generic shared geometry never upgrades evidence certainty.

## Infrastructure / deployment

`infra/` contains sanitized static Nginx references only. Production Nginx/TLS configuration is outside this repository.

A merge does not deploy the Hetzner server. Production deployment requires a verified exact Git SHA, rollback snapshot, source↔production checksum parity and post-deploy smoke checks.

## Change rules

1. Never commit `.env`, API keys, tokens, passwords, private keys, certificates, backups, dumps or personal data.
2. Git first; production is never the source of truth.
3. Keep visitor runtime static by default.
4. Modify canonical owners; do not recreate compatibility layers.
5. Route/launcher changes need deep-link, in-app, Back/Forward and close/desktop verification.
6. Preserve desktop/tablet/mobile product equivalence.
7. Preserve evidence levels and city-local historical claims.
8. Do not broaden into accounts/multiplayer/community/shared leaderboards without explicit owner decision.
9. Use meaningful commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `security:`, `chore:`).
10. Security-sensitive changes need regression coverage; never weaken a fail-closed test merely to make CI green.
11. Do not claim production/provider/manual assistive-technology verification that was not actually performed.

## Validation

Useful local baseline:

```bash
node --check frontend/js/v3/main.js
node --check frontend/js/v3/registry.js
node --check frontend/js/v3/store.js
node --check frontend/js/v3/shell.js
node --check frontend/js/v3/archive-store.js
node --check frontend/js/v3/apps/research.js
node --check frontend/js/v3/apps/terminal.js
node --check frontend/service-worker.js
node --test tests/*.test.mjs
git diff --check
```

GitHub Actions remains the full release gate, including desktop/tablet/mobile browser smoke, accessibility, route/window/dialog lifecycle, lazy loading, Historical World regressions, visual review and Lighthouse budgets. Manual real-device touch and NVDA/VoiceOver/TalkBack checks remain human release tasks where CI cannot reproduce them faithfully.
