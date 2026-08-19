import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const css = read('frontend/css/os-unified.css');
const v2 = read('frontend/css/os-v2.css');
const unified = read('frontend/js/os-unified.js');
const platform = read('frontend/js/os-platform.js');

test('V2 loads the unified shell skin before legacy polish layers', () => {
  assert.match(v2, /^@import url\('\/css\/os-unified\.css'\);/);
});

test('unified shell defines desktop, tablet and mobile from one design contract', () => {
  assert.match(css, /#az-mobile-home/);
  assert.match(css, /@media \(min-width:701px\) and \(max-width:1100px\)/);
  assert.match(css, /@media \(max-width:700px\)/);
  assert.match(css, /--azu-paper:/);
  assert.match(css, /--azu-amber:/);
  assert.match(css, /--azu-teal:/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /width:100vw !important/);
});

test('unified launcher exposes every featured non-AI product from first paint', () => {
  for (const id of ['ancient','archive','notes','data-lab','source-reader','artifact-viewer','projects','terminal','monitor','videos','games']) {
    assert.match(unified, new RegExp(`['\"]${id}['\"]`), `${id} missing from unified launcher`);
  }
  assert.doesNotMatch(unified, /CORE_APPS[^\n]*chatbot/);
  assert.match(unified, /\[data-mobile-nav=\\?"ai\\?"\]/);
});

test('unified presentation bridge stays browser-only', () => {
  assert.doesNotMatch(unified, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|\/api\//);
  assert.match(platform, /\/js\/os-unified\.js/);
});
