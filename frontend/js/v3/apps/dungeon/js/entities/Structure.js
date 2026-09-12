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
  }

  takeDamage(amount) {
    if (this.isPlayerBase) return;
    this.hp -= amount;

    this.setTint(0xff7777);
    this.scene.time.delayedCall(100, () => this.clearTint());

    if (this.hp <= 0) {
      const isConqueror = this.scene.progression?.unlockedSkills?.has('sanctuary_conqueror');
      const gold = isConqueror ? 90 : 40;
      const xp = isConqueror ? 75 : 30;
      this.scene.dropLoot(this.x, this.y, gold, xp);
      if (isConqueror) {
        this.scene.createFloatingText(this.x, this.y - 20, 'Structure down (+50 coin / +75 spark)', '#f1c40f');
      }
      this.destroy();
    }
  }
}
