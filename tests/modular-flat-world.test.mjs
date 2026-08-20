import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKY_ASSET_LIBRARY } from '../frontend/ancient-world/assets/blocky-asset-library.js';
import {
  expandPerimeterWalls,
  compactCityLayout,
  CITY_COMPACTION_PROFILES,
} from '../frontend/ancient-world/assets/city-layout-tools.js';
import { FLAT_CITY_RUNTIME } from '../frontend/ancient-world/engine/flat-city-runtime.js';
import {
  CITY as AIZANOI_CITY,
  REGIONS as AIZANOI_REGIONS,
  BUILDINGS as AIZANOI_BUILDINGS,
  STREETS as AIZANOI_STREETS,
  WATERS as AIZANOI_WATERS,
  BOUNDS as AIZANOI_BOUNDS,
  SPAWN as AIZANOI_SPAWN,
} from '../frontend/historic-world/data/city.js';
import { generateAizanoiFabric } from '../frontend/historic-world/data/urban-fabric.js';

const read = (path) => readFileSync(path, 'utf8');
const runtimeSource = read('frontend/ancient-world/engine/flat-city-runtime.js');
const assetSource = read('frontend/ancient-world/assets/blocky-asset-library.js');
const adapters = [
  read('frontend/historic-world/app.js'),
  read('frontend/ancient-cities/rome-410-476/js/app.js'),
  read('frontend/ancient-cities/athens-450-430/js/app.js'),
];

test('shared historical runtime is explicitly flat-ground and not a true voxel engine', () => {
  assert.equal(FLAT_CITY_RUNTIME.terrain, 'flat-y0');
  assert.equal(FLAT_CITY_RUNTIME.trueVoxelEngine, false);
  assert.equal(FLAT_CITY_RUNTIME.eyeHeight, 1.68);
  assert.equal(BLOCKY_ASSET_LIBRARY.style, 'blocky-low-poly');
  assert.equal(BLOCKY_ASSET_LIBRARY.trueVoxelEngine, false);
  assert.equal(BLOCKY_ASSET_LIBRARY.flatGroundCompatible, true);
  assert.match(runtimeSource, /baseHeightAt:\s*\(\) => 0/);
});

test('large city-wall envelopes expand into four safe reusable wall placements', () => {
  const wall = { id:'circuit', name:'City circuit', type:'wall', x:10, z:20, w:1000, d:800, h:14 };
  const expanded = expandPerimeterWalls([wall]);
  assert.equal(expanded.length, 4);
  assert.deepEqual(new Set(expanded.map((item) => item.perimeterPartOf)), new Set(['circuit']));
  assert.ok(expanded.every((item) => item.d <= 8.01));
  assert.ok(expanded.every((item) => item.w >= 799));
});

test('asset library contains common historical building types and dedicated hero monuments', () => {
  for (const type of ['urban-fabric','shop','villa','temple','basilica','bath','theatre','stadium','bridge','wall','market','church']) {
    assert.ok(BLOCKY_ASSET_LIBRARY.sharedTypes.includes(type), `missing shared asset type ${type}`);
  }
  for (const hero of ['parthenon','propylaea','colosseum','pantheon','temple-of-zeus']) {
    assert.ok(BLOCKY_ASSET_LIBRARY.heroAssets.includes(hero), `missing hero asset ${hero}`);
  }
  assert.match(assetSource, /function parthenon/);
  assert.match(assetSource, /function colosseum/);
  assert.match(assetSource, /function templeOfZeus/);
});

test('all three worlds are thin compact city adapters over one shared runtime', () => {
  for (const source of adapters) {
    assert.match(source, /compactCityLayout/);
    assert.match(source, /CITY_COMPACTION_PROFILES/);
    assert.match(source, /startFlatBlockyCity/);
    assert.match(source, /installCityCompatibility/);
    assert.doesNotMatch(source, /function\s+(?:box|cylinder|temple|buildTerrainMesh)\s*\(/);
    assert.doesNotMatch(source, /baseHeightAt:\s*terrainHeightAt/);
  }
});

test('Aizanoi is extracted into compact city, water, road and deterministic urban-fabric data', () => {
  const ids = new Set(AIZANOI_BUILDINGS.map((item) => item.id));
  for (const id of ['temple','agora','greatbath','stadium','theatre','mosaicbath','macellum','bridge2','bridge3','dam','meter']) {
    assert.ok(ids.has(id), `Aizanoi missing ${id}`);
  }
  assert.ok(AIZANOI_STREETS.length >= 6);
  assert.ok(AIZANOI_WATERS.some((water) => water.name === 'Penkalas'));

  const layout = compactCityLayout({
    city: AIZANOI_CITY,
    regions: AIZANOI_REGIONS,
    streets: AIZANOI_STREETS,
    buildings: AIZANOI_BUILDINGS,
    waters: AIZANOI_WATERS,
    bounds: AIZANOI_BOUNDS,
    spawn: AIZANOI_SPAWN,
  }, CITY_COMPACTION_PROFILES.aizanoi);
  const args = {
    regions: layout.regions,
    buildings: layout.buildings,
    streets: layout.streets,
    waters: layout.waters,
    mobile:false,
  };
  const a = generateAizanoiFabric(args);
  const b = generateAizanoiFabric(args);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 100, `Aizanoi fabric unexpectedly sparse: ${a.length}`);
  assert.ok(a.every((item) => item.evidence?.level === 'plausible'));
  assert.ok(a.every((item) => item.visualStyle === 'blocky-low-poly'));
});

test('shared runtime still owns movement, collision, mobile input, cleanup and navigation', () => {
  assert.match(runtimeSource, /createTraversalSystem/);
  assert.match(runtimeSource, /installMobileControls/);
  assert.match(runtimeSource, /installBackToOS/);
  assert.match(runtimeSource, /createLifecycle/);
  assert.match(runtimeSource, /EYE_HEIGHT = 1\.68/);
  assert.match(runtimeSource, /WALK_SPEED = 3\.8/);
  assert.match(runtimeSource, /SPRINT_SPEED = 7\.2/);
  assert.match(runtimeSource, /moveWithSubsteps/);
});
