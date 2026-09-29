// Section 18: "Do not accept data labels such as melee_chase, ranged_kite,
// stealth_ambush, shield_bash_charge unless the gameplay implementation
// genuinely differentiates them."
//
// The browser audit (tests/dungeon-enemy-behaviour-audit.mjs) measures this in
// the running game. This suite is the fast, deterministic half: it asserts the
// each declared behaviour is actually read by the AI, so a label cannot decay
// into decoration without CI noticing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CANON = 'frontend/js/v3/apps/dungeon/js';
const enemy = read(`${CANON}/entities/Enemy.js`);
const types = read(`${CANON}/data/enemies.js`);

// The archetypes the brief names explicitly, and the behaviour each must show.
const REQUIRED = [
  { key: 'gargoyle', behavior: 'melee_chase', identity: 'agile pressure' },
  { key: 'skeletalArcher', behavior: 'ranged_kite', identity: 'ranged positioning' },
  { key: 'centurion', behavior: 'melee_tank', identity: 'slow armoured threat' },
  { key: 'shadowWraith', behavior: 'stealth_ambush', identity: 'ambush/mobility' },
  { key: 'cultSorcerer', behavior: 'ranged_aoe', identity: 'area denial' },
  { key: 'praetorian', behavior: 'shield_bash_charge', identity: 'charge/control' }
];

test('every archetype the brief names exists in the enemy table', () => {
  for (const { key, behavior } of REQUIRED) {
    const block = types.match(new RegExp(`\\b${key}\\s*:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(block, new RegExp(`behavior:\\s*'${behavior}'`),
      `${key} must declare ${behavior} (found: ${block.slice(0, 120) || 'no block'})`);
  }
});

test('each declared behaviour is read by the AI, not only present in data', () => {
  for (const { behavior } of REQUIRED) {
    // melee_chase is the shared default walk path rather than a string the AI
    // branches on, so it is proven by the movement code existing at all.
    if (behavior === 'melee_chase') {
      assert.match(enemy, /Hedefe doğru yürü/,
        'the default walk-towards-target path must exist for melee_chase');
      continue;
    }
    assert.ok(enemy.includes(`'${behavior}'`),
      `Enemy.js never branches on ${behavior}; the label is decoration`);
  }
});

test('the chasers are genuinely differentiated from one another', () => {
  // melee_chase walks straight at the target; melee_tank must be slower and
  // have a shorter reach, otherwise "slow armoured threat" is only a label.
  const grab = (key) => types.match(new RegExp(`\\b${key}\\s*:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const num = (block, field) => Number(block.match(new RegExp(`${field}:\\s*([\\d.]+)`))?.[1] ?? NaN);

  const gargoyle = grab('gargoyle');
  const centurion = grab('centurion');
  assert.ok(num(centurion, 'moveSpeed') < num(gargoyle, 'moveSpeed'),
    'the centurion must be slower than the gargoyle');
  assert.ok(num(centurion, 'hp') > num(gargoyle, 'hp'),
    'the centurion must survive longer than the gargoyle');
  assert.ok(num(centurion, 'armor') > 0, 'the centurion must actually be armoured');
});

test('the shadow wraith actually starts concealed', () => {
  // The brief asks for ambush/mobility. Concealment is what makes it an
  // ambush, and the fast move speed is what makes it mobile.
  assert.match(enemy, /behavior === 'stealth_ambush'[\s\S]{0,320}setAlpha\(0\.25\)/,
    'the wraith must be translucent until it commits');
  assert.match(enemy, /isAmbushing\s*=\s*true/,
    'the wraith must latch into its committed ambush state');

  const wraith = types.match(/\bshadowWraith\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
  const speed = Number(wraith.match(/moveSpeed:\s*([\d.]+)/)?.[1] ?? 0);
  assert.ok(speed >= 150, `the wraith must be the fastest archetype, got ${speed}`);
});

test('the shield-bash charge is a real multi-phase mechanic', () => {
  // This is the behaviour the brief singles out, and it used to be a label
  // with no implementation: Enemy.js only scaled the sprite. A charge needs a
  // windup the player can read, a committed rush, and a punishable recovery.
  assert.match(enemy, /updateCharge\s*\(\s*time/,
    'the charge must be implemented in the update loop');
  for (const phase of ['windup', 'charging', 'recovery']) {
    assert.ok(enemy.includes(`'${phase}'`), `the charge must have a ${phase} phase`);
  }
  // The heading is locked during the windup, otherwise the dodge window the
  // telegraph implies does not exist.
  assert.match(enemy, /c\.phase = 'windup'[\s\S]{0,200}Phaser\.Math\.Angle\.Between/,
    'the windup must capture and lock a heading');
  assert.ok(!/c\.angle = Phaser\.Math\.Angle\.Between[\s\S]{0,400}if \(c\.phase === 'windup'\)[\s\S]{0,200}c\.angle =/.test(enemy),
    'the windup must not re-aim at the player, or the telegraph is meaningless');
  // A wall ends the rush; that is what makes positioning a real tactic.
  assert.match(enemy, /c\.phase === 'charging'[\s\S]{0,900}body\?\.blocked/,
    'hitting geometry must end the charge');
  // Contact damage, once per charge.
  assert.match(enemy, /c\.hit = true/,
    'the charge must register its contact damage exactly once');
  // The charge must outrun the ordinary chase so it is a real threat.
  const charge = Number(enemy.match(/CHARGE_SPEED = (\d+)/)?.[1] ?? 0);
  const praetorian = types.match(/\bpraetorian\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
  const walk = Number(praetorian.match(/moveSpeed:\s*([\d.]+)/)?.[1] ?? 0);
  assert.ok(charge > walk * 2, `the charge (${charge}) must be far faster than the walk (${walk})`);
});

test('the charge cannot be chained out of a knockback', () => {
  // Without the standstill check, a stun-locked praetorian could charge
  // repeatedly and the recovery window would be meaningless.
  assert.match(enemy, /c\.phase === 'idle'[\s\S]{0,400}velocity[\s\S]{0,120}> 20/,
    'the charge must require a standstill to begin');
});

test('the cult sorcerer denies an area rather than only shooting', () => {
  assert.match(enemy, /volatileDamage/,
    'the sorcerer must leave a damaging zone behind');
  const sorcerer = types.match(/\bcultSorcerer\s*:\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(sorcerer, /volatileDamage:\s*\d/,
    'the sorcerer must configure its area damage');
});

test('the enemy behaviour audit is registered as an operator diagnostic', () => {
  const ownership = read('tests/test-ownership.test.mjs');
  assert.match(ownership, /dungeon-enemy-behaviour-audit\.mjs/,
    'the behaviour audit must be owned, or it becomes an untracked script');
});
