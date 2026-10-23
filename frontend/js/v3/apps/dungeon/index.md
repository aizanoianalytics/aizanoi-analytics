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
  ledger; the victory screen then offers **Continue the descent** for the
  endless mode or **Descend again** for a fresh run.
- Each chapter arrives through 1-second spawn portals (edge, never within
  6 units of the player), then a wave of enemies drawn from eleven
  archetypes, each with its own behaviour: `chaser` (closes and strikes),
  `archer` (kites at 4–10 units and looses arrows), `tank` (slow slam),
  `summoner` (backs off and caps at three live minions), `flanker` (the Styx
  Ferryman, which orbits and then lunges), `boss` (three phases),
  `shieldbearer` (advances behind a shield that halves frontal hits, then
  bashes), `gargoyle` (perches, swoops once, then has to recover),
  `sorcerer` (holds casting distance and lobs a heavier bolt),
  `slimegolem` (slow engulf, splits in two on death) and `bomber` (rushes in,
  lights a fuse it cannot put out, and detonates without paying a kill
  reward). From chapter 3 up to two elites join: `armored` (more health),
  `swift` (faster), `volatile` (a blast on death) and `vampiric` (heals from
  the damage it deals); heat levels scale hp/speed/damage.
- Aizo fights with a three-hit melee chain (third swing sends a crescent
  wave), a bow, a guard/parry (`L`), a perfect-dodge Phantom Step, and a
  Wrath of the Temple shockwave (`E`) charged by dealing damage.
- Assist modes (`T`): manual / assist / auto. Manual swings earn rhythm
  bonus; held shoot charges a piercing focus shot.
- Each cleared wave drops a chest with gold, a choice of 3 blessings with
  rarity (common/rare/epic/mythic) stacking to level III, duo synergies,
  one paid reroll, and a 3-item Ferryman's Toll shop (heal/reroll/relic).
  The three duos are real effects: `bloodrite` (a critical hit heals 4% of
  max health), `eagles-mark` (bow crits pierce) and `gale-dancer` (the dash
  cuts everything it passes through).
- The run is persisted between sessions (save v4, v3 migrated), and the menu
  offers **Continue** when a saved run exists.
- Headless balance harness: `node scripts/dungeon/balance-harness.mjs`.
- Settings (`aizanoi.dungeon.settings.v1`, separate from the run): assist
  mode, auto-fire reserve, volumes, shake, quality; Touch defaults to Auto.
- Blessing pick screen: choice of 3 cards with rarity glow, keys `1-2-3`,
  reroll (`R`, costs gold), skip-for-gold. Defeat offers **Retry same seed
  (`R`)**; victory shows a copyable share text. Gamepad (sticks/buttons/Y +
  haptics) and touch buttons (Guard, Wrath) are wired.
- Juice table: hit-stop tiers light 30 / heavy 60 / boss 100 / parry 120,
  slow-mo on parry/phantom, 4 pitch variants per SFX, distinct parry/special/
  rhythm/focus cues.
- Five deterministic arenas cycle by seed and chapter (`column-ring`,
  `broken-bridge`, `brazier-court`, `collapsing-tiles`, `ruined-stairs`).
  Local meta (`aizanoi.dungeon.meta.v1`) stores up to 20 run-history entries,
  Marks, heat unlock progress and sideways unlock collections.

## The QA handle

`window.AIZANOI_DUNGEON_GAME` is a read-only view of the live game, used by
the browser tests:

- `state`, `chapter`, `frames`, `hp`, `stamina`, `maxStamina`
- `player` — the player's position and health
- `enemyHp` — the live enemies with their id, health, position and archetype
- `ledger` — the run ledger: kills, bosses, chests, swings, arrows, damage
  taken, chapter, gold and blessings
- `victory` — whether the run has been won
- `assist` — mode, current target, locked target
- `target` — the current target's id, archetype and health
- `buffs` — blessings, blessing levels, duos, special charge
- `status` — pending spawns, live count, guard state, time

It also carries a few QA affordances that drive the game's own code paths
rather than poking state: `qaAdvance(ticks)` runs the game's own fixed-step
tick, `qaWalkToward(enemyId)` steers the player with the game's own movement
input, `qaClearWave()` clears a wave and opens its chest through the
runtime's own path, and `qaRetrySeed()` restarts the same seed.
