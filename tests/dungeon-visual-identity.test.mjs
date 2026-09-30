// Section 21: "chapter palettes" and "The game should look intentionally
// authored."
//
// Every chapter declared a palette and nothing read it: the floor, the walls,
// the light, the portal and the decoration were identical in all ten chapters,
// so Necropolis Labyrinth and Throne of Storms were the same room with
// different enemies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const gameScene = read('frontend/js/v3/apps/dungeon/js/scenes/GameScene.js');
const levels = read('frontend/js/v3/apps/dungeon/js/data/levels.js');
const levelSystem = read('frontend/js/v3/apps/dungeon/js/systems/LevelSystem.js');

test('the chapter palette is actually applied, not just declared', () => {
  assert.match(gameScene, /applyChapterPalette\(\)/,
    'the palette must be applied during the build');
  // It must be called from the build, not merely defined. The call carries
  // leading whitespace inside the method, so anchor on the statement itself.
  assert.match(gameScene, /^\s+this\.applyChapterPalette\(\);$/m,
    'and it must be called, not merely defined');
  // The palette has to reach the surfaces a player actually looks at.
  assert.match(gameScene, /this\.floorLayer\?\.setTint\(this\.appliedFloorTint\)/,
    'the floor must take the chapter tint');
  assert.match(gameScene, /this\.wallLayer\?\.setTint\(this\.appliedWallTint\)/,
    'the walls must take the chapter tint');
  assert.match(gameScene, /this\.appliedFloorTint = this\.mixToward\(pal\.floor, pal\.accent/,
    'the floor tint must be mixed toward the accent');
  assert.match(gameScene, /this\.appliedWallTint = this\.mixToward\(pal\.wall, pal\.fog/,
    'the wall tint must be mixed toward the fog');
  assert.match(gameScene, /mixToward\(a, b, t\)/, 'the blend helper must exist');
  // The applied values are recorded, so QA reads what the game actually did
  // rather than recomputing the intent and agreeing with itself.
  assert.match(gameScene, /this\.appliedFloorTint =/);
  assert.match(gameScene, /this\.appliedWallTint =/);
  // The camera background takes the chapter colour too.
  assert.match(gameScene, /cameras\.main\?\.setBackgroundColor\?\.\(pal\.fog\)/);
});

test('the chapter wash is behind the actors, not over them', () => {
  // A palette is a change of place, not a change of visibility. The earlier
  // version put a 55% fog rectangle at depth 90, which is above the player, the
  // enemies and every effect: that is not a chapter palette, it is a broken game.
  const haze = /chapterHaze = this\.add[\s\S]{0,400}?\.setDepth\(([\d.]+)\)/.exec(gameScene);
  assert.ok(haze, 'the chapter wash must exist with a depth');
  const hazeDepth = Number(haze[1]);
  assert.ok(hazeDepth > 0 && hazeDepth < 5, `the wash must sit just above the tilemap, not over the game (depth ${hazeDepth})`);
  // The tilemap has to be explicitly at 0 so "just above" means something.
  assert.match(gameScene, /this\.floorLayer\?\.setDepth\(0\)/);
  assert.match(gameScene, /this\.wallLayer\?\.setDepth\(0\)/);
  // The accent lift comes after the wash, still under the actors.
  const accent = /chapterLightOverlay = this\.add[\s\S]{0,400}?\.setDepth\(([\d.]+)\)/.exec(gameScene);
  assert.ok(accent, 'the accent lift must exist with a depth');
  assert.ok(Number(accent[1]) > hazeDepth, 'the accent lift must sit in front of the wash');
  assert.ok(Number(accent[1]) < 5, 'but still under the actors');
  // And the alphas must be recorded so the audit can toggle them back on.
  assert.match(gameScene, /this\.chapterWashAlpha = 0\.55/);
  assert.match(gameScene, /this\.chapterAccentAlpha = 0\.16/);
});

test('Phaser 3.80 has no camera fog, so none is used', () => {
  // Camera.setFog was removed in Phaser 3.70. Calling it would be a silent no-op,
  // and the depth cue it was meant to provide would simply be missing.
  assert.doesNotMatch(gameScene, /cam\.setFog\(|cameras\.main\.setFog\(/,
    'the game must not call an API this Phaser build does not have');
  assert.match(gameScene, /3\.80 removed Camera\.setFog/,
    'the reason should be recorded so it is not reintroduced');
});

test('the portal and the decoration carry the chapter accent', () => {
  // The portal is the one thing a player must always find, and the mosaic
  // fragments are the decoration a player actually looks at.
  assert.match(gameScene, /pg\.setTint\(this\.chapterPalette\.accent\)/,
    'the portal glow must take the chapter accent');
  assert.match(gameScene, /d\.setTint\(this\.chapterPalette\?\.accent \?\? 0xd8c18d\)/,
    'the mosaic decals must take the chapter accent, with a fallback');
  // The glow is kept as a handle so QA can read the applied tint.
  assert.match(gameScene, /this\.portalGlow = pg;/,
    'the portal glow must be reachable for measurement');
  // Neither may be pinned to a constant.
  assert.doesNotMatch(gameScene, /pg\.setTint\(0xd8c18d\)/,
    'the portal must not be pinned to a fixed colour');
});

test('all eleven palettes are distinct, and the endless chapter has one', () => {
  // The endless mode is a pantheon, not a chapter; it gets its own identity
  // rather than borrowing one, so the two can never drift apart.
  const palettes = [...levels.matchAll(/palette: \{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(palettes.length, 11, `expected 11 palettes, found ${palettes.length}`);
  const names = palettes.map((p) => /name: '([\w-]+)'/.exec(p)?.[1]);
  assert.equal(new Set(names).size, 11, `palette names must be distinct: ${names.join(', ')}`);
  const floors = palettes.map((p) => /floor: (0x[0-9a-f]+)/.exec(p)?.[1]);
  assert.equal(new Set(floors).size, 11, `every chapter needs its own floor colour`);
  // Each palette must be complete: a chapter missing an accent would fall back
  // to the old constant tint and quietly lose its identity.
  for (const p of palettes) {
    assert.match(p, /floor: 0x/, 'a palette must define floor');
    assert.match(p, /wall: 0x/, 'a palette must define wall');
    assert.match(p, /accent: 0x/, 'a palette must define accent');
    assert.match(p, /fog: 0x/, 'a palette must define fog');
  }
});

test('the palette reaches the generator, so the audit can read it back', () => {
  assert.match(levelSystem, /this\.palette = levelConfig\.palette/);
  assert.match(levelSystem, /palette: this\.palette/,
    'the generated level must carry the palette forward');
});

test('the visual identity audit is registered and measures each layer', () => {
  const audit = read('tests/dungeon-visual-identity-audit.mjs');
  assert.match(read('tests/test-ownership.test.mjs'), /dungeon-visual-identity-audit\.mjs/,
    'the visual identity audit must be owned');
  // The audit must measure the palette's own effect, per mechanism. A single
  // summed number let four separate mutations through, because whichever layer
  // still worked carried the total.
  assert.match(audit, /hazeShift/);
  assert.match(audit, /accentShift/);
  assert.match(audit, /tintShift/);
  assert.match(audit, /noHaze/);
  assert.match(audit, /noTint/);
  // And it must read the frame inside a frame callback: the drawing buffer is
  // not preserved, so a read outside rAF returns black regardless of the scene.
  assert.match(audit, /requestAnimationFrame/);
  // It must not compare chapters to each other: every chapter has a different
  // map, enemy set and camera, so two chapters always differ on screen whether
  // or not a palette is applied.
  assert.doesNotMatch(audit, /distinctFrames/,
    'the confounded chapters-versus-chapters comparison must be gone');
});
