import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('frontend/ancient-cities/rome-410-476/index.html', 'utf8');
const boot = readFileSync('frontend/ancient-cities/rome-410-476/js/boot.js', 'utf8');
const method = readFileSync('frontend/ancient-cities/rome-410-476/js/methodology.js', 'utf8');
const app = readFileSync('frontend/ancient-cities/rome-410-476/js/app.js', 'utf8');
const bootstrap = readFileSync('frontend/ancient-world/engine/city-bootstrap.js', 'utf8');
const runtime = readFileSync('frontend/ancient-world/engine/flat-city-runtime.js', 'utf8');

test('Rome keeps reconstruction methodology visible even outside the WebGL renderer', () => {
  assert.match(html, /id="evidence"/);
  assert.match(boot, /import\(['"]\.\/methodology\.js['"]\)/);
  assert.match(method, /Reconstruction method/);
  assert.match(method, /archaeological/);
  assert.match(method, /documented/);
  assert.match(method, /plausible/);
  assert.match(method, /atmospheric/);
});

test('Rome delegates bounds, city profile and adaptive performance policy to shared platform owners', () => {
  assert.match(app, /startAncientCity/);
  assert.match(app, /compactionProfile:'rome'/);
  assert.match(app, /bounds:\{ minX:-900, maxX:700, minZ:-700, maxZ:700 \}/);
  assert.match(bootstrap, /startFlatBlockyCity/);
  assert.match(runtime, /createAdaptiveQualityController\(\{ mobile:TOUCH \}\)/);
  assert.match(runtime, /Math\.min\(devicePixelRatio \|\| 1, quality\.pixelRatioCap\(\)\)/);
  assert.match(runtime, /quality\.sample\(frameDt\)/);
  assert.match(runtime, /const TOUCH =/);
  assert.match(runtime, /baseHeightAt:\s*\(\) => 0/);
  assert.match(runtime, /renderer: 'custom-webgl-blocky'/);
  assert.match(runtime, /adaptiveQuality: true/);
  assert.match(runtime, /trueVoxelEngine: false/);
});
