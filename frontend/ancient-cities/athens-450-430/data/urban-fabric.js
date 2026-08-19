// Deterministic, explicitly inferred urban fabric for Athens 450–430 BCE.
// Named monuments remain in city.js. This module supplies plausible city scale
// without claiming to reconstruct individual excavated houses.
import {
  deterministicHash as hash,
  nearestStreet,
  overlapsNamedBuilding,
  overlapsFabric,
  regionalPlacementTarget,
} from '../../../ancient-world/assets/urban-fabric-tools.js';

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

function targetForDistrict(region, density, mobile) {
  return regionalPlacementTarget(region, density, mobile, {
    desktopCell:22,
    mobileCell:30,
    desktopScale:0.92,
    mobileScale:0.72,
    desktopMin:16,
    desktopMax:62,
    mobileMin:10,
    mobileMax:30,
  });
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
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings, {
          monumentalSize:80,
          monumentalHeight:18,
          monumentalPadding:7,
          normalPadding:4.5,
        })) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric, 1.4)) continue;

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
  sharedPlacementToolkit:true,
  note: 'Generated fabric stays subordinate to named monuments and preserves low-density sacred/topographical zones while giving the lived lower city continuous street-scale massing.',
});
