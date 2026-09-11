import test from 'node:test';
import assert from 'node:assert/strict';

class StubSprite {
  constructor(scene) { this.scene = scene; this.body = { setSize() {}, setOffset() {} }; this.vel = null; }
  setCollideWorldBounds() {}
  setVelocity(x, y) { this.vel = [x, y]; }
  setDepth() {}
  setAlpha() {}
  setScale() {}
  setTint() {}
  clearTint() {}
  play() {}
}
class StubScene extends StubSprite {
  constructor() { super(null); }
}
globalThis.Phaser = {
  Scene: StubScene,
  Physics: { Arcade: { Sprite: StubSprite } },
  Math: { Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) }, Angle: { Between: () => 0 } },
};
globalThis.window = globalThis.window || {};

function mockScene() {
  return {
    add: { existing() {}, graphics: () => ({ setDepth() {}, clear() {}, fillStyle() {}, fillRect() {} }) },
    physics: { add: { existing() {} } },
    physics2: null,
    time: { delayedCall() {} },
    createFloatingText() {},
    cameras: { main: { shake() {} } },
  };
}
function mockInventory(equipped = {}) {
  return {
    getCalculatedStats: () => ({ hp: 120, hpRegen: 1, hpRegenBase: 5 }),
    equipped: { weapon: 'penkalas_bow', armor: null, accessories: [], ...equipped },
  };
}

const { Aizo } = await import('../frontend/dungeon/js/entities/Aizo.js');
const { GameScene } = await import('../frontend/dungeon/js/scenes/GameScene.js');

function makePlayer(equipped) {
  const p = new Aizo(mockScene(), 100, 100, mockInventory(equipped), { unlockedSkills: new Set() });
  p.x = 100; p.y = 100;
  return p;
}

test('Sacred Aegis reduces lightning damage by 35%, ignores physical', () => {
  const aegis = makePlayer({ armor: 'sacred_aegis' });
  aegis.takeDamage(100, false, null, 'lightning');
  assert.equal(aegis.hp, 120 - 65);
  const aegis2 = makePlayer({ armor: 'sacred_aegis' });
  aegis2.takeDamage(100, false, null, 'physical');
  assert.equal(aegis2.hp, 20);
  const bare = makePlayer({});
  bare.takeDamage(100, false, null, 'lightning');
  assert.equal(bare.hp, 20);
});

test('Scarab shield absorbs before HP, refreshes every 50s, resets on unequip', () => {
  const p = makePlayer({ accessories: ['scarab_amulet'] });
  assert.equal(p.shield, 0);
  p.update(0, 49999);
  assert.equal(p.shield, 0);
  p.update(0, 1);
  assert.equal(p.shield, 60);
  p.takeDamage(100);
  assert.equal(p.shield, 0);
  assert.equal(p.hp, 120 - 40);
  // refresh, not stack
  p.update(0, 50000);
  assert.equal(p.shield, 60);
  p.update(0, 50000);
  assert.equal(p.shield, 60);
  // unequip resets the timer; existing shield stays until absorbed
  p.inventory.equipped.accessories = [];
  p.update(0, 99999);
  assert.equal(p.shield, 60);
  assert.equal(p.scarabTimer, 0);
});

test('Zeus Staff AoE hits neighbors at half damage, never double-hits primary', () => {
  const handler = Object.create(GameScene.prototype);
  const sparks = [];
  handler.createDamageSpark = (x, y) => sparks.push([x, y]);
  function mockEnemy(x, hp = 500) {
    return {
      active: true, x, y: 0, hp, maxHp: hp, isBoss: false,
      stats: { armor: 0 }, armor: 0, hasSkill: () => false,
      dmg: [],
      takeDamage(n) { this.dmg.push(n); this.hp -= n; },
    };
  }
  const e1 = mockEnemy(0);
  const e2 = mockEnemy(30);
  const e3 = mockEnemy(500);
  handler.enemies = { getChildren: () => [e1, e2, e3] };
  const attacker = {
    inventory: { equipped: { weapon: 'zeus_staff' } },
    stats: { attackDamage: 32, critChance: 0, critMultiplier: 1.5, lifesteal: 0 },
    hasSkill: () => false,
  };
  const proj = { isPlayer: true, damage: 32, damageType: 'lightning', attacker, destroy() {} };
  handler.handleProjectileHitEnemy(proj, e1);
  assert.equal(e1.dmg.length, 1, 'primary must be hit exactly once');
  assert.equal(e1.dmg[0], 32);
  assert.equal(e2.dmg.length, 1, 'neighbor in radius must be splashed');
  assert.equal(e2.dmg[0], 16);
  assert.equal(e3.dmg.length, 0, 'outsider must be untouched');
  assert.ok(sparks.length >= 2, 'splash needs visual feedback');
});

test('non-staff weapons deal no splash', () => {
  const handler = Object.create(GameScene.prototype);
  handler.createDamageSpark = () => {};
  function mockEnemy(x) {
    return {
      active: true, x, y: 0, hp: 500, maxHp: 500, isBoss: false,
      stats: { armor: 0 }, armor: 0, hasSkill: () => false,
      dmg: [],
      takeDamage(n) { this.dmg.push(n); this.hp -= n; },
    };
  }
  const e1 = mockEnemy(0);
  const e2 = mockEnemy(30);
  handler.enemies = { getChildren: () => [e1, e2] };
  const attacker = {
    inventory: { equipped: { weapon: 'penkalas_bow' } },
    stats: { attackDamage: 20, critChance: 0, critMultiplier: 1.5, lifesteal: 0 },
    hasSkill: () => false,
  };
  handler.handleProjectileHitEnemy({ isPlayer: true, damage: 20, attacker, destroy() {} }, e1);
  assert.equal(e1.dmg.length, 1);
  assert.equal(e2.dmg.length, 0);
});

const { Enemy } = await import('../frontend/dungeon/js/entities/Enemy.js');

function makeEnemy(typeConfig, x = 10) {
  const scene = mockScene();
  scene.time = { delayedCall() {} };
  scene.cameras = { main: { shake() {} } };
  const e = new Enemy(scene, x, 0, {
    name: 't', hp: 100, attackDamage: 5, attackSpeed: 1, attackRange: 30,
    moveSpeed: 40, armor: 0, xpReward: 1, goldReward: 1, behavior: 'chase',
    aggroRange: 300, spriteRow: 0, ...typeConfig,
  });
  e.x = x; e.y = 0;
  e.active = true;
  return e;
}

test('hit applies knockback away from attacker, skipped for bosses', () => {
  const e = makeEnemy({});
  e.takeDamage(10, false, { x: 0, y: 0 });
  assert.ok(e.vel && e.vel[0] > 0, 'must be pushed away on +x');
  assert.equal(e.knockbackTimer, 120);
  const boss = makeEnemy({ isMiniBoss: true });
  boss.takeDamage(10, false, { x: 0, y: 0 });
  assert.equal(boss.vel, null);
});

test('knockback timer decays in update', () => {
  const e = makeEnemy({});
  const player = { x: 0, y: 0, isDead: false, isStealthed: false };
  e.takeDamage(10, false, { x: 0, y: 0 });
  e.update(0, 50, player);
  assert.equal(e.knockbackTimer, 70);
});
