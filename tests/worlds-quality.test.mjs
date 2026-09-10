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
  const metrics = { summary: () => ({ p95: 60 }) }; // 3x over a 22ms budget
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 0, sampleIntervalMs: 0 });
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
  const metrics = { summary: () => ({ p95: 8 }) };
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 0, sampleIntervalMs: 0, maxRatio: 1.5 });
  for (let i = 0; i < 15; i++) gov.update();
  assert.ok(ratio > 1.0, `expected recovery, ratio=${ratio}`);
});

test('AdaptiveResolution never crosses its floor or ceiling', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let ratio = 1.0;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  const bad = { summary: () => ({ p95: 200 }) };
  const gov = new AdaptiveResolution(renderer, bad, { cooldownMs: 0, sampleIntervalMs: 0, minRatio: 0.6 });
  for (let i = 0; i < 40; i++) gov.update();
  assert.ok(ratio >= 0.599, `floor respected, ratio=${ratio}`);
  const good = { summary: () => ({ p95: 5 }) };
  const gov2 = new AdaptiveResolution(renderer, good, { cooldownMs: 0, sampleIntervalMs: 0, maxRatio: 1.2, minRatio: 0.6 });
  for (let i = 0; i < 40; i++) gov2.update();
  assert.ok(ratio <= 1.2001, `ceiling respected, ratio=${ratio}`);
});

test('AdaptiveResolution respects cooldown — no pumping on one-frame spikes', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let ratio = 1.5;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  // single 60ms frame inside an otherwise fine stream
  let n = 0;
  const metrics = { summary: () => ({ p95: n++ === 0 ? 60 : 10 }) };
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 10_000 });
  gov.update();
  assert.equal(ratio, 1.5, 'single spike must not move resolution');
});

test('AdaptiveResolution consumes the real FrameMetrics summary contract', async () => {
  const [{ AdaptiveResolution }, { FrameMetrics }] = await Promise.all([
    import('../frontend/worlds/shared/engine/quality.js'),
    import('../frontend/worlds/shared/engine/loop.js'),
  ]);
  let ratio = 1.5;
  const renderer = { setPixelRatio(v) { ratio = v; }, getPixelRatio: () => ratio };
  const metrics = new FrameMetrics(20);
  for (let i = 0; i < 20; i++) metrics.record(60);
  const gov = new AdaptiveResolution(renderer, metrics, { cooldownMs: 0, sampleIntervalMs: 0 });
  gov.update(); gov.update(); gov.update();
  assert.ok(ratio < 1.5, `real FrameMetrics p95 must lower resolution, ratio=${ratio}`);
});

test('AdaptiveResolution samples frame metrics at a bounded cadence', async () => {
  const { AdaptiveResolution } = await import('../frontend/worlds/shared/engine/quality.js');
  let summaries = 0;
  const renderer = { setPixelRatio() {}, getPixelRatio: () => 1 };
  const metrics = { summary: () => { summaries += 1; return { p95: 20 }; } };
  const gov = new AdaptiveResolution(renderer, metrics, { sampleIntervalMs: 500 });
  gov.update(0);
  gov.update(100);
  gov.update(499);
  assert.equal(summaries, 1, 'sorting the metrics ring every frame wastes the frame budget');
  gov.update(500);
  assert.equal(summaries, 2);
});

test('DeviceProfile tiers a low-end phone below a desktop', async () => {
  const { DeviceProfile } = await import('../frontend/worlds/shared/engine/quality.js');
  const phone = DeviceProfile({ userAgent: 'iPhone', hardwareConcurrency: 4, deviceMemory: 3 });
  const desktop = DeviceProfile({ userAgent: 'Mozilla/5.0 X11 Linux', hardwareConcurrency: 16, deviceMemory: 8 });
  assert.equal(phone.tier, 'low');
  assert.equal(desktop.tier, 'high');
  assert.ok(phone.dprCap <= desktop.dprCap);
});

test('all four worlds apply the shared device profile and adaptive resolution', () => {
  const worlds = [
    'aizanoi-225',
    'athens-450-430',
    'rome-410-476',
    'iga-airport',
  ];
  for (const world of worlds) {
    const source = read(`frontend/worlds/${world}/js/main.js`);
    assert.match(source, /import \{ DeviceProfile, AdaptiveResolution \} from '\.\.\/\.\.\/shared\/engine\/quality\.js'/, `${world}: quality import`);
    assert.match(source, /const profile = DeviceProfile\(\)[\s\S]*?new THREE\.WebGLRenderer\(\{[\s\S]*?antialias: profile\.antialias/, `${world}: profile configures renderer construction`);
    assert.match(source, /resolutionGovernor = new AdaptiveResolution\(renderer, frameMetrics/, `${world}: governor construction`);
    assert.match(source, /gameLoop\.frame\(now\);\s*if \(resolutionGovernor\) resolutionGovernor\.update\(\);/, `${world}: governor update`);
    assert.match(source, /shadowMapSize: profile\.shadowMapSize/, `${world}: tiered shadow map`);
  }
});

test('environment applies tiered shadow-map size and radius', () => {
  const environment = read('frontend/worlds/shared/engine/environment.js');
  assert.match(environment, /options\.shadowMapSize \?\? 2048/);
  assert.match(environment, /options\.shadowRadius \?\? 2/);
  assert.match(environment, /shadow\.mapSize\.set\(this\.shadowMapSize, this\.shadowMapSize\)/);
  assert.match(environment, /shadow\.radius = this\.shadowRadius/);
});

test('loop.js FrameMetrics.summary() feeds the governor with p95', () => {
  assert.match(loop, /summary\(\)/);
  assert.match(loop, /p95/);
});
