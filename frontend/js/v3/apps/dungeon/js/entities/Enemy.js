// js/entities/Enemy.js
// Antik Aizanoi Düşman Taban Sınıfı

import { CombatSystem } from '../systems/CombatSystem.js';
import { applyEliteAffix, ELITE_AFFIXES } from '../data/elite-affixes.js';
import { audioManager } from '../systems/AudioManager.js';

const ELITE_COLORS = Object.fromEntries((ELITE_AFFIXES || []).map((a) => [a.id, a.color]));

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, typeConfig) {
    const isBoss = typeConfig.isMiniBoss || typeConfig.isFinalBoss;
    const texture = isBoss ? 'bosses' : 'enemies';
    const initialFrame = isBoss ? (typeConfig.isFinalBoss ? 1 : 0) : (typeConfig.spriteRow * 8 || 0);

    super(scene, x, y, texture, initialFrame);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.type = typeConfig;
    this.name = typeConfig.name;
    this.hp = typeConfig.hp;
    this.maxHp = typeConfig.hp;
    this.attackDamage = typeConfig.attackDamage;
    this.attackSpeed = typeConfig.attackSpeed;
    this.attackRange = typeConfig.attackRange;
    this.moveSpeed = typeConfig.moveSpeed;
    this.armor = typeConfig.armor;
    this.xpReward = typeConfig.xpReward;
    this.goldReward = typeConfig.goldReward;
    this.behavior = typeConfig.behavior;
    this.aggroRange = typeConfig.aggroRange;
    this.isBoss = isBoss;
    this.eliteAffix = isBoss ? null : typeConfig.eliteAffix;
    const eliteStats = applyEliteAffix({ moveSpeed: this.moveSpeed, armor: this.armor }, this.eliteAffix);
    this.moveSpeed = eliteStats.moveSpeed;
    this.armor = eliteStats.armor;
    this.vampiricRate = eliteStats.vampiricRate || 0;
    this.volatileDamage = eliteStats.volatileDamage || 0;
    this.stormInterval = eliteStats.stormInterval || 0;
    this.stormTimer = this.stormInterval;

    this.attackCooldown = 0;
    this.isDead = false;
    this.knockbackTimer = 0;

    // Boss vs regular collision body sizing
    if (typeConfig.isFinalBoss) {
      this.body.setSize(72, 80);
      this.body.setOffset(28, 24);
      this.setScale(1.0);
    } else if (typeConfig.isMiniBoss) {
      this.body.setSize(56, 60);
      this.body.setOffset(36, 34);
      this.setScale(0.9);
    } else {
      this.body.setSize(24, 24);
      this.body.setOffset(20, 20);
      // Siluet ayrışımı: her davranış 1 saniyede tanınsın
      if (typeConfig.behavior === 'stealth_ambush') this.setScale(0.85, 1.18); // ince-uzun wraith
      else if (typeConfig.behavior === 'melee_tank') this.setScale(1.18, 1.05); // iri centurion
      else if (typeConfig.behavior === 'shield_bash_charge') this.setScale(1.24, 1.08); // geniş praetorian
    }
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;

    // Zemin gölgesi: karakteri zeminden koparır, derinlik hissi
    const shadowW = this.isBoss ? 64 : 26;
    this.shadow = scene.add.ellipse(x, y + (this.isBoss ? 40 : 14), shadowW, shadowW * 0.32, 0x000000, 0.35);
    this.shadow.setDepth(8);

    // Elit aurası: affix renginde nabız gibi atan hale — neyle karşılaştığın belli olsun
    this.eliteGlow = null;
    if (this.eliteAffix && ELITE_COLORS[this.eliteAffix] !== undefined) {
      try {
        this.eliteGlow = scene.add.ellipse(x, y, 44, 44, ELITE_COLORS[this.eliteAffix], 0.28);
        this.eliteGlow.setBlendMode(Phaser.BlendModes.ADD);
        this.eliteGlow.setDepth(8);
        scene.tweens.add({
          targets: this.eliteGlow,
          alpha: 0.12,
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } catch (_) { this.eliteGlow = null; }
    }

    this.setDepth(9);

    // Sağlık barı grafiği
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(15);
    this.stats = { attackDamage: this.attackDamage, critChance: 0, armor: this.armor };
    this.isAmbushing = false;
  }

  update(time, delta, player) {
    if (this.isDead || !this.active || !player || player.isDead) {
      this.hpBar.clear();
      return;
    }

    // Gölge takibi
    if (this.shadow && this.shadow.active) {
      this.shadow.setPosition(this.x, this.y + (this.isBoss ? 40 : 14));
    }
    if (this.eliteGlow && this.eliteGlow.active) {
      this.eliteGlow.setPosition(this.x, this.y);
    }

    // Geri tepme: kisa sure hareket AI durur, itme velocity korunur
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= delta;
      this.drawHealthBar();
      return;
    }

    // Aizo gölgede gizlenmişse (Shadow Melding), aggro kesilir
    if (player.isStealthed) {
      this.setVelocity(0, 0);
      this.drawHealthBar();
      return;
    }

    this.drawHealthBar();

    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    if (this.stormTimer > 0) this.stormTimer -= delta;
    if (this.stormInterval && dist <= this.aggroRange && this.stormTimer <= 0) {
      this.stormTimer = this.stormInterval;
      this.scene.fireEnemyProjectile(this, player, 'curse_orb', Math.max(1, Math.round(this.attackDamage * 0.65)), 'lightning');
    }

    // 1. Telegraph Warning for Boss Slam
    if (this.isBoss || this.type.isMiniBoss) {
      if (this.attackCooldown > 0 && this.attackCooldown <= 400) {
        this.setTint(0xff4444);
      } else {
        this.clearTint();
      }
    }

    // 2. Stealth Ambush behavior
    if (this.behavior === 'stealth_ambush') {
      if (dist > 80 && !this.isAmbushing) {
        this.setAlpha(0.25);
      } else {
        this.setAlpha(1.0);
        this.isAmbushing = true;
      }
    }

    // 3. Distance and Movement logic
    if (dist <= this.aggroRange) {
      // Ranged Kiter: Oyuncu çok yaklaşırsa (120px) geri çekil
      if (this.behavior === 'ranged_kite' && dist < 120) {
        const angle = Phaser.Math.Angle.Between(player.x, player.y, this.x, this.y);
        this.setVelocity(Math.cos(angle) * this.moveSpeed * 0.9, Math.sin(angle) * this.moveSpeed * 0.9);
      } else if (dist <= this.attackRange) {
        this.setVelocity(0, 0);
        if (this.attackCooldown <= 0) {
          this.executeAttack(player);
          this.attackCooldown = 1000 / this.attackSpeed;
        }
      } else {
        // Hedefe doğru yürü
        const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
        this.setVelocity(Math.cos(angle) * this.moveSpeed, Math.sin(angle) * this.moveSpeed);
      }
    } else {
      this.setVelocity(0, 0);
    }
  }

  executeAttack(player) {
    if (this.type.projectileType) {
      this.scene.fireEnemyProjectile(this, player, this.type.projectileType, this.attackDamage);
    } else {
      this.stats.attackDamage = this.attackDamage;
      CombatSystem.processAttack(this, player);
      this.scene.createDamageSpark(player.x, player.y);
    }
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.scene.createFloatingText(this.x, this.y - 20, `+${amount}`, '#27ae60');
  }

  drawHealthBar() {
    this.hpBar.clear();
    const always = this.isBoss || Boolean(this.eliteAffix);
    if (!always && this.hp >= this.maxHp) return;

    const barW = this.isBoss ? 54 : 28;
    const barH = this.isBoss ? 6 : 4;
    const x = this.x - barW / 2;
    const y = this.y - (this.isBoss ? 58 : 24);

    this.hpBar.fillStyle(0x0b1220, 0.9);
    this.hpBar.fillRect(x - 1, y - 1, barW + 2, barH + 2);
    const pct = Math.max(0, this.hp / this.maxHp);
    const color = this.isBoss ? 0xf39c12 : (this.eliteAffix ? 0xa569bd : 0xe74c3c);
    this.hpBar.fillStyle(color, 1.0);
    this.hpBar.fillRect(x, y, barW * pct, barH);
  }

  takeDamage(amount, isCritical = false, attacker = null) {
    if (this.isDead) return;

    this.hp -= amount;
    this.scene.createFloatingText(this.x, this.y - 15, `-${amount}`, isCritical ? '#f1c40f' : '#ffffff', isCritical ? 22 : 15);
    audioManager.playHit(isCritical);

    // Kucuk knockback (boss haric): saldirgandan uza it
    if (attacker && typeof attacker.x === 'number' && !this.isBoss) {
      const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, this.x, this.y);
      this.setVelocity(Math.cos(angle) * 170, Math.sin(angle) * 170);
      this.knockbackTimer = 120;
    }

    // Hasar flaşı: önce beyaz parıltı (Brotato juice), sonra sön
    this.setTintFill(0xffffff);
    // Ezilme: vuruşta jöle gibi squash
    try {
      this.scene.tweens.add({
        targets: this,
        scaleX: this.baseScaleX * 1.12,
        scaleY: this.baseScaleY * 0.88,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => { if (this.active) { this.setScale(this.baseScaleX, this.baseScaleY); } },
      });
    } catch (_) {}
    this.scene.time.delayedCall(80, () => {
      if (this.active) this.clearTint();
    });

    // Boss isabeti: hafif ekran sarsintisi (olumdeki buyuk sarsintidan ayri)
    if (this.isBoss) {
      this.scene.cameras.main.shake(140, 0.006);
    }

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.setVelocity(0, 0);

    audioManager.playEnemyDeath(this.isBoss);

    if (this.isBoss) {
      this.scene.cameras.main.shake(350, 0.015);
    }

    if (this.volatileDamage && this.scene.triggerEliteExplosion) {
      this.scene.triggerEliteExplosion(this);
    }

    // Ölüm patlaması: taş-kül parçacıkları
    if (typeof this.scene.spawnDeathBurst === 'function') {
      this.scene.spawnDeathBurst(this.x, this.y, this.isBoss);
    }

    // Düşürme (Drop): Denarii ve Zeus Kıvılcımı
    this.scene.dropLoot(this.x, this.y, this.goldReward, this.xpReward);
    // Elit kalbi: %10 şansla 25 HP (ölüm sarmalına panzehir)
    if (this.eliteAffix && Math.random() < 0.1 && typeof this.scene.dropHeart === 'function') {
      this.scene.dropHeart(this.x + 14, this.y + 6, 25);
    }
    // Kombo sayacı
    if (typeof this.scene.registerKill === 'function') {
      this.scene.registerKill(this.x, this.y);
    }
    this.scene.progression.recordKill(this.isBoss);

    this.destroy();
  }

  preDestroy() {
    if (this.hpBar) {
      this.hpBar.destroy();
      this.hpBar = null;
    }
    if (this.shadow) {
      this.shadow.destroy();
      this.shadow = null;
    }
    if (this.eliteGlow) {
      this.eliteGlow.destroy();
      this.eliteGlow = null;
    }
    super.preDestroy();
  }
}

