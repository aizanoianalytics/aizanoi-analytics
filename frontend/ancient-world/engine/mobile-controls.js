// Shared mobile first-person controls for all Ancient World city experiences.
// Mirrors the proven Aizanoi interaction model: analog left-thumb movement,
// right-side drag look, hold-to-run and compact action buttons.

function safeCapture(element, pointerId) {
  try { element?.setPointerCapture?.(pointerId); } catch (_) {}
}

export function installMobileControls({
  canvas,
  lifecycle,
  enabled = true,
  isActive = () => true,
  isBlocked = () => false,
  onLook = () => {},
  onInspect = () => {},
  onMap = () => {},
  root = document,
  deadzone = 0.08,
  lookSensitivityX = 0.006,
  lookSensitivityY = 0.0054,
} = {}) {
  const state = { moveX: 0, moveY: 0, running: false };
  const pad = root.querySelector('#movePad');
  const knob = root.querySelector('#moveKnob');
  const run = root.querySelector('#mobileRun');
  const inspect = root.querySelector('#mobileInspect');
  const map = root.querySelector('#mobileMap');
  const controls = root.querySelector('#mobileControls');

  const listen = (target, type, handler, options) => {
    if (!target) return;
    if (lifecycle?.listen) lifecycle.listen(target, type, handler, options);
    else target.addEventListener(type, handler, options);
  };

  const resetMove = () => {
    state.moveX = 0;
    state.moveY = 0;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
  };
  const reset = () => {
    resetMove();
    state.running = false;
    run?.classList.remove('primaryTouch');
  };

  if (!enabled || !pad || !knob || !canvas) {
    controls?.setAttribute('hidden', '');
    return {
      snapshot: () => ({ ...state }),
      reset,
      destroy: reset,
    };
  }

  document.body.classList.add('ancientTouchMode');
  controls?.removeAttribute('hidden');

  let joyId = null;
  listen(pad, 'pointerdown', (event) => {
    if (!isActive() || isBlocked()) return;
    joyId = event.pointerId;
    safeCapture(pad, event.pointerId);
    event.preventDefault();
  });
  listen(pad, 'pointermove', (event) => {
    if (event.pointerId !== joyId || !isActive() || isBlocked()) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radius = Math.min(rect.width, rect.height) * 0.315;
    const magnitude = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, radius / magnitude);
    const px = dx * scale;
    const py = dy * scale;
    let x = Math.max(-1, Math.min(1, px / radius));
    let y = Math.max(-1, Math.min(1, py / radius));
    if (Math.abs(x) < deadzone) x = 0;
    if (Math.abs(y) < deadzone) y = 0;
    state.moveX = x;
    state.moveY = y;
    knob.style.transform = `translate(${px}px, ${py}px)`;
    event.preventDefault();
  });
  const endJoy = (event) => {
    if (event?.pointerId != null && joyId != null && event.pointerId !== joyId) return;
    joyId = null;
    resetMove();
  };
  listen(pad, 'pointerup', endJoy);
  listen(pad, 'pointercancel', endJoy);
  listen(pad, 'lostpointercapture', endJoy);

  const runOn = (event) => {
    if (!isActive() || isBlocked()) return;
    state.running = true;
    run?.classList.add('primaryTouch');
    safeCapture(run, event.pointerId);
    event.preventDefault();
  };
  const runOff = (event) => {
    state.running = false;
    run?.classList.remove('primaryTouch');
    event?.preventDefault?.();
  };
  listen(run, 'pointerdown', runOn);
  listen(run, 'pointerup', runOff);
  listen(run, 'pointercancel', runOff);
  listen(run, 'lostpointercapture', runOff);

  let lookId = null;
  let lastX = 0;
  let lastY = 0;
  listen(canvas, 'pointerdown', (event) => {
    if (!isActive() || isBlocked() || event.clientX < innerWidth * 0.35) return;
    lookId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    safeCapture(canvas, event.pointerId);
    event.preventDefault();
  });
  listen(canvas, 'pointermove', (event) => {
    if (event.pointerId !== lookId || !isActive() || isBlocked()) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (Math.hypot(dx, dy) < 1.25) return;
    onLook(dx * lookSensitivityX, dy * lookSensitivityY);
    event.preventDefault();
  });
  const endLook = (event) => {
    if (event?.pointerId === lookId) lookId = null;
  };
  listen(canvas, 'pointerup', endLook);
  listen(canvas, 'pointercancel', endLook);
  listen(canvas, 'lostpointercapture', endLook);

  listen(inspect, 'click', (event) => { event.preventDefault(); if (!isBlocked()) onInspect(); });
  listen(map, 'click', (event) => { event.preventDefault(); if (!isBlocked()) onMap(); });
  listen(window, 'blur', reset);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });

  lifecycle?.addCleanup?.(() => {
    reset();
    document.body.classList.remove('ancientTouchMode');
  });

  return {
    snapshot: () => ({ ...state }),
    reset,
    destroy: reset,
  };
}
