import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('World catalog exposes the present-day Istanbul Airport experience', () => {
  const registry = read('frontend/js/v3/registry.js');
  assert.match(registry, /id:'iga'/);
  assert.match(registry, /route:'\/iga\/'/);
  assert.match(registry, /Istanbul Airport/);
});

test('IGA world has a standalone static entry and researched data module', () => {
  assert.equal(existsSync(new URL('../frontend/iga/index.html', import.meta.url)), true);
  assert.equal(existsSync(new URL('../frontend/iga/data/airport.js', import.meta.url)), true);
  const airport = read('frontend/iga/data/airport.js');
  assert.match(airport, /36×36/);
  assert.match(airport, /Nordic Office of Architecture/);
  assert.match(airport, /istairport\.com/);
});

test('IGA participates in shared deep-link routing and teardown semantics', () => {
  const navigation = read('frontend/ancient-world/engine/navigation.js');
  assert.match(navigation, /path\.includes\('\/iga\/'\)/);
  assert.match(navigation, /worldId:'iga'/);
});

test('IGA architecture is rendered through a dedicated terminal asset rather than an ancient generic house', () => {
  const assets = read('frontend/ancient-world/assets/blocky-asset-library.js');
  assert.match(assets, /function terminal\(/);
  assert.match(assets, /terminal,/);
});
