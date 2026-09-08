/**
 * controls.js — Unified Desktop + Mobile Input System
 * Aizanoi Analytics unified worlds runtime (originally Athens 450-430 BCE reference implementation)
 *
 * Desktop: PointerLockControls (mouse look + WASD)
 * Mobile:  Virtual joystick (left) + touch-look (right)
 *
 * Exposes a unified input state consumed by the physics/movement loop.
 */

import * as THREE from '../vendor/three.module.js';

/* ── Constants ────────────────────────────────────────────── */

const MOVE_SPEED = 28;       // units/sec walking
const RUN_MULTIPLIER = 2.2;  // sprint factor
const JUMP_IMPULSE = 12;     // vertical velocity on jump
const MOUSE_SENSITIVITY = 0.002;
const TOUCH_SENSITIVITY = 0.004;
const JOYSTICK_DEADZONE = 0.08;
const PITCH_MIN = -Math.PI * 0.42;
const PITCH_MAX = Math.PI * 0.42;

/* ── Unified input state ──────────────────────────────────── */

export const inputState = {
  forward: 0,   // -1 to 1
  strafe: 0,    // -1 to 1
  yawDelta: 0,
  pitchDelta: 0,
  jump: false,
  run: false,
  interact: false,
};

/* ── Controls class ───────────────────────────────────────── */

export class Controls {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} container - DOM container for UI elements
   */
  constructor(camera, canvas, container) {
    this.camera = camera;
    this.canvas = canvas;
    this.container = container;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isMobile = this._detectMobile();
    this.isLocked = false;
    this.enabled = false;

    // Keyboard state
    this._keys = new Set();

    // Touch state
    this._moveTouchId = null;
    this._lookTouchId = null;
    this._joystickOrigin = { x: 0, y: 0 };
    this._joystickCurrent = { x: 0, y: 0 };

    // DOM refs
    this._movePad = null;
    this._moveKnob = null;

    this._initDesktop();
    if (this.isMobile) {
      this._initMobile();
    }
  }

  /* ── Device detection ─────────────────────────────────── */

  _detectMobile() {
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) && window.innerWidth < 768;
    return isMobileUA || isSmallTouch;
  }

  /* ═══════════════════════════════════════════════════════
     DESKTOP — Pointer Lock + Keyboard + Drag Look
     ═══════════════════════════════════════════════════════ */

  _initDesktop() {
    let isMouseDown = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    // Click to request PointerLock
    this.canvas.addEventListener('click', () => {
      if (!this.enabled) this.enable();
      if (!this.isLocked && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    });

    // Mouse drag fallback (works even without pointer lock)
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        isMouseDown = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    // Mouse move handling
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.isLocked) {
        inputState.yawDelta -= e.movementX * MOUSE_SENSITIVITY;
        inputState.pitchDelta -= e.movementY * MOUSE_SENSITIVITY;
      } else if (isMouseDown) {
        const dx = e.clientX - prevMouseX;
        const dy = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
        inputState.yawDelta -= dx * MOUSE_SENSITIVITY * 1.2;
        inputState.pitchDelta -= dy * MOUSE_SENSITIVITY * 1.2;
      }
    });

    // Keyboard handling — always active!
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';

      this._keys.add(code);
      if (key) this._keys.add(key);

      // Notify that user wants to move (skips intro if active)
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','w','a','s','d'].includes(code) || ['w','a','s','d'].includes(key)) {
        window.dispatchEvent(new CustomEvent('player-movement-start'));
      }

      if (code === 'Space') {
        e.preventDefault();
        inputState.jump = true;
      }
      if (code === 'KeyE' || code === 'KeyF' || key === 'e' || key === 'f') {
        inputState.interact = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';
      this._keys.delete(code);
      if (key) this._keys.delete(key);

      if (code === 'Space') inputState.jump = false;
      if (code === 'KeyE' || code === 'KeyF' || key === 'e' || key === 'f') inputState.interact = false;
    });
  }

  /* ═══════════════════════════════════════════════════════
     MOBILE — Virtual Joystick + Touch Look
     ═══════════════════════════════════════════════════════ */

  _initMobile() {
    document.body.classList.add('mobile');

    const mobileUI = document.getElementById('mobile-controls');
    if (mobileUI) mobileUI.hidden = false;

    this._movePad = document.getElementById('movePad');
    this._moveKnob = document.getElementById('moveKnob');

    // Joystick now drives movement directly: bind touch listeners to the pad
    // element itself so the user's tap lands on the visible control. Canvas
    // listeners are kept ONLY for the right-half look area.
    const pad = this._movePad;
    if (pad) {
      pad.addEventListener('touchstart', (e) => this._onJoystickStart(e), { passive: false });
      pad.addEventListener('touchmove',  (e) => this._onJoystickMove(e),  { passive: false });
      pad.addEventListener('touchend',   (e) => this._onJoystickEnd(e),   { passive: false });
      pad.addEventListener('touchcancel',(e) => this._onJoystickEnd(e),   { passive: false });
    }

    // Right-half look: still canvas-scoped (no visible control there)
    this.canvas.addEventListener('touchstart', (e) => this._onLookStart(e), { passive: false });
    this.canvas.addEventListener('touchmove',  (e) => this._onLookMove(e),  { passive: false });
    this.canvas.addEventListener('touchend',   (e) => this._onLookEnd(e),   { passive: false });
    this.canvas.addEventListener('touchcancel',(e) => this._onLookEnd(e),   { passive: false });

    // Mobile buttons
    const runBtn = document.getElementById('btn-mobile-run');
    if (runBtn) {
      runBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        inputState.run = true;
        runBtn.classList.add('active');
      });
      runBtn.addEventListener('touchend', () => {
        inputState.run = false;
        runBtn.classList.remove('active');
      });
    }

    const inspectBtn = document.getElementById('btn-mobile-inspect');
    if (inspectBtn) {
      inspectBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        inputState.interact = true;
      });
      inspectBtn.addEventListener('touchend', () => {
        inputState.interact = false;
      });
    }

    // Jump on double-tap (right side)
    let lastTap = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      const now = Date.now();
      const touch = e.changedTouches[0];
      if (touch.clientX > window.innerWidth * 0.5) {
        if (now - lastTap < 300) {
          inputState.jump = true;
          setTimeout(() => { inputState.jump = false; }, 100);
        }
        lastTap = now;
      }
    });
  }

  _onJoystickStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this._moveTouchId !== null) return;
    const touch = e.changedTouches[0];
    this._moveTouchId = touch.identifier;
    this._joystickOrigin.x = touch.clientX;
    this._joystickOrigin.y = touch.clientY;
    this._joystickCurrent.x = touch.clientX;
    this._joystickCurrent.y = touch.clientY;

    if (this._movePad) {
      this._movePad.style.left = `${touch.clientX}px`;
      this._movePad.style.top = `${touch.clientY}px`;
      this._movePad.classList.add('active');
    }
  }

  _onJoystickMove(e) {
    if (!this.enabled) return;
    e.preventDefault();

    for (const touch of e.changedTouches) {
      if (touch.identifier !== this._moveTouchId) continue;
      this._joystickCurrent.x = touch.clientX;
      this._joystickCurrent.y = touch.clientY;

      const dx = touch.clientX - this._joystickOrigin.x;
      const dy = touch.clientY - this._joystickOrigin.y;
      const maxRadius = 50;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampDist = Math.min(dist, maxRadius);
      const angle = Math.atan2(dy, dx);
      const knobX = Math.cos(angle) * clampDist;
      const knobY = Math.sin(angle) * clampDist;

      if (this._moveKnob) {
        this._moveKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
      }
    }
  }

  _onJoystickEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== this._moveTouchId) continue;
      this._moveTouchId = null;
      if (this._moveKnob) this._moveKnob.style.transform = 'translate(0, 0)';
      if (this._movePad) this._movePad.classList.remove('active');
    }
  }

  _onLookStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this._lookTouchId !== null) return;
    for (const touch of e.changedTouches) {
      if (touch.clientX >= window.innerWidth * 0.5) {
        this._lookTouchId = touch.identifier;
        this._lastLookX = touch.clientX;
        this._lastLookY = touch.clientY;
        break;
      }
    }
  }

  _onLookMove(e) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier !== this._lookTouchId) continue;
      const dx = touch.clientX - this._lastLookX;
      const dy = touch.clientY - this._lastLookY;
      inputState.yawDelta   -= dx * TOUCH_SENSITIVITY;
      inputState.pitchDelta -= dy * TOUCH_SENSITIVITY;
      this._lastLookX = touch.clientX;
      this._lastLookY = touch.clientY;
    }
  }

  _onLookEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === this._lookTouchId) {
        this._lookTouchId = null;
        break;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     UPDATE — Called every frame to sync input state
     ═══════════════════════════════════════════════════════ */

  update(dt) {
    if (!this.enabled) {
      inputState.forward = 0;
      inputState.strafe = 0;
      inputState.yawDelta = 0;
      inputState.pitchDelta = 0;
      return;
    }

    /* ── Keyboard input (always active!) ─────────────── */
    inputState.forward = 0;
    inputState.strafe = 0;
    inputState.run = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');

    if (this._keys.has('KeyW') || this._keys.has('ArrowUp') || this._keys.has('w'))    inputState.forward += 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown') || this._keys.has('s'))  inputState.forward -= 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft') || this._keys.has('a'))  inputState.strafe -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight') || this._keys.has('d')) inputState.strafe += 1;

    /* ── Mobile joystick (overrides if touch active) ─── */
    if (this.isMobile && this._moveTouchId !== null) {
      const dx = this._joystickCurrent.x - this._joystickOrigin.x;
      const dy = this._joystickCurrent.y - this._joystickOrigin.y;
      const maxRadius = 50;
      const normX = Math.max(-1, Math.min(1, dx / maxRadius));
      const normY = Math.max(-1, Math.min(1, dy / maxRadius));

      const joyStrafe = Math.abs(normX) > JOYSTICK_DEADZONE ? normX : 0;
      const joyForward = Math.abs(normY) > JOYSTICK_DEADZONE ? -normY : 0; // inverted Y
      if (Math.abs(joyStrafe) > 0.05 || Math.abs(joyForward) > 0.05) {
        inputState.strafe = joyStrafe;
        inputState.forward = joyForward;
      }
    }

    /* ── Apply camera rotation ────────────────────────── */
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y += inputState.yawDelta;
    this.euler.x += inputState.pitchDelta;
    this.euler.x = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);

    // Reset deltas after consumption
    inputState.yawDelta = 0;
    inputState.pitchDelta = 0;
  }

  /* ── Movement vector (world-space) ──────────────────── */

  /**
   * Returns the desired movement velocity vector in world space.
   * Does NOT apply collision — that's handled by collision.js.
   */
  getMovementVector(dt) {
    const speed = MOVE_SPEED * (inputState.run ? RUN_MULTIPLIER : 1);
    const velocity = new THREE.Vector3();

    // Forward/backward (camera direction projected to XZ plane)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // Strafe (perpendicular)
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    velocity.addScaledVector(forward, inputState.forward * speed * dt);
    velocity.addScaledVector(right, inputState.strafe * speed * dt);

    return velocity;
  }

  /**
   * Get jump impulse if jump was requested.
   */
  getJumpImpulse() {
    if (inputState.jump) {
      inputState.jump = false;
      return JUMP_IMPULSE;
    }
    return 0;
  }

  /* ── Enable/disable ─────────────────────────────────── */

  enable() {
    this.enabled = true;
    if (this.isMobile) {
      const mobileUI = document.getElementById('mobile-controls');
      if (mobileUI) mobileUI.hidden = false;
    }
  }

  disable() {
    this.enabled = false;
    inputState.forward = 0;
    inputState.strafe = 0;
    inputState.jump = false;
    inputState.run = false;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /* ── Camera position helpers ────────────────────────── */

  /** Set camera position and look direction */
  teleportTo(x, z, angle, y = 1.7) {
    this.camera.position.set(x, y, z);
    this.euler.set(0, angle, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
  }

  /** Smooth camera transition (returns a tween-like updater) */
  smoothMoveTo(targetX, targetZ, targetAngle, duration = 1.5) {
    const startPos = this.camera.position.clone();
    const startYaw = this.euler.y;
    const endPos = new THREE.Vector3(targetX, 1.7, targetZ);
    let elapsed = 0;

    // Shortest angle difference
    let angleDiff = targetAngle - startYaw;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    return {
      active: true,
      update: (dt) => {
        elapsed += dt;
        const t = Math.min(1, elapsed / duration);
        const ease = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2; // cubic ease in-out

        this.camera.position.lerpVectors(startPos, endPos, ease);
        this.euler.y = startYaw + angleDiff * ease;
        this.euler.x = this.euler.x * (1 - ease * 0.5); // gradually level pitch
        this.camera.quaternion.setFromEuler(this.euler);

        if (t >= 1) this.active = false;
        return this.active;
      },
    };
  }

  /* ── Dispose ────────────────────────────────────────── */

  dispose() {
    // Note: event listeners are not removed for simplicity;
    // in a full teardown, store and remove them.
    this.disable();
  }
}

/* ── Export constants for external use ─────────────────── */
export { MOVE_SPEED, RUN_MULTIPLIER, JUMP_IMPULSE };
