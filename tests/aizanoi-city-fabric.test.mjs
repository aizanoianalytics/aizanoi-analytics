// Section 13: "Make Aizanoi feel like a city." The brief asks for ground
// variation, paths, riverbank treatment, bridge approaches, courtyards, street
// furniture, districts with identifiable character, and it forbids "dense AI
// slop" decoration where props do not earn their place.
//
// The browser audit measures the built scene. This suite is the fast half, and
// it checks the properties that make the fabric deliberate rather than random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const fabric = read('frontend/worlds/shared/engine/fabric.js');
const main = read('frontend/worlds/aizanoi-225/js/main.js');
const city = read('frontend/worlds/aizanoi-225/js/city-data.js');

test('the ground is a graded valley, not a flat plane', () => {
  // A dead-level floor is why the world read as monuments on a table.
  assert.match(fabric, /export function buildGroundRelief/,
    'the ground must be built as terrain, not a PlaneGeometry literal');
  assert.doesNotMatch(main, /new THREE\.PlaneGeometry\(\s*BOUNDS\.maxX - BOUNDS\.minX/,
    'main.js must not build a flat world-sized plane any more');
  assert.match(main, /buildGroundRelief\(BOUNDS/, 'the relief geometry must be used');
  assert.match(main, /groundMesh\.name = 'ground-terrain'/,
    'the terrain must be named so the audit can find and measure it');
  // The relief must be terraced toward the river, not random noise.
  assert.match(fabric, /riverX[\s\S]{0,200}?Math\.tanh\(/,
    'the ground must fall away from the river course');
  // And the amplitude must stay gentle: a rough terrain would fight the
  // collision system and the arrival framing.
  assert.match(fabric, /\* 1\.9/, 'the terrace amplitude must remain gentle');
});

test('the riverbank is treated as built structure, not a painted stripe', () => {
  assert.match(fabric, /export function buildRiverbank/);
  // An embankment wall plus coping, and steps down to the water at a regular
  // interval: a planned riverfront a visitor can read.
  assert.match(fabric, /BoxGeometry\(2\.2, 2\.6, len\)/, 'there must be an embankment wall');
  assert.match(fabric, /coping/i, 'the wall needs a coping course to read as built');
  assert.match(fabric, /for \(let s = 0; s < stepCount; s\+\+\)/, 'steps must be at a fixed interval');
  assert.match(main, /buildRiverbank\(scene, quayStreet/,
    'the riverbank must be built from the real quay street, not a hard-coded line');
});

test('monument courtyards give each building a readable plan', () => {
  assert.match(fabric, /export function buildCourtyards/);
  assert.match(fabric, /courtyard-\$\{b\.id\}/, 'each courtyard must be named after its monument');
  assert.match(fabric, /threshold/i, 'a threshold must orient the building from outside');
  assert.match(main, /buildCourtyards\(scene, BUILDINGS/, 'it must use the real building list');
  // A courtyard under a river or a road would be nonsense.
  assert.match(fabric, /if \(b\.type === 'river' \|\| b\.type === 'road'\) continue;/,
    'non-monument entries must be skipped');
});

test('street furniture follows the streets instead of being scattered', () => {
  assert.match(fabric, /export function buildStreetFurniture/);
  // Props are placed on a real rhythm along a street polyline, offset to the
  // kerb. Sprinkled decoration is exactly what the brief forbids.
  assert.match(fabric, /const steps = Math\.max\(1, Math\.floor\(len \/ 22\)\)/,
    'lamp posts must be spaced along the street length');
  assert.match(fabric, /nx = -dz \/ len/, 'the kerb offset must follow the street normal');
  assert.match(fabric, /for \(let i = 0; i <= count; i\+\+\)/, 'bollards must be evenly spaced');
  assert.match(main, /buildStreetFurniture\(scene, STREETS/);
});

test('districts have identifiable character without random noise', () => {
  assert.match(fabric, /const DISTRICT_PAVING = \{/, 'district surfaces must come from a closed set');
  // A per-tile random colour is precisely the "uniform procedural noise" the
  // brief rules out, so the palette must be keyed by region id.
  // Every region the world actually declares must have its own surface, read
  // from the data rather than from a list duplicated here.
  const regionStart = city.indexOf('export const REGIONS');
  const regionEnd = city.indexOf('];', regionStart);
  const regionBlock = city.slice(regionStart, regionEnd);
  const regions = [...regionBlock.matchAll(/id:\s*'([\w-]+)'/g)].map((m) => m[1]);
  assert.ok(regions.length >= 4, `expected several regions, found ${regions.join(', ')}`);
  for (const region of regions) {
    const key = /^[A-Za-z_$][\w$]*$/.test(region) ? region : `'${region}'`;
    assert.match(fabric, new RegExp(`(?:${key}|'${region}'):\\s*0x`),
      `region "${region}" has no paving colour of its own`);
  }
  assert.match(fabric, /district-\$\{region\.id\}/, 'district paving must be named per region');
  assert.match(main, /buildDistrictPaving\(scene, REGIONS/);
});

test('placement is deterministic, so the city is identical on every load', () => {
  // A city that reshuffles itself per visit cannot be tested and cannot be
  // learned by a visitor.
  assert.match(fabric, /export function hashUnit/, 'there must be a stable hash');
  assert.match(fabric, /function seeded\(str\)/, 'jitter must come from a seeded generator');
  assert.doesNotMatch(fabric, /Math\.random\(\)/,
    'the fabric must not use Math.random; placement has to be reproducible');
});

test('every prop the fabric adds is tied to a data-driven placement', () => {
  // Guards the "AI slop" rule structurally: the fabric only ever places
  // something on a street, a region or a building, never on a bare coordinate.
  for (const fn of ['buildRiverbank', 'buildCourtyards', 'buildStreetFurniture', 'buildDistrictPaving']) {
    const start = fabric.indexOf(`export function ${fn}`);
    assert.ok(start > 0, `${fn} must exist`);
    const next = fabric.indexOf('\nexport function', start + 1);
    const body = fabric.slice(start, next > 0 ? next : fabric.length);
    assert.doesNotMatch(body, /Math\.random\(\)/, `${fn} must not randomise placement`);
  }
  // The city must be wired into the build order, not merely defined.
  for (const call of ['buildRiverbank(', 'buildCourtyards(', 'buildStreetFurniture(', 'buildDistrictPaving(']) {
    assert.ok(main.includes(call), `main.js must call ${call}`);
  }
});

test('the fabric audit is registered as an operator diagnostic', () => {
  assert.match(read('tests/test-ownership.test.mjs'), /aizanoi-city-fabric-audit\.mjs/,
    'the city fabric audit must be owned, or it becomes an untracked script');
});
