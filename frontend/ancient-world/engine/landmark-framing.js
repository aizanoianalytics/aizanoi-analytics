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

export function landmarkFramingDistance(building, {
  min = 36,
  footprintScale = 1.35,
  heightScale = 0.45,
  padding = 10,
} = {}) {
  if (!building) return min;
  const footprint = Math.max(Number(building.w) || 0, Number(building.d) || 0);
  const height = Math.max(0, Number(building.h) || 0);
  return Math.max(min, footprint * footprintScale + height * heightScale + padding);
}

export function landmarkLookHeight(building, groundY = 0) {
  const height = Math.max(0, Number(building?.h) || 0);
  return groundY + Math.min(16, Math.max(2.2, height * 0.42));
}

export function landmarkLookPitch({ eyeY, targetY, horizontalDistance, min = -0.18, max = 0.32 }) {
  const distance = Math.max(0.001, Number(horizontalDistance) || 0.001);
  const pitch = Math.atan2((Number(targetY) || 0) - (Number(eyeY) || 0), distance);
  return Math.max(min, Math.min(max, pitch));
}

export function landmarkViewDirections() {
  return DEFAULT_DIRECTIONS.map(([x, z]) => [x, z]);
}

export function landmarkCandidateScore({ clearance = 0, distance = 0, desiredDistance = 0 }) {
  return clearance * 20 - Math.abs(distance - desiredDistance) * 0.08;
}
