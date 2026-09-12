// js/entities/Enemy.js
// Antik Aizanoi Düşman Taban Sınıfı

import { CombatSystem } from '../systems/CombatSystem.js';
import { applyEliteAffix } from '../data/elite-affixes.js';
import { audioManager } from '../systems/AudioManager.js';

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
    this.scene.createFloatingText(this.x, this.y - 15, `-${amount}`, isCritical ? '#f1c40f' : '#ffffff', isCritical ? 19 : 14);
    audioManager.playHit(isCritical);

    // Kucuk knockback (boss haric): saldirgandan uza it
    if (attacker && typeof attacker.x === 'number' && !this.isBoss) {
      const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, this.x, this.y);
      this.setVelocity(Math.cos(angle) * 170, Math.sin(angle) * 170);
      this.knockbackTimer = 120;
    }

    // Hasar flaşı ve sarsıntı
    this.setTint(0xff6666);
    this.scene.time.delayedCall(120, () => {
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

    // Düşürme (Drop): Denarii ve Zeus Kıvılcımı
    this.scene.dropLoot(this.x, this.y, this.goldReward, this.xpReward);
    this.scene.progression.recordKill(this.isBoss);

    this.destroy();
  }

  preDestroy() {
    if (this.hpBar) {
      this.hpBar.destroy();
      this.hpBar = null;
    }
    super.preDestroy();
  }
}

