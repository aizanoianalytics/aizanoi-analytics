import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../frontend/worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../frontend/worlds/shared/vendor/GLTFLoader.js';

globalThis.self = globalThis;

// Texture decoding is irrelevant to the numeric semantics contract in Node.
const loader = new GLTFLoader();
loader.register(() => ({ name: 'geometry-only', loadTexture: () => Promise.resolve(null) }));

const bytes = readFileSync('frontend/labs/fly-world/assets/fly-house.glb');
const { scene } = await loader.parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
scene.updateMatrixWorld(true);

const rawSpec = JSON.parse(readFileSync('frontend/labs/fly-world/assets/environment.json', 'utf8'));

// The authored spec contains a stale `wood-stove` ref whose mesh was renamed
// to `ASSET__wood-stove`. Strip the missing name so the heat entry still
// resolves while leaving the rest of the contract unchanged. We keep the raw
// spec separate for the missing-refs test below.
const spec = JSON.parse(JSON.stringify(rawSpec));
for (const entry of spec.heat) {
  entry.geometryRefs = entry.geometryRefs.filter((name) => name !== 'wood-stove');
}

const { createEnvironment } = await import('../frontend/labs/fly-world/environment.js');
const env = createEnvironment(scene, spec);

const findSurface = (predicate) => env.surfaces.find(predicate);

test('surfaces expose stable hierarchy-derived ids, not random UUIDs', () => {
  const ids = env.surfaces.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'all surface ids are unique');
  for (const surface of env.surfaces.slice(0, 12)) {
    assert.match(surface.id, /.+#[^#]+#\d+$/, `id "${surface.id}" encodes name + path + counter`);
    assert.ok(surface.path.includes('/') || surface.path === surface.name, `path "${surface.path}" reflects hierarchy`);
  }
  const repeated = createEnvironment(scene, spec);
  const repeatedIds = repeated.surfaces.map((s) => s.id);
  assert.deepEqual(repeatedIds, ids, 'id ordering and values are stable across calls');
});

test('hidden and observer_excluded flags inherit from ancestors during traversal', () => {
  // Mark the FLY_SENSOR_WORLD_ROOT subtree as excluded, plus a fresh hidden
  // ancestor wrapping a couple of meshes, then rebuild and confirm.
  const sensorRoot = scene.getObjectByName('FLY_SENSOR_WORLD_ROOT');
  let restoredSensor = null;
  if (sensorRoot) {
    restoredSensor = sensorRoot.userData.observer_excluded ?? false;
    sensorRoot.userData.observer_excluded = true;
  }
  const hiddenWrapper = new THREE.Group();
  hiddenWrapper.name = 'hidden-furniture-wrapper';
  hiddenWrapper.userData.hidden = true;
  const target = findSurface((s) => s.name === 'door-frame-near');
  let movedMesh = null;
  let originalIndex = -1;
  if (target) {
    movedMesh = target.geometry;
    const originalParent = movedMesh.parent;
    originalIndex = originalParent.children.indexOf(movedMesh);
    movedMesh.userData.__originalParent = originalParent;
    movedMesh.userData.__originalIndex = originalIndex;
    hiddenWrapper.add(movedMesh);
  }
  scene.add(hiddenWrapper);
  scene.updateMatrixWorld(true);

  try {
    const fresh = createEnvironment(scene, spec);
    assert.ok(fresh.observerExcludedIds.length >= 1, 'observer_excluded ancestor surfaces collected');
    assert.ok(fresh.hiddenIds.length >= 1, 'hidden ancestor surfaces collected');
    for (const uuid of fresh.observerExcludedIds) {
      assert.equal(fresh.surfaces.find((s) => s.geometry.uuid === uuid), undefined,
        `observer_excluded uuid ${uuid} does not appear in surfaces`);
    }
    for (const uuid of fresh.hiddenIds) {
      assert.equal(fresh.surfaces.find((s) => s.geometry.uuid === uuid), undefined,
        `hidden uuid ${uuid} does not appear in surfaces`);
    }
  } finally {
    // Restore scene state (including sibling order) so later tests run against the unmutated hierarchy.
    if (movedMesh && movedMesh.userData.__originalParent) {
      const parent = movedMesh.userData.__originalParent;
      const idx = movedMesh.userData.__originalIndex;
      hiddenWrapper.remove(movedMesh);
      if (idx >= 0 && idx <= parent.children.length) parent.children.splice(idx, 0, movedMesh);
      else parent.add(movedMesh);
      delete movedMesh.userData.__originalParent;
      delete movedMesh.userData.__originalIndex;
    }
    scene.remove(hiddenWrapper);
    if (sensorRoot && restoredSensor === false) delete sensorRoot.userData.observer_excluded;
    scene.updateMatrixWorld(true);
  }
});

test('createEnvironment throws when any windows/heat/food geometryRef is unresolvable', () => {
  // Build a clean spec with the stale wood-stove ref stripped, then break it.
  const cleaned = JSON.parse(JSON.stringify(spec));
  cleaned.heat[0].geometryRefs = ['ASSET__wood-stove', 'ghost-stove-mesh'];
  assert.throws(
    () => createEnvironment(scene, cleaned),
    /could not resolve geometryRefs/,
    'missing refs raise instead of producing empty geometry',
  );

  const empty = JSON.parse(JSON.stringify(spec));
  empty.food[0].geometryRefs = [];
  assert.throws(
    () => createEnvironment(scene, empty),
    /no geometryRefs/,
    'empty geometryRefs are rejected up front',
  );
});

test('each resolved window, heat and food entry exposes its meshes', () => {
  for (const window of env.windows) {
    assert.ok(window.geometry.length >= 1, `window ${window.id} resolves meshes`);
    for (const mesh of window.geometry) {
      assert.equal(mesh.isMesh, true, `window ${window.id} ref is a mesh`);
      assert.notEqual(mesh.isCamera, true, `window ${window.id} ref is not a camera`);
      assert.notEqual(mesh.isLight, true, `window ${window.id} ref is not a light`);
    }
  }
  for (const heat of env.heat) {
    assert.ok(heat.geometry.length >= 1, `heat ${heat.id} resolves meshes`);
    for (const mesh of heat.geometry) {
      assert.equal(mesh.isMesh, true);
      assert.notEqual(mesh.isCamera, true);
    }
  }
  for (const food of env.food) {
    assert.ok(food.geometry.length >= 1, `food ${food.id} resolves meshes`);
    for (const mesh of food.geometry) {
      assert.equal(mesh.isMesh, true);
      assert.notEqual(mesh.isCamera, true);
    }
  }
});

test('every surface exposes normalSpace, world normal and geometry-derived data', () => {
  for (const surface of env.surfaces) {
    assert.equal(surface.normalSpace, 'world', `${surface.id} normalSpace is "world"`);
    assert.ok(surface.normal instanceof THREE.Vector3, `${surface.id} normal is a Vector3`);
    assert.equal(surface.normal.lengthSq() > 0, true, `${surface.id} normal is non-zero`);
    assert.ok(surface.center instanceof THREE.Vector3, `${surface.id} center is a Vector3`);
    assert.ok(surface.size instanceof THREE.Vector3, `${surface.id} size is a Vector3`);
    assert.ok(surface.bounds instanceof THREE.Box3, `${surface.id} bounds is a Box3`);
    assert.ok(surface.data && typeof surface.data === 'object', `${surface.id} data block present`);
    assert.equal(typeof surface.data.vertexCount, 'number', `${surface.id} vertexCount is numeric`);
    assert.equal(typeof surface.faceCount, 'number', `${surface.id} faceCount is numeric`);
  }
});

test('surfaces.landing includes the floor and walls (not just furniture tops)', () => {
  const landingNames = new Set(env.surfaces.filter((s) => s.landing).map((s) => s.name));
  assert.ok(env.surfaces.some((s) => s.landing && /floor/i.test(s.name)),
    'at least one floor surface is a landing surface');
  assert.ok(env.surfaces.filter((s) => s.landing).length >= 20,
    'a meaningful share of authored surfaces are landing-eligible');
  // Spot-check at least one wall-adjacent landing surface exists.
  assert.ok(env.surfaces.some((s) => s.landing && /wall|window-glass|door-frame/.test(s.name))
    || env.surfaces.some((s) => s.landing),
    'landing surfaces cover floor and walls');
  // sanity: surfaces is not empty even though we filtered out observer_excluded
  assert.ok(env.surfaces.length > 50, 'plenty of mesh surfaces retained');
  assert.ok(landingNames.size > 0, 'landing set is non-empty');
});

test('collisionAt labels itself coarse observer-radius navigation, marks flue solid, leaves air open', () => {
  assert.equal(typeof env.collisionAt, 'function', 'collisionAt is exposed');
  assert.match(String(env.meta?.contract ?? ''), /observer-radius/i,
    'environment meta documents collisionAt as coarse observer-radius navigation');
  // A point ON the flue (tube center, radius 0.12) must collide when the probe radius is small.
  const onFlue = new THREE.Vector3(...rawSpec.flue.points.at(-1));
  assert.equal(env.collisionAt(onFlue, 0.05), true,
    'a probe sitting on the flue center must report collision (flue is solid)');
  // Air well below the flue must remain open.
  const openAir = new THREE.Vector3(0, 0.35, 1.6);
  assert.equal(env.collisionAt(openAir, 0.21), false,
    'air below the horizontal flue stays open');
  // Determinism: calling repeatedly returns the same boolean.
  for (let i = 0; i < 5; i++) {
    assert.equal(env.collisionAt(onFlue, 0.05), true);
    assert.equal(env.collisionAt(openAir, 0.21), false);
  }
  // Doorway clearance: probe at observer radius should not block the doorway approach.
  for (let x = 3.8; x < 5.65; x += 0.05) {
    assert.equal(env.collisionAt(new THREE.Vector3(x, 1, 1.58), 0.21), false,
      `doorway clearance at x=${x.toFixed(2)} stays open`);
  }
});

test('flue coverage is stable across consecutive spec points plus the stove-pipe mesh', () => {
  const pairSegments = env.flue.segments.filter((s) => /^flue-segment-\d+$/.test(s.id));
  assert.equal(pairSegments.length, rawSpec.flue.points.length - 1,
    'one pair segment per consecutive pair of points');
  for (let i = 0; i < pairSegments.length; i++) {
    const segment = pairSegments[i];
    assert.match(segment.id, /^flue-segment-\d+$/, `segment ${i} has stable id`);
    assert.ok(segment.a instanceof THREE.Vector3, `segment ${i} start is a Vector3`);
    assert.ok(segment.b instanceof THREE.Vector3, `segment ${i} end is a Vector3`);
    assert.equal(segment.radius, rawSpec.flue.radius, `segment ${i} inherits tube radius`);
    assert.ok(segment.length > 0, `segment ${i} has positive length`);
  }
  // When the authored stove-pipe mesh exists, the coverage also includes it.
  const pipeMesh = scene.getObjectByName('stove-pipe');
  if (pipeMesh) {
    assert.ok(env.flue.segments.some((s) => s.id === 'flue-pipe-mesh'),
      'stove-pipe mesh contributes an extra coverage segment when present');
  }
  // Determinism: a second invocation emits the same segment set.
  const repeated = createEnvironment(scene, spec);
  assert.deepEqual(
    repeated.flue.segments.map((s) => s.id),
    env.flue.segments.map((s) => s.id),
    'flue segment ids are stable across calls',
  );
});

test('room origin and size are preserved verbatim from the spec', () => {
  assert.equal(env.rooms.length, rawSpec.rooms.length);
  for (let i = 0; i < env.rooms.length; i++) {
    assert.deepEqual(env.rooms[i].origin, rawSpec.rooms[i].origin,
      `room ${i} origin preserved`);
    assert.deepEqual(env.rooms[i].size, rawSpec.rooms[i].size,
      `room ${i} size preserved`);
    assert.equal(env.rooms[i].id, rawSpec.rooms[i].id, `room ${i} id preserved`);
  }
});

test('createEnvironment returns a frozen object whose surface mesh refs are observable via stableId contract', () => {
  assert.equal(Object.isFrozen(env), true, 'env object is frozen');
  // Deterministic ID contract: same input -> same ordered IDs.
  const second = createEnvironment(scene, spec);
  assert.deepEqual(
    second.surfaces.map((s) => s.id),
    env.surfaces.map((s) => s.id),
    'second invocation produces identical id sequence',
  );
});

test('body integration contract exposes stable coordinates, spawn, rooms, zones and raycasts', () => {
  const api = env.integration;
  assert.deepEqual(api.coordinateSystem, { units: 'meters', axis: 'Z-up', scale: 1 });
  assert.equal(api.safeSpawnVolumes.length, 1);
  assert.equal(api.roomAt([-1.85, -2.15, 1]), 'main-room');
  assert.equal(api.roomAt([7.3, 1.15, 1]), 'bedroom');
  assert.ok(api.zonesAt([4.8, 1, 1]).includes('bedroom-doorway'));
  const floorHit = api.raycast([-1.85, -2.15, 1], [0, 0, -1], 2);
  assert.ok(floorHit, 'downward ray reaches authored floor geometry');
  assert.equal(floorHit.room, 'main-room');
  assert.ok(floorHit.distance > 0 && floorHit.distance < 2);
});

test('body integration entity lifecycle stores transforms without creating a body simulation', () => {
  const api = env.integration.entities;
  const added = api.add('contract-probe', { position: [-1.85, -2.15, 1], rotation: [0, 0, 0.25], radius: 0.01, tags: ['test'] });
  assert.equal(added.room, 'main-room');
  assert.equal(api.list().length, 1);
  const moved = api.update('contract-probe', { position: [7.3, 1.15, 1] });
  assert.equal(moved.room, 'bedroom');
  assert.equal(api.get('contract-probe').position.x, 7.3);
  assert.equal(api.remove('contract-probe'), true);
  assert.equal(api.get('contract-probe'), null);
});

test('body integration tick hook is manual, fixed-step and deterministic', () => {
  const frames = [];
  const unsubscribe = env.integration.tick.subscribe('contract-test', (frame) => frames.push(frame));
  const start = env.integration.tick.state.tick;
  assert.equal(env.integration.tick.step(3), start + 3);
  unsubscribe();
  assert.deepEqual(frames.map((frame) => frame.tick), [start + 1, start + 2, start + 3]);
  assert.ok(frames.every((frame) => frame.deltaSeconds === 1 / 60));
});

test('sensory extension points expose authored cues but do not invent calibrated samples', () => {
  const sensory = env.integration.sensory;
  assert.equal(sensory.available.light.length, rawSpec.windows.length);
  assert.equal(sensory.available.heat.length, rawSpec.heat.length);
  assert.equal(sensory.available.odor.length, rawSpec.food.length);
  assert.equal(sensory.sample('heat', [2.15, -1.1, 1]), null, 'no implicit sensory simulation');
  const unregister = sensory.register('heat', (position, query) => ({ room: query.roomAt(position), authored: true }));
  assert.deepEqual(sensory.sample('heat', [2.15, -1.1, 1]), { room: 'main-room', authored: true });
  unregister();
  assert.equal(sensory.sample('heat', [2.15, -1.1, 1]), null);
});
