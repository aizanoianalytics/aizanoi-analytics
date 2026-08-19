import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const experience = read('frontend/ancient-world/engine/city-experience.js');
const style = read('frontend/ancient-world/engine/city-experience.css');
const navigation = read('frontend/ancient-world/engine/navigation.js');

const requiredAizanoiTools = ['resumeBtn','settingsBtn','fullscreenBtn','tourBtn','atlasBtn','sourcesBtn','soundBtn','timeWrap'];
const requiredCityTools = ['atlas','modern','audio','evidence','sources'];

test('all historical worlds receive the same restrained presentation layer', () => {
  assert.match(navigation, /import '\.\/city-experience\.js';/);
  assert.match(experience, /new URL\('\.\/city-experience\.css',import\.meta\.url\)/);
  assert.match(experience, /city==='aizanoi'/);
  assert.match(experience, /city==='rome'\|\|city==='athens'/);
  assert.match(experience, /aw-tools-toggle/);
  assert.match(experience, /aw-tools-panel/);
});

test('secondary city controls are moved behind one Explore drawer instead of duplicated', () => {
  for (const id of requiredAizanoiTools) assert.ok(experience.includes(`'${id}'`), `${id} is not routed into the Aizanoi tool drawer`);
  for (const id of requiredCityTools) assert.ok(experience.includes(`'${id}'`), `${id} is not routed into the Rome/Athens tool drawer`);
  assert.match(experience, /\.deviceChip.*remove/);
  assert.match(style, /#hud \.bottomBar\{display:none!important\}/);
  assert.match(style, /\.miniWrap:not\(\.aw-map-open\)/);
});

test('opening secondary tools pauses traversal input without owning city physics', () => {
  assert.match(experience, /movementKeys=new Set/);
  assert.match(experience, /stopImmediatePropagation/);
  assert.match(experience, /document\.exitPointerLock/);
  assert.match(experience, /aw-tools-open/);
  assert.doesNotMatch(experience, /createTraversalSystem|rectCollider|walkRamp|terrainHeightAt/);
});

test('mobile presentation leaves movement actions available while removing passive HUD clutter', () => {
  assert.match(style, /@media\(pointer:coarse\),\(max-width:820px\)/);
  assert.match(style, /body\[data-city="aizanoi"\] #headingHud/);
  assert.match(style, /body\[data-city="aizanoi"\] #elevationHud/);
  assert.match(style, /\.controls #inspect.*display:none!important/s);
  assert.doesNotMatch(style, /#mobileControls\{display:none/);
});
