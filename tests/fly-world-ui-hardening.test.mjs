import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const html = read('frontend/labs/fly-world/index.html');
const css = read('frontend/labs/fly-world/styles.css');
const runtimes = [
  read('frontend/labs/fly-world/glb-runtime-v3.js'),
  read('frontend/labs/fly-world/main-v3.js'),
];

test('Fly World exposes keyboard instructions and focusable scene controls', () => {
  assert.match(html, /<canvas[^>]+tabindex="0"[^>]+aria-describedby="observer-controls"/);
  assert.match(html, /<details class="help" id="help">/);
  assert.match(html, /<summary>Observer controls<\/summary>/);
  assert.match(css, /#world:focus-visible/);
});

test('Fly World HUD adapts without hiding every useful control', () => {
  assert.match(css, /grid-template-columns:minmax\(220px,1fr\)/);
  assert.match(css, /@media\(max-width:900px\).*?\.hud-statuses\{display:none\}/s);
  assert.match(css, /@media\(max-width:600px\).*?\.help:not\(\[open\]\)\{width:auto\}/s);
  assert.match(css, /@media\(max-width:600px\).*?grid-template-columns:minmax\(0,1fr\)/s);
  assert.match(css, /\.help\[open\]~\.research-panel\{top:/);
  assert.doesNotMatch(css, /\.hud \.status\{display:none\}/);
});

test('active observer input is scoped and cleared when the page loses focus', () => {
  for (const runtime of runtimes) {
    assert.match(runtime, /document\.activeElement !== (?:canvas|domElement) && document\.pointerLockElement !== (?:canvas|domElement)/);
    assert.match(runtime, /addEventListener\('blur', \(\) => this\.keys\.clear\(\)\)/);
    assert.match(runtime, /visibilitychange/);
    assert.match(runtime, /if \(document\.hidden\) return;/);
  }
});

test('inactive telemetry status is not rewritten on every animation frame', () => {
  const runtime = runtimes[0];
  const loop = runtime.slice(runtime.indexOf('renderer.setAnimationLoop'));
  assert.doesNotMatch(loop, /simulationStatus\.textContent = 'Telemetry inactive/);
});
