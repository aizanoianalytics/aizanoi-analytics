import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STREETS } from '../frontend/ancient-cities/rome-410-476/data/city.js';
import { terrainHeightAt } from '../frontend/ancient-cities/rome-410-476/data/terrain.js';
import { ANCIENT_MATERIALS } from '../frontend/ancient-world/assets/materials.js';
import {
  compensatedRoadRgb,
  createRoadPiecePlan,
  ROME_ROAD_RENDER_POLICY,
  ROME_ROAD_VISUAL_RESPONSE,
} from '../experiments/threejs-rome-renderer/src/road-builder.js';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const roadBuilderSource = read('experiments/threejs-rome-renderer/src/road-builder.js');
const mainSource = read('experiments/threejs-rome-renderer/src/main.js');
const smokeSource = read('experiments/threejs-rome-renderer/scripts/browser-smoke.mjs');
const captureSource = read('experiments/threejs-rome-renderer/scripts/capture-ab-baseline.mjs');

function planarLength(piece) {
  return Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0);
}

test('desktop Rome road plan follows terrain and preserves every named road', () => {
  assert.equal(ROME_ROAD_RENDER_POLICY.desktopPieceLength, 14);
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

test('mobile road plan uses a tighter but cheaper terrain-following ceiling', () => {
  assert.equal(ROME_ROAD_RENDER_POLICY.mobilePieceLength, 20);
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

test('V8.3 keeps two instanced flat-quad road layers with narrow edge bands', () => {
  assert.equal(ROME_ROAD_RENDER_POLICY.edgeBandWidth, 0.16);
  assert.equal(ROME_ROAD_RENDER_POLICY.edgeInset, 0.11);
  assert.match(roadBuilderSource, /new THREE\.PlaneGeometry\(1, 1\)/);
  assert.match(roadBuilderSource, /geometry\.rotateX\(-Math\.PI \/ 2\)/);
  assert.doesNotMatch(roadBuilderSource, /new THREE\.BoxGeometry/);
  assert.match(roadBuilderSource, /new THREE\.InstancedMesh\(geometry, bedMaterial, pieces\.length\)/);
  assert.match(roadBuilderSource, /new THREE\.InstancedMesh\(geometry, edgeMaterial, pieces\.length \* 2\)/);
  assert.match(roadBuilderSource, /scene\.add\(beds, edges\)/);
  assert.match(mainSource, /addInstancedRoads\(THREE, scene, simulation, \{ mobile \}\)/);
});

test('V8.3 keeps shared road tokens untouched and compensates only Three visual response', () => {
  assert.deepEqual(ANCIENT_MATERIALS.road, [0.34, 0.32, 0.28]);
  assert.deepEqual(ANCIENT_MATERIALS.roadEdge, [0.42, 0.39, 0.32]);
  assert.deepEqual(ROME_ROAD_VISUAL_RESPONSE, { red: 0.73, green: 0.93, blue: 1.66 });
  const bed = compensatedRoadRgb(ANCIENT_MATERIALS.road);
  const edge = compensatedRoadRgb(ANCIENT_MATERIALS.roadEdge);
  assert.ok(Math.abs(bed[0] - 0.2482) < 1e-9);
  assert.ok(Math.abs(bed[1] - 0.2976) < 1e-9);
  assert.ok(Math.abs(bed[2] - 0.4648) < 1e-9);
  assert.ok(edge.every((value) => value >= 0 && value <= 1));
  assert.match(roadBuilderSource, /THREE\.SRGBColorSpace/);
  assert.match(roadBuilderSource, /compensatedRoadRgb\(rgb\)/);
});

test('browser smoke locks the two-layer road benchmark contract', () => {
  assert.match(smokeSource, /Terrain-following Roman road beds/);
  assert.match(smokeSource, /baseline\.roads\?\.drawLayers, 2/);
  assert.match(smokeSource, /baseline\.roads\?\.edgeInstances, baseline\.roads\?\.pieces \* 2/);
});

test('matched visual capture includes hero and Via Sacra with Three-specific yaw convention', () => {
  assert.match(captureSource, /id: 'colosseum'/);
  assert.match(captureSource, /id: 'via-sacra'/);
  assert.match(captureSource, /label: 'Via Sacra streetscape baseline'/);
  assert.match(captureSource, /#ancient-world-back-to-os/);
  assert.match(captureSource, /const dx = target\.lookX - target\.x/);
  assert.match(captureSource, /const dz = target\.lookZ - target\.z/);
  assert.match(captureSource, /player\.yaw = Math\.atan2\(-dx, -dz\)/);
});
