// js/entities/Portal.js
// Zeus Mabedi Seviye Geçiş Portalı

export class Portal extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'portal', 6);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(30, 30);
    this.setImmovable(true);
    this.setDepth(7);

    // Dönen portal animasyonu
    this.play('portal-active');
  }
}
