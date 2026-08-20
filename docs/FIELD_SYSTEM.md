# Aizanoi Field System v3

Field System is the browser-native workspace around the Aizanoi Historical Worlds. It is not a Windows/macOS clone and it no longer has a compatibility stack underneath the canonical shell.

## Product hierarchy

Home is ordered as:

1. Continue / recommended field mission
2. Historical Worlds
3. Research Workspace
4. Tools & Experiments

The 11-app registry remains consistent across desktop, tablet and mobile.

## Canonical runtime

```text
frontend/js/v3/
├── registry.js       single app/world catalog
├── store.js          workspace + field-session state
├── shell.js          window/router/dialog/command lifecycle
├── archive-store.js  IndexedDB local records
└── apps/             lazy application modules
```

Canonical presentation:

```text
frontend/styles/
├── tokens.css
├── base.css
├── shell.css
├── components.css
└── apps.css           loaded only when an app opens
```

Do not create a new `final`, `polish`, `unified`, `responsive-fix` or similar compatibility layer. Modify the owner module/style directly.

## Responsive contract

- `<600px`: fullscreen-equivalent app surfaces + bottom Home/Search/Open navigation.
- `600–839px`: single focus workspace.
- `840–1199px`: large touch-friendly focus workspace.
- `>=1200px`: freeform desktop windows.

Mobile is not a scaled desktop. Required coarse-pointer actions use a 44 px target floor.

## Window and route semantics

The URL represents the active app intent via `?app=<id>`. The browser-local Workspace Store tracks the full open-app set and window rectangles.

Therefore Back/Forward can focus a previous app while another app remains open. Closing the active routable app updates the URL to another active app or Home so visible UI and navigation history cannot disagree.

## Research workflow

`archive-store.js` is shared by Archive, Notes, Data, Source Reader and Artifact Viewer.

Default local collections:

- Notes
- Sources
- Screenshots
- Datasets
- Exports
- Uploads

The first launch includes a sample Aizanoi record and local-storage guide rather than presenting an empty canvas.

## Historical World bridge

Historical Worlds write only a small `aizanoi-field-session-v1` context record: world, optional landmark, route and timestamp. Explore includes **Field System**, and Home can later offer **Continue Field Session**.

Private Archive/Notes payloads are not put into URLs.

## Terminal

Field Terminal is deliberately domain-specific:

```text
AIZANOI FIELD TERMINAL / LOCAL VIRTUAL SHELL
aizanoi@field:~$
```

Useful commands include `worlds`, `open`, `find`, `session` and `evidence`. It has no arbitrary command execution, host/server filesystem, remote shell or terminal API.

## Monitor

Workspace Monitor uses only browser-observable facts: local storage estimate, open apps, service-worker state, network availability, viewport/input mode, install state and field-session state. Fake CPU/RAM/server metrics are forbidden.

## PWA

The manifest and service worker improve installability/static delivery only. The service worker never intercepts `/api/*` and is not a synchronization layer.

## Quality contract

A Field System change should preserve:

- 11 canonical apps and three worlds;
- source-level retired-product string count of zero;
- canonical `--az-*` tokens;
- v3 `!important` count below the maintained gate;
- functional text at least 11 px;
- lazy app code/styles;
- dialog focus/inert/restore behavior;
- mobile target/overflow checks;
- Historical World 51-landmark regression;
- Lighthouse and rendered visual review.

See [`../DESIGN.md`](../DESIGN.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`ACCESSIBILITY.md`](ACCESSIBILITY.md).