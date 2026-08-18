const DEFAULT_DIRECTIONS = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
]);

function explicitFramingDistance(building) {
  const value = Number(building?.framing?.distance);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function landmarkFramingDistance(building, {
  min = 32,
  footprintScale = 1.10,
  heightScale = 0.46,
  padding = 8,
} = {}) {
  if (!building) return min;
  const authored = explicitFramingDistance(building);
  if (authored != null) return Math.max(min, authored);
  const footprint = Math.max(Number(building.w) || 0, Number(building.d) || 0);
  const height = Math.max(0, Number(building.h) || 0);
  return Math.max(min, footprint * footprintScale + height * heightScale + padding);
}

export function landmarkLookHeight(building, groundY = 0) {
  const authored = Number(building?.framing?.lookHeight);
  if (Number.isFinite(authored)) return groundY + authored;
  const height = Math.max(0, Number(building?.h) || 0);
  return groundY + Math.min(17, Math.max(2.2, height * 0.44));
}

export function landmarkLookPitch({ eyeY, targetY, horizontalDistance, min = -0.18, max = 0.32 }) {
  const distance = Math.max(0.001, Number(horizontalDistance) || 0.001);
  const pitch = Math.atan2((Number(targetY) || 0) - (Number(eyeY) || 0), distance);
  return Math.max(min, Math.min(max, pitch));
}

export function landmarkViewDirections() {
  return DEFAULT_DIRECTIONS.map(([x, z]) => [x, z]);
}

function preferredApproachScore(candidate, target) {
  const authored = target?.framing?.preferredDirections;
  if (!Array.isArray(authored) || authored.length === 0) return 1;
  const vx = (Number(candidate.x) || 0) - (Number(target.x) || 0);
  const vz = (Number(candidate.z) || 0) - (Number(target.z) || 0);
  const length = Math.hypot(vx, vz) || 1;
  let best = -1;
  for (const direction of authored) {
    if (!Array.isArray(direction) || direction.length < 2) continue;
    const dx = Number(direction[0]) || 0;
    const dz = Number(direction[1]) || 0;
    const dl = Math.hypot(dx, dz) || 1;
    best = Math.max(best, (vx / length) * (dx / dl) + (vz / length) * (dz / dl));
  }
  return best;
}

export function traversalApproachClearance({
  candidate,
  target,
  collide,
  absoluteSupportAt,
  resolveSupport,
  sampleDistances = [0.65, 1.3, 2.0, 2.8, 3.7, 4.7, 5.8],
} = {}) {
  if (!candidate || !target || typeof collide !== 'function' || typeof absoluteSupportAt !== 'function' || typeof resolveSupport !== 'function') return -1;
  const dx = (Number(target.x) || 0) - (Number(candidate.x) || 0);
  const dz = (Number(target.z) || 0) - (Number(candidate.z) || 0);
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  let floorY = absoluteSupportAt(candidate.x, candidate.z).y;
  let clear = 0;

  for (const distance of sampleDistances) {
    const x = candidate.x + ux * distance;
    const z = candidate.z + uz * distance;
    if (collide(x, z)) break;
    const support = resolveSupport(x, z, floorY);
    if (support.blockedRise || support.blockedDrop) break;
    floorY = support.y;
    clear += 1;
  }
  return clear;
}

export function landmarkSightClearance({
  candidate,
  target,
  eyeY,
  targetY,
  collide,
  heightAt,
  fractions = [0.08, 0.14, 0.22, 0.30, 0.40, 0.50, 0.62, 0.74],
  terrainMargin = 0.42,
} = {}) {
  if (!candidate || !target || typeof collide !== 'function' || typeof heightAt !== 'function') return -1;

  // Authored approach vectors are a composition preference, never a raw spawn.
  // A direction still has to pass every collision/support test below.
  const approach = preferredApproachScore(candidate, target);
  if (approach < 0.52) return -1;

  const dx = (Number(target.x) || 0) - (Number(candidate.x) || 0);
  const dz = (Number(target.z) || 0) - (Number(candidate.z) || 0);
  const fromY = Number(eyeY) || 0;
  const toY = Number(targetY) || 0;
  let clear = 0;
  for (const fraction of fractions) {
    const x = candidate.x + dx * fraction;
    const z = candidate.z + dz * fraction;
    const rayY = fromY + (toY - fromY) * fraction;
    if (collide(x, z)) break;
    if (heightAt(x, z) + terrainMargin > rayY) break;
    clear += 1;
  }

  // A partially blocked ray was previously treated as 'good enough' by the app's
  // viability threshold. For cinematic arrival the whole sampled corridor must
  // remain readable; otherwise hills could hide most of the Parthenon while the
  // upper target point alone remained mathematically visible.
  if (clear < fractions.length) return -1;
  return clear + Math.max(0, approach) * 2;
}

export function landmarkCameraClearance({ candidate, obstacles = [], ignoreId = null, minHeight = 4 } = {}) {
  if (!candidate) return 0;
  let nearest = Infinity;
  for (const obstacle of obstacles) {
    if (!obstacle || obstacle.id === ignoreId || (Number(obstacle.h) || 0) < minHeight) continue;
    const width = Math.max(0, Number(obstacle.w) || 0);
    const depth = Math.max(0, Number(obstacle.d) || 0);
    const height = Math.max(0, Number(obstacle.h) || 0);
    if (!width || !depth) continue;
    const angle = -(Number(obstacle.rot) || 0);
    const dx = (Number(candidate.x) || 0) - (Number(obstacle.x) || 0);
    const dz = (Number(candidate.z) || 0) - (Number(obstacle.z) || 0);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const lx = dx * ca - dz * sa;
    const lz = dx * sa + dz * ca;
    // Reserve visual silhouette space around tall massing, not just collision
    // space. This specifically prevents a safe camera from sitting under a huge
    // neighbouring roof that occupies half the view.
    const silhouettePadding = Math.min(14, Math.max(2.5, height * 0.22));
    const qx = Math.abs(lx) - width / 2 - silhouettePadding;
    const qz = Math.abs(lz) - depth / 2 - silhouettePadding;
    const outside = Math.hypot(Math.max(0, qx), Math.max(0, qz));
    nearest = Math.min(nearest, outside);
  }
  return Number.isFinite(nearest) ? nearest : 100;
}

export function landmarkCandidateScore({ clearance = 0, visibility = 0, cameraClearance = 0, distance = 0, desiredDistance = 0 }) {
  const crowdPenalty = cameraClearance < 18 ? (18 - Math.max(0, cameraClearance)) * 10 : 0;
  return clearance * 22 + visibility * 64 + Math.min(34, Math.max(0, cameraClearance)) * 5 - crowdPenalty - Math.abs(distance - desiredDistance) * 0.12;
}
