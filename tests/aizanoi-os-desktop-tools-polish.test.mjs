import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const brand = read('frontend/js/v3/brand-platform.js');
const main = read('frontend/js/v3/main.js');
const shellCss = read('frontend/styles/shell.css');
const appsCss = read('frontend/styles/apps.css');
const arcade = read('frontend/js/v3/apps/games/src/app.js');
const snake = read('frontend/js/v3/apps/games/assets/snake.js');
const blockfall = read('frontend/js/v3/apps/games/assets/blockfall.js');
const release = read('frontend/release.js');
const serviceWorker = read('frontend/service-worker.js');

test('adaptive home exposes curated apps without Historical Worlds return/continue cards', () => {
  for (const id of ['browser','notepad','calculator','camera','winamp','games','recycle-bin']) {
    assert.match(brand, new RegExp(`['"]${id}['"]`), `${id} should be represented in the desktop shortcut contract`);
  }
  assert.doesNotMatch(brand, /sessionCard|getFieldSession|CONTINUE EXPLORING|data-home-action="continue-world"|az-device-session|az-session-widget|desktopWidget/);
  assert.match(brand, /\/styles\/shell\.css/);
});

test('calculator, Winamp and Arcade use frameless native tool presentation in the canonical shell layer', () => {
  for (const id of ['calculator','winamp','games']) {
    assert.ok(shellCss.includes(`data-app-id="${id}"`), `${id} frameless selector missing from shell.css`);
  }
  assert.match(shellCss, /az-window-control\[data-action="close"\]/);
  assert.match(shellCss, /az-window-control:not\(\[data-action="close"\]\)/);
  assert.match(shellCss, /az-resize-handle/);
});

test('Camera has a bounded smaller preview and user-resizable first-run window', () => {
  assert.match(main, /camera:Object\.freeze\(\{width:760,height:620,migrateWidth:900,migrateHeight:720\}\)/);
  assert.match(shellCss, /data-app-id="camera"/);
  assert.match(shellCss, /max-height:400px/);
  assert.match(shellCss, /aspect-ratio:4\/3/);
  // Apps layer must not introduce window-geometry !important for any app.
  assert.doesNotMatch(appsCss, /data-app-id="camera"[^}]*(?:left|top|width|height|transform):[^;{}]*!important/s);
});

test('Arcade launches each game as an owned page with its own exit controls', () => {
  assert.match(arcade, /az-arcade-session-close/);
  assert.match(arcade, /data-active-game/);
  assert.match(arcade, /event\.key !== 'Escape'/);
  assert.match(shellCss, /\.az-game-stage:not\(\[hidden\]\)/);
  assert.match(shellCss, /position:absolute/);
});

test('mobile Snake and Blockfall use playfield taps instead of direction-button overlays', () => {
  assert.doesNotMatch(snake, /snake-dpad|data-d="up"|data-d="left"|data-d="right"|data-d="down"/);
  assert.match(snake, /pointerType === 'mouse'/);
  assert.match(snake, /tap the playfield/i);

  assert.doesNotMatch(blockfall, /az-blockfall-touch|data-bf-left|data-bf-right|data-bf-rotate|data-bf-down|data-bf-drop/);
  assert.match(blockfall, /canvas\.addEventListener\('pointerdown', pointerdown\)/);
  assert.match(blockfall, /now - lastTouchAt < 320/);
  assert.match(blockfall, /double tap/i);
});

test('4.5.1 release cache includes the canonical shell stylesheet', () => {
  assert.match(release, /VERSION: '4\.5\.1'/);
  assert.match(release, /CACHE: 'aizanoi-os-shell-v4\.5\.1'/);
  assert.match(serviceWorker, /'\/styles\/shell\.css'/);
});
