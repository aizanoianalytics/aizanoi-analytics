// Deterministic, explicitly inferred urban fabric for Athens 450–430 BCE.
// Named monuments remain in city.js. This module fills otherwise empty districts
// with plausible block massing without claiming to reconstruct individual
// excavated houses.
//
// The districts here are civic / topographical, not the Augustan regional
// divisions of Rome. The grid is the schematic navigable surface used by the
// renderer and the shared traversal engine.

const DISTRICT_DENSITY = Object.freeze({
  acropolis: 0.18,
  'south-slope': 0.32,
  agora: 0.40,
  'lower-city': 0.66,
  kerameikos: 0.58,
  northgate: 0.42,
  pnyx: 0.16,
  olympieion: 0.18,
  'long-walls': 0.22,
  piraeus: 0.78,
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

function overlapsNamedBuilding(x, z, width, depth, buildings, padding = 10) {
  for (const building of buildings) {
    if (building.type === 'wall' || building.type === 'aqueduct') continue;
    const hx = (building.w || 0) / 2 + width / 2 + padding;
    const hz = (building.d || 0) / 2 + depth / 2 + padding;
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
  longWallCorridor = { minX: 320, maxX: 880, halfWidth: 110 },
} = {}) {
  if (!regions || !buildings || !streets) throw new TypeError('generateUrbanFabric requires regions, buildings and streets.');

  const fabric = [];
  const globalCap = mobile ? 110 : 230;

  for (const region of regions) {
    if (fabric.length >= globalCap) break;
    const density = DISTRICT_DENSITY[region.id] ?? 0.45;
    const cell = mobile ? 38 : 30;
    const minX = region.x - region.w / 2 + cell * 0.55;
    const maxX = region.x + region.w / 2 - cell * 0.55;
    const minZ = region.z - region.d / 2 + cell * 0.55;
    const maxZ = region.z + region.d / 2 - cell * 0.55;

    // Skip the Long Walls corridor; show only walls and gates there.
    if (region.id === 'long-walls') continue;

    for (let z = minZ; z <= maxZ && fabric.length < globalCap; z += cell) {
      for (let x = minX; x <= maxX && fabric.length < globalCap; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;

        // Stay clear of the parallel Long Walls corridor.
        if (region.id === 'lower-city' || region.id === 'kerameikos') {
          if (x > longWallCorridor.minX - 60 && x < longWallCorridor.maxX + 60) {
            if (Math.abs(z - 30) < longWallCorridor.halfWidth) continue;
          }
        }

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 14) / 2 + (mobile ? 7 : 8.5);
        if (street && street.distance < streetClearance) continue;

        const jitterX = (hash(`${seed}:jx`) - 0.5) * cell * 0.28;
        const jitterZ = (hash(`${seed}:jz`) - 0.5) * cell * 0.28;
        const bx = x + jitterX;
        const bz = z + jitterZ;
        const width = 12 + hash(`${seed}:w`) * (mobile ? 6 : 10);
        const depth = 10 + hash(`${seed}:d`) * (mobile ? 5 : 9);
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings)) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric)) continue;

        const heightBase = region.id === 'agora' ? 4.0 + hash(`${seed}:h`) * 5.0 :
                           region.id === 'piraeus' ? 7.0 + hash(`${seed}:h`) * 8.0 :
                           region.id === 'south-slope' ? 4.0 + hash(`${seed}:h`) * 4.0 :
                           5.5 + hash(`${seed}:h`) * 5.5;
        const condition = hash(`${seed}:use`) < 0.10 ? 'damaged' : 'working';
        const material = hash(`${seed}:mat`) < 0.5 ? 'brick' : hash(`${seed}:mat2`) < 0.7 ? 'plaster' : 'brickDark';
        const angle = street && street.distance < 80 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.18;

        fabric.push({
          id: `fabric-${region.id}-${fabric.length + 1}`,
          name: `Inferred urban fabric · ${region.name}`,
          type: 'urban-fabric',
          x: bx,
          z: bz,
          w: width,
          d: depth,
          h: heightBase,
          rot: angle,
          floors: Math.max(1, Math.min(3, Math.round(heightBase / 3.0))),
          courtyard: hash(`${seed}:court`) > 0.78,
          shopfront: street && street.distance < 48 && hash(`${seed}:shop`) > 0.5,
          state: condition,
          material,
          region: region.id,
          source: 'district-density',
          evidence: {
            level: 'plausible',
            note: 'Procedural 5th-century massing based on district density and street relationships; not an individually excavated house restitution.',
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
  note: 'Generated fabric is intentionally subordinate to named monuments and major streets. The Periclean city contained mixed residential, workshop and small-shrine blocks; this model gives scale without claiming exact individual plans.',
});
