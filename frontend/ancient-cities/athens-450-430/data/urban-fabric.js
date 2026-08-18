// Deterministic, explicitly inferred urban fabric for Athens 450–430 BCE.
// Named monuments remain in city.js. This module supplies plausible city scale
// without claiming to reconstruct individual excavated houses.

const DISTRICT_DENSITY = Object.freeze({
  acropolis: 0.10, 'south-slope': 0.48, agora: 0.62, 'lower-city': 0.82,
  kerameikos: 0.72, northgate: 0.54, pnyx: 0.22, olympieion: 0.24,
  'long-walls': 0.18, piraeus: 0.84,
});
const DISTRICT_STYLE = Object.freeze({
  agora: { kind:'civic-market', height:[4,8], shop:0.68, courtyard:0.28, materials:['plaster','plaster3','limestone2'] },
  'lower-city': { kind:'courtyard-houses', height:[5,10], shop:0.52, courtyard:0.50, materials:['plaster','plaster2','plaster3'] },
  kerameikos: { kind:'workshops', height:[5,10], shop:0.64, courtyard:0.32, materials:['plaster2','plaster3','brick'] },
  piraeus: { kind:'harbour-grid', height:[6,13], shop:0.68, courtyard:0.25, materials:['plaster','plaster2','limestone2'] },
  'south-slope': { kind:'slope-houses', height:[4,8], shop:0.34, courtyard:0.42, materials:['plaster','limestone2','plaster3'] },
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

function overlapsNamedBuilding(x, z, width, depth, buildings) {
  for (const building of buildings) {
    if (building.type === 'wall' || building.type === 'aqueduct') continue;
    const monumental = Math.max(building.w || 0, building.d || 0) > 80 || (building.h || 0) > 18;
    const padding = monumental ? 7 : 4.5;
    const hx = (building.w || 0) / 2 + width / 2 + padding;
    const hz = (building.d || 0) / 2 + depth / 2 + padding;
    if (Math.abs(x - building.x) < hx && Math.abs(z - building.z) < hz) return true;
  }
  return false;
}

function overlapsFabric(x, z, width, depth, fabric, padding = 1.4) {
  for (const building of fabric) {
    const hx = building.w / 2 + width / 2 + padding;
    const hz = building.d / 2 + depth / 2 + padding;
    if (Math.abs(x - building.x) < hx && Math.abs(z - building.z) < hz) return true;
  }
  return false;
}

function targetForDistrict(region, density, mobile) {
  const cell = mobile ? 30 : 22;
  const theoretical = Math.max(1, (region.w * region.d) / (cell * cell));
  const scaled = Math.round(theoretical * density * (mobile ? 0.72 : 0.92));
  return Math.max(mobile ? 10 : 16, Math.min(mobile ? 30 : 62, scaled));
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
  const globalCap = mobile ? 240 : 560;
  const cell = mobile ? 30 : 22;

  // Density is intentionally concentrated in the lived lower city, Agora edge,
  // Kerameikos and Piraeus. The Acropolis/Pnyx retain breathing room so sacred
  // and topographical hierarchy is not erased by procedural filler.
  for (const region of regions) {
    if (fabric.length >= globalCap) break;
    if (region.id === 'long-walls') continue;
    const density = DISTRICT_DENSITY[region.id] ?? 0.50;
    const districtTarget = targetForDistrict(region, density, mobile);
    let districtPlaced = 0;
    const minX = region.x - region.w / 2 + cell * 0.50;
    const maxX = region.x + region.w / 2 - cell * 0.50;
    const minZ = region.z - region.d / 2 + cell * 0.50;
    const maxZ = region.z + region.d / 2 - cell * 0.50;

    for (let z = minZ; z <= maxZ && fabric.length < globalCap && districtPlaced < districtTarget; z += cell) {
      for (let x = minX; x <= maxX && fabric.length < globalCap && districtPlaced < districtTarget; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;

        if (region.id === 'lower-city' || region.id === 'kerameikos') {
          if (x > longWallCorridor.minX - 60 && x < longWallCorridor.maxX + 60 && Math.abs(z - 30) < longWallCorridor.halfWidth) continue;
        }

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 14) / 2 + (mobile ? 5.8 : 4.5);
        if (street && street.distance < streetClearance) continue;

        const jitterX = (hash(`${seed}:jx`) - 0.5) * cell * 0.34;
        const jitterZ = (hash(`${seed}:jz`) - 0.5) * cell * 0.34;
        const bx = x + jitterX;
        const bz = z + jitterZ;
        const width = 12.5 + hash(`${seed}:w`) * (mobile ? 6.5 : 10.5);
        const depth = 10.5 + hash(`${seed}:d`) * (mobile ? 5.5 : 9.5);
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings)) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric)) continue;

        const style = DISTRICT_STYLE[region.id] || { kind:'mixed-houses', height:[5,10], shop:0.44, courtyard:0.40, materials:['plaster','plaster2','limestone2'] };
        const heightBase = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const condition = hash(`${seed}:use`) < 0.08 ? 'damaged' : 'working';
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];
        const angle = street && street.distance < 100 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.24;

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
          courtyard: hash(`${seed}:court`) > (1 - style.courtyard),
          shopfront: street && street.distance < 58 && hash(`${seed}:shop`) > (1 - style.shop),
          districtStyle: style.kind,
          state: condition,
          material,
          region: region.id,
          source: 'district-density',
          evidence: {
            level: 'plausible',
            note: 'Procedural fifth-century massing based on district density and street relationships; not an individually excavated house restitution.',
          },
        });
        districtPlaced += 1;
      }
    }
  }

  return fabric;
}

export const URBAN_FABRIC_METHOD = Object.freeze({
  evidence: 'plausible',
  deterministic: true,
  fairDistrictQuotas: true,
  note: 'Generated fabric stays subordinate to named monuments and preserves low-density sacred/topographical zones while giving the lived lower city continuous street-scale massing.',
});
