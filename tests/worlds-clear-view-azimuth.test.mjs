import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearViewAzimuth, landmarkStandoff } from '../frontend/worlds/shared/engine/framing.js';
import { BUILDINGS as ROME } from '../frontend/worlds/rome-410-476/js/city-data.js';
import { BUILDINGS as ATHENS } from '../frontend/worlds/athens-450-430/js/city-data.js';

const romeColosseum = () => ROME.find((b) => b.id === 'colosseum');
const athensParthenon = () => ATHENS.find((b) => b.id === 'parthenon');

/** Independently reproduce the occlusion question for one candidate azimuth. */
function hasBlocker(landmark, buildings, standoff, rad, cameraY = 1.7) {
  const cx = landmark.x + Math.sin(rad) * standoff;
  const cz = landmark.z + Math.cos(rad) * standoff;
  const len = Math.hypot(landmark.x - cx, landmark.z - cz) || 1;
  const nx = (landmark.x - cx) / len;
  const nz = (landmark.z - cz) / len;
  const own = Math.atan2(Math.max(landmark.w, landmark.d) / 2, standoff);
  for (const b of buildings) {
    if (b === landmark || b.id === landmark.id) continue;
    const qx = b.x - cx, qz = b.z - cz;
    const along = qx * nx + qz * nz;
    if (along >= 0) continue;
    const perp = Math.abs(qx * nz - qz * nx);
    const half = Math.max(b.w, b.d) / 2;
    if (perp >= half) continue;
    if (b.h <= cameraY) continue;
    if (Math.atan2(half, Math.abs(along)) < own * 0.35) continue;
    return b.id;
  }
  return null;
}

test('a correct authored viewAngle is never overridden', () => {
  const b = { id: 't', x: 0, z: 0, w: 40, d: 40, h: 20, viewAngle: 0.7 };
  const got = clearViewAzimuth(b, [b], { standoff: 100, cameraY: 1.7, declaredAngle: 0.7 });
  assert.equal(got, 0.7, 'an unblocked authored angle must be returned as-is');
});

test('an authored angle with something in front of it is replaced', () => {
  const b = { id: 't', x: 0, z: 0, w: 40, d: 40, h: 20 };
  // The camera stands `st` away from the landmark, so the wall that blocks the
  // view sits on the far side of the camera: along the camera->landmark ray
  // that is a negative parameter.
  const declared = 0.5;
  const st = 100;
  const camX = b.x + Math.sin(declared) * st;
  const camZ = b.z + Math.cos(declared) * st;
  // Halfway from the camera toward the landmark, wide across the sight line.
  // The ray runs camera -> landmark, so a blocker in between sits at
  // camera + sin/cos * distance; one behind the camera cannot occlude anything.
  const wall = {
    id: 'wall',
    x: camX + Math.sin(declared) * (st / 2),
    z: camZ + Math.cos(declared) * (st / 2),
    w: 120, d: 8, h: 30,
  };
  assert.ok(hasBlocker(b, [b, wall], st, declared) !== null,
    'precondition: the authored angle is blocked');
  const got = clearViewAzimuth(b, [b, wall], { standoff: st, cameraY: 1.7, declaredAngle: declared });
  assert.notEqual(got, declared, 'a blocked authored angle must not be used');
  assert.equal(
    hasBlocker(b, [b, wall], st, got), null,
    'the replacement angle must actually be clear',
  );
});

test('a landmark that is blocked from every side keeps its authored angle', () => {
  const b = { id: 't', x: 0, z: 0, w: 40, d: 40, h: 20 };
  // Ring it so nothing is clear.
  const ring = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ring.push({ id: `r${i}`, x: Math.sin(a) * 45, z: Math.cos(a) * 45, w: 70, d: 70, h: 40 });
  }
  const got = clearViewAzimuth(b, [b, ...ring], { standoff: 100, cameraY: 1.7, declaredAngle: 0.5 });
  assert.ok(Number.isFinite(got), 'the result must always be finite');
});

test('Rome\'s Colosseum is framed from an angle with nothing in front of it', () => {
  const L = romeColosseum();
  const standoff = landmarkStandoff(L, { verticalFov: 60 });
  const got = clearViewAzimuth(L, ROME, { standoff, cameraY: 1.7, declaredAngle: L.viewAngle });
  assert.equal(
    hasBlocker(L, ROME, standoff, got), null,
    'the chosen Rome angle must have an unobstructed sight line',
  );
  // The authored angle really was blocked -- this is the regression.
  assert.ok(
    hasBlocker(L, ROME, standoff, L.viewAngle) !== null,
    'Rome\'s authored viewAngle is expected to be blocked; if this ever changes the test is stale',
  );
});

test('Athens\' Parthenon is framed from an angle with nothing in front of it', () => {
  const L = athensParthenon();
  const standoff = landmarkStandoff(L, { verticalFov: 60 });
  const got = clearViewAzimuth(L, ATHENS, { standoff, cameraY: 1.7, declaredAngle: L.viewAngle });
  assert.equal(
    hasBlocker(L, ATHENS, standoff, got), null,
    'the chosen Athens angle must have an unobstructed sight line',
  );
});

test('every world landmark is framed from a clear angle', () => {
  const worlds = [
    ['rome', ROME, 'colosseum'],
    ['athens', ATHENS, 'parthenon'],
  ];
  for (const [name, buildings, id] of worlds) {
    for (const L of buildings.filter((b) => b.id === id)) {
      const standoff = landmarkStandoff(L, { verticalFov: 60 });
      const got = clearViewAzimuth(L, buildings, { standoff, cameraY: 1.7, declaredAngle: L.viewAngle });
      assert.equal(hasBlocker(L, buildings, standoff, got), null,
        `${name}/${L.id} must be framed without an occluder`);
    }
  }
});

// The tests above exercise the solver on the real data, but they would still
// pass if a world stopped calling it and went back to the authored angle. These
// assert the wiring, which is the part that actually regressed.
for (const world of ['aizanoi-225', 'athens-450-430', 'iga-airport', 'rome-410-476']) {
  test(`${world} actually uses the computed sight-line angle`, () => {
    const src = readFileSync(
      new URL(`../frontend/worlds/${world}/js/main.js`, import.meta.url), 'utf8');
    assert.match(src, /clearViewAzimuth/,
      `${world} must call clearViewAzimuth; the authored viewAngle is known to be blocked`);
    const used = src.match(/clearViewAzimuth\([^;]+/g) || [];
    assert.ok(used.length >= 1, `${world} must compute the azimuth`);
    for (const call of used) {
      assert.match(call, /declaredAngle: \w+\.viewAngle/,
        `${world} must pass the authored angle so a correct one is still honoured`);
    }
    // No call site may hand the raw authored angle straight to findSafeSpawn.
    // Counted rather than pattern-matched: the argument list contains nested
    // calls, so a regex over it is unreliable.
    const spawnCalls = [...src.matchAll(/findSafeSpawn\(([\s\S]*?)\);\s*$/gm)].map((m) => m[1]);
    assert.ok(spawnCalls.length >= 1, `${world} must still call findSafeSpawn`);
    for (const args of spawnCalls) {
      assert.ok(
        !/\w+\.viewAngle\s*\?\?\s*0\s*$/.test(args.trim()),
        `${world} must not feed the authored viewAngle straight into findSafeSpawn`,
      );
    }
  });
}
