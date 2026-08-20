// Deterministic, explicitly inferred urban fabric for Rome AD 410–476.
// Named monuments remain in city.js. This module fills otherwise empty regions
// with plausible district massing without pretending to reconstruct individual
// excavated fifth-century houses.
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

const REGION_DENSITY = Object.freeze({
  I: 0.68, II: 0.76, III: 0.88, IV: 0.95, V: 0.86, VI: 0.76, VII: 0.84,
  VIII: 0.88, IX: 0.86, X: 0.66, XI: 0.76, XII: 0.68, XIII: 0.80, XIV: 0.88,
});
const REGION_STYLE = Object.freeze({
  III: { kind:'entertainment', height:[7,14], shop:0.58, courtyard:0.18, materials:['brick','plaster','brickDark'] },
  IV: { kind:'subura', height:[10,18], shop:0.72, courtyard:0.10, materials:['brick','brickDark','plaster2'] },
  VIII:{ kind:'forum-edge', height:[6,12], shop:0.50, courtyard:0.28, materials:['plaster','brick','limestone2'] },
  IX: { kind:'campus', height:[6,13], shop:0.52, courtyard:0.25, materials:['plaster','brick','plaster2'] },
  XIII:{ kind:'aventine', height:[6,13], shop:0.42, courtyard:0.34, materials:['plaster','brick','plaster3'] },
  XIV:{ kind:'river', height:[7,15], shop:0.62, courtyard:0.18, materials:['brick','brickDark','plaster2'] },
});

function targetForRegion(region, density, mobile) {
  return regionalPlacementTarget(region, density, mobile, {
    desktopCell:18,
    mobileCell:25,
    desktopScale:1.08,
    mobileScale:0.84,
    desktopMin:24,
    desktopMax:92,
    mobileMin:14,
    mobileMax:44,
  });
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
  const globalCap = mobile ? 360 : 820;
  const cell = mobile ? 25 : 18;
  const cinematicClearZones = buildFramingClearZones(buildings, { radius: mobile ? 20 : 25 });

  // Each regio receives its own quota before the global cap is considered. The
  // denser cell grid is intentional: live coordinates are compacted before this
  // function runs, so street frontage should read as continuous urban blocks
  // rather than isolated buildings floating in a kilometre-scale field.
  for (const region of regions) {
    if (fabric.length >= globalCap) break;
    const density = REGION_DENSITY[region.id] ?? 0.72;
    const regionTarget = targetForRegion(region, density, mobile);
    let regionPlaced = 0;
    const minX = region.x - region.w / 2 + cell * 0.48;
    const maxX = region.x + region.w / 2 - cell * 0.48;
    const minZ = region.z - region.d / 2 + cell * 0.48;
    const maxZ = region.z + region.d / 2 - cell * 0.48;

    for (let z = minZ; z <= maxZ && fabric.length < globalCap && regionPlaced < regionTarget; z += cell) {
      for (let x = minX; x <= maxX && fabric.length < globalCap && regionPlaced < regionTarget; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 14) / 2 + (mobile ? 4.8 : 3.6);
        if (street && street.distance < streetClearance) continue;

        const jitterX = (hash(`${seed}:jx`) - 0.5) * cell * 0.24;
        const jitterZ = (hash(`${seed}:jz`) - 0.5) * cell * 0.24;
        const bx = x + jitterX;
        const bz = z + jitterZ;
        const width = 10.5 + hash(`${seed}:w`) * (mobile ? 6.0 : 8.5);
        const depth = 9.5 + hash(`${seed}:d`) * (mobile ? 5.5 : 7.5);
        if (overlapsWater(bx, bz, width, depth, waters, mobile ? 4 : 5)) continue;
        if (overlapsClearZones(bx, bz, width, depth, cinematicClearZones)) continue;
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings, {
          monumentalSize:88,
          monumentalHeight:26,
          monumentalPadding:7.5,
          normalPadding:4.2,
        })) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric, 0.55)) continue;

        const style = REGION_STYLE[region.id] || { kind:'mixed', height:[6.5,15], shop:0.50, courtyard:0.22, materials:['brick','plaster','brickDark'] };
        const heightBase = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const lateUse = hash(`${seed}:use`);
        const condition = lateUse < 0.10 ? 'damaged' : lateUse < 0.22 ? 'adapted' : 'working';
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];
        const angle = street && street.distance < 82 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.18;

        fabric.push({
          id: `fabric-${region.id}-${fabric.length + 1}`,
          name: `Inferred urban fabric · Regio ${region.id}`,
          type: hash(`${seed}:shopfront`) < style.shop * 0.36 ? 'shop' : 'urban-fabric',
          x: bx,
          z: bz,
          w: width,
          d: depth,
          h: heightBase,
          rot: angle,
          floors: Math.max(1, Math.min(4, Math.round(heightBase / 3.2))),
          courtyard: hash(`${seed}:court`) > (1 - style.courtyard),
          shopfront: street && street.distance < 54 && hash(`${seed}:shop`) > (1 - style.shop),
          districtStyle: style.kind,
          state: condition,
          material,
          region: region.id,
          source: 'notitia',
          visualStyle: 'blocky-low-poly',
          evidence: {
            level: 'plausible',
            note: 'Procedural district massing based on regional density and street relationships; not an individually excavated fifth-century house restitution.',
          },
        });
        regionPlaced += 1;
      }
    }
  }

  return fabric;
}

export const URBAN_FABRIC_METHOD = Object.freeze({
  evidence: 'plausible',
  deterministic: true,
  fairRegionalQuotas: true,
  waterAware: true,
  cinematicClearZones: true,
  denseStreetFrontage: true,
  sharedPlacementToolkit:true,
  note: 'Generated fabric is intentionally subordinate to named monuments, major streets and validated arrival sightlines. Compact live coordinates and smaller placement cells create continuous street-scale blocks instead of isolated massing.',
});
