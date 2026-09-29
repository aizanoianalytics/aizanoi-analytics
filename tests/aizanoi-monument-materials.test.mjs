import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../frontend/worlds/aizanoi-225/js/main.js', import.meta.url), 'utf8');

test('Aizanoi GLB monuments prevent black backface silhouettes', () => {
  assert.match(main, /function stabilizeMonumentMaterials\(group\)/);
  assert.match(main, /material\.side = THREE\.DoubleSide/);
  assert.match(main, /material\.emissive\.copy\(material\.color\)/);
  assert.match(main, /stabilizeMonumentMaterials\(group\)/);
});
