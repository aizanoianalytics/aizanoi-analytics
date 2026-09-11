// js/entities/Aizo.js
// Ana Karakter: Aizo (Antik Mermer Heykel İdol)

import { CombatSystem } from '../systems/CombatSystem.js';
import { WEAPONS } from '../data/items.js';
import { Projectile } from './Projectile.js';
import { audioManager } from '../systems/AudioManager.js';

export class Aizo extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, inventorySystem, progressionSystem) {
    super(scene, x, y, 'aizo', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.inventory = inventorySystem;
    this.progression = progressionSystem;

    this.stats = this.inventory.getCalculatedStats();
    this.hp = this.stats.hp;
    this.maxHp = this.stats.hp;

    this.lastDirection = 'down';
    this.isAttacking = false;
    this.isDead = false;
    this.isInBase = false;
    this.isInvulnerable = false;
    this.hitCounter = 0;

    // Cooldown timers
    this.skill1Cooldown = 0; // Zeus Çatlağı (Q)
    this.skill2Cooldown = 0; // Dorik Kalkan (R)

    this.setCollideWorldBounds(true);
    this.body.setSize(22, 22);
    this.body.setOffset(5, 8);
    this.setDepth(10);
  }

  hasSkill(skillId) {
    return this.progression.unlockedSkills.has(skillId);
  }

  update(time, delta) {
    if (this.isDead) return;

    // Update stats from inventory
    this.stats = this.inventory.getCalculatedStats();
    this.maxHp = this.stats.hp;

    // Cooldowns
    if (this.skill1Cooldown > 0) this.skill1Cooldown -= delta;
    if (this.skill2Cooldown > 0) this.skill2Cooldown -= delta;

    // Health Regeneration
    const regenRate = this.isInBase ? this.stats.hpRegenBase : this.stats.hpRegen;
    if (this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + (regenRate * (delta / 1000)));
    }

    // Movement
    let vx = 0;
    let vy = 0;
    const speed = this.stats.moveSpeed;

    // Mobil Sanal Joystick veya Klavye
    if (this.scene.touchControls && this.scene.touchControls.isActive()) {
      const joyVec = this.scene.touchControls.getVector();
      vx = joyVec.x * speed;
      vy = joyVec.y * speed;
    } else if (this.scene.cursors) {
      const cursors = this.scene.cursors;
      const wasd = this.scene.wasd;

      if (cursors.left.isDown || (wasd && wasd.A.isDown)) vx -= speed;
      if (cursors.right.isDown || (wasd && wasd.D.isDown)) vx += speed;
      if (cursors.up.isDown || (wasd && wasd.W.isDown)) vy -= speed;
      if (cursors.down.isDown || (wasd && wasd.S.isDown)) vy += speed;

      if (vx !== 0 && vy !== 0) {
        vx *= Math.SQRT1_2;
        vy *= Math.SQRT1_2;
      }
    }

    this.setVelocity(vx, vy);

    // Animasyon seçimi
    if (!this.isAttacking) {
      if (vx !== 0 || vy !== 0) {
        if (Math.abs(vx) > Math.abs(vy)) {
          this.lastDirection = vx > 0 ? 'right' : 'left';
        } else {
          this.lastDirection = vy > 0 ? 'down' : 'up';
        }
        this.play(`aizo-walk-${this.lastDirection}`, true);
      } else {
        this.play(`aizo-idle-${this.lastDirection}`, true);
      }
    }
  }

  attack(targetOrDirection = null) {
    if (this.isAttacking || this.isDead) return;

    this.isAttacking = true;
    this.play(`aizo-attack-${this.lastDirection}`, true);

    const weaponData = this.inventory ? WEAPONS[this.inventory.equipped.weapon] : null;
    const isRanged = weaponData && weaponData.subtype === 'ranged';
    const range = this.stats.attackRange;

    // Hedefler: Düşmanlar ve yıkılabilir yapılar
    const candidateTargets = [];
    if (this.scene.enemies) {
      this.scene.enemies.getChildren().forEach((enemy) => {
        if (enemy.active && enemy.hp > 0) candidateTargets.push(enemy);
      });
    }
    if (this.scene.structures) {
      this.scene.structures.getChildren().forEach((struct) => {
        if (struct.active && !struct.isPlayerBase && struct.hp > 0) candidateTargets.push(struct);
      });
    }

    let nearest = null;
    let minDist = range;
    candidateTargets.forEach((target) => {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (dist <= minDist) {
        minDist = dist;
        nearest = target;
      }
    });

    if (isRanged) {
      audioManager.playShoot();
      let angle = 0;
      if (nearest) {
        angle = Phaser.Math.Angle.Between(this.x, this.y, nearest.x, nearest.y);
      } else {
        if (this.lastDirection === 'down') angle = Math.PI / 2;
        else if (this.lastDirection === 'up') angle = -Math.PI / 2;
        else if (this.lastDirection === 'left') angle = Math.PI;
        else angle = 0;
      }
      const projFrame = weaponData?.projectileType === 'zeus_bolt' ? 4 : 0;
      const bolt = new Projectile(this.scene, this.x, this.y, angle, 420, this.stats.attackDamage, true, 'projectiles', projFrame);
      this.scene.projectiles.add(bolt);

      // Yetenek: Çift Kıvılcım (Twin Sparks - %22 ikincil ark)
      if (this.progression?.unlockedSkills?.has('twin_sparks') && Math.random() < 0.22) {
        this.scene.time.delayedCall(120, () => {
          if (!this.active || this.isDead) return;
          const sparkAngle = angle + (Math.random() - 0.5) * 0.35;
          const spark = new Projectile(this.scene, this.x, this.y, sparkAngle, 400, Math.round(this.stats.attackDamage * 0.65), true, 'projectiles', 4);
          this.scene.projectiles.add(spark);
        });
      }
    } else {
      audioManager.playSwing();
      if (nearest) {
        CombatSystem.processAttack(this, nearest);
        this.scene.createDamageSpark(nearest.x, nearest.y);
      }
    }

    const atkSpeed = Math.max(0.6, this.stats.attackSpeed);
    const delay = Math.round(280 / atkSpeed);
    this.scene.time.delayedCall(delay, () => {
      this.isAttacking = false;
    });
  }

  castSkill1() {
    // Zeus Çatlağı (Işın) - Kilit kontrolü
    if (!this.progression?.unlockedSkills?.has('zeus_fissure_beam')) return false;
    if (this.skill1Cooldown > 0 || this.isDead) return false;
    this.skill1Cooldown = 25000;

    audioManager.playZeusBeam();
    this.scene.cameras.main.shake(180, 0.008);
    this.scene.castZeusFissureBeam(this.x, this.y, this.lastDirection, this.stats.attackDamage * 3.2);
    return true;
  }

  castSkill2() {
    // Dorik Kalkan (Sanctuary Aegis) - Kilit kontrolü
    if (!this.progression?.unlockedSkills?.has('sanctuary_aegis')) return false;
    if (this.skill2Cooldown > 0 || this.isDead) return false;
    this.skill2Cooldown = 38000;
    this.isInvulnerable = true;

    audioManager.playShield();
    this.scene.activateSanctuaryAegis(this);
    this.scene.time.delayedCall(3500, () => {
      this.isInvulnerable = false;
    });
    return true;
  }

  castUtilitySkill() {
    // Gölge Kamuflajı (Shadow Melding)
    if (!this.progression?.unlockedSkills?.has('shadow_melding')) return false;
    if (this.utilityCooldown > 0 || this.isDead) return false;
    this.utilityCooldown = 32000;
    this.isStealthed = true;
    this.setAlpha(0.35);

    audioManager.playShield();
    this.scene.createFloatingText(this.x, this.y - 30, 'GÖLGE KAMUFLAJI!', '#27ae60');
    this.scene.time.delayedCall(2500, () => {
      this.isStealthed = false;
      this.setAlpha(1.0);
    });
    return true;
  }

  takeDamage(amount, isCritical = false, attacker = null) {
    if (this.isDead || this.isInvulnerable) return;

    this.hp -= amount;
    this.scene.createFloatingText(this.x, this.y - 20, `-${amount}`, isCritical ? '#f1c40f' : '#e74c3c');
    audioManager.playPlayerHurt();
    this.scene.cameras.main.shake(120, 0.005);
    this.play('aizo-hurt', true);

    if (this.hp <= 0) {
      this.die();
    }
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.scene.createFloatingText(this.x, this.y - 20, `+${amount}`, '#27ae60');
  }

  die() {
    if (this.isDead) return;

    // Yetenek: Kadim Diriliş (Ancient Rebirth - Bölüm başına 1 kez %40 canla kalkış)
    if (this.progression?.unlockedSkills?.has('ancient_rebirth') && !this.rebirthUsed) {
      this.rebirthUsed = true;
      this.hp = Math.round(this.maxHp * 0.40);
      this.isInvulnerable = true;
      audioManager.playShield();
      this.scene.activateSanctuaryAegis(this);
      this.scene.createFloatingText(this.x, this.y - 40, 'KADİM DİRİLİŞ!', '#f1c40f');
      this.scene.time.delayedCall(3000, () => {
        this.isInvulnerable = false;
      });
      return;
    }

    this.isDead = true;
    this.setVelocity(0, 0);
    this.play('aizo-death');
    audioManager.playEnemyDeath(true);

    this.scene.cameras.main.shake(300, 0.01);

    // Heykel uykusu sahnesi
    this.scene.time.delayedCall(1500, () => {
      this.scene.onPlayerDied();
    });
  }

  respawn(x, y) {
    this.x = x;
    this.y = y;
    this.hp = this.maxHp;
    this.isDead = false;
    this.play('aizo-respawn');
  }
}
