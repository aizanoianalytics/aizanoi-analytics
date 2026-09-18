import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync('gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json', 'utf8'));
const builder = readFileSync('scripts/fly-world/build_scene_v2.py', 'utf8');
const detail = readFileSync('scripts/fly-world/detail_pass_v3.py', 'utf8');
const runtime = readFileSync('frontend/labs/fly-world/glb-runtime-v3.js', 'utf8');

test('Fly House keeps a larger shell while furniture stays inside coherent zones', () => {
  const main = spec.rooms.find((room) => room.id === 'main-room');
  const bedroom = spec.rooms.find((room) => room.id === 'bedroom');
  assert.deepEqual(main.size, [9.6, 8.0, 2.85]);
  assert.deepEqual(bedroom.size, [5.0, 6.2, 2.85]);
  assert.ok(spec.zones.some((zone) => zone.id === 'circulation-zone'));
  assert.match(builder, /Main room 9\.6 x 8\.0/);
  assert.match(builder, /Bedroom 5\.0 x 6\.2/);
});

test('Fly House furniture zones use deliberate transforms and preserve clear circulation', () => {
  const hero = Object.fromEntries(spec.heroObjects.map((item) => [item.id, item]));
  assert.deepEqual(hero.bench.position, [-0.65, 2.72, 0.42]);
  assert.deepEqual(hero['wood-stove'].position, [2.15, -1.1, 0.59]);
  assert.deepEqual(hero['old-tv-cabinet'].position, [-3.2, -3.4, 0.7]);
  assert.deepEqual(hero.bed.position, [6.72, 1.92, 0.46]);
  assert.deepEqual(hero['work-desk'].position, [5.525, 3.05, 0.38]);
  const circulation = spec.zones.find((zone) => zone.id === 'circulation-zone');
  assert.deepEqual(circulation.bounds, [[-2.7, -3.35, 0.0], [3.8, 2.10, 2.0]]);
  const rect = (item) => ({ x0: item.position[0] - item.size[0] / 2, x1: item.position[0] + item.size[0] / 2, y0: item.position[1] - item.size[1] / 2, y1: item.position[1] + item.size[1] / 2 });
  const stove = rect(hero['wood-stove']);
  const desk = rect(hero['work-desk']);
  assert.ok(stove.x1 < 3.1, 'stove leaves the east doorway approach open');
  assert.ok(stove.y1 < 0.34, 'stove sits south of the bedroom doorway opening');
  assert.ok(desk.y0 > 1.66, 'desk stays north of the bedroom doorway opening');
  assert.ok(rect(hero.bench).y0 > 2.10, 'sofa remains outside the central circulation lane');
  assert.ok(!/WALL__bed__west_(?:a|b|head)"/.test(builder), 'shared divider has one geometry owner; only the exterior return is separate');
  assert.ok(builder.includes('import_slot(root,slots,"bench-sofa",(-.65,2.72'));
  assert.ok(builder.includes('import_slot(root,slots,"wood-stove",(2.15,-1.10'));
  assert.ok(builder.includes('import_slot(root,slots,"old-tv",(-3.20,-3.40'));
  assert.match(builder, /Shared room divider is owned by the main room/);
  assert.match(detail, /work-desk/);
});
test('expanded room boundaries preserve the east doorway and its collision path', () => {
  assert.match(builder, /wall_y\(c,m,-4\.0,-4\.8,4\.8/);
  assert.match(builder, /wall_y\(c,m,4\.0,-4\.8,4\.8/);
  assert.match(builder, /wall_y\(c,m,-1\.95,4\.8,9\.8/);
  assert.match(builder, /wall_y\(c,m,4\.25,4\.8,4\.92/);
  assert.match(builder, /wall_y\(c,m,4\.25,6\.30,9\.8/);
});

test('numeric support contract keeps cabinet-top dressing on a real shelf and floor details grounded', () => {
  const supports = Object.fromEntries(spec.supportSurfaces.map((surface) => [surface.id, surface]));
  const shelf = supports['cabinet-top-support-shelf'].bounds;
  const floor = supports['floor-main'].bounds;
  assert.equal(shelf[0][2], shelf[1][2]);
  assert.ok(shelf[0][2] > 0, 'cabinet still life has a raised support surface');
  assert.equal(floor[0][2], 0, 'floor support is the ground plane');
  assert.ok(shelf[0][0] < -2.1 && shelf[1][0] > 0.4, 'shelf spans the imported cabinet dressing');
  assert.match(detail, /cabinet-top-support-shelf/);
});

test('numeric doorway clearance leaves a traversable opening for the observer radius', () => {
  const doorway = spec.rooms.find((room) => room.id === 'main-room').openings.find((opening) => opening.id === 'bedroom-doorway');
  const [centerX, centerY] = doorway.center;
  const width = doorway.size[1];
  const radius = 0.21;
  const stove = Object.fromEntries(spec.heroObjects.map((item) => [item.id, item]))['wood-stove'];
  const stoveEast = stove.position[0] + stove.size[0] / 2;
  assert.ok(width - 2 * radius > 0.8, 'door opening leaves usable observer clearance');
  assert.ok(stoveEast < centerX - radius, 'stove does not intrude into the doorway approach');
  assert.ok(centerY - width / 2 >= 0.34 - 1e-9 && centerY + width / 2 <= 1.66 + 1e-9, 'spec opening matches wall gap');
});

test('runtime framing API owns the Z-up camera pose for doorway QA', () => {
  assert.match(runtime, /frameCamera\(x, y, z, yaw, pitch = -\.04\)/);
  assert.match(runtime, /metrics\.frameCamera = \(x, y, z, yaw, pitch = -\.04\) => observer\.frameCamera/);
});

test('public browser diagnostics expose exact Stage A names while retaining aliases', () => {
  assert.match(runtime, /window\.FLY_ENVIRONMENT = environment/);
  assert.match(runtime, /window\.FLY_DEBUG = metrics/);
  assert.match(runtime, /window\.__FLY_ENVIRONMENT__ = environment/);
  assert.match(runtime, /window\.__FLY_DEBUG__ = metrics/);
  assert.match(runtime, /mode: 'glb'/);
});

test('doorway review camera is wide enough to show the transition, not a bed close-up', () => {
  const camera = spec.previewCameras.find((view) => view.id === '04-doorway-bedroom');
  assert.ok(camera.focalLengthMm <= 42);
  assert.ok(camera.position[0] < 4.8 && camera.position[1] >= 0.34 && camera.position[1] <= 1.66, 'camera is inside the doorway approach');
  assert.ok(camera.lookAt[0] > 5.5, 'camera targets the connected bedroom');
});
