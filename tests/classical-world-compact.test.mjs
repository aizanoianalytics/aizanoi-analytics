import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { BUILDINGS as ATHENS, BOUNDS as ATHENS_BOUNDS, COMPACTION } from '../frontend/worlds/athens-450-430/js/city-data.js';
import { KIT_MANIFEST as ATHENS_KIT } from '../frontend/worlds/athens-450-430/js/builders.js';
import { BUILDINGS as ROME, BOUNDS as ROME_BOUNDS, COMPACTION as ROME_COMPACTION, WATERS as ROME_WATERS } from '../frontend/worlds/rome-410-476/js/city-data.js';
import { KIT_MANIFEST as ROME_KIT } from '../frontend/worlds/rome-410-476/js/builders.js';

test('classical maps publish compact authored layout contracts', () => {
  assert.ok(COMPACTION.factor <= 0.8 && COMPACTION.factor >= 0.7);
  assert.ok(ATHENS_BOUNDS.maxX - ATHENS_BOUNDS.minX < 1200, 'Athens horizontal plan should be compact');
  assert.ok(ROME_COMPACTION.factor <= 0.85 && ROME_COMPACTION.factor >= 0.8);
  assert.ok(ROME_BOUNDS.maxX - ROME_BOUNDS.minX < 605, 'Rome is compacted again');
  assert.ok(ROME_WATERS[0].points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z)));
  assert.ok(ROME_WATERS[0].points.some((point) => Math.abs(point.z + 285.6) < 1e-6));
  for (const [records, ids] of [[ATHENS, ['parthenon', 'propylaea', 'theatre-dionysus']], [ROME, ['colosseum', 'pantheon']]]) {
    for (const id of ids) assert.ok(records.some((record) => record.id === id), `${id} identity must survive`);
  }
});

test('classical hero kits are world-local and wired through manifests', () => {
  assert.deepEqual(ATHENS_KIT.map((entry) => entry.file), ['parthenon_hero.glb', 'propylaea_hero.glb', 'dionysus_theatre_hero.glb']);
  assert.ok(ROME_KIT.some((entry) => entry.id === 'colosseum'));
  for (const file of [...ATHENS_KIT, ...ROME_KIT]) {
    const world = ATHENS_KIT.includes(file) ? 'athens-450-430' : 'rome-410-476';
    const path = `frontend/worlds/${world}/assets/${file.file}`;
    assert.ok(existsSync(path), `${path} missing`);
    assert.ok(statSync(path).size > 0, `${path} empty`);
  }
});
