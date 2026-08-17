export const DEFAULT_TRAVERSAL = Object.freeze({
  eyeHeight: 1.68,
  radius: 0.48,
  maxStepUp: 0.46,
  maxStepDown: 0.62,
  substep: 0.16,
  cellSize: 42,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function pointInOrientedRect(x, z, rect, pad = 0) {
  const dx = x - rect.x;
  const dz = z - rect.z;
  const angle = -(rect.rot || 0);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const lx = dx * ca - dz * sa;
  const lz = dx * sa + dz * ca;
  return Math.abs(lx) <= rect.hx + pad && Math.abs(lz) <= rect.hz + pad;
}

function surfaceHeightAt(surface, x, z) {
  if (surface.type === 'rect') {
    const rect = {
      x: surface.cx,
      z: surface.cz,
      hx: surface.hx,
      hz: surface.hz,
      rot: surface.rot || 0,
    };
    return pointInOrientedRect(x, z, rect) ? surface.y : null;
  }

  if (surface.type === 'disk') {
    return Math.hypot(x - surface.cx, z - surface.cz) <= surface.r ? surface.y : null;
  }

  if (surface.type === 'ramp') {
    const rx = x - surface.x1;
    const rz = z - surface.z1;
    const t = (rx * surface.dx + rz * surface.dz) / surface.len;
    if (t < 0 || t > 1) return null;
    const px = surface.x1 + surface.dx * t * surface.len;
    const pz = surface.z1 + surface.dz * t * surface.len;
    const lateral = Math.abs((x - px) * (-surface.dz) + (z - pz) * surface.dx);
    if (lateral > surface.width / 2) return null;
    return surface.y1 + (surface.y2 - surface.y1) * t;
  }

  return null;
}

export function rectCollider(x, z, width, depth, rot = 0, tag = 'solid') {
  return { x, z, hx: width / 2, hz: depth / 2, rot, tag };
}

export function walkRect(cx, cz, width, depth, y, rot = 0, tag = 'surface', solidBelow = true) {
  return { type: 'rect', cx, cz, hx: width / 2, hz: depth / 2, y, rot, tag, solidBelow };
}

export function walkDisk(cx, cz, radius, y, tag = 'surface', solidBelow = true) {
  return { type: 'disk', cx, cz, r: radius, y, tag, solidBelow };
}

export function walkRamp(x1, z1, y1, x2, z2, y2, width, tag = 'ramp', solidBelow = true) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  return {
    type: 'ramp',
    x1, z1, y1, x2, z2, y2, width, tag, solidBelow,
    len,
    dx: dx / len,
    dz: dz / len,
  };
}

export function createTraversalSystem({
  player,
  colliders = [],
  walkSurfaces = [],
  hazards = [],
  bounds = null,
  baseHeightAt = () => 0,
  eyeHeight = DEFAULT_TRAVERSAL.eyeHeight,
  radius = DEFAULT_TRAVERSAL.radius,
  maxStepUp = DEFAULT_TRAVERSAL.maxStepUp,
  maxStepDown = DEFAULT_TRAVERSAL.maxStepDown,
  substep = DEFAULT_TRAVERSAL.substep,
  cellSize = DEFAULT_TRAVERSAL.cellSize,
} = {}) {
  if (!player) throw new TypeError('createTraversalSystem requires a mutable player object.');

  const grid = new Map();
  const key = (ix, iz) => `${ix},${iz}`;

  function rebuildGrid() {
    grid.clear();
    for (const collider of colliders) {
      const ca = Math.abs(Math.cos(collider.rot || 0));
      const sa = Math.abs(Math.sin(collider.rot || 0));
      const ax = collider.hx * ca + collider.hz * sa + radius;
      const az = collider.hx * sa + collider.hz * ca + radius;
      const minX = Math.floor((collider.x - ax) / cellSize);
      const maxX = Math.floor((collider.x + ax) / cellSize);
      const minZ = Math.floor((collider.z - az) / cellSize);
      const maxZ = Math.floor((collider.z + az) / cellSize);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const k = key(ix, iz);
          const bucket = grid.get(k) || [];
          bucket.push(collider);
          grid.set(k, bucket);
        }
      }
    }
  }

  function nearbyColliders(x, z) {
    const ix = Math.floor(x / cellSize);
    const iz = Math.floor(z / cellSize);
    const out = [];
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(key(ix + dx, iz + dz));
        if (!bucket) continue;
        for (const collider of bucket) {
          if (seen.has(collider)) continue;
          seen.add(collider);
          out.push(collider);
        }
      }
    }
    return out;
  }

  function outsideBounds(x, z) {
    if (!bounds) return false;
    return x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ;
  }

  function inHazard(x, z) {
    for (const hazard of hazards) {
      if (hazard.type === 'disk') {
        if (Math.hypot(x - hazard.cx, z - hazard.cz) <= hazard.r + radius) return true;
      } else if (hazard.type === 'rect') {
        const rect = { x: hazard.cx, z: hazard.cz, hx: hazard.hx, hz: hazard.hz, rot: hazard.rot || 0 };
        if (pointInOrientedRect(x, z, rect, radius)) return true;
      }
    }
    return false;
  }

  function collide(x, z) {
    if (outsideBounds(x, z) || inHazard(x, z)) return true;
    for (const collider of nearbyColliders(x, z)) {
      if (pointInOrientedRect(x, z, collider, radius)) return true;
    }
    return false;
  }

  function walkCandidatesAt(x, z) {
    const all = [];
    const stairs = [];
    for (const surface of walkSurfaces) {
      const y = surfaceHeightAt(surface, x, z);
      if (y == null) continue;
      const candidate = { surface, y };
      all.push(candidate);
      if ((surface.tag || '').includes('tread')) stairs.push(candidate);
    }
    return stairs.length ? stairs : all;
  }

  function absoluteSupportAt(x, z) {
    let best = baseHeightAt(x, z);
    let tag = 'ground';
    for (const candidate of walkCandidatesAt(x, z)) {
      if (candidate.y > best) {
        best = candidate.y;
        tag = candidate.surface.tag || 'surface';
      }
    }
    return { y: best, tag };
  }

  function resolveSupport(x, z, currentY = 0) {
    const terrainY = baseHeightAt(x, z);
    let best = terrainY;
    let bestTag = 'ground';
    let higherSolid = terrainY > currentY + maxStepUp + 0.018;

    for (const candidate of walkCandidatesAt(x, z)) {
      const { surface, y } = candidate;
      if (y <= currentY + maxStepUp + 0.018) {
        if (y > best) {
          best = y;
          bestTag = surface.tag || 'surface';
        }
      } else if (surface.solidBelow) {
        higherSolid = true;
      }
    }

    const rise = best - currentY;
    const drop = currentY - best;
    return {
      y: best,
      tag: bestTag,
      rise,
      drop,
      blockedRise: higherSolid && best <= currentY + 0.025,
      blockedDrop: drop > maxStepDown + 0.018,
    };
  }

  function tryTraverse(nx, nz) {
    if (collide(nx, nz)) return false;
    const support = resolveSupport(nx, nz, player.floorY || 0);
    if (support.blockedRise || support.blockedDrop) return false;
    player.x = nx;
    player.z = nz;
    player.floorY = support.y;
    player.surfaceTag = support.tag;
    return true;
  }

  function moveWithSubsteps(dx, dz) {
    const distance = Math.hypot(dx, dz);
    const parts = Math.max(1, Math.ceil(distance / substep));
    const sx = dx / parts;
    const sz = dz / parts;
    let moved = false;

    for (let i = 0; i < parts; i++) {
      const nx = player.x + sx;
      const nz = player.z + sz;
      if (tryTraverse(nx, nz)) {
        moved = true;
        continue;
      }
      if (tryTraverse(nx, player.z)) {
        moved = true;
        continue;
      }
      if (tryTraverse(player.x, nz)) {
        moved = true;
        continue;
      }
      break;
    }

    return moved;
  }

  function isSafeSpawn(x, z) {
    return !collide(x, z);
  }

  function resolveSpawn(x, z, maxRadius = 48) {
    if (isSafeSpawn(x, z)) return { x, z };
    for (let r = 2; r <= maxRadius; r += 2) {
      for (let i = 0; i < 32; i++) {
        const angle = i * Math.PI * 2 / 32;
        const nx = x + Math.cos(angle) * r;
        const nz = z + Math.sin(angle) * r;
        if (isSafeSpawn(nx, nz)) return { x: nx, z: nz };
      }
    }
    return { x: clamp(x, bounds?.minX ?? x, bounds?.maxX ?? x), z: clamp(z, bounds?.minZ ?? z, bounds?.maxZ ?? z) };
  }

  function snapPlayerToSupport(x = player.x, z = player.z) {
    const spawn = resolveSpawn(x, z);
    const support = absoluteSupportAt(spawn.x, spawn.z);
    player.x = spawn.x;
    player.z = spawn.z;
    player.floorY = support.y;
    player.surfaceTag = support.tag;
    player.y = support.y + eyeHeight;
    return { x: player.x, y: player.y, z: player.z, floorY: player.floorY, surfaceTag: player.surfaceTag };
  }

  rebuildGrid();
  snapPlayerToSupport();

  return {
    collide,
    nearbyColliders,
    absoluteSupportAt,
    resolveSupport,
    tryTraverse,
    moveWithSubsteps,
    resolveSpawn,
    snapPlayerToSupport,
    rebuildGrid,
    pointInOrientedRect,
    config: Object.freeze({ eyeHeight, radius, maxStepUp, maxStepDown, substep, cellSize }),
    stats() {
      return {
        colliders: colliders.length,
        walkSurfaces: walkSurfaces.length,
        hazards: hazards.length,
        gridCells: grid.size,
      };
    },
  };
}
