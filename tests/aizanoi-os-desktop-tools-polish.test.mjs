import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const brand = read('frontend/js/v3/brand-platform.js');
const registry = read('frontend/js/v3/registry.js');
const main = read('frontend/js/v3/main.js');
const polish = read('frontend/styles/tool-windows.css');
const arcade = read('frontend/js/v3/apps/games/src/app.js');
const snake = read('frontend/js/v3/apps/games/assets/snake.js');
const blockfall = read('frontend/js/v3/apps/games/assets/blockfall.js');
const release = read('frontend/release.js');
const serviceWorker = read('frontend/service-worker.js');

test('adaptive home keeps a seven-shortcut desktop while utilities remain discoverable', () => {
  assert.match(brand, /const DESKTOP=Object\.freeze\(\[\.\.\.PINNED,'games','recycle-bin'\]\)/);
  assert.match(brand, /const PUBLIC_APPS=Object\.freeze\(APPS\.map\(\(app\)=>app\.id\)\)/);
  for (const id of ['browser','notepad','calculator','camera','winamp','workspace','web-editor']) {
    assert.match(registry, new RegExp(`id:['"]${id}['"]`), `${id} should remain in the canonical app registry`);
  }
  assert.doesNotMatch(brand, /sessionCard|getFieldSession|CONTINUE EXPLORING|data-home-action="continue-world"|az-device-session|az-session-widget|desktopWidget/);
  assert.match(brand, /\/styles\/tool-windows\.css/);
});

test('calculator, Winamp and Arcade use frameless native tool presentation', () => {
  for (const id of ['calculator','winamp','games']) {
    assert.ok(polish.includes(`data-app-id="${id}"`), `${id} frameless selector missing`);
  }
  assert.match(polish, /az-window-control\[data-action="close"\]/);
  assert.match(polish, /az-window-control:not\(\[data-action="close"\]\)/);
  assert.match(polish, /az-resize-handle/);
});

test('Camera has a bounded smaller preview and user-resizable first-run window', () => {
  assert.match(main, /camera:Object\.freeze\(\{width:760,height:620,migrateWidth:900,migrateHeight:720\}\)/);
  assert.match(polish, /data-app-id="camera"/);
  assert.match(polish, /max-height:400px/);
  assert.match(polish, /aspect-ratio:4\/3/);
  assert.doesNotMatch(polish, /(?:left|top|width|height|transform):[^;{}]*!important/);
});

test('Arcade launches each game as an owned page with its own exit controls', () => {
  assert.match(arcade, /az-arcade-session-close/);
  assert.match(arcade, /data-active-game/);
  assert.match(arcade, /event\.key !== 'Escape'/);
  assert.match(polish, /\.az-game-stage:not\(\[hidden\]\)/);
  assert.match(polish, /position:absolute/);
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

test('4.5.1 release cache includes the new shell presentation stylesheet', () => {
  assert.match(release, /VERSION: '4\.5\.1'/);
  assert.match(release, /CACHE: 'aizanoi-os-shell-v4\.5\.1'/);
  assert.match(serviceWorker, /'\/styles\/tool-windows\.css'/);
});
