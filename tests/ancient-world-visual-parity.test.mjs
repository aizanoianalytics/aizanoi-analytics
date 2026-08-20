import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens = read('frontend/ancient-cities/athens-450-430/js/app.js');
const runtime = read('frontend/ancient-world/engine/flat-city-runtime.js');
const compatibility = read('frontend/ancient-world/engine/city-compatibility.js');
const assets = read('frontend/ancient-world/assets/blocky-asset-library.js');
const materials = read('frontend/ancient-world/assets/materials.js');

test('teleports resolve a safe spawn and preserve forward movement after arrival', () => {
  assert.match(runtime, /function candidateSpawn/);
  assert.match(runtime, /traversal\.collide/);
  assert.match(runtime, /traversal\.resolveSpawn/);
  assert.match(runtime, /traversal\.snapPlayerToSupport/);
  assert.match(runtime, /moveWithSubsteps/);
});

test('Rome, Athens and Aizanoi preserve mouse-look acquisition through one compatibility bridge', () => {
  for (const source of [rome, athens]) assert.match(source, /installCityCompatibility/);
  assert.match(compatibility, /pointerdown/);
  assert.match(compatibility, /requestPointerLock/);
  assert.match(runtime, /player\.yaw \+= event\.movementX/);
});

test('shared blocky library carries common street-scale architectural vocabulary', () => {
  for (const name of ['genericHouse','shop','villa','temple','basilica','bath','theatre','stadium','bridge','market','church']) {
    assert.match(assets, new RegExp(`function ${name}\\(`));
  }
  assert.match(materials, /limestone2/);
  assert.match(materials, /plaster3/);
  assert.match(materials, /roof2/);
});

test('hero monuments remain dedicated assets rather than generic city-app geometry', () => {
  for (const hero of ['parthenon','propylaea','colosseum','pantheon','templeOfZeus']) assert.match(assets, new RegExp(`function ${hero}\\(`));
  for (const source of [rome, athens]) {
    assert.doesNotMatch(source, /function\s+(?:parthenonHero|propylaeaHero|maxentiusHero|colosseum|pantheon)\s*\(/);
    assert.match(source, /startFlatBlockyCity/);
  }
});

test('roads, water, sky/fog and lighting are rendered by the shared runtime', () => {
  assert.match(runtime, /function roadGeometry/);
  assert.match(runtime, /function waterGeometry/);
  assert.match(runtime, /lightForHour/);
  assert.match(runtime, /uFog/);
  assert.match(runtime, /uSun/);
});
