// Compatibility bridge for behaviours preserved from the pre-modular worlds.
// Keeps deep-link jumps, authored landmark arrivals and the historical debug API
// stable while the renderer itself is shared by every city.

const DEFAULT_DIRECTIONS = Object.freeze([
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
]);
const FIRST_STEP_DISTANCE = 1.35;

function normalizedDirection(direction) {
  const x = Number(direction?.[0] || 0);
  const z = Number(direction?.[1] || 0);
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

function hasFirstStepClearance(debug, x, z) {
  if (debug.collide?.(x, z)) return false;
  return DEFAULT_DIRECTIONS.some((direction) => {
    const [dx, dz] = normalizedDirection(direction);
    return !debug.collide?.(x + dx * 0.35, z + dz * 0.35) &&
      !debug.collide?.(x + dx * FIRST_STEP_DISTANCE, z + dz * FIRST_STEP_DISTANCE);
  });
}

function applyAuthoredLandmarkFraming(debug) {
  if (!debug?.teleportViews || !Array.isArray(debug.landmarks)) return;

  for (const record of debug.landmarks) {
    const framing = record?.framing;
    if (!framing || !Number.isFinite(Number(framing.distance))) continue;

    const distance = Math.max(8, Number(framing.distance));
    const authored = Array.isArray(framing.preferredDirections) ? framing.preferredDirections : [];
    const directions = [...authored, ...DEFAULT_DIRECTIONS]
      .map(normalizedDirection)
      .filter(([x, z], index, all) => all.findIndex(([ax, az]) => Math.abs(ax - x) < 0.001 && Math.abs(az - z) < 0.001) === index);

    let chosen = null;
    for (const scale of [1, 1.12, 1.25, 0.9, 1.4]) {
      for (const [dx, dz] of directions) {
        const x = record.x + dx * distance * scale;
        const z = record.z + dz * distance * scale;
        if (hasFirstStepClearance(debug, x, z)) {
          chosen = { pos: [x, z], look: [record.x, record.z], authored: true };
          break;
        }
      }
      if (chosen) break;
    }

    if (chosen) debug.teleportViews[record.id] = chosen;
  }
}

export function installCityCompatibility(runtime, { ui = 'standard' } = {}) {
  const debug = runtime?.debug;
  const canvas = document.querySelector('#glCanvas');
  if (!debug) return runtime;

  // The city data remains the owner of cinematic landmark composition. The
  // shared runtime owns collision/safe-spawn resolution; this bridge simply
  // rewrites its mutable teleport-view table from authored framing metadata.
  applyAuthoredLandmarkFraming(debug);

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
  // runtime also supports click-to-lock; pointerdown keeps the historical feel
  // while the runtime remains the sole owner of yaw/pitch movement math.
  const coarse = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  if (canvas && !coarse) {
    canvas.addEventListener('pointerdown', () => {
      if (document.pointerLockElement === canvas) return;
      try { canvas.requestPointerLock?.(); } catch (_) {}
    }, { passive: true });
  }

  return runtime;
}

export const CITY_COMPATIBILITY = Object.freeze({
  authoredFraming: true,
  firstStepClearance: true,
  deepLinkJump: true,
  legacyTeleportAlias: true,
});
