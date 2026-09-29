# Aizanoi Module (flagship interactive world)

> **Purpose:** Aizanoi is the primary interactive world of the Aizanoi Analytics brand — an evidence-aware, walkable reconstruction of Roman Phrygia c. AD 225. It is not one entry in a multi-world catalog: it is the flagship interactive experience of Aizanoi Analytics.

---

## 1. Stable identity

- **Product title:** Aizanoi
- **Stable module id:** `aizanoi`
- **Canonical runtime entry:** `src/index.js`
- **Manifest path:** `manifest.json` (`manifestVersion: 1`, `type: "desktop-app"`)
- **Public world route:** `/worlds/aizanoi-225/`
- **Public product landing:** `/worlds/`
- **Desktop & favicon icon:** `assets/icons/aizanoi-worlds.svg`

---

## 2. Declared capabilities

- **Requires (`requires`):** `[]` — zero host capability dependencies. Launching the world is a navigation, not a host service call.
- **Provides (`provides`):** `["desktop-app"]`.
- **Execution model:** 100% client-side static execution. WebGL, local DOM and static assets only; no backend service and no database.

---

## 3. Owned implementation & assets

```
frontend/js/v3/apps/aizanoi/
├── index.md        # this file (ownership and architecture)
├── manifest.json   # AizanoiOS v3 module registration manifest
└── src/
    └── index.js    # AizanoiOS window lifecycle: mount({ container }) & teardown

frontend/worlds/
├── index.html      # public Aizanoi product landing
├── index.md        # concise router for the interactive world
└── aizanoi-225/    # the world runtime itself
    ├── index.html  # world entry document
    ├── js/         # engine, builders, data, evidence layers
    ├── assets/     # GLB monuments, textures and audio
    └── css/
```

The world runtime under `frontend/worlds/aizanoi-225/` is the canonical owner of the Aizanoi reconstruction. This module is the AizanoiOS desktop-surface for it.

---

## 4. Architecture and runtime principles

### A. Navigation-based launch

The Aizanoi world is a full standalone WebGL experience, not an in-window widget. `mount()` therefore performs a route navigation to `/worlds/aizanoi-225/` and `teardown()` releases the container. This keeps the world's own bootstrap, loading screen and deterministic entry framing fully in charge of its runtime.

### B. Evidence-aware reconstruction

Every landmark carries its evidence classification — documented, archaeological or inferred. The evidence layer is a first-class part of the runtime contract, not presentation metadata: the world must never present an inferred element as documented.

### C. Deterministic entry

The entry framing, spawn azimuth and first view are deterministic so the arrival view is reproducible and testable. The browser suites assert arrival framing and clear-view azimuth against that contract.

---

## 5. Lifecycle and cleanup contract

- `mount({ container })` navigates to the canonical world route.
- `teardown()` releases any host container state the module created.
- The module owns no timers, listeners or WebGL contexts of its own; the world runtime owns those.

---

## 6. Verification and tests

```bash
node --test tests/aizanoi-os-module-shape.test.mjs
node --test tests/field-system-v3.test.mjs
```

Browser-level arrival framing, entry failsafe and asset validation run as operator diagnostics described in `tests/index.md`.
