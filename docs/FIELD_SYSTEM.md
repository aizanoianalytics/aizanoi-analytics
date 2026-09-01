# AizanoiOS product shell

AizanoiOS is the adaptive browser-native shell for the **Aizanoi Analytics** digital studio. It presents one catalog across desktop, tablet and mobile without pretending to be a host operating system.

The previous research Workbench bundle is retired. Archive, Notes, Data Lab, Source Reader, Artifact Viewer, Projects, Terminal and Monitor are not supported public apps and must not be restored through compatibility files or stale documentation.

## Public catalog

The eight public product families are:

1. Aizanoi News
2. Aizanoi TV
3. Analytics
4. Historical Worlds
5. Aizanoi Forge
6. Aizanoi Journal
7. Aizanoi Labs
8. Aizanoi Arcade

The canonical AizanoiOS application registry also contains browser-local workspace utilities such as Workspace, Notepad, Calculator, Browser, Camera, Winamp and Recycle Bin. Product-family count and total launcher-app count are deliberately different contracts.

`Analytics` is the visible analytical product; `/analytics/` and the internal app id `analytics` are stable contracts, and dashboards are a format within the product.

Three Historical Worlds—Aizanoi, Rome and Athens—remain direct standalone experiences as well as catalog entries.

## Canonical owners

- `frontend/js/v3/registry.js` — single public app/world catalog;
- `frontend/js/v3/store.js` — browser-local shell and open-window state;
- `frontend/js/v3/shell.js` — window, router and dialog lifecycle;
- `frontend/js/v3/aizanoi-os.js` — desktop interaction adapter;
- `frontend/js/v3/brand-platform.js` — Aizanoi Analytics brand and device composition;
- `frontend/js/v3/apps/` — lazy app implementations;
- `frontend/styles/shell.css` and `components.css` — shell/window/control behavior;
- `frontend/styles/device-shell.css` — canonical tablet/mobile adaptation;
- `frontend/styles/apps.css` — app presentation loaded on demand.

Do not add `final`, `polish`, `unified`, `responsive-fix` or other compatibility layers. Change the canonical owner.

## Responsive contract

- desktop uses a sparse home, freeform windows and task shelf;
- tablet uses a touch-first home and focused large windows;
- mobile uses a phone-like home and fullscreen app surfaces;
- required coarse-pointer actions keep a 44 px target floor;
- all device classes expose the same product families and workspace utilities from the canonical registry.

## Routes and discovery

Interactive app intent is represented by `?app=<id>`. In addition, static product landings at `/tv/`, `/analytics/`, `/worlds/`, `/forge/`, `/journal/`, `/labs/` and `/arcade/` provide indexable, no-JavaScript product context and link into AizanoiOS. News owns `/news/`.

Legacy `/videos`, `/games` and `/projects` URLs redirect to `/tv/`, `/arcade/` and `/forge/`. They are not canonical discovery surfaces.

## Historical World bridge

Historical Worlds may write the small `aizanoi-field-session-v1` browser record containing world, optional landmark, route and timestamp. It is navigation context, not a general local workspace or synchronization layer.

## PWA contract

The manifest and service worker improve installability and resilient static delivery only. The service worker:

- never intercepts `/api/*`;
- precaches the minimum adaptive shell as a complete-or-fail install;
- removes superseded Aizanoi shell caches on activation;
- caches successful same-origin navigations for offline revisit;
- bounds runtime cache growth;
- does not synchronize user data.

## Quality contract

A shell change should preserve the eight public product families plus the workspace utilities represented by the canonical app registry, three worlds, lazy app code/styles, canonical `--az-*` tokens, dialog focus/inert/restore behavior, mobile target/overflow checks, Historical World traversal regressions, real-browser service-worker coverage and rendered review.

Aizanoi Analytics remains the company/umbrella brand unless the owner explicitly changes `PRODUCT.md`; agents must not restore the old hierarchy in which Aizanoi Analytics is presented as a subordinate app or product family.

See [`../DESIGN.md`](../DESIGN.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`ACCESSIBILITY.md`](ACCESSIBILITY.md).
