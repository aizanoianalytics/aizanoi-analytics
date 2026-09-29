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

/**
 * Distance to stand back from a landmark so it fills a set share of the frame.
 *
 * `landmarkStandoff` sizes the view from the monument itself, but callers also
 * wanted room for the approach and the foreground. That extra room used to be a
 * hard 220-unit floor, which silently overrode the geometry: Aizanoi's temple is
 * the smallest landmark at 22.6 units across, so the floor pushed the camera far
 * enough back that it covered only 8.7 degrees of a 55-degree frame, while the
 * Colosseum at 62 units covered 25.6. The landmark read as a distant smudge
 * rather than a building.
 *
 * The extra is now expressed as a multiple of the monument's own standoff, so a
 * small temple and a large one are framed comparably and the geometry, not a
 * constant chosen for one world's largest landmark, decides the distance.
 */
export function landmarkArrivalDistance(building, { verticalFov = 65, approach = 1.6 } = {}) {
  return Math.ceil(landmarkStandoff(building, { verticalFov }) * approach);
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
 * Occlusion test: `n` is the unit vector from the camera position `c` toward the
 * landmark, so a building centre `q` is on the camera→landmark ray when
 * `along = q·n` is positive, and it is only actually occluding while it is
 * still closer than the landmark itself, i.e. `along < |landmark - c|`. An
 * earlier version rejected `along >= 0` and therefore treated every real
 * occluder as "at or behind the landmark", which meant nothing between the
 * camera and the target was ever detected. See
 * `tests/worlds-clear-view-azimuth.test.mjs` for independently derived
 * geometry rather than a copy of this implementation.
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
      // `along` is the signed distance from the camera toward the landmark.
      // A real occluder sits on that ray and is still closer than the target.
      if (along <= 0) continue;                // behind the camera
      if (along >= distance) continue;         // at or behind the landmark
      const perp = Math.abs(qx * nz - qz * nx);
      const half = Math.max(1, Math.max(Number(b.w) || 10, Number(b.d) || 10) / 2);
      if (perp >= half) continue;                // off the sight line
      if ((Number(b.h) || 10) <= eye) continue;  // too low to block the view
      const apparent = Math.atan2(half, along);
      // It must cover a real share of the landmark's own angular size to count
      // as blocking; a distant sliver in front of the target is not an occluder.
      if (apparent < own * 0.35) continue;
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
