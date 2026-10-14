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

    // A button texture may be absent when the deferred enhancement queue has
    // not run yet: fall back to a labelled circle rather than a missing frame.
    this.mkBtn = (x, y, key, label) => {
      try {
        if (this.scene.textures?.exists?.(key)) {
          return this.scene.add.image(x, y, key).setScrollFactor(0).setDepth(200).setInteractive();
        }
      } catch (_) {}
      const fallback = this.scene.add.circle(x, y, 26, 0x1a2338, 0.85)
        .setScrollFactor(0).setDepth(200).setStrokeStyle(2, 0xc5a059).setInteractive();
      if (label) {
        this.fallbackLabels = this.fallbackLabels || [];
        const text = this.scene.add.text(x, y, label, { fontSize: '11px', color: '#f5d77f', fontStyle: 'bold' })
          .setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.fallbackLabels.push(text);
        fallback.fallbackLabel = text;
      }
      return fallback;
    };

    // Joystick elements
    const baseX = 90;
    const baseY = this.scene.scale.height - 90;

    const hasJoyTex = (() => {
      try {
        return this.scene.textures?.exists?.('touch-joystick-base') && this.scene.textures?.exists?.('touch-joystick-thumb');
      } catch (_) { return false; }
    })();
    if (hasJoyTex) {
      this.joystickBase = this.scene.add.image(baseX, baseY, 'touch-joystick-base')
        .setScrollFactor(0).setDepth(200).setAlpha(0.65).setInteractive();
      this.joystickThumb = this.scene.add.image(baseX, baseY, 'touch-joystick-thumb')
        .setScrollFactor(0).setDepth(201).setAlpha(0.85);
    } else {
      this.joystickBase = this.scene.add.circle(baseX, baseY, 45, 0x1a2338, 0.55)
        .setScrollFactor(0).setDepth(200).setStrokeStyle(2, 0xc5a059).setInteractive();
      this.joystickThumb = this.scene.add.circle(baseX, baseY, 20, 0xc5a059, 0.8)
        .setScrollFactor(0).setDepth(201);
    }

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
    this.btnAttack = this.mkBtn(atkX, atkY, 'touch-btn-attack', 'ATK');

    this.btnAttack.on('pointerdown', () => {
      if (this.scene.player) this.scene.player.attack();
    });

    // 2. Yetenek 1 (Zeus Çatlağı)
    this.btnSkill1 = this.mkBtn(atkX - 70, atkY - 10, 'touch-btn-skill1', 'Q');

    this.btnSkill1.on('pointerdown', () => {
      if (this.scene.player) this.scene.player.castSkill1();
    });

    // 3. Yetenek 2 (Dorik Kalkan)
    this.btnSkill2 = this.mkBtn(atkX - 25, atkY - 70, 'touch-btn-skill2', 'R');

    this.btnSkill2.on('pointerdown', () => {
      if (this.scene.player) this.scene.player.castSkill2();
    });

    // 4. Utility Yetenek Butonu (Gölge Karışımı / Space Tuşu Alternatifi)
    this.btnUtility = this.mkBtn(atkX - 110, atkY - 45, 'touch-btn-utility', 'SHD');

    this.btnUtility.on('pointerdown', () => {
      if (this.scene.player && typeof this.scene.player.castUtilitySkill === 'function') {
        this.scene.player.castUtilitySkill();
      }
    });

    // 5. Etkileşim Butonu: klavye E ile aynı yol (shrine/merchant/treasure),
    // yalnızca base shop değil.
    this.btnInteract = this.mkBtn(atkX - 80, atkY - 80, 'touch-btn-interact', 'E');

    this.btnInteract.on('pointerdown', () => {
      if (typeof this.scene.touchInteract === 'function') this.scene.touchInteract();
    });

    // 6. Dash Butonu: çekirdek savunma mekaniği mobilde de aynı metodu çağırır.
    this.btnDash = this.mkBtn(atkX - 150, atkY - 100, 'touch-btn-dash', 'DASH');

    this.btnDash.on('pointerdown', () => {
      if (this.scene.player && typeof this.scene.player.startDash === 'function') {
        this.scene.player.startDash();
      }
    });

    // 6. Menü Butonu (Sağ Üst)
    this.btnMenu = this.mkBtn(this.scene.scale.width - 35, 35, 'touch-btn-menu', '≡');

    this.btnMenu.on('pointerdown', () => {
      if (typeof this.scene.toggleExitMenu === 'function') this.scene.toggleExitMenu();
      else this.scene.scene.launch('InventoryScene');
    });
    [this.btnAttack, this.btnSkill1, this.btnSkill2, this.btnUtility, this.btnInteract, this.btnDash].forEach((btn) => {
      if (btn) btn.setScale(1.12).setAlpha(0.92);
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
    if (this.btnDash) this.btnDash.destroy();
    if (this.btnMenu) this.btnMenu.destroy();
    if (this.fallbackLabels) {
      for (const label of this.fallbackLabels) {
        try { label.destroy(); } catch (_) {}
      }
      this.fallbackLabels = null;
    }
    this.active = false;
  }
}
