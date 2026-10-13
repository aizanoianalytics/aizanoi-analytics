import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const shell = read('frontend/js/v3/shell.js');
const store = read('frontend/js/v3/store.js');
const shellCss = read('frontend/styles/shell.css');
const componentsCss = read('frontend/styles/components.css');
const main = read('frontend/js/v3/main.js');

test('shell supports pointer window snapping with a ghost preview', () => {
  assert.match(shell, /function snapWindow\(/);
  assert.match(shell, /az-snap-ghost/);
  assert.match(shell, /snap-preview|showSnapGhost|renderSnapGhost/);
  assert.match(shellCss, /\.az-snap-ghost/);
});

test('command palette uses fuzzy matching instead of plain substring search', () => {
  assert.match(shell, /function fuzzyMatch\(/);
  assert.match(shell, /fuzzyMatch\(/);
});

test('command palette exposes system commands for sound, fullscreen, close, motion and fps', () => {
  for (const id of ['toggle-sound', 'toggle-fullscreen', 'close-active', 'toggle-motion', 'toggle-fps']) {
    assert.match(shell, new RegExp(`id:'${id}'`));
  }
  assert.match(shell, /toggleFps|fpsMeter|az-fps/);
});

test('system bar shows the active application title and a sound toggle', () => {
  assert.match(shell, /az-active-app/);
  assert.match(shell, /data-shell-action="sound"/);
  assert.match(shell, /renderActiveApp|updateActiveApp|activeAppTitle/);
});

test('notification center lists recent activity with kinds and a clear action', () => {
  assert.match(shell, /az-notifications-overlay/);
  assert.match(shell, /data-notifications-list/);
  assert.match(shell, /clearActivity|data-clear-activity/);
  assert.match(shell, /az-toast is-\$\{safe\}/);
  assert.match(shell, /az-notification is-\$\{escapeHtml\(item\.kind/);
  assert.match(store, /'system','info','success','warning','error'/);
  assert.match(shell, /az-toast-progress|toast-progress/);
});

test('shell store persists a sound preference and can clear activity', () => {
  assert.match(store, /soundOn/);
  assert.match(store, /function clearActivity\(/);
});

test('boot splash is skipped on repeat visits within the session', () => {
  assert.match(main, /sessionStorage/);
  assert.match(main, /az-boot-seen|boot-seen|bootSeen/);
});

test('task shelf buttons expose hover tooltips with the app label', () => {
  assert.match(shell, /az-dock-tooltip/);
});
