import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Browser restores focus to its editable address field after shell activation settles', () => {
  const source = read('frontend/js/v3/apps/browser/src/app.js');
  assert.match(source, /function restoreAddressFocus\(\)/);
  assert.match(source, /focusRestoreTimer = setTimeout\(\(\) =>/);
  assert.match(source, /requestAnimationFrame\(\(\) =>/);
  assert.match(source, /address\.addEventListener\('pointerdown', restoreAddressFocus\)/);
  assert.match(source, /address\.addEventListener\('click', restoreAddressFocus\)/);
  assert.match(source, /address\.focus\(\{ preventScroll:true \}\)/);
  assert.match(source, /if \(focusRestoreTimer !== null\) clearTimeout\(focusRestoreTimer\)/);
});

test('Signal Snake keeps keyboard restart available and renders a legible New Game control', () => {
  const source = read('frontend/js/v3/apps/games/assets/snake.js');
  assert.match(source, /window\.addEventListener\('keydown', onKey\)/);
  assert.match(source, /\(e\.key === ' ' \|\| e\.key === 'Enter'\) && over/);
  // The shared cabinet toolbar renders the visible "New game" control; arcade.css makes it legible.
  const utils = read('frontend/js/v3/apps/games/assets/game-utils.js');
  const css = read('frontend/js/v3/apps/games/assets/arcade.css');
  assert.match(utils, /add\('restart', 'New game', onRestart\)/);
  assert.match(source, /toolbar\(/);
  assert.match(css, /\.az-arcade \.ag-btn/);
});

test('Mines cancels a pending long-press when touch movement begins', () => {
  const source = read('frontend/js/v3/apps/games/assets/mines.js');
  assert.match(source, /function cancelLongPress\(\) \{ if \(longPressTimer\) clearTimeout\(longPressTimer\)/);
  assert.match(source, /grid\.addEventListener\('pointermove', cancelLongPress\)/);
  assert.match(source, /grid\.removeEventListener\('pointermove', cancelLongPress\)/);
});

test('desktop exposes Workspace and Workspace opens at the local root with Photos, Music, Text and Editor', () => {
  const platform = read('frontend/js/v3/brand-platform.js');
  const workspace = read('frontend/js/v3/apps/workspace/src/app.js');
  assert.match(platform, /'recycle-bin','workspace'/);
  assert.match(workspace, /node\?\.id===fs\.documentsId\?'Text'/);
  assert.match(workspace, /node\?\.id===fs\.picturesId\?'Photos'/);
  assert.match(workspace, /createFolder\(\{name:'Editor',parent:rootId\}\)/);
  assert.match(workspace, /if\(!cwd\)cwd=rootId/);
});

test('every window control draws a deterministic SVG glyph rather than a font character', () => {
  const css = read('frontend/styles/shell.css');
  const shell = read('frontend/js/v3/shell.js');
  assert.match(shell, /WINDOW_GLYPHS=Object\.freeze\(\{/);
  assert.match(shell, /close:glyph\('M4 4l8 8M12 4l-8 8'\)/);
  assert.match(shell, /data-action="close" aria-label="Close \$\{escapeHtml\(app\.label\)\}"[^>]*>\$\{WINDOW_GLYPHS\.close\}/);
  assert.doesNotMatch(shell, /data-action="close"[^>]*>×</);
  assert.match(css, /\.az-window-control svg \{/);
});
