// Compatibility bridge for behaviours preserved from the pre-modular worlds.
// Keeps deep-link jumps and the historical debug API stable while the renderer
// itself is shared by every city.

export function installCityCompatibility(runtime, { ui = 'standard' } = {}) {
  const debug = runtime?.debug;
  const canvas = document.querySelector('#glCanvas');
  if (!debug) return runtime;

  // Browser smoke tools and external helpers historically called `teleport`.
  // Keep it as a stable alias to the new explicit method name.
  if (!debug.teleport && debug.teleportTo) debug.teleport = (...args) => debug.teleportTo(...args);

  const params = new URL(location.href).searchParams;
  const jump = params.get('jump');
  if (jump && debug.landmarks?.some((record) => record.id === jump)) {
    const enter = ui === 'aizanoi' ? document.querySelector('#enterBtn') : document.querySelector('#enter');
    // The click path flips the runtime into its active state and keeps all UI
    // startup side effects identical to a normal user entry.
    enter?.click();
    debug.teleportTo(jump, { lock: false });
    const clean = new URL(location.href);
    clean.searchParams.delete('jump');
    history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
  }

  // Preserve immediate mouse-look acquisition on a real pointer gesture. The
  // runtime also supports click-to-lock; pointerdown means drag workflows start
  // turning during the gesture instead of only after mouseup.
  const coarse = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  if (canvas && !coarse) {
    canvas.addEventListener('pointerdown', () => {
      if (document.pointerLockElement === canvas) return;
      try { canvas.requestPointerLock?.(); } catch (_) {}
    }, { passive: true });
  }

  return runtime;
}
