import {
  deterministicHash as hash,
  nearestStreet,
  overlapsNamedBuilding,
  overlapsFabric,
  overlapsClearZones,
  overlapsWater,
  buildFramingClearZones,
  regionalPlacementTarget,
} from '../../ancient-world/assets/urban-fabric-tools.js';

const REGION_DENSITY = Object.freeze({
  sanctuary: 0.52,
  'west-quarter': 0.88,
  'east-quarter': 0.88,
  'bath-quarter': 0.72,
  spectacle: 0.54,
  south: 0.76,
});

const REGION_STYLE = Object.freeze({
  sanctuary: { shop:0.62, height:[5,9], materials:['plaster','limestone2','plaster2'] },
  'west-quarter': { shop:0.44, height:[5,10], materials:['plaster','plaster2','brick'] },
  'east-quarter': { shop:0.52, height:[5,10], materials:['plaster2','plaster','brick'] },
  'bath-quarter': { shop:0.38, height:[5,9], materials:['plaster','limestone2','plaster3'] },
  spectacle: { shop:0.42, height:[4.5,8], materials:['plaster2','limestone2','brick'] },
  south: { shop:0.56, height:[5,10], materials:['plaster','plaster2','brickDark'] },
});

function targetForRegion(region, density, mobile) {
  return regionalPlacementTarget(region, density, mobile, {
    desktopCell:18,
    mobileCell:25,
    desktopScale:1.08,
    mobileScale:0.84,
    desktopMin:20,
    desktopMax:86,
    mobileMin:12,
    mobileMax:40,
  });
}

export function generateAizanoiFabric({
  regions,
  buildings,
  streets,
  waters = [],
  mobile = false,
} = {}) {
  if (!regions || !buildings || !streets) throw new TypeError('generateAizanoiFabric requires regions, buildings and streets.');

  const out = [];
  const cell = mobile ? 25 : 18;
  const cap = mobile ? 250 : 560;
  const cinematicClearZones = buildFramingClearZones(buildings, { radius: mobile ? 20 : 24 });

  for (const region of regions) {
    if (out.length >= cap) break;
    const density = REGION_DENSITY[region.id] ?? 0.66;
    const style = REGION_STYLE[region.id] || { shop:0.46, height:[5,9], materials:['plaster','plaster2','limestone2'] };
    const target = targetForRegion(region, density, mobile);
    let placed = 0;
    const minX = region.x - region.w / 2 + cell * 0.48;
    const maxX = region.x + region.w / 2 - cell * 0.48;
    const minZ = region.z - region.d / 2 + cell * 0.48;
    const maxZ = region.z + region.d / 2 - cell * 0.48;

    for (let z = minZ; z <= maxZ && out.length < cap && placed < target; z += cell) {
      for (let x = minX; x <= maxX && out.length < cap && placed < target; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:presence`) > density) continue;

        const street = nearestStreet(x, z, streets);
        const streetClearance = (street?.street.width || 7) / 2 + (mobile ? 4.6 : 3.4);
        if (street && street.distance < streetClearance) continue;

        const bx = x + (hash(`${seed}:jx`) - 0.5) * cell * 0.24;
        const bz = z + (hash(`${seed}:jz`) - 0.5) * cell * 0.24;
        const w = 10.5 + hash(`${seed}:w`) * (mobile ? 5.5 : 8.0);
        const d = 9 + hash(`${seed}:d`) * (mobile ? 5.0 : 7.0);

        if (overlapsWater(bx, bz, w, d, waters, mobile ? 4 : 5)) continue;
        if (overlapsClearZones(bx, bz, w, d, cinematicClearZones)) continue;
        if (overlapsNamedBuilding(bx, bz, w, d, buildings, {
          monumentalSize:70,
          monumentalHeight:16,
          monumentalPadding:7,
          normalPadding:4,
        })) continue;
        if (overlapsFabric(bx, bz, w, d, out, 0.55)) continue;

        const h = style.height[0] + hash(`${seed}:h`) * (style.height[1] - style.height[0]);
        const material = style.materials[Math.min(style.materials.length - 1, Math.floor(hash(`${seed}:mat`) * style.materials.length))];
        const isShop = street && street.distance < 48 && hash(`${seed}:shop`) < style.shop;
        const angle = street && street.distance < 72 ? street.angle : (hash(`${seed}:rot`) - 0.5) * 0.18;

        out.push({
          id: `fabric-${region.id}-${out.length + 1}`,
          name: `Inferred Aizanoi urban fabric · ${region.name}`,
          type: isShop ? 'shop' : 'urban-fabric',
          x: bx,
          z: bz,
          w,
          d,
          h,
          rot: angle,
          region: region.id,
          material,
          state: hash(`${seed}:condition`) < 0.08 ? 'damaged' : 'working',
          visualStyle: 'blocky-low-poly',
          evidence: {
            level: 'plausible',
            note: 'Procedural blocky housing aligned to the compact live street network; not an individually excavated footprint.',
          },
        });
        placed += 1;
      }
    }
  }

  return out;
}

export const AIZANOI_FABRIC_METHOD = Object.freeze({
  deterministic:true,
  compactLayoutAware:true,
  waterAware:true,
  heroArrivalAware:true,
  streetAligned:true,
  visualStyle:'blocky-low-poly',
});
