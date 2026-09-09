import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const quality = read('frontend/worlds/shared/engine/quality.js');
const loop = read('frontend/worlds/shared/engine/loop.js');

test('quality.js exports AdaptiveResolution and DeviceProfile without vendor deps', () => {
  assert.match(quality, /export class AdaptiveResolution/);
  assert.match(quality, /export function DeviceProfile/);
  // worlds runtime is dependency-free vanilla ESM: no imports allowed
  assert.doesNotMatch(quality, /^import /m);
});

test('AdaptiveResolution lowers pixel ratio after sustained p95 overruns', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let ratio = 1.5;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  const metrics = { summary: () => ({ p95Ms: 60 }) }; // 3x over a 22ms budget
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 0 });
  gov.update(); gov.update(); gov.update();
  assert.ok(ratio < 1.5, `expected step-down, ratio=${ratio}`);
  const after = ratio;
  gov.update(); gov.update(); gov.update();
  assert.ok(ratio < after, 'continues stepping down while over budget');
});

test('AdaptiveResolution recovers pixel ratio with sustained headroom', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let ratio = 1.0;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  const metrics = { summary: () => ({ p95Ms: 8 }) };
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 0, maxRatio: 1.5 });
  for (let i = 0; i < 15; i++) gov.update();
  assert.ok(ratio > 1.0, `expected recovery, ratio=${ratio}`);
});

test('AdaptiveResolution never crosses its floor or ceiling', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let ratio = 1.0;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  const bad = { summary: () => ({ p95Ms: 200 }) };
  const gov = new AdaptiveResolution(renderer, bad, { cooldownMs: 0, minRatio: 0.6 });
  for (let i = 0; i < 40; i++) gov.update();
  assert.ok(ratio >= 0.599, `floor respected, ratio=${ratio}`);
  const good = { summary: () => ({ p95Ms: 5 }) };
  const gov2 = new AdaptiveResolution(renderer, good, { cooldownMs: 0, maxRatio: 1.2, minRatio: 0.6 });
  for (let i = 0; i < 40; i++) gov2.update();
  assert.ok(ratio <= 1.2001, `ceiling respected, ratio=${ratio}`);
});

test('AdaptiveResolution respects cooldown — no pumping on one-frame spikes', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let ratio = 1.5;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  // single 60ms frame inside an otherwise fine stream
  let n = 0;
  const metrics = { summary: () => ({ p95Ms: n++ === 0 ? 60 : 10 }) };
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 10_000 });
  gov.update();
  assert.equal(ratio, 1.5, 'single spike must not move resolution');
});

test('DeviceProfile tiers a low-end phone below a desktop', async () => {
  const { DeviceProfile } = await import('../frontend/worlds/shared/engine/quality.js');
  const phone = DeviceProfile({ userAgent: 'iPhone', hardwareConcurrency: 4, deviceMemory: 3 });
  const desktop = DeviceProfile({ userAgent: 'Mozilla/5.0 X11 Linux', hardwareConcurrency: 16, deviceMemory: 8 });
  assert.equal(phone.tier, 'low');
  assert.equal(desktop.tier, 'high');
  assert.ok(phone.dprCap <= desktop.dprCap);
});

test('loop.js FrameMetrics.summary() feeds the governor with p95', () => {
  assert.match(loop, /summary\(\)/);
  assert.match(loop, /p95/);
});
