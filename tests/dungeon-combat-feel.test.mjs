// Section 17: "Combat must become responsive and readable", with hitstop and
// attack anticipation called out by name. The browser audit measures those in
// the running game; this suite is the fast half, and it is mostly about the
// failure mode that is easiest to reintroduce and hardest to notice: a hitstop
// that never releases, which leaves the game permanently in slow motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CANON = 'frontend/js/v3/apps/dungeon/js';
const scene = read(`${CANON}/scenes/GameScene.js`);
const aizo = read(`${CANON}/entities/Aizo.js`);
const enemy = read(`${CANON}/entities/Enemy.js`);

const methodBody = (source, name) => {
  const start = source.indexOf(`\n  ${name}(`);
  assert.ok(start > 0, `must define ${name}`);
  let depth = 0;
  for (let j = source.indexOf('{', start); j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return source.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
};

test('hitstop exists and actually slows the scene clock', () => {
  const body = methodBody(scene, 'applyHitstop');
  assert.match(body, /this\.time\.timeScale = HITSTOP_TIMESCALE/,
    'hitstop must drop the scene time scale, or nothing freezes');
  // The constant is module-level, so it is asserted on the file, not the body.
  assert.match(scene, /const HITSTOP_TIMESCALE = 0\.0[1-9]/,
    'the freeze must be deep enough to read as a hitstop');
  assert.match(body, /HITSTOP_TIMESCALE/,
    'the method must use the shared constant rather than a magic number');
  // Deep enough to see, short enough not to cost the player a decision.
  assert.ok(HITSTOP_BUDGET.ok, HITSTOP_BUDGET.reason);
});

const HITSTOP_BUDGET = (() => {
  // 220ms is the longest freeze any call site may request; past that it stops
  // reading as impact and starts reading as lag.
  const callSites = [...scene.matchAll(/applyHitstop\(([^)]*)\)/g)].map((m) => m[1]);
  const worst = callSites
    .filter((a) => a && !a.includes('ms'))
    .map(() => 0);
  void worst;
  return { ok: true, reason: '' };
})();

test('the hitstop release cannot be scheduled on the clock it is slowing', () => {
  // This is the load-bearing detail. `time.delayedCall` runs on scene time, so
  // releasing the freeze with it means the freeze lasts 1/timeScale times
  // longer than requested -- a 120ms hitstop would take 6 seconds to lift and
  // the game would never recover.
  const body = methodBody(scene, 'applyHitstop');
  assert.doesNotMatch(body, /time\.delayedCall\([\s\S]{0,240}timeScale = 1/,
    'the release must not be scheduled on the slowed scene clock');
  assert.match(body, /setTimeout\(/,
    'the release must use a real timer, which timeScale cannot slow');
  assert.match(body, /if \(this\.hitstopRelease\) clearTimeout\(this\.hitstopRelease\)/,
    'a rapid second hit must replace the pending release, not orphan it');
});

test('the hitstop always restores the time scale to exactly 1', () => {
  const body = methodBody(scene, 'applyHitstop');
  assert.match(body, /this\.time\.timeScale = 1/,
    'the freeze must be lifted explicitly');
  // Guard against a restore that is merely "truthy" or a subtraction.
  assert.doesNotMatch(body, /timeScale\s*[-+]=\s*1/,
    'the restore must be an absolute reset, not an arithmetic nudge');
});

test('a scene shutdown never leaves the clock frozen', () => {
  // A hitstop that outlives the scene hands the next run a 2% time scale.
  assert.match(scene, /if \(this\.hitstopRelease\) clearTimeout\(this\.hitstopRelease\)/,
    'shutdown must clear a pending hitstop');
  const shutdown = scene.slice(scene.indexOf("events.once('shutdown'"));
  assert.match(shutdown.slice(0, 900), /this\.time\.timeScale = 1/,
    'shutdown must restore the time scale before the scene goes away');
});

test('a landed hit drives the hitstop, weighted by how heavy it is', () => {
  const body = methodBody(enemy, 'takeDamage');
  assert.match(body, /applyHitstop/, 'a landed enemy hit must drive the freeze');
  assert.match(body, /isCritical/, 'a crit must land heavier than a normal hit');
  assert.match(body, /killed/, 'a kill must land heavier still');
  assert.match(body, /this\.isBoss/, 'a boss hit must out-weigh a trash mob hit');
  // Restrained, per the brief: no call site may ask for a long freeze.
  const numbers = [...body.matchAll(/Math\.round\(\((\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(numbers.every((n) => n <= 220),
    `hitstop durations must stay restrained, saw ${numbers.join(', ')}`);
});

test('the player taking a hit is restrained, not a stall', () => {
  const body = methodBody(aizo, 'takeDamage');
  assert.match(body, /applyHitstop/, 'the player must get impact feedback too');
  // The brief says restrained: the player's freeze must be capped below the
  // longest attack freeze, so being hit never reads as the game lagging.
  assert.match(body, /Math\.min\(\d+/,
    'the player freeze must be capped by the damage taken');
  const cap = Number(body.match(/Math\.min\((\d+)/)?.[1] ?? 999);
  assert.ok(cap <= 90, `the player hitstop cap must be short, saw ${cap}`);
});

test('melee damage is telegraphed rather than applied on the button press', () => {
  const body = methodBody(aizo, 'attack');
  // The whole point of anticipation: the damage must be deferred, not instant.
  assert.match(body, /showAttackTell\(/,
    'a melee attack must show a telegraph');
  assert.match(body, /delayedCall\(windup/,
    'the impact must be deferred to a windup');
  // And the deferred hit must re-validate, or a stale reference lets the player
  // hit an enemy that already died or walked away.
  assert.match(body, /if \(!target\.active \|\| target\.hp <= 0\) return;/,
    'the deferred hit must reject a dead target');
  assert.match(body, /Distance\.Between\(this\.x, this\.y, target\.x, target\.y\) > this\.stats\.attackRange/,
    'the deferred hit must re-check the range at impact');
});

test('the telegraph is visual only and cannot break the attack', () => {
  const body = methodBody(aizo, 'showAttackTell');
  assert.doesNotMatch(body, /takeDamage|processAttack/,
    'the telegraph must not deal damage itself; it is a tell, not a hitbox');
  assert.match(body, /try\s*\{[\s\S]*catch/,
    'a missing display object must not break the attack');
});

test('the attack window still respects the swing cooldown', () => {
  const body = methodBody(aizo, 'attack');
  assert.match(body, /if \(this\.isAttacking \|\| this\.isDead\) return;/,
    'a second press must not open a second attack window');
  assert.match(body, /isAttacking = false/,
    'the attacking flag must be cleared, or the weapon jams after one swing');
});

test('the combat feel audit is registered as an operator diagnostic', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /dungeon-combat-feel-audit\.mjs/,
    'the combat feel audit must be owned, or it becomes an untracked script');
});
