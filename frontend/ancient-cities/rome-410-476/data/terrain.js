// Rome AD 410–476 — schematic topographic field.
// This is deliberately NOT a surveyed DEM. It preserves major hill/valley
// relationships for walking and silhouette while local elevations remain
// explicitly reconstructed.
export const TERRAIN_EVIDENCE = Object.freeze({
  level: 'plausible',
  label: 'Schematic topography',
  note: 'Major Roman hill and valley relationships are represented; local elevations are illustrative rather than a cadastral or surveyed fifth-century surface.',
});

export const HILLS = Object.freeze([
  { id: 'capitoline', name: 'Capitoline', x: -235, z: -82, height: 12.5, rx: 92, rz: 82, rot: -0.08 },
  { id: 'palatine', name: 'Palatine', x: -28, z: -240, height: 14.5, rx: 118, rz: 92, rot: 0.08 },
  { id: 'aventine', name: 'Aventine', x: -292, z: -425, height: 16.0, rx: 142, rz: 118, rot: -0.18 },
  { id: 'caelian', name: 'Caelian', x: -20, z: -330, height: 10.5, rx: 150, rz: 105, rot: 0.24 },
  { id: 'esquiline', name: 'Esquiline', x: 155, z: 205, height: 13.5, rx: 190, rz: 155, rot: -0.18 },
  { id: 'viminal', name: 'Viminal', x: 28, z: 315, height: 9.5, rx: 120, rz: 105, rot: 0.05 },
  { id: 'quirinal', name: 'Quirinal', x: -145, z: 340, height: 13.0, rx: 170, rz: 145, rot: -0.12 },
  { id: 'janiculum', name: 'Janiculum / Transtiberim rise', x: -720, z: 130, height: 18.0, rx: 190, rz: 260, rot: -0.10 },
]);

export const TIBER = Object.freeze({ x: -505, halfWidth: 46, waterY: -2.15, bankFalloff: 92 });
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

export function terrainHeightAt(x, z) {
  let height = 0;
  for (const hill of HILLS) height = Math.max(height, hillContribution(hill, x, z));
  const riverDistance = Math.abs(x - TIBER.x);
  if (riverDistance < TIBER.bankFalloff) {
    const bank = smooth(1 - riverDistance / TIBER.bankFalloff);
    height -= bank * 3.4;
  }
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
  return {
    elevation: terrainHeightAt(x, z),
    feature: best?.name || (Math.abs(x - TIBER.x) < TIBER.bankFalloff ? 'Tiber valley' : 'Roman urban plain'),
    evidence: TERRAIN_EVIDENCE,
  };
}
