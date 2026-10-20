import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET_DIR = path.join(ROOT, 'frontend/js/v3/apps/dungeon/assets/glb');
const REQUIRED = {
  'floor_tile.glb': ['FLOOR__tile', 'FLOOR__mosaic'],
  'wall_block.glb': ['WALL__ashlar', 'WALL__pilaster'],
  'arch_doorway.glb': ['ARCH__opening', 'ARCH__keystone'],
  'column.glb': ['COLUMN__shaft', 'COLUMN__capital'],
  'broken_column.glb': ['BROKEN_COLUMN__stump', 'BROKEN_COLUMN__rubble'],
  'stairs.glb': ['STAIRS__steps', 'STAIRS__rail'],
  'brazier.glb': ['BRAZIER__bowl', 'BRAZIER__ember'],
  'treasure_chest.glb': ['CHEST__lid', 'CHEST__lock'],
  'portal_ring.glb': ['PORTAL__ring', 'PORTAL__runes', 'PORTAL__vortex'],
  'hero_aizo.glb': ['HERO__helmet', 'HERO__cape', 'HERO__shield', 'HERO__sword'],
  'hero_knight.glb': ['HERO__helmet', 'HERO__cape', 'HERO__shield', 'HERO__sword'],
  'enemy_gargoyle.glb': ['GARGOYLE__wing', 'GARGOYLE__horn'],
  'enemy_slime_golem.glb': ['GARGOYLE__wing', 'GARGOYLE__horn'],
  'enemy_skeletal_archer.glb': ['ARCHER__skull', 'ARCHER__bow', 'ARCHER__quiver'],
  'enemy_armored_centurion.glb': ['CENTURION__helmet', 'CENTURION__shield', 'CENTURION__spear'],
  'enemy_cult_sorcerer.glb': ['SORCERER__hood', 'SORCERER__staff', 'SORCERER__ember'],
  'boss_marble_minotaur.glb': ['BOSS__horn', 'BOSS__labrys', 'BOSS__marble_body'],
  'weapon_sword.glb': ['WEAPON_SWORD__blade', 'WEAPON_SWORD__hilt'],
  'weapon_spear.glb': ['WEAPON_SPEAR__shaft', 'WEAPON_SPEAR__head'],
  'weapon_bow.glb': ['WEAPON_BOW__limb', 'WEAPON_BOW__string'],
  'projectile_arrow.glb': ['PROJECTILE_ARROW__shaft', 'PROJECTILE_ARROW__head'],
  'projectile_firebolt.glb': ['PROJECTILE_FIREBOLT__core', 'PROJECTILE_FIREBOLT__trail'],
};

function parseGlb(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB version');
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'declared GLB length');
  assert.ok(buffer.length >= 20, 'GLB has a JSON chunk');
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, 'first chunk is JSON');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trim());
}

function sceneNodeNames(json) {
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  const seen = new Set();
  const names = new Set();
  const visit = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    const node = json.nodes?.[index];
    assert.ok(node, `scene references node ${index}`);
    if (node.name) names.add(node.name);
    for (const child of node.children ?? []) visit(child);
  };
  roots.forEach(visit);
  return names;
}

test('production dungeon asset inventory is exact', async () => {
  const actual = (await readdir(ASSET_DIR)).filter((name) => name.endsWith('.glb')).sort();
  assert.deepEqual(actual, Object.keys(REQUIRED).sort());
});

test('every dungeon asset is a valid GLB with a nonempty default scene', async () => {
  for (const file of Object.keys(REQUIRED)) {
    const bytes = await readFile(path.join(ASSET_DIR, file));
    const json = parseGlb(bytes);
    assert.ok(json.scenes?.length, `${file}: scenes`);
    assert.ok(json.nodes?.length, `${file}: nodes`);
    assert.ok(json.meshes?.length, `${file}: meshes`);
    assert.ok(json.scenes[json.scene ?? 0].nodes?.length, `${file}: default scene roots`);
  }
});

test('assets expose gameplay semantic node names', async () => {
  for (const [file, requiredNames] of Object.entries(REQUIRED)) {
    const names = sceneNodeNames(parseGlb(await readFile(path.join(ASSET_DIR, file))));
    for (const name of requiredNames) assert.ok(names.has(name), `${file}: missing ${name}`);
  }
});

test('complete kit stays within the browser download budget', async () => {
  let total = 0;
  for (const file of Object.keys(REQUIRED)) total += (await stat(path.join(ASSET_DIR, file))).size;
  assert.ok(total > 100_000, `kit is suspiciously small (${total} bytes)`);
  assert.ok(total < 2_500_000, `kit exceeds 2.5 MB (${total} bytes)`);
});
