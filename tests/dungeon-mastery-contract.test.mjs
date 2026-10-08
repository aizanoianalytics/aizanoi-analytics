import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract for the dungeon mastery round. These pin the *player-visible*
// behaviours that are missing today, in the canonical module tree.
const root = new URL('../frontend/js/v3/apps/dungeon/js/', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');

test('room roles are functional, not just labels: shrine heals, treasure rewards, merchant sells', () => {
  const game = read('scenes/GameScene.js');
  // A shrine must be interactable and restore health.
  assert.match(game, /interactShrine|shrine/i, 'shrine interaction must exist');
  assert.match(game, /shrineHeal|heal\(/, 'a shrine must heal the player');
  // A treasure vault must hand the player a reward.
  assert.match(game, /treasure/i, 'treasure rooms must be handled');
  // A merchant camp must open the shop (it is the only other shop surface).
  assert.match(game, /merchant/i, 'merchant rooms must be handled');
});

test('an interact key opens the merchant and the shrine, with an on-screen prompt', () => {
  const game = read('scenes/GameScene.js');
  // The interaction must be a key press, not only proximity to base.
  assert.match(game, /interactPrompt|promptInteract/, 'there must be a visible interact prompt');
  assert.match(game, /addKeys\([^)]*E[^)]*\)|wasd\.E/, 'E is the interact key');
});

test('player dash exists with cooldown, i-frames and a trail', () => {
  const aizo = read('entities/Aizo.js');
  assert.match(aizo, /dash\s*\(/, 'Aizo must implement dash()');
  assert.match(aizo, /dashCooldown/, 'dash must own a cooldown');
  assert.match(aizo, /isInvulnerable\s*=\s*true/, 'dash grants i-frames');
  assert.match(aizo, /dashTimer|dashUntil/, 'dash must be time-boxed');
});

test('the ability bar surfaces the dash cooldown', () => {
  const ui = read('scenes/UIScene.js');
  assert.match(ui, /abilitySlots\.dash|key:\s*'dash'/, 'the HUD needs a dash slot');
});

test('a boss health bar shows in the HUD for the duration of the fight', () => {
  const ui = read('scenes/UIScene.js');
  assert.match(ui, /bossBar|bossHp/, 'UIScene must own a boss bar');
  assert.match(ui, /isBoss/, 'the bar must select the boss entity');
});

test('the three new archetypes are actually spawned by the chapters that declare them', () => {
  const levels = read('data/levels.js');
  const enemies = read('data/enemies.js');
  // The roster and the spawner must agree on the new ids: a type that exists in
  // the roster but never appears in a chapter mix is unreachable dead code.
  for (const id of ['cultAcolyte', 'stoneGolem', 'ferryman']) {
    assert.match(enemies, new RegExp(`^\\s{2}${id}:`, 'm'), `${id} must exist in the roster`);
    assert.match(levels, new RegExp(`'${id}'`), `a chapter must declare ${id} in its enemy mix`);
  }
});

test('new behaviour hooks run: summoner summons, golem slams, flanker circles', () => {
  const enemy = read('entities/Enemy.js');
  assert.match(enemy, /updateSummoner/, 'summoner behaviour must be handled');
  assert.match(enemy, /updateGroundSlam/, 'the golem must slam');
  assert.match(enemy, /updateFlanker/, 'the flanker must circle');
});

// A behaviour that is timed off the frame loop only plays at the speed of the
// machine rendering it. Every timed behaviour must be measured against the
// scene clock (`time`), not a countdown of `delta`, or the same fight becomes
// a different fight depending on FPS.
test('timed behaviours run on the scene clock, not on frame countdowns', () => {
  const enemy = read('entities/Enemy.js');
  assert.match(enemy, /nextSummonAt\s*=\s*time\s*\+\s*cd/, 'the summoner must schedule on the clock');
  assert.match(enemy, /o\.until\s*=\s*time\s*\+\s*orbitMs/, 'the orbit must be a deadline, not a countdown');
  assert.doesNotMatch(enemy, /this\.summonTimer\s*-=\s*delta/, 'no summoner countdown left');
  assert.doesNotMatch(enemy, /o\.timer\s*-=\s*delta/, 'no orbit countdown left');
});

test('summoned enemies are capped so a summoner cannot flood the arena', () => {
  const enemy = read('entities/Enemy.js');
  assert.match(enemy, /MAX_SUMMON|summonCap|activeCount/, 'summoning must respect an active-enemy cap');
});

test('enemy area attacks are telegraphed with a ring before they land', () => {
  const game = read('scenes/GameScene.js');
  const enemy = read('entities/Enemy.js');
  assert.match(game, /spawnTelegraphRing|telegraphRing/, 'a telegraph ring must be drawn');
  assert.match(enemy, /windup/, 'the attacker must have a windup state');
});
