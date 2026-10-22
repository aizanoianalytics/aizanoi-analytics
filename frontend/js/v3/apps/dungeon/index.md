# Aizanoi Dungeon (3D)

Aizanoi Dungeon: Aizo's Awakening rendered as a Three.js (WebGL2) 3D game.
Same product, same route (`/dungeon/`), same AizanoiOS app id (`dungeon`).

## Layout

- `manifest.json` — module manifest (`id: dungeon`, entry `./src/index.js`).
- `src/index.js` — AizanoiOS module entry (`mount`/`teardown`).
- `src/game/index.js` — the game itself: the deterministic simulation. Seeded
  RNG, fixed-step update, the arena, the enemy archetypes, melee and bow
  combat, the blessings, the chests, the run ledger and the save/restore
  format. It has no Three.js dependency, so it can be tested on its own.
- `src/runtime/GameApp.js` — the Three.js runtime: the scene, the lighting,
  the camera, the input, the HUD wiring, the audio and the feedback bus, the
  asset loading, the lifecycle (including teardown) and the QA handle.
- `src/ui/hud.js` — the HUD: health, stamina, experience, the boss bar, the
  combo counter, the claimed blessings, the loot feed, the announcer, the
  pause and help surfaces.
- `src/ui/audio.js` — the WebAudio cue synth. No audio files are shipped.
- `src/ui/feedback.js` — the feedback bus: screen shake, hit stop, particles
  and floating damage, driven by named profiles.
- `js/standalone.js` — standalone `/dungeon/` page entry (mounts into
  `#game-container`, orientation nudge, fullscreen).
- `css/game.css` — all module/page styles (route CSP bans inline styles).
  The colour tokens are scoped to the app root and the standalone body, never
  to `:root`: the app is registered fullscreen and is mounted inside the
  AizanoiOS shell, so redefining the shell's `--az-*` tokens globally would
  restyle the whole shell while the game is open.
- `assets/glb/` — headless-Blender kit (floor, wall, column, hero, enemies,
  chest, portal). Authoring script: `scripts/worlds/dungeon-kit.py`.

## The game

- A run is ten chapters. Clearing the tenth wins the run and shows the run
  ledger; past that the descent continues endlessly.
- Each chapter is a wave of enemies drawn from six archetypes: `chaser`,
  `archer`, `tank`, `summoner`, `flanker` (the Styx Ferryman, which orbits
  and then lunges) and `boss`.
- Aizo fights with a three-hit melee chain and a bow. The bow costs stamina
  and tells the player when it refuses to fire.
- Each cleared wave drops a chest with gold and one of twelve blessings. The
  blessings are multipliers on the player, and the HUD lists the ones that
  have been claimed.
- The run is persisted between sessions, and the menu offers **Continue** when
  a saved run exists.

## The QA handle

`window.AIZANOI_DUNGEON_GAME` is a read-only view of the live game, used by
the browser tests:

- `state`, `chapter`, `frames`, `hp`, `stamina`, `maxStamina`
- `player` — the player's position and health
- `enemyHp` — the live enemies with their id, health, position and archetype
- `ledger` — the run ledger: kills, bosses, chests, swings, arrows, damage
  taken, chapter, gold and blessings
- `victory` — whether the run has been won

It also carries a few QA affordances that drive the game's own code paths
rather than poking state: `qaAdvance(ticks)` runs the game's own fixed-step
tick, `qaWalkToward(enemyId)` steers the player with the game's own movement
input, and `qaClearWave()` clears a wave and opens its chest through the
runtime's own path.
