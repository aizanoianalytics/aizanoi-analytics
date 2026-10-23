// The late-chapter archetypes must actually fight.
//
// Five of the eleven archetypes (shieldbearer, gargoyle, sorcerer, slimegolem,
// bomber) shipped with no behaviour branch at all: they stood still and never
// attacked, so a chapter 7 wave was a row of statues. These tests pin one
// observable behaviour per archetype plus a sweep that fails if any archetype
// goes inert again.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGameState,
  stepGame,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const tick = (state, seconds, input = {}) => {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) stepGame(state, input, 1 / 60);
  return state;
};

const enemy = (id, archetype, x, z, overrides = {}) => ({
  id, archetype, x, z, hp: 400, maxHp: 400, speed: 3,
  damage: 10, attackCooldown: 0, shootCooldown: 0, summonCooldown: 0,
  sorcererCooldown: 0, stun: 0, windup: null, dead: false, intent: 'idle',
  xp: 10, gold: 5, statuses: {}, ...overrides,
});

const solo = (seed, archetype, x = 5, z = 0, overrides = {}) => {
  const state = createGameState(seed);
  state.player.position = { x: 0, z: 0 };
  state.enemies = [enemy('solo', archetype, x, z, overrides)];
  return state;
};

const gapToPlayer = (state) => {
  const unit = state.enemies[0];
  return Math.hypot(unit.x - state.player.position.x, unit.z - state.player.position.z);
};

test('every archetype closes in or attacks, none is an inert prop', () => {
  const archetypes = ['chaser', 'archer', 'tank', 'summoner', 'flanker', 'boss',
    'shieldbearer', 'gargoyle', 'sorcerer', 'slimegolem', 'bomber'];
  const inert = [];
  for (const archetype of archetypes) {
    const state = solo(`live-${archetype}`, archetype, 4, 0);
    const startGap = gapToPlayer(state);
    tick(state, 4);
    const moved = Math.abs(startGap - gapToPlayer(state)) > 0.3;
    const acted = state.player.hp < state.player.maxHp
      || state.projectiles.length > 0
      || state.enemies.length > 1
      || state.enemies[0].intent !== 'idle';
    if (!moved && !acted) inert.push(archetype);
  }
  assert.deepEqual(inert, [], `these archetypes do nothing: ${inert.join(', ')}`);
});

test('the shieldbearer advances behind its shield and bashes', () => {
  const state = solo('shield', 'shieldbearer', 6, 0, { blocked: true });
  tick(state, 1.5);
  assert.ok(gapToPlayer(state) < 5, `the shieldbearer must advance, gap ${gapToPlayer(state).toFixed(2)}`);
  const bashed = state.events.some((event) => event.type === 'attack-telegraph'
    && event.archetype === 'shieldbearer');
  assert.ok(bashed, 'the shieldbearer must telegraph a bash');
  const hpBefore = state.player.hp;
  tick(state, 2.5);
  assert.ok(state.player.hp < hpBefore, 'the bash must land on a player who stands still');
});

test('the gargoyle waits on its perch, then swoops and recovers', () => {
  const perched = solo('gargoyle-far', 'gargoyle', 15, 0);
  tick(perched, 1.5);
  assert.equal(perched.enemies[0].intent, 'perch', 'a distant gargoyle stays perched');
  assert.ok(gapToPlayer(perched) > 14, 'a perched gargoyle does not walk');

  const state = solo('gargoyle-near', 'gargoyle', 7, 0);
  tick(state, 0.4);
  assert.equal(state.enemies[0].intent, 'swoop', 'a close gargoyle swoops');
  const start = gapToPlayer(state);
  tick(state, 0.4);
  assert.ok(gapToPlayer(state) < start, 'the swoop must cover ground');
  tick(state, 1);
  assert.ok(state.player.hp < state.player.maxHp, 'the swoop must land a hit');
  tick(state, 1.2);
  assert.ok(['perch', 'recover'].includes(state.enemies[0].intent),
    `the gargoyle must fall back after the swoop, got ${state.enemies[0].intent}`);
});

test('the sorcerer casts a heavier bolt and kites a close player', () => {
  const state = solo('sorcerer', 'sorcerer', 9, 0);
  tick(state, 1.2);
  const bolt = state.projectiles.find((shot) => shot.source === 'enemy');
  assert.ok(bolt, 'the sorcerer must cast a projectile');
  assert.ok(bolt.damage > 10, `the spell must hit harder than the plain arrow, got ${bolt.damage}`);
  assert.ok(bolt.radius > 0.32, 'the spell bolt must be visually heavier than an arrow');

  const pressed = solo('sorcerer-kite', 'sorcerer', 3, 0);
  const start = gapToPlayer(pressed);
  tick(pressed, 1);
  assert.ok(gapToPlayer(pressed) > start, 'the sorcerer must back off when the player closes in');
});

test('the slime golem oozes in and engulfs', () => {
  const state = solo('slime', 'slimegolem', 5, 0);
  tick(state, 1.5);
  assert.ok(gapToPlayer(state) < 4.2, 'the slime golem must close in');
  tick(state, 2.5);
  assert.ok(state.player.hp < state.player.maxHp, 'the slime golem must deal damage');
});

test('the bomber rushes, fuses, and detonates without paying a kill reward', () => {
  const state = solo('bomber', 'bomber', 6, 0);
  tick(state, 0.6);
  assert.ok(gapToPlayer(state) < 5, 'the bomber must rush the player');
  tick(state, 1.2);
  const fuse = state.events.find((event) => event.type === 'attack-telegraph' && event.attack === 'detonate');
  assert.ok(fuse, 'the bomber must light a fuse');
  const goldBefore = state.player.gold;
  const xpBefore = state.player.xp;
  tick(state, 1.2);
  const detonated = state.events.find((event) => event.type === 'bomber-detonate');
  assert.ok(detonated, 'the bomber must detonate');
  assert.equal(state.enemies[0].dead, true, 'the blast consumes the bomber');
  assert.equal(state.player.gold, goldBefore, 'a self-detonation is not a kill reward');
  assert.equal(state.player.xp, xpBefore, 'a self-detonation grants no experience');
  assert.ok(state.player.hp < state.player.maxHp, 'the blast must hurt a player standing in it');
});

test('a bomber the player kills first still pays its reward', () => {
  const state = solo('bomber-kill', 'bomber', 6, 0, { hp: 1, maxHp: 1, xp: 30, gold: 14 });
  tick(state, 0.1);
  const goldBefore = state.player.gold;
  const xpBefore = state.player.xp;
  // Kill it through the bow, the way a player would from outside the blast.
  state.player.position = { x: 0, z: 0 };
  state.enemies[0].x = 8;
  state.enemies[0].z = 0;
  const fired = state.player.stamina > 0;
  assert.equal(fired, true);
  stepGame(state, { shoot: true }, 1 / 60);
  tick(state, 0.8);
  assert.equal(state.enemies[0].dead, true, 'the arrow must kill the bomber');
  assert.ok(state.player.gold > goldBefore, 'killing the bomber pays gold');
  assert.ok(state.player.xp > xpBefore || state.player.level > 1, 'killing the bomber pays experience');
});

test('a windup ring marks the attack it warns about, not the attacker reach', () => {
  const archer = solo('telegraph-archer', 'archer', 7, 0);
  tick(archer, 0.1);
  const shot = archer.enemies[0].windup;
  assert.ok(shot, 'the archer must telegraph its shot');
  assert.ok(shot.range >= 10, 'the archer needs ten units of reach');
  assert.ok(shot.telegraph <= 2,
    `an archer's warning ring must sit at the archer, got ${shot.telegraph}`);

  const caster = solo('telegraph-sorcerer', 'sorcerer', 9, 0);
  tick(caster, 0.3);
  assert.ok(caster.enemies[0].windup.telegraph <= 2,
    'a spell warning ring must not cover the arena');

  const bomber = solo('telegraph-bomber', 'bomber', 3, 0);
  tick(bomber, 0.3);
  const fuse = bomber.enemies[0].windup;
  assert.ok(fuse, 'the bomber must light a fuse');
  assert.ok(Math.abs(fuse.telegraph - 3.2) < 0.01,
    `the fuse ring must show the blast radius, got ${fuse.telegraph}`);
});
