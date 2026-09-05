import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SPAWN, BUILDINGS } from '../frontend/iga/data/airport.js';

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

test('IGA forecourt supplies a continuous curbside surface from arrival to terminal', () => {
  const plaza = BUILDINGS.find((building) => building.id === 'plaza');
  assert.equal(plaza?.type, 'forecourt');
  assert.ok(plaza?.d >= 240, 'curbside surface should not leave a dead arrival foreground');
});

test('IGA arrival framing starts before the curbside zone and faces the terminal', () => {
  assert.ok(SPAWN.z <= -380, 'arrival camera should begin before the curbside sequence');
  assert.ok(SPAWN.pitch <= -0.10, 'arrival camera should include curbside circulation in the first view');
  assert.ok(Math.abs(SPAWN.yaw - Math.PI) < 0.35, 'arrival camera should face the terminal axis');
});

test('IGA participates in shared deep-link routing and teardown semantics', () => {
  const navigation = read('frontend/ancient-world/engine/navigation.js');
  assert.match(navigation, /path\.includes\('\/iga\/'\)/);
  assert.match(navigation, /worldId:'iga'/);
});

test('IGA architecture is rendered through a dedicated terminal asset rather than an ancient generic house', () => {
  const assets = read('frontend/ancient-world/assets/blocky-asset-library.js');
  assert.match(assets, /function terminal\(/);
  assert.match(assets, /function forecourt\(/);
  assert.match(assets, /terminal,/);
  assert.match(assets, /forecourt,/);
});
