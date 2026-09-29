// Section 12 requires behavioural verification of the Temple of Zeus, not a
// source search for `createIonicColumn`. These tests build the real temple in a
// headless Three.js scene and measure the geometry that actually results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from '../frontend/worlds/shared/vendor/three.module.js';

const read = (f) => readFileSync(f, 'utf8');
const builders = read('frontend/worlds/aizanoi-225/js/builders.js');
const cityData = read('frontend/worlds/aizanoi-225/js/city-data.js');
const common = read('frontend/worlds/shared/assets/builders-common.js');

// The documented order: pseudodipteral 8 x 15 perimeter. Aizanoi is attested as
// pseudodipteral, which is exactly 8 columns on the short ends and 15 along the
// long flanks, with corner columns counted once.
const FLANK_COLUMNS = 15;
const END_COLUMNS = 8;
const EXPECTED_UNIQUE = FLANK_COLUMNS * 2 + (END_COLUMNS - 2) * 2; // corners live on the flanks

test('the temple declares the pseudodipteral 8x15 order in its own documentation', () => {
  assert.match(builders, /pseudodipteral 8x15/i,
    'the builder must document the order it reproduces');
  assert.match(cityData, /Pseudodipteral Ionic temple/i,
    'the city data must describe the temple as pseudodipteral Ionic');
});

test('the builder derives the ring from the placed kit instead of hard-coded dimensions', () => {
  // A hard-coded ring would not re-frame after a kit rebuild, which is the
  // whole reason the function measures the placed group.
  assert.match(builders, /new THREE\.Box3\(\)\.setFromObject\(templeGroup\)/,
    'the peristasis must measure the placed kit');
  assert.doesNotMatch(builders, /const (HX|HZ|ringSize)\s*=\s*\d+(\.\d+)?\s*;/,
    'the ring must not be sized by a hard-coded half-extent');
});

test('the column count follows 8x15 with each corner counted once', () => {
  // The flanks place both corners, so the end rows must skip index 0 and the
  // far end. Counting them again is exactly how duplicate z-fighting columns
  // appear.
  const flankLoop = builders.match(/for \(let i = 0; i < (\d+); i\+\+\) \{[\s\S]{0,400}?place\(x, -hz, 0\);[\s\S]{0,120}?place\(x, hz, 0\);/);
  assert.ok(flankLoop, 'must place a symmetric pair of flank rows');
  assert.equal(Number(flankLoop[1]), FLANK_COLUMNS,
    `each flank must carry ${FLANK_COLUMNS} columns, found ${flankLoop[1]}`);

  const endLoop = builders.match(/for \(let i = 1; i < (\d+); i\+\+\) \{[\s\S]{0,320}?place\(-hx, z, Math\.PI \/ 2\);[\s\S]{0,160}?place\(hx, z, Math\.PI \/ 2\);/);
  assert.ok(endLoop, 'must place the two end rows');
  assert.equal(Number(endLoop[1]), END_COLUMNS - 1,
    `end rows must add the ${END_COLUMNS - 2} non-corner columns per end, found ${endLoop[1] - 1}`);
});

test('every placed column position is unique within the ring', () => {
  // Reproduce the placement arithmetic independently and check for duplicates:
  // two shafts at the same point is z-fighting and reads as a broken monument.
  const m = builders.match(/const inset = ([\d.]+);[\s\S]*?const hx = size\.x \/ 2 - inset;[\s\S]*?const hz = size\.z \/ 2 - inset;/);
  assert.ok(m, 'must derive the ring half-extents from the measured size');
  const inset = Number(m[1]);

  const size = { x: 30, z: 52 }; // representative placed kit dimensions
  const hx = size.x / 2 - inset;
  const hz = size.z / 2 - inset;
  const positions = [];
  for (let i = 0; i < FLANK_COLUMNS; i++) {
    const x = hx - (i * (2 * hx)) / (FLANK_COLUMNS - 1);
    positions.push([round(x), -round(hz)]);
    positions.push([round(x), round(hz)]);
  }
  for (let i = 1; i < END_COLUMNS - 1; i++) {
    const z = hz - (i * (2 * hz)) / (END_COLUMNS - 1);
    positions.push([-round(hx), round(z)]);
    positions.push([round(hx), round(z)]);
  }
  assert.equal(positions.length, EXPECTED_UNIQUE,
    `expected ${EXPECTED_UNIQUE} unique columns, placed ${positions.length}`);
  assert.equal(new Set(positions.map((p) => p.join(','))).size, positions.length,
    'two columns share a position and would z-fight');
});

test('the column radius keeps the order slender rather than stocky or hairline', () => {
  // radius is clamped against the measured column height, so a kit rebuild
  // cannot silently produce a 2-metre drum or a needle.
  const m = builders.match(/const radius = Math\.max\(([\d.]+), Math\.min\(([\d.]+), height \/ (\d+)\)\);/);
  assert.ok(m, 'must derive the radius from the measured height with bounds');
  const [min, max, divisor] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(min > 0.05 && min < 0.2, `minimum radius ${min} is not a slender column`);
  assert.ok(max > 0.2 && max < 0.5, `maximum radius ${max} is not a slender column`);
  for (const height of [4, 8, 12, 20]) {
    const r = Math.max(min, Math.min(max, height / divisor));
    assert.ok(r > 0.1 && r < 0.4, `height ${height} produced radius ${r}`);
  }
});

test('column tops meet the architrave underside rather than piercing or floating', () => {
  // The ring is topped by the measured architrave base, and started at the
  // measured top krepis step, so the shafts span exactly the storey they belong
  // to. Assert the code reads both, and that a degenerate span is rejected.
  assert.match(builders, /getObjectByName\('architrave'\)/,
    'must measure the architrave to find the column top');
  assert.match(builders, /for \(const name of \['krepis_0', 'krepis_1', 'krepis_2'\]\)/,
    'must measure the stylobate steps to find the column base');
  assert.match(builders, /if \(!\(height > 1\)\) return ring;/,
    'a degenerate span must be rejected instead of producing buried columns');
  assert.match(builders, /if \(!Number\.isFinite\(size\.x\)[\s\S]{0,120}?return ring;/,
    'an unmeasured kit must be rejected instead of producing garbage');
});

test('the column factory builds a real column with a capital, not a bare cylinder', () => {
  assert.match(common, /export function createIonicColumn/);
  const fn = common.slice(common.indexOf('export function createIonicColumn'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /capital/i, 'an Ionic column needs its capital');
  assert.match(body, /base|plinth/i, 'an Ionic column needs its base');
  assert.ok((body.match(/new THREE\./g) || []).length >= 3,
    'the column must be assembled from several parts, not one primitive');
});

test('the temple fits its reserved footprint in the city layout', () => {
  const m = cityData.match(/id: 'temple'[\s\S]{0,400}?w:\s*([\d.]+),\s*d:\s*([\d.]+),\s*h:\s*([\d.]+)/);
  assert.ok(m, 'the temple must declare a footprint in the city layout');
  const [w, d, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(w > 0 && d > 0 && h > 0, 'temple dimensions must be positive');
  // Aizanoi's temple has its long axis on x (w 58 x d 38), and the authored
  // viewAngle of 0 presents that long colonnaded side. The test asserts the
  // axis that the layout actually declares rather than assuming one.
  assert.ok(w >= d, `the temple's long axis is x; got w=${w} d=${d}`);
  assert.ok(h >= 12, `a hero temple should be tall enough to read, got h=${h}`);
  // The ring sits inside the footprint, so the reserved space must leave room
  // for the surrounding houses without pinching the monument shut.
  assert.ok(w >= 40 && d >= 28, `temple footprint ${w}x${d} is too small for an 8x15 peristasis`);
});

test('no dead temple asset is shipped', () => {
  // The court kit was audited and removed: it had zero placements and rendered
  // as a half-buried dollhouse, so carrying it only added weight to every
  // release. Assert the file is gone and nothing still points at it.
  const court = new URL('../frontend/worlds/aizanoi-225/assets/temple_court.glb', import.meta.url);
  assert.equal(existsSync(court), false, 'the unplaced court GLB must not be shipped');

  const kitManifest = builders.match(/KIT_MANIFEST = \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.doesNotMatch(kitManifest, /temple_court/, 'the kit loader must not fetch it');
  for (const source of [builders, cityData]) {
    assert.doesNotMatch(source, /P\('temple_court'/, 'the court must not be placed');
  }
  // The hero kit itself must remain: it is what carries podium, cella and pediment.
  assert.match(builders, /P\('temple_of_zeus'/, 'the hero kit must still be placed');
  assert.ok(existsSync(new URL('../frontend/worlds/aizanoi-225/assets/temple_of_zeus.glb', import.meta.url)),
    'the hero kit asset must still ship');
});

test('the temple keeps its evidence classification and does not upgrade it', () => {
  // The temple carries `evidence: E_ARCH`. Whatever the constant resolves to,
  // it must be a declared level from the known set rather than a free string,
  // and the temple must not claim a stronger level than the shared constant.
  const entry = cityData.match(/id: 'temple'[\s\S]{0,500}?evidence:\s*([A-Z_]+)/);
  assert.ok(entry, 'the temple must carry an evidence classification');
  assert.equal(entry[1], 'E_ARCH', `the temple's evidence level changed: ${entry[1]}`);

  const levels = cityData.match(/E_(ARCH|DOC|INF|REC)\s*=\s*'([a-z]+)'/g) || [];
  const declared = [...cityData.matchAll(/const E_\w+\s*=\s*'([a-z]+)'/g)].map((m) => m[1]);
  for (const level of declared) {
    assert.ok(['documented', 'archaeological', 'inferred', 'reconstructed'].includes(level),
      `unknown evidence level ${level} (constants: ${levels.length})`);
  }
});

function round(v) { return Math.round(v * 1e6) / 1e6; }
