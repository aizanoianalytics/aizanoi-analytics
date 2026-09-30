// Section 22: "Dungeon — controls, mobile and accessibility".
//
// The gap this records, found by the audit that sits next to it:
//
//   gamepad support did not exist; the camera was shaken through fourteen direct
//   Phaser calls in three files with no setting behind any of them; there was a
//   mute and a hardcoded gain but no volume control; the four settings the game
//   read had no UI at all; and a winding-up boss had no visual channel for a
//   player playing with the sound off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const gameScene = read('frontend/js/v3/apps/dungeon/js/scenes/GameScene.js');
const aizo = read('frontend/js/v3/apps/dungeon/js/entities/Aizo.js');
const enemy = read('frontend/js/v3/apps/dungeon/js/entities/Enemy.js');
const audio = read('frontend/js/v3/apps/dungeon/js/systems/AudioManager.js');
const settings = read('frontend/js/v3/apps/dungeon/js/systems/SettingsSystem.js');
const access = read('frontend/js/v3/apps/dungeon/js/systems/AccessibilitySystem.js');
const gamepad = read('frontend/js/v3/apps/dungeon/js/systems/GamepadSystem.js');
const options = read('frontend/js/v3/apps/dungeon/js/scenes/OptionsScene.js');
const menu = read('frontend/js/v3/apps/dungeon/js/scenes/MenuScene.js');
const main = read('frontend/js/v3/apps/dungeon/js/main.js');

test('every screen shake goes through the accessible helper', () => {
  // A shake is only reducible if it is reachable. Fourteen direct calls across
  // three files cannot each be wired individually without one being missed, so
  // there is no direct call left at all.
  for (const [name, src] of [['GameScene', gameScene], ['Aizo', aizo], ['Enemy', enemy]]) {
    assert.doesNotMatch(src, /cameras\.main\.shake\(|cameras\?\.main\?\.shake\?\.\(|cam\.shake\(/,
      `${name} still calls Phaser's shake directly`);
  }
  // And the helper genuinely respects the setting, rather than scaling it down:
  // a shake at 0.004 is still motion.
  assert.match(access, /if \(reducedMotionActive\(\)\) return;/);
  // The OS preference counts too: a player who asked their system to reduce
  // motion has already answered the question.
  assert.match(access, /prefers-reduced-motion: reduce/);
  assert.match(gameScene, /import \{[^}]*shakeCamera[^}]*\} from '\.\.\/systems\/AccessibilitySystem\.js'/);
  assert.match(aizo, /import \{[^}]*shakeCamera/);
  assert.match(enemy, /import \{[^}]*shakeCamera[^}]*\}/);
});

test('the settings the game reads are real preferences with defaults', () => {
  for (const key of ['reducedShake', 'nonAudioTelegraphs', 'highContrast', 'uiScale', 'masterVolume']) {
    assert.match(settings, new RegExp(`\\b${key}:`), `SettingsSystem must define ${key}`);
  }
  // And they are loaded through the shared loader, not a private key.
  assert.match(access, /import \{ loadSettings, saveSettings \} from '\.\/SettingsSystem\.js'/);
});

test('there is a volume control, not only a mute', () => {
  assert.match(audio, /setVolume\(v\)/);
  assert.match(audio, /getVolume\(\)/);
  assert.match(audio, /applyVolume\(\)/);
  // The preference has to reach the graph, otherwise a volume slider that changes
  // nothing is worse than no slider.
  assert.match(audio, /this\.masterGain\.gain\.setValueAtTime\(\s*this\.isMuted \? 0 : this\.sfxVolume/);
  // And mute and volume must not disagree with each other.
  assert.match(audio, /this\.applyVolume\(\);\s*\n\s*return this\.isMuted;/);
  // The stored value is read, so the control survives a reload.
  assert.match(audio, /loadSettings\(\)\.masterVolume/);
});

test('the options screen is reachable and fully keyboard operable', () => {
  // Reachable: a settings screen nobody can open is not a setting.
  assert.match(menu, /Options & accessibility/);
  assert.match(menu, /scene\.start\('OptionsScene', \{ from: 'MenuScene' \}\)/);
  // Registered and loaded.
  assert.match(main, /import\('\.\/scenes\/OptionsScene\.js'\)/);
  assert.match(main, /^\s*OptionsScene,$/m);
  // Keyboard operable: a stepper, not a drag target, because a drag target
  // cannot be operated without a mouse.
  assert.match(options, /kind: 'step'/);
  assert.match(options, /this\.k = \{/);
  assert.match(options, /JustDown\(k\.space\)/);
  assert.match(options, /JustDown\(k\.enter\)/);
  assert.match(options, /JustDown\(k\.esc\)/);
  // The keys are created once. addKey() in the update loop allocated a new key
  // every frame, which leaks and loses the pressed state JustDown needs.
  // The reads have to be in the scene's own update(), not a scene 'update'
  // listener: Phaser's input plugin updates before update() and after a scene
  // listener fires, so JustDown there is a frame stale and drops a fast tap.
  assert.match(options, /^  update\(\) \{/m);
  assert.doesNotMatch(options, /this\.events\.on\('update'/,
    'keyboard state must be read in update(), not an update listener');
  assert.doesNotMatch(options.split('update() {')[1] || '', /addKey\(/,
    'no key may be allocated inside the update loop');
  // Every preference the game reads is offered.
  for (const label of ['Reduced screen shake', 'Non-audio telegraphs', 'Readable contrast', 'Text size', 'Volume']) {
    assert.ok(options.includes(label), `the options screen must offer "${label}"`);
  }
});

  // Regression: OptionsScene and UIScene both called the text helpers that create()
  // defined, from a method of their own, and threw ReferenceError on load. The
  // helpers have to live at class scope.
  assert.match(options, /\n  textStyle\(\)/,
    'the text helpers must be a method of the class, not a closure inside create()');
  assert.doesNotMatch(options, /class OptionsScene[\s\S]*?textStyle\(size, color\)\s*\{[\s\S]*?\n  \}/,
    'textStyle must be a method, not a closure inside create()');
  assert.match(read('frontend/js/v3/apps/dungeon/js/scenes/UIScene.js'),
    /\n  textStyle\(\)/);
  // Regression: render() wrote the new value but never redrew the label at the
  // new size, so a text-size control changed nothing on screen.
  assert.match(options, /for \(const t of this\._labels \|\| \[\]\) \{[\s\S]{0,200}setFontSize\(/,
    'render() must restyle the registered labels when the text size changes');
test('a critical cue has a non-audio channel', () => {
  assert.match(enemy, /nonAudioTelegraphsActive\(\)/);
  // It is a shape above the boss, not text scrolled across it, so it stays
  // readable at any UI scale.
  assert.match(enemy, /this\.scene\.add\s*\n\s*\.triangle\(/);
  assert.match(enemy, /telegraphMark/);
  // And it must not outlive the enemy: the mark belongs to the scene, not the
  // sprite, so it would otherwise hang in the next chapter's room.
  assert.match(enemy, /die\(\)\s*\{[\s\S]{0,400}telegraphMark\.destroy\(\)/);
  assert.match(enemy, /!want && this\.telegraphMark/);
  // Regression: the teardown used to sit INSIDE the preference check, so turning
  // the setting off skipped the whole block and left the mark already on screen.
  // The destroy has to be reachable with the preference off.
  assert.match(enemy, /const want = telegraphsWanted && \(committed/,
    'the telegraph teardown must not be gated by the preference itself');
  assert.doesNotMatch(enemy, /if \(nonAudioTelegraphsActive\(\)\) \{\s*\n\s*const committed/,
    'gating the whole telegraph block on the preference leaves a stale mark on screen');
});

test('the gamepad reader maps a standard pad and cannot stick', () => {
  assert.match(gamepad, /DEADZONE/);
  assert.match(gamepad, /d\(15\) - d\(14\)/);
  assert.match(gamepad, /d\(13\) - d\(12\)/);
  // Edge-triggered, so a held button is one action and not sixty per second.
  assert.match(gamepad, /pressed\[name\] = down && !this\.prev\[name\]/);
  // Movement is wired, and it comes before the keyboard: a player holding a
  // stick forward and pressing no key at all should move.
  assert.match(aizo, /padIntent\.move\.x !== 0/);
  assert.ok(aizo.indexOf('padIntent.move') < aizo.indexOf('touchControls.isActive'),
    'the gamepad must be consulted before the touch joystick');
  // Actions are OR-ed with the keyboard, not switched: both are live at once.
  assert.match(gameScene, /padDown\('attack'\)/);
  assert.match(gameScene, /padDown\('secondary'\)/);
  assert.match(gameScene, /padDown\('pause'\)/);
  assert.match(gameScene, /new GamepadInput\(\)/);
});

test('the accessibility audit is registered and checks behaviour, not text', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /dungeon-accessibility-audit\.mjs/);
  const audit = read('tests/dungeon-accessibility-audit.mjs');

  // The shake is measured as movement. cam.shake() in this Phaser build silently
  // does nothing -- the camera effects live in an FX pipeline it does not have --
  // so a scroll- or midPoint-based probe reported "no movement" whichever way the
  // preference went, and the measurement could not fail.
  assert.match(audit, /shakeCamera\(sc,\s*300,\s*0\.02\)/);
  assert.match(audit, /shakeOff\.framesMoved === 0/);
  assert.match(audit, /__aizanoiShakeOffset/);
  assert.doesNotMatch(audit, /cam\.midPoint/,
    'midPoint does not move in this build; the shake writes its own offset');
  assert.doesNotMatch(audit, /shakeOff\.moved === 0/,
    'the confounded measurement must be gone');

  // The gain is read off the running graph, after the audio clock has had a
  // quantum to apply the scheduled value.
  assert.match(audit, /masterGain\?\.gain\?\.value/);

  // Keys are HELD across a frame boundary. Phaser clears just-pressed at the top
  // of each frame, so a sub-frame synthetic press is lost and a working screen
  // reads as broken -- which is exactly what a fixed sleep produced.
  assert.match(audit, /const hold = async \(page, key\)/);
  assert.match(audit, /loop\.frame/);
  assert.doesNotMatch(audit, /page\.keyboard\.press\(/,
    'a sub-frame keypress never becomes a JustDown; the audit must hold the key');

  // The rows are reached by label, so the test does not depend on how many
  // keypresses the harness manages to deliver.
  assert.match(audit, /if \(label === 'Non-audio telegraphs'\) break;/);
  assert.match(audit, /if \(sizeRow === 'Text size'\) break;/);

  // One module instance. A dynamic import inside a waitForFunction callback runs
  // on every poll and can hand back a second module record -- a different
  // in-memory copy of the settings the scene writes to, so a working toggle
  // read as a no-op.
  assert.match(audit, /const installReaders = \(page\)/);
  assert.match(audit, /globalThis\.__dungeon/);

  // Phaser stores group members in a Set, so an array check never passes.
  assert.doesNotMatch(audit, /enemies\?\.children\?\.list/);
  assert.match(audit, /getChildren\?\.\(\)/);

  // The boss is found the way the game finds it: config.boss, and an isBoss flag
  // on the enemy. A guess at an isBoss key in the level data matched nothing.
  assert.match(audit, /l\.boss/);
  assert.match(audit, /e\?\.isBoss/);
  assert.doesNotMatch(audit, /e\?\.type\?\.isBoss/);

  // Gamepad: a synthetic pad, and the reader is checked against the contract it
  // actually implements -- a diagonal d-pad is normalised to unit length.
  assert.match(audit, /navigator\.getGamepads = \(\) => \[fake/);
  assert.match(audit, /padDrivesMovement/);
  assert.match(audit, /gamepad\.dead\.x === 0/);
  assert.match(audit, /Math\.SQRT1_2/);
});

test('the HUD enemy counter counts the enemies it is supposed to count', () => {
  const ui = read('frontend/js/v3/apps/dungeon/js/scenes/UIScene.js');
  // A Phaser Group keeps its members in a Set. The HUD did Array.isArray on it,
  // which was never true, so the remaining count was always 0 and the objective
  // line read "portal open" from the first frame of every floor.
  assert.doesNotMatch(ui, /children\?\.list/,
    'Phaser groups store members in a Set; Array.isArray on it is always false');
  assert.match(ui, /gs\.enemies\?\.getChildren\?\.\(\) \|\| \[\]/);
  assert.doesNotMatch(ui, /const remaining = 0;/,
    'a hardcoded zero is the bug this test exists to prevent');
});

test('the accessibility preferences are used, not only stored', () => {
  // A preference nothing reads is a checkbox that lies.
  assert.match(enemy, /nonAudioTelegraphsActive/);
  assert.match(options, /contrastBoost\(\)/);
  assert.match(options, /uiScale\(\)/);
  assert.match(options, /Math\.round\(16 \* scale\)/,
    'the option must change what the screen actually draws');
  assert.match(access, /recentlyUsed|reducedMotionActive/);
});

test('the HUD honours the text size and the contrast option', () => {
  const ui = read('frontend/js/v3/apps/dungeon/js/scenes/UIScene.js');
  // Phaser draws text at the size it is handed, so every label has to go
  // through the scale rather than one being left at a fixed size.
  assert.match(ui, /import \{ uiScale, contrastBoost \}/);
  assert.doesNotMatch(ui, /fontSize: '\d+px'/,
    'no HUD label may be a fixed pixel size');
  // And the floor is a floor, not a suggestion: 9px was unreadable on a phone.
  assert.match(ui, /Math\.max\(n, hi \? 13 : 11\)/);
  // The contrast option has to change real pixels.
  assert.match(ui, /ink\('#/);
  // uiScale is clamped, so a hand-edited localStorage value cannot make the HUD
  // unreadable in the other direction either.
  assert.match(access, /Math\.min\(2, Math\.max\(0\.85, raw\)\)/);
});
