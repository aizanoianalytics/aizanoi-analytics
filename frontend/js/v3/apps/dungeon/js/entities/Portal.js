// js/entities/Portal.js
export class Portal extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'portal', 6);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setSize(30, 30);
    this.setImmovable(true);
    this.setDepth(7);
    this.play('portal-active');
    this.setLocked(true);
  }

  setLocked(locked) {
    this.locked = locked;
    this.setAlpha(locked ? 0.45 : 1);
    this.setTint(locked ? 0x667799 : 0xffffff);
  }
}
