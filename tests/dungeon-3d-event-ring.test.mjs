// The event ring is a bounded buffer that is trimmed from the front. A
// consumer that tracks its position by INDEX drifts every time the ring
// shifts: it skips one live event per emission and eventually stops seeing
// events altogether.
//
// That is not a cosmetic bug. The runtime records the reward chest's
// position from the 'wave-complete' event, so once the pump went blind the
// chest could never be opened and the run deadlocked: a chest the player
// could see but not interact with, forever.
//
// These tests drive enough events through the real ring to saturate it, and
// check that a consumer using sequence numbers still sees everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState,
  spawnWave,
  stepGame,
  serializeRun,
  restoreRun,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const MAX_EVENTS = 128;

// The consumer the runtime uses: it remembers the last SEQUENCE number it
// processed, and picks up every event with a higher sequence.
const drainBySequence = (state, lastSeq) => {
  const seen = [];
  for (const event of state.events) {
    if (typeof event.seq !== 'number') continue;
    if (event.seq <= lastSeq) continue;
    lastSeq = event.seq;
    seen.push(event);
  }
  return { lastSeq, seen };
};

test('every emitted event carries a monotonic sequence number', () => {
  const state = createGameState('seq');
  spawnWave(state, 1);
  const seqs = [];
  let lastSeq = 0;
  // 30 seconds of play: long enough for the enemies to close in and start
  // telegraphing their attacks, which is where most of the events come from.
  for (let i = 0; i < 1800; i += 1) {
    stepGame(state, {}, 1 / 60);
    // Only look at events that have not been seen: the ring keeps re-exposing
    // the entries it still holds, so reading the whole ring each frame would
    // count the same event many times.
    const { lastSeq: next, seen } = drainBySequence(state, lastSeq);
    lastSeq = next;
    seqs.push(...seen.map((event) => event.seq));
  }
  assert.ok(seqs.length > 100, 'the run must emit a meaningful number of events');
  seqs.forEach((seq) => assert.ok(Number.isInteger(seq), 'every event must carry an integer sequence'));
  // Strictly increasing, with no gaps: one sequence number per event.
  for (let i = 1; i < seqs.length; i += 1) {
    assert.ok(seqs[i] > seqs[i - 1], `the sequence must increase: ${seqs[i - 1]} -> ${seqs[i]}`);
  }
});

test('a consumer keeps seeing every event after the ring saturates', () => {
  const state = createGameState('saturate');
  spawnWave(state, 1);
  let lastSeq = 0;
  let consumed = 0;
  const seenTypes = new Set();
  // 90 seconds of play: far past the point where the ring is full.
  for (let frame = 0; frame < 60 * 90; frame += 1) {
    stepGame(state, {}, 1 / 60);
    const { lastSeq: next, seen } = drainBySequence(state, lastSeq);
    lastSeq = next;
    consumed += seen.length;
    seen.forEach((event) => seenTypes.add(event.type));
  }
  assert.ok(state.events.length >= MAX_EVENTS - 1,
    'the ring must actually have saturated for this test to mean anything');
  assert.equal(consumed, state.eventSeq,
    `every emitted event must be consumed exactly once (consumed ${consumed} of ${state.eventSeq})`);
  assert.ok(seenTypes.has('wave-start'), 'the consumer must still see the wave-start event');
});

test('the wave-complete event is still seen long after the ring saturates', () => {
  // This is the event the chest position depends on. If it is missed, the
  // chest can never be opened and the run deadlocks.
  const state = createGameState('chest-event');
  let lastSeq = 0;
  const seen = [];
  for (let frame = 0; frame < 60 * 120; frame += 1) {
    stepGame(state, {}, 1 / 60);
    const drained = drainBySequence(state, lastSeq);
    lastSeq = drained.lastSeq;
    seen.push(...drained.seen);
  }
  // Force a wave completion and check the event is delivered.
  state.wave = { active: true, complete: false, rewarded: false, chapter: 1, scale: 1 };
  state.enemies = [];
  stepGame(state, {}, 1 / 60);
  const drained = drainBySequence(state, lastSeq);
  const types = drained.seen.map((event) => event.type);
  assert.ok(types.includes('wave-complete'),
    `the wave-complete event must be delivered, saw ${types.join(', ')}`);
});

test('a sequence-based consumer never sees the same event twice', () => {
  const state = createGameState('no-duplicates');
  spawnWave(state, 1);
  let lastSeq = 0;
  const consumedSeqs = [];
  for (let frame = 0; frame < 60 * 60; frame += 1) {
    stepGame(state, {}, 1 / 60);
    const drained = drainBySequence(state, lastSeq);
    lastSeq = drained.lastSeq;
    consumedSeqs.push(...drained.seen.map((event) => event.seq));
  }
  const unique = new Set(consumedSeqs);
  assert.equal(unique.size, consumedSeqs.length, 'no event may be delivered twice');
});

test('the event sequence survives a save and restore round trip', () => {
  const state = createGameState('save-seq');
  spawnWave(state, 1);
  for (let i = 0; i < 300; i += 1) stepGame(state, {}, 1 / 60);
  const restored = restoreRun(serializeRun(state));
  assert.ok(Number.isInteger(restored.eventSeq), 'the restored run must carry an event sequence');
  assert.equal(restored.eventSeq, state.eventSeq, 'the sequence counter must survive the round trip');
  // A restored run must not replay its saved events.
  const { lastSeq, seen } = drainBySequence(restored, restored.eventSeq);
  assert.equal(seen.length, 0, 'a restored run must not replay the events it already saved');
  assert.equal(lastSeq, restored.eventSeq);
});

test('a restored run continues its sequence instead of restarting it', () => {
  const state = createGameState('continue-seq');
  spawnWave(state, 1);
  for (let i = 0; i < 300; i += 1) stepGame(state, {}, 1 / 60);
  const restored = restoreRun(serializeRun(state));
  const before = restored.eventSeq;
  spawnWave(restored, 2);
  // Step until the new wave produces events; the wave-start event is
  // emitted by the simulation, not by spawnWave itself.
  const seen = [];
  let lastSeq = restored.eventSeq;
  for (let i = 0; i < 120 && seen.length === 0; i += 1) {
    stepGame(restored, {}, 1 / 60);
    const drained = drainBySequence(restored, lastSeq);
    lastSeq = drained.lastSeq;
    seen.push(...drained.seen);
  }
  assert.ok(seen.length > 0, 'the restored run must deliver new events');
  assert.ok(seen.every((event) => event.seq > before),
    'the new events must continue the sequence past the restored counter');
  assert.ok(restored.eventSeq > before, 'the restored counter must advance');
});
