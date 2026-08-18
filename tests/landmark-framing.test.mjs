import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { landmarkCameraClearance, landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkSightClearance, landmarkViewDirections, traversalApproachClearance } from '../frontend/ancient-world/engine/landmark-framing.js';

const root = resolve(import.meta.dirname, '..');

test('shared landmark framing keeps large monuments dramatic without unsafe close-ups', () => {
  const colosseumDistance = landmarkFramingDistance({ w:125, d:102, h:48 });
  assert.ok(colosseumDistance > 155);
  assert.ok(colosseumDistance < 190);
  assert.ok(landmarkFramingDistance({ w:46, d:22, h:16 }) > 60);
  assert.equal(landmarkViewDirections().length, 8);
});

test('city data can author a framing distance without bypassing shared safety', () => {
  assert.equal(landmarkFramingDistance({ w:125, d:102, h:48, framing:{ distance:152 } }), 152);
  assert.equal(landmarkFramingDistance({ w:70, d:31, h:15, framing:{ distance:70 } }), 70);
});

test('shared landmark look targets the upper mass without extreme pitch', () => {
  const targetY = landmarkLookHeight({ h:48 }, 3);
  const pitch = landmarkLookPitch({ eyeY:4.7, targetY, horizontalDistance:170 });
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

test('Aizanoi Penkalas jump reuses a collision-safe central bridge riverfront view', () => {
  const source = readFileSync(resolve(root, 'frontend/historic-world/index.html'), 'utf8');
  assert.match(source, /historicDebug\.teleportViews\.penkalas/);
  assert.match(source, /historicDebug\.teleportViews\.bridge3/);
  assert.match(source, /audited in this V8 build/);
  assert.doesNotMatch(source, /embedded locally in the HTML/);
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

test('landmark sight clearance requires the sampled view corridor to remain fully readable', () => {
  const clear = landmarkSightClearance({
    candidate:{x:0,z:0}, target:{x:0,z:-100}, eyeY:3, targetY:14,
    collide:()=>false, heightAt:()=>0,
  });
  assert.ok(clear >= 8, 'fully clear view receives full visibility plus composition score');
  const blocked = landmarkSightClearance({
    candidate:{x:0,z:0}, target:{x:0,z:-100}, eyeY:3, targetY:14,
    collide:(_x,z)=>z < -25, heightAt:()=>0,
  });
  assert.equal(blocked, -1, 'partially obscured landmark arrival is rejected');
});

test('authored approach directions influence composition without replacing collision checks', () => {
  const target = { x:0, z:0, framing:{ preferredDirections:[[1,0]] } };
  const east = landmarkSightClearance({ candidate:{x:80,z:0}, target, eyeY:3, targetY:12, collide:()=>false, heightAt:()=>0 });
  const west = landmarkSightClearance({ candidate:{x:-80,z:0}, target, eyeY:3, targetY:12, collide:()=>false, heightAt:()=>0 });
  assert.ok(east >= 8);
  assert.equal(west, -1);
});

test('landmark camera clearance reserves visual silhouette space around tall massing', () => {
  const obstacles = [{ id:'palace', x:0, z:0, w:100, d:60, h:30, rot:0 }];
  assert.ok(landmarkCameraClearance({ candidate:{x:55,z:0}, obstacles }) < 3);
  assert.ok(landmarkCameraClearance({ candidate:{x:90,z:0}, obstacles }) >= 20, 'clear point remains usable after the larger silhouette buffer');
  assert.equal(landmarkCameraClearance({ candidate:{x:0,z:0}, obstacles, ignoreId:'palace' }), 100);
});
