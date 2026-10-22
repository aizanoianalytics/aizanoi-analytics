// The runtime's frame loop has to survive a slow frame without letting the
// simulation spiral. These are behavioural checks: they call the runtime's
// own functions, which is the code the render loop uses.
//
// An earlier version of this guard was a regular expression over the source
// file, which passed whether or not the behaviour was right.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GameApp,
  consumeFixedSteps,
  frameDelta,
} from '../frontend/js/v3/apps/dungeon/src/runtime/GameApp.js';

const FIXED_STEP = 1 / 60;
const MAX_CATCH_UP_STEPS = 6;

test('a normal frame runs one fixed step', () => {
  const { steps } = consumeFixedSteps(0, FIXED_STEP);
  assert.equal(steps, 1, 'a 1/60s frame must run exactly one fixed step');
});

test('a long stall is clamped', () => {
  // Without the clamp the camera would jump and the simulation would be
  // asked to catch up on time that has already passed.
  assert.equal(frameDelta(0.016), 0.016, 'a normal frame must pass through');
  assert.equal(frameDelta(5), 0.1, 'a five second stall must be clamped');
  assert.ok(frameDelta(5) < 5, 'a stall must never be used whole');
});

test('a negative or zero delta never runs the simulation backwards', () => {
  for (const delta of [0, -1, -0.5]) {
    assert.equal(frameDelta(delta), 0, `a delta of ${delta} must clamp to zero`);
    const { steps, accumulator } = consumeFixedSteps(0, frameDelta(delta));
    assert.equal(steps, 0, `a delta of ${delta} must not run a step`);
    assert.equal(accumulator, 0, `a delta of ${delta} must not accumulate`);
  }
});

test('the catch-up budget is bounded and the leftover debt is dropped', () => {
  const { steps, accumulator } = consumeFixedSteps(0, frameDelta(5));
  assert.ok(steps <= MAX_CATCH_UP_STEPS,
    `the catch-up must be bounded, ran ${steps} steps`);
  assert.equal(accumulator, 0, `the leftover must be dropped, left ${accumulator}`);
});

test('a frame shorter than a fixed step is carried over, not lost', () => {
  const first = consumeFixedSteps(0, FIXED_STEP / 2);
  assert.equal(first.steps, 0, 'half a step must not run a step');
  assert.ok(first.accumulator > 0, 'half a step must be carried over');
  const second = consumeFixedSteps(first.accumulator, FIXED_STEP / 2);
  assert.equal(second.steps, 1, 'the carried half step must complete a step');
});

test('repeated long frames do not build up an unbounded debt', () => {
  let accumulator = 0;
  for (let i = 0; i < 200; i += 1) {
    const result = consumeFixedSteps(accumulator, frameDelta(1));
    accumulator = result.accumulator;
    assert.ok(accumulator < FIXED_STEP,
      `the debt must not grow, left ${accumulator} on frame ${i}`);
  }
});

test('the runtime exposes a real loop and a real fixed tick', () => {
  assert.equal(typeof GameApp, 'function');
  assert.equal(typeof GameApp.prototype.loop, 'function');
  assert.equal(typeof GameApp.prototype.fixedTick, 'function');
});
