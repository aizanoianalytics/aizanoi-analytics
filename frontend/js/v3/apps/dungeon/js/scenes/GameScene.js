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
  }

  create() {
    this.isTransitioning = false;
    if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = 'GameScene';
    // 1. Sistemleri başlat
    this.progression = new ProgressionSystem();
    this.inventory = new InventorySystem(this.progression);

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
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,R,E,I,M,P,TAB,SPACE,ESC');

    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown() && pointer.x > 48 && pointer.x < this.scale.width - 48) {
        this.player.attack();
      }
    });

    // 11. Dokunmatik Kontroller
    this.touchControls = new TouchControls(this);

    // 12. Paralel HUD Sahnesini ve Ortam Müziğini Başlat
    this.scene.launch('UIScene', { gameScene: this });
    audioManager.startAmbientDrone();

    // 13. Temizlik (Memory Leak Önleme)
    this.events.once('shutdown', () => {
      if (this.touchControls) {
        this.touchControls.destroy();
        this.touchControls = null;
      }
      audioManager.stopAmbientDrone();
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
      // D11: Bellek patlamasını ve aşırı düşman üretimini önleyen kesin tavan (Maksimum 32 aktif düşman)
      const cappedWave = Math.min(this.endlessWave, 20);
      const rawCount = Math.floor(15 * Math.pow(1.12, cappedWave - 1));
      count = Math.min(32, rawCount);
    }

    for (let i = 0; i < count; i++) {
      const pos = this.levelSystem.getRandomWalkablePosition(true);
      const typeKey = enemyTypes[i % enemyTypes.length];
      const typeConfig = { ...ENEMY_TYPES[typeKey] };
      typeConfig.eliteAffix = chooseEliteAffix(typeConfig);

      if (this.isEndless) {
        // Dalga ölçeği 20. dalgada sabitlenir: can ~14.2x, hasar ~6.1x tavan.
        const cappedWave = Math.min(this.endlessWave, 20);
        const waveScale = Math.pow(1.15, cappedWave - 1);
        typeConfig.hp = Math.round(typeConfig.hp * waveScale);
        typeConfig.attackDamage = Math.round(typeConfig.attackDamage * Math.pow(1.10, cappedWave - 1));
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
      // M: sessiz, P: duraklat — duraklatma bayrağı oyuncu güncellemesinden önce işlenir
      if (this.wasd) {
        if (Phaser.Input.Keyboard.JustDown(this.wasd.M)) audioManager.toggleMute();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.P)) this.togglePause();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.ESC)) this.toggleExitMenu();
      }
      if (this.isPaused || this.exitMenu) return;
      this.player.update(time, delta);

      // Base güvenli alan kontrolü
      const distToBase = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.baseAltar.x, this.baseAltar.y
      );
      this.player.isInBase = distToBase < 80;

      // Space ile utility skill (Gölge Karışımı) veya saldırı
      if (this.cursors && Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
        if (this.progression && this.progression.unlockedSkills.has('shadow_melding') && typeof this.player.castUtilitySkill === 'function') {
          this.player.castUtilitySkill();
        } else {
          this.player.attack();
        }
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

    const damageType = proj.damageType || 'physical';
    if (proj.attacker) {
      CombatSystem.processAttack(proj.attacker, enemy, proj.damage, { damageType });
    } else {
      const targetArmor = enemy.stats?.armor ?? enemy.armor ?? 0;
      const netDamage = CombatSystem.calculateDamage(proj.damage, targetArmor);
      enemy.takeDamage(netDamage);
    }
    this.createDamageSpark(enemy.x, enemy.y);

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

  canCompleteLevel() {
    if (!this.player || !this.player.active || this.player.hp <= 0) return false;
    const activeEnemies = this.enemies ? this.enemies.getChildren().filter(e => e.active && e.hp > 0) : [];
    const activeBosses = activeEnemies.filter(e => e.isBoss);
    if (activeBosses.length > 0) return false;
    return activeEnemies.length === 0;
  }

  handleEnterPortal() {
    if (this.isTransitioning) return;
    if (!this.canCompleteLevel()) {
      const remaining = this.enemies ? this.enemies.getChildren().filter(e => e.active && e.hp > 0).length : 0;
      this.createFloatingText(this.player.x, this.player.y - 35, `Zindan temizlenmeli! (${remaining} düşman kaldı)`, '#e74c3c');
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
    const title = this.add.text(0, -100, 'ODA KUTSAMASI', { fontSize: '22px', color: '#f5d77f', fontStyle: 'bold' }).setOrigin(0.5);
    const hint = this.add.text(0, -70, 'Birini seç (1, 2 veya 3)', { fontSize: '14px', color: '#d1d5db' }).setOrigin(0.5);
    overlay.add([dim, panel, title, hint]);
    let selected = false;
    const keyEvents = ['keydown-ONE', 'keydown-TWO', 'keydown-THREE'];
    const choose = (index) => {
      if (selected || !choices[index]) return;
      selected = true;
      keyEvents.forEach((event, i) => this.input.keyboard.off(event, keyHandlers[i]));
      this.player.addBlessing(choices[index].id);
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
      this.pauseOverlay = this.add.text(width / 2, height / 2, '⏸ DURAKLATILDI (P)', {
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
    const panel = this.add.rectangle(0, 0, 340, 210, 0x141822, 0.98);
    panel.setStrokeStyle(2, 0xc5a059);
    const title = this.add.text(0, -70, 'DURAKLATILDI', {
      fontSize: '22px', color: '#f5d77f', fontStyle: 'bold',
    }).setOrigin(0.5);
    const resumeBtn = createGlassButton(this, 0, -10, 260, 38, 'Devam Et', () => this.closeExitMenu());
    menu.add([dim, panel, title, resumeBtn]);
    if (hasDungeonExitHandler()) {
      const exitBtn = createGlassButton(this, 0, 42, 260, 38, 'AizanoiOS\u0027e D\u00f6n\u00fc\u015f', () => requestDungeonExit());
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
      this.lootGroup.add(gold);
    }
    if (xpAmount > 0) {
      const xp = this.physics.add.sprite(x - 8, y, 'denarii-spark', 1);
      xp.lootType = 'xp';
      xp.amount = xpAmount;
      this.lootGroup.add(xp);
    }
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
    this.cameras.main.shake(100, 0.004);
  }

  fireEnemyProjectile(enemy, player, type, damage, damageType = 'physical') {
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    const frame = type === 'bone_arrow' ? 8 : 12;
    const bolt = new Projectile(this, enemy.x, enemy.y, angle, 220, damage, false, 'projectiles', frame);
    bolt.attacker = enemy;
    bolt.damageType = damageType;
    this.projectiles.add(bolt);
  }

  createDamageSpark(x, y) {
    const spark = this.add.sprite(x, y, 'effects', 16).setDepth(20);
    this.time.delayedCall(200, () => spark.destroy());
  }

  createFloatingText(x, y, text, color = '#ffffff', size = 14) {
    const txt = this.add.text(x, y, text, {
      fontSize: `${size}px`,
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
