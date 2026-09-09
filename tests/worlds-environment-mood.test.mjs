import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const env = read('frontend/worlds/shared/engine/environment.js');

test('environment.js carries per-world mood profiles for all four worlds', () => {
  assert.match(env, /WORLD_MOODS/);
  for (const id of ['aizanoi:', 'athens:', 'rome:', 'iga:']) {
    assert.match(env, new RegExp(id.replace(':', '\\s*:')));
  }
  // moods are tint multipliers over the shared palette, not separate palettes
  assert.match(env, /skyTint/);
  assert.match(env, /fogDensityDay/);
  assert.match(env, /fogDensityNight/);
  assert.match(env, /exposure/);
});

test('Environment constructor accepts a mood option and applies it to exposure', () => {
  assert.match(env, /WORLD_MOODS\[options\.mood\]/);
  assert.match(env, /toneMappingExposure = this\.mood\.exposure/);
});

test('update() multiplies palette through the mood tints', () => {
  assert.match(env, /const m = this\.mood/);
  assert.match(env, /sr \* m\.skyTint\[0\]/);
  assert.match(env, /isNight \? m\.fogDensityNight : m\.fogDensityDay/);
});
