import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { terrainHeightAt, HILLS, TIBER } from '../frontend/ancient-cities/rome-410-476/data/terrain.js';
import { generateUrbanFabric } from '../frontend/ancient-cities/rome-410-476/data/urban-fabric.js';
import { CITY, REGIONS, STREETS, BUILDINGS } from '../frontend/ancient-cities/rome-410-476/data/city.js';
import { evidenceForRecord } from '../frontend/ancient-world/engine/evidence.js';
import { compactCityLayout, CITY_COMPACTION_PROFILES } from '../frontend/ancient-world/assets/city-layout-tools.js';
import { overlapsWater, buildFramingClearZones, overlapsClearZones } from '../frontend/ancient-world/assets/urban-fabric-tools.js';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'frontend/ancient-cities/rome-410-476/js/app.js'), 'utf8');
const bootstrap = readFileSync(resolve(root, 'frontend/ancient-world/engine/city-bootstrap.js'), 'utf8');
const runtime = readFileSync(resolve(root, 'frontend/ancient-world/engine/flat-city-runtime.js'), 'utf8');
const assets = readFileSync(resolve(root, 'frontend/ancient-world/assets/blocky-asset-library.js'), 'utf8');
const ROME_WATERS = [{ type:'rect', x:TIBER.x, z:0, w:92, d:1450, name:'Tiber' }];
const ROME_BOUNDS = { minX:-900, maxX:700, minZ:-700, maxZ:700 };
const ROME_SPAWN = { x:-205, z:-165, yaw:Math.PI * 0.88, pitch:-0.03 };

function liveRome() {
  return compactCityLayout({
    city:CITY,
    regions:REGIONS,
    streets:STREETS,
    buildings:BUILDINGS,
    waters:ROME_WATERS,
    bounds:ROME_BOUNDS,
    spawn:ROME_SPAWN,
  }, CITY_COMPACTION_PROFILES.rome);
}

test('archived Rome topography data remains available as research even though runtime ground is flat', () => {
  const palatine = HILLS.find((hill) => hill.id === 'palatine');
  const aventine = HILLS.find((hill) => hill.id === 'aventine');
  assert.ok(terrainHeightAt(palatine.x, palatine.z) > 8);
  assert.ok(terrainHeightAt(aventine.x, aventine.z) > 9);
  assert.ok(terrainHeightAt(TIBER.x, 0) < TIBER.waterY + 0.2, 'river-bed research field should remain intact');
  assert.match(runtime, /baseHeightAt:\s*\(\) => 0/);
});

test('compact live urban fabric is deterministic, dense across Rome and explicitly plausible', () => {
  const layout = liveRome();
  const args = { regions:layout.regions, buildings:layout.buildings, streets:layout.streets, waters:layout.waters, mobile:false };
  const a = generateUrbanFabric(args);
  const b = generateUrbanFabric(args);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 160 && a.length <= 500, `unexpected compact fabric count ${a.length}`);
  assert.ok(a.every((item) => item.evidence?.level === 'plausible'));
  assert.ok(a.every((item) => item.visualStyle === 'blocky-low-poly'));
  assert.ok(a.every((item) => !overlapsWater(item.x, item.z, item.w, item.d, layout.waters, 3)), 'fabric must clear the compact Tiber corridor');
  const populatedRegions = new Set(a.map((item) => item.region));
  assert.ok(populatedRegions.size >= 11, `urban cap should not starve late regiones; populated ${populatedRegions.size}`);
  const clearZones = buildFramingClearZones(layout.buildings, { radius:24 });
  for (const item of a) {
    assert.equal(overlapsClearZones(item.x, item.z, item.w, item.d, clearZones), false, `${item.id} intrudes into a hero arrival clear zone`);
  }
  const source = readFileSync(resolve(root, 'frontend/ancient-cities/rome-410-476/data/urban-fabric.js'), 'utf8');
  assert.match(source, /fairRegionalQuotas:\s*true/);
  assert.match(source, /cinematicClearZones:\s*true/);
  assert.match(source, /denseStreetFrontage:\s*true/);
});

test('inferred source records remain explicitly plausible in the live Rome wrapper', () => {
  const inferredRecords = BUILDINGS.filter((building) => building.state === 'inferred');
  assert.ok(inferredRecords.length > 0, 'Rome should retain inferred source records for this regression');
  for (const inferred of inferredRecords) {
    assert.equal(inferred.evidence?.level, 'plausible', `${inferred.id} must retain its authored legacy evidence label`);
    assert.equal(evidenceForRecord(inferred).id, 'plausible');
  }
  const named = BUILDINGS.find((building) => building.id === 'pantheon');
  assert.equal(evidenceForRecord(named).id, 'documented');
});

test('Rome consumes source data through shared bootstrap and dedicated reusable hero assets', () => {
  assert.match(app, /startAncientCity/);
  assert.match(app, /compactionProfile:'rome'/);
  assert.match(app, /generateFabric:generateUrbanFabric/);
  assert.match(app, /expandWalls:true/);
  assert.doesNotMatch(app, /compactCityLayout|expandPerimeterWalls|startFlatBlockyCity|terrainHeightAt|buildTerrainMesh|buildTiberHazards/);
  assert.match(bootstrap, /compactCityLayout/);
  assert.match(bootstrap, /expandPerimeterWalls/);
  assert.match(bootstrap, /startFlatBlockyCity/);
  assert.match(runtime, /createBlockyAssetLibrary/);
  assert.match(assets, /function colosseum\(/);
  assert.match(assets, /function pantheon\(/);
});
