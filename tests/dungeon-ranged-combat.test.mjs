import test from 'node:test';
import assert from 'node:assert/strict';

const { CombatSystem } = await import('../frontend/dungeon/js/systems/CombatSystem.js');

function attackerWith(weapon, stats) {
  const heals = [];
  return {
    attacker: {
      inventory: { equipped: { weapon } },
      stats: { attackDamage: 20, critChance: 0, critMultiplier: 1.5, lifesteal: 0, ...stats },
      hasSkill: () => false,
      heal: (n) => heals.push(n),
    },
    heals,
  };
}
function targetWith(armor, hp = 500) {
  const taken = [];
  return {
    target: {
      stats: { armor }, armor, hp, maxHp: hp, isBoss: false,
      hasSkill: () => false,
      takeDamage: (n, crit) => taken.push({ n, crit }),
    },
    taken,
  };
}

test('Penkalas Bow armor penetration changes the resolved result', () => {
  const { attacker, heals } = attackerWith('penkalas_bow', {});
  const { target, taken } = targetWith(100);
  const res = CombatSystem.processAttack(attacker, target, 20);
  // pen 0.25 -> effective armor 75 -> reduction 75/175
  const expected = Math.max(1, Math.round(20 * (1 - 75 / 175)));
  assert.equal(res.damage, expected);
  assert.equal(taken[0].n, expected);
  assert.deepEqual(heals, []);
});

test('same base without penetration deals less damage', () => {
  const plain = attackerWith('zeus_splinter', {});
  const pen = attackerWith('penkalas_bow', {});
  const t1 = targetWith(100);
  const t2 = targetWith(100);
  const r1 = CombatSystem.processAttack(plain.attacker, t1.target, 20);
  const r2 = CombatSystem.processAttack(pen.attacker, t2.target, 20);
  assert.ok(r2.damage > r1.damage, `pen ${r2.damage} must beat plain ${r1.damage}`);
});

test('ranged crit uses chance and multiplier', () => {
  const { attacker } = attackerWith('penkalas_bow', { critChance: 1, critMultiplier: 2 });
  const { target, taken } = targetWith(0);
  const res = CombatSystem.processAttack(attacker, target, 20);
  assert.equal(res.isCritical, true);
  assert.equal(res.damage, 40);
  assert.equal(taken[0].crit, true);
});

test('ranged lifesteal heals once off actual damage', () => {
  const { attacker, heals } = attackerWith('penkalas_bow', { lifesteal: 0.1 });
  const { target } = targetWith(0);
  const res = CombatSystem.processAttack(attacker, target, 20);
  assert.deepEqual(heals, [Math.max(1, Math.round(res.damage * 0.1))]);
});

test('baseDamageOverride preserves per-projectile variance (twin spark 0.65x)', () => {
  const { attacker } = attackerWith('penkalas_bow', {});
  const t1 = targetWith(0);
  const t2 = targetWith(0);
  const full = CombatSystem.processAttack(attacker, t1.target, 20);
  const spark = CombatSystem.processAttack(attacker, t2.target, Math.round(20 * 0.65));
  assert.ok(spark.damage < full.damage, `spark ${spark.damage} must be below full ${full.damage}`);
});

test('fissure resonance and divine execution apply to ranged hits too', () => {
  let hits = 0;
  const atk = attackerWith('penkalas_bow', {}).attacker;
  atk.hasSkill = (id) => id === 'fissure_resonance';
  atk.hitCounter = 4;
  const { target } = targetWith(0);
  const res = CombatSystem.processAttack(atk, target, 20);
  assert.equal(hits, 0);
  assert.equal(res.damage, Math.round(20 * 2.2));
  assert.equal(res.isCritical, true);

  const atk2 = attackerWith('penkalas_bow', {}).attacker;
  atk2.hasSkill = (id) => id === 'divine_execution';
  const weak = targetWith(0, 100);
  weak.target.hp = 10;
  const res2 = CombatSystem.processAttack(atk2, weak.target, 20);
  assert.equal(res2.damage, 10);
});
