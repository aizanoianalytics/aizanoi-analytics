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
  assert.match(source, /btn\.textContent = 'New Game'/);
  assert.match(source, /background:#5265db;color:#fff/);
});

test('Workspace stays available through Applications and opens at the local root with Photos, Music, Text and Editor', () => {
  const platform = read('frontend/js/v3/brand-platform.js');
  const registry = read('frontend/js/v3/registry.js');
  const workspace = read('frontend/js/v3/apps/workspace/src/app.js');
  assert.match(platform, /const PUBLIC_APPS=Object\.freeze\(APPS\.map\(\(app\)=>app\.id\)\)/);
  assert.match(registry, /id:'workspace'.*label:'Workspace'/s);
  assert.match(workspace, /node\?\.id===fs\.documentsId\?'Text'/);
  assert.match(workspace, /node\?\.id===fs\.picturesId\?'Photos'/);
  assert.match(workspace, /createFolder\(\{name:'Editor',parent:rootId\}\)/);
  assert.match(workspace, /if\(!cwd\)cwd=rootId/);
});

test('frameless utility windows draw a deterministic close glyph', () => {
  const css = read('frontend/styles/tool-windows.css');
  assert.match(css, /\.az-window-control\[data-action="close"\]::before/);
  assert.match(css, /rotate\(45deg\)/);
  assert.match(css, /rotate\(-45deg\)/);
});
