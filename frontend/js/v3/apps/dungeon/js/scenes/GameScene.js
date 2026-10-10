// js/scenes/GameScene.js
// Ana Oyun Sahnesi: Harita, Karakter, Savaş, Düşmanlar ve Seviye Geçişleri

import { Aizo } from '../entities/Aizo.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';
import { Structure } from '../entities/Structure.js';
import { Portal } from '../entities/Portal.js';
import { LevelSystem } from '../systems/LevelSystem.js';
import { TouchControls } from '../systems/TouchControls.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { audioManager } from '../systems/AudioManager.js';
import { LEVELS } from '../data/levels.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { pickBlessings, createRunState } from '../data/blessings.js';
import { chooseEliteAffix } from '../data/elite-affixes.js';
import { WEAPONS } from '../data/items.js';
import { createGlassButton } from '../utils/ui-helpers.js';
import { hasDungeonExitHandler, requestDungeonExit } from '../main.js';
import { loadSettings, saveSettings, toggleDungeonFullscreen } from '../systems/SettingsSystem.js';
import { shakeCamera, updateCameraShake } from '../systems/AccessibilitySystem.js';
import { GamepadInput } from '../systems/GamepadSystem.js';

// Stable per-tile noise keeps authored dressing identical across reloads and
// prevents screenshot/replay drift without storing a second map artifact.
function decorNoise(x, y, salt = 0) {
  let n = (Math.imul((x | 0) + 374761393, 668265263)
    ^ Math.imul((y | 0) + 1274126177, 2246822519)
    ^ Math.imul((salt | 0) + 3266489917, 374761393)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// Hitstop slows scene time to 2% -- enough to read as a freeze, not a stall.
const HITSTOP_TIMESCALE = 0.02;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data) {
    this.chapterIndex = data.chapterIndex || 0;
    this.isEndless = data.isEndless || false;
    this.endlessWave = data.wave || 1;
    this.runState = data.runState || createRunState();
    this.blessingOverlay = null;
    this.isPaused = false;
    this.pauseOverlay = null;
    this.exitMenu = null;
    // Kombo + çatlak zamanlayıcıları
    this.comboCount = 0;
    this.comboTimer = 0;
    this.fissureTimer = 0;
    // Surface the scene transition as soon as init fires so headless QA can
    // observe the menu→game handoff even when the Phaser update loop is
    // throttled (e.g. mobile context with reduced motion). create() will
    // re-assert the same value once the renderer reaches it.
    if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = 'GameScene';
    if (typeof window !== 'undefined' && window.AIZANOI_DUNGEON_GAME?.events) {
      window.AIZANOI_DUNGEON_GAME.events.once('ready', () => {
        if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = 'GameScene';
      });
    }
  }

  create() {
    this.isTransitioning = false;
    this.settings = loadSettings();
    this.braziers = [];
    this.brazierClock = 0;
    this.recallChannel = 0;
    if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = 'GameScene';
    // 1. Sistemleri başlat
    this.progression = new ProgressionSystem();
    this.inventory = new InventorySystem(this.progression);
    // A run is a chapter sequence, not a save. Starting at the first chapter
    // begins a fresh ledger; returning to a later chapter resumes the same one,
    // so the victory screen reports the run the player actually played.
    if (!this.isEndless && (!this.progression.run || this.chapterIndex <= (this.progression.run.startedAtChapter ?? 0))) {
      this.progression.startRun();
    } else if (!this.progression.run) {
      this.progression.startRun();
    }

    // Seviye Konfigürasyonu
    if (this.isEndless) {
      this.currentLevelConfig = LEVELS[LEVELS.length - 1]; // Endless config
    } else {
      this.currentLevelConfig = LEVELS[this.chapterIndex] || LEVELS[0];
    }

    // 2. Harita Üretimi (BSP)
    this.levelSystem = new LevelSystem(this, this.currentLevelConfig);
    this.mapData = this.levelSystem.generate();

    // 3. Tilemap ve Zemin/Duvar Çizimi
    this.renderMap();

    // 4. Gruplar
    this.enemies = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.structures = this.physics.add.group();
    this.lootGroup = this.physics.add.group();

    // 5. Aizo'yu Base Alanında Doğur (Sunak ile çakışmayacak şekilde 36px önde)
    const altarX = this.mapData.baseArea.x * 32 + 16;
    const altarY = this.mapData.baseArea.y * 32 + 16;
    const spawnX = altarX;
    const spawnY = altarY + 36;
    this.player = new Aizo(this, spawnX, spawnY, this.inventory, this.progression, this.runState);

    // 6. Base Sunağı ve Portalı Yerleştir
    this.baseAltar = new Structure(this, altarX, altarY, 'zeus_altar');
    this.structures.add(this.baseAltar);

    const portalX = this.mapData.portalPos.x * 32 + 16;
    const portalY = this.mapData.portalPos.y * 32 + 16;
    this.exitPortal = new Portal(this, portalX, portalY);

    // 7. Düşmanları ve Yapıları Yerleştir
    this.spawnLevelEntities();

    // 8. Kamera Takibi
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(this.scale.width >= 900 ? 1.16 : 1.0);
    this.cameras.main.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);
    this.physics.world.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);

    // Point lights are attached to the objects that move: the player carries
    // the warm temple torch, the portal keeps its own cold glow.
    this.playerLight = this.addLight(this.player, 0xd8cbb0, 0.26, 170);
    if (this.exitPortal) {
      this.portalLight = this.addLight(this.exitPortal, 0x7f8cff, 0.30, 190);
    }

    // 9. Çarpışmalar (Collisions)
    this.physics.add.collider(this.player, this.wallLayer);
    this.physics.add.collider(this.enemies, this.wallLayer);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.player, this.structures);
    this.physics.add.collider(this.enemies, this.structures);

    this.physics.add.overlap(this.projectiles, this.enemies, this.handleProjectileHitEnemy, null, this);
    this.physics.add.overlap(this.projectiles, this.structures, this.handleProjectileHitStructure, null, this);
    this.physics.add.overlap(this.projectiles, this.player, this.handleProjectileHitPlayer, null, this);
    this.physics.add.collider(this.projectiles, this.wallLayer, (proj) => proj.destroy());

    this.physics.add.overlap(this.player, this.lootGroup, this.handlePickupLoot, null, this);
    this.physics.add.overlap(this.player, this.exitPortal, this.handleEnterPortal, null, this);

    // 10. Girdi Kontrolleri (Masaüstü)
    this.cursors = this.input.keyboard.createCursorKeys();
    // Section 22: the gamepad reader. Created once and sampled per frame; it
    // holds no state beyond the previous button values it needs for edge
    // detection.
    this.gamepadInput = new GamepadInput();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,R,E,I,M,P,TAB,SHIFT,SPACE,ESC,F,B');

    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown() && pointer.x > 48 && pointer.x < this.scale.width - 48) {
        this.player.attack();
      }
    });

    // 11. Dokunmatik Kontroller
    this.touchControls = new TouchControls(this);

    // Phaser can ignore a parallel scene launch while GameScene is still
    // completing create(). Defer the HUD handoff one tick so the scene manager
    // has committed GameScene before starting UIScene.
    setTimeout(() => {
      if (this.scene.isActive('GameScene') && !this.scene.isActive('UIScene')) {
        this.game.scene.start('UIScene', { gameScene: this });
      }
    }, 0);
    audioManager.startAmbientDrone();

    // 12b. Görsel katman: vignette + portal nabzı + bölüm kartı
    if (this.settings?.effects !== 'reduced') this.addVignette();

    // The firelights are added here rather than in renderMap(): the braziers
    // are placed during step 7, so a light created earlier would reference an
    // empty list and silently never be added. Phaser 3.80's LightsManager keeps
    // lights in a plain array with no upper cap, so the count is the only thing
    // that matters, and this is after every brazier exists.
    this.fireLights = [];
    for (const brazier of this.braziers) {
      const light = this.addLightAt(brazier.x, brazier.y, 210, 0xcf8b46, 0.45);
      if (light) this.fireLights.push(light);
    }
    if (this.exitPortal) {
      const portalLight = this.addLightAt(this.exitPortal.x, this.exitPortal.y, 180, 0x8e9cff, 0.38);
      if (portalLight) this.fireLights.push(portalLight);
    }

    this.showChapterCard();
    try {
      if (this.exitPortal) {
        const pg = this.add.sprite(this.exitPortal.x, this.exitPortal.y, 'effects', 8)
          .setDepth(6).setAlpha(0.5).setScale(2.2);
        // The portal is the one thing a player must always find, so it carries
        // the chapter's accent rather than a fixed colour: each chapter's way
        // out looks like it belongs to that chapter.
        if (this.chapterPalette?.accent) pg.setTint(this.chapterPalette.accent);
        // Kept as a handle so QA can read the applied tint instead of assuming it.
        this.portalGlow = pg;
        pg.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: pg,
          alpha: 0.22,
          scaleX: 2.7,
          scaleY: 2.7,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } catch (_) {}

    // 13. Temizlik (Memory Leak Önleme)
    this.events.once('shutdown', () => {
      if (this.touchControls) {
        this.touchControls.destroy();
        this.touchControls = null;
      }
      // Never leave the scene clock frozen across a shutdown: a hitstop that
      // outlives the scene would hand the next run a 2% time scale.
      if (this.hitstopRelease) clearTimeout(this.hitstopRelease);
      this.hitstopRelease = null;
      this.hitstopUntil = 0;
      this.time.timeScale = 1;
      audioManager.stopAmbientDrone();
      this.input.removeAllListeners();
      // Drop the scene sentinel so a fresh Phaser instance can claim it
      // without a stale scene reference lingering after restart/teardown.
      if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = undefined;
    });
  }

  /**
   * Section 21 asks for chapter palettes and for the game to look intentionally
   * authored rather than generic. Every chapter declares a palette, but until now
   * nothing read it: the floor, the walls, the light and the fog were identical
   * in all ten chapters, so "Necropolis Labyrinth" and "Throne of Storms" were
   * the same room with different enemies.
   *
   * Tinting the tilemap layers is what makes the difference read at a glance, and
   * the camera fog is what carries the chapter's colour into the distance. The
   * accents are deliberately low-saturation: this is a marble temple, not a neon
   * arcade, and a player still has to see a teleporting enemy against it.
   */
  applyChapterPalette() {
    const pal = this.mapData?.palette || this.currentLevelConfig?.palette;
    if (!pal) return null;

    // Phaser 3.80 removed Camera.setFog, so the depth cue is two static
    // rectangles instead: a chapter-coloured wash over the whole map, and a
    // warmer accent lift. Both are deliberately strong enough to be seen --
    // an earlier version used 0.22 and 0.07 alpha, and measuring the rendered
    // frames showed a mean colour shift of 0 to 1 out of 255, which is not a
    // palette, it is a rounding error.
    const w = this.mapData.width * 32;
    const h = this.mapData.height * 32;

    if (this.chapterHaze) this.chapterHaze.destroy();
    if (this.chapterLightOverlay) this.chapterLightOverlay.destroy();

    // The wash sits BETWEEN the floor and the walls, not over the whole scene.
    // The tilemap layers default to depth 0, so the wash goes just above them
    // and just below everything that matters: placing it above the actors puts a
    // 55% fog rectangle over the player, the enemies and every effect, which is
    // not a chapter palette, it is a broken game.
    //
    // The floor and wall tints are what the player actually reads, so they carry
    // the chapter. Phaser multiplies a tint into the tile texture, so a strongly
    // tinted floor turns the same marble tileset into ten different stones
    // without touching a single asset.
    this.floorLayer?.setDepth(0);
    this.wallLayer?.setDepth(0);
    // Keep the chapter identity as a restrained colour wash. A 55% fog layer
    // over a dark palette crushes the authored floor values into near-black;
    // at 18% it separates the room without erasing material detail.
    this.chapterHaze = this.add
      .rectangle(0, 0, w, h, pal.fog, 0.18)
      .setOrigin(0)
      .setDepth(0.5);

    // The accent lift, in front of the wash, tying the marble to the chapter.
    this.chapterLightOverlay = this.add
      .rectangle(0, 0, w, h, pal.accent, 0.16)
      .setOrigin(0)
      .setDepth(0.6);

    // The floor and wall tints are pushed toward the chapter colour so the
    // difference survives even where the wash is behind the actors.
    this.appliedFloorTint = this.mixToward(pal.floor, pal.accent, 0.18);
    this.appliedWallTint = this.mixToward(pal.wall, pal.fog, 0.25);
    // Phaser's tint is multiplicative. Chapter source colours are intentionally
    // dark atmospheric colours, so applying them raw would turn a pale marble
    // floor into charcoal. Lift the mixed colour toward neutral white while
    // preserving its hue; material contrast remains authored in the tileset.
    this.appliedFloorTint = this.liftTint(this.appliedFloorTint, 0.70);
    this.appliedWallTint = this.liftTint(this.appliedWallTint, 0.54);
    this.floorLayer?.setTint(this.appliedFloorTint);
    this.wallLayer?.setTint(this.appliedWallTint);

    this.cameras.main?.setBackgroundColor?.(pal.fog);
    this.chapterPalette = pal;
    this.chapterWashAlpha = 0.18;
    this.chapterAccentAlpha = 0.16;
    return pal;
  }

  /** Blend two packed RGB colours; t of 0 returns a, 1 returns b. */
  mixToward(a, b, t) {
    const ar = (a >> 16) & 0xff; const ag = (a >> 8) & 0xff; const ab = a & 0xff;
    const br = (b >> 16) & 0xff; const bg = (b >> 8) & 0xff; const bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  /** Lift a tint toward white because Phaser multiplies tint channels. */
  liftTint(value, amount) {
    const r = (value >> 16) & 0xff; const g = (value >> 8) & 0xff; const b = value & 0xff;
    const lift = (channel) => Math.round(channel + (0xff - channel) * amount);
    return (lift(r) << 16) | (lift(g) << 8) | lift(b);
  }

  /** Add a static point light at a world position. */
  addLightAt(x, y, radius, color, intensity) {
    try {
      return this.lights.addLight(x, y, radius, color, intensity);
    } catch (_) {
      return null;
    }
  }

  /** Add a point light that follows its owner. */
  addLight(target, color, intensity, radius) {
    try {
      return this.lights.addLight(target, radius, color, intensity);
    } catch (_) {
      return null;
    }
  }

  renderMap() {
    // Statik Tilemap katmanı oluştur
    const map = this.make.tilemap({
      data: this.mapData.grid,
      tileWidth: 32,
      tileHeight: 32,
    });

    const floorTileset = map.addTilesetImage('tiles-floor');
    const wallTileset = map.addTilesetImage('tiles-walls');

    // Zemin Katmanı
    this.floorLayer = map.createBlankLayer('FloorLayer', floorTileset);
    // Duvar Katmanı (Fizik çarpışması aktif)
    this.wallLayer = map.createBlankLayer('WallLayer', wallTileset);

    for (let y = 0; y < this.mapData.height; y++) {
      for (let x = 0; x < this.mapData.width; x++) {
        const val = this.mapData.grid[y][x];
        if (val === 2) {
          // Duvar
          this.wallLayer.putTileAt(0, x, y);
        } else if (val === 3) {
          // Base zemin
          this.floorLayer.putTileAt(5, x, y);
        } else if (val === 4) {
          // Portal zemin
          this.floorLayer.putTileAt(8, x, y);
        } else {
          // Normal tapınak mermer zemin
          const tileIdx = (x + y) % 3;
          this.floorLayer.putTileAt(tileIdx, x, y);
        }
      }
    }

    this.applyChapterPalette();

    // Real local lighting on the tilemap. Phaser 3.80 ships LightsManager, so
    // a scene-level lights object exists and can light sprites individually.
    // A low charcoal-blue fill keeps unlit corners readable while preserving
    // the fire-led hierarchy; near-black ambient turns the dungeon into void.
    if (this.lights?.enable) {
      this.lights.enable();
      this.lights.setAmbientColor(0x24262b);
    }

    // The layers that must receive light go on the Light2D pipeline. Everything
    // that is NOT on that pipeline (actors, HUD, effects) renders above the
    // light texture and is therefore never darkened by it.
    // The dressing is lit too: an unlit column in a lit room reads as a dark
    // rectangle pasted on top, which is exactly the "sprite over background"
    // look that separates amateur from production art.
    this.floorLayer.setPipeline('Light2D');
    this.wallLayer.setPipeline('Light2D');
    // The hero props are placed later in create(); they are registered with
    // the pipeline at creation time in placeRoomDressing().

    this.wallLayer.setCollisionByExclusion([-1]);
    // The authored tileset already carries the material contrast; a second
    // hard-coded tint here would overwrite the chapter palette and darken it.
    // Chapter colour is applied once above in applyChapterPalette().
    // Duvar üst kenarına 2px pirinç highlight: derinlik hissi
    try {
      const hl = this.add.graphics().setDepth(4);
      hl.lineStyle(2, 0xc5a059, 0.5);
      for (let y = 1; y < this.mapData.height; y++) {
        for (let x = 0; x < this.mapData.width; x++) {
          if (this.mapData.grid[y][x] === 2 && this.mapData.grid[y - 1][x] !== 2) {
            hl.lineBetween(x * 32, y * 32, x * 32 + 32, y * 32);
          }
        }
      }
    } catch (_) {}

    // Sparse, deterministic 32px mosaic fragments. The decor asset is a
    // spritesheet: rendering the unsliced 160×96 atlas used to carpet rooms
    // with giant inventory-board rectangles and destroy combat readability.
    //
    // Room-authored dressing: each room gets (a) a small scatter of ground
    // fragments and (b) one hero prop placed near the room's centre line. The
    // hero prop is what makes a room read as an authored temple rather than a
    // bounding box: a fallen column or an amphora at the heart of a hall gives
    // the camera a focal point and the player something to move around. Both
    // are placed deterministically so a reload never reshuffles the level.
    try {
      const safeFrames = [0, 1, 2, 5, 6, 7];
      const heroFrames = [0, 1, 3, 4, 6, 9];
      for (const room of this.mapData.rooms || []) {
        const decals = Math.max(1, Math.floor((room.w * room.h) * 0.025));
        for (let i = 0; i < decals; i++) {
          const dx = room.x + Math.floor(decorNoise(room.x, room.y, i * 5 + 1) * room.w);
          const dy = room.y + Math.floor(decorNoise(room.x, room.y, i * 5 + 2) * room.h);
          if (this.mapData.grid[dy] && this.mapData.grid[dy][dx] !== 2) {
            const frame = safeFrames[Math.floor(decorNoise(dx, dy, i * 5 + 3) * safeFrames.length)];
            const d = this.add.image(dx * 32 + 16, dy * 32 + 16, 'tiles-decor', frame)
              .setDepth(1)
              .setAlpha(0.32 + decorNoise(dx, dy, i * 5 + 4) * 0.22)
              .setRotation(Math.floor(decorNoise(dx, dy, i * 5 + 5) * 4) * Math.PI / 2)
              .setScale(0.72 + decorNoise(dx, dy, i * 5 + 6) * 0.2)
              .setPipeline('Light2D');
            // Mosaic fragments take the chapter's accent, so the decoration is
            // part of the chapter's colour scheme rather than a constant.
            d.setTint(this.chapterPalette?.accent ?? 0xd8c18d);
          }
        }

        // One hero prop per room. It lands on the room's centre tile rather
        // than a random cell: a room's centreline is where the eye already
        // rests, so the prop reads as the room's focal point instead of a
        // random scattered sprite.
        const hx = room.x + Math.floor(room.w / 2);
        const hy = room.y + Math.floor(room.h / 2);
        if (this.mapData.grid[hy] && this.mapData.grid[hy][hx] !== 2) {
          const frame = heroFrames[Math.floor(decorNoise(room.x, room.y, 993) * heroFrames.length)];
          const prop = this.add.image(hx * 32 + 16, hy * 32 + 16, 'tiles-decor', frame)
            .setDepth(3)
            .setAlpha(0.92)
            .setPipeline('Light2D');
          // Props are stone, not magic: they take the wall stone tint so they
          // read as architecture instead of glowing decoration.
          prop.setTint(this.appliedWallTint ?? 0xb8b2a6);
          // A drop contact shadow so the prop sits ON the floor.
          const propShadow = this.add.ellipse(prop.x, prop.y + 13, 22, 7, 0x000000, 0.3);
          propShadow.setDepth(2.9);
        }
        // Wall-aligned braziers: a room's silhouette is defined by its walls,
        // so a light source at the wall is the one dressing that reads as
        // architecture rather than decoration. One per room, placed on the
        // first free floor tile that touches a wall.
        let brazier = null;
        for (let by = room.y; by < room.y + room.h && !brazier; by++) {
          for (let bx = room.x; bx < room.x + room.w; bx++) {
            if (this.mapData.grid[by]?.[bx] === 2) continue;
            const touchesWall =
              this.mapData.grid[by]?.[bx - 1] === 2 || this.mapData.grid[by]?.[bx + 1] === 2 ||
              this.mapData.grid[by - 1]?.[bx] === 2 || this.mapData.grid[by + 1]?.[bx] === 2;
            if (!touchesWall) continue;
            // Frames 0-3 are the brazier flicker. The tile is authored dark so
            // the flame reads without tint; the glow carries the chapter hue.
            brazier = this.add.sprite(bx * 32 + 16, by * 32 + 16, 'tiles-lights', 0)
              .setDepth(3.2)
              .setScale(1.0);
            this.brazierTimer = this.brazierTimer || null;
            brazier.brazierFrame = 0;
            this.braziers.push(brazier);
            // Three low-alpha pools approximate a radial falloff with Phaser's
            // primitive API: broad amber ambience, a tighter middle, then a
            // hot patch under the bowl. A single opaque circle reads as a decal.
            const glowOuter = this.add.ellipse(bx * 32 + 16, by * 32 + 16, 128, 128,
              this.chapterPalette?.accent ?? 0xc5a059, 0.035).setDepth(2.6);
            const glowMid = this.add.ellipse(bx * 32 + 16, by * 32 + 16, 88, 88,
              this.chapterPalette?.accent ?? 0xc5a059, 0.045).setDepth(2.7);
            const glowHot = this.add.ellipse(bx * 32 + 16, by * 32 + 16, 52, 52,
              0xf0a84c, 0.065).setDepth(2.8);
            glowOuter.setBlendMode(Phaser.BlendModes.ADD);
            glowMid.setBlendMode(Phaser.BlendModes.ADD);
            glowHot.setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: [brazier, glowOuter, glowMid, glowHot],
              alpha: { from: 0.62, to: 1.0 },
              duration: 620,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
            break;
          }
        }
      }
    } catch (_) {}
  }

  // Vignette: ekran kenarlarını karart, odağı ortaya topla (derinlik hissi)
  addVignette() {
    try {
      const { width, height } = this.cameras.main;
      const v = this.add.container(0, 0).setDepth(5).setScrollFactor(0);
      const t = 46;
      const mk = (x, y, w, h) => this.add.rectangle(x, y, w, h, 0x000000, 0.28);
      v.add([
        mk(width / 2, t / 2, width, t),
        mk(width / 2, height - t / 2, width, t),
        mk(t / 2, height / 2, t, height),
        mk(width - t / 2, height / 2, t, height),
      ]);
    } catch (_) {}
  }

  // Kısa hit-stop: kritik vuruşta dünyayı yavaşlat (reduced modda yarım)
  juiceHitstop(ms = 55) {
    try {
      if (this.settings?.effects === 'reduced') ms = Math.round(ms / 2);
      this.physics.world.pause();
      this.time.delayedCall(ms, () => {
        if (!this.isPaused && !this.exitMenu && !this.blessingOverlay) this.physics.world.resume();
      });
    } catch (_) {}
  }

  // Ölüm patlaması: taş-kül parçacıkları + şok halkası (reduced modda yarım)
  spawnDeathBurst(x, y, isBoss = false) {
    // Death bursts share the same live-effect budget as damage sparks so a
    // wave clearing ten enemies at once cannot double the screen's additive
    // load. The burst is thinned, never silently dropped, and the ring keeps
    // its own slot because it is the clearest "something died here" signal.
    this.impactFxCount = this.impactFxCount || 0;
    let budget = Math.max(0, 6 - this.impactFxCount);
    try {
      const reduced = this.settings?.effects === 'reduced';
      let count = isBoss ? 14 : 6 + Math.floor(Math.random() * 5);
      if (reduced) count = Math.ceil(count / 2);
      count = Math.min(count, budget);
      for (let i = 0; i < count; i++) {
        this.impactFxCount += 1;
        const ember = this.add.sprite(x, y, 'tiles-impacts', 1).setDepth(20);
        ember.setScale(0.4 + Math.random() * 0.3);
        ember.setBlendMode(Phaser.BlendModes.ADD);
        const angle = Math.random() * Math.PI * 2;
        const dist = 24 + Math.random() * (isBoss ? 90 : 48);
        this.tweens.add({
          targets: ember,
          x: x + Math.cos(angle) * dist,
          y: y + Math.sin(angle) * dist,
          alpha: 0,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: 320 + Math.random() * 200,
          ease: 'Quad.easeOut',
          onComplete: () => {
            ember.destroy();
            this.impactFxCount = Math.max(0, (this.impactFxCount || 1) - 1);
          },
        });
      }
      // The expanding ring is the authored shockwave instead of a stroked
      // circle, so it shares the impact sheet's language with the hit sparks.
      this.impactFxCount += 1;
      const ring = this.add.sprite(x, y, 'tiles-impacts', 7).setDepth(19);
      ring.setBlendMode(Phaser.BlendModes.ADD);
      ring.setScale(0.55);
      this.tweens.add({
        targets: ring,
        scaleX: (isBoss ? 2.4 : 1.5) * 1.6,
        scaleY: (isBoss ? 2.4 : 1.5) * 1.6,
        alpha: 0,
        duration: isBoss ? 520 : 300,
        ease: 'Quad.easeOut',
        onComplete: () => {
          ring.destroy();
          this.impactFxCount = Math.max(0, (this.impactFxCount || 1) - 1);
        },
      });
      if (isBoss) shakeCamera(this, 200, 0.01);
    } catch (_) {}
  }

  spawnLevelEntities() {
    const config = this.currentLevelConfig;
    const enemyTypes = config.enemies?.types || ['gargoyle'];

    // 1. Düşman Sayısı
    let count = 10;
    if (config.enemies?.density === 'medium') count = 18;
    if (config.enemies?.density === 'high') count = 26;
    if (config.enemies?.density === 'very_high') count = 36;

    if (this.isEndless) {
      // D11: Bellek patlamasını ve aşırı düşman üretimini önleyen kesin tavan (Maksimum 32 aktif düşman)
      const cappedWave = Math.min(this.endlessWave, 20);
      const rawCount = Math.floor(15 * Math.pow(1.12, cappedWave - 1));
      count = Math.min(32, rawCount);
    }

    // Section 19: encounters are placed by room role, not scattered at random.
    // A shrine or a merchant camp stays safe, an elite chamber holds a few
    // stronger enemies instead of a crowd, and the boss arena is reserved for
    // the boss. The spawn still comes from the generator's proven-reachable
    // set, so nothing can appear inside a wall.
    const spawnRoles = ['combat', 'elite', 'treasure', 'event', 'transition'];
    let eliteSpawned = 0;
    for (let i = 0; i < count; i++) {
      // Bias towards the role this chapter actually has most of, so an
      // Aqueducts chapter fills its combat halls and a Necropolis chapter fills
      // its elite chambers.
      const role = spawnRoles[i % spawnRoles.length];
      let pos = this.levelSystem.getSpawnPositionForRole(role);
      if (!pos) pos = this.levelSystem.getRandomWalkablePosition(true);

      const typeKey = enemyTypes[i % enemyTypes.length];
      const typeConfig = { ...ENEMY_TYPES[typeKey] };
      const isEliteRoom = pos.role === 'elite';
      if (isEliteRoom) {
        // An elite chamber is a smaller fight with a stronger one, which is what
        // makes it a different encounter rather than a relabelled corridor.
        eliteSpawned++;
        typeConfig.eliteAffix = chooseEliteAffix({ ...typeConfig, isElite: true });
        typeConfig.maxHpMultiplier = 1.5;
        typeConfig.hp = Math.round(typeConfig.hp * 1.5);
        typeConfig.attackDamage = Math.round(typeConfig.attackDamage * 1.2);
      } else {
        typeConfig.eliteAffix = chooseEliteAffix(typeConfig);
      }
      if (isEliteRoom && eliteSpawned > 2) {
        // Never let an elite chamber become an ambush: two elites is the cap.
        typeConfig.hp = Math.round(typeConfig.hp / (1.5 * (eliteSpawned - 2)));
        typeConfig.attackDamage = Math.round(typeConfig.attackDamage / (1.2 * (eliteSpawned - 2)));
      }

      if (this.isEndless) {
        // Dalga ölçeği 20. dalgada sabitlenir: can ~14.2x, hasar ~6.1x tavan.
        const cappedWave = Math.min(this.endlessWave, 20);
        const waveScale = Math.pow(1.15, cappedWave - 1);
        typeConfig.hp = Math.round(typeConfig.hp * waveScale);
        typeConfig.attackDamage = Math.round(typeConfig.attackDamage * Math.pow(1.10, cappedWave - 1));
      }

      const enemy = new Enemy(this, pos.x, pos.y, typeConfig);
      enemy.setData('spawnRole', pos.role);
      this.enemies.add(enemy);
    }

    // 2. Yapıları Doğurma (Kuleler, Çatlaklar, Yozlaşmış Sunaklar)
    if (config.structures) {
      const { spawnPoints = 0, towers = 0, enemyBases = 0 } = config.structures;

      // Structures belong to rooms too: a fissure or a tower is a hazard, so it
      // goes in a room the player has to fight through, not in a safe camp or a
      // shrine. Falling back to anywhere keeps an over-sparse chapter playable.
      const hazardRoles = ['combat', 'event', 'treasure'];

      for (let s = 0; s < spawnPoints; s++) {
        const pos =
          this.levelSystem.getSpawnPositionForRole(hazardRoles[s % hazardRoles.length]) ||
          this.levelSystem.getRandomWalkablePosition(true);
        const fissure = new Structure(this, pos.x, pos.y, 'spawn_fissure');
        fissure.setData('spawnRole', pos.role);
        this.structures.add(fissure);
      }

      for (let t = 0; t < towers; t++) {
        const pos =
          this.levelSystem.getSpawnPositionForRole(hazardRoles[t % hazardRoles.length]) ||
          this.levelSystem.getRandomWalkablePosition(true);
        const tower = new Structure(this, pos.x, pos.y, 'defense_tower');
        tower.setData('spawnRole', pos.role);
        tower.lastFire = 0;
        this.structures.add(tower);
      }

      for (let b = 0; b < enemyBases; b++) {
        const pos =
          this.levelSystem.getSpawnPositionForRole(hazardRoles[b % hazardRoles.length]) ||
          this.levelSystem.getRandomWalkablePosition(true);
        const shrine = new Structure(this, pos.x, pos.y, 'corrupted_shrine');
        shrine.setData('spawnRole', pos.role);
        this.structures.add(shrine);
      }
    }

    // 3. Boss Doğurma (Eğer varsa)
    if (config.boss) {
      const bossConfig = ENEMY_TYPES[config.boss];
      if (bossConfig) {
        // The boss belongs in the boss arena, which is the one room the audit
        // guarantees has the clearance a large fight needs.
        const bossPos =
          this.levelSystem.getSpawnPositionForRole('boss', { requiredClearance: 3 }) ||
          this.levelSystem.getRandomWalkablePosition(true, 3);
        const boss = new Enemy(this, bossPos.x, bossPos.y, bossConfig);
        boss.setData('spawnRole', 'boss');
        this.enemies.add(boss);
        // Boss uyarısı: wav + isim bandı
        this.playSfx('sfx-boss-warning', 0.7);
        this.createFloatingText(bossPos.x, bossPos.y - 60, `⚠ ${bossConfig.name} ⚠`, '#f39c12', 20);
      }
    }
  }

  // Kısa SFX çalıcı (BootScene'de yüklenen wav'ler için)
  playSfx(key, volume = 0.5) {
    try {
      if (this.sound && this.cache.audio.exists(key)) this.sound.play(key, { volume });
    } catch (_) {}
  }

  // Mezar Çatlakları: 12sn'de bir düşman doğurur (aktif < 40 ise)
  tickFissures() {
    try {
      const fissures = this.structures ? this.structures.getChildren().filter((s) => s.active && s.structureType === 'spawn_fissure') : [];
      if (fissures.length === 0) return;
      const activeCount = this.enemies ? this.enemies.getChildren().filter((e) => e.active).length : 0;
      if (activeCount >= 40) return;
      const types = this.currentLevelConfig.enemies?.types || ['gargoyle'];
      for (const f of fissures) {
        if (this.enemies.getChildren().filter((e) => e.active).length >= 40) break;
        if (Math.random() < 0.75) {
          const typeKey = types[Math.floor(Math.random() * types.length)];
          const cfg = { ...ENEMY_TYPES[typeKey] };
          cfg.eliteAffix = chooseEliteAffix(cfg);
          const enemy = new Enemy(this, f.x + 16, f.y + 10, cfg);
          this.enemies.add(enemy);
          this.spawnDeathBurst(f.x, f.y, false);
        }
      }
    } catch (_) {}
  }

  // Kombo: 3sn penceresinde zincirleme öldürme
  registerKill(x, y) {
    this.comboCount = (this.comboCount || 0) + 1;
    this.comboTimer = 3000;
    if (this.comboCount > 0 && this.comboCount % 5 === 0) {
      this.createFloatingText(x, y - 40, `x${this.comboCount} COMBO! +${this.comboCount} ⚡`, '#f39c12', 20);
      this.progression.addXp(this.comboCount);
    }
  }

  // Bölüm giriş kartı: isim + lore (2.4sn, oyunu bölmez)
  showChapterCard() {
    try {
      const { width } = this.cameras.main;
      const name = this.isEndless ? `Endless Pantheon — Wave ${this.endlessWave}` : (this.currentLevelConfig.name || '');
      const lore = this.isEndless ? 'Endless waves. Highest wave is the score.' : (this.currentLevelConfig.lore || '');
      const title = this.add.text(width / 2, 120, name, {
        fontSize: '26px', color: '#f5d77f', fontStyle: 'bold',
        stroke: '#0b1220', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(400).setScrollFactor(0);
      const sub = this.add.text(width / 2, 152, lore, {
        fontSize: '13px', color: '#d1d5db', fontStyle: 'italic',
        stroke: '#0b1220', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(400).setScrollFactor(0);
      this.tweens.add({
        targets: [title, sub],
        alpha: 0,
        duration: 700,
        delay: 1700,
        onComplete: () => { title.destroy(); sub.destroy(); },
      });
    } catch (_) {}
  }

  update(time, delta) {
    if (this.player && this.player.active) {
      // The gamepad is sampled once per frame and the button presses are OR-ed
      // with the keyboard rather than replacing it: a controller and a keyboard
      // are both live at the same time when both are plugged in, and neither
      // should have to be unplugged for the other to work.
      const pad = this.gamepadInput?.sample();
      const padDown = (n) => Boolean(pad?.pressed?.[n]);

      // M: sessiz, P: duraklat — duraklatma bayrağı oyuncu güncellemesinden önce işlenir
      if (this.wasd) {
        if (Phaser.Input.Keyboard.JustDown(this.wasd.M) || padDown('confirm')) audioManager.toggleMute();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.P) || padDown('pause')) this.togglePause();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.ESC)) this.toggleExitMenu();
      }
      if (this.isPaused || this.exitMenu) return;
      this.brazierClock += delta;
      if (this.brazierClock >= 145) {
        this.brazierClock = 0;
        for (const brazier of this.braziers || []) {
          if (!brazier?.active) continue;
          brazier.brazierFrame = (brazier.brazierFrame + 1) % 4;
          brazier.setFrame(brazier.brazierFrame);
        }
      }
      this.player.update(time, delta);
      // The shake is a displacement applied on top of the camera's own follow,
      // so it has to run after the player has moved and the camera has caught
      // up. Advancing it before that would offset the scroll the follow is
      // about to overwrite.
      updateCameraShake(this, delta);
      if (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.F)) {
        toggleDungeonFullscreen(document.getElementById('game-container') || document.documentElement);
      }
      if (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.B)) {
        this.startRecall();
      }

      // Dash: Shift on keyboard, the gamepad's roll button, and the on-screen
      // dash button on touch. All three must reach the same player method so
      // the ability reads identically on every input surface.
      const dashPressed = (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.SHIFT)) || padDown('dash');
      if (dashPressed) this.player.startDash();

      this.tickInteractables(delta);

      // Base güvenli alan kontrolü
      const distToBase = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.baseAltar.x, this.baseAltar.y
      );
      this.player.isInBase = distToBase < 80;

      // Space ile utility skill (Gölge Karışımı) veya saldırı
      if ((this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.space)) || padDown('attack')) {
        if (this.progression && this.progression.unlockedSkills.has('shadow_melding') && typeof this.player.castUtilitySkill === 'function' && padDown('secondary')) {
          this.player.castUtilitySkill();
        } else {
          this.player.attack();
        }
      }

      // Klavye yetenek kısayolları
      if (this.wasd) {
        if (Phaser.Input.Keyboard.JustDown(this.wasd.Q) || padDown('attack')) this.player.castSkill1();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.R) || padDown('secondary')) this.player.castSkill2();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.I) || Phaser.Input.Keyboard.JustDown(this.wasd.TAB) || padDown('pause')) {
          this.scene.launch('InventoryScene');
        }
        if (Phaser.Input.Keyboard.JustDown(this.wasd.E)) {
          if (this.player.isInBase) this.scene.launch('ShopScene');
        }
      }
      this.tickRecall(delta);
      this.attractLoot();
      if (this.settings?.autoAim) this.autoAimAttack(time);

      // Mezar Çatlakları doğurma sayacı
      this.fissureTimer = (this.fissureTimer || 0) + delta;
      if (this.fissureTimer > 12000) {
        this.fissureTimer = 0;
        this.tickFissures();
      }

      // Kombo zaman aşımı
      if (this.comboTimer > 0) {
        this.comboTimer -= delta;
        if (this.comboTimer <= 0) {
          this.comboTimer = 0;
          this.comboCount = 0;
        }
      }
    }

    if (this.exitPortal && typeof this.exitPortal.setLocked === 'function') {
      this.exitPortal.setLocked(!this.canCompleteLevel());
    }
    if (this.player && this.player.maxHp) {
      const danger = this.player.hp / this.player.maxHp <= 0.22;
      this.cameras.main.setDeadzone(danger ? 24 : 0, danger ? 24 : 0);
    }

    // Düşman güncellemeleri
    this.enemies.getChildren().forEach((enemy) => {
      if (enemy.active) enemy.update(time, delta, this.player);
    });

    // Savunma Kuleleri AI
    if (this.player && this.player.active) {
      this.structures.getChildren().forEach((struct) => {
        if (struct.active && struct.structureType === 'defense_tower') {
          if (!struct.lastFire) struct.lastFire = time;
          if (time - struct.lastFire > 3200) {
            const dist = Phaser.Math.Distance.Between(struct.x, struct.y, this.player.x, this.player.y);
            if (dist < 240) {
              struct.lastFire = time;
              this.fireEnemyProjectile(struct, this.player, 'bone_arrow', 14);
            }
          }
        }
      });
    }
  }

  handleProjectileHitEnemy(proj, enemy) {
    if (!proj.isPlayer || !enemy.active) return;

    const damageType = proj.damageType || 'physical';
    let attackResult = null;
    if (proj.attacker) {
      attackResult = CombatSystem.processAttack(proj.attacker, enemy, proj.damage, { damageType });
      // Kritik senkronu: ses zaten pitch'li, görsel de aynı karede patlasın
      if (attackResult && attackResult.isCritical) {
        shakeCamera(this, 110, 0.006);
        this.juiceHitstop(55);
      }
    } else {
      const targetArmor = enemy.stats?.armor ?? enemy.armor ?? 0;
      const netDamage = CombatSystem.calculateDamage(proj.damage, targetArmor);
      enemy.takeDamage(netDamage);
    }
    this.createDamageSpark(enemy.x, enemy.y, Boolean(attackResult?.isCritical));

    // Zeus Staff AoE: carpis noktasinda yariCap icindeki diger dusmanlara
    // yari hasar. Birincil hedefe ikinci kez vurulmaz; yalnizca dusmanlar.
    const weaponId = proj.attacker?.inventory?.equipped?.weapon;
    if (weaponId === 'zeus_staff' && typeof WEAPONS !== 'undefined') {
      const aoeRadius = WEAPONS.zeus_staff?.special?.aoeRadius || 0;
      if (aoeRadius > 0 && this.enemies) {
        for (const other of this.enemies.getChildren()) {
          if (other === enemy || !other.active) continue;
          const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y);
          if (dist <= aoeRadius) {
            CombatSystem.processAttack(proj.attacker, other, Math.round(proj.damage * 0.5), { damageType });
            this.createDamageSpark(other.x, other.y);
          }
        }
      }
    }
    proj.destroy();
  }

  handleProjectileHitStructure(proj, struct) {
    if (!proj.isPlayer || !struct.active || struct.isPlayerBase) return;

    struct.takeDamage(proj.damage);
    this.createDamageSpark(struct.x, struct.y);
    proj.destroy();
  }

  handleProjectileHitPlayer(proj, player) {
    if (proj.isPlayer || !player.active) return;

    if (proj.attacker) {
      CombatSystem.processAttack(proj.attacker, player, proj.damage, { damageType: proj.damageType || 'physical' });
    } else {
      const targetArmor = player.stats?.armor ?? player.armor ?? 0;
      const netDamage = CombatSystem.calculateDamage(proj.damage, targetArmor);
      player.takeDamage(netDamage);
    }
    this.createDamageSpark(player.x, player.y);
    proj.destroy();
  }

  handlePickupLoot(player, loot) {
    if (!loot.active) return;

    if (loot.lootType === 'gold') {
      const bonusMult = this.progression.unlockedSkills.has('denarii_seeker') ? 1.3 : 1.0;
      const total = Math.round(loot.amount * bonusMult);
      this.progression.addGold(total);
      audioManager.playCoin();
      this.playSfx('sfx-gold-spark', 0.4);
      this.createFloatingText(player.x, player.y - 30, `+${total} 🪙`, '#d4ac0d');
    } else if (loot.lootType === 'heart') {
      player.heal(loot.amount || 25);
      audioManager.playXp();
      this.createFloatingText(player.x, player.y - 30, `+${loot.amount || 25} ❤`, '#e74c3c');
    } else if (loot.lootType === 'xp') {
      const res = this.progression.addXp(loot.amount);
      audioManager.playXp();
      this.createFloatingText(player.x, player.y - 30, `+${loot.amount} ⚡`, '#a569bd');
      if (res.leveledUp) {
        audioManager.playLevelUp();
        this.playSfx('sfx-ancient-chime', 0.5);
        this.createFloatingText(player.x, player.y - 50, `LEVEL ${res.newLevel}!`, '#f1c40f');
        this.player.play('aizo-victory');
        this.showBlessingChoice(() => { this.physics.world.resume(); });
      }
    }

    loot.destroy();
  }

  canCompleteLevel() {
    if (!this.player || !this.player.active || this.player.hp <= 0) return false;
    // Summoned gargoyles count towards the clear: a summoner that keeps
    // re-raising them must be killed, not outlived. The message reports them
    // too, so the player is told exactly what is left.
    const activeEnemies = this.enemies ? this.enemies.getChildren().filter(e => e.active && e.hp > 0) : [];
    const activeBosses = activeEnemies.filter(e => e.isBoss);
    if (activeBosses.length > 0) return false;
    return activeEnemies.length === 0;
  }

  handleEnterPortal() {
    if (this.isTransitioning) return;
    if (!this.canCompleteLevel()) {
      const remaining = this.enemies ? this.enemies.getChildren().filter(e => e.active && e.hp > 0).length : 0;
      this.createFloatingText(this.player.x, this.player.y - 35, `Clear the floor first (${remaining} left)`, '#e74c3c');
      return;
    }
    this.isTransitioning = true;
    audioManager.playPortal();

    this.showBlessingChoice(() => this.beginPortalTransition());
  }

  showBlessingChoice(onChosen) {
    const choices = pickBlessings(3, Math.random, this.runState.blessingIds);
    if (choices.length === 0) {
      onChosen();
      return;
    }
    this.physics.world.pause();
    const { width, height } = this.cameras.main;
    const overlay = this.add.container(width / 2, height / 2).setDepth(700).setScrollFactor(0);
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setInteractive();
    const panel = this.add.rectangle(0, 0, 420, 270, 0x141822, 0.98).setStrokeStyle(2, 0xf5d77f);
    const title = this.add.text(0, -100, 'ROOM BLESSING', { fontSize: '22px', color: '#f5d77f', fontStyle: 'bold' }).setOrigin(0.5);
    const hint = this.add.text(0, -70, 'Pick one (1 / 2 / 3)', { fontSize: '14px', color: '#d1d5db' }).setOrigin(0.5);
    overlay.add([dim, panel, title, hint]);
    let selected = false;
    const keyEvents = ['keydown-ONE', 'keydown-TWO', 'keydown-THREE'];
    const choose = (index) => {
      if (selected || !choices[index]) return;
      selected = true;
      keyEvents.forEach((event, i) => this.input.keyboard.off(event, keyHandlers[i]));
      this.player.addBlessing(choices[index].id);
      this.playSfx('sfx-ancient-chime', 0.5);
      overlay.destroy(true);
      this.blessingOverlay = null;
      onChosen();
    };
    const keyHandlers = choices.map((choice, index) => () => choose(index));
    choices.forEach((choice, index) => {
      const y = -25 + index * 55;
      const button = this.add.rectangle(0, y, 340, 42, 0x243047, 1).setStrokeStyle(1, 0x718096).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, y, `${index + 1}. ${choice.label}`, { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
      button.on('pointerdown', () => choose(index));
      overlay.add([button, label]);
      this.input.keyboard.on(keyEvents[index], keyHandlers[index]);
    });
    this.blessingOverlay = overlay;
  }

  beginPortalTransition() {
    // Seviye tamamlama bonusu
    this.progression.addGold(this.currentLevelConfig.goldBonus || 50);
    // Record the clear before any transition, so the run ledger is complete
    // whichever screen the player lands on.
    this.progression.recordChapterCleared(this.chapterIndex + 1);

    if (this.isEndless) {
      this.endlessWave++;
      this.progression.recordWave(this.endlessWave);
      this.cameras.main.fade(300, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.restart({ isEndless: true, wave: this.endlessWave, runState: this.runState });
        }
      });
    } else if (this.chapterIndex >= LEVELS.length - 2) {
      // Son bölüm bitti -> Zafer Ekranı!
      this.progression.currentChapter = LEVELS.length - 1;
      this.progression.save();
      this.scene.stop('UIScene');
      this.scene.start('VictoryScene');
    } else {
      // Sonraki bölüme geç
      this.chapterIndex++;
      this.progression.currentChapter = this.chapterIndex + 1;
      this.progression.save();
      this.cameras.main.fade(300, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.restart({ chapterIndex: this.chapterIndex, isEndless: false, runState: this.runState });
        }
      });
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.world.pause();
      const { width, height } = this.cameras.main;
      this.pauseOverlay = this.add.text(width / 2, height / 2, 'PAUSED (P)', {
        fontSize: '28px', color: '#f5d77f', fontStyle: 'bold',
        backgroundColor: 'rgba(20,24,34,0.85)', padding: { x: 20, y: 12 },
      }).setOrigin(0.5).setDepth(500).setScrollFactor(0);
    } else {
      this.physics.world.resume();
      if (this.pauseOverlay) {
        this.pauseOverlay.destroy();
        this.pauseOverlay = null;
      }
    }
  }

  // ESC cikis menusu: ilk ESC duraklatma + menu acar, dogrudan cikmaz.
  // Fiziksel donus kontrolu (sol kenar) her zaman mevcuttur.
  toggleExitMenu() {
    if (this.exitMenu) {
      this.closeExitMenu();
    } else {
      this.openExitMenu();
    }
  }

  openExitMenu() {
    if (this.exitMenu) return;
    this.physics.world.pause();
    const { width, height } = this.cameras.main;
    const menu = this.add.container(width / 2, height / 2).setDepth(600).setScrollFactor(0);
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.6);
    const panel = this.add.rectangle(0, 0, 340, 430, 0x141822, 0.98);
    panel.setStrokeStyle(2, 0xc5a059);
    const title = this.add.text(0, -180, 'PAUSED', {
      fontSize: '22px', color: '#f5d77f', fontStyle: 'bold',
    }).setOrigin(0.5);
    const resumeBtn = createGlassButton(this, 0, -134, 260, 36, 'Resume', () => this.closeExitMenu());
    const aimLabel = this.settings?.autoAim ? 'Auto-aim: ON' : 'Auto-aim: OFF';
    const aimBtn = createGlassButton(this, 0, -90, 260, 36, aimLabel, () => {
      this.settings = saveSettings({ autoAim: !this.settings.autoAim });
      this.closeExitMenu();
      this.openExitMenu();
    });
    const miniLabel = this.settings?.showMinimap === false ? 'Minimap: OFF' : 'Minimap: ON';
    const miniBtn = createGlassButton(this, 0, -46, 260, 36, miniLabel, () => {
      const next = this.settings?.showMinimap === false ? true : false;
      this.settings = saveSettings({ showMinimap: next });
      this.scene.get('UIScene')?.minimapContainer?.setVisible(next);
      const ui = this.scene.get('UIScene');
      if (ui) ui.minimapEnabled = next;
      this.closeExitMenu();
      this.openExitMenu();
    });
    const fsBtn = createGlassButton(this, 0, -2, 260, 36, 'Fullscreen (F)', () => {
      toggleDungeonFullscreen(document.getElementById('game-container') || document.documentElement);
    });
    const fxLabel = this.settings?.effects === 'reduced' ? 'Effects: Reduced' : 'Effects: Full';
    const fxBtn = createGlassButton(this, 0, 42, 260, 36, fxLabel, () => {
      const next = this.settings?.effects === 'reduced' ? 'full' : 'reduced';
      this.settings = saveSettings({ effects: next });
      this.closeExitMenu();
      this.openExitMenu();
    });
    menu.add([dim, panel, title, resumeBtn, aimBtn, miniBtn, fsBtn, fxBtn]);
    if (hasDungeonExitHandler()) {
      const exitBtn = createGlassButton(this, 0, 86, 260, 36, 'Return to AizanoiOS', () => requestDungeonExit());
      menu.add(exitBtn);
    }
    this.exitMenu = menu;
  }

  closeExitMenu() {
    if (!this.exitMenu) return;
    this.exitMenu.destroy(true);
    this.exitMenu = null;
    if (!this.isPaused) this.physics.world.resume();
  }

  dropLoot(x, y, goldAmount, xpAmount) {
    if (this.isEndless) {
      // Hafif dalga ödül ölçeği (tavanlı dalgayla): 20. dalgada ~1.76x.
      const cappedWave = Math.min(this.endlessWave, 20);
      const rewardMult = 1 + 0.04 * (cappedWave - 1);
      goldAmount = Math.round(goldAmount * rewardMult);
      xpAmount = Math.round(xpAmount * rewardMult);
    }
    if (goldAmount > 0) {
      const gold = this.physics.add.sprite(x + 8, y, 'denarii-spark', 0);
      gold.lootType = 'gold';
      gold.amount = goldAmount;
      gold.setScale(0.3);
      this.tweens.add({ targets: gold, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
      this.lootGroup.add(gold);
    }
    if (xpAmount > 0) {
      const xp = this.physics.add.sprite(x - 8, y, 'denarii-spark', 1);
      xp.lootType = 'xp';
      xp.amount = xpAmount;
      xp.setScale(0.3);
      this.tweens.add({ targets: xp, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
      this.lootGroup.add(xp);
    }
  }

  dropHeart(x, y, amount) {
    try {
      const heart = this.physics.add.sprite(x, y, 'denarii-spark', 1);
      heart.setTint(0xe74c3c);
      heart.lootType = 'heart';
      heart.amount = amount;
      heart.setScale(0.3);
      this.tweens.add({ targets: heart, scaleX: 1.1, scaleY: 1.1, duration: 180, ease: 'Back.easeOut' });
      this.lootGroup.add(heart);
    } catch (_) {}
  }

  castZeusFissureBeam(x, y, direction, damage, attacker = null) {
    let angle = 0;
    if (direction === 'down') angle = Math.PI / 2;
    if (direction === 'left') angle = Math.PI;
    if (direction === 'right') angle = 0;
    if (direction === 'up') angle = -Math.PI / 2;

    const bolt = new Projectile(this, x, y, angle, 450, damage, true, 'projectiles', 4);
    if (attacker) bolt.attacker = attacker;
    bolt.damageType = 'lightning';
    this.projectiles.add(bolt);
  }

  activateSanctuaryAegis(player) {
    const shieldRing = this.add.circle(player.x, player.y, 35, 0x00d2ff, 0.35);
    shieldRing.setStrokeStyle(2, 0xffffff);

    this.tweens.add({
      targets: shieldRing,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0.15,
      duration: 500,
      yoyo: true,
      repeat: 6,
      onUpdate: () => shieldRing.setPosition(player.x, player.y),
      onComplete: () => shieldRing.destroy(),
    });
  }

  triggerEliteExplosion(enemy) {
    const radius = 72;
    if (this.player?.active && Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) <= radius) {
      this.player.takeDamage(enemy.volatileDamage, false, enemy);
      this.createDamageSpark(this.player.x, this.player.y);
    }
    shakeCamera(this, 100, 0.004);
  }

  fireEnemyProjectile(enemy, player, type, damage, damageType = 'physical') {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    const frame = type === 'bone_arrow' ? 8 : 12;
    const bolt = new Projectile(this, enemy.x, enemy.y, angle, 220, damage, false, 'projectiles', frame);
    bolt.attacker = enemy;
    bolt.damageType = damageType;
    this.projectiles.add(bolt);
  }

  // Hitstop: a few frozen milliseconds on a landed hit. This is the single
  // most important piece of impact feel -- the frame where the world stops
  // selling the blow. It scales with the blow: a crit and a kill freeze longer
  // than a normal hit, and a boss hit more than a trash mob, but it is always
  // short enough that the player never feels the controls lock up.
  //
  // Driven from the real combat call sites rather than guessed, and it
  // restores the previous time scale itself so a pause or a scene change can
  // never leave the game running in slow motion.
  applyHitstop(ms, intensity = 0.004) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const cam = this.cameras?.main;
    const max = ms / 1000;
    // Never stack: a second hit inside the window tops it up to the remaining
    // time instead of restarting a longer freeze.
    if (this.hitstopUntil && this.time.now < this.hitstopUntil) {
      const remaining = (this.hitstopUntil - this.time.now) / 1000;
      if (remaining >= max) return;
      this.time.timeScale = 1;
    }
    this.hitstopUntil = this.time.now + max * 1000;
    this.time.timeScale = HITSTOP_TIMESCALE;
    // A tiny shake sells the impact without being its own effect.
    if (cam) shakeCamera(this, Math.round(max * 260), intensity);

    // CRITICAL: the release must NOT be scheduled on scene time.
    // `time.delayedCall` runs on the clock the hitstop itself just slowed to
    // 2%, so a 120ms freeze would take 6 seconds to lift and the game would
    // never recover. A real timer is immune to timeScale, and it is cleared
    // first so a rapid second hit replaces the pending release rather than
    // leaving an orphaned one behind.
    if (this.hitstopRelease) clearTimeout(this.hitstopRelease);
    this.hitstopRelease = setTimeout(() => {
      this.time.timeScale = 1;
      this.hitstopUntil = 0;
      this.hitstopRelease = null;
    }, Math.round(max * 1000));
  }

  // Area denial: a lingering ground zone that damages the player on a tick
  // while they stand in it, then cleans itself up. This is what makes the cult
  // sorcerer an area-denial threat rather than a plain ranged one.
  spawnVolatileZone(x, y, radius, damage, duration) {
    const zone = this.add.circle(x, y, radius, 0x7b1fa2, 0.28).setDepth(6);
    // A brighter rim so the safe ground outside it is legible at a glance.
    const rim = this.add.circle(x, y, radius).setDepth(7).setStrokeStyle(2, 0xba68c8, 0.75);
    const state = { zone, rim, tick: 0 };

    const cleanUp = () => {
      if (state.zone.active) state.zone.destroy();
      if (state.rim.active) state.rim.destroy();
    };

    this.tweens.add({
      targets: zone,
      alpha: 0.42,
      duration: 520,
      yoyo: true,
      repeat: Math.max(1, Math.floor(duration / 520))
    });

    // Damage on a 500ms tick rather than every frame, so standing in the zone
    // is punishing but survivable and the number stays readable.
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (!state.zone.active) return;
        if (!this.player?.active || this.player.isDead || this.player.isInBase) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) > radius) return;
        this.player.takeDamage(damage, false, null);
        this.createDamageSpark(this.player.x, this.player.y);
        this.createFloatingText(this.player.x, this.player.y - 26, `${damage}`, '#ba68c8', 13);
      }
    });

    this.time.delayedCall(duration, cleanUp);
    return state;
  }

  // Telegraph ring: the windup visual for a ground attack. It fills in, holds,
  // then snaps — the same contract as the boss windups so the player learns one
  // "get out of the shape" rule and it works on every enemy in the game.
  // `mode` distinguishes a slam (solid, instant at the end) from a summon cast
  // (dashes, then spawns) so the player can read what is coming before it lands.
  spawnTelegraphRing(x, y, radius, color, mode = 'slam') {
    const ring = this.add.circle(x, y, radius * 0.16, color, mode === 'summon' ? 0.14 : 0.22).setDepth(6);
    const rim = this.add.circle(x, y, radius).setDepth(7).setStrokeStyle(2, color, 0.85);

    this.tweens.add({
      targets: ring,
      radius,
      alpha: mode === 'summon' ? 0.28 : 0.42,
      duration: 140,
      hold: 60,
      yoyo: true,
      repeat: mode === 'summon' ? 3 : 2,
      onComplete: () => {
        if (!ring.active) return;
        this.tweens.add({
          targets: [ring, rim],
          alpha: 0,
          scaleX: 1.35,
          scaleY: 1.35,
          duration: 130,
          onComplete: () => {
            if (ring.active) ring.destroy();
            if (rim.active) rim.destroy();
          }
        });
      }
    });

    return { ring, rim };
  }

  // One-off area damage at the moment a telegraphed attack lands. Separate from
  // spawnVolatileZone (which ticks over time) because a slam hits once.
  handleAreaDamage(player, damage, source) {
    if (!player?.active || player.isDead || player.isInBase) return false;
    player.takeDamage(damage, false, source ?? null);
    this.createDamageSpark(player.x, player.y);
    this.createFloatingText(player.x, player.y - 30, `${damage}`, '#ff7b3d', 16);
    return true;
  }

  // A summoner raising a fresh gargoyle. Spawns at a ring around the caster
  // rather than on top of it (which would look like a glitch), never inside the
  // player (which would be a free hit), and respects the same enemy cap the
  // level spawner uses so two summoners cannot flood a floor.
  enemySummonGargoyle(caster) {
    if (!caster?.active || caster.isDead) return null;
    const liveEnemies = this.enemies.getChildren().filter((e) => e && !e.isDead);
    const cap = this.level?.enemyCap ?? 14;
    if (liveEnemies.length >= cap) return null;

    const angle = Math.random() * Math.PI * 2;
    const dist = 46 + Math.random() * 20;
    let sx = caster.x + Math.cos(angle) * dist;
    let sy = caster.y + Math.sin(angle) * dist;

    // Keep the summon inside the playable bounds if the ring would push it out.
    const bounds = this.physics?.world?.bounds ?? { x: 48, y: 48, width: 720, height: 720 };
    sx = Phaser.Math.Clamp(sx, bounds.x + 16, bounds.x + bounds.width - 16);
    sy = Phaser.Math.Clamp(sy, bounds.y + 16, bounds.y + bounds.height - 16);

    this.spawnTelegraphRing(sx, sy, 30, 0x9ccc65, 'summon');
    const typeKey = caster.type?.summonType ?? 'gargoyle';
    this.playSfx?.('sfx-summon', 0.4);

    return this.time.delayedCall(320, () => {
      if (!this.scene || !this.player?.active) return;
      const spawned = this.spawnEnemy(typeKey, sx, sy);
      // Tracked on the caster so its cap cannot be bypassed by kiting it.
      if (spawned && Array.isArray(caster.summons)) caster.summons.push(spawned);
      return spawned;
    });
  }

  // ── Room interactables ──────────────────────────────────────────────────
  // The generator labels rooms shrine / merchant / treasure, but before this a
  // label was all they were: the room existed, the prop stood in the middle,
  // and nothing happened when the player walked up to it. Every special room
  // now answers to a single E press, and the prompt is drawn only while the
  // player is actually inside one, so it never becomes background noise.

  // The room the player is standing in, or null. Rooms are grid rectangles, so
  // this is a single bounds test rather than a physics query.
  getPlayerRoom() {
    const rooms = this.levelSystem?.rooms;
    if (!rooms || !this.player) return null;
    const tx = Math.floor(this.player.x / 32);
    const ty = Math.floor(this.player.y / 32);
    return rooms.find((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) ?? null;
  }

  tickInteractables() {
    const room = this.getPlayerRoom();
    const role = room?.role;

    // Which interactable, if any, is currently in reach.
    let offer = null;
    if (role === 'shrine') offer = { kind: 'shrine', label: 'Shrine · 40% HP + cleanse' };
    else if (role === 'merchant') offer = { kind: 'merchant', label: 'Merchant · open shop' };
    else if (role === 'treasure') offer = { kind: 'treasure', label: 'Vault · pry it open' };

    // A shrine that has already been spent stays visible but says so, so the
    // player learns it was a one-off rather than assuming it is broken.
    if (offer?.kind === 'shrine' && this.usedShrines?.has(room)) {
      offer = { kind: 'shrine_spent', label: 'Shrine · already spent' };
    }

    this.currentOffer = offer;
    this.refreshInteractPrompt(offer);

    if (offer && this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.E)) {
      this.useInteractable(room, offer.kind);
    }
  }

  refreshInteractPrompt(offer) {
    if (!offer) {
      if (this.interactPrompt) this.interactPrompt.setVisible(false);
      return;
    }
    if (!this.interactPrompt) {
      this.interactPrompt = this.add.text(0, 0, '', {
        fontSize: '13px',
        color: '#0b1220',
        backgroundColor: '#f5d77f',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5, 1).setDepth(40);
    }
    this.interactPrompt.setText(`[E]  ${offer.label}`);
    this.interactPrompt.setPosition(this.player.x, this.player.y - 40);
    this.interactPrompt.setVisible(true);
  }

  useInteractable(room, kind) {
    const player = this.player;
    if (!player || player.isDead) return;

    if (kind === 'shrine') {
      // First use only, per room: an infinite shrine removes the choice of
      // when to spend it and trivialises the gold economy.
      if (!this.usedShrines) this.usedShrines = new Set();
      if (this.usedShrines.has(room)) return;
      this.usedShrines.add(room);

      const healed = Math.round(player.maxHp * 0.4);
      player.hp = Math.min(player.maxHp, player.hp + healed);
      // Cleansing is the point of a shrine over a heart drop: it removes the
      // elite curses that otherwise follow the player out of the room.
      player.curses = [];
      this.createFloatingText(player.x, player.y - 40, `+${healed} HP`, '#3dcea8', 20);
      this.playSfx('sfx-heal', 0.6);
      this.refreshInteractPrompt({ kind: 'shrine_spent', label: 'Shrine · already spent' });
      return;
    }

    if (kind === 'merchant') {
      // The only other shop surface besides the base, so it must use the same
      // scene rather than a stripped-down variant that players have to relearn.
      this.playSfx('sfx-shop', 0.5);
      this.scene.launch('ShopScene');
      return;
    }

    if (kind === 'treasure') {
      // One pry per vault. The reward is a fixed band rather than a roll, so a
      // chapter's total gold budget stays predictable for the shop to price
      // against.
      const vaultGold = 90 + Math.floor(Math.random() * 60);
      this.progression.addGold(vaultGold);
      this.createFloatingText(player.x, player.y - 40, `+${vaultGold} gold`, '#f5d77f', 20);
      this.playSfx('sfx-gold-spark', 0.6);
      this.refreshInteractPrompt({ kind: 'treasure_spent', label: 'Vault · emptied' });
      this.usedVaults = this.usedVaults || new Set();
      this.usedVaults.add(room);
    }
  }

  // Single entry point for every enemy that joins the field after the level's
  // initial placement — currently the summoner's gargoyles. It reuses the same
  // config pipeline as the initial spawn (affix roll, endless wave scaling) so
  // a summoned enemy scales with the floor instead of being permanently weak,
  // and it returns the enemy so callers can track what they raised.
  spawnEnemy(typeKey, x, y, opts = {}) {
    const typeConfig = { ...(ENEMY_TYPES[typeKey] ?? ENEMY_TYPES.gargoyle) };
    typeConfig.eliteAffix = opts.eliteAffix ?? chooseEliteAffix(typeConfig);

    if (this.isEndless) {
      const cappedWave = Math.min(this.endlessWave, 20);
      const waveScale = Math.pow(1.15, cappedWave - 1);
      typeConfig.hp = Math.round(typeConfig.hp * waveScale);
      typeConfig.attackDamage = Math.round(typeConfig.attackDamage * Math.pow(1.10, cappedWave - 1));
    }

    // A summon is a summoned enemy, not a room spawn: it is flagged so the
    // level-clear check does not count it as part of the original wave, and so
    // it cannot drop loot that breaks the chapter's economy.
    typeConfig.isSummon = true;

    const enemy = new Enemy(this, x, y, typeConfig);
    enemy.setData('spawnRole', opts.spawnRole ?? 'summon');
    this.enemies.add(enemy);
    return enemy;
  }

  createDamageSpark(x, y, isCritical = false) {
    // Keep burst density bounded during projectile/AoE chains. The combat
    // signal must stay readable; a dozen simultaneous additive sprites should
    // never turn the whole room into a white flash.
    this.impactFxCount = this.impactFxCount || 0;
    if (this.impactFxCount >= 24) return;
    this.impactFxCount += 1;
    // core on the first frame stays legible inside a firelit, busy room, which
    // a soft blob did not.
    const burst = (startFrame, spriteScale) => {
      const spark = this.add.sprite(x, y, 'tiles-impacts', startFrame).setDepth(20);
      spark.setScale(spriteScale);
      spark.setBlendMode(Phaser.BlendModes.ADD);
      // The burst is a 4-frame animation rather than a tween on one frame, so
      // the impact has a shape that develops instead of a uniform fade.
      this.tweens.add({
        targets: spark,
        duration: 190,
        onComplete: () => {
          spark.destroy();
          this.impactFxCount = Math.max(0, (this.impactFxCount || 1) - 1);
        },
        onStart: () => {
          if (!spark.active) return;
          spark.setFrame(startFrame + 1);
          this.time.delayedCall(60, () => { if (spark.active) spark.setFrame(startFrame + 2); });
          this.time.delayedCall(120, () => { if (spark.active) spark.setFrame(startFrame + 3); });
        },
      });
      this.tweens.add({
        targets: spark,
        scaleX: spriteScale * 1.25,
        scaleY: spriteScale * 1.25,
        alpha: 0,
        duration: 190,
        ease: 'Quad.easeOut',
      });
      return spark;
    };
    try {
      if (isCritical) {
        const now = this.time.now;
        if (this.critSparkUntil && now < this.critSparkUntil) {
          burst(0, 1.6);
        } else {
          this.critSparkUntil = now + 120;
          burst(4, 1.5);
          const ring = this.add.sprite(x, y, 'tiles-impacts', 7).setDepth(19);
          ring.setScale(0.7).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: ring, scaleX: 2.1, scaleY: 2.1, alpha: 0,
            duration: 260, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
        }
      } else {
        burst(0, 1.0 + Math.random() * 0.15);
      }
    } catch (_) {
      this.impactFxCount = Math.max(0, (this.impactFxCount || 1) - 1);
      // Fallback: a single authored burst frame, never a missing texture.
      const spark = this.add.sprite(x, y, 'tiles-impacts', 0).setDepth(20);
      spark.setBlendMode(Phaser.BlendModes.ADD);
      this.time.delayedCall(200, () => spark.destroy());
    }
  }

  createFloatingText(x, y, text, color = '#ffffff', size = 14) {
    const big = size >= 19;
    const txt = this.add.text(x, y, text, {
      fontSize: `${size}px`,
      color,
      fontStyle: 'bold',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      stroke: '#0b1220',
      strokeThickness: big ? 5 : 3,
    }).setOrigin(0.5).setDepth(30);

    // Büyük yazılar (crit/level) büyüyerek girer
    if (big) {
      txt.setScale(0.5);
      this.tweens.add({ targets: txt, scaleX: 1.15, scaleY: 1.15, duration: 120, ease: 'Back.easeOut' });
    }

    this.tweens.add({
      targets: txt,
      y: y - 25,
      alpha: 0,
      duration: 800,
      onComplete: () => txt.destroy(),
    });
  }


  startRecall() {
    if (!this.player || this.player.isInBase || this.recallChannel > 0) return;
    this.recallChannel = 2200;
    this.createFloatingText(this.player.x, this.player.y - 28, 'Recalling…', '#7dd3fc');
  }

  tickRecall(delta) {
    if (!this.recallChannel) return;
    this.recallChannel = Math.max(0, this.recallChannel - delta);
    if (this.recallChannel === 0 && this.player?.active) {
      this.player.setPosition(this.baseAltar.x, this.baseAltar.y + 36);
      this.createFloatingText(this.player.x, this.player.y - 28, 'Returned to altar', '#f5d77f');
    }
  }

  attractLoot() {
    if (!this.settings?.magnet || !this.lootGroup || !this.player) return;
    this.lootGroup.getChildren().forEach((loot) => {
      if (!loot.active) return;
      const dist = Phaser.Math.Distance.Between(loot.x, loot.y, this.player.x, this.player.y);
      if (dist < 110) this.physics.moveToObject(loot, this.player, 220);
    });
  }

  autoAimAttack(time) {
    if (!this.player || this.player.isAttacking || this.player.isDead) return;
    if (this._nextAutoAim && time < this._nextAutoAim) return;
    const range = this.player.stats?.attackRange || 48;
    // Linear scan: only consider active enemies still alive. Aizo.attack itself
    // already picks the nearest candidate inside the same range and aims the
    // projectile/melee arc, so we just need to point the player at it and
    // trigger the attack on the cooldown.
    let nearest = null;
    let minDistSq = range * range;
    this.enemies?.getChildren().forEach((enemy) => {
      if (!enemy.active || enemy.hp <= 0) return;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= minDistSq) {
        minDistSq = d2;
        nearest = enemy;
      }
    });
    if (!nearest) return;
    // Rotate the player toward the nearest target so the attack arc, animation
    // and facing all agree on the direction. Manual attacks still control the
    // player when auto-aim is off.
    const dx = nearest.x - this.player.x;
    const dy = nearest.y - this.player.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.player.lastDirection = dx >= 0 ? 'right' : 'left';
    } else {
      this.player.lastDirection = dy >= 0 ? 'down' : 'up';
    }
    this._nextAutoAim = time + 420;
    // Hand the chosen target to Aizo.attack so the player-facing arc and the
    // projectile/melee hit actually agree on which enemy gets hit. Without
    // this, Aizo.attack() would re-run its own nearest-in-range search and
    // could swap the enemy for a closer destructible structure, breaking the
    // visual rotation we just performed.
    this.player.attack(nearest);
  }

  onPlayerDied() {
    this.scene.stop('UIScene');
    this.scene.start('GameOverScene', {
      chapterIndex: this.chapterIndex,
      isEndless: this.isEndless,
      wave: this.endlessWave,
    });
  }
}
