import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { terrainHeightAt, HILLS, TIBER } from '../frontend/ancient-cities/rome-410-476/data/terrain.js';
import { generateUrbanFabric } from '../frontend/ancient-cities/rome-410-476/data/urban-fabric.js';
import { REGIONS, STREETS, BUILDINGS } from '../frontend/ancient-cities/rome-410-476/data/city.js';
import { evidenceForRecord } from '../frontend/ancient-world/engine/evidence.js';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'frontend/ancient-cities/rome-410-476/js/app.js'), 'utf8');
const runtime = readFileSync(resolve(root, 'frontend/ancient-world/engine/flat-city-runtime.js'), 'utf8');
const assets = readFileSync(resolve(root, 'frontend/ancient-world/assets/blocky-asset-library.js'), 'utf8');

test('archived Rome topography data remains available as research even though runtime ground is flat', () => {
  const palatine = HILLS.find((hill) => hill.id === 'palatine');
  const aventine = HILLS.find((hill) => hill.id === 'aventine');
  assert.ok(terrainHeightAt(palatine.x, palatine.z) > 8);
  assert.ok(terrainHeightAt(aventine.x, aventine.z) > 9);
  assert.ok(terrainHeightAt(TIBER.x, 0) < TIBER.waterY + 0.2, 'river-bed research field should remain intact');
  assert.match(runtime, /baseHeightAt:\s*\(\) => 0/);
});

test('urban fabric is deterministic, dense across the whole city and explicitly plausible', () => {
  const a = generateUrbanFabric({ regions: REGIONS, buildings: BUILDINGS, streets: STREETS, mobile: false, tiberX: TIBER.x });
  const b = generateUrbanFabric({ regions: REGIONS, buildings: BUILDINGS, streets: STREETS, mobile: false, tiberX: TIBER.x });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 130 && a.length <= 430, `unexpected fabric count ${a.length}`);
  assert.ok(a.every((item) => item.evidence?.level === 'plausible'));
  assert.ok(a.every((item) => Math.abs(item.x - TIBER.x) >= 60));
  const populatedRegions = new Set(a.map((item) => item.region));
  assert.ok(populatedRegions.size >= 11, `urban cap should not starve late regiones; populated ${populatedRegions.size}`);
  for (const [x,z,radius] of [[52,-217,32],[-179,-161,34],[-365,28,30]]) {
    assert.ok(a.every((item) => Math.hypot(item.x - x, item.z - z) >= radius), `inferred fabric intrudes into cinematic clear zone at ${x},${z}`);
  }
  const source = readFileSync(resolve(root, 'frontend/ancient-cities/rome-410-476/data/urban-fabric.js'), 'utf8');
  assert.match(source, /fairRegionalQuotas:\s*true/);
  assert.match(source, /cinematicClearZones:\s*true/);
});

test('inferred source records resolve to a plausible evidence level', () => {
  const inferred = BUILDINGS.find((building) => building.state === 'inferred');
  assert.equal(evidenceForRecord(inferred).id, 'plausible');
  const named = BUILDINGS.find((building) => building.id === 'pantheon');
  assert.equal(evidenceForRecord(named).id, 'documented');
});

test('Rome consumes city data through shared flat runtime and dedicated reusable hero assets', () => {
  assert.match(app, /generateUrbanFabric/);
  assert.match(app, /expandPerimeterWalls/);
  assert.match(app, /startFlatBlockyCity/);
  assert.doesNotMatch(app, /terrainHeightAt|buildTerrainMesh|buildTiberHazards/);
  assert.match(runtime, /createBlockyAssetLibrary/);
  assert.match(assets, /function colosseum\(/);
  assert.match(assets, /function pantheon\(/);
});
