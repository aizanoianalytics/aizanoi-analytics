/**
 * Shared landmark framing math for Historical Worlds.
 * Keeps teleport views readable across low/wide ruins and tall modern assets.
 */

export function landmarkStandoff(building, { verticalFov = 65 } = {}) {
  const width = Math.max(1, Number(building?.w) || 20);
  const depth = Math.max(1, Number(building?.d) || 20);
  const height = Math.max(1, Number(building?.h) || 10);
  const footprintDistance = Math.hypot(width, depth) * 0.9 + 10;
  const halfFov = Math.max(20, Math.min(80, verticalFov)) * Math.PI / 360;
  const heightDistance = (height / (2 * Math.tan(halfFov))) * 1.35;
  return Math.ceil(Math.max(36, footprintDistance, heightDistance));
}

export function landmarkTargetHeight(building) {
  const height = Math.max(1, Number(building?.h) || 10);
  return Math.max(2.5, Math.min(38, height * 0.4));
}

export function landmarkYaw(from, target) {
  return Math.atan2(target.x - from.x, target.z - from.z);
}
