import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync('gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json', 'utf8'));
const builder = readFileSync('scripts/fly-world/build_scene_v2.py', 'utf8');

test('Fly House keeps a larger shell while furniture stays inside coherent zones', () => {
  const main = spec.rooms.find((room) => room.id === 'main-room');
  const bedroom = spec.rooms.find((room) => room.id === 'bedroom');
  assert.deepEqual(main.size, [8.4, 7.0, 2.85]);
  assert.deepEqual(bedroom.size, [4.2, 5.4, 2.85]);
  assert.ok(spec.zones.some((zone) => zone.id === 'circulation-zone'));
  assert.match(builder, /Main room 8\.4 x 7\.0/);
  assert.match(builder, /Bedroom 4\.2 x 5\.4/);
});

test('expanded room boundaries preserve the east doorway and its collision path', () => {
  assert.match(builder, /wall_y\(c,m,-3\.5,-4\.2,4\.2/);
  assert.match(builder, /wall_y\(c,m,3\.5,-4\.2,4\.2/);
  assert.match(builder, /wall_y\(c,m,-1\.55,4\.2,8\.4/);
  assert.match(builder, /wall_y\(c,m,3\.85,4\.2,4\.92/);
  assert.match(builder, /wall_y\(c,m,3\.85,6\.30,8\.4/);
});
