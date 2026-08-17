import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveQualityController } from '../frontend/ancient-world/engine/performance.js';

test('adaptive quality starts conservatively on mobile and high on desktop', () => {
  assert.equal(createAdaptiveQualityController({ mobile: true }).snapshot().tier, 'balanced');
  assert.equal(createAdaptiveQualityController({ mobile: false }).snapshot().tier, 'high');
});

test('adaptive quality downgrades after sustained slow frames', () => {
  const quality = createAdaptiveQualityController({
    mobile: false,
    downgradeSamples: 4,
    cooldownSamples: 0,
    slowFrameMs: 22,
  });
  for (let i = 0; i < 20; i++) quality.sample(0.05);
  assert.notEqual(quality.snapshot().tier, 'high');
  assert.ok(quality.pixelRatioCap() <= 1.3);
  assert.equal(quality.consumeChanged(), true);
  assert.equal(quality.consumeChanged(), false);
});

test('adaptive quality can recover after sustained fast frames', () => {
  const quality = createAdaptiveQualityController({
    mobile: false,
    downgradeSamples: 1,
    upgradeSamples: 4,
    cooldownSamples: 0,
    slowFrameMs: 18,
    fastFrameMs: 17,
  });
  for (let i = 0; i < 20; i++) quality.sample(0.05);
  assert.equal(quality.snapshot().tier, 'low');
  for (let i = 0; i < 120; i++) quality.sample(0.005);
  assert.equal(quality.snapshot().tier, 'high');
});

test('quality tier forcing validates requested tiers', () => {
  const quality = createAdaptiveQualityController();
  assert.equal(quality.forceTier('low'), 'low');
  assert.throws(() => quality.forceTier('ultra'), /Unknown quality tier/);
});
