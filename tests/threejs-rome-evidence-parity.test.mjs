import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const index = read('experiments/threejs-rome-renderer/index.html');
const methodology = read('experiments/threejs-rome-renderer/src/methodology.js');

test('Three.js PoC loads evidence methodology independently of renderer bootstrap', () => {
  const methodologyIndex = index.indexOf('./src/methodology.js');
  const rendererIndex = index.indexOf('./src/main.js');
  assert.ok(methodologyIndex > 0, 'methodology module should be loaded by the document');
  assert.ok(rendererIndex > methodologyIndex, 'methodology should load independently before renderer bootstrap');
  assert.match(index, /id="evidence"/);
  assert.match(index, /id="evidenceModal"/);
});

test('evidence methodology consumes shared city/evidence contracts without importing Three.js', () => {
  assert.match(methodology, /ROME_MANIFEST/);
  assert.match(methodology, /EVIDENCE_LEVELS/);
  assert.match(methodology, /TERRAIN_EVIDENCE/);
  assert.match(methodology, /URBAN_FABRIC_METHOD/);
  assert.match(methodology, /__ROME_THREE_EVIDENCE__/);
  assert.doesNotMatch(methodology, /from ['"]three['"]/);
  assert.doesNotMatch(methodology, /three\.module\.js/);
  assert.doesNotMatch(methodology, /__ROME_THREE_POC__/);
});
