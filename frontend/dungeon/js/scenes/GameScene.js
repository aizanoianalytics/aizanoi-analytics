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
import { audioManager } from '../systems/AudioManager.js';
import { LEVELS } from '../data/levels.js';
import { ENEMY_TYPES } from '../data/enemies.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init(data) {
    this.chapterIndex = data.chapterIndex || 0;
    this.isEndless = data.isEndless || false;
    this.endlessWave = data.wave || 1;
  }

  create() {
    // 1. Sistemleri başlat
    this.progression = new ProgressionSystem();
    this.inventory = new InventorySystem(this.progression);

    // Seviye Konfigürasyonu
    if (this.isEndless) {
      this.currentLevelConfig = LEVELS[10]; // Endless config
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

    // 5. Aizo'yu Base Alanında Doğur
    const spawnX = this.mapData.baseArea.x * 32 + 16;
    const spawnY = this.mapData.baseArea.y * 32 + 16;
    this.player = new Aizo(this, spawnX, spawnY, this.inventory, this.progression);

    // 6. Base Sunağı ve Portalı Yerleştir
    this.baseAltar = new Structure(this, spawnX, spawnY, 'zeus_altar');
    this.structures.add(this.baseAltar);

    const portalX = this.mapData.portalPos.x * 32 + 16;
    const portalY = this.mapData.portalPos.y * 32 + 16;
    this.exitPortal = new Portal(this, portalX, portalY);

    // 7. Düşmanları ve Yapıları Yerleştir
    this.spawnLevelEntities();

    // 8. Kamera Takibi
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);
    this.physics.world.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);

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
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,R,E,I,TAB');

    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown() && pointer.x > 120 && pointer.x < this.scale.width - 120) {
        this.player.attack();
      }
    });

    // 11. Dokunmatik Kontroller
    this.touchControls = new TouchControls(this);

    // 12. Paralel HUD Sahnesini Başlat
    this.scene.launch('UIScene', { gameScene: this });

    // 13. Temizlik (Memory Leak Önleme)
    this.events.once('shutdown', () => {
      if (this.touchControls) {
        this.touchControls.destroy();
        this.touchControls = null;
      }
      this.input.removeAllListeners();
    });
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

    this.wallLayer.setCollisionByExclusion([-1]);
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
      count = Math.floor(15 * Math.pow(1.12, this.endlessWave - 1));
    }

    for (let i = 0; i < count; i++) {
      const pos = this.levelSystem.getRandomWalkablePosition(true);
      const typeKey = enemyTypes[i % enemyTypes.length];
      const typeConfig = { ...ENEMY_TYPES[typeKey] };

      if (this.isEndless) {
        const waveScale = Math.pow(1.15, this.endlessWave - 1);
        typeConfig.hp = Math.round(typeConfig.hp * waveScale);
        typeConfig.attackDamage = Math.round(typeConfig.attackDamage * Math.pow(1.10, this.endlessWave - 1));
      }

      const enemy = new Enemy(this, pos.x, pos.y, typeConfig);
      this.enemies.add(enemy);
    }

    // 2. Yapıları Doğurma (Kuleler, Çatlaklar, Yozlaşmış Sunaklar)
    if (config.structures) {
      const { spawnPoints = 0, towers = 0, enemyBases = 0 } = config.structures;

      for (let s = 0; s < spawnPoints; s++) {
        const pos = this.levelSystem.getRandomWalkablePosition(true);
        const fissure = new Structure(this, pos.x, pos.y, 'spawn_fissure');
        this.structures.add(fissure);
      }

      for (let t = 0; t < towers; t++) {
        const pos = this.levelSystem.getRandomWalkablePosition(true);
        const tower = new Structure(this, pos.x, pos.y, 'defense_tower');
        tower.lastFire = 0;
        this.structures.add(tower);
      }

      for (let b = 0; b < enemyBases; b++) {
        const pos = this.levelSystem.getRandomWalkablePosition(true);
        const shrine = new Structure(this, pos.x, pos.y, 'corrupted_shrine');
        this.structures.add(shrine);
      }
    }

    // 3. Boss Doğurma (Eğer varsa)
    if (config.boss) {
      const bossConfig = ENEMY_TYPES[config.boss];
      if (bossConfig) {
        const bossPos = this.levelSystem.getRandomWalkablePosition(true);
        const boss = new Enemy(this, bossPos.x, bossPos.y, bossConfig);
        this.enemies.add(boss);
      }
    }
  }

  update(time, delta) {
    if (this.player && this.player.active) {
      this.player.update(time, delta);

      // Base güvenli alan kontrolü
      const distToBase = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.baseAltar.x, this.baseAltar.y
      );
      this.player.isInBase = distToBase < 80;

      // Space ile saldırı
      if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
        this.player.attack();
      }

      // Klavye yetenek kısayolları
      if (this.wasd) {
        if (Phaser.Input.Keyboard.JustDown(this.wasd.Q)) this.player.castSkill1();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.R)) this.player.castSkill2();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.I) || Phaser.Input.Keyboard.JustDown(this.wasd.TAB)) {
          this.scene.launch('InventoryScene');
        }
        if (Phaser.Input.Keyboard.JustDown(this.wasd.E)) {
          if (this.player.isInBase) this.scene.launch('ShopScene');
        }
      }
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

    enemy.takeDamage(proj.damage);
    this.createDamageSpark(enemy.x, enemy.y);
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

    player.takeDamage(proj.damage);
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
      this.createFloatingText(player.x, player.y - 30, `+${total} 🪙`, '#d4ac0d');
    } else if (loot.lootType === 'xp') {
      const res = this.progression.addXp(loot.amount);
      audioManager.playXp();
      this.createFloatingText(player.x, player.y - 30, `+${loot.amount} ⚡`, '#a569bd');
      if (res.leveledUp) {
        audioManager.playLevelUp();
        this.createFloatingText(player.x, player.y - 50, `SEVİYE ${res.newLevel}!`, '#f1c40f');
        this.player.play('aizo-victory');
      }
    }

    loot.destroy();
  }

  handleEnterPortal() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    audioManager.playPortal();

    // Seviye tamamlama bonusu
    this.progression.addGold(this.currentLevelConfig.goldBonus || 50);

    if (this.isEndless) {
      this.endlessWave++;
      this.progression.recordWave(this.endlessWave);
      this.cameras.main.fade(300, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.restart({ isEndless: true, wave: this.endlessWave });
        }
      });
    } else if (this.chapterIndex >= 9) {
      // 10. Bölüm bitti -> Zafer Ekranı!
      this.progression.currentChapter = 10;
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
          this.scene.restart({ chapterIndex: this.chapterIndex, isEndless: false });
        }
      });
    }
  }

  dropLoot(x, y, goldAmount, xpAmount) {
    if (goldAmount > 0) {
      const gold = this.physics.add.sprite(x + 8, y, 'denarii-spark', 0);
      gold.lootType = 'gold';
      gold.amount = goldAmount;
      this.lootGroup.add(gold);
    }
    if (xpAmount > 0) {
      const xp = this.physics.add.sprite(x - 8, y, 'denarii-spark', 1);
      xp.lootType = 'xp';
      xp.amount = xpAmount;
      this.lootGroup.add(xp);
    }
  }

  castZeusFissureBeam(x, y, direction, damage) {
    let angle = 0;
    if (direction === 'down') angle = Math.PI / 2;
    if (direction === 'left') angle = Math.PI;
    if (direction === 'right') angle = 0;
    if (direction === 'up') angle = -Math.PI / 2;

    const bolt = new Projectile(this, x, y, angle, 450, damage, true, 'projectiles', 4);
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

  fireEnemyProjectile(enemy, player, type, damage) {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    const frame = type === 'bone_arrow' ? 8 : 12;
    const bolt = new Projectile(this, enemy.x, enemy.y, angle, 220, damage, false, 'projectiles', frame);
    this.projectiles.add(bolt);
  }

  createDamageSpark(x, y) {
    const spark = this.add.sprite(x, y, 'effects', 16).setDepth(20);
    this.time.delayedCall(200, () => spark.destroy());
  }

  createFloatingText(x, y, text, color = '#ffffff') {
    const txt = this.add.text(x, y, text, {
      fontSize: '14px',
      color,
      fontStyle: 'bold',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }).setOrigin(0.5).setDepth(30);

    this.tweens.add({
      targets: txt,
      y: y - 25,
      alpha: 0,
      duration: 800,
      onComplete: () => txt.destroy(),
    });
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
