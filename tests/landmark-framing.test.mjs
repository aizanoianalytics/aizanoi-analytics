import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { landmarkFramingDistance, landmarkLookHeight, landmarkLookPitch, landmarkViewDirections } from '../frontend/ancient-world/engine/landmark-framing.js';

const root = resolve(import.meta.dirname, '..');

test('shared landmark framing scales back from large monuments', () => {
  assert.ok(landmarkFramingDistance({ w:125, d:102, h:48 }) > 180);
  assert.ok(landmarkFramingDistance({ w:46, d:22, h:16 }) > 70);
  assert.equal(landmarkViewDirections().length, 8);
});

test('shared landmark look targets the upper mass without extreme pitch', () => {
  const targetY = landmarkLookHeight({ h:48 }, 3);
  const pitch = landmarkLookPitch({ eyeY:4.7, targetY, horizontalDistance:190 });
  assert.ok(pitch > 0 && pitch < 0.2);
});

for (const city of ['rome-410-476','athens-450-430']) {
  test(`${city} uses shared cinematic landmark framing`, () => {
    const source = readFileSync(resolve(root, `frontend/ancient-cities/${city}/js/app.js`), 'utf8');
    assert.match(source, /landmarkFramingDistance/);
    assert.match(source, /landmarkViewDirections/);
    assert.match(source, /lookY/);
    assert.match(source, /arrivalUntil/);
  });
}

test('Aizanoi Temple jump uses the open eastern sanctuary approach', () => {
  const source = readFileSync(resolve(root, 'frontend/historic-world/index.html'), 'utf8');
  assert.match(source, /temple:\{pos:\[-68,20\],look:\[-160,20\]\}/);
});
