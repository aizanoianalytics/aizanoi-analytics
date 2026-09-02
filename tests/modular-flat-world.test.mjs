import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKY_ASSET_LIBRARY } from '../frontend/ancient-world/assets/blocky-asset-library.js';
import {
  expandPerimeterWalls,
  compactCityLayout,
  CITY_COMPACTION_PROFILES,
} from '../frontend/ancient-world/assets/city-layout-tools.js';
import { overlapsWater } from '../frontend/ancient-world/assets/urban-fabric-tools.js';
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
import {
  CITY as ROME_CITY,
  REGIONS as ROME_REGIONS,
  BUILDINGS as ROME_BUILDINGS,
  STREETS as ROME_STREETS,
} from '../frontend/ancient-cities/rome-410-476/data/city.js';
import { generateUrbanFabric as generateRomeFabric } from '../frontend/ancient-cities/rome-410-476/data/urban-fabric.js';
import {
  CITY as ATHENS_CITY,
  REGIONS as ATHENS_REGIONS,
  BUILDINGS as ATHENS_BUILDINGS,
  STREETS as ATHENS_STREETS,
} from '../frontend/ancient-cities/athens-450-430/data/city.js';
import { generateUrbanFabric as generateAthensFabric } from '../frontend/ancient-cities/athens-450-430/data/urban-fabric.js';

const read = (path) => readFileSync(path, 'utf8');
const runtimeSource = read('frontend/ancient-world/engine/flat-city-runtime.js');
const bootstrapSource = read('frontend/ancient-world/engine/city-bootstrap.js');
const assetSource = read('frontend/ancient-world/assets/blocky-asset-library.js');
const adapters = [
  read('frontend/historic-world/app.js'),
  read('frontend/ancient-cities/rome-410-476/js/app.js'),
  read('frontend/ancient-cities/athens-450-430/js/app.js'),
];

const ROME_WATERS = [{ type:'rect', x:-505, z:0, w:92, d:1450, name:'Tiber' }];
const ROME_BOUNDS = { minX:-900, maxX:700, minZ:-700, maxZ:700 };
const ROME_SPAWN = { x:-205, z:-165, yaw:Math.PI * 0.88, pitch:-0.03 };
const ATHENS_WATERS = [
  { type:'rect', x:350, z:180, w:36, d:700, name:'Eridanos' },
  { type:'polyline', points:[[-500,-100],[-390,20],[-300,100],[-220,220]], width:38, name:'Ilissos' },
  { type:'rect', x:260, z:470, w:900, d:70, name:'Kephissos plain channel' },
];
const ATHENS_BOUNDS = { minX:-700, maxX:1200, minZ:-480, maxZ:720 };
const ATHENS_SPAWN = { x:110, z:230, yaw:Math.PI * 0.95, pitch:-0.03 };

function boundSize(bounds) {
  return { width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ };
}

function medianNearestSpacing(records) {
  const items = records.filter((record) => record.type !== 'wall' && Number.isFinite(record.x) && Number.isFinite(record.z));
  const distances = items.map((record, index) => {
    let nearest = Infinity;
    for (let i = 0; i < items.length; i++) {
      if (i === index) continue;
      nearest = Math.min(nearest, Math.hypot(record.x - items[i].x, record.z - items[i].z));
    }
    return nearest;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  return distances[Math.floor(distances.length / 2)] || 0;
}

function assertFabricClearOfWater(fabric, waters, label) {
  for (const record of fabric) {
    assert.equal(
      overlapsWater(record.x, record.z, record.w, record.d, waters, 3),
      false,
      `${label} fabric ${record.id} overlaps live water`,
    );
  }
}

function makeLayouts() {
  const aizanoi = compactCityLayout({
    city:AIZANOI_CITY, regions:AIZANOI_REGIONS, streets:AIZANOI_STREETS,
    buildings:AIZANOI_BUILDINGS, waters:AIZANOI_WATERS, bounds:AIZANOI_BOUNDS, spawn:AIZANOI_SPAWN,
  }, CITY_COMPACTION_PROFILES.aizanoi);
  const rome = compactCityLayout({
    city:ROME_CITY, regions:ROME_REGIONS, streets:ROME_STREETS,
    buildings:ROME_BUILDINGS, waters:ROME_WATERS, bounds:ROME_BOUNDS, spawn:ROME_SPAWN,
  }, CITY_COMPACTION_PROFILES.rome);
  const athens = compactCityLayout({
    city:ATHENS_CITY, regions:ATHENS_REGIONS, streets:ATHENS_STREETS,
    buildings:ATHENS_BUILDINGS, waters:ATHENS_WATERS, bounds:ATHENS_BOUNDS, spawn:ATHENS_SPAWN,
  }, CITY_COMPACTION_PROFILES.athens);
  return { aizanoi, rome, athens };
}

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

test('all three worlds are declarative city adapters over one shared bootstrap/runtime', () => {
  for (const source of adapters) {
    assert.match(source, /startAncientCity/);
    assert.doesNotMatch(source, /compactCityLayout|CITY_COMPACTION_PROFILES|startFlatBlockyCity|installCityCompatibility/);
    assert.doesNotMatch(source, /function\s+(?:box|cylinder|temple|buildTerrainMesh)\s*\(/);
    assert.doesNotMatch(source, /baseHeightAt:\s*terrainHeightAt/);
  }
  assert.match(bootstrapSource, /compactCityLayout/);
  assert.match(bootstrapSource, /CITY_COMPACTION_PROFILES/);
  assert.match(bootstrapSource, /startFlatBlockyCity/);
  assert.match(bootstrapSource, /installCityCompatibility/);
  assert.match(bootstrapSource, /installShareableLocation/);
  assert.match(bootstrapSource, /installEvidenceMode/);
});

test('live city bounds are materially smaller than the research coordinate envelopes', () => {
  const { aizanoi, rome, athens } = makeLayouts();
  const cases = [
    ['Aizanoi', AIZANOI_BOUNDS, aizanoi.bounds, 0.76],
    ['Rome', ROME_BOUNDS, rome.bounds, 0.80],
    ['Athens', ATHENS_BOUNDS, athens.bounds, 0.80],
  ];
  for (const [name, source, compact, maxRatio] of cases) {
    const a = boundSize(source);
    const b = boundSize(compact);
    assert.ok(b.width / a.width < maxRatio, `${name} width did not compact enough: ${b.width}/${a.width}`);
    assert.ok(b.depth / a.depth < maxRatio, `${name} depth did not compact enough: ${b.depth}/${a.depth}`);
  }
});

test('named monuments are pulled closer together while retaining one blocky geometry language', () => {
  const { aizanoi, rome, athens } = makeLayouts();
  const cases = [
    ['Aizanoi', AIZANOI_BUILDINGS, aizanoi.buildings],
    ['Rome', ROME_BUILDINGS, rome.buildings],
    ['Athens', ATHENS_BUILDINGS, athens.buildings],
  ];
  for (const [name, source, compact] of cases) {
    const before = medianNearestSpacing(source);
    const after = medianNearestSpacing(compact);
    assert.ok(after < before * 0.82, `${name} landmark spacing remained too open: ${before} -> ${after}`);
    assert.ok(compact.every((item) => item.visualStyle === 'blocky-low-poly'), `${name} has a non-blocky live asset record`);
    assert.ok(compact.every((item) => item.geometryLanguage === 'shared-block-primitives'), `${name} has mixed geometry language`);
  }
});

test('compact procedural neighbourhoods are dense, deterministic and water-safe', () => {
  const { aizanoi, rome, athens } = makeLayouts();
  const aizanoiArgs = { regions:aizanoi.regions, buildings:aizanoi.buildings, streets:aizanoi.streets, waters:aizanoi.waters, mobile:false };
  const romeArgs = { regions:rome.regions, buildings:rome.buildings, streets:rome.streets, waters:rome.waters, mobile:false };
  const athensArgs = { regions:athens.regions, buildings:athens.buildings, streets:athens.streets, waters:athens.waters, mobile:false };
  const fabrics = [
    ['Aizanoi', generateAizanoiFabric(aizanoiArgs), 100, aizanoi.waters],
    ['Rome', generateRomeFabric(romeArgs), 160, rome.waters],
    ['Athens', generateAthensFabric(athensArgs), 120, athens.waters],
  ];
  assert.deepEqual(generateAizanoiFabric(aizanoiArgs), fabrics[0][1]);
  for (const [name, fabric, minimum, waters] of fabrics) {
    assert.ok(fabric.length >= minimum, `${name} compact fabric unexpectedly sparse: ${fabric.length}`);
    assert.ok(fabric.every((item) => item.evidence?.level === 'plausible'));
    assert.ok(fabric.every((item) => item.visualStyle === 'blocky-low-poly'));
    assertFabricClearOfWater(fabric, waters, name);
  }
});

test('Aizanoi source ledger remains intact while its live layout is compact', () => {
  const ids = new Set(AIZANOI_BUILDINGS.map((item) => item.id));
  for (const id of ['temple','agora','greatbath','stadium','theatre','mosaicbath','macellum','bridge2','bridge3','dam','meter']) {
    assert.ok(ids.has(id), `Aizanoi missing ${id}`);
  }
  assert.ok(AIZANOI_STREETS.length >= 6);
  assert.ok(AIZANOI_WATERS.some((water) => water.name === 'Penkalas'));
  const { aizanoi } = makeLayouts();
  assert.equal(aizanoi.city.layoutDensity, 'compact-walkable');
  assert.equal(aizanoi.city.visualStyle, 'blocky-low-poly');
  assert.ok(aizanoi.city.scaleMetres < AIZANOI_CITY.scaleMetres);
});

test('roads and water use the same blocky live presentation contract', () => {
  const { aizanoi, rome, athens } = makeLayouts();
  for (const [name, layout] of [['Aizanoi',aizanoi],['Rome',rome],['Athens',athens]]) {
    assert.ok(layout.streets.every((item) => item.visualStyle === 'blocky-low-poly'), `${name} road style drift`);
    assert.ok(layout.waters.every((item) => item.visualStyle === 'blocky-low-poly'), `${name} water style drift`);
  }
  assert.match(runtimeSource, /function roadGeometry[\s\S]*scene\.box/);
  assert.match(runtimeSource, /function waterGeometry[\s\S]*scene\.box/);
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
