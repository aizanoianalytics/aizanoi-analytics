// The 2D build had a victory screen: ten chapters, and when the descent was
// complete the run ended with a ledger of what the player had done. The 3D
// rewrite had no win condition at all — the chapter counter just kept
// climbing into an endless mode, so the run never ended and there was
// nowhere to show a summary.
//
// These tests pin the win condition and the ledger data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attack,
  chooseBlessing,
  createGameState,
  openChest,
  shoot,
  spawnWave,
  stepGame,
  FINAL_CHAPTER,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

// Run a wave to completion and open its chest, the way the game does.
const clearWave = (state) => {
  state.wave = { active: true, complete: false, rewarded: false, chapter: state.chapter, scale: 1 };
  state.enemies = [];
  stepGame(state, {}, 1 / 60);
  const chest = state.chests.at(-1);
  return openChest(state, chest.id);
};

test('the descent has ten chapters', () => {
  assert.equal(FINAL_CHAPTER, 10);
});

test('clearing the tenth chapter wins the run', () => {
  const state = createGameState('victory');
  let victory = false;
  for (let chapter = 1; chapter <= FINAL_CHAPTER; chapter += 1) {
    state.chapter = chapter;
    const result = clearWave(state);
    if (chapter === FINAL_CHAPTER) {
      victory = result.victory === true;
      assert.ok(victory, 'the tenth chapter must win the run');
      assert.ok(state.events.some((event) => event.type === 'victory'),
        'a victory event must be emitted');
    } else {
      assert.notEqual(result.victory, true, `chapter ${chapter} must not win the run`);
    }
  }
  assert.equal(state.chapter, FINAL_CHAPTER + 1);
  assert.equal(state.mode, 'endless');
});

test('a run that stops short does not win', () => {
  const state = createGameState('not-victory');
  state.chapter = 3;
  const result = clearWave(state);
  assert.notEqual(result.victory, true);
  assert.equal(state.events.filter((event) => event.type === 'victory').length, 0);
});

test('the ledger counts the kills, the chests and the blessings', () => {
  const state = createGameState('ledger');
  state.chapter = 1;
  state.wave = { active: true, complete: false, rewarded: false, chapter: 1, scale: 1 };
  state.enemies = [{
    id: 'e1', archetype: 'chaser', x: 1, z: 0, hp: 70, maxHp: 70, speed: 3.8,
    damage: 9, xp: 12, gold: 5, attackCooldown: 0, shootCooldown: 0,
    summonCooldown: 0, stun: 0, windup: null, dead: false, intent: 'idle',
  }];
  // One swing that both lands and kills: the counter has to see the kill.
  state.enemies[0].hp = 1;
  const hit = attack(state, 'e1');
  assert.equal(hit.hit, true);
  assert.equal(state.stats.kills, 1, 'the kill must be counted');
  assert.equal(state.stats.meleeSwings, 1, 'the swing must be counted');
  assert.equal(state.enemies[0].dead, true, 'the enemy must be dead');

  const chest = state.chests.at(-1);
  if (chest) {
    openChest(state, chest.id);
    assert.equal(state.stats.chestCount, 1, 'the chest must be counted');
  }
});

test('a boss kill is counted separately from an ordinary kill', () => {
  const state = createGameState('boss-ledger');
  state.enemies = [{
    id: 'boss', archetype: 'boss', x: 1, z: 0, hp: 1, maxHp: 650, speed: 2.7,
    damage: 24, xp: 150, gold: 80, attackCooldown: 0, shootCooldown: 0,
    summonCooldown: 0, stun: 0, windup: null, dead: false, intent: 'idle',
  }];
  attack(state, 'boss');
  assert.equal(state.stats.kills, 1);
  assert.equal(state.stats.bossKills, 1, 'the boss kill must be counted');
});

test('a bow shot is counted', () => {
  const state = createGameState('shot-ledger');
  state.enemies = [{
    id: 'e1', archetype: 'chaser', x: 4, z: 0, hp: 70, maxHp: 70, speed: 3.8,
    damage: 9, xp: 12, gold: 5, attackCooldown: 0, shootCooldown: 0,
    summonCooldown: 0, stun: 0, windup: null, dead: false, intent: 'idle',
  }];
  const shot = shoot(state);
  assert.equal(shot.fired, true);
  assert.equal(state.stats.shotsFired, 1, 'the shot must be counted');
});

test('the damage the player takes is counted', () => {
  const state = createGameState('damage-ledger');
  state.enemies = [{
    id: 'e1', archetype: 'chaser', x: 1, z: 0, hp: 70, maxHp: 70, speed: 3.8,
    damage: 9, xp: 12, gold: 5, attackCooldown: 0, shootCooldown: 0,
    summonCooldown: 0, stun: 0, windup: null, dead: false, intent: 'idle',
  }];
  state.enemies[0].x = state.player.position.x;
  state.enemies[0].z = state.player.position.z;
  for (let i = 0; i < 120; i += 1) stepGame(state, {}, 1 / 60);
  assert.ok(state.stats.damageTaken > 0, 'the damage taken must be counted');
});

test('the ledger survives a save and restore round trip', () => {
  const state = createGameState('ledger-save');
  state.stats.kills = 7;
  state.stats.bossKills = 2;
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(restored.stats.kills, 7);
  assert.equal(restored.stats.bossKills, 2);
});

test('a blessing claim is reflected in the ledger', () => {
  const state = createGameState('blessing-ledger');
  chooseBlessing(state, 'fury');
  assert.equal(state.blessings.length, 1, 'the blessing must be recorded');
});
