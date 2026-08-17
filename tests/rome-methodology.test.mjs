import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('frontend/ancient-cities/rome-410-476/index.html', 'utf8');
const method = readFileSync('frontend/ancient-cities/rome-410-476/js/methodology.js', 'utf8');
const app = readFileSync('frontend/ancient-cities/rome-410-476/js/app.js', 'utf8');

test('Rome keeps reconstruction methodology visible even outside the WebGL renderer', () => {
  assert.match(html, /id="evidence"/);
  assert.match(html, /\.\/js\/methodology\.js/);
  assert.match(method, /Reconstruction method/);
  assert.match(method, /archaeological/);
  assert.match(method, /documented/);
  assert.match(method, /plausible/);
  assert.match(method, /atmospheric/);
});

test('Rome renderer consumes manifest bounds and adaptive performance policy', () => {
  assert.match(app, /ROME_MANIFEST/);
  assert.match(app, /const WORLD_BOUNDS = ROME_MANIFEST\.bounds/);
  assert.match(app, /createAdaptiveQualityController/);
  assert.match(app, /quality\.pixelRatioCap\(\)/);
  assert.match(app, /quality\.sample\(dt\)/);
  assert.match(app, /quality: \(\) => quality\.snapshot\(\)/);
});
