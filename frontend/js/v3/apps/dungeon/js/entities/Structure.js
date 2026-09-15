// js/entities/Structure.js
// Antik Zeus Sunağı, Savunma Kuleleri ve Mezar Çatlakları

export class Structure extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type) {
    let frame = 0;
    if (type === 'spawn_fissure') frame = 0;
    else if (type === 'defense_tower') frame = 8;
    else if (type === 'corrupted_shrine') frame = 16;
    else if (type === 'zeus_altar') frame = 24;

    super(scene, x, y, 'structures', frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.structureType = type;
    this.isStructure = true;
    this.setImmovable(true);

    if (type === 'zeus_altar') {
      this.isPlayerBase = true;
      this.body.setSize(30, 30);
    } else {
      this.hp = type === 'defense_tower' ? 120 : (type === 'corrupted_shrine' ? 220 : 80);
      this.maxHp = this.hp;
      this.body.setSize(28, 28);
    }

    this.setDepth(8);

    // Yıkılabilir yapılarda mini can barı (sunak hariç)
    this.hpBar = null;
    if (!this.isPlayerBase) {
      this.hpBar = scene.add.graphics();
      this.hpBar.setDepth(15);
      this.drawHealthBar();
    }
  }

  drawHealthBar() {
    if (!this.hpBar || !this.active) return;
    this.hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const barW = 30;
    const barH = 4;
    const x = this.x - barW / 2;
    const y = this.y - 26;
    this.hpBar.fillStyle(0x0b1220, 0.9);
    this.hpBar.fillRect(x - 1, y - 1, barW + 2, barH + 2);
    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpBar.fillStyle(0xe67e22, 1.0);
    this.hpBar.fillRect(x, y, barW * pct, barH);
  }

  preDestroy() {
    if (this.hpBar) {
      this.hpBar.destroy();
      this.hpBar = null;
    }
    super.preDestroy();
  }

  takeDamage(amount) {
    if (this.isPlayerBase) return;
    this.hp -= amount;

    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => { if (this.active) this.clearTint(); });
    this.drawHealthBar();
    if (typeof this.scene.createDamageSpark === 'function') {
      this.scene.createDamageSpark(this.x, this.y);
    }

    if (this.hp <= 0) {
      const isConqueror = this.scene.progression?.unlockedSkills?.has('sanctuary_conqueror');
      const gold = isConqueror ? 90 : 40;
      const xp = isConqueror ? 75 : 30;
      if (typeof this.scene.spawnDeathBurst === 'function') {
        this.scene.spawnDeathBurst(this.x, this.y, false);
      }
      this.scene.dropLoot(this.x, this.y, gold, xp);
      if (isConqueror) {
        this.scene.createFloatingText(this.x, this.y - 20, 'Structure down (+50 coin / +75 spark)', '#f1c40f');
      }
      this.destroy();
    }
  }
}
