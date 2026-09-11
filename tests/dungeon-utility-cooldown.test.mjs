import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal Phaser surface so entity modules import under node.
class StubSprite {
  constructor(scene) { this.scene = scene; this.body = { setSize() {}, setOffset() {} }; }
  setCollideWorldBounds() {}
  setVelocity() {}
  setDepth() {}
  setAlpha() {}
  setScale() {}
  setTint() {}
  clearTint() {}
  play() {}
}
globalThis.Phaser = {
  Physics: { Arcade: { Sprite: StubSprite } },
  Math: { Distance: { Between: () => 0 }, Angle: { Between: () => 0 } },
};
globalThis.window = globalThis.window || {};

function mockScene() {
  return {
    add: { existing() {}, graphics: () => ({ setDepth() {}, clear() {}, fillStyle() {}, fillRect() {} }) },
    physics: { add: { existing() {} } },
    time: { delayedCall() {} },
    createFloatingText() {},
  };
}
function mockInventory() {
  return { getCalculatedStats: () => ({ hp: 120, hpRegen: 1, hpRegenBase: 5 }) };
}
function mockProgression(skills = ['shadow_melding']) {
  return { unlockedSkills: new Set(skills) };
}

const { Aizo } = await import('../frontend/dungeon/js/entities/Aizo.js');

function makePlayer(skills) {
  return new Aizo(mockScene(), 0, 0, mockInventory(), mockProgression(skills));
}

test('utility cooldown starts at 0 and recovers after use', () => {
  const player = makePlayer();
  assert.equal(player.utilityCooldown, 0);
  assert.equal(player.castUtilitySkill(), true);
  assert.equal(player.utilityCooldown, 32000);
  assert.equal(player.castUtilitySkill(), false);
  player.update(0, 16000);
  assert.equal(player.utilityCooldown, 16000);
  assert.equal(player.castUtilitySkill(), false);
  player.update(0, 16000);
  assert.equal(player.utilityCooldown, 0);
  assert.equal(player.castUtilitySkill(), true);
});

test('utility cooldown clamps at 0, never negative', () => {
  const player = makePlayer();
  player.castUtilitySkill();
  player.update(0, 100000);
  assert.equal(player.utilityCooldown, 0);
});

test('utility skill requires the shadow_melding unlock', () => {
  const player = makePlayer([]);
  assert.equal(player.castUtilitySkill(), false);
  assert.equal(player.utilityCooldown, 0);
});
