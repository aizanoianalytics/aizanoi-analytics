// js/entities/Enemy.js
// Antik Aizanoi Düşman Taban Sınıfı

import { CombatSystem } from '../systems/CombatSystem.js';
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

    this.attackCooldown = 0;
    this.isDead = false;

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
  }

  update(time, delta, player) {
    if (this.isDead || !this.active || !player || player.isDead) {
      this.hpBar.clear();
      return;
    }

    this.drawHealthBar();

    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    if (dist <= this.aggroRange) {
      if (dist <= this.attackRange) {
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
      CombatSystem.processAttack({ stats: { attackDamage: this.attackDamage, critChance: 0 } }, player);
      this.scene.createDamageSpark(player.x, player.y);
    }
  }

  drawHealthBar() {
    this.hpBar.clear();
    if (this.hp >= this.maxHp) return;

    const barW = this.isBoss ? 48 : 26;
    const barH = 4;
    const x = this.x - barW / 2;
    const y = this.y - (this.isBoss ? 55 : 22);

    this.hpBar.fillStyle(0x1e293b, 0.8);
    this.hpBar.fillRect(x, y, barW, barH);

    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpBar.fillStyle(this.isBoss ? 0xf39c12 : 0xe74c3c, 1.0);
    this.hpBar.fillRect(x, y, barW * pct, barH);
  }

  takeDamage(amount, isCritical = false) {
    if (this.isDead) return;

    this.hp -= amount;
    this.scene.createFloatingText(this.x, this.y - 15, `-${amount}`, isCritical ? '#f1c40f' : '#ffffff');
    audioManager.playHit(isCritical);

    // Hasar flaşı ve sarsıntı
    this.setTint(0xff6666);
    this.scene.time.delayedCall(120, () => {
      if (this.active) this.clearTint();
    });

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

