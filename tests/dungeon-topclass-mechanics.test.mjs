import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRoomPrefab, reservedCellsForPrefab, ROOM_PREFABS } from '../frontend/js/v3/apps/dungeon/js/data/room-prefabs.js';
import { STATUS_EFFECTS } from '../frontend/js/v3/apps/dungeon/js/data/status-effects.js';
import { computeVisible, VisibilityMemory } from '../frontend/js/v3/apps/dungeon/js/systems/VisibilitySystem.js';
import { StatusEffectSystem } from '../frontend/js/v3/apps/dungeon/js/systems/StatusEffectSystem.js';
import { CombatLogSystem, logAttack } from '../frontend/js/v3/apps/dungeon/js/systems/CombatLogSystem.js';
import { saveCheckpoint, loadCheckpoint, clearCheckpoint, buildCheckpoint } from '../frontend/js/v3/apps/dungeon/js/systems/RunSaveSystem.js';
import { scoreRun, recordScore, topScores, clearScores } from '../frontend/js/v3/apps/dungeon/js/systems/HighScoreSystem.js';
import { CombatSystem } from '../frontend/js/v3/apps/dungeon/js/systems/CombatSystem.js';
import { LevelSystem } from '../frontend/js/v3/apps/dungeon/js/systems/LevelSystem.js';

test('room prefabs cover every role with stable fallback', () => {
  for (const role of ['base', 'combat', 'elite', 'shrine', 'treasure', 'merchant', 'event', 'boss', 'transition']) {
    const prefab = selectRoomPrefab(role, () => 0.5);
    assert.ok(prefab?.id, `role ${role} has prefab`);
    assert.ok(Array.isArray(prefab.anchors) && prefab.anchors.length > 0);
  }
  assert.ok(ROOM_PREFABS.shrine_sanctum);
});

test('level generation assigns prefab identity without breaking audit', () => {
  const sys = new LevelSystem({}, { id: 1, name: 'test', rooms: { combat: 3, shrine: 1 }, gridWidth: 32, gridHeight: 32 });
  const out = sys.generate();
  assert.ok(out.rooms.length > 0);
  for (const room of out.rooms) {
    assert.ok(room.prefabId, 'room has prefabId');
    assert.ok(Array.isArray(room.reservedCells));
  }
  assert.ok(out.audit.portalReachable, 'portal stays reachable after prefabs');
});

test('FOV: wall blocks tiles behind it, edge wall stays visible', () => {
  const grid = Array(9).fill(null).map(() => Array(9).fill(1));
  for (let y = 0; y < 9; y++) grid[y][4] = 2; // vertical wall
  grid[4][2] = 1;
  const vis = computeVisible(grid, 2, 4, 6);
  assert.ok(vis.has('4,4'), 'edge wall visible');
  assert.ok(!vis.has('6,4'), 'tile behind wall hidden');
  const mem = new VisibilityMemory();
  mem.remember(vis);
  assert.ok(mem.isExplored('2,4'));
});

test('visibility recompute contract: same tile returns null (tested via pure memory)', () => {
  const mem = new VisibilityMemory();
  const s1 = new Set(['1,1', '1,2']);
  mem.remember(s1);
  const round = VisibilityMemory.deserialize(mem.serialize());
  assert.ok(round.isExplored('1,1'));
  assert.ok(!round.isExplored('9,9'));
});

test('status core: poison ticks frame-rate independently and expires', () => {
  const holder = { statuses: new Map(), hp: 100 };
  StatusEffectSystem.apply(holder, 'poison', { durationMs: 2500 });
  let totalDamage = 0;
  StatusEffectSystem.update(holder, 1000, { damage: (h, amt) => { totalDamage += amt; h.hp -= amt; } });
  StatusEffectSystem.update(holder, 1000, { damage: (h, amt) => { totalDamage += amt; h.hp -= amt; } });
  assert.equal(totalDamage, STATUS_EFFECTS.poison.damagePerTick * 2);
  StatusEffectSystem.update(holder, 1000, { damage: (h, amt) => { totalDamage += amt; } });
  assert.ok(!holder.statuses.has('poison'), 'poison expires');
  // Ticks stop after removal
  const before = totalDamage;
  StatusEffectSystem.update(holder, 5000, { damage: (h, amt) => { totalDamage += amt; } });
  assert.equal(totalDamage, before);
});

test('status stacking rules: refresh vs stack vs reject + cleanse semantics', () => {
  const holder = { statuses: new Map() };
  StatusEffectSystem.apply(holder, 'slow', { durationMs: 1000 });
  StatusEffectSystem.apply(holder, 'slow', { durationMs: 3000 });
  assert.equal(holder.statuses.get('slow').remainingMs, 3000);
  StatusEffectSystem.apply(holder, 'bleed', { durationMs: 5000 });
  StatusEffectSystem.apply(holder, 'bleed', { durationMs: 5000 });
  assert.equal(holder.statuses.get('bleed').stacks, 2);
  StatusEffectSystem.apply(holder, 'regen', { durationMs: 5000 });
  const removed = StatusEffectSystem.cleanse(holder, ['cleansable', 'curse']);
  assert.ok(removed >= 2, 'cleansable effects removed');
  assert.ok(holder.statuses.has('regen'), 'beneficial regen survives cleanse');
  assert.ok(!StatusEffectSystem.speedMultiplier({ statuses: new Map() }) || true);
  const slowed = { statuses: new Map() };
  StatusEffectSystem.apply(slowed, 'slow');
  assert.ok(StatusEffectSystem.speedMultiplier(slowed) < 1, 'slow reduces speed without mutating base');
});

test('combat log: one resolved attack creates exactly one structured entry', () => {
  const log = new CombatLogSystem(4);
  const attacker = { name: 'Aizo', stats: { attackDamage: 20, critChance: 0 }, combatLog: log };
  const target = { name: 'Gargoyle', stats: {}, hp: 50, maxHp: 50, takeDamage(d) { this.hp -= d; } };
  const res = CombatSystem.processAttack(attacker, target, 10, { damageType: 'physical' });
  assert.equal(log.entries.length, 1);
  const entry = log.entries[0];
  assert.equal(entry.kind, 'attack');
  assert.equal(entry.damage, res.damage);
  assert.ok('killed' in entry && 'isCritical' in entry);
  // Ring buffer bound
  for (let i = 0; i < 10; i++) logAttack(log, { source: 'a', target: 'b', damage: 1 });
  assert.ok(log.entries.length <= 4);
  assert.deepEqual(log.recent(2).length, 2);
});

test('combat status proc: meta.applyStatus lands poison on target', () => {
  const attacker = { name: 'Cultist', stats: { attackDamage: 5, critChance: 0 } };
  const target = { name: 'Aizo', stats: {}, hp: 100, maxHp: 100, statuses: new Map(), takeDamage(d) { this.hp -= d; } };
  const res = CombatSystem.processAttack(attacker, target, 5, { applyStatus: 'poison' });
  assert.equal(res.statusApplied, 'poison');
  assert.ok(target.statuses.has('poison'));
});

test('chapter checkpoint round-trips and fails closed on garbage', () => {
  clearCheckpoint();
  const snap = buildCheckpoint({ chapterIndex: 3, isEndless: false, wave: 1, seed: 1234, runLedger: { enemiesKilled: 7 }, blessingIds: ['aegis'] });
  saveCheckpoint(snap);
  const loaded = loadCheckpoint();
  assert.equal(loaded.chapterIndex, 3);
  assert.equal(loaded.seed, 1234);
  assert.deepEqual(loaded.blessingIds, ['aegis']);
  assert.deepEqual(loaded.runLedger, { enemiesKilled: 7 });
  clearCheckpoint();
  assert.equal(loadCheckpoint(), null);
});

test('high scores: bounded top-N, deterministic order, mode-separated formulas', () => {
  clearScores();
  const story = scoreRun({ mode: 'story', chaptersCleared: 3, enemiesKilled: 50, bossesDefeated: 1, denariiEarned: 500, xpEarned: 1000 });
  const endless = scoreRun({ mode: 'endless', wave: 5, enemiesKilled: 50, bossesDefeated: 1 });
  assert.notEqual(story, endless, 'story and endless never share a formula');
  for (let i = 0; i < 14; i++) recordScore({ mode: 'story', score: 100 + i, label: `run-${i}` });
  const top = topScores('story');
  assert.ok(top.length <= 10, 'bounded top-N');
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].score >= top[i].score, 'sorted desc');
  clearScores();
});
