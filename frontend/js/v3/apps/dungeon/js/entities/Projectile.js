// js/entities/Projectile.js
// Zeus Şimşek Arkı, Mermer Kıymığı ve Düşman Okları

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, angle, speed, damage, isPlayer, textureKey = 'projectiles', frame = 0) {
    super(scene, x, y, textureKey, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.damage = damage;
    this.isPlayer = isPlayer;
    this.damageType = 'physical';

    this.setRotation(angle);
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.setDepth(11);

    // 2 saniye sonra otomatik imha
    scene.time.delayedCall(2000, () => {
      if (this.active) this.destroy();
    });
  }
}
