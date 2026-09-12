// js/scenes/BootScene.js
// Varlık Ön-Yükleme ve Animasyon Tanımları

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
    this.load.image('tiles-decor', `${ASSET_BASE}tilesets/aizanoi-decor.png`);

    // 3. UI Assets
    this.load.image('panel-bg', `${ASSET_BASE}ui/panel-bg.png`);
    this.load.image('button-normal', `${ASSET_BASE}ui/button-normal.png`);
    this.load.image('button-hover', `${ASSET_BASE}ui/button-hover.png`);
    this.load.image('button-pressed', `${ASSET_BASE}ui/button-pressed.png`);
    this.load.image('health-bar', `${ASSET_BASE}ui/health-bar.png`);
    this.load.image('spark-bar', `${ASSET_BASE}ui/spark-bar.png`);
    this.load.image('slot-empty', `${ASSET_BASE}ui/slot-empty.png`);
    this.load.image('slot-filled', `${ASSET_BASE}ui/slot-filled.png`);
    this.load.image('minimap-frame', `${ASSET_BASE}ui/minimap-frame.png`);
    this.load.image('coin-icon', `${ASSET_BASE}ui/coin-icon.png`);
    this.load.image('spark-icon', `${ASSET_BASE}ui/spark-icon.png`);
    this.load.image('skill-node-available', `${ASSET_BASE}ui/skill-node-available.png`);
    this.load.image('skill-node-locked', `${ASSET_BASE}ui/skill-node-locked.png`);
    this.load.image('skill-node-unlocked', `${ASSET_BASE}ui/skill-node-unlocked.png`);

    // 4. Touch Assets
    this.load.image('touch-joystick-base', `${ASSET_BASE}ui/touch-joystick-base.png`);
    this.load.image('touch-joystick-thumb', `${ASSET_BASE}ui/touch-joystick-thumb.png`);
    this.load.image('touch-btn-attack', `${ASSET_BASE}ui/touch-btn-attack.png`);
    this.load.image('touch-btn-skill1', `${ASSET_BASE}ui/touch-btn-skill1.png`);
    this.load.image('touch-btn-skill2', `${ASSET_BASE}ui/touch-btn-skill2.png`);
    this.load.image('touch-btn-utility', `${ASSET_BASE}ui/touch-btn-utility.png`);
    this.load.image('touch-btn-interact', `${ASSET_BASE}ui/touch-btn-interact.png`);
    this.load.image('touch-btn-menu', `${ASSET_BASE}ui/touch-btn-menu.png`);

    // 5. Ses Varliklari (Audio Assets)
    this.load.audio('ambient-cave', `${ASSET_BASE}audio/ambient_cave_loop.wav`);
    this.load.audio('sfx-shadow-dash', `${ASSET_BASE}audio/shadow_dash.wav`);
    this.load.audio('sfx-boss-warning', `${ASSET_BASE}audio/boss_slam_warning.wav`);
    this.load.audio('sfx-ancient-chime', `${ASSET_BASE}audio/ancient_chime.wav`);
    this.load.audio('sfx-gold-spark', `${ASSET_BASE}audio/gold_spark.wav`);
  }

  create() {
    this.createAnimations();
    this.scene.start('MenuScene');
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
