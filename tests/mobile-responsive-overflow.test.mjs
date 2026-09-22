import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const deviceShell = read('frontend/styles/device-shell.css');

test('mobile AizanoiOS home keeps widgets, app grid and dock inside the viewport', () => {
  assert.match(deviceShell, /\.az-phone-home\s*\{[\s\S]*?min-width:0;[\s\S]*?width:100%;/);
  assert.match(deviceShell, /\.az-phone-widgets\s*\{[\s\S]*?min-width:0;[\s\S]*?width:100%;[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/);
  assert.match(deviceShell, /\.az-phone-apps\s*\{[\s\S]*?min-width:0;[\s\S]*?width:100%;/);
  assert.match(deviceShell, /\.az-task-shelf\s*\{[\s\S]*?width:100%;[\s\S]*?max-width:calc\(100vw - 16px\);[\s\S]*?overflow:hidden;/);
  assert.match(deviceShell, /\.az-shelf-button\s*\{[\s\S]*?width:48px;[\s\S]*?height:48px;[\s\S]*?flex-basis:48px;/);
});
