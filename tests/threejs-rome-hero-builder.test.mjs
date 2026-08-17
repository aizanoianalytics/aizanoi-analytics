import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const hero = read('experiments/threejs-rome-renderer/src/hero-builders.js');
const main = read('experiments/threejs-rome-renderer/src/main.js');

test('Colosseum hero benchmark uses instancing instead of one draw object per pier', () => {
  assert.match(hero, /const bays = 72/);
  assert.match(hero, /const levels = \[0\.13, 0\.34, 0\.55\]/);
  assert.match(hero, /new THREE\.InstancedMesh/);
  assert.match(hero, /facadeInstances: count/);
  assert.match(hero, /userData\.visualEvidence = 'plausible'/);
});

test('Rome renderer actually routes the Colosseum through the hero benchmark builder', () => {
  assert.match(main, /import \{ buildColosseumHero \} from '.\/hero-builders\.js'/);
  assert.match(main, /record\.id === 'colosseum'/);
  assert.match(main, /group\.add\(buildColosseumHero\(THREE, record, material\)\)/);
});
