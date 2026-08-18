// Athens 450–430 BCE — schematic topographic field.
// This is deliberately NOT a surveyed DEM. It preserves the major hill and river
// relationships for walking and silhouette. Local elevations are illustrative,
// not a cadastral or surveyed 5th-century surface.
//
// Coordinates follow data/city.js: 1 unit ≈ 0.7 m on the ground.
export const TERRAIN_EVIDENCE = Object.freeze({
  level: 'plausible',
  label: 'Schematic topography',
  note: 'Major Attic hill and river relationships are represented for navigation and silhouette; local elevations are illustrative rather than a surveyed fifth-century surface.',
});

export const HILLS = Object.freeze([
  // The Acropolis rock — ~157 m above sea level; in our grid it's a near-vertical
  // pillar in the centre-west of the walled town.
  { id: 'acropolis', name: 'Akropolis rock', x: -25, z: -310, height: 32.0, rx: 110, rz: 95, rot: -0.05 },
  // Areopagus — low, rocky outcrop north-west of the rock.
  { id: 'areopagus', name: 'Areopagus', x: -220, z: -180, height: 8.5, rx: 75, rz: 60, rot: 0.10 },
  // Pnyx — the assembly rock to the west.
  { id: 'pnyx', name: 'Pnyx', x: -290, z: -135, height: 11.0, rx: 90, rz: 70, rot: -0.18 },
  // Hill of the Nymphs — smaller rise between Pnyx and Areopagus.
  { id: 'nymphs', name: 'Hill of the Nymphs', x: -240, z: -120, height: 6.0, rx: 55, rz: 50, rot: 0.05 },
  // Agoraios Kolonos — the Agora’s low rise, with the Hephaisteion.
  { id: 'agoraios-kolonos', name: 'Agoraios Kolonos', x: 60, z: 140, height: 4.5, rx: 90, rz: 70, rot: 0.0 },
  // Lykabettos — the prominent peak east of the Agora. ~277 m a.s.l.; here a tall landmark.
  { id: 'lykabettos', name: 'Lykabettos', x: 290, z: -100, height: 28.0, rx: 110, rz: 100, rot: 0.0 },
  // Mouseion — hill of the Muses south-west of the rock, where the peripatetic school met.
  { id: 'mouseion', name: 'Mouseion', x: -90, z: -250, height: 4.0, rx: 70, rz: 60, rot: 0.05 },
  // Munichia hill at Piraeus — the rocky headland with the fortress above the harbour.
  { id: 'munichia', name: 'Munichia hill', x: 1080, z: 280, height: 10.0, rx: 75, rz: 70, rot: -0.12 },
]);

// Eridanos stream: west of the Agora, feeding the Sacred Gate fountainhouse.
export const ERIDANOS = Object.freeze({ x: 350, halfWidth: 18, waterY: -1.2, bankFalloff: 50 });
// Ilissos stream: south-east of the walled town, crossed by the bridge to the Olympieion.
export const ILISSOS = Object.freeze({ x: -300, zOffset: 100, halfWidth: 22, waterY: -1.6, bankFalloff: 60 });
// Kephissos / main outwash plain to the north-west, broad and shallow.
export const KEPHISSOS = Object.freeze({ x: -100, halfWidth: 120, waterY: -2.4, bankFalloff: 140 });

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

function hillContribution(hill, x, z) {
  const dx = x - hill.x, dz = z - hill.z;
  const ca = Math.cos(-(hill.rot || 0)), sa = Math.sin(-(hill.rot || 0));
  const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
  const distance = Math.sqrt((lx * lx) / (hill.rx * hill.rx) + (lz * lz) / (hill.rz * hill.rz));
  if (distance >= 1) return 0;
  return hill.height * smooth(1 - distance);
}

function streamDip(x, z, river) {
  if (Math.abs(x - river.x) > river.bankFalloff) return 0;
  const bank = smooth(1 - Math.abs(x - river.x) / river.bankFalloff);
  return -bank * 2.2;
}

function ilissosDip(x, z) {
  // Ilissos flows roughly north-west to south-east; carve a trough along its line.
  const dx = x - ILISSOS.x, dz = z - ILISSOS.zOffset;
  const parallel = (dx - dz * 0.4);
  const perp = (dx * 0.4 + dz);
  if (Math.abs(perp) > ILISSOS.bankFalloff) return 0;
  const bank = smooth(1 - Math.abs(perp) / ILISSOS.bankFalloff);
  return -bank * (2.0 + Math.abs(parallel) * 0.012);
}

function kephissosDip(x, z) {
  // Wide plain dip to the north-west of the city.
  const dx = x - KEPHISSOS.x, dz = z - 460;
  if (Math.abs(dz) > KEPHISSOS.bankFalloff) return 0;
  const bank = smooth(1 - Math.abs(dz) / KEPHISSOS.bankFalloff);
  return -bank * (1.6 + Math.abs(dx) * 0.004);
}

export function terrainHeightAt(x, z) {
  let height = 0;
  for (const hill of HILLS) height = Math.max(height, hillContribution(hill, x, z));
  height += streamDip(x, z, ERIDANOS);
  height += ilissosDip(x, z);
  height += kephissosDip(x, z);
  return height;
}

export function terrainNormalAt(x, z, epsilon = 0.75) {
  const left = terrainHeightAt(x - epsilon, z), right = terrainHeightAt(x + epsilon, z);
  const back = terrainHeightAt(x, z - epsilon), front = terrainHeightAt(x, z + epsilon);
  const nx = left - right, ny = epsilon * 2, nz = back - front;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

export function terrainDescriptorAt(x, z) {
  let best = null, contribution = 0;
  for (const hill of HILLS) {
    const value = hillContribution(hill, x, z);
    if (value > contribution) { contribution = value; best = hill; }
  }
  if (best) {
    return {
      elevation: terrainHeightAt(x, z),
      feature: best.name,
      evidence: TERRAIN_EVIDENCE,
    };
  }
  if (Math.abs(x - ILISSOS.x - (z - ILISSOS.zOffset) * 0.4) < ILISSOS.bankFalloff) {
    return { elevation: terrainHeightAt(x, z), feature: 'Ilissos valley', evidence: TERRAIN_EVIDENCE };
  }
  if (Math.abs(x - ERIDANOS.x) < ERIDANOS.bankFalloff) {
    return { elevation: terrainHeightAt(x, z), feature: 'Eridanos stream', evidence: TERRAIN_EVIDENCE };
  }
  if (z > 360 && z < 600) {
    return { elevation: terrainHeightAt(x, z), feature: 'Academy plain', evidence: TERRAIN_EVIDENCE };
  }
  return { elevation: terrainHeightAt(x, z), feature: 'Attic urban plain', evidence: TERRAIN_EVIDENCE };
}
