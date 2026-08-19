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
  regionalPlacementTarget,
} from '../../../ancient-world/assets/urban-fabric-tools.js';

const REGION_DENSITY = Object.freeze({
  I: 0.60, II: 0.68, III: 0.80, IV: 0.92, V: 0.78, VI: 0.68, VII: 0.76,
  VIII: 0.82, IX: 0.78, X: 0.58, XI: 0.68, XII: 0.58, XIII: 0.70, XIV: 0.80,
});
const REGION_STYLE = Object.freeze({
  III: { kind:'entertainment', height:[7,14], shop:0.58, courtyard:0.18, materials:['brick','plaster','brickDark'] },
  IV: { kind:'subura', height:[10,18], shop:0.72, courtyard:0.10, materials:['brick','brickDark','plaster2'] },
  VIII:{ kind:'forum-edge', height:[6,12], shop:0.50, courtyard:0.28, materials:['plaster','brick','limestone2'] },
  IX: { kind:'campus', height:[6,13], shop:0.52, courtyard:0.25, materials:['plaster','brick','plaster2'] },
  XIII:{ kind:'aventine', height:[6,13], shop:0.42, courtyard:0.34, materials:['plaster','brick','plaster3'] },
  XIV:{ kind:'river', height:[7,15], shop:0.62, courtyard:0.18, materials:['brick','brickDark','plaster2'] },
});

// These zones protect only camera breathing room around authored landmark arrivals.
// They never move/remove named archaeology; only low-certainty procedural massing
// is prevented from growing directly under a hero camera or across its first steps.
const CINEMATIC_CLEAR_ZONES = Object.freeze([
  { id:'colosseum-south', x:52, z:-217, radius:42 },
  { id:'forum-south', x:-179, z:-161, radius:44 },
  { id:'pantheon-south', x:-365, z:28, radius:40 },
]);

function targetForRegion(region, density, mobile) {
  return regionalPlacementTarget(region, density, mobile, {
    desktopCell:22,
    mobileCell:30,
    desktopScale:1.02,
    mobileScale:0.80,
    desktopMin:18,
    desktopMax:66,
    mobileMin:11,
    mobileMax:34,
  });
}

export function generateUrbanFabric({
  regions,
  buildings,
  streets,
  mobile = false,
  tiberX = -505,
  // Keep cell centres slightly farther away than the public 60 m guarantee so
  // deterministic jitter cannot move a generated footprint back into the river corridor.
  tiberClearance = 65,
} = {}) {
  if (!regions || !buildings || !streets) throw new TypeError('generateUrbanFabric requires regions, buildings and streets.');

  const fabric = [];
  const globalCap = mobile ? 280 : 640;
  const cell = mobile ? 30 : 22;

  // Each regio receives its own quota before the global cap is considered. The
  // previous single sequential cap could be exhausted by early regiones and make
  // later Rome visibly sparse even when their density settings were high.
  for (const region of regions) {
    if (fabric.length >= globalCap) break;
    const density = REGION_DENSITY[region.id] ?? 0.64;
    const regionTarget = targetForRegion(region, density, mobile);
    let regionPlaced = 0;
    const minX = region.x - region.w / 2 + cell * 0.50;
    const maxX = region.x + region.w / 2 - cell * 0.50;
    const minZ = region.z - region.d / 2 + cell * 0.50;
    const maxZ = region.z + region.d / 2 - cell * 0.50;

    for (let z = minZ; z <= maxZ && fabric.length < globalCap && regionPlaced < regionTarget; z += cell) {
      for (let x = minX; x <= maxX && fabric.length < globalCap && regionPlaced < regionTarget; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;
        if (Math.abs(x - tiberX) < tiberClearance) continue;

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 14) / 2 + (mobile ? 5.5 : 4.4);
        if (street && street.distance < streetClearance) continue;

        const jitterX = (hash(`${seed}:jx`) - 0.5) * cell * 0.32;
        const jitterZ = (hash(`${seed}:jz`) - 0.5) * cell * 0.32;
        const bx = x + jitterX;
        const bz = z + jitterZ;
        const width = 11.5 + hash(`${seed}:w`) * (mobile ? 6.5 : 10.0);
        const depth = 10 + hash(`${seed}:d`) * (mobile ? 6.0 : 8.8);
        if (Math.abs(bx - tiberX) < 60) continue;
        if (overlapsClearZones(bx, bz, width, depth, CINEMATIC_CLEAR_ZONES)) continue;
        if (overlapsNamedBuilding(bx, bz, width, depth, buildings, {
          monumentalSize:105,
          monumentalHeight:28,
          monumentalPadding:8.5,
          normalPadding:5.5,
        })) continue;
        if (overlapsFabric(bx, bz, width, depth, fabric, 0.85)) continue;

        const style = REGION_STYLE[region.id] || { kind:'mixed', height:[6.5,15], shop:0.50, courtyard:0.22, materials:['brick','plaster','brickDark'] };
        const heightBase = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const lateUse = hash(`${seed}:use`);
        const condition = lateUse < 0.10 ? 'damaged' : lateUse < 0.22 ? 'adapted' : 'working';
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];
        const angle = street && street.distance < 110 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.22;

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
          courtyard: hash(`${seed}:court`) > (1 - style.courtyard),
          shopfront: street && street.distance < 62 && hash(`${seed}:shop`) > (1 - style.shop),
          districtStyle: style.kind,
          state: condition,
          material,
          region: region.id,
          source: 'notitia',
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
  cinematicClearZones: true,
  sharedPlacementToolkit:true,
  note: 'Generated fabric is intentionally subordinate to named monuments, major streets and validated arrival sightlines. Region quotas keep the whole city inhabited instead of allowing early regions to exhaust a global procedural cap.',
});
