# Aizanoi Dungeon Module (Aizo's Awakening)

> **Purpose:** A 10-chapter retro 2D top-down dungeon-crawler RPG set in the Aizanoi Zeus Temple and Penkalas catacombs. Fully integrated with the AizanoiOS v3 desktop shell, and also playable as a standalone fullscreen web route.

---

## 1. Stable identity

- **Product / game title:** Aizanoi Dungeon: Aizo's Awakening
- **Stable module id:** `dungeon`
- **Canonical runtime entry:** `src/index.js`
- **Manifest path:** `manifest.json` (`manifestVersion: 1`, `type: "desktop-app"`)
- **Standalone web entry:** `/dungeon/` (facade/compat route that imports the canonical module)
- **Desktop & favicon icon:** `/assets/icons/aizanoi-dungeon.svg` (shared brand icon set, not module-owned)

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
│   ├── scenes/          # 10 Phaser scenes (Boot, Menu, Options, Game, UI, Shop, SkillTree, Inventory, GameOver, Victory)
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

### B. Audio — a hybrid of sampled and synthesised sound

The game is **not** purely procedural, and does not pretend to be. Both paths are
real and both are used:

- **Sampled (`BootScene.js`):** five WAV assets are preloaded at boot —
  `ambient_cave_loop.wav` (258 KB), `ancient_chime.wav` (121 KB),
  `boss_slam_warning.wav` (69 KB), `shadow_dash.wav` (39 KB) and
  `gold_spark.wav` (22 KB), **520,598 bytes in total**. The cave ambience, the
  boss slam warning, the dash, the shrine chime and the coin pickup are these
  recordings. They are resolved through the same dynamic asset base as the
  sprites, so the standalone route and the AizanoiOS module load them
  identically.
- **Synthesised (`AudioManager.js`):** the high-frequency combat sounds — sword
  swings, hits, thunder, shield chants and UI blips — are Web Audio nodes
  (`OscillatorNode`, `GainNode`, `BiquadFilterNode`) built at runtime. This is
  why there are no hundreds of one-shot swing recordings: a swing that has to
  fire several times a second is cheaper and more controllable as synthesis.

The split is deliberate. Sustained, character-defining sound is sampled so it
sounds authored; per-hit and per-frame sound is synthesised so it is responsive
and costs nothing to download.

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

## 7. Accessibility and controls

### Controls

| Input | Move | Attack | Skills | Utility | Menu |
| --- | --- | --- | --- | --- | --- |
| Keyboard / arrows | WASD or arrows | Space | Q, R | E, B | Esc, P, M |
| Gamepad | left stick or d-pad | A | A, X | B | Start, Select |
| Touch | virtual joystick | on-screen button | on-screen | on-screen | on-screen |

A controller and a keyboard are both live at the same time: the pad is OR-ed
with the keyboard rather than replacing it, so neither has to be unplugged.

### Preferences

**Options & accessibility** in the main menu. Fully keyboard operable: arrow keys
move, Space or Enter changes, Esc goes back. Every control is a stepper rather
than a drag target, because a drag target cannot be used without a mouse.

| Preference | Effect |
| --- | --- |
| Reduced screen shake | Suppresses every camera shake. Also honours the OS `prefers-reduced-motion`. |
| Non-audio telegraphs | Draws a pulsing mark above a boss that is winding up or charging. |
| Readable contrast | Raises the HUD's smallest text to 13px and lifts the dimmest label colours. |
| Text size | 85% to 200%, applied to every HUD label. |
| Volume | 0 to 100% on the master gain. Mute is `M`, and shares the same gain. |

### A note on the camera shake

The shake is written by the game, not by Phaser. `Camera.shake()` in the
Phaser build this project ships (3.80.1) routes through a camera FX pipeline
(`addPrePipeline` + `Phaser.FX.Shake`) that the build does not have: `shake()`
is present as a function and returns without moving anything. All of the
game's shake calls were therefore inert before section 22 — the option was
honoured, and no camera moved either way.

`AccessibilitySystem.shakeCamera()` now applies the offset itself, through a
small Phaser-timed tween that `GameScene` writes to the camera's scroll every
frame. Measured in the audit: 16 moving frames and up to 15.1px of offset with
the preference off, 0 moving frames with it on.

### What is deliberately absent

There is **no "reduced flash" option, because the game has no screen flash.** The
Dungeon uses tinted sprites, floating text and camera shake; it never calls
`Camera.flash()` and there is no white-flash hit effect to suppress. Adding a
preference that toggles nothing would be a checkbox that lies, so there is not
one. If a flash is ever added, the preference has to come with it in the same
change.

## 8. Verification and tests

Run the existing regression and contract suites from the repository root (see `tests/` and CI):

```bash
node --test tests/*.test.mjs
```

The browser audits drive the real game through Playwright and are not part of
`node --test`. Each needs a served `frontend/` on port 4173:

```bash
python3 -m http.server 4173 --directory frontend &
node tests/dungeon-accessibility-audit.mjs
node tests/dungeon-visual-identity-audit.mjs
node tests/dungeon-level-design-audit.mjs
node tests/dungeon-run-summary-audit.mjs
node tests/dungeon-boss-encounter-audit.mjs
node tests/dungeon-combat-feel-audit.mjs
node tests/dungeon-enemy-behaviour-audit.mjs
node tests/dungeon-play-audit.mjs
node tests/dungeon-runtime-audit.mjs
```

For the full mathematical formulas, chapter balance tables, skill tree architecture and Nginx configuration guide, see `DOCUMENTATION.md` in this same directory.