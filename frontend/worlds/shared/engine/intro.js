/**
 * intro.js — Cinematic Flyover & Opening Sequence (per-world shared runtime)
 * Default curve targets Athens; each world overrides .curve/.lookAtCurve in main.js.
 */

import * as THREE from '../vendor/three.module.js';

export class IntroSequence {
  constructor(camera, scene, controls, opts = {}) {
    this.camera = camera;
    this.scene = scene;
    this.controls = controls;

    // Per-world overlay text (defaults preserve Athens legacy copy).
    this.heading  = opts.heading  || 'ATHENS';
    this.subtitle = opts.subtitle || '450–430 BCE · THE PERICLEAN GOLDEN AGE';

    this.isComplete = false;
    this.isRunning = false;
    this.onComplete = null;
    this.progress = 0;
    this.duration = 7.5; // 7.5 second cinematic flyover

    // 3D camera trajectory: High Acropolis overlook -> sweep through Agora -> arrive at Dipylon
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-50, 220, -330),  // High above Parthenon
      new THREE.Vector3(20, 110, -180),   // Descending over Acropolis north slope
      new THREE.Vector3(120, 45, 30),     // Sweeping past Agora & Stoa Poikile
      new THREE.Vector3(250, 18, 180),    // Following the Panathenaic route
      new THREE.Vector3(340, 1.7, 280),   // Touchdown at Dipylon Gate (SPAWN)
    ]);

    // Target focal points corresponding to each phase
    this.lookAtCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-50, 16, -330),   // Looking down at Parthenon
      new THREE.Vector3(110, 8, 10),      // Looking toward the Agora civic center
      new THREE.Vector3(60, 8, 140),      // Looking at Hephaisteion
      new THREE.Vector3(360, 8, 260),     // Looking toward the Dipylon Gate towers
      new THREE.Vector3(240, 1.7, 200),   // Looking inward along the Panathenaic Way
    ]);

    this._createIntroOverlay();
  }

  _createIntroOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'cinematic-title';
    this.overlay.className = 'cinematic-title';
    this.overlay.innerHTML = `
      <h1 class="cinematic-title__heading"></h1>
      <p class="cinematic-title__subtitle"></p>
      <div class="cinematic-title__skip">[Press ESC or tap to skip intro]</div>
    `;
    // The overlay itself is pointer-events:none (it must never block the HUD).
    // The skip listener is installed by start(), after the Enter button's own
    // pointerdown has completed, so that opening tap cannot consume it.
    this._skipHandler = null;
    document.body.appendChild(this.overlay);
  }

  start() {
    if (this.isRunning) return false;
    this.isComplete = false;
    this.isRunning = true;
    this.progress = 0;
    this._startWallTime = performance.now();
    this.controls.disable();

    // Touch devices have no Escape key. Arm this only after start() is called:
    // the pointerdown that produced the Enter click has already bubbled away.
    if (!this._skipHandler) {
      this._skipHandler = () => this.skipIntro();
      window.addEventListener('pointerdown', this._skipHandler);
    }

    const onUserAction = () => {
      this.skipIntro();
    };
    window.addEventListener('player-movement-start', onUserAction, { once: true });
    window.addEventListener('keydown', (e) => {
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape','w','a','s','d'].includes(e.code) || ['w','a','s','d'].includes(e.key?.toLowerCase())) {
        this.skipIntro();
      }
    }, { once: true });

    // Apply per-world text on each start() so the same instance can be reused
    if (this.overlay) {
      const h = this.overlay.querySelector('.cinematic-title__heading');
      const s = this.overlay.querySelector('.cinematic-title__subtitle');
      if (h) h.textContent = this.heading;
      if (s) s.textContent = this.subtitle;
      this.overlay.style.display = 'block';
      setTimeout(() => { if (this.overlay) this.overlay.style.opacity = '1'; }, 200);
    }

    // Hard fallback: if the render loop's rAF is throttled/paused (headless
    // captures, background tabs, aggressive mobile power saving), update() never
    // reaches 1.0 and the player stays stranded mid-flight with controls locked.
    // A wall-clock timer guarantees the flyover ends no matter what.
    if (this._fallbackTimer) clearTimeout(this._fallbackTimer);
    this._fallbackTimer = setTimeout(() => {
      if (!this.isComplete) this.skipIntro();
    }, (this.duration * 1.2 + 2.0) * 1000);
    return true;
  }

  skipIntro() {
    if (!this.isRunning || this.isComplete) return false;
    this.progress = 1.0;
    this.finish();
    return true;
  }

  update(dt) {
    if (this.isComplete) return;

    // Frame-rate independence: advance by wall-clock time, not raw frame delta.
    // On slow renderers (software GL, throttled Safari tabs) clamped per-frame dt
    // made the flyover crawl along at 2-3 fps and left players stuck mid-air on
    // the curve for 30+ seconds — the "can't get into the game" symptom.
    if (this._startWallTime !== undefined) {
      const elapsed = (performance.now() - this._startWallTime) / 1000;
      const wallProgress = elapsed / this.duration;
      // Take the larger of delta-accumulated and wall-clock progress so fast
      // renderers keep the smooth eased path, but slow ones still finish on time.
      this.progress = Math.max(this.progress + dt / this.duration, wallProgress);
    } else {
      this.progress += dt / this.duration;
    }

    // Fade out title halfway through
    if (this.progress > 0.45 && this.overlay && this.overlay.style.opacity === '1') {
      this.overlay.style.opacity = '0';
    }

    if (this.progress >= 1.0) {
      this.finish();
      return;
    }

    // Cubic smooth step for camera curve progress
    const t = this.progress;
    const easeT = t * t * (3.0 - 2.0 * t);

    const pos = this.curve.getPoint(easeT);
    this.camera.position.copy(pos);

    const lookTarget = this.lookAtCurve.getPoint(easeT);
    this.camera.lookAt(lookTarget);
  }

  finish() {
    if (this.isComplete) return;
    this.isComplete = true;
    this.isRunning = false;

    if (this._skipHandler) {
      window.removeEventListener('pointerdown', this._skipHandler);
      this._skipHandler = null;
    }
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }

    if (this.overlay) {
      this.overlay.style.opacity = '0';
      setTimeout(() => { if (this.overlay) this.overlay.style.display = 'none'; }, 800);
    }

    // Final position at end of curve (the world's actual spawn point)
    const endPoint = this.curve.points[this.curve.points.length - 1];
    if (endPoint) {
      this.camera.position.copy(endPoint);
    }
    const endLook = this.lookAtCurve.points[this.lookAtCurve.points.length - 1];
    if (endLook) {
      this.camera.lookAt(endLook);
    }

    if (this.onComplete) {
      this.onComplete();
    }
  }
}
