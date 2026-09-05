import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SPAWN, BUILDINGS, CITY, REGIONS, STREETS, WATERS, BOUNDS } from '../frontend/iga/data/airport.js';
import { compactCityLayout, CITY_COMPACTION_PROFILES } from '../frontend/ancient-world/assets/city-layout-tools.js';

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

test('IGA compaction retains real terminal dimensions and finite cinematic framing', () => {
  const layout = compactCityLayout({ city:CITY, regions:REGIONS, streets:STREETS, buildings:BUILDINGS, waters:WATERS, bounds:BOUNDS, spawn:SPAWN }, CITY_COMPACTION_PROFILES.iga);
  const terminal = layout.buildings.find((building) => building.id === 'terminal');
  const apron = layout.buildings.find((building) => building.id === 'apron-west');
  assert.ok(terminal.w > 500 && terminal.h > 20, 'terminal should not collapse into a generic minimum-size primitive');
  assert.ok(Number.isFinite(apron.framing?.distance), 'apron framing distance should remain finite after compaction');
});

test('IGA apron landmarks use authored camera framing rather than a generic empty tarmac view', () => {
  for (const id of ['apron-west', 'apron-east']) {
    const apron = BUILDINGS.find((building) => building.id === id);
    assert.ok(apron?.framing?.distance >= 45 && apron?.framing?.distance <= 90, `${id} needs a close cinematic stand-view distance`);
    assert.ok(apron?.framing?.pitch <= -0.10, `${id} needs a downward apron-view pitch`);
    assert.ok(Array.isArray(apron?.framing?.preferredDirections), `${id} needs an authored view direction`);
  }
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
  const runtime = read('frontend/ancient-world/engine/flat-city-runtime.js');
  assert.match(navigation, /path\.includes\('\/iga\/'\)/);
  assert.match(navigation, /worldId:'iga'/);
  assert.match(runtime, /Number\.isFinite\(view\.pitch\)/);
});

test('IGA architecture is rendered through a dedicated terminal asset rather than an ancient generic house', () => {
  const assets = read('frontend/ancient-world/assets/blocky-asset-library.js');
  assert.match(assets, /function terminal\(/);
  assert.match(assets, /function forecourt\(/);
  assert.match(assets, /function airliner\(/);
  assert.match(assets, /const vehicles=scene\.mobile\?3:7/);
  assert.match(assets, /terminal,/);
  assert.match(assets, /forecourt,/);
});
