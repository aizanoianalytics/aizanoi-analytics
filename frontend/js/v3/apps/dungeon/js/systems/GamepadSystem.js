// Section 22: "Audit gamepad support. If reasonably implementable without
// architectural damage, add good gamepad support."
//
// There was none. Movement read the touch joystick or the keyboard and nothing
// else, so a controller was a dead peripheral: not broken, simply ignored. This
// is deliberately a small reader rather than a rebinding layer -- it translates
// the standard mapping into the same three intents the game already has
// (move vector, attack, secondary), so it adds no new state machine and no new
// place for a control path to diverge.
// The standard gamepad mapping. A gamepad is only ever consulted through these,
// so a non-standard pad still gets the controls it can offer.
const DEADZONE = 0.24;
const BUTTON = {
  attack: 0,   // A / cross
  secondary: 2, // X / square
  dash: 1,      // B / circle
  confirm: 9,   // start
  pause: 8         // select
};

/** Stick and d-pad, combined, as one normalised vector. */
export function readMoveVector(pad) {
  if (!pad) return { x: 0, y: 0 };
  const l = pad.axes?.[0] ?? 0;
  const up = pad.axes?.[1] ?? 0;
  let x = Math.abs(l) > DEADZONE ? l : 0;
  let y = Math.abs(up) > DEADZONE ? up : 0;
  // A d-pad counts as movement too: many players use it, and on some pads the
  // stick drifts.
  const d = (i) => (pad.buttons?.[i]?.pressed ? 1 : 0);
  if (!x && !y) {
    x = d(15) - d(14); // right - left
    y = d(13) - d(12); // down - up
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

export function isButtonDown(pad, name) {
  const i = BUTTON[name];
  if (i === undefined || !pad) return false;
  return Boolean(pad.buttons?.[i]?.pressed);
}

export function anyGamepadConnected() {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.getGamepads === 'function'
      && Array.from(navigator.getGamepads()).some((p) => p && p.connected);
  } catch (_) {
    return false;
  }
}

/** The first connected pad, or null. Cached per frame by the caller, not here. */
export function activePad() {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
  } catch (_) {}
  return null;
}

/**
 * Per-frame intent, edge-triggered for the buttons. Held state lives here rather
 * than in the entity, so a controller input cannot leave an attack stuck on when
 * the pad disconnects mid-press.
 */
export class GamepadInput {
  constructor() {
    this.prev = {};
    this.lastSeen = 0;
    this.connected = false;
  }

  /** Call once per frame. Returns { move, pressed, held, connected }. */
  sample() {
    const pad = activePad();
    this.connected = Boolean(pad);
    if (pad) this.lastSeen = Date.now();

    const held = {};
    const pressed = {};
    for (const name of Object.keys(BUTTON)) {
      const down = isButtonDown(pad, name);
      held[name] = down;
      pressed[name] = down && !this.prev[name];
      this.prev[name] = down;
    }
    return { move: readMoveVector(pad), pressed, held, connected: this.connected };
  }

  /** True when a pad was in use recently, so the HUD can hint at it. */
  recentlyUsed(windowMs = 8000) {
    return this.connected && Date.now() - this.lastSeen < windowMs;
  }
}

export { BUTTON as GAMEPAD_BUTTONS };
