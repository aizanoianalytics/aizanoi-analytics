// Deterministic, explicitly inferred urban fabric for Athens 450–430 BCE.
// Named monuments remain in city.js. This module supplies plausible city scale
// without claiming to reconstruct individual excavated houses.
import {
  deterministicHash as hash,
  nearestStreet,
  overlapsNamedBuilding,
  overlapsFabric,
  overlapsClearZones,
  overlapsWater,
  buildFramingClearZones,
  regionalPlacementTarget,
} from '../../../ancient-world/assets/urban-fabric-tools.js';

const DISTRICT_DENSITY = Object.freeze({
  acropolis: 0.16, 'south-slope': 0.58, agora: 0.72, 'lower-city': 0.90,
  kerameikos: 0.82, northgate: 0.66, pnyx: 0.32, olympieion: 0.34,
  'long-walls': 0.18, piraeus: 0.92,
});
const DISTRICT_STYLE = Object.freeze({
  agora: { kind:'civic-market', height:[4,8], shop:0.68, courtyard:0.28, materials:['plaster','plaster3','limestone2'] },
  'lower-city': { kind:'courtyard-houses', height:[5,10], shop:0.52, courtyard:0.50, materials:['plaster','plaster2','plaster3'] },
  kerameikos: { kind:'workshops', height:[5,10], shop:0.64, courtyard:0.32, materials:['plaster2','plaster3','brick'] },
  piraeus: { kind:'harbour-grid', height:[6,13], shop:0.68, courtyard:0.25, materials:['plaster','plaster2','limestone2'] },
  'south-slope': { kind:'slope-houses', height:[4,8], shop:0.34, courtyard:0.42, materials:['plaster','limestone2','plaster3'] },
});

function targetForDistrict(region, density, mobile) {
  return regionalPlacementTarget(region, density, mobile, {
    desktopCell:18,
    mobileCell:25,
    desktopScale:1.04,
    mobileScale:0.82,
    desktopMin:20,
    desktopMax:88,
    mobileMin:12,
    mobileMax:42,
  });
}

function longWallEnvelope(streets) {
  const points = (streets || [])
    .filter((street) => /long-wall/i.test(street.id || ''))
    .flatMap((street) => street.points || []);
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs) - 22,
    maxX: Math.max(...xs) + 22,
    minZ: Math.min(...zs) - 26,
    maxZ: Math.max(...zs) + 26,
  };
}

export function generateUrbanFabric({
  regions,
  buildings,
  streets,
  waters = [],
  mobile = false,
} = {}) {
  if (!regions || !buildings || !streets) throw new TypeError('generateUrbanFabric requires regions, buildings and streets.');

  const fabric = [];
  const globalCap = mobile ? 330 : 760;
  const cell = mobile ? 25 : 18;
  const wallEnvelope = longWallEnvelope(streets);
  const cinematicClearZones = buildFramingClearZones(buildings, { radius: mobile ? 20 : 24 });

  // Density remains subordinate to sacred/civic monuments, but compact live
  // coordinates and a smaller block rhythm make the Agora edge, lower city,
  // Kerameikos and Piraeus read as connected inhabited districts.
  for (const region of regions) {
    if (fabric.length >= globalCap) break;
    if (region.id === 'long-walls') continue;
    const density = DISTRICT_DENSITY[region.id] ?? 0.58;
    const districtTarget = targetForDistrict(region, density, mobile);
    let districtPlaced = 0;
    const minX = region.x - region.w / 2 + cell * 0.48;
    const maxX = region.x + region.w / 2 - cell * 0.48;
    const minZ = region.z - region.d / 2 + cell * 0.48;
    const maxZ = region.z + region.d / 2 - cell * 0.48;

    for (let z = minZ; z <= maxZ && fabric.length < globalCap && districtPlaced < districtTarget; z += cell) {
      for (let x = minX; x <= maxX && fabric.length < globalCap && districtPlaced < districtTarget; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;

        if (wallEnvelope && ['lower-city','kerameikos'].includes(region.id)) {
          if (x > wallEnvelope.minX && x < wallEnvelope.maxX && z > wallEnvelope.minZ && z < wallEnvelope.maxZ) continue;
        }

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 14) / 2 + (mobile ? 4.8 : 3.6);
        if (street && street.distance < streetClearance) continue;

        const jitterX = (hash(`${seed}:jx`) - 0.5) * cell * 0.24;
        const jitterZ = (hash(`${seed}:jz`) - 0.5) * cell * 0.24;
        const bx = x + jitterX;
        const bz = z + jitterZ;
        const width = 10.5 + hash(`${seed}:w`) * (mobile ? 5.5 : 8.5);
        const depth = 9.5 + hash(`${seed}:d`) * (mobile ? 5.0 : 7.5);
        if (overlapsWater(bx, bz, width, depth, waters, mobile ? 4 : 5)) continue;
        if (overlapsClearZones(bx, bz, width, depth, cinematicClearZones)) continue;
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings, {
          monumentalSize:70,
          monumentalHeight:16,
          monumentalPadding:6.5,
          normalPadding:4.0,
        })) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric, 0.65)) continue;

        const style = DISTRICT_STYLE[region.id] || { kind:'mixed-houses', height:[5,10], shop:0.44, courtyard:0.40, materials:['plaster','plaster2','limestone2'] };
        const heightBase = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const condition = hash(`${seed}:use`) < 0.08 ? 'damaged' : 'working';
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];
        const angle = street && street.distance < 76 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.18;

        fabric.push({
          id: `fabric-${region.id}-${fabric.length + 1}`,
          name: `Inferred urban fabric · ${region.name}`,
          type: hash(`${seed}:shopfront`) < style.shop * 0.34 ? 'shop' : 'urban-fabric',
          x: bx,
          z: bz,
          w: width,
          d: depth,
          h: heightBase,
          rot: angle,
          floors: Math.max(1, Math.min(3, Math.round(heightBase / 3.0))),
          courtyard: hash(`${seed}:court`) > (1 - style.courtyard),
          shopfront: street && street.distance < 52 && hash(`${seed}:shop`) > (1 - style.shop),
          districtStyle: style.kind,
          state: condition,
          material,
          region: region.id,
          source: 'district-density',
          visualStyle: 'blocky-low-poly',
          evidence: {
            level: 'plausible',
            note: 'Procedural Classical-period massing based on district density and street relationships; not an individually excavated house restitution.',
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
  waterAware: true,
  longWallCorridorPreserved: true,
  cinematicClearZones: true,
  denseStreetFrontage: true,
  sharedPlacementToolkit:true,
  note: 'Generated fabric preserves sacred hierarchy and the Long Walls corridor while compact live coordinates create continuous street-scale neighbourhoods.',
});
