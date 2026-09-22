import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('frontend/worlds/shared/css/base-theme.css', 'utf8').replace(/\r\n/g, '\n');

test('Historical Worlds minimap uses a compact responsive desktop footprint', () => {
  assert.match(css, /#minimap-wrapper\s*\{[\s\S]*?width: clamp\(128px, 11vw, 156px\);[\s\S]*?height: clamp\(128px, 11vw, 156px\);/);
  assert.doesNotMatch(css, /#minimap-wrapper\s*\{[\s\S]*?width: 200px;[\s\S]*?height: 200px;/);
});

test('phone map and action rail remain separated and safe-area aware', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 480px)'));
  assert.match(phone, /#minimap-wrapper \{ width: 78px; height: 78px;/);
  assert.match(phone, /bottom: max\(10px, env\(safe-area-inset-bottom\)\)/);
  assert.match(phone, /\.action-rail \{ bottom: max\(100px, calc\(env\(safe-area-inset-bottom\) \+ 90px\)\)/);
  assert.ok(phone.indexOf('.action-rail') > phone.indexOf('#minimap-wrapper'));
});
