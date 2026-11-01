import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = 'frontend/js/v3/apps';
const read = (p) => readFileSync(`${root}/${p}`, 'utf8');
const camera = read('camera/src/app.js');
const winamp = read('winamp/src/app.js');

async function mountCalc() {
  const keydown = new Set();
  const display = { textContent: '' };
  const indicator = { textContent: '' };
  let clickHandler = null;
  const container = {
    innerHTML: '',
    querySelector: (sel) => (sel.includes('display') ? display : indicator),
    addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn; },
    removeEventListener() {},
    contains: () => true,
    closest: () => null,
  };
  globalThis.document = { activeElement: container, body: {}, addEventListener: (t, fn) => keydown.add(fn), removeEventListener: (t, fn) => keydown.delete(fn) };
  const { mountCalculator } = await import('../frontend/js/v3/apps/calculator/src/app.js');
  const handle = await mountCalculator({ container, capabilities: { sound: { play() {} } } });
  const press = (key) => clickHandler({ target: { closest: () => ({ dataset: { calc: key } }) } });
  return { display, press, handle };
}

test('calculator backspace on a negative single digit returns to 0 and later math works', async () => {
  const { display, press, handle } = await mountCalc();
  press('5'); press('neg');
  assert.equal(display.textContent, '-5');
  press('back');
  assert.equal(display.textContent, '0');
  press('+'); press('3'); press('=');
  assert.equal(display.textContent, '3');
  handle.cleanup();
});

test('camera ignores a permission result that resolves after close or stop', () => {
  assert.match(camera, /generation/);
  assert.match(camera, /if\(disposed\|\|gen!==generation\)\{cameraStream\.getTracks\(\)\.forEach\(\(track\)=>track\.stop\(\)\);return;\}/);
  assert.match(camera, /return\{cleanup\(\)\{disposed=true;/);
  assert.match(camera, /function stop\(\)\{generation\+\+/);
});

test('camera gallery refreshes are generation-guarded and track owned object URLs', () => {
  assert.match(camera, /const token=\+\+galleryToken/);
  assert.match(camera, /if\(disposed\|\|token!==galleryToken\)return;/);
  assert.match(camera, /ownedUrls\.add\(url\)/);
  assert.doesNotMatch(camera, /querySelectorAll\('img\[data-photo-src\]'\)\.forEach/);
});

test('camera exposes distinct denied, missing, busy and unsupported states', () => {
  for (const state of ["denied", "missing", "busy", "unsupported"]) assert.ok(camera.includes(`${state}:[`));
});

test('winamp playback requests use a token so late sources cannot win or resume after close', () => {
  assert.match(winamp, /const token=\+\+playToken/);
  assert.match(winamp, /if\(disposed\|\|token!==playToken\)return;/);
  assert.match(winamp, /cleanup\(\)\{disposed=true;playToken\+\+;/);
});

test('winamp consumes initial file-open options after playlist init', () => {
  assert.match(winamp, /mountWinamp\(\{container,capabilities,options\}\)/);
  assert.match(winamp, /onOpen\(options\);\s*return\{cleanup/);
});
