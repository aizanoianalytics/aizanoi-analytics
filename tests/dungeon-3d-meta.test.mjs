import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, chooseArena, spawnWave } from '../frontend/js/v3/apps/dungeon/src/game/index.js';
import { META_KEY, createMeta, loadMeta, marksForRun, recordRun, saveMeta, unlock } from '../frontend/js/v3/apps/dungeon/src/game/meta.js';

const storage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('five arenas are deterministic and wave state records the selected arena', () => {
  const a = createGameState('arena-seed');
  const b = createGameState('arena-seed');
  const first = chooseArena(a, 1);
  const second = chooseArena(b, 1);
  assert.deepEqual(first, second);
  spawnWave(a, 2);
  assert.ok(['column-ring', 'broken-bridge', 'brazier-court', 'collapsing-tiles', 'ruined-stairs'].includes(a.arena));
  assert.ok(a.events.some((event) => event.type === 'arena'));
});

test('marks follow the run formula', () => {
  assert.equal(marksForRun({ chapters: 10, bosses: 2, heat: 3, gold: 80 }), 132);
  assert.equal(marksForRun({}), 0);
});

test('meta is local, bounded to twenty runs, and unlocks sideways options', () => {
  assert.equal(META_KEY, 'aizanoi.dungeon.meta.v1');
  const store = storage();
  let meta = createMeta();
  for (let i = 0; i < 25; i += 1) meta = recordRun(meta, { chapters: i, bosses: 0, heat: 0, gold: 0, won: false, seed: `s${i}` });
  assert.equal(meta.history.length, 20);
  assert.ok(meta.marks > 0);
  assert.equal(saveMeta(store, meta).saved, true);
  assert.equal(loadMeta(store).history.length, 20);
  const insufficient = unlock(meta, 'oaths', 'spear', meta.marks + 1);
  assert.equal(insufficient.unlocked, false);
  const bought = unlock(meta, 'oaths', 'spear', 1);
  assert.equal(bought.unlocked, true);
  assert.ok(bought.meta.oaths.includes('spear'));
});
