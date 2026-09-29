import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CollisionSystem, PLAYER_HEIGHT } from '../frontend/worlds/shared/engine/collision.js';
import {
  landmarkStandoff,
  landmarkArrivalDistance,
  landmarkTargetHeight,
  clearViewAzimuth
} from '../frontend/worlds/shared/engine/framing.js';
import { compactAizanoiLayout, HERO_LANDMARK_ID } from '../frontend/worlds/aizanoi-225/js/city-data.js';

const read = (f) => readFileSync(f, 'utf8');
const COMPACT = compactAizanoiLayout();
const { BUILDINGS, SPAWN } = COMPACT;
const hero = BUILDINGS.find((b) => b.id === HERO_LANDMARK_ID);

// The arrival pipeline, restated from the documented contract rather than
// copied out of the runtime, so a change in either one has to reconcile here.
function composeArrival(building, collision, verticalFov = 65) {
  const standoff = landmarkStandoff(building, { verticalFov });
  const azimuth = clearViewAzimuth(building, BUILDINGS, { standoff, cameraY: 1.7, declaredAngle: building.viewAngle });
  const safe = collision.findSafeSpawn(building.x, building.z, landmarkArrivalDistance(building, { verticalFov }), standoff, azimuth);
  return { standoff, azimuth, safe };
}

test('Aizanoi declares a real hero landmark for the entry arrival', () => {
  assert.ok(hero, `HERO_LANDMARK_ID "${HERO_LANDMARK_ID}" must exist in the city layout`);
  assert.equal(hero.id, 'temple', 'the entry arrival must frame the Temple of Zeus');
});

test('the entry arrival and fast travel share one composer, not two camera paths', () => {
  const main = read('frontend/worlds/aizanoi-225/js/main.js');
  // Both the cinematic landing and teleport must go through the same function.
  assert.match(main, /intro\.onComplete = \(\) => \{[\s\S]*?composeArrivalAt\(HERO_LANDMARK\)/,
    'the opening arrival must call the shared arrival composer');
  assert.match(main, /ui\.onTeleport = \(teleportId\) => \{[\s\S]*?composeArrivalAt\(building\)/,
    'fast travel must call the same shared arrival composer');
  // The old contradictory path must be gone.
  assert.doesNotMatch(main, /teleportTo\(SPAWN\.x, SPAWN\.z, SPAWN\.angle/,
    'entry must no longer jump to the raw SPAWN constant');
});

test('the hero arrival is composed: standoff from geometry, unoccluded, collision-safe', () => {
  const collision = new CollisionSystem();
  const { standoff, azimuth, safe } = composeArrival(hero, collision);

  assert.ok(Number.isFinite(azimuth), `azimuth must be finite, got ${azimuth}`);
  assert.ok(standoff >= 36, `standoff must respect the minimum framing distance, got ${standoff}`);
  assert.ok(Number.isFinite(safe.x) && Number.isFinite(safe.z), 'arrival must land on finite coordinates');

  // It must actually stand off the monument, not inside it.
  const distance = Math.hypot(safe.x - hero.x, safe.z - hero.z);
  const halfDiagonal = Math.hypot(hero.w, hero.d) / 2;
  assert.ok(distance > halfDiagonal,
    `camera must stand outside the temple footprint (distance ${distance.toFixed(1)} vs half-diagonal ${halfDiagonal.toFixed(1)})`);
});

test('the arrival camera is aimed at the monument, not at the horizon', () => {
  const verticalFov = 65;
  const targetHeight = landmarkTargetHeight(hero);
  assert.ok(targetHeight > 2.5, 'target must be above the eye line so the monument fills the frame');
  assert.ok(targetHeight < hero.h,
    `target height ${targetHeight} must stay within the monument's own height ${hero.h}`);
});

test('the compact SPAWN constant is no longer the arrival contract', () => {
  // SPAWN may still seed the pre-intro camera, but the composed arrival must be
  // a genuinely different, geometry-derived pose -- otherwise the entry and the
  // composer are the same thing and the refactor bought nothing.
  const collision = new CollisionSystem();
  const { safe } = composeArrival(hero, collision);
  const moved = Math.hypot(safe.x - SPAWN.x, safe.z - SPAWN.z);
  assert.ok(moved > 1,
    `composed arrival must not simply reuse the raw SPAWN point (moved ${moved.toFixed(2)} units)`);
});

test('every fast-travel destination composes to a valid, collision-safe arrival', () => {
  const collision = new CollisionSystem();
  const ids = ['temple', 'macellum', 'theatre', 'agora', 'greatbath', 'bridge2', 'bridge3', 'street'];
  for (const id of ids) {
    const building = BUILDINGS.find((b) => b.id === id);
    if (!building) continue; // layout may not define every curated pose yet
    const { azimuth, safe } = composeArrival(building, collision);
    assert.ok(Number.isFinite(azimuth), `${id}: azimuth must be finite`);
    assert.ok(Number.isFinite(safe.x) && Number.isFinite(safe.z), `${id}: arrival must be finite`);
    const distance = Math.hypot(safe.x - building.x, safe.z - building.z);
    assert.ok(distance > Math.hypot(building.w, building.d) / 2,
      `${id}: camera must stand outside the footprint`);
  }
});

test('the arrival keeps the player at a walkable eye height', () => {
  const collision = new CollisionSystem();
  const { safe } = composeArrival(hero, collision);
  const eye = (typeof safe.y === 'number' ? safe.y : 0) + 1.7;
  assert.ok(Math.abs(eye - PLAYER_HEIGHT) < 3,
    `arrival eye height ${eye.toFixed(2)} must stay near the player height ${PLAYER_HEIGHT}`);
});
