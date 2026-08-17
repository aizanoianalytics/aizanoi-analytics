import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STREETS } from '../frontend/ancient-cities/rome-410-476/data/city.js';
import { terrainHeightAt, terrainNormalAt } from '../frontend/ancient-cities/rome-410-476/data/terrain.js';
import { ANCIENT_MATERIALS } from '../frontend/ancient-world/assets/materials.js';
import {
  compensatedRoadRgb,
  createRoadPiecePlan,
  createRoadTangentFrame,
  roadPlaneHeightAt,
  ROME_ROAD_RENDER_POLICY,
  ROME_ROAD_VISUAL_RESPONSE,
} from '../experiments/threejs-rome-renderer/src/road-builder.js';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const roadBuilderSource = read('experiments/threejs-rome-renderer/src/road-builder.js');
const adapterSource = read('experiments/threejs-rome-renderer/src/rome-adapter.js');
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
  assert.deepEqual(new Set(pieces.map((piece) => piece.roadId)), new Set(STREETS.map((road) => road.id)));
  assert.ok(pieces.every((piece) => planarLength(piece) <= ROME_ROAD_RENDER_POLICY.desktopPieceLength + 1e-9));
});

test('mobile road plan keeps every source road with the mobile subdivision ceiling', () => {
  assert.equal(ROME_ROAD_RENDER_POLICY.mobilePieceLength, 20);
  const desktop = createRoadPiecePlan({ streets: STREETS, terrainHeightAt, mobile: false });
  const mobile = createRoadPiecePlan({ streets: STREETS, terrainHeightAt, mobile: true });
  assert.ok(mobile.length < desktop.length);
  assert.ok(mobile.every((piece) => planarLength(piece) <= ROME_ROAD_RENDER_POLICY.mobilePieceLength + 1e-9));
  assert.deepEqual(new Set(mobile.map((piece) => piece.roadId)), new Set(STREETS.map((road) => road.id)));
});

test('V8.4 tangent frame keeps the Via Sacra camera road surface near local terrain support', () => {
  const viaSacra = STREETS.filter((road) => road.id === 'via-sacra');
  const pieces = createRoadPiecePlan({ streets: viaSacra, terrainHeightAt, mobile: false });
  const piece = pieces.find((item) => Math.min(item.x0, item.x1) <= -270 && Math.max(item.x0, item.x1) >= -270);
  assert.ok(piece, 'Via Sacra should contain a planned piece around the matched camera');
  const frame = createRoadTangentFrame(piece, { terrainHeightAt, terrainNormalAt });
  const roadY = roadPlaneHeightAt(frame, -270, -52);
  const groundY = terrainHeightAt(-270, -52);
  assert.ok(roadY > groundY, 'road surface should remain above terrain at the matched camera');
  assert.ok(roadY - groundY < 0.09, `road/terrain separation should stay subtle, got ${(roadY - groundY).toFixed(3)}m`);
  assert.ok(Math.abs(Math.hypot(...frame.normal) - 1) < 1e-9);
});

test('V8.4 exposes shared terrain normals through the Rome renderer adapter', () => {
  assert.match(adapterSource, /terrainHeightAt, terrainNormalAt/);
  assert.match(adapterSource, /terrainNormalAt,/);
  assert.match(roadBuilderSource, /createRoadTangentFrame/);
  assert.match(roadBuilderSource, /simulation\.terrainNormalAt/);
});

test('V8.4 keeps two instanced flat-quad road layers', () => {
  assert.match(roadBuilderSource, /new THREE\.PlaneGeometry\(1, 1\)/);
  assert.doesNotMatch(roadBuilderSource, /new THREE\.BoxGeometry/);
  assert.match(roadBuilderSource, /new THREE\.InstancedMesh\(geometry, bedMaterial, pieces\.length\)/);
  assert.match(roadBuilderSource, /new THREE\.InstancedMesh\(geometry, edgeMaterial, pieces\.length \* 2\)/);
  assert.match(roadBuilderSource, /scene\.add\(beds, edges\)/);
  assert.match(mainSource, /addInstancedRoads\(THREE, scene, simulation, \{ mobile \}\)/);
});

test('V8.4 keeps shared road tokens untouched and refines Three visual response', () => {
  assert.deepEqual(ANCIENT_MATERIALS.road, [0.34, 0.31, 0.25]);
  assert.deepEqual(ANCIENT_MATERIALS.roadEdge, [0.23, 0.21, 0.18]);
  assert.deepEqual(ROME_ROAD_VISUAL_RESPONSE, { red: 0.72, green: 0.93, blue: 1.44 });
  const bed = compensatedRoadRgb(ANCIENT_MATERIALS.road);
  const edge = compensatedRoadRgb(ANCIENT_MATERIALS.roadEdge);
  assert.ok(Math.abs(bed[0] - 0.2448) < 1e-9);
  assert.ok(Math.abs(bed[1] - 0.2883) < 1e-9);
  assert.ok(Math.abs(bed[2] - 0.36) < 1e-9);
  assert.ok(Math.abs(edge[0] - 0.1656) < 1e-9);
  assert.ok(Math.abs(edge[1] - 0.1953) < 1e-9);
  assert.ok(Math.abs(edge[2] - 0.2592) < 1e-9);
  assert.match(roadBuilderSource, /THREE\.SRGBColorSpace/);
});

test('browser smoke locks the two-layer road benchmark contract', () => {
  assert.match(smokeSource, /Terrain-following Roman road beds/);
  assert.match(smokeSource, /baseline\.roads\?\.drawLayers, 2/);
  assert.match(smokeSource, /baseline\.roads\?\.edgeInstances, baseline\.roads\?\.pieces \* 2/);
});

test('matched visual capture includes hero and Via Sacra with Three-specific yaw convention', () => {
  assert.match(captureSource, /id: 'colosseum'/);
  assert.match(captureSource, /id: 'via-sacra'/);
  assert.match(captureSource, /#ancient-world-back-to-os/);
  assert.match(captureSource, /player\.yaw = Math\.atan2\(-dx, -dz\)/);
});
