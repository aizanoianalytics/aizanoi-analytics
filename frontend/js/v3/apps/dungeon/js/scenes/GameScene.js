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
    this.recallChannel = 0;
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
    this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,R,E,I,M,P,TAB,SPACE,ESC,F,B');

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

    // 12b. Görsel katman: vignette + portal nabzı + bölüm kartı
    if (this.settings?.effects !== 'reduced') this.addVignette();
    this.showChapterCard();
    try {
      if (this.exitPortal) {
        const pg = this.add.sprite(this.exitPortal.x, this.exitPortal.y, 'effects', 8)
          .setDepth(6).setAlpha(0.5).setScale(2.2);
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
      audioManager.stopAmbientDrone();
      this.input.removeAllListeners();
      // Drop the scene sentinel so a fresh Phaser instance can claim it
      // without a stale scene reference lingering after restart/teardown.
      if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = undefined;
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
    // High-contrast read: koyu mat zemin (düşmanlar öne çıkar) + soğuk duvar.
    // Eskiden zemin 0xf6e7c4 idi — her yer krem olduğu için düşman kayboluyordu.
    this.floorLayer.setTint(0xcdb488);
    this.wallLayer.setTint(0x1b2744);

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

    // Zemin decal'leri: tiles-decor'dan rastgele mozaik kırıntıları (%12 yoğunluk)
    try {
      for (const room of this.mapData.rooms || []) {
        const decals = Math.floor((room.w * room.h) * 0.12);
        for (let i = 0; i < decals; i++) {
          const dx = room.x + Math.floor(Math.random() * room.w);
          const dy = room.y + Math.floor(Math.random() * room.h);
          if (this.mapData.grid[dy] && this.mapData.grid[dy][dx] !== 2) {
            const d = this.add.image(dx * 32 + 16, dy * 32 + 16, 'tiles-decor')
              .setDepth(1)
              .setAlpha(0.35 + Math.random() * 0.35)
              .setRotation(Math.floor(Math.random() * 4) * Math.PI / 2)
              .setScale(0.5 + Math.random() * 0.5);
            d.setTint(0xbfae87);
          }
        }
      }
    } catch (_) {}
  }

  // Vignette: ekran kenarlarını karart, odağı ortaya topla (Brotato derinliği)
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
    try {
      const reduced = this.settings?.effects === 'reduced';
      let count = isBoss ? 14 : 6 + Math.floor(Math.random() * 5);
      if (reduced) count = Math.ceil(count / 2);
      for (let i = 0; i < count; i++) {
        const p = this.add.sprite(x, y, 'effects', 16 + (i % 4)).setDepth(20);
        const angle = Math.random() * Math.PI * 2;
        const dist = 24 + Math.random() * (isBoss ? 90 : 48);
        this.tweens.add({
          targets: p,
          x: x + Math.cos(angle) * dist,
          y: y + Math.sin(angle) * dist,
          alpha: 0,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: 320 + Math.random() * 200,
          ease: 'Quad.easeOut',
          onComplete: () => p.destroy(),
        });
      }
      const ring = this.add.circle(x, y, 6, 0xffffff, 0.0).setDepth(20);
      ring.setStrokeStyle(3, 0xf5d77f, 0.9);
      this.tweens.add({
        targets: ring,
        radius: isBoss ? 64 : 30,
        alpha: 0,
        duration: 280,
        ease: 'Quad.easeOut',
        onUpdate: () => { try { ring.setStrokeStyle(3, 0xf5d77f, Math.max(0, ring.alpha)); } catch (_) {} },
        onComplete: () => ring.destroy(),
      });
      if (isBoss) this.cameras.main.shake(200, 0.01);
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
      // M: sessiz, P: duraklat — duraklatma bayrağı oyuncu güncellemesinden önce işlenir
      if (this.wasd) {
        if (Phaser.Input.Keyboard.JustDown(this.wasd.M)) audioManager.toggleMute();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.P)) this.togglePause();
        if (Phaser.Input.Keyboard.JustDown(this.wasd.ESC)) this.toggleExitMenu();
      }
      if (this.isPaused || this.exitMenu) return;
      this.player.update(time, delta);
      if (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.F)) {
        toggleDungeonFullscreen(document.getElementById('game-container') || document.documentElement);
      }
      if (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.B)) {
        this.startRecall();
      }

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
    if (proj.attacker) {
      const res = CombatSystem.processAttack(proj.attacker, enemy, proj.damage, { damageType });
      // Kritik senkronu: ses zaten pitch'li, görsel de aynı karede patlasın
      if (res && res.isCritical) {
        this.cameras.main.shake(110, 0.006);
        this.juiceHitstop(55);
      }
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
    // Üçlü kıvılcım + hızlı şok halkası (tek sprite yerine tok patlama)
    try {
      for (let i = 0; i < 3; i++) {
        const spark = this.add.sprite(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14, 'effects', 16 + (i % 4)).setDepth(20);
        spark.setScale(0.9 + Math.random() * 0.5);
        spark.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: spark,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 160 + Math.random() * 80,
          onComplete: () => spark.destroy(),
        });
      }
    } catch (_) {
      const spark = this.add.sprite(x, y, 'effects', 16).setDepth(20);
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
