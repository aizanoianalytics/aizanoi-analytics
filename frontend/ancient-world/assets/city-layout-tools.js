// Renderer-neutral city layout normalization helpers.
// These transform city-data records into safe reusable asset placements without
// changing the historical source data that lives in each city's data folder.

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
  purpose: 'Normalize city records into reusable blocky asset placements.',
});
