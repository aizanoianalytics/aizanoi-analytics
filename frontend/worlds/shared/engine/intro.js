/**
 * intro.js — Cinematic Flyover & Opening Sequence
 * Athens 450-430 BCE · AAA Rebuild
 */

import * as THREE from '../vendor/three.module.js';

export class IntroSequence {
  constructor(camera, scene, controls) {
    this.camera = camera;
    this.scene = scene;
    this.controls = controls;

    this.isComplete = false;
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
      <h1 class="cinematic-title__heading">ATHENS</h1>
      <p class="cinematic-title__subtitle">450–430 BCE · THE PERICLEAN GOLDEN AGE</p>
      <div class="cinematic-title__skip">[Press ESC to skip intro]</div>
    `;
    document.body.appendChild(this.overlay);
  }

  start() {
    this.isComplete = false;
    this.progress = 0;
    this.controls.disable();

    const onUserAction = () => {
      this.skipIntro();
    };
    window.addEventListener('player-movement-start', onUserAction, { once: true });
    window.addEventListener('keydown', (e) => {
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Escape','w','a','s','d'].includes(e.code) || ['w','a','s','d'].includes(e.key?.toLowerCase())) {
        this.skipIntro();
      }
    }, { once: true });

    // Fade in title overlay
    if (this.overlay) {
      this.overlay.style.display = 'block';
      setTimeout(() => { if (this.overlay) this.overlay.style.opacity = '1'; }, 200);
    }
  }

  skipIntro() {
    if (this.isComplete) return;
    this.progress = 1.0;
    this.finish();
  }

  update(dt) {
    if (this.isComplete) return;

    this.progress += dt / this.duration;

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
