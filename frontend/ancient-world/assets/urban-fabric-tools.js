// Reusable deterministic tools for inferred historical-city fabric.
// City modules own density, materials, chronology and archaeological exclusions;
// this file only supplies neutral placement math that can be reused safely.

export function deterministicHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function pointToSegmentDistance(px, pz, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / length2));
  const x = a[0] + dx * t;
  const z = a[1] + dz * t;
  return Math.hypot(px - x, pz - z);
}

export function nearestStreet(x, z, streets) {
  let best = null;
  let distance = Infinity;
  for (const street of streets || []) {
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1];
      const b = street.points[i];
      const d = pointToSegmentDistance(x, z, a, b);
      if (d < distance) {
        distance = d;
        best = { street, a, b, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      }
    }
  }
  return best ? { ...best, distance } : null;
}

export function overlapsNamedBuilding(x, z, width, depth, buildings, {
  monumentalSize = 90,
  monumentalHeight = 22,
  monumentalPadding = 7,
  normalPadding = 5,
  ignoredTypes = ['wall', 'aqueduct'],
} = {}) {
  for (const building of buildings || []) {
    if (ignoredTypes.includes(building.type)) continue;
    const monumental = Math.max(building.w || 0, building.d || 0) > monumentalSize || (building.h || 0) > monumentalHeight;
    const padding = monumental ? monumentalPadding : normalPadding;
    const hx = (building.w || 0) / 2 + width / 2 + padding;
    const hz = (building.d || 0) / 2 + depth / 2 + padding;
    if (Math.abs(x - building.x) < hx && Math.abs(z - building.z) < hz) return true;
  }
  return false;
}

export function overlapsFabric(x, z, width, depth, fabric, padding = 1) {
  for (const building of fabric || []) {
    const hx = building.w / 2 + width / 2 + padding;
    const hz = building.d / 2 + depth / 2 + padding;
    if (Math.abs(x - building.x) < hx && Math.abs(z - building.z) < hz) return true;
  }
  return false;
}

export function overlapsClearZones(x, z, width, depth, zones, footprintScale = 0.32) {
  const footprintRadius = Math.hypot(width, depth) * footprintScale;
  return (zones || []).some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + footprintRadius);
}

export function regionalPlacementTarget(region, density, mobile, {
  desktopCell = 22,
  mobileCell = 30,
  desktopScale = 1,
  mobileScale = 0.76,
  desktopMin = 16,
  desktopMax = 64,
  mobileMin = 10,
  mobileMax = 32,
} = {}) {
  const cell = mobile ? mobileCell : desktopCell;
  const theoretical = Math.max(1, (region.w * region.d) / (cell * cell));
  const scaled = Math.round(theoretical * density * (mobile ? mobileScale : desktopScale));
  return Math.max(mobile ? mobileMin : desktopMin, Math.min(mobile ? mobileMax : desktopMax, scaled));
}

export const URBAN_FABRIC_TOOLKIT = Object.freeze({
  deterministic:true,
  archaeologicalClaims:false,
  purpose:'Reusable placement math for explicitly inferred urban fabric; city-specific evidence, exclusions and style remain local.',
});
