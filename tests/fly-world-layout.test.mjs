import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync('gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json', 'utf8'));
const builder = readFileSync('scripts/fly-world/build_scene_v2.py', 'utf8');
const detail = readFileSync('scripts/fly-world/detail_pass_v3.py', 'utf8');

test('Fly House keeps a larger shell while furniture stays inside coherent zones', () => {
  const main = spec.rooms.find((room) => room.id === 'main-room');
  const bedroom = spec.rooms.find((room) => room.id === 'bedroom');
  assert.deepEqual(main.size, [8.4, 7.0, 2.85]);
  assert.deepEqual(bedroom.size, [4.2, 5.4, 2.85]);
  assert.ok(spec.zones.some((zone) => zone.id === 'circulation-zone'));
  assert.match(builder, /Main room 8\.4 x 7\.0/);
  assert.match(builder, /Bedroom 4\.2 x 5\.4/);
});

test('Fly House furniture zones use deliberate transforms and preserve clear circulation', () => {
  const hero = Object.fromEntries(spec.heroObjects.map((item) => [item.id, item]));
  assert.deepEqual(hero.bench.position, [-0.65, 2.72, 0.42]);
  assert.deepEqual(hero['wood-stove'].position, [2.25, 0.35, 0.59]);
  assert.deepEqual(hero['old-tv-cabinet'].position, [-3.36, -2.62, 0.70]);
  assert.deepEqual(hero.bed.position, [6.72, 1.92, 0.46]);
  assert.deepEqual(hero['work-desk'].position, [5.05, 3.05, 0.38]);
  const circulation = spec.zones.find((zone) => zone.id === 'circulation-zone');
  assert.deepEqual(circulation.bounds, [[-2.7, -3.35, 0.0], [3.8, 2.10, 2.0]]);
  const rect = (item) => ({ x0: item.position[0] - item.size[0] / 2, x1: item.position[0] + item.size[0] / 2, y0: item.position[1] - item.size[1] / 2, y1: item.position[1] + item.size[1] / 2 });
  const stove = rect(hero['wood-stove']);
  const desk = rect(hero['work-desk']);
  assert.ok(stove.x1 < 3.1, 'stove leaves the east doorway approach open');
  assert.ok(desk.y0 > 1.66, 'desk stays north of the bedroom doorway opening');
  assert.ok(rect(hero.bench).y0 > 2.10, 'sofa remains outside the central circulation lane');
  assert.ok(!builder.includes('WALL__bed__west_'), 'shared divider has one geometry owner');
  assert.match(builder, /import_slot\(root,slots,"bench-sofa",\(-\.65,2\.72/);
  assert.match(builder, /import_slot\(root,slots,"wood-stove",\(2\.25,\.35/);
  assert.match(builder, /import_slot\(root,slots,"old-tv",\(-3\.35,-2\.62/);
  assert.match(builder, /Shared room divider is owned by the main room/);
  assert.match(detail, /work-desk/);
});
test('expanded room boundaries preserve the east doorway and its collision path', () => {
  assert.match(builder, /wall_y\(c,m,-3\.5,-4\.2,4\.2/);
  assert.match(builder, /wall_y\(c,m,3\.5,-4\.2,4\.2/);
  assert.match(builder, /wall_y\(c,m,-1\.55,4\.2,8\.4/);
  assert.match(builder, /wall_y\(c,m,3\.85,4\.2,4\.92/);
  assert.match(builder, /wall_y\(c,m,3\.85,6\.30,8\.4/);
});
