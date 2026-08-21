import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const os = read('frontend/js/v3/aizanoi-os.js');
const shell = read('frontend/js/v3/shell.js');
const base = read('frontend/styles/base.css');

test('AizanoiOS separates Applications from open-window switching', () => {
  assert.match(os, /data-os-launcher/);
  assert.match(os, /data-os-switcher/);
  assert.match(os, /prepareSwitcherOverlay/);
  assert.doesNotMatch(os, /function\s+openLauncher\b/);
  assert.match(shell, /event\.altKey&&event\.key==='Tab'[\s\S]*renderSwitcher\(\)[\s\S]*openOverlay\('az-switcher-overlay'/);
});

test('dock magnification is frame-throttled and geometry is cached', () => {
  assert.match(os, /requestAnimationFrame\(update\)/);
  assert.match(os, /centers=buttons\.map/);
  assert.match(os, /pointerenter',measure/);
  assert.match(os, /new MutationObserver\(\(\)=>\{centers=\[\];buttons=\[\];\}\)/);
});

test('launcher and context menu expose accessible empty and keyboard states', () => {
  assert.match(os, /data-launcher-empty/);
  assert.match(os, /role=\"status\" aria-live=\"polite\"/);
  assert.match(os, /ArrowDown/);
  assert.match(os, /ArrowUp/);
  assert.match(os, /Home/);
  assert.match(os, /End/);
});

test('desktop shell includes active app chrome, snapping and window motion', () => {
  assert.match(os, /data-active-app-title/);
  assert.match(os, /installWindowSnapping/);
  assert.match(os, /installWindowMotion/);
  assert.match(os, /Math\.hypot/);
  assert.match(os, /animateWindowFromDock/);
});

test('traffic lights use the AizanoiOS accent palette', () => {
  assert.match(base, /data-action=\"close\"\]\:\:before \{ background: var\(--az-rust\) !important; \}/);
  assert.match(base, /data-action=\"minimize\"\]\:\:before \{ background: var\(--az-brass-hi\) !important; \}/);
  assert.match(base, /data-action=\"maximize\"\]\:\:before \{ background: var\(--az-teal-hi\) !important; \}/);
});
