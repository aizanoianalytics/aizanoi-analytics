import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('frontend/js/v3/shell.js', 'utf8');
const adapter = readFileSync('frontend/js/v3/aizanoi-os.js', 'utf8');
const css = readFileSync('frontend/styles/shell.css', 'utf8');

test('window pointerdown activates without transferring focus', () => {
  assert.match(shell, /addEventListener\('pointerdown',\(\)=>activateWindow\(appId/);
  assert.doesNotMatch(shell, /addEventListener\('pointerdown',\(\)=>focusWindow/);
});

test('isolation is one derived function used by overlays and app transitions', () => {
  assert.doesNotMatch(shell, /setBackgroundInert|syncCompactIsolation/);
  assert.ok((shell.match(/syncIsolation\(\)/g) || []).length >= 6);
  assert.match(shell, /function openOverlay[\s\S]*syncIsolation\(\)/);
  assert.match(shell, /function closeOverlay[\s\S]*syncIsolation\(\)/);
});

test('stale async beforeClose verdicts cannot close a newer instance', () => {
  assert.match(shell, /item\.closing/);
  assert.match(shell, /windows\.get\(appId\) === item && item\.generation === generation/);
  assert.match(shell, /expected && item !== expected/);
});

test('min size constant matches CSS and rects use layer coordinates', () => {
  const m = css.match(/\.az-window \{[^}]*min-width:(\d+)px; min-height:(\d+)px/);
  assert.ok(m, 'CSS .az-window min size found');
  assert.ok(shell.includes(`WINDOW_MIN = Object.freeze({ width:${m[1]}, height:${m[2]} })`));
  assert.doesNotMatch(shell, /el\.getBoundingClientRect\(\)|item\.el\.getBoundingClientRect/);
});

test('adapter does not write window geometry or persist rects', () => {
  assert.doesNotMatch(adapter, /saveWindowRect/);
  assert.doesNotMatch(adapter, /style,\{left/);
});

test('reset uses the canonical dialog and consults close guards', () => {
  assert.doesNotMatch(shell, /window\.confirm/);
  assert.ok(shell.includes('id="az-confirm-overlay"'));
  assert.ok(shell.includes('askBeforeClose(item)'));
  assert.ok(shell.includes('Stays as it is'));
});

test('app layers are not live regions; search is a combobox', () => {
  assert.doesNotMatch(shell, /az-window-layer" aria-live|az-fullscreen-layer" aria-live/);
  assert.match(shell, /role="combobox"[^>]*aria-controls="az-command-results"/);
  assert.ok(shell.includes('aria-activedescendant'));
});

test('open app limit is enforced before mounting', () => {
  assert.ok(shell.includes('Store.MAX_OPEN_APPS'));
});
