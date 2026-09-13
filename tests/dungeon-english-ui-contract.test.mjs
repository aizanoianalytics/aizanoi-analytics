import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression contract for Dungeon English UI: the public-facing language of
// the canonical gameplay runtime must stay English. The previous Dungeons
// round-trip left a small number of Turkish strings visible to the player
// (Mermer Gargoyle, Lejyoner Gladius'u, etc.). This test prevents that
// regression from quietly coming back while still allowing:
//
//   - historical / proper nouns (Aizanoi, Penkalas, Phrygian, Zeus, Macellum,
//     Marble Minotaur, etc.);
//   - internal IDs that drive save compatibility (hizli_saldiri, mermer_beden,
//     kritik_ogreti, etc.);
//   - source-code comments / log strings.
//
// The contract is enforced by scanning the canonical Dungeon source tree
// for known user-facing Turkish strings that have already been translated.

const dungeonRoot = '../frontend/js/v3/apps/dungeon';
const itemsPath = new URL('../frontend/js/v3/apps/dungeon/js/data/items.js', import.meta.url).pathname;
const enemiesPath = new URL('../frontend/js/v3/apps/dungeon/js/data/enemies.js', import.meta.url).pathname;
const skillsPath = new URL('../frontend/js/v3/apps/dungeon/js/data/skills.js', import.meta.url).pathname;
const aizoPath = new URL('../frontend/js/v3/apps/dungeon/js/entities/Aizo.js', import.meta.url).pathname;
const inventoryPath = new URL('../frontend/js/v3/apps/dungeon/js/scenes/InventoryScene.js', import.meta.url).pathname;
const levelsPath = new URL('../frontend/js/v3/apps/dungeon/js/data/levels.js', import.meta.url).pathname;
const blessingsPath = new URL('../frontend/js/v3/apps/dungeon/js/data/blessings.js', import.meta.url).pathname;

const enemies = readFileSync(enemiesPath, 'utf8');
const items = readFileSync(itemsPath, 'utf8');
const skills = readFileSync(skillsPath, 'utf8');
const aizo = readFileSync(aizoPath, 'utf8');
const inventory = readFileSync(inventoryPath, 'utf8');

test('enemy data names are English (no Mermer/Lejyoner/Keten)', () => {
  assert.ok(!/Mermer Gargoyle/.test(enemies), 'gargoyle name must be "Marble Gargoyle"');
  assert.ok(/Marble Gargoyle/.test(enemies), 'gargoyle name must be present in English');
  assert.ok(!/Mermer Minotaur/.test(enemies), 'marble minotaur name must be in English');
  assert.ok(/Marble Minotaur \(Mini Boss\)/.test(enemies), 'mini-boss name must be in English');
});

test('weapon and armor data names are English', () => {
  assert.ok(!/Lejyoner Gladius/.test(items), 'legionary gladius must not use Turkish apostrophe');
  assert.ok(/Legionary Gladius/.test(items), 'legionary gladius must be present in English');
  assert.ok(!/Keten Ayin Tunisi/.test(items), 'linen ritual tunic must not be in Turkish');
  assert.ok(/Linen Ritual Tunic/.test(items), 'linen ritual tunic must be present in English');
  // description text on armor item
  assert.ok(!/Hafif antik deri koruma/.test(items), 'light leather armor description must not be in Turkish');
  assert.ok(/Light ancient leather armor/.test(items), 'light leather armor description must be in English');
});

test('player-facing skill tree names are English', () => {
  assert.ok(!/Dorik Kalkan/.test(skills), 'Doric Kalkan must be English in skills.js');
  assert.ok(/Doric Aegis/.test(skills), 'Doric Aegis skill must be present in English');
});

test('player-facing floating combat text is English', () => {
  // The shield-absorption floating combat text was "kalkan" — must now be "shield".
  assert.ok(!/-?\$\{absorbed\} kalkan/.test(aizo), 'shield absorption text must not be in Turkish');
  assert.ok(/-?\$\{absorbed\} shield/.test(aizo), 'shield absorption text must be in English');
});

test('inventory panel labels are English', () => {
  assert.ok(!/AIZO STATLARI/.test(inventory), 'inventory stats header must not be in Turkish');
  assert.ok(/AIZO STATS/.test(inventory), 'inventory stats header must be in English');
  assert.ok(!/Seviye:/.test(inventory), '"Level:" must not be in Turkish');
  assert.ok(/Level:/.test(inventory), '"Level:" must be present in English');
  assert.ok(!/Can Yenileme/.test(inventory), '"HP Regen" must not be in Turkish');
  assert.ok(/HP Regen:/.test(inventory), '"HP Regen:" must be in English');
  // The "Yetenekler" / "Macellum" buttons under the relic slots must be English.
  assert.ok(!/⚡ Yetenekler/.test(inventory), 'skills shortcut must not be in Turkish');
  assert.ok(!/🏪 Macellum/.test(inventory), 'shop shortcut must not be in Turkish');
  assert.ok(/Skills/.test(inventory), 'skills shortcut must be present');
  assert.ok(/Shop/.test(inventory), 'shop shortcut must be present');
});

test('historical proper nouns and internal IDs are preserved', () => {
  // The Macellum Macellum (Roman market in Aizanoi) is a proper noun; the
  // contract leaves it alone. Same for the save-migration blessing IDs.
  const blessings = readFileSync(blessingsPath, 'utf8');
  assert.ok(/Macellum/.test(readFileSync(levelsPath, 'utf8')),
    'chapter name "Macellum Trade Vaults" must remain a proper noun');
  // Internal IDs must not be renamed (save compatibility).
  assert.ok(/id: 'hizli_saldiri'/.test(blessings), 'hizli_saldiri ID must remain');
  assert.ok(/id: 'mermer_beden'/.test(blessings), 'mermer_beden ID must remain');
  assert.ok(/id: 'kritik_ogreti'/.test(blessings), 'kritik_ogreti ID must remain');
});
