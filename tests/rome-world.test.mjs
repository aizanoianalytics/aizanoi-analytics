import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const city = resolve(root, 'frontend/ancient-cities/rome-410-476');

function read(relative) {
  return readFileSync(resolve(city, relative), 'utf8');
}

test('Rome experience provides a standalone WebGL entry page', () => {
  assert.ok(existsSync(resolve(city, 'index.html')));
  const html = read('index.html');
  assert.match(html, /<canvas[^>]+id="glCanvas"/);
  assert.match(html, /import\(['"]\.\/js\/app\.js['"]\)/);
  assert.match(html, /Rome.*410.*476/i);
});

test('Rome entry page gives a visible fallback when WebGL is unavailable', () => {
  const html = read('index.html');
  assert.match(html, /WEBGL UNAVAILABLE/i);
  assert.match(html, /__AIZANOI_WEBGL_UNAVAILABLE__/);
  assert.match(html, /needs WebGL/i);
  assert.match(html, /renderer could not start/i);
});

test('Rome city data includes late-antique monuments, regions, streets and sourced records', async () => {
  assert.ok(existsSync(resolve(city, 'data/city.js')));
  const { BUILDINGS, REGIONS, STREETS, SOURCES } = await import(resolve(city, 'data/city.js'));
  const names = BUILDINGS.map((b) => b.name).join(' | ');
  for (const required of ['Aurelian Walls', 'Colosseum', 'Old St. Peter', 'Santa Maria Maggiore', 'Baths of Caracalla', 'Pantheon']) {
    assert.match(names, new RegExp(required));
  }
  assert.equal(REGIONS.length, 14);
  assert.ok(STREETS.length >= 10);
  assert.ok(SOURCES.length >= 15);
  assert.ok(BUILDINGS.length >= 45, `expected >=45 records, got ${BUILDINGS.length}`);
});

test('Rome adapter uses the shared flat blocky runtime with no third-party runtime', () => {
  const app = read('js/app.js');
  const runtime = readFileSync(resolve(root, 'frontend/ancient-world/engine/flat-city-runtime.js'), 'utf8');
  assert.match(app, /startFlatBlockyCity/);
  assert.match(app, /expandPerimeterWalls/);
  assert.match(app, /installCityCompatibility/);
  assert.match(runtime, /AudioContext/);
  assert.match(runtime, /requestPointerLock/);
  assert.match(runtime, /function drawMap/);
  assert.match(runtime, /baseHeightAt:\s*\(\) => 0/);
  assert.doesNotMatch(app, /https?:\/\//);
});

test('Rome page documents sources locally and links the research route', () => {
  assert.ok(existsSync(resolve(city, 'research/index.html')));
  const research = read('research/index.html');
  assert.match(research, /Sources/);
  assert.match(research, /Forma Urbis/);
});
