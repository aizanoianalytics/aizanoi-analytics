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
