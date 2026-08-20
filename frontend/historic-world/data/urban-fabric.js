function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

const ZONES = [
  { id: 'west', x: -430, z: -80, w: 300, d: 360, region: 'west-quarter', density: 0.74 },
  { id: 'east', x: 360, z: -70, w: 330, d: 360, region: 'east-quarter', density: 0.72 },
  { id: 'northwest', x: -360, z: 360, w: 270, d: 220, region: 'bath-quarter', density: 0.55 },
  { id: 'south', x: -210, z: -430, w: 330, d: 260, region: 'south', density: 0.56 },
];

const AVOID = [
  [-160,20,100],[-65,-35,100],[-78,-142,70],[-315,280,125],[-230,555,140],[-230,748,115],[285,105,82],[60,-300,82],[125,45,60],
];

function blocked(x, z, w, d, fabric) {
  if (Math.abs(x - 125) < 42 && z > -420 && z < 450) return true;
  for (const [ax, az, r] of AVOID) if (Math.hypot(x - ax, z - az) < r + Math.max(w, d) * 0.45) return true;
  for (const b of fabric) if (Math.abs(x - b.x) < (w + b.w) * 0.48 && Math.abs(z - b.z) < (d + b.d) * 0.48) return true;
  return false;
}

export function generateAizanoiFabric({ mobile = false } = {}) {
  const out = [];
  const cell = mobile ? 34 : 24;
  const cap = mobile ? 110 : 260;
  for (const zone of ZONES) {
    const minX = zone.x - zone.w / 2, maxX = zone.x + zone.w / 2;
    const minZ = zone.z - zone.d / 2, maxZ = zone.z + zone.d / 2;
    for (let z = minZ; z <= maxZ && out.length < cap; z += cell) {
      for (let x = minX; x <= maxX && out.length < cap; x += cell) {
        const seed = `${zone.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(`${seed}:p`) > zone.density) continue;
        const w = 12 + hash(`${seed}:w`) * 11, d = 10 + hash(`${seed}:d`) * 9;
        const bx = x + (hash(`${seed}:x`) - 0.5) * cell * 0.42, bz = z + (hash(`${seed}:z`) - 0.5) * cell * 0.42;
        if (blocked(bx, bz, w, d, out)) continue;
        out.push({
          id: `fabric-${zone.id}-${out.length + 1}`,
          name: `Inferred Aizanoi house · ${zone.id}`,
          type: hash(`${seed}:shop`) > 0.68 ? 'shop' : 'urban-fabric',
          x: bx, z: bz, w, d,
          h: 5 + hash(`${seed}:h`) * 5.5,
          rot: (hash(`${seed}:r`) - 0.5) * 0.32,
          region: zone.region,
          material: hash(`${seed}:m`) > 0.5 ? 'plaster2' : 'plaster',
          state: 'working',
          evidence: { level: 'plausible', note: 'Procedural blocky housing used to complete the lived city; not an individually excavated footprint.' },
        });
      }
    }
  }
  return out;
}
