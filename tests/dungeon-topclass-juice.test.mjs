import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioManager } from '../frontend/js/v3/apps/dungeon/js/systems/AudioManager.js';
import { OPTIONAL_TOUCH_FILES, OPTIONAL_AUDIO_FILES } from '../frontend/js/v3/apps/dungeon/js/data/optional-assets.js';

const dungeonSrc = (p) => readFileSync(new URL(`../frontend/js/v3/apps/dungeon/js/${p}`, import.meta.url), 'utf8');
const shellSrc = (p) => readFileSync(new URL(`../frontend/${p}`, import.meta.url), 'utf8');

test('every named gameplay cue resolves to a loaded asset or a synth fallback', () => {
  const gameScene = dungeonSrc('scenes/GameScene.js');
  const aizo = dungeonSrc('entities/Aizo.js');
  const called = new Set();
  for (const src of [gameScene, aizo]) {
    for (const m of src.matchAll(/playSfx\(\s*'([^']+)'/g)) called.add(m[1]);
  }
  assert.ok(called.size >= 4, `expected several named cues, got ${called.size}`);
  const loadedKeys = new Set(OPTIONAL_AUDIO_FILES.map(([k]) => k));
  const mgr = new AudioManager();
  const fallbacks = ['sfx-dash', 'sfx-heal', 'sfx-shop', 'sfx-summon'];
  for (const key of called) {
    const resolves = loadedKeys.has(key) || fallbacks.includes(key);
    assert.ok(resolves, `cue ${key} must resolve to a WAV or a documented fallback`);
  }
  // Mute suppresses both paths without exceptions.
  mgr.isMuted = true;
  assert.equal(mgr.playCue(null, 'sfx-heal'), null);
  assert.equal(mgr.playSynthFallback('no-such-cue'), null);
});

test('GameScene.playSfx routes through the central cue router', () => {
  const src = dungeonSrc('scenes/GameScene.js');
  assert.match(src, /playSfx\(key, volume = 0\.5\) \{\s*\n\s*try \{\s*\n\s*audioManager\.playCue\(this, key, volume\);/);
  assert.doesNotMatch(src, /this\.sound\.play\(key, \{ volume \}\)/);
});

test('single hitstop path: juiceHitstop delegates to applyHitstop', () => {
  const src = dungeonSrc('scenes/GameScene.js');
  assert.match(src, /juiceHitstop\(ms = 55\) \{[\s\S]{0,400}?this\.applyHitstop\(ms\);/);
  assert.doesNotMatch(src, /juiceHitstop[\s\S]{0,400}?this\.physics\.world\.pause\(\)/);
  assert.match(src, /CRITICAL: the release must NOT be scheduled on scene time/);
});

test('visibility autopause is idempotent, overlay-aware, and cleaned up', () => {
  const src = dungeonSrc('scenes/GameScene.js');
  assert.match(src, /document\.addEventListener\('visibilitychange', this\._onVisibilityChange\)/);
  assert.match(src, /window\.addEventListener\('pagehide', this\._onWindowHide\)/);
  assert.match(src, /window\.addEventListener\('blur', this\._onWindowHide\)/);
  assert.match(src, /pauseForVisibility\(\) \{[\s\S]{0,300}?if \(this\.isPaused \|\| this\.exitMenu \|\| this\.blessingOverlay/);
  assert.match(src, /document\.removeEventListener\('visibilitychange', this\._onVisibilityChange\)/);
  assert.match(src, /window\.removeEventListener\('blur', this\._onWindowHide\)/);
});

test('touch uses the same interact path as keyboard and has a dash action', () => {
  const touch = dungeonSrc('systems/TouchControls.js');
  const scene = dungeonSrc('scenes/GameScene.js');
  assert.match(touch, /this\.scene\.touchInteract\(\)/);
  assert.doesNotMatch(touch, /player\.isInBase\) \{\s*\n\s*this\.scene\.scene\.launch\('ShopScene'\)/);
  assert.match(touch, /btnDash/);
  assert.match(touch, /player\.startDash\(\)/);
  assert.match(scene, /touchInteract\(\) \{[\s\S]{0,500}?this\.useInteractable\(room, offer\.kind\)/);
  assert.match(touch, /destroy\(\) \{[\s\S]{0,600}?if \(this\.btnDash\) this\.btnDash\.destroy\(\)/);
});

test('HUD surfaces statuses and the combat log without covering minimap', () => {
  const src = dungeonSrc('scenes/UIScene.js');
  assert.match(src, /this\.statusText = this\.add\.text\(10, 84/);
  assert.match(src, /this\.combatLogText = this\.add\.text\(10, height - 10/);
  assert.match(src, /updateStatusLine\(player\)/);
  assert.match(src, /updateCombatLogFeed\(gs\)/);
  assert.match(src, /gs\.isTileVisible\(Math\.floor\(enemy\.x \/ 32\), Math\.floor\(enemy\.y \/ 32\)\)/);
});

test('optional assets queue from the long-lived menu scene, fail-open', () => {
  const boot = dungeonSrc('scenes/BootScene.js');
  const menu = dungeonSrc('scenes/MenuScene.js');
  assert.match(boot, /export function queueOptionalAssets\(scene, assetBase\)/);
  assert.match(menu, /queueOptionalAssets\(this, dungeonAssetBase\(\)\)/);
  assert.doesNotMatch(boot, /const ASSET_BASE = new URL\('..\/..\/assets\/', import\.meta\.url\)\.href;\s*\n\s*this\.loadOptionalAudio\(ASSET_BASE\);/);
  assert.ok(OPTIONAL_TOUCH_FILES.length >= 8 && OPTIONAL_AUDIO_FILES.length >= 5);
});

test('pointer glow honors live OS reduce-motion, dead paper rule removed', () => {
  const os = shellSrc('js/v3/aizanoi-os.js');
  const components = shellSrc('styles/components.css');
  assert.match(os, /if\(!target \|\| !motionEnabled\(store\)\)/);
  assert.doesNotMatch(components, /\.az-paper-surface :focus-visible/);
});
