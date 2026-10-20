# Aizanoi Dungeon (3D)

Aizanoi Dungeon: Aizo's Awakening rendered as a Three.js (WebGL2) 3D game.
Same product, same route (`/dungeon/`), same AizanoiOS app id (`dungeon`).

## Layout

- `manifest.json` — module manifest (`id: dungeon`, entry `./src/index.js`).
- `src/index.js` — AizanoiOS module entry (`mount`/`teardown`): title menu
  overlay, attract scene, orbit + WASD camera, QA handle
  `window.AIZANOI_DUNGEON_GAME = { started, engine: 'three', scene }`.
- `js/standalone.js` — standalone `/dungeon/` page entry (mounts into
  `#game-container`, orientation nudge, fullscreen).
- `css/game.css` — all module/page styles (route CSP bans inline styles).
- `assets/glb/` — headless-Blender kit (floor, wall, column, hero, enemy,
  chest, portal). Authoring script: `scripts/worlds/dungeon-kit.py`.

## Open questions for the gameplay port

Chapter systems (combat, levels, loot, skills, shop, bosses) are ported
phase by phase on top of this boot scene (see the dated dungeon-3d rebuild
plan under the workspace .hermes/plans directory).
