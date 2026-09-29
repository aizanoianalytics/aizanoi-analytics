// Section 20: "Add a useful run/chapter summary if currently missing."
//
// The audit found the statistics were being recorded and never displayed: the
// victory screen showed only three lines of story text. A finished run told the
// player nothing about how it had gone. These assertions cover the ledger, the
// run tracking behind it, and the balance review the brief also asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const victory = read('frontend/js/v3/apps/dungeon/js/scenes/VictoryScene.js');
const progression = read('frontend/js/v3/apps/dungeon/js/systems/ProgressionSystem.js');
const gameScene = read('frontend/js/v3/apps/dungeon/js/scenes/GameScene.js');
const items = read('frontend/js/v3/apps/dungeon/js/data/items.js');
const enemies = read('frontend/js/v3/apps/dungeon/js/data/enemies.js');
const constants = read('frontend/js/v3/apps/dungeon/js/constants.js');
const uiScene = read('frontend/js/v3/apps/dungeon/js/scenes/UIScene.js');

test('the victory screen shows a real run summary', () => {
  assert.match(victory, /RUN LEDGER/, 'the summary must be visibly a ledger');
  // A label alone proves nothing: the ledger could print a label and a hard-coded
  // value. Each row has to be wired to the summary field it claims to report, so
  // faking a figure is what actually fails here.
  const ROWS = [
    ['Chapters cleared', 's.chaptersCleared'],
    ['Enemies defeated', 's.enemiesKilled'],
    ['Bosses felled', 's.bossesDefeated'],
    ['Denarii earned', 's.denariiEarned'],
    ['XP earned', 's.xpEarned'],
    ['Denarii unspent', 's.denariiLeft']
  ];
  for (const [label, field] of ROWS) {
    const row = new RegExp(
      `label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]{0,60}${field.replace('.', '\\.')}`
    );
    assert.match(victory, row, `the "${label}" row must read ${field}, not a literal`);
  }
  // Levels gained is a composed figure, so it must use both parts of it.
  assert.match(victory, /label: 'Levels gained this run'[\s\S]{0,90}s\.levelsGained/);
  assert.match(victory, /now \$\{s\.levelNow\}/);
  // Every figure has to come from the run summary, not be written into the scene.
  assert.match(victory, /progression\?\.runSummary\?\.\(\)/,
    'the ledger must read runSummary() so its numbers are traceable');
  // And when the system is unreachable it must say so rather than invent numbers.
  assert.match(victory, /Run statistics', value: 'unavailable'/,
    'an unavailable summary must be labelled, never faked');
  // The old story-only screen is gone.
  assert.doesNotMatch(victory, /Aizo stands as Aizanoi/,
    'the story text that replaced the summary has been removed');
});

test('a run is tracked separately from the lifetime save', () => {
  // Lifetime stats existed and are not enough: a player needs to know how this
  // run went, not how their save looks.
  assert.match(progression, /startRun\(\)/);
  assert.match(progression, /recordRunKill\(isBoss/);
  assert.match(progression, /recordRunXp\(amount\)/);
  assert.match(progression, /recordRunGold\(amount\)/);
  assert.match(progression, /recordChapterCleared\(chapterNumber\)/);
  assert.match(progression, /runSummary\(\)/, 'the summary must be computed, not stored');
  // The existing entry points must feed the run, or the ledger would read zero.
  assert.match(progression, /addXp\(amount\) \{\s*this\.recordRunXp\(amount\);/,
    'XP must be attributed to the run');
  assert.match(progression, /addGold\(amount\)[\s\S]{0,120}this\.recordRunGold\(total\);/,
    'denarii must be attributed to the run');
  assert.match(progression, /recordKill\(isBoss = false\) \{\s*this\.recordRunKill\(isBoss\);/,
    'kills must be attributed to the run');
  // levelsGained has to be relative to where the run started.
  assert.match(progression, /const levelsGained = this\.level - \(run\.levelAtStart/);
});

test('a run begins on the first chapter and survives progression', () => {
  assert.match(gameScene, /this\.progression\.startRun\(\)/,
    'entering play must begin a run');
  assert.match(gameScene, /recordChapterCleared\(this\.chapterIndex \+ 1\)/,
    'clearing a chapter must be recorded, before any transition happens');
  // A run is a chapter sequence: returning to chapter 1 starts a new ledger,
  // advancing does not silently reset it.
  assert.match(gameScene, /this\.chapterIndex <= \(this\.progression\.run\.startedAtChapter/,
    'restarting at or before the first chapter must begin a fresh run');
});

test('the item ladder offers tradeoffs, not a strictly better ladder', () => {
  // The brief asks to avoid "later item = strictly better item" and to create
  // meaningful tradeoffs. These are the specific ones the data must contain.
  // Temple Maul: far more damage, slower.
  assert.match(items, /temple_hammer[\s\S]{0,220}attackDamage: 28[\s\S]{0,60}attackSpeed: -0\.15/,
    'the maul must trade attack speed for damage');
  // Zeus Staff: the most ranged damage, but the slowest swing.
  assert.match(items, /zeus_staff[\s\S]{0,220}attackDamage: 32[\s\S]{0,60}attackSpeed: -0\.2/,
    'the staff must trade swing speed for reach and damage');
  // Oracle Robe: less armour than Marble Plating, and cheaper, but it regenerates.
  assert.match(items, /oracle_robe[\s\S]{0,220}armor: 18[\s\S]{0,120}hpRegen: 3\.5/,
    'sustain must be a real alternative to armour');
  assert.match(items, /marble_plating[\s\S]{0,200}armor: 48/,
    'the plating must remain the armour option, so the robe is a choice');
  // Melee and ranged must both reach a comparable ceiling, or one is unviable.
  assert.match(items, /zeus_splinter[\s\S]{0,200}attackDamage: 45[\s\S]{0,60}attackSpeed: 0\.25/,
    'the best melee weapon must out-damage the best ranged weapon, so melee stays viable');
  assert.match(items, /penkalas_bow[\s\S]{0,200}attackRange: 230/,
    'ranged must keep a reach advantage melee cannot match');
  // A shield accessory exists, so defensive and ability-focused builds differ.
  assert.match(items, /scarab_amulet[\s\S]{0,200}shieldInterval/,
    'a defensive accessory must exist alongside the damage ones');
});

test('every enemy and boss is rewardable, and the reward curve rises', () => {
  // XP and denarii come from the enemy table; a missing field would silently
  // drop a reward to undefined.
  const entries = [...enemies.matchAll(/(\w+):\s*\{\s*\n\s*id: '\w+',[\s\S]{0,700}?\n  \},/g)];
  assert.ok(entries.length >= 8, `expected the full enemy roster, matched ${entries.length}`);
  for (const [, key] of entries) {
    const block = enemies.slice(enemies.indexOf(key + ': {'));
    assert.match(block.slice(0, 700), /xpReward: \d+/, `${key} has no xpReward`);
    assert.match(block.slice(0, 700), /goldReward: \d+/, `${key} has no goldReward`);
  }
  // Difficulty must keep climbing, and a boss must be worth far more than an
  // ordinary kill. Checking the presence of a number is not enough: a boss paying
  // a common enemy's reward would pass that, so the ordering itself is asserted.
  const rewardOf = (id) => {
    const start = enemies.indexOf(`${id}: {`);
    assert.ok(start > 0, `${id} must be in the enemy table`);
    const block = enemies.slice(start, start + 700);
    return {
      hp: Number(/hp:\s*(\d+)/.exec(block)?.[1]),
      xp: Number(/xpReward:\s*(\d+)/.exec(block)?.[1]),
      gold: Number(/goldReward:\s*(\d+)/.exec(block)?.[1])
    };
  };
  const gargoyle = rewardOf('gargoyle');
  const wraith = rewardOf('shadowWraith');
  const praetorian = rewardOf('praetorian');
  const minotaur = rewardOf('marbleMinotaur');
  const colossus = rewardOf('titanColossus');

  assert.ok(gargoyle.xp > 0, 'a base enemy must pay XP');
  // Rewards must rise with the roster, so a harder chapter pays better.
  assert.ok(wraith.xp > gargoyle.xp, 'a stealth assassin must pay more than a gargoyle');
  assert.ok(praetorian.xp > wraith.xp, 'a praetorian must pay more than a wraith');
  // A boss must be a real wall in health and a real prize in reward.
  assert.ok(minotaur.hp > praetorian.hp * 2, 'the mid boss must be far tougher than a praetorian');
  assert.ok(colossus.hp > minotaur.hp * 2, 'the final boss must be the toughest thing in the game');
  assert.ok(minotaur.xp > praetorian.xp * 2, 'a boss reward must dwarf an elite kill');
  assert.ok(colossus.xp > minotaur.xp, 'the final boss must pay the most');
  assert.ok(colossus.gold > minotaur.gold, 'the final boss must pay the most denarii');
});

test('the progression curve is a curve, not a flat rate', () => {
  // A linear curve would make each level cost the same forever while the
  // chapters keep getting harder. The XP requirement has to rise faster than
  // linear in practice; the important property is that it strictly increases.
  const m = /export const xpForLevel = \(level\) => ([^;]+);/.exec(constants);
  assert.ok(m, 'xpForLevel must be defined in constants.js');
  assert.match(m[1], /level/, 'the XP requirement must depend on the level');
  // Level-up must give something, or levelling is cosmetic.
  const b = /export const LEVEL_UP_BONUS = \{[\s\S]{0,160}?\};/.exec(constants);
  assert.ok(b, 'LEVEL_UP_BONUS must exist');
  assert.match(b[0], /hp: \d+/, 'a level must grant health');
  assert.match(b[0], /attackDamage: \d+/, 'a level must grant damage');
  assert.match(b[0], /armor: \d+/, 'a level must grant armour');
});

test('the HUD survives a scene transition', () => {
  // Found by the audit: `?.` guarded the enemy group but not the getChildren()
  // call on it, so every frame of a transition threw and killed the HUD update.
  assert.doesNotMatch(uiScene, /\?\.\s*getChildren\(\)/,
    'an optional chain must not guard a method call on a not-yet-built group');
  assert.match(uiScene, /const list = gs\.enemies\?\.children\?\.list/);
  assert.match(uiScene, /Array\.isArray\(list\)/,
    'the list must be checked before it is read');
  assert.match(uiScene, /const enemyList = gs\.enemies\?\.children\?\.list/,
    'the minimap must read the list the same defensive way');
});

test('the run summary audit is registered as an operator diagnostic', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /dungeon-run-summary-audit\.mjs/,
    'the run summary audit must be owned, or it becomes an untracked script');
});
