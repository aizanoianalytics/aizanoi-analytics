import test from 'node:test';
import assert from 'node:assert/strict';

const {
  BLESSINGS,
  createRunState,
  pickBlessings,
  selectBlessing,
} = await import('../frontend/dungeon/js/data/blessings.js');
const {
  ELITE_AFFIXES,
  applyEliteAffix,
  chooseEliteAffix,
} = await import('../frontend/dungeon/js/data/elite-affixes.js');

test('blessing offers contain three deterministic unique choices', () => {
  const picks = pickBlessings(3, () => 0);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks.map(({ id }) => id)).size, 3);
  assert.deepEqual(picks.map(({ id }) => id), BLESSINGS.slice(0, 3).map(({ id }) => id));
});

test('a run blessing can only be selected once and state survives transitions without persistence', () => {
  const runState = createRunState();
  assert.equal(selectBlessing(runState, 'hizli_saldiri'), true);
  assert.equal(selectBlessing(runState, 'hizli_saldiri'), false);
  const chapterTransition = { ...runState, blessingIds: [...runState.blessingIds] };
  const endlessTransition = { ...chapterTransition, blessingIds: [...chapterTransition.blessingIds] };
  assert.deepEqual(endlessTransition.blessingIds, ['hizli_saldiri']);
  assert.equal(Object.hasOwn(runState, 'save'), false);
  assert.equal(Object.hasOwn(runState, 'storage'), false);
});

test('elite affix selection is deterministic and bosses never receive one', () => {
  assert.equal(chooseEliteAffix({ isBoss: true }, () => 0), null);
  assert.equal(chooseEliteAffix({ isBoss: false }, () => 0.99), null);
  assert.equal(chooseEliteAffix({ isBoss: false }, () => 0.01), ELITE_AFFIXES[0].id);
});

test('each elite affix applies its documented stat or behavior marker', () => {
  const swift = applyEliteAffix({ moveSpeed: 100, armor: 5 }, 'swift');
  assert.equal(swift.moveSpeed, 125);
  const armored = applyEliteAffix({ moveSpeed: 100, armor: 5 }, 'armored');
  assert.equal(armored.armor, 35);
  const vampiric = applyEliteAffix({ moveSpeed: 100, armor: 5 }, 'vampiric');
  assert.equal(vampiric.vampiricRate, 0.2);
  const volatile = applyEliteAffix({ moveSpeed: 100, armor: 5 }, 'volatile');
  assert.equal(volatile.volatileDamage, 12);
  const storm = applyEliteAffix({ moveSpeed: 100, armor: 5 }, 'stormtouched');
  assert.equal(storm.stormInterval, 2200);
});

test('endless enemy cap remains 32 at high waves', () => {
  const wave = 999;
  const count = Math.min(32, Math.floor(15 * Math.pow(1.12, Math.min(wave, 20) - 1)));
  assert.equal(count, 32);
});
