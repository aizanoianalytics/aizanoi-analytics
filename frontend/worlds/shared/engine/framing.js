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

/**
 * Azimuth, measured from the landmark, at which the camera can see it.
 *
 * The declared `viewAngle` on a building is hand-authored, and both Rome's and
 * Athens' were wrong: Rome's -45 deg put the Pantheon, Trajan's Forum, Trajan's
 * Market and Pompey's Theatre between the camera and the Colosseum, and
 * Athens' 0 deg put the Theatre of Dionysus in front of the Parthenon. Both
 * rendered as dark, unreadable masses, so the angle is searched instead of
 * trusted.
 *
 * Candidates are the declared angle first, then a full sweep. A candidate is
 * rejected when a building that stands between the camera and the landmark is
 * both wide enough to span a meaningful part of it and tall enough to actually
 * block the view. Nearest-to-declared wins, so a correct authored angle is
 * never overridden.
 *
 * @param {object} landmark      the building being framed
 * @param {Array}  buildings     every building, used as occluders
 * @param {number} standoff      camera distance from the landmark
 * @param {number} cameraY       eye height of the camera
 * @param {number} declaredAngle the authored viewAngle in radians, if present
 * @returns {number} azimuth in radians, always finite
 */
export function clearViewAzimuth(landmark, buildings, { standoff, cameraY = 1.7, declaredAngle } = {}) {
  const distance = Math.max(1, Number(standoff) || 60);
  const eye = Number(cameraY) || 1.7;
  const halfExtent = Math.max(1, Math.max(Number(landmark?.w) || 20, Number(landmark?.d) || 20) / 2);
  const own = Math.atan2(halfExtent, distance);

  const blocked = (rad) => {
    const cx = landmark.x + Math.sin(rad) * distance;
    const cz = landmark.z + Math.cos(rad) * distance;
    const len = Math.hypot(landmark.x - cx, landmark.z - cz) || 1;
    const nx = (landmark.x - cx) / len;
    const nz = (landmark.z - cz) / len;
    for (const b of buildings || []) {
      if (!b || b === landmark || b.id === landmark.id) continue;
      const qx = b.x - cx, qz = b.z - cz;
      const along = qx * nx + qz * nz;
      if (along >= 0) continue;                 // at or behind the landmark
      const perp = Math.abs(qx * nz - qz * nx);
      const half = Math.max(1, Math.max(Number(b.w) || 10, Number(b.d) || 10) / 2);
      if (perp >= half) continue;                // off the sight line
      if ((Number(b.h) || 10) <= eye) continue;  // too low to block the view
      if (Math.atan2(half, Math.abs(along)) < own * 0.35) continue; // too small to matter
      return true;
    }
    return false;
  };

  const declared = Number.isFinite(declaredAngle) ? declaredAngle : null;
  if (declared !== null && !blocked(declared)) return declared;

  let best = null, bestDelta = Infinity;
  for (let i = 0; i < 72; i++) {
    const rad = (i * 5 - 180) * Math.PI / 180;
    if (blocked(rad)) continue;
    const delta = declared === null
      ? Math.abs(rad)                                     // no preference: face north
      : Math.abs(Math.atan2(Math.sin(rad - declared), Math.cos(rad - declared)));
    if (delta < bestDelta) { bestDelta = delta; best = rad; }
  }
  // Nothing is clear: keep the authored angle rather than inventing a pose.
  return best ?? (declared ?? 0);
}
