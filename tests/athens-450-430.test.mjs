import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const city = resolve(root, 'frontend/ancient-cities/athens-450-430');
const read = (path) => readFileSync(resolve(city, path), 'utf8');

test('Athens experience provides a standalone WebGL entry page', () => {
  assert.ok(existsSync(resolve(city, 'index.html')));
  const html = read('index.html');
  assert.match(html, /<canvas[^>]+id="glCanvas"/);
  assert.match(html, /import\(['"]\.\/js\/app\.js['"]\)/);
  assert.match(html, /450.*430.*BCE/i);
});

test('Athens city data includes classical monuments, districts, roads and sourced records', async () => {
  assert.ok(existsSync(resolve(city, 'data/city.js')));
  assert.ok(existsSync(resolve(city, 'data/city-source.js')), 'period-correct wrapper should preserve the source dataset beside it');
  const { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, TELEPORTS } = await import(resolve(city, 'data/city.js'));
  assert.match(CITY.title, /ATHENS/);
  assert.match(CITY.title, /450.*430/);
  assert.match(CITY.description, /432.*430/);
  assert.ok(Array.isArray(SOURCES) && SOURCES.length >= 25);
  for (const source of SOURCES) {
    assert.ok(source.id && source.title && source.url, `source ${JSON.stringify(source)} incomplete`);
    assert.match(source.url, /^https?:\/\//, `source ${source.id} has non-http url`);
  }
  assert.ok(REGIONS.length >= 8, 'Athens needs at least the major Attic districts');
  assert.ok(STREETS.length >= 5, 'Athens needs the documented long-distance roads');
  assert.ok(BUILDINGS.length >= 30, 'Athens needs the named Periclean monuments and gates');
  assert.ok(TELEPORTS.length >= 8, 'Athens needs at least the major landmark teleports');
});

test('Athens c. 432–430 visual snapshot excludes later fifth-century buildings and duplicate terrain proxies', async () => {
  const { BUILDINGS, TELEPORTS } = await import(resolve(city, 'data/city.js'));
  const byId = new Map(BUILDINGS.map((item) => [item.id, item]));
  for (const laterId of ['athena-nike', 'erechtheion', 'erechtheion-north', 'erechtheion-karyatid', 'asclepieion', 'pompeion']) {
    assert.equal(byId.has(laterId), false, `${laterId} is later than the rendered c. 432–430 BCE snapshot`);
  }
  assert.equal(byId.has('agoraios-kolonos'), false, 'Agoraios Kolonos is terrain, not a duplicate generic architecture box');
  assert.ok(byId.has('athena-nike-early'));
  assert.ok(byId.has('old-athena-polias'));
  assert.equal(byId.get('hephaisteion')?.state, 'working');
  assert.equal(byId.get('stoa-zeus')?.state, 'working');
  assert.ok(TELEPORTS.some(([id]) => id === 'old-athena-polias'));
  assert.ok(TELEPORTS.some(([id]) => id === 'athena-nike-early'));
  assert.ok(!TELEPORTS.some(([id]) => ['erechtheion', 'athena-nike', 'asclepieion', 'pompeion'].includes(id)));
});

test('Athens manifest is renderer-neutral and references all named monuments', async () => {
  const { ATHENS_MANIFEST, ATHENS_CAPABILITIES } = await import(resolve(city, 'data/manifest.js'));
  assert.equal(ATHENS_MANIFEST.id, 'athens-450-430');
  assert.match(ATHENS_MANIFEST.title, /ATHENS/);
  assert.equal(typeof ATHENS_MANIFEST.contractVersion, 'number');
  assert.ok(ATHENS_CAPABILITIES.monuments > 0);
  assert.ok(ATHENS_CAPABILITIES.teleportTargets > 0);
  assert.ok(ATHENS_CAPABILITIES.districts > 0);
  assert.ok(ATHENS_CAPABILITIES.terrain);
});

test('Athens terrain preserves named hills and avoids a Tiber import', async () => {
  const { HILLS, ERIDANOS, ILISSOS, KEPHISSOS, terrainHeightAt } = await import(resolve(city, 'data/terrain.js'));
  assert.ok(HILLS.some((h) => h.id === 'acropolis'));
  assert.ok(HILLS.some((h) => h.id === 'pnyx'));
  assert.ok(HILLS.some((h) => h.id === 'areopagus'));
  assert.ok(HILLS.some((h) => h.id === 'agoraios-kolonos'));
  assert.ok(HILLS.some((h) => h.id === 'lykabettos'));
  assert.equal(typeof ERIDANOS.x, 'number');
  assert.equal(typeof ILISSOS.x, 'number');
  assert.equal(typeof KEPHISSOS.x, 'number');
  const summit = terrainHeightAt(-25, -310);
  const plain = terrainHeightAt(80, 60);
  assert.ok(summit > plain + 5, `Acropolis (${summit.toFixed(2)} m) should rise above Agora plain (${plain.toFixed(2)} m)`);
});

test('Athens urban fabric is deterministic, bounded, evenly budgeted and explicitly plausible', () => {
  const source = read('data/urban-fabric.js');
  assert.match(source, /DISTRICT_DENSITY/);
  assert.match(source, /fairDistrictQuotas:\s*true/);
  assert.match(source, /districtTarget/);
  assert.match(source, /evidence:\s*\{\s*level:\s*'plausible'/);
});

test('Athens renderer implements user-selected audio, modern overlay, regional minimap and no third-party runtime', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  assert.match(html, /id="audio"/);
  assert.match(html, /id="modern"/);
  assert.match(html, /id="minimap"/);
  assert.match(html, /id="atlas"/);
  assert.match(app, /ATHENS_MANIFEST/);
  assert.doesNotMatch(html, /cdn\.|googleapis\.com|jsdelivr|unpkg/i);
  assert.doesNotMatch(app, /cdn\.|googleapis\.com|jsdelivr|unpkg/i);
});

test('Athens page documents sources locally and links the research route', () => {
  const html = read('index.html');
  assert.match(html, /Sources/i);
  assert.match(html, /research\//);
});
