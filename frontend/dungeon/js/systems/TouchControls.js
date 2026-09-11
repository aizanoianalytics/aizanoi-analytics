// js/systems/TouchControls.js
// Mobil ve Tablet Dokunmatik Kontrol Sistemi (Sanal Joystick & Auto-Target)

export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.vector = { x: 0, y: 0 };
    this.joystickBase = null;
    this.joystickThumb = null;
    this.isDraggingJoystick = false;
    this.dragPointerId = null;

    this.checkDevice();
  }

  checkDevice() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth < 840);
    if (isTouch) {
      this.init();
    }
  }

  init() {
    this.active = true;

    // Joystick elements
    const baseX = 90;
    const baseY = this.scene.scale.height - 90;

    this.joystickBase = this.scene.add.image(baseX, baseY, 'touch-joystick-base')
      .setScrollFactor(0).setDepth(200).setAlpha(0.65).setInteractive();

    this.joystickThumb = this.scene.add.image(baseX, baseY, 'touch-joystick-thumb')
      .setScrollFactor(0).setDepth(201).setAlpha(0.85);

    // Joystick Touch Dragging
    this.scene.input.on('pointerdown', (pointer) => {
      if (pointer.x < this.scene.scale.width / 2 && pointer.y > this.scene.scale.height / 2) {
        this.isDraggingJoystick = true;
        this.dragPointerId = pointer.id;
        this.updateJoystick(pointer);
      }
    });

    this.scene.input.on('pointermove', (pointer) => {
      if (this.isDraggingJoystick && pointer.id === this.dragPointerId) {
        this.updateJoystick(pointer);
      }
    });

    const resetJoy = (pointer) => {
      if (pointer.id === this.dragPointerId) {
        this.isDraggingJoystick = false;
        this.dragPointerId = null;
        this.vector = { x: 0, y: 0 };
        this.joystickThumb.setPosition(this.joystickBase.x, this.joystickBase.y);
      }
    };

    this.scene.input.on('pointerup', resetJoy);
    this.scene.input.on('pointerupoutside', resetJoy);

    // Dokunmatik Aksiyon Butonları (Sağ Alt)
    const atkX = this.scene.scale.width - 70;
    const atkY = this.scene.scale.height - 70;

    // 1. Saldırı Butonu (Auto-Target)
    this.btnAttack = this.scene.add.image(atkX, atkY, 'touch-btn-attack')
      .setScrollFactor(0).setDepth(200).setInteractive();

    this.btnAttack.on('pointerdown', () => {
      if (this.scene.player) this.scene.player.attack();
    });

    // 2. Yetenek 1 (Zeus Çatlağı)
    this.btnSkill1 = this.scene.add.image(atkX - 70, atkY - 10, 'touch-btn-skill1')
      .setScrollFactor(0).setDepth(200).setInteractive();

    this.btnSkill1.on('pointerdown', () => {
      if (this.scene.player) this.scene.player.castSkill1();
    });

    // 3. Yetenek 2 (Dorik Kalkan)
    this.btnSkill2 = this.scene.add.image(atkX - 25, atkY - 70, 'touch-btn-skill2')
      .setScrollFactor(0).setDepth(200).setInteractive();

    this.btnSkill2.on('pointerdown', () => {
      if (this.scene.player) this.scene.player.castSkill2();
    });

    // 4. Utility Yetenek Butonu (Gölge Karışımı / Space Tuşu Alternatifi)
    this.btnUtility = this.scene.add.image(atkX - 110, atkY - 45, 'touch-btn-utility')
      .setScrollFactor(0).setDepth(200).setInteractive();

    this.btnUtility.on('pointerdown', () => {
      if (this.scene.player && typeof this.scene.player.castUtilitySkill === 'function') {
        this.scene.player.castUtilitySkill();
      }
    });

    // 5. Etkileşim Butonu (Sunak / Altar / Macellum E Tuşu)
    this.btnInteract = this.scene.add.image(atkX - 80, atkY - 80, 'touch-btn-interact')
      .setScrollFactor(0).setDepth(200).setInteractive();

    this.btnInteract.on('pointerdown', () => {
      if (this.scene.player && (this.scene.player.isInBase || this.scene.nearAltar)) {
        this.scene.scene.launch('ShopScene');
      }
    });

    // 6. Menü Butonu (Sağ Üst)
    this.btnMenu = this.scene.add.image(this.scene.scale.width - 35, 35, 'touch-btn-menu')
      .setScrollFactor(0).setDepth(200).setInteractive();

    this.btnMenu.on('pointerdown', () => {
      this.scene.scene.launch('InventoryScene');
    });
  }

  updateJoystick(pointer) {
    const maxRadius = 45;
    const dx = pointer.x - this.joystickBase.x;
    const dy = pointer.y - this.joystickBase.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= maxRadius) {
      this.joystickThumb.setPosition(pointer.x, pointer.y);
      this.vector = { x: dx / maxRadius, y: dy / maxRadius };
    } else {
      const angle = Math.atan2(dy, dx);
      this.joystickThumb.setPosition(
        this.joystickBase.x + Math.cos(angle) * maxRadius,
        this.joystickBase.y + Math.sin(angle) * maxRadius
      );
      this.vector = { x: Math.cos(angle), y: Math.sin(angle) };
    }
  }

  isActive() {
    return this.active;
  }

  getVector() {
    return this.vector;
  }

  destroy() {
    if (this.joystickBase) this.joystickBase.destroy();
    if (this.joystickThumb) this.joystickThumb.destroy();
    if (this.btnAttack) this.btnAttack.destroy();
    if (this.btnSkill1) this.btnSkill1.destroy();
    if (this.btnSkill2) this.btnSkill2.destroy();
    if (this.btnUtility) this.btnUtility.destroy();
    if (this.btnInteract) this.btnInteract.destroy();
    if (this.btnMenu) this.btnMenu.destroy();
  }
}
