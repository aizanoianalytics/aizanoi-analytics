// Compatibility bridge for behaviours preserved from the pre-modular worlds.
// Keeps deep-link jumps, authored landmark arrivals and the historical debug API
// stable while the renderer itself is shared by every city.

const DEFAULT_DIRECTIONS = Object.freeze([
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
]);
const STEP_VECTORS = Object.freeze([
  [1.25, 0], [-1.25, 0], [0, 1.25], [0, -1.25],
  [0.9, 0.9], [0.9, -0.9], [-0.9, 0.9], [-0.9, -0.9],
]);
const SEARCH_RADII = Object.freeze([0, 2, 4, 6, 9, 13, 18, 25, 34, 48, 64]);

function normalizedDirection(direction) {
  const x = Number(direction?.[0] || 0);
  const z = Number(direction?.[1] || 0);
  const length = Math.hypot(x, z) || 1;
  return [x / length, z / length];
}

function collisionCorridorClear(debug, x, z, dx, dz) {
  if (debug.collide?.(x, z)) return false;
  for (const t of [0.25, 0.5, 0.75, 1]) {
    if (debug.collide?.(x + dx * t, z + dz * t)) return false;
  }
  return true;
}

function movementProbeWorks(debug, x, z, dx, dz) {
  if (typeof debug.setPlayer !== 'function' || typeof debug.moveWithSubsteps !== 'function') return collisionCorridorClear(debug, x, z, dx, dz);
  debug.setPlayer(x, z);
  const before = debug.player;
  debug.moveWithSubsteps(dx, dz);
  const after = debug.player;
  const distance = before && after ? Math.hypot(after.x - before.x, after.z - before.z) : 0;
  debug.setPlayer(x, z);
  return distance > 0.30;
}

function hasFirstStepClearance(debug, x, z) {
  if (debug.collide?.(x, z)) return false;
  return STEP_VECTORS.some(([dx, dz]) => collisionCorridorClear(debug, x, z, dx, dz) && movementProbeWorks(debug, x, z, dx, dz));
}

function findWalkablePoint(debug, originX, originZ) {
  if (!Number.isFinite(originX) || !Number.isFinite(originZ)) return null;
  for (const radius of SEARCH_RADII) {
    const directions = radius === 0 ? [[0, 0]] : DEFAULT_DIRECTIONS.map(normalizedDirection);
    for (const [dx, dz] of directions) {
      const x = originX + dx * radius;
      const z = originZ + dz * radius;
      if (hasFirstStepClearance(debug, x, z)) return { x, z };
    }
  }
  return null;
}

function ensureCurrentArrivalIsWalkable(debug, preferred = null) {
  const current = debug?.player;
  if (!current) return null;
  const safe = findWalkablePoint(debug, current.x, current.z) ||
    (preferred ? findWalkablePoint(debug, preferred[0], preferred[1]) : null);
  if (safe) debug.setPlayer?.(safe.x, safe.z);
  return safe;
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
    for (const scale of [1, 1.12, 1.25, 0.9, 1.4, 1.65]) {
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

  // City-authored framing remains the source of cinematic composition. Every
  // candidate must also survive the same real traversal step used by browser QA.
  applyAuthoredLandmarkFraming(debug);

  // A city spawn is data, but dense procedural fabric can make that historical
  // point unwalkable after a renderer refactor. Nudge only when a real first step
  // cannot be taken, keeping the authored point whenever it is already usable.
  ensureCurrentArrivalIsWalkable(debug);

  // Wrap the shared teleport once so every entry path (selector, tour, deep link,
  // debug tools) receives the same final walkability guarantee. The nudge keeps
  // the original yaw/pitch and remains local to the authored cinematic arrival.
  const rawTeleportTo = typeof debug.teleportTo === 'function' ? debug.teleportTo.bind(debug) : null;
  if (rawTeleportTo) {
    debug.teleportTo = (id, options = {}) => {
      const ok = rawTeleportTo(id, options);
      if (!ok) return ok;
      const preferred = debug.teleportViews?.[id]?.pos || null;
      ensureCurrentArrivalIsWalkable(debug, preferred);
      return true;
    };
  }

  // Browser smoke tools and external helpers historically called `teleport`.
  // Keep it as a stable alias to the wrapped explicit method name.
  if (debug.teleportTo) debug.teleport = (...args) => debug.teleportTo(...args);

  // Aizanoi's legacy runtime historically exposed a separate global debug object.
  // The modular runtime initially populated it with Object.assign, which snapshots
  // getters such as `player` and leaves old function references behind. Repoint
  // both public debug names at the live shared object after wrapping teleport so
  // QA and external tools observe the same player state and traversal methods.
  if (ui === 'aizanoi') {
    window.__AIZANOI_DEBUG__ = debug;
    window.__ANCIENT_WORLD_DEBUG__ = debug;
  }

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
  realMovementProbe: true,
  safeInitialSpawn: true,
  safeTeleportArrival: true,
  liveAizanoiDebugBridge: true,
  deepLinkJump: true,
  legacyTeleportAlias: true,
});
