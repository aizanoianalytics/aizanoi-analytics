// Section 19: "Keep BSP as a useful foundation, but do not allow all 10 chapters
// to feel like differently sized random rectangles." Also the guarantee list:
// connectivity, no inaccessible portal, no wall spawn, no impossible encounter,
// no soft lock — and deterministic or seedable generation for QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const levelSystem = read('frontend/js/v3/apps/dungeon/js/systems/LevelSystem.js');
const levels = read('frontend/js/v3/apps/dungeon/js/data/levels.js');
const gameScene = read('frontend/js/v3/apps/dungeon/js/scenes/GameScene.js');

test('generation is seeded and reproducible, not Math.random', () => {
  // "Use deterministic or seedable generation for QA." A dungeon that reshuffles
  // per load cannot be QA'd, and a bug report cannot be reproduced.
  assert.match(levelSystem, /function mulberry32\(seed\)/, 'a seeded PRNG must exist');
  assert.match(levelSystem, /export function hashSeed\(str\)/, 'the seed must be derived stably');
  assert.match(levelSystem, /this\.seed = Number\.isFinite\(levelConfig\.seed\)/,
    'a caller must be able to supply a seed');
  assert.doesNotMatch(levelSystem, /Math\.random\(\)/,
    'the generator must not use Math.random; QA cannot pin a layout otherwise');
  // Every random draw in the generator must go through the seeded PRNG.
  assert.match(levelSystem, /this\.random\(\)/, 'draws must come from the seeded generator');
});

test('every chapter declares its own identity', () => {
  // The ten chapter names are fixed by the brief. Each one must state a room
  // mix and a palette, or it is a differently sized random rectangle.
  const NAMED = [
    'Pronaos Crypts', 'Penkalas Aqueducts', 'Macellum Trade Vaults', 'Theatre Catacombs',
    'Necropolis Labyrinth', 'Sanctuary of Cybele', 'Colonnaded Street', 'Temple Archives',
    'Subterranean Adyton', 'Throne of Storms'
  ];
  for (const name of NAMED) {
    assert.ok(levels.includes(name), `the brief's chapter "${name}" must still exist`);
  }
  const blocks = levels.split(/\n  \{\n/).slice(1);
  const named = blocks.filter((b) => NAMED.some((n) => b.includes(n)));
  assert.equal(named.length, 10, `expected all 10 chapters, found ${named.length}`);
  for (const b of named) {
    assert.match(b, /\n    rooms: \{/, 'every chapter must declare a room mix');
    assert.match(b, /\n    palette: \{/, 'every chapter must declare a palette');
  }
  // The chapter palettes must actually differ, or the districts read as one place.
  const palettes = named.map((b) => /palette: \{[^}]*name: '([\w-]+)'/.exec(b)?.[1]);
  assert.equal(new Set(palettes).size, 10, `chapter palettes must be distinct, got ${palettes.join(', ')}`);
});

test('rooms are given roles, and the roles come from the chapter mix', () => {
  assert.match(levelSystem, /export const ROOM_ROLES/, 'roles must be declared as a closed set');
  for (const role of ['combat', 'elite', 'shrine', 'treasure', 'merchant', 'event', 'boss', 'transition']) {
    assert.match(levelSystem, new RegExp(`${role}: \\{ label:`),
      `the brief lists ${role} rooms; the role must exist`);
  }
  assert.match(levelSystem, /assignRoomRoles\(\)/, 'rooms must be assigned a role');
  assert.match(levelSystem, /this\.rooms\[0\]\.role = 'base'/,
    'the first room is always the Zeus Altar');
  assert.match(levelSystem, /hasBoss \? 'boss' : 'transition'/,
    'the exit room is the boss arena when the chapter has a boss');
});

test('a chapter identity cannot be inverted or flattened', () => {
  // Both earlier allocation rules were wrong and had to be replaced: one handed
  // a combat-heavy chapter's spare room to a rare type, the other flattened every
  // chapter to a uniform mix. Guard the properties they broke.
  const body = levelSystem.slice(
    levelSystem.indexOf('assignRoomRoles()'),
    levelSystem.indexOf('/**\n   * Verify the level')
  );
  // Every declared type must be present at least once.
  assert.match(body, /counts\.set\(role, 1\)/,
    'every declared room type must get at least one room');
  // The leftover rooms must be distributed in proportion to the declared weights.
  assert.match(body, /const exact = \(w\.weight \/ totalWeight\) \* remaining/,
    'leftover rooms must be shared in proportion to the declared weights');
  // And any shortfall must go to the heaviest type, never to a rare one.
  assert.match(body, /while \(sequence\.length < interiorCount\)/,
    'the role sequence must be filled to the room count');
  // Roles must be spread through the level, not bunched at one end.
  assert.match(body, /\.sort\(\(a, b\) => a\.key - b\.key\)/,
    'roles must be interleaved so a chapter is not two halves');
});

test('the level is audited before the game is allowed to play it', () => {
  // The guarantee list: connectivity, no inaccessible portal, no wall spawn, no
  // impossible encounter, no soft lock.
  assert.match(levelSystem, /audit\(\) \{/, 'the generator must audit its own output');
  assert.match(levelSystem, /const reachable = this\.floodFill\(/,
    'connectivity must be proven by a flood fill, not assumed');
  assert.match(levelSystem, /portalReachable/);
  assert.match(levelSystem, /unreachableRooms/);
  assert.match(levelSystem, /bossClearance/, 'a boss arena must have the clearance it needs');
  assert.match(levelSystem, /enoughRooms/, 'a chapter needs enough rooms for its own mix');
  assert.match(levelSystem, /ok: portalReachable && unreachableRooms\.length === 0 && bossClearance && enoughRooms/,
    'the audit verdict must gate on every guarantee');
  assert.match(levelSystem, /console\.warn\('\[LevelSystem\] chapter audit failed'/,
    'a failed audit must be loud');
});

test('spawns are drawn from the proven-reachable set, never from the grid', () => {
  // A wall spawn is the classic BSP failure. The old code probed random grid
  // coordinates and retried; the new code picks from the flood-filled set.
  assert.match(levelSystem, /getSpawnPositionForRole\(role/);
  assert.match(levelSystem, /const reachable = this\.reachableSet\(\)/);
  assert.match(levelSystem, /if \(!reachable\.has\(`\$\{x\},\$\{y\}`\)\) continue;/,
    'a spawn candidate outside the reachable set must be rejected');
  assert.match(levelSystem, /getSpawnPositionForRole\(role, \{ excludeBase = true, requiredClearance = 1 \} = \{\}\)/,
    'the role spawn picker must accept a clearance requirement');
  assert.match(gameScene, /getSpawnPositionForRole\('boss', \{ requiredClearance: 3 \}\)/,
    'the boss must be placed in the arena that was proved to have clearance');
});

test('encounters are placed by role, not scattered', () => {
  assert.match(gameScene, /getSpawnPositionForRole\(role\)/,
    'enemies must be placed in the room their role names');
  assert.match(gameScene, /const isEliteRoom = pos\.role === 'elite'/,
    'an elite chamber must change the encounter, not just the label');
  assert.match(gameScene, /typeConfig\.hp = Math\.round\(typeConfig\.hp \* 1\.5\)/,
    'an elite chamber must actually be stronger');
  assert.match(gameScene, /setData\('spawnRole'/,
    'each placed entity must record which room it came from, so QA can measure it');
  // Hazards belong in rooms the player fights through.
  assert.match(gameScene, /const hazardRoles = \['combat', 'event', 'treasure'\]/,
    'a fissure or a tower must not appear in a safe camp or a shrine');
});

test('the room count follows the chapter identity, with a sane ceiling', () => {
  // A six-type mix cannot be expressed in six rooms and still have a dominant
  // type, so the depth is derived from the declared mix — but capped, because
  // past a couple of dozen rooms a dungeon stops being a place.
  assert.match(levelSystem, /const declaredTypes = Object\.keys\(this\.config\.rooms \|\| \{\}\)\.length/);
  assert.match(levelSystem, /Math\.min\(5, Math\.max\(3, declaredTypes\)\)/,
    'the BSP depth must derive from the mix and stay capped');
  assert.doesNotMatch(levelSystem, /this\.splitSpace\(2, 2, this\.width - 4, this\.height - 4, 3\);/,
    'a fixed depth of 3 cannot hold the declared mixes');
});

test('the level design audit is registered as an operator diagnostic', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /dungeon-level-design-audit\.mjs/,
    'the level design audit must be owned, or it becomes an untracked script');
});
