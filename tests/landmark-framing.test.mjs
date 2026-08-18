import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { landmarkCameraClearance, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';

const root = resolve(import.meta.dirname, '..');

test('shared landmark framing scales back from large monuments', () => {
  assert.ok(landmarkFramingDistance({ w:125, d:102, h:48 }) > 180);
  assert.ok(landmarkFramingDistance({ w:46, d:22, h:16 }) > 70);
  assert.equal(landmarkViewDirections().length, 8);
});

test('shared landmark look targets the upper mass without extreme pitch', () => {
  const targetY = landmarkLookHeight({ h:48 }, 3);
  const pitch = landmarkLookPitch({ eyeY:4.7, targetY, horizontalDistance:190 });
  assert.ok(pitch > 0 && pitch < 0.2);
});

for (const city of ['rome-410-476','athens-450-430']) {
  test(`${city} uses shared cinematic landmark framing`, () => {
    const source = readFileSync(resolve(root, `frontend/ancient-cities/${city}/js/app.js`), 'utf8');
    assert.match(source, /landmarkFramingDistance/);
    assert.match(source, /landmarkViewDirections/);
    assert.match(source, /lookY/);
    assert.match(source, /arrivalUntil/);
    assert.match(source, /resolved = false/);
    assert.match(source, /resolved: true/);
  });
}

test('Aizanoi Temple jump keeps the open eastern sanctuary approach after runtime extraction', () => {
  const source = readFileSync(resolve(root, 'frontend/historic-world/app.js'), 'utf8');
  assert.match(source, /temple:\{pos:\[-68,20\],look:\[-160,20\]\}/);
});

test('landmark approach clearance rejects traversal-breaking support changes', () => {
  const flat = traversalApproachClearance({
    candidate: { x:0, z:0 }, target: { x:0, z:-20 },
    collide: () => false,
    absoluteSupportAt: () => ({ y:0 }),
    resolveSupport: (_x, _z, currentY) => ({ y:currentY, blockedRise:false, blockedDrop:false }),
  });
  assert.equal(flat, 7);

  let calls = 0;
  const broken = traversalApproachClearance({
    candidate: { x:0, z:0 }, target: { x:0, z:-20 },
    collide: () => false,
    absoluteSupportAt: () => ({ y:0 }),
    resolveSupport: () => {
      calls += 1;
      return { y:0, blockedRise:false, blockedDrop:calls >= 2 };
    },
  });
  assert.equal(broken, 1);
});

test('landmark sight clearance rejects terrain or solids crossing the view ray', () => {
  const clear = landmarkSightClearance({
    candidate:{x:0,z:0}, target:{x:0,z:-100}, eyeY:3, targetY:14,
    collide:()=>false, heightAt:()=>0,
  });
  assert.equal(clear, 7);
  const blocked = landmarkSightClearance({
    candidate:{x:0,z:0}, target:{x:0,z:-100}, eyeY:3, targetY:14,
    collide:(_x,z)=>z < -25, heightAt:()=>0,
  });
  assert.ok(blocked < clear);
});

test('landmark camera clearance respects rotated high building footprints', () => {
  const obstacles = [{ id:'palace', x:0, z:0, w:100, d:60, h:30, rot:0 }];
  assert.equal(landmarkCameraClearance({ candidate:{x:55,z:0}, obstacles }), 5);
  assert.ok(landmarkCameraClearance({ candidate:{x:90,z:0}, obstacles }) >= 40);
  assert.equal(landmarkCameraClearance({ candidate:{x:0,z:0}, obstacles, ignoreId:'palace' }), 100);
});
