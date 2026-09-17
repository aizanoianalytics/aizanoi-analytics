import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const spec = JSON.parse(readFileSync('gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json', 'utf8'));
const builder = readFileSync('scripts/fly-world/build_scene_v2.py', 'utf8');
const fallback = readFileSync('frontend/labs/fly-world/main-v3.js', 'utf8');
const envJson = JSON.parse(readFileSync('frontend/labs/fly-world/assets/environment.json', 'utf8'));

test('exported windows stay on the expanded shell in both builders', () => {
  assert.match(builder, /box\("window-glass",\(\.035,2\.0,1\.56\),\(-4\.8,-.72,1\.50\)/);
  assert.match(fallback, /box\(\[0\.035, 2\.0, 1\.56\], \[-4\.8, -0\.72, 1\.50\]/);
  assert.match(builder, /box\("bedroom-window",\(1\.38,\.035,1\.42\),\(5\.61,4\.25,1\.49\)/);
  assert.match(fallback, /box\(\[1\.38,\.035,1\.42\],\[5\.61,4\.25,1\.49\]/);
});

test('authored bed is used without a second oversized headboard slab', () => {
  assert.ok(!builder.includes('bed-headboard'));
  assert.match(builder, /import_slot\(root,slots,"wooden-bed",\(6\.72,1\.92/);
});

test('kettle sits on the stove, not inside the flue run', () => {
  const kettle = spec.heroObjects.find((item) => item.id === 'kettle');
  const flueYs = spec.environment.flue.points.map((point) => point[1]);
  assert.ok(kettle.position[1] < Math.min(...flueYs) - 0.05, 'kettle is south of the horizontal flue');
  assert.ok(kettle.position[2] < spec.environment.flue.points[0][2] + 0.3);
});

test('cabinet and seating keep separate north-wall footprints', () => {
  const hero = Object.fromEntries(spec.heroObjects.map((item) => [item.id, item]));
  const cabinet = hero['back-cabinet'];
  const bench = hero.bench;
  const cabinetSouth = cabinet.position[1] - cabinet.size[1] / 2;
  const benchNorth = bench.position[1] + bench.size[1] / 2;
  assert.ok(cabinetSouth > benchNorth, 'cabinet stays behind the divan');
  assert.equal(cabinet.rotationDeg[2], 180);
});

test('environment semantics bind real mesh names and keep the doorway open', () => {
  assert.deepEqual(envJson.heat[0].geometryRefs, ['ASSET__wood-stove']);
  assert.match(fallback, /'ASSET__wood-stove'/, 'fallback uses the same heat geometry ref as the GLB');
  assert.equal(envJson.observerExcluded, true);
  assert.equal(envJson.rooms.length, 2);
  assert.equal(envJson.integration.contractVersion, 1);
  assert.equal(envJson.integration.safeSpawnVolumes[0].room, 'main-room');
  assert.equal(envJson.transitions[0].from, 'main-room');
  const flueY = envJson.flue.points[0][1];
  assert.ok(Math.abs(flueY - spec.environment.flue.points[0][1]) < 1e-6);
  const stoveEast = spec.heroObjects.find((item) => item.id === 'wood-stove').position[0] + 0.51;
  assert.ok(stoveEast < 4.8 - 0.21);
});

test('fallback stove and TV transforms match the scene spec', () => {
  assert.match(fallback, /\[2\.15, -1\.10, 0\.59\]/);
  assert.match(fallback, /\[-3\.20, -3\.40, 0\.67\]/);
  assert.match(fallback, /new THREE\.Vector3\(-4\.75,-1\.10,2\.52\)/);
});

test('published environment.json records current builder hashes', () => {
  const report = JSON.parse(readFileSync('frontend/labs/fly-world/assets/environment.json', 'utf8'));
  const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  for (const path of [
    'scripts/fly-world/build_scene_v3.py',
    'scripts/fly-world/build_scene_v2.py',
    'scripts/fly-world/detail_pass_v3.py',
  ]) {
    assert.equal(sha(path), report.sourceHashes[path], `stale source ${path}`);
  }
});
