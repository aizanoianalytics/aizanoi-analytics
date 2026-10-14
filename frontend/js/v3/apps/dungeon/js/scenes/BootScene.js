// js/scenes/BootScene.js
// Varlık Ön-Yükleme ve Animasyon Tanımları

import { OPTIONAL_TOUCH_FILES, OPTIONAL_AUDIO_FILES } from '../data/optional-assets.js';

export { OPTIONAL_TOUCH_FILES, OPTIONAL_AUDIO_FILES };

/**
 * Queue enhancement assets on a scene that stays alive (MenuScene). Skips
 * keys already in the cache so a repeated menu visit never double-queues.
 * Fail-open: missing files or a dead loader leave synthesized audio running.
 */
export function queueOptionalAssets(scene, assetBase) {
  if (!scene || !assetBase) return false;
  setTimeout(() => {
    try {
      const loader = scene.load;
      if (!loader || !scene.sys || !scene.sys.isActive()) return false;
      let queued = false;
      for (const [key, rel] of OPTIONAL_TOUCH_FILES) {
        if (!scene.textures?.exists?.(key)) {
          loader.image(key, `${assetBase}${rel}`);
          queued = true;
        }
      }
      for (const [key, rel] of OPTIONAL_AUDIO_FILES) {
        if (!scene.cache?.audio?.exists?.(key)) {
          loader.audio(key, `${assetBase}${rel}`);
          queued = true;
        }
      }
      if (queued) loader.start();
      return queued;
    } catch (_) {
      return false;
    }
  }, 1500);
  return true;
}

export function dungeonAssetBase() {
  return new URL('../../assets/', import.meta.url).href;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Loading Bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBox = this.add.graphics();
    const progressBar = this.add.graphics();
    progressBox.fillStyle(0x1e293b, 0.8);
    progressBox.fillRoundedRect(width / 2 - 160, height / 2 - 15, 320, 30, 8);

    const titleText = this.add.text(width / 2, height / 2 - 45, 'AIZANOI DUNGEON', {
      fontSize: '22px',
      color: '#c5a059',
      fontStyle: 'bold',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }).setOrigin(0.5);

    const loadingText = this.add.text(width / 2, height / 2 + 35, 'Loading the temple crypts...', {
      fontSize: '13px',
      color: '#94a3b8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      progressBar.clear();
      progressBar.fillStyle(0xd4ac0d, 1);
      progressBar.fillRoundedRect(width / 2 - 155, height / 2 - 10, 310 * value, 20, 6);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      titleText.destroy();
    });

    const ASSET_BASE = new URL('../../assets/', import.meta.url).href;

    // 1. Spritesheets
    this.load.spritesheet('aizo', `${ASSET_BASE}sprites/aizo.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('enemies', `${ASSET_BASE}sprites/enemies.png`, { frameWidth: 64, frameHeight: 64 });
    // The three later-chapter archetypes get their own sheets. They live on the
    // existing 'enemies' sheet's palette and 64px/8-col grid so a chapter that
    // mixes old and new enemies never visibly swaps art style mid-fight.
    this.load.spritesheet('enemies-summoner', `${ASSET_BASE}sprites/enemies-summoner.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('enemies-heavy', `${ASSET_BASE}sprites/enemies-heavy.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('enemies-flanker', `${ASSET_BASE}sprites/enemies-flanker.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('bosses', `${ASSET_BASE}sprites/bosses.png`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('structures', `${ASSET_BASE}sprites/structures.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('projectiles', `${ASSET_BASE}sprites/projectiles.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('effects', `${ASSET_BASE}sprites/effects.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('portal', `${ASSET_BASE}sprites/portal.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('denarii-spark', `${ASSET_BASE}sprites/denarii-spark.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('items-weapons', `${ASSET_BASE}sprites/items-weapons.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('items-armor', `${ASSET_BASE}sprites/items-armor.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('items-accessory', `${ASSET_BASE}sprites/items-accessory.png`, { frameWidth: 32, frameHeight: 32 });

    // 2. Tilesets
    this.load.image('tiles-floor', `${ASSET_BASE}tilesets/aizanoi-floor.png`);
    this.load.image('tiles-walls', `${ASSET_BASE}tilesets/aizanoi-walls.png`);
    this.load.spritesheet('tiles-decor', `${ASSET_BASE}tilesets/aizanoi-decor.png`, { frameWidth: 32, frameHeight: 32 });
    // Light sources: frames 0-3 are the brazier flicker, 4-6 the wall sconce.
    this.load.spritesheet('tiles-lights', `${ASSET_BASE}tilesets/aizanoi-lights.png`, { frameWidth: 32, frameHeight: 32 });

    // 3. UI Assets
    this.load.image('panel-bg', `${ASSET_BASE}ui/panel-bg.png`);
    this.load.image('button-normal', `${ASSET_BASE}ui/button-normal.png`);
    this.load.image('button-hover', `${ASSET_BASE}ui/button-hover.png`);
    this.load.image('button-pressed', `${ASSET_BASE}ui/button-pressed.png`);
    this.load.image('health-bar', `${ASSET_BASE}ui/health-bar.png`);
    this.load.image('spark-bar', `${ASSET_BASE}ui/spark-bar.png`);
    this.load.image('slot-empty', `${ASSET_BASE}ui/slot-empty.png`);
    this.load.image('slot-filled', `${ASSET_BASE}ui/slot-filled.png`);
    // Impact sheet: 0..3 normal hit burst, 4..6 critical slash, 7 shock ring.
    this.load.spritesheet('tiles-impacts', `${ASSET_BASE}tilesets/aizanoi-impacts.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.image('minimap-frame', `${ASSET_BASE}ui/minimap-frame.png`);
    this.load.image('coin-icon', `${ASSET_BASE}ui/coin-icon.png`);
    this.load.image('spark-icon', `${ASSET_BASE}ui/spark-icon.png`);
    this.load.image('skill-node-available', `${ASSET_BASE}ui/skill-node-available.png`);
    this.load.image('skill-node-locked', `${ASSET_BASE}ui/skill-node-locked.png`);
    this.load.image('skill-node-unlocked', `${ASSET_BASE}ui/skill-node-unlocked.png`);

    // 4. Touch Assets
    // Touch controls are created only on touch devices. Keep these cosmetic
    // sprites out of the critical desktop boot batch: a browser can leave the
    // last DOM image requests pending indefinitely, which used to freeze the
    // entire loader at 82% for every player, including desktop players.
    // `loadOptionalAudio()` also queues them after the menu is visible.
  }

  /**
   * Deferred, non-blocking loading for touch controls and audio.
   * These assets are enhancements and must never block the first playable frame.
   *
   * NOTE: call this from MenuScene (which stays active), not from BootScene:
   * BootScene stops ~80ms after create(), so a guard on BootScene liveness
   * aborts the queue and touch/audio enhancement assets never load.
   */
  loadOptionalAudio(assetBase) {
    queueOptionalAssets(this, assetBase);
  }

  create() {
    this.createAnimations();
    // Queue the handoff one tick later. Phaser's loader can finish its final
    // DOM image callback while the scene manager is still inside `create()`;
    // changing scene state synchronously there can be ignored by the manager.
    const handoff = () => {
      if (!this.game?.scene) return;
      const manager = this.game.scene;
      if (manager.isActive('MenuScene')) return;
      try { manager.stop('BootScene'); } catch (_) {}
      try { manager.run('MenuScene'); } catch (_) {}
    };
    // Retry once after Phaser commits the loader's final frame. Some browsers
    // ignore the first scene-manager mutation while create() is unwinding.
    setTimeout(handoff, 0);
    setTimeout(handoff, 80);
    // Optional assets are queued by MenuScene (which stays active). Queuing
    // them here would abort: BootScene stops ~80ms after create().
  }

  createAnimations() {
    // Aizo Animasyonları (4 cols x 16 rows)
    // Idle (Rows 0-3: Down, Left, Right, Up)
    this.anims.create({ key: 'aizo-idle-down', frames: this.anims.generateFrameNumbers('aizo', { start: 0, end: 3 }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'aizo-idle-left', frames: this.anims.generateFrameNumbers('aizo', { start: 4, end: 7 }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'aizo-idle-right', frames: this.anims.generateFrameNumbers('aizo', { start: 8, end: 11 }), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'aizo-idle-up', frames: this.anims.generateFrameNumbers('aizo', { start: 12, end: 15 }), frameRate: 5, repeat: -1 });

    // Walk / Glide (Rows 4-7: Down, Left, Right, Up)
    this.anims.create({ key: 'aizo-walk-down', frames: this.anims.generateFrameNumbers('aizo', { start: 16, end: 19 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'aizo-walk-left', frames: this.anims.generateFrameNumbers('aizo', { start: 20, end: 23 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'aizo-walk-right', frames: this.anims.generateFrameNumbers('aizo', { start: 24, end: 27 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'aizo-walk-up', frames: this.anims.generateFrameNumbers('aizo', { start: 28, end: 31 }), frameRate: 8, repeat: -1 });

    // Attack (Rows 8-11)
    this.anims.create({ key: 'aizo-attack-down', frames: this.anims.generateFrameNumbers('aizo', { start: 32, end: 35 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'aizo-attack-left', frames: this.anims.generateFrameNumbers('aizo', { start: 36, end: 39 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'aizo-attack-right', frames: this.anims.generateFrameNumbers('aizo', { start: 40, end: 43 }), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'aizo-attack-up', frames: this.anims.generateFrameNumbers('aizo', { start: 44, end: 47 }), frameRate: 12, repeat: 0 });

    // Special (Rows 12-15)
    this.anims.create({ key: 'aizo-hurt', frames: this.anims.generateFrameNumbers('aizo', { start: 48, end: 51 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: 'aizo-death', frames: this.anims.generateFrameNumbers('aizo', { start: 52, end: 55 }), frameRate: 4, repeat: 0 });
    this.anims.create({ key: 'aizo-respawn', frames: this.anims.generateFrameNumbers('aizo', { start: 56, end: 59 }), frameRate: 8, repeat: 0 });
    this.anims.create({ key: 'aizo-victory', frames: this.anims.generateFrameNumbers('aizo', { start: 60, end: 63 }), frameRate: 6, repeat: -1 });

    // Portal animasyonu (Active: Row 1 frames 6 to 11)
    this.anims.create({ key: 'portal-active', frames: this.anims.generateFrameNumbers('portal', { start: 6, end: 11 }), frameRate: 8, repeat: -1 });
  }
}
