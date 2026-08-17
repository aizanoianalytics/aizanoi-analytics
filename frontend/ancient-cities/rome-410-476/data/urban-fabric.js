// Deterministic, explicitly inferred urban fabric for Rome AD 410–476.
// Named monuments remain in city.js. This module fills otherwise empty regions
// with plausible block massing without pretending to reconstruct individual
// excavated houses.

const REGION_DENSITY = Object.freeze({
  I: 0.54, II: 0.62, III: 0.72, IV: 0.82, V: 0.70, VI: 0.62, VII: 0.72,
  VIII: 0.74, IX: 0.74, X: 0.52, XI: 0.58, XII: 0.50, XIII: 0.58, XIV: 0.64,
});

const hash = (input) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
};

function pointToSegmentDistance(px, pz, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / length2));
  const x = a[0] + dx * t;
  const z = a[1] + dz * t;
  return Math.hypot(px - x, pz - z);
}

function nearestStreet(x, z, streets) {
  let best = null;
  let distance = Infinity;
  for (const street of streets) {
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

function overlapsNamedBuilding(x, z, width, depth, buildings, padding = 12) {
  for (const building of buildings) {
    if (building.type === 'wall' || building.type === 'aqueduct') continue;
    const hx = building.w / 2 + width / 2 + padding;
    const hz = building.d / 2 + depth / 2 + padding;
    if (Math.abs(x - building.x) < hx && Math.abs(z - building.z) < hz) return true;
  }
  return false;
}

function overlapsFabric(x, z, width, depth, fabric, padding = 4) {
  for (const building of fabric) {
    const hx = building.w / 2 + width / 2 + padding;
    const hz = building.d / 2 + depth / 2 + padding;
    if (Math.abs(x - building.x) < hx && Math.abs(z - building.z) < hz) return true;
  }
  return false;
}

export function generateUrbanFabric({
  regions,
  buildings,
  streets,
  mobile = false,
  tiberX = -505,
  tiberClearance = 64,
} = {}) {
  if (!regions || !buildings || !streets) throw new TypeError('generateUrbanFabric requires regions, buildings and streets.');

  const fabric = [];
  const globalCap = mobile ? 115 : 240;

  for (const region of regions) {
    if (fabric.length >= globalCap) break;
    const density = REGION_DENSITY[region.id] ?? 0.58;
    const cell = mobile ? 42 : 34;
    const minX = region.x - region.w / 2 + cell * 0.55;
    const maxX = region.x + region.w / 2 - cell * 0.55;
    const minZ = region.z - region.d / 2 + cell * 0.55;
    const maxZ = region.z + region.d / 2 - cell * 0.55;

    for (let z = minZ; z <= maxZ && fabric.length < globalCap; z += cell) {
      for (let x = minX; x <= maxX && fabric.length < globalCap; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;
        if (Math.abs(x - tiberX) < tiberClearance) continue;

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 14) / 2 + (mobile ? 8 : 9.5);
        if (street && street.distance < streetClearance) continue;

        const jitterX = (hash(`${seed}:jx`) - 0.5) * cell * 0.28;
        const jitterZ = (hash(`${seed}:jz`) - 0.5) * cell * 0.28;
        const bx = x + jitterX;
        const bz = z + jitterZ;
        const width = 14 + hash(`${seed}:w`) * (mobile ? 8 : 13);
        const depth = 12 + hash(`${seed}:d`) * (mobile ? 7 : 12);
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings)) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric)) continue;

        const heightBase = 6.5 + hash(`${seed}:h`) * 8.5;
        const lateUse = hash(`${seed}:use`);
        const condition = lateUse < 0.09 ? 'damaged' : lateUse < 0.18 ? 'adapted' : 'working';
        const material = hash(`${seed}:mat`) < 0.48 ? 'brick' : hash(`${seed}:mat2`) < 0.66 ? 'plaster' : 'brickDark';
        const angle = street && street.distance < 90 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.18;

        fabric.push({
          id: `fabric-${region.id}-${fabric.length + 1}`,
          name: `Inferred urban fabric · Regio ${region.id}`,
          type: 'urban-fabric',
          x: bx,
          z: bz,
          w: width,
          d: depth,
          h: heightBase,
          rot: angle,
          floors: Math.max(1, Math.min(4, Math.round(heightBase / 3.2))),
          courtyard: hash(`${seed}:court`) > 0.77,
          shopfront: street && street.distance < 52 && hash(`${seed}:shop`) > 0.48,
          state: condition,
          material,
          region: region.id,
          source: 'notitia',
          evidence: {
            level: 'plausible',
            note: 'Procedural district massing based on regional density and street relationships; not an individually excavated fifth-century house restitution.',
          },
        });
      }
    }
  }

  return fabric;
}

export const URBAN_FABRIC_METHOD = Object.freeze({
  evidence: 'plausible',
  deterministic: true,
  note: 'Generated fabric is intentionally subordinate to named monuments and major streets. It provides urban scale without claiming exact individual building plans.',
});
