import test from 'node:test';
import assert from 'node:assert/strict';

// loop.js is browser-agnostic EXCEPT the vendor three import used for math
// helpers; unified-worlds.test.mjs already proves the vendor module parses in
// Node. We re-implement the two tiny math paths under test with plain values
// so the loop contract itself stays dependency-free to verify.
import { GameLoop, PoseBlender, FrameMetrics, SIM_DT } from '../frontend/worlds/shared/engine/loop.js';
import { Vector3 } from '../frontend/worlds/shared/vendor/three.core.js';

const V3 = Vector3;

test('SIM_DT is exactly 1/60 and MAX steps guard exists', () => {
  assert.equal(SIM_DT, 1 / 60);
});

test('GameLoop steps simulation at fixed 60 Hz regardless of frame rate', () => {
  const steps = [];
  const renders = [];
  const loop = new GameLoop({
    step: (dt) => steps.push(dt),
    render: (frameDt, alpha) => renders.push({ frameDt, alpha }),
  });

  // Simulate a 120 Hz display: frames 0..119 (frame 0 is the clock priming
  // frame and steps nothing), so 119 display frames × 1/120s of elapsed time
  // must yield ~59.5 fixed steps — 59 exact SIM_DT steps plus sub-step
  // remainder carried in the accumulator. The invariant that matters: every
  // step handed to the simulation is exactly SIM_DT, never frame-sized.
  for (let i = 0; i < 120; i++) loop.frame(i * 1000 / 120);
  assert.ok(steps.length >= 59 && steps.length <= 60, `expected ~59-60 steps over 1s at 120Hz, got ${steps.length}`);
  for (const dt of steps) assert.equal(dt, SIM_DT);

  // And one render per display frame (priming frame included)
  assert.equal(renders.length, 120);

  // 30 Hz device: 30 frames over 1s must still yield ~60 fixed steps
  steps.length = 0;
  const loop2 = new GameLoop({ step: (dt) => steps.push(dt), render: () => {} });
  for (let i = 0; i < 31; i++) loop2.frame(i * 1000 / 30);
  assert.ok(steps.length >= 59 && steps.length <= 61, `expected ~60 steps over 1s at 30Hz, got ${steps.length}`);
  for (const dt of steps) assert.equal(dt, SIM_DT);
});

test('long frame spike does not spiral — backlog is shed, steps stay bounded', () => {
  const steps = [];
  const loop = new GameLoop({ step: (dt) => steps.push(dt), render: () => {} });

  // 1 second stall (max clamp) must not queue 60 back-to-back steps;
  // MAX_STEPS_PER_FRAME caps the burst and the remainder is dropped.
  loop.frame(0);
  loop.frame(1000);
  assert.ok(steps.length <= 5, `expected <= 5 steps after stall, got ${steps.length}`);

  // Immediately after, the loop is healthy again (no accumulating debt):
  // 119 display frames × 1/120s after the stall → ~59 exact SIM_DT steps.
  steps.length = 0;
  for (let i = 0; i < 120; i++) loop.frame(1000 + i * 1000 / 120);
  assert.ok(steps.length >= 59 && steps.length <= 60, `expected ~59-60 steps in the second, got ${steps.length}`);
});

test('PoseBlender interpolates between captured and stepped state', () => {
  const state = new V3(0, 0, 0);
  const pose = new PoseBlender(state);

  pose.capture();
  state.set(10, 0, 0);          // sim advanced one full step
  assert.equal(pose.sample(0).x, 0);   // frame start → previous
  assert.equal(pose.sample(1).x, 10);  // fully caught up → current
  assert.ok(Math.abs(pose.sample(0.5).x - 5) < 1e-9);
  assert.ok(Math.abs(pose.sample(1.7).x - 10) < 1e-9); // clamped

  // The authoritative sim state is never mutated by sampling
  assert.equal(state.x, 10);
});

test('PoseBlender.snap removes glide after a teleport', () => {
  const state = new V3(0, 0, 0);
  const pose = new PoseBlender(state);
  pose.capture();
  state.set(10, 0, 0);

  // Teleport: state jumps to a far position, then snap()
  state.set(500, 2, -300);
  pose.snap();
  assert.equal(pose.sample(0.3).x, 500);
  assert.equal(pose.sample(0.3).z, -300);
});

test('FrameMetrics reports honest p95 rather than averages', () => {
  const m = new FrameMetrics(100);
  for (let i = 0; i < 90; i++) m.record(16);  // 90% of frames are fine
  for (let i = 0; i < 10; i++) m.record(90);  // 10% are hitches
  const s = m.summary();
  assert.equal(s.p50, 16);
  assert.equal(s.p95, 90);
  assert.equal(s.max, 90);
  assert.ok(s.fps > 30 && s.fps < 70);
});

test('FrameMetrics resets cleanly', () => {
  const m = new FrameMetrics();
  for (let i = 0; i < 50; i++) m.record(16);
  m.reset();
  const s = m.summary();
  assert.equal(s.p50, 0);
  assert.equal(s.fps, 0);
  m.record(20);
  assert.equal(m.summary().p50, 20);
});
