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
  // The Acropolis is an elongated rock/plateau, not a Gaussian dome. The wider
  // upper shoulder also gives the processional west approach a physically valid
  // landmark-arrival surface instead of forcing the camera to the plain below.
  { id: 'acropolis', name: 'Akropolis rock', x: -25, z: -310, height: 32.0, rx: 150, rz: 108, rot: -0.05 },
  { id: 'areopagus', name: 'Areopagus', x: -220, z: -180, height: 8.5, rx: 75, rz: 60, rot: 0.10 },
  { id: 'pnyx', name: 'Pnyx', x: -290, z: -135, height: 11.0, rx: 90, rz: 70, rot: -0.18 },
  { id: 'nymphs', name: 'Hill of the Nymphs', x: -240, z: -120, height: 6.0, rx: 55, rz: 50, rot: 0.05 },
  { id: 'agoraios-kolonos', name: 'Agoraios Kolonos', x: 60, z: 140, height: 4.5, rx: 90, rz: 70, rot: 0.0 },
  { id: 'lykabettos', name: 'Lykabettos', x: 290, z: -100, height: 28.0, rx: 110, rz: 100, rot: 0.0 },
  { id: 'mouseion', name: 'Mouseion', x: -90, z: -250, height: 4.0, rx: 70, rz: 60, rot: 0.05 },
  { id: 'munichia', name: 'Munichia hill', x: 1080, z: 280, height: 10.0, rx: 75, rz: 70, rot: -0.12 },
]);

export const ERIDANOS = Object.freeze({ x: 350, halfWidth: 18, waterY: -1.2, bankFalloff: 50 });
export const ILISSOS = Object.freeze({ x: -300, zOffset: 100, halfWidth: 22, waterY: -1.6, bankFalloff: 60 });
export const KEPHISSOS = Object.freeze({ x: -100, halfWidth: 120, waterY: -2.4, bankFalloff: 140 });

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

function ellipseDistance(hill, x, z) {
  const dx = x - hill.x, dz = z - hill.z;
  const ca = Math.cos(-(hill.rot || 0)), sa = Math.sin(-(hill.rot || 0));
  const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
  return {
    distance: Math.sqrt((lx * lx) / (hill.rx * hill.rx) + (lz * lz) / (hill.rz * hill.rz)),
    lx,
    lz,
  };
}

function acropolisContribution(hill, x, z) {
  const { distance, lx, lz } = ellipseDistance(hill, x, z);
  if (distance >= 1) return 0;

  // Broad upper platform, then a deliberately compressed cliff shoulder. The
  // player reads a sacred rock with a summit, not a smooth green mound.
  let profile;
  if (distance <= 0.62) {
    profile = 0.91 + 0.09 * smooth(1 - distance / 0.62);
  } else {
    profile = 0.91 * smooth(1 - (distance - 0.62) / 0.38);
  }

  // Low-amplitude deterministic rock break-up only on the shoulder; the sacred
  // upper platform stays stable enough for monuments and traversal.
  const shoulder = smooth((distance - 0.58) / 0.12) * smooth((0.99 - distance) / 0.20);
  const fracture = (Math.sin(lx * 0.105) * 0.46 + Math.sin(lz * 0.137 + 1.7) * 0.34 + Math.sin((lx + lz) * 0.061) * 0.20);
  return Math.max(0, hill.height * profile + fracture * shoulder * 1.15);
}

function hillContribution(hill, x, z) {
  if (hill.id === 'acropolis') return acropolisContribution(hill, x, z);
  const { distance } = ellipseDistance(hill, x, z);
  if (distance >= 1) return 0;
  return hill.height * smooth(1 - distance);
}

function streamDip(x, z, river) {
  if (Math.abs(x - river.x) > river.bankFalloff) return 0;
  const bank = smooth(1 - Math.abs(x - river.x) / river.bankFalloff);
  return -bank * 2.2;
}

function ilissosDip(x, z) {
  const dx = x - ILISSOS.x, dz = z - ILISSOS.zOffset;
  const parallel = (dx - dz * 0.4);
  const perp = (dx * 0.4 + dz);
  if (Math.abs(perp) > ILISSOS.bankFalloff) return 0;
  const bank = smooth(1 - Math.abs(perp) / ILISSOS.bankFalloff);
  return -bank * (2.0 + Math.abs(parallel) * 0.012);
}

function kephissosDip(x, z) {
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
  if (best) return { elevation: terrainHeightAt(x, z), feature: best.name, evidence: TERRAIN_EVIDENCE };
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
