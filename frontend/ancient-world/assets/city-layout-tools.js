// Renderer-neutral city layout normalization helpers.
// These transform city-data records into safe reusable asset placements without
// changing the historical source data that lives in each city's data folder.

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function compactAxis(value, center, innerScale, coreRadius, outerScale) {
  if (!Number.isFinite(Number(value))) return value;
  const delta = Number(value) - center;
  const sign = Math.sign(delta) || 1;
  const distance = Math.abs(delta);
  const compacted = distance <= coreRadius
    ? distance * innerScale
    : coreRadius * innerScale + (distance - coreRadius) * outerScale;
  return center + sign * compacted;
}

function scaledFraming(framing, scale) {
  if (!framing) return framing;
  return {
    ...framing,
    distance: Number.isFinite(Number(framing.distance))
      ? Math.max(8, Number(framing.distance) * scale)
      : framing.distance,
  };
}

export const CITY_COMPACTION_PROFILES = Object.freeze({
  aizanoi: Object.freeze({
    id: 'aizanoi-dense-core', centerX: 0, centerZ: 0,
    innerScaleX: 0.68, innerScaleZ: 0.66, coreX: 650, coreZ: 650,
    outerScaleX: 0.48, outerScaleZ: 0.42,
    structureScale: 0.86, heightScale: 0.96,
    regionScaleX: 0.72, regionScaleZ: 0.70,
    perimeterScaleX: 0.68, perimeterScaleZ: 0.66,
    roadWidthScale: 0.92, waterWidthScale: 0.90,
    framingScale: 0.78, boundsPadding: 64,
  }),
  rome: Object.freeze({
    id: 'rome-dense-core', centerX: -140, centerZ: 0,
    innerScaleX: 0.68, innerScaleZ: 0.68, coreX: 650, coreZ: 600,
    outerScaleX: 0.52, outerScaleZ: 0.50,
    structureScale: 0.84, heightScale: 0.96,
    regionScaleX: 0.72, regionScaleZ: 0.72,
    perimeterScaleX: 0.68, perimeterScaleZ: 0.68,
    roadWidthScale: 0.90, waterWidthScale: 0.88,
    framingScale: 0.78, boundsPadding: 68,
  }),
  athens: Object.freeze({
    id: 'athens-dense-core', centerX: 90, centerZ: 20,
    innerScaleX: 0.64, innerScaleZ: 0.68, coreX: 600, coreZ: 500,
    outerScaleX: 0.46, outerScaleZ: 0.50,
    structureScale: 0.84, heightScale: 0.96,
    regionScaleX: 0.69, regionScaleZ: 0.72,
    perimeterScaleX: 0.64, perimeterScaleZ: 0.68,
    roadWidthScale: 0.90, waterWidthScale: 0.88,
    framingScale: 0.76, boundsPadding: 68,
  }),
});

export function compactPoint(x, z, profile) {
  if (!profile) return [x, z];
  return [
    compactAxis(x, finite(profile.centerX), finite(profile.innerScaleX, 1), finite(profile.coreX, Infinity), finite(profile.outerScaleX, profile.innerScaleX || 1)),
    compactAxis(z, finite(profile.centerZ), finite(profile.innerScaleZ, 1), finite(profile.coreZ, Infinity), finite(profile.outerScaleZ, profile.innerScaleZ || 1)),
  ];
}

export function compactBuildings(records = [], profile) {
  if (!profile) return records.map((record) => ({ ...record }));
  return records.map((record) => {
    const [x, z] = compactPoint(record.x, record.z, profile);
    const perimeterEnvelope = record?.type === 'wall' && record.w > 80 && record.d > 80;
    const widthScale = perimeterEnvelope ? profile.perimeterScaleX : profile.structureScale;
    const depthScale = perimeterEnvelope ? profile.perimeterScaleZ : profile.structureScale;
    return {
      ...record,
      x,
      z,
      w: Number.isFinite(Number(record.w)) ? Math.max(1, Number(record.w) * widthScale) : record.w,
      d: Number.isFinite(Number(record.d)) ? Math.max(1, Number(record.d) * depthScale) : record.d,
      h: Number.isFinite(Number(record.h)) ? Math.max(0, Number(record.h) * profile.heightScale) : record.h,
      framing: scaledFraming(record.framing, profile.framingScale),
      visualStyle: 'blocky-low-poly',
      geometryLanguage: 'shared-block-primitives',
    };
  });
}

export function compactRegions(records = [], profile) {
  if (!profile) return records.map((record) => ({ ...record }));
  return records.map((record) => {
    const [x, z] = compactPoint(record.x, record.z, profile);
    return {
      ...record,
      x,
      z,
      w: Number.isFinite(Number(record.w)) ? Math.max(20, Number(record.w) * profile.regionScaleX) : record.w,
      d: Number.isFinite(Number(record.d)) ? Math.max(20, Number(record.d) * profile.regionScaleZ) : record.d,
    };
  });
}

export function compactStreets(records = [], profile) {
  if (!profile) return records.map((record) => ({ ...record, points: (record.points || []).map((point) => [...point]) }));
  return records.map((record) => ({
    ...record,
    points: (record.points || []).map(([x, z]) => compactPoint(x, z, profile)),
    width: Number.isFinite(Number(record.width)) ? Math.max(4, Number(record.width) * profile.roadWidthScale) : record.width,
    visualStyle: 'blocky-low-poly',
  }));
}

export function compactWaters(records = [], profile) {
  if (!profile) return records.map((record) => ({ ...record }));
  return records.map((record) => {
    if (record.type === 'polyline') return {
      ...record,
      points: (record.points || []).map(([x, z]) => compactPoint(x, z, profile)),
      width: Number.isFinite(Number(record.width)) ? Math.max(8, Number(record.width) * profile.waterWidthScale) : record.width,
      visualStyle: 'blocky-low-poly',
    };
    const [x, z] = compactPoint(record.x, record.z, profile);
    return {
      ...record,
      x,
      z,
      w: Number.isFinite(Number(record.w)) ? Math.max(8, Number(record.w) * profile.waterWidthScale) : record.w,
      d: Number.isFinite(Number(record.d)) ? Math.max(8, Number(record.d) * profile.innerScaleZ) : record.d,
      visualStyle: 'blocky-low-poly',
    };
  });
}

export function compactBounds(bounds, profile) {
  if (!bounds || !profile) return bounds ? { ...bounds } : bounds;
  const [minX, minZ] = compactPoint(bounds.minX, bounds.minZ, profile);
  const [maxX, maxZ] = compactPoint(bounds.maxX, bounds.maxZ, profile);
  const pad = profile.boundsPadding || 60;
  return {
    minX: Math.min(minX, maxX) - pad,
    maxX: Math.max(minX, maxX) + pad,
    minZ: Math.min(minZ, maxZ) - pad,
    maxZ: Math.max(minZ, maxZ) + pad,
  };
}

export function compactSpawn(spawn, profile) {
  if (!spawn || !profile) return spawn ? { ...spawn } : spawn;
  const [x, z] = compactPoint(spawn.x, spawn.z, profile);
  return { ...spawn, x, z };
}

export function compactCityLayout({
  city,
  regions = [],
  streets = [],
  buildings = [],
  waters = [],
  bounds = null,
  spawn = null,
} = {}, profile) {
  if (!profile) throw new TypeError('compactCityLayout requires a city compaction profile.');
  const averageScale = (profile.innerScaleX + profile.innerScaleZ) / 2;
  return Object.freeze({
    city: Object.freeze({
      ...city,
      scaleMetres: Number.isFinite(Number(city?.scaleMetres)) ? Math.round(Number(city.scaleMetres) * averageScale) : city?.scaleMetres,
      layoutDensity: 'compact-walkable',
      visualStyle: 'blocky-low-poly',
      layoutProfile: profile.id,
    }),
    regions: Object.freeze(compactRegions(regions, profile)),
    streets: Object.freeze(compactStreets(streets, profile)),
    buildings: Object.freeze(compactBuildings(buildings, profile)),
    waters: Object.freeze(compactWaters(waters, profile)),
    bounds: Object.freeze(compactBounds(bounds, profile)),
    spawn: Object.freeze(compactSpawn(spawn, profile)),
    profile,
  });
}

export function expandPerimeterWalls(records = [], { thickness = 8 } = {}) {
  return records.flatMap((record) => {
    if (record?.type !== 'wall' || !(record.w > 80 && record.d > 80)) return [record];

    const rot = record.rot || 0;
    // Large city-circuit records are data envelopes, not solid buildings. Expand
    // them into four wall strips so collision/geometry never fills the whole city.
    const sides = [
      { suffix: 'north', x: 0, z: record.d / 2, w: record.w, d: thickness },
      { suffix: 'south', x: 0, z: -record.d / 2, w: record.w, d: thickness },
      { suffix: 'east', x: record.w / 2, z: 0, w: record.d, d: thickness, localRot: Math.PI / 2 },
      { suffix: 'west', x: -record.w / 2, z: 0, w: record.d, d: thickness, localRot: Math.PI / 2 },
    ];

    const ca = Math.cos(rot), sa = Math.sin(rot);
    return sides.map((side) => {
      const x = record.x + side.x * ca - side.z * sa;
      const z = record.z + side.x * sa + side.z * ca;
      return {
        ...record,
        id: `${record.id}-${side.suffix}`,
        name: `${record.name} · ${side.suffix}`,
        x,
        z,
        w: side.w,
        d: side.d,
        rot: rot + (side.localRot || 0),
        perimeterPartOf: record.id,
      };
    });
  });
}

export function markHeroAssets(records = [], heroMap = {}) {
  return records.map((record) => heroMap[record.id] ? { ...record, asset: heroMap[record.id] } : record);
}

export const CITY_LAYOUT_TOOLS = Object.freeze({
  preservesSourceData: true,
  flatGroundSafe: true,
  compactWalkableLayouts: true,
  sharedBlockyLanguage: true,
  purpose: 'Normalize source records into dense reusable blocky city placements without mutating the research ledger.',
});
