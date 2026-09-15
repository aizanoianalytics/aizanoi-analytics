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

    // Mermi kuyruğu: her 45ms'de sönen bir hayalet bırak
    // (frame 4 = zeus bolt, 12 = curse orb → additive parlama)
    this.isLightning = frame === 4 || frame === 12;
    if (this.isLightning) {
      this.setBlendMode(Phaser.BlendModes.ADD);
      this.setScale(1.25);
    }
    this.trailTimer = scene.time.addEvent({
      delay: (scene.settings && scene.settings.effects === 'reduced') ? 130 : 45,
      loop: true,
      callback: () => {
        if (!this.active) return;
        const ghost = scene.add.sprite(this.x, this.y, textureKey, frame)
          .setRotation(this.rotation)
          .setAlpha(0.5)
          .setDepth(10);
        if (this.isLightning) ghost.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
          targets: ghost,
          alpha: 0,
          scaleX: 0.4,
          scaleY: 0.4,
          duration: 180,
          onComplete: () => ghost.destroy(),
        });
      },
    });

    // 2 saniye sonra otomatik imha
    scene.time.delayedCall(2000, () => {
      if (this.active) this.destroy();
    });
  }

  preDestroy() {
    if (this.trailTimer) {
      try { this.trailTimer.remove(); } catch (_) {}
      this.trailTimer = null;
    }
    super.preDestroy();
  }
}
