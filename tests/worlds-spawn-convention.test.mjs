import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionSystem } from '../frontend/worlds/shared/engine/collision.js';
import { clearViewAzimuth } from '../frontend/worlds/shared/engine/framing.js';

// findSafeSpawn must place arrivals in the same yaw convention the framing
// solver searches: atan2(x, z), 0 facing +z, PI/2 facing +x. A cos/sin mix-up
// here once rotated every teleport arrival 90 degrees from its
// occlusion-tested azimuth, landing Aizanoi's temple arrival on the blank
// short end instead of the colonnaded side.
test('findSafeSpawn shares the framing yaw convention (0 = +z, PI/2 = +x)', () => {
  const collision = new CollisionSystem();
  const south = collision.findSafeSpawn(0, 0, 100, 40, 0);
  assert.ok(Math.abs(south.x) < 1e-9, `angle 0 must stand off along +z, got x=${south.x}`);
  assert.ok(south.z > 0, `angle 0 must stand off along +z, got z=${south.z}`);
  const east = collision.findSafeSpawn(0, 0, 100, 40, Math.PI / 2);
  assert.ok(east.x > 0, `angle PI/2 must stand off along +x, got x=${east.x}`);
  assert.ok(Math.abs(east.z) < 1e-9, `angle PI/2 must stand off along +x, got z=${east.z}`);
});

// The solver's azimuth and the spawn search must agree for a real landmark:
// the first candidate direction out of findSafeSpawn has to match the azimuth
// clearViewAzimuth returns when nothing blocks it.
test('spawn placement matches the occlusion-tested azimuth', () => {
  const landmark = { id: 't', x: 0, z: 0, w: 20, d: 20, h: 10 };
  const azimuth = clearViewAzimuth(landmark, [], { standoff: 60, cameraY: 1.7, declaredAngle: Math.PI / 2 });
  assert.ok(Math.abs(azimuth - Math.PI / 2) < 1e-9, `expected declared azimuth back, got ${azimuth}`);
  const collision = new CollisionSystem();
  const safe = collision.findSafeSpawn(0, 0, 100, 59, azimuth);
  assert.ok(safe.x > 0 && Math.abs(safe.z) < 2, `spawn must sit east of the landmark, got (${safe.x}, ${safe.z})`);
});

// ---------------------------------------------------------------------------
// Occlusion geometry, derived independently of the implementation.
//
// The solver places a candidate camera at
//   c = landmark + standoff * (sin(az), cos(az))
// and looks back at the landmark, so its view direction is
//   n = (landmark - c) / |landmark - c| = -(sin(az), cos(az)).
// A building centre q is therefore on the camera->landmark sight line exactly
// when the scalar projection q-c onto n is POSITIVE, and it occludes only while
// that projection is still shorter than the camera->landmark distance (standoff).
//
// The previous implementation rejected `along >= 0`, i.e. it required the
// projection to be negative, so every genuine occluder was discarded as "at or
// behind the landmark" and a genuinely blocked angle was returned as clear.
//
// These cases are built from that independent derivation: the occluder is
// positioned by construction on the segment between camera and landmark, not by
// re-running the solver's own arithmetic.
// ---------------------------------------------------------------------------

const STANDOFF = 60;

/** Camera position the solver uses for a given azimuth, derived from the docs. */
function solverCamera(landmark, azimuth, standoff = STANDOFF) {
  return {
    x: landmark.x + Math.sin(azimuth) * standoff,
    z: landmark.z + Math.cos(azimuth) * standoff
  };
}

/** True when `blocker` covers the sight line from the solver camera to the landmark. */
function occludesByConstruction(landmark, blocker, azimuth, standoff = STANDOFF) {
  const c = solverCamera(landmark, azimuth, standoff);
  const viewLen = Math.hypot(landmark.x - c.x, landmark.z - c.z);
  const n = { x: (landmark.x - c.x) / viewLen, z: (landmark.z - c.z) / viewLen };
  const qx = blocker.x - c.x, qz = blocker.z - c.z;
  const along = qx * n.x + qz * n.z;          // signed distance toward the landmark
  if (along <= 0 || along >= viewLen) return false;
  const perp = Math.abs(qx * n.z - qz * n.x);  // lateral miss distance
  const half = Math.max(1, Math.max(blocker.w, blocker.d) / 2);
  return perp < half;
}

test('a building standing between the camera and the landmark is detected as an occluder', () => {
  const landmark = { id: 'temple', x: 0, z: 0, w: 20, d: 20, h: 10 };
  const declared = Math.PI / 2;                       // camera due east of the temple
  const c = solverCamera(landmark, declared);          // (60, ~0)
  // Place the blocker halfway along the camera->landmark segment: (30, ~0).
  // By construction this is a real occluder for the declared angle.
  const blocker = { id: 'colonnade', x: c.x * 0.5, z: c.z * 0.5, w: 24, d: 24, h: 14 };
  assert.ok(occludesByConstruction(landmark, blocker, declared),
    'fixture must actually occlude, otherwise this test proves nothing');

  const azimuth = clearViewAzimuth(landmark, [landmark, blocker], { standoff: STANDOFF, cameraY: 1.7, declaredAngle: declared });
  assert.ok(Math.abs(azimuth - declared) > 1e-6,
    `a blocked declared angle must not be returned as clear (got ${azimuth}, declared ${declared})`);
});

test('a building behind the camera is never treated as an occluder', () => {
  const landmark = { id: 'temple', x: 0, z: 0, w: 20, d: 20, h: 10 };
  const declared = Math.PI / 2;
  const c = solverCamera(landmark, declared);
  // Continue the same ray past the camera: 1.5x the camera offset from origin.
  const behind = { id: 'behind', x: c.x * 1.5, z: c.z * 1.5, w: 30, d: 30, h: 20 };
  assert.ok(!occludesByConstruction(landmark, behind, declared),
    'fixture must NOT occlude, otherwise this test proves nothing');

  const azimuth = clearViewAzimuth(landmark, [landmark, behind], { standoff: STANDOFF, cameraY: 1.7, declaredAngle: declared });
  assert.ok(Math.abs(azimuth - declared) < 1e-9,
    `a blocker behind the camera must not push the camera off the declared angle (got ${azimuth})`);
});

test('a building beyond the landmark does not block the view of it', () => {
  const landmark = { id: 'temple', x: 0, z: 0, w: 20, d: 20, h: 10 };
  const declared = Math.PI / 2;
  const c = solverCamera(landmark, declared);
  // Far side of the landmark along the same ray: camera would see the temple
  // first, so the far building is hidden behind the target.
  const beyond = { id: 'beyond', x: c.x * -0.5, z: c.z * -0.5, w: 30, d: 30, h: 20 };
  assert.ok(!occludesByConstruction(landmark, beyond, declared),
    'fixture must NOT occlude, otherwise this test proves nothing');

  const azimuth = clearViewAzimuth(landmark, [landmark, beyond], { standoff: STANDOFF, cameraY: 1.7, declaredAngle: declared });
  assert.ok(Math.abs(azimuth - declared) < 1e-9,
    `a blocker beyond the landmark must not push the camera off the declared angle (got ${azimuth})`);
});

test('a building off the sight line does not block it', () => {
  const landmark = { id: 'temple', x: 0, z: 0, w: 20, d: 20, h: 10 };
  const declared = Math.PI / 2;
  const c = solverCamera(landmark, declared);
  // Same distance along the ray, but displaced far to the side.
  const lateral = { id: 'lateral', x: c.x * 0.5 + 40, z: c.z * 0.5, w: 8, d: 8, h: 14 };
  assert.ok(!occludesByConstruction(landmark, lateral, declared),
    'fixture must NOT occlude, otherwise this test proves nothing');

  const azimuth = clearViewAzimuth(landmark, [landmark, lateral], { standoff: STANDOFF, cameraY: 1.7, declaredAngle: declared });
  assert.ok(Math.abs(azimuth - declared) < 1e-9,
    `a lateral building must not push the camera off the declared angle (got ${azimuth})`);
});

test('a building too low to reach eye level is not an occluder', () => {
  const landmark = { id: 'temple', x: 0, z: 0, w: 20, d: 20, h: 10 };
  const declared = Math.PI / 2;
  const c = solverCamera(landmark, declared);
  const lowWall = { id: 'low', x: c.x * 0.5, z: c.z * 0.5, w: 24, d: 24, h: 1.2 };
  const azimuth = clearViewAzimuth(landmark, [landmark, lowWall], { standoff: STANDOFF, cameraY: 1.7, declaredAngle: declared });
  assert.ok(Math.abs(azimuth - declared) < 1e-9,
    `a wall below eye level must not block the landmark (got ${azimuth})`);
});
