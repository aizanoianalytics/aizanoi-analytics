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

test('Rome topography gives named hills meaningful elevation and Tiber a lower valley', () => {
  const palatine = HILLS.find((hill) => hill.id === 'palatine');
  const aventine = HILLS.find((hill) => hill.id === 'aventine');
  assert.ok(terrainHeightAt(palatine.x, palatine.z) > 8);
  assert.ok(terrainHeightAt(aventine.x, aventine.z) > 9);
  assert.ok(terrainHeightAt(TIBER.x, 0) < TIBER.waterY + 0.2, 'river bed should sit below or near water level');
});

test('urban fabric is deterministic, bounded and explicitly plausible', () => {
  const a = generateUrbanFabric({ regions: REGIONS, buildings: BUILDINGS, streets: STREETS, mobile: false, tiberX: TIBER.x });
  const b = generateUrbanFabric({ regions: REGIONS, buildings: BUILDINGS, streets: STREETS, mobile: false, tiberX: TIBER.x });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 70 && a.length <= 240, `unexpected fabric count ${a.length}`);
  assert.ok(a.every((item) => item.evidence?.level === 'plausible'));
  assert.ok(a.every((item) => Math.abs(item.x - TIBER.x) >= 64));
});

test('inferred source records resolve to a plausible evidence level', () => {
  const inferred = BUILDINGS.find((building) => building.state === 'inferred');
  assert.equal(evidenceForRecord(inferred).id, 'plausible');
  const named = BUILDINGS.find((building) => building.id === 'pantheon');
  assert.equal(evidenceForRecord(named).id, 'documented');
});

test('Rome renderer consumes terrain, evidence and urban fabric contracts', () => {
  assert.match(app, /baseHeightAt: terrainHeightAt/);
  assert.match(app, /generateUrbanFabric/);
  assert.match(app, /buildTerrainMesh\(\)/);
  assert.match(app, /buildTiberHazards\(\)/);
  assert.match(app, /function colosseum\(/);
  assert.match(app, /function pantheon\(/);
  assert.match(app, /evidenceBadgeHTML/);
  assert.match(app, /urbanFabric: URBAN_FABRIC/);
});
