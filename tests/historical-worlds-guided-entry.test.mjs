import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('frontend/historic-world/index.html', 'utf8');
const runtime = readFileSync('frontend/ancient-world/engine/flat-city-runtime.js', 'utf8');
const style = readFileSync('frontend/historic-world/style-source.css', 'utf8');

test('Aizanoi offers guided play before free exploration', () => {
  assert.match(html, /id="guidedEnterBtn" class="primary">START GUIDED TOUR/);
  assert.match(html, /id="enterBtn" class="secondary">FREE EXPLORE/);
  assert.match(html, /playable archaeological atlas/i);
  assert.match(html, /ten-stop guided route/i);
});

test('guided entry starts at the Temple of Zeus with evidence text visible', () => {
  assert.match(runtime, /tour\.findIndex\(\(record\) => record\.id === 'temple'\)/);
  assert.match(runtime, /enterWorld\(\{ guided: true \}\)/);
  assert.match(runtime, /tourCard'\)\?\.classList\.remove\('hidden'\)/);
  assert.match(runtime, /teleportTo\(first\.id, \{ lock: false \}\)/);
  assert.match(runtime, /arrivalIdentity = \{ record, x: player\.x, z: player\.z \}/);
  assert.match(runtime, /Math\.hypot\(player\.x - arrivalIdentity\.x, player\.z - arrivalIdentity\.z\) <= 3\.5/);
});

test('free explore preserves the compatibility entry button and desktop mouse look', () => {
  assert.match(runtime, /enterBtn'\)\?\.addEventListener\('click', \(\) => enterWorld\(\)\)/);
  assert.match(runtime, /else if \(!TOUCH\) requestLock\(false\)/);
});

test('guided evidence card remains usable on desktop and mobile', () => {
  assert.match(style, /#tourCard\{position:fixed;left:14px;top:112px/);
  assert.match(style, /#tourCard\{left:12px;top:auto;bottom:172px/);
  assert.doesNotMatch(style, /#tourCard\{display:none\}/);
});
