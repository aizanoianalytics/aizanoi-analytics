import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const css = read('frontend/css/os-product-polish.css');
const polish = read('frontend/js/os-product-polish.js');
const platform = read('frontend/js/os-platform.js');
const worker = read('frontend/service-worker.js');

test('product polish boots from the static platform bridge and remains browser-only', () => {
  assert.match(platform, /\/js\/os-product-polish\.js/);
  assert.match(polish, /\/css\/os-product-polish\.css/);
  assert.doesNotMatch(polish, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|\/api\//);
  assert.match(polish, /AIZANOI_PRODUCT_POLISH/);
  assert.match(polish, /aizanoi:distribution-ready/);
});

test('product polish covers legacy and workstation interiors from one design layer', () => {
  for (const selector of [
    'data-app-id="terminal"',
    'data-app-id="games"',
    'data-app-id="projects"',
    'data-app-id="videos"',
    'data-app-id="about"',
    '.az-archive-shell',
    '.az-notes-shell',
    '.az-lab-shell',
    '.az-reader-shell',
    '.az-artifact-shell',
    '.az-monitor-shell',
    '#az-quicklook',
  ]) assert.ok(css.includes(selector), `${selector} is not covered by product polish`);
});

test('desktop tablet mobile touch accessibility and motion contracts are explicit', () => {
  assert.match(css, /@media \(min-width:701px\) and \(max-width:1100px\)/);
  assert.match(css, /@media \(max-width:700px\)/);
  assert.match(css, /@media \(pointer:coarse\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media \(prefers-contrast:more\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
});

test('stale AI and old desktop fallback copy are neutralized at runtime', () => {
  assert.match(polish, /removeLegacyAiEntrypoints/);
  assert.match(polish, /#start-menu \[data-app="chatbot"\]/);
  assert.match(polish, /static website and browser-native workspace/i);
  assert.match(polish, /Field Terminal/);
  assert.match(polish, /aizanoi@field:~\$/);
  assert.match(polish, /App backend','None/);
  assert.match(polish, /browser-only virtual shell/);
});

test('service worker rolls cache and precaches the polish bootstrap', () => {
  assert.match(worker, /aizanoi-field-shell-v2\.1\.2/);
  assert.match(worker, /\/js\/os-product-polish\.js/);
  assert.match(worker, /\/css\/os-product-polish\.css/);
  assert.match(worker, /\/js\/os-platform\.js/);
});
