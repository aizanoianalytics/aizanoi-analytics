import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const os = read('frontend/js/v3/aizanoi-os.js');
const shell = read('frontend/js/v3/shell.js');
const base = read('frontend/styles/base.css');
const deviceShell = read('frontend/styles/device-shell.css');
const apps = read('frontend/styles/apps.css');

test('canonical app aliases preserve the public app ids', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  assert.equal(registry.canonicalAppId('tv'), 'videos');
  assert.equal(registry.canonicalAppId('arcade'), 'games');
  assert.equal(registry.canonicalAppId('videos'), 'videos');
  assert.equal(registry.canonicalAppId('games'), 'games');
  assert.equal(registry.appById('tv'), null, 'aliases must not become persisted app ids');
  assert.equal(registry.appById('arcade'), null, 'aliases must not become persisted app ids');
});

test('retired Workbench, Archive and Notes have no AizanoiOS source paths', () => {
  assert.doesNotMatch(os, /workbench|archive|notes|field note/i);
});

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

test('app captions and empty states use explicit readable text colors', () => {
  assert.match(apps, /\.az-app-caption\s*\{[^}]*color:#4f5d73/s);
  assert.match(read('frontend/styles/components.css'), /\.az-empty-state p\s*\{[^}]*color:\s*#5b6678/s);
});

test('traffic lights use the AizanoiOS accent palette', () => {
  assert.match(base, /data-action=\"close\"\]\:\:before \{ background: var\(--az-rust\) !important; \}/);
  assert.match(base, /data-action=\"minimize\"\]\:\:before \{ background: var\(--az-brass-hi\) !important; \}/);
  assert.match(base, /data-action=\"maximize\"\]\:\:before \{ background: var\(--az-teal-hi\) !important; \}/);
});
