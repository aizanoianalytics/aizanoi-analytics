// Section 18, boss half: "Bosses need real encounter design." The mini boss
// needs readable phases; the final boss must feel like a final boss "rather
// than a large stat block", with distinct phases, telegraphed attacks, arena
// progression, a lightning/storm identity and a meaningful escalation.
//
// tests/dungeon-boss-encounter-audit.mjs measures all of that in the running
// game. This suite is the fast half: it asserts the encounter machinery exists
// and is wired into the update loop, so a boss cannot silently decay back into
// a stat block without CI noticing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CANON = 'frontend/js/v3/apps/dungeon/js';
const enemy = read(`${CANON}/entities/Enemy.js`);
const types = read(`${CANON}/data/enemies.js`);
const scene = read(`${CANON}/scenes/GameScene.js`);

const minotaur = types.match(/\bmarbleMinotaur\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
const colossus = types.match(/\btitanColossus\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
// Slice one method's body out of Enemy.js by brace matching, so these
// assertions never depend on where a method happens to sit in the file.
const methodBody = (source, name) => {
  const start = source.indexOf(`\n  ${name}(`);
  assert.ok(start > 0, `Enemy.js must define ${name}`);
  let depth = 0;
  for (let j = source.indexOf('{', start); j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return source.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
};
const num = (block, field) => Number(block.match(new RegExp(`${field}:\\s*([\\d.]+)`))?.[1] ?? NaN);

test('both bosses are marked as bosses and declare encounter behaviour', () => {
  assert.match(minotaur, /isMiniBoss:\s*true/);
  assert.match(colossus, /isFinalBoss:\s*true/);
  // The labels exist in data, and the AI must actually branch on them.
  assert.match(minotaur, /behavior:\s*'boss_ground_slam'/);
  assert.match(colossus, /behavior:\s*'boss_storm_colossus'/);
  assert.match(enemy, /updateEncounter/,
    'Enemy.js must implement the encounter, not just carry the label');
});

test('the encounter runs ahead of the generic movement block', () => {
  // This is the load-bearing wiring. If the encounter is invoked after the
  // walk-towards-player block, or the call returns false while a committed
  // move is running, the generic block overwrites the boss's velocity every
  // frame and no boss attack ever actually happens.
  const call = enemy.indexOf('this.updateEncounter(');
  const generic = enemy.indexOf('Hedefe doğru yürü');
  assert.ok(call > 0 && generic > 0, 'both the encounter hook and the walk block must exist');
  assert.ok(call < generic, 'the encounter must run before the generic movement block');

  const body = methodBody(enemy, 'updateEncounter');
  assert.match(body, /return e\.move\.phase !== 'idle'/,
    'a committed boss move must own the velocity for its whole duration');
});

test('boss phases are health-gated and announced', () => {
  // Phases must come from health thresholds, so the escalation is visible to
  // the player rather than being a hidden stat change.
  const body = methodBody(enemy, 'updateEncounter');
  assert.match(body, /isFinalBoss \? 3 : 2/, 'the final boss needs more phases than the mini boss');
  assert.match(body, /this\.hp \/ this\.maxHp <= t/,
    'phases must be gated on remaining health');
  assert.match(body, /announcePhase\(/,
    'a phase change must be announced to the player');
  assert.match(body, /phaseFlash/, 'a transition must open a punish window');
});

test('the mini boss has a telegraphed charge that resolves into a slam', () => {
  const body = methodBody(enemy, 'runMiniBossMoves');
  for (const phase of ['windup', 'charging', 'slam', 'recovery']) {
    assert.ok(body.includes(`'${phase}'`), `the mini boss needs a ${phase} phase`);
  }
  // The heading is locked so the telegraph implies a real dodge window.
  assert.match(body, /m\.angle = Phaser\.Math\.Angle\.Between[\s\S]{0,120}?m\.hit = false/,
    'the windup must capture a heading');
  // The slam is an area hazard, so spacing matters.
  assert.match(body, /spawnVolatileZone\(this\.x, this\.y/,
    'the slam must leave a damaging area');
  const charge = Number(body.match(/const speed = (\d+)/)?.[1] ?? 0);
  assert.ok(charge > num(minotaur, 'moveSpeed') * 2,
    `the charge (${charge}) must be far faster than the walk (${num(minotaur, 'moveSpeed')})`);
});

test('the final boss has a storm identity that intensifies per phase', () => {
  const body = methodBody(enemy, 'runFinalBossMoves');
  // Lightning is its identity, and the orb is fired as lightning damage.
  assert.match(body, /'lightning'/,
    'the colossus must deal lightning damage, that is its identity');
  // The cadence must tighten as the fight escalates, or the phases are cosmetic.
  assert.match(body, /e\.enraged \? 1100 : \(e\.phase >= 2 \? 1800 : 2600\)/,
    'the storm cadence must shorten with each phase');
  assert.match(body, /e\.phase >= 2 \? 3 : 2/,
    'later phases must fire more bolts');
  assert.match(body, /e\.phase >= 1[\s\S]{0,200}spawnVolatileZone\(player\.x, player\.y/,
    'later phases must deny the ground under the player');
  // And it must be able to close distance, not only act as a turret.
  for (const phase of ['windup', 'charging', 'recovery']) {
    assert.ok(body.includes(`'${phase}'`), `the final boss needs a ${phase} phase`);
  }
});

test('the final boss enrages with a real, announced escalation', () => {
  const body = methodBody(enemy, 'updateEncounter');
  assert.match(body, /this\.hp \/ this\.maxHp <= 0\.22/,
    'the enrage must trigger at a defined health threshold');
  assert.match(body, /this\.moveSpeed = Math\.round\(this\.moveSpeed \* 1\.35\)/,
    'enrage must actually make the boss faster');
  assert.match(body, /'ENRAGED'/,
    'the enrage must be announced, not applied silently');
});

test('the escalation is an opportunity rather than only a difficulty spike', () => {
  // A phase flash or a recovery must leave the boss standing still, so the
  // player can actually answer the escalation.
  const body = methodBody(enemy, 'updateEncounter');
  assert.match(body, /if \(e\.phaseFlash > 0\) \{\s*this\.setVelocity\(0, 0\);\s*return true;/,
    'a phase transition must stop the boss so the player can punish it');
  // The dimming lives in the move handlers, not in updateEncounter: each boss
  // telegraphs its recovery by going translucent while it stands still.
  for (const move of ['runMiniBossMoves', 'runFinalBossMoves']) {
    assert.match(methodBody(enemy, move), /this\.setAlpha\(0\.7\)/,
      `${move} must dim the boss during recovery, not pause it silently`);
  }
});

test('boss ground hazards are cleared even when the scene restarts', () => {
  // The slam and the denial zones create game objects with timers. If the
  // scene is restarted the pending timer callbacks must not fire against a
  // destroyed zone, or a chapter change throws.
  assert.match(scene, /spawnVolatileZone\(/,
    'GameScene must own the ground hazard the bosses use');
  assert.match(scene, /if \(!state\.zone\.active\) return/,
    'a hazard tick must stop once its zone is gone');
  assert.match(scene, /const cleanUp = \(\) => \{/,
    'a hazard must clean itself up rather than leaking scene objects');
});

test('the boss audit is registered as an operator diagnostic', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /dungeon-boss-encounter-audit\.mjs/,
    'the boss audit must be owned, or it becomes an untracked script');
});
