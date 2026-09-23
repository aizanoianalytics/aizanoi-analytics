# Aizanoi Dungeon Module (Aizo's Awakening)

> **Purpose:** A 10-chapter retro 2D top-down dungeon-crawler RPG set in the Aizanoi Zeus Temple and Penkalas catacombs. Fully integrated with the AizanoiOS v3 desktop shell, and also playable as a standalone fullscreen web route.

---

## 1. Stable identity

- **Product / game title:** Aizanoi Dungeon: Aizo's Awakening
- **Stable module id:** `dungeon`
- **Canonical runtime entry:** `src/index.js`
- **Manifest path:** `manifest.json` (`manifestVersion: 1`, `type: "desktop-app"`)
- **Standalone web entry:** `/dungeon/` (facade/compat route that imports the canonical module)
- **Desktop & favicon icon:** `assets/icons/aizanoi-dungeon.svg`

The historical `gelistirmeler/2026-09-11-dungeon-crawler-game/` archive is retired; the canonical owner is the `frontend/js/v3/apps/dungeon/` tree.

---

## 2. Declared capabilities

- **Requires (`requires`):** `[]` — zero external capability dependencies.
- **Provides (`provides`):** `["desktop-app"]`.
- **Execution model:** 100% client-side static execution. HTML5 Canvas, Phaser 3.80.1, the Web Audio API and local DOM; no backend service or external database is required.

---

## 3. Owned implementation & assets

```
frontend/js/v3/apps/dungeon/
├── index.md             # this file (architecture and ownership)
├── DOCUMENTATION.md     # full technical and mathematical system reference
├── README.md            # merge / deploy integration guide
├── manifest.json        # AizanoiOS v3 module registration manifest
│
├── src/
│   └── index.js         # AizanoiOS window lifecycle: mount({ container }) & teardown
│
├── css/
│   └── game.css         # scoped AizanoiOS glassmorphism & antique-brass theme
│
├── js/
│   ├── main.js          # Phaser 3 configuration, bootstrap and engine controller
│   ├── constants.js     # balance coefficients, Aizo base stats, palette
│   ├── standalone.js    # standalone /dungeon/ bootstrap shim
│   ├── data/            # game data (modular static data tables)
│   ├── entities/        # Phaser physics arcade entities (player, enemies, projectiles, structures, portal)
│   ├── scenes/          # 9 Phaser scenes (Boot, Menu, Game, UI, Shop, SkillTree, Inventory, GameOver, Victory)
│   ├── systems/         # combat, progression, inventory, level (BSP), touch controls, audio
│   └── utils/           # math + UI helpers
│
└── assets/
    ├── sprites/         # aizo.png, enemies.png, bosses.png, items-*.png, projectiles.png
    ├── tilesets/        # aizanoi-floor.png, aizanoi-walls.png, aizanoi-decor.png
    ├── ui/              # buttons, panels, bars, joystick, skill node icons
    └── icons/           # aizanoi-dungeon.svg (vector mascot)
```

---

## 4. Architecture and runtime principles

### A. Dual execution mode

1. **AizanoiOS integration (`src/index.js`)**
   - The AizanoiOS desktop shell dynamically imports the module.
   - On `mount({ container })` the module inserts a scoped wrapper into the host window, boots the Phaser engine and tracks window resize via `ResizeObserver`.
   - On window close `teardown()` runs and the Phaser instance is fully destroyed with `destroy(true)`, preventing memory leaks.
2. **Standalone web route (`/dungeon/`)**
   - `frontend/dungeon/index.html` directly opens the standalone fullscreen experience.
   - When the device is mobile, a vertical-orientation hint is shown until landscape mode is reached.

### B. Procedural Web Audio (why no external sound files)

- **Why:** External MP3/OGG assets tend to add latency on slow networks, MIME-type mismatches on Linux/Nginx and avoidable 404 paths.
- **How (`AudioManager.js`):** HTML5 Web Audio API nodes (`OscillatorNode`, `GainNode`, `BiquadFilterNode`) procedurally synthesise every sound — sword swings, thunder, coin clinks, shield chants. Result: **0 bytes of network audio**, 100% offline.

### C. Procedural BSP dungeon generation (`LevelSystem.js`)

- At chapter start the dungeon is recursively partitioned with a Binary Space Partitioning algorithm.
- Rooms are connected by 2-tile corridors. The first room becomes Aizo's safe base (the Zeus Altar); the farthest becomes the exit portal.
- Players and enemies can never spawn inside a wall by construction.

### D. Dynamic asset-path resolution (`import.meta.url`)

- The standalone `/dungeon/` route and the AizanoiOS `frontend/js/v3/apps/dungeon/` module live at different folder depths.
- `BootScene.js` computes the asset base URL with `new URL('../../assets/', import.meta.url).href`, so assets always resolve regardless of where the game is loaded from.

---

## 5. Storage and state persistence

The module persists the player's progress in the browser's `localStorage` namespace under three keys:

| Storage key | Owned system | Contents and purpose |
|---|---|---|
| `aizanoi_dungeon_save_v1` | `ProgressionSystem` | Player level, current XP, total Denarii, unlocked skills, highest wave, current chapter and statistics. |
| `aizanoi_inventory_v1`    | `InventorySystem`    | Equipped weapon id, armour id and 2 accessory ids. |
| `aizanoi_dungeon_muted`   | `AudioManager`        | Sound on/off preference (`true` / `false`). |

*Note: in private browsing or when storage is restricted the system falls back to in-memory storage inside `try/catch`, so the game never crashes.*

---

## 6. Lifecycle and cleanup contract

- `GameScene` emits a `shutdown` event on each level transition (`handleEnterPortal`) and on restart.
- The virtual joystick (`TouchControls`) releases its DOM and canvas handles (`destroy()`).
- Scene-level keyboard and pointer listeners are evacuated with `removeAllListeners()`.
- When enemies die, their graphic health bars are removed from the scene tree via `preDestroy()`.
- On window close `stopDungeonGame` is called, terminating the Phaser loop, `requestAnimationFrame` calls and the Web Audio context.

---

## 7. Verification and tests

Run the existing regression and contract suites from the repository root (see `tests/` and CI):

```bash
node --test tests/aizanoi-os-dungeon-module.test.mjs
node --test tests/dungeon-real-touch-start.test.mjs
node --test tests/aizanoi-os-capabilities.test.mjs
```

For the full mathematical formulas, chapter balance tables, skill tree architecture and Nginx configuration guide, see `DOCUMENTATION.md` in this same directory.