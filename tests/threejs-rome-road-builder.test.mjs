import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STREETS } from '../frontend/ancient-cities/rome-410-476/data/city.js';
import { terrainHeightAt } from '../frontend/ancient-cities/rome-410-476/data/terrain.js';
import {
  createRoadPiecePlan,
  ROME_ROAD_RENDER_POLICY,
} from '../experiments/threejs-rome-renderer/src/road-builder.js';

const root = resolve(import.meta.dirname, '..');
const roadBuilderSource = readFileSync(resolve(root, 'experiments/threejs-rome-renderer/src/road-builder.js'), 'utf8');
const mainSource = readFileSync(resolve(root, 'experiments/threejs-rome-renderer/src/main.js'), 'utf8');
const smokeSource = readFileSync(resolve(root, 'experiments/threejs-rome-renderer/scripts/browser-smoke.mjs'), 'utf8');

function planarLength(piece) {
  return Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0);
}

test('desktop Rome road plan follows terrain and preserves every named road', () => {
  const pieces = createRoadPiecePlan({ streets: STREETS, terrainHeightAt, mobile: false });
  assert.ok(pieces.length > STREETS.length, 'desktop plan should subdivide long roads');
  assert.deepEqual(
    new Set(pieces.map((piece) => piece.roadId)),
    new Set(STREETS.map((road) => road.id)),
    'every source road should survive planning',
  );

  for (const piece of pieces) {
    assert.ok(piece.width > 0, 'road width should remain positive');
    assert.ok(
      planarLength(piece) <= ROME_ROAD_RENDER_POLICY.desktopPieceLength + 1e-9,
      'desktop road pieces should respect the terrain-following subdivision length',
    );
    assert.ok(
      Math.abs(piece.y0 - (terrainHeightAt(piece.x0, piece.z0) + ROME_ROAD_RENDER_POLICY.bedLift)) < 1e-9,
      'road start should be derived from terrain support plus the small visual lift',
    );
    assert.ok(
      Math.abs(piece.y1 - (terrainHeightAt(piece.x1, piece.z1) + ROME_ROAD_RENDER_POLICY.bedLift)) < 1e-9,
      'road end should be derived from terrain support plus the small visual lift',
    );
  }
});

test('mobile road plan reduces subdivisions without changing the source roads', () => {
  const desktop = createRoadPiecePlan({ streets: STREETS, terrainHeightAt, mobile: false });
  const mobile = createRoadPiecePlan({ streets: STREETS, terrainHeightAt, mobile: true });
  assert.ok(mobile.length < desktop.length, 'mobile should use fewer road instances than desktop');
  assert.ok(
    mobile.every((piece) => planarLength(piece) <= ROME_ROAD_RENDER_POLICY.mobilePieceLength + 1e-9),
    'mobile road pieces should respect the mobile subdivision ceiling',
  );
  assert.deepEqual(
    new Set(mobile.map((piece) => piece.roadId)),
    new Set(STREETS.map((road) => road.id)),
    'mobile planning must not drop roads',
  );
});

test('V8 renders roads as two instanced layers instead of per-piece meshes', () => {
  assert.match(roadBuilderSource, /new THREE\.InstancedMesh\(geometry, bedMaterial, pieces\.length\)/);
  assert.match(roadBuilderSource, /new THREE\.InstancedMesh\(geometry, edgeMaterial, pieces\.length \* 2\)/);
  assert.match(roadBuilderSource, /scene\.add\(beds, edges\)/);
  assert.doesNotMatch(roadBuilderSource, /new THREE\.Mesh\(geometry, material\)/);
  assert.match(mainSource, /addInstancedRoads\(THREE, scene, simulation, \{ mobile \}\)/);
  assert.doesNotMatch(mainSource, /function roadSegment\(/);
});

test('browser smoke locks the two-layer road benchmark contract', () => {
  assert.match(smokeSource, /Terrain-following Roman road beds/);
  assert.match(smokeSource, /baseline\.roads\?\.drawLayers, 2/);
  assert.match(smokeSource, /baseline\.roads\?\.edgeInstances, baseline\.roads\?\.pieces \* 2/);
});
