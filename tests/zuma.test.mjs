import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const path = 'frontend/js/v3/apps/games/assets/zuma.js';

function engine() {
  assert.ok(existsSync(path), 'Marble Serpent engine must exist');
  const context = { window: {} };
  vm.runInNewContext(readFileSync(path, 'utf8'), context);
  return context.window.AizanoiArcadeZuma;
}

function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

test('Marble Serpent builds a spiral track from the rim to the inner sanctum', () => {
  const api = engine();
  const track = api.buildTrack(480, 640);
  assert.ok(track.points.length > 200);
  assert.ok(track.length > 1000);
  const first = track.points[0];
  const last = track.points[track.points.length - 1];
  const dist = (point) => Math.hypot(point.x - 240, point.y - 320);
  assert.ok(dist(first) > dist(last));
  assert.ok(dist(last) < 120);
  const at = api.pointAt(track, track.length / 2);
  assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y));
});

test('Marble Serpent inserts fired orbs into the chain at the struck position', () => {
  const api = engine();
  const track = api.buildTrack(480, 640);
  const state = api.createState(1, mulberry(5), track);
  state.balls = [
    { color: 0, s: 300 }, { color: 1, s: 276 }, { color: 2, s: 252 },
  ];
  const index = api.insertOrb(state, { color: 1, s: 288 });
  assert.equal(index, 1);
  assert.deepEqual(state.balls.map((ball) => ball.s), [300, 288, 264, 240]);
  assert.deepEqual(state.balls.map((ball) => ball.color), [0, 1, 1, 2]);
});

test('Marble Serpent pops matches of three or more with combo scoring', () => {
  const api = engine();
  const track = api.buildTrack(480, 640);
  const state = api.createState(1, mulberry(9), track);
  state.balls = [
    { color: 2, s: 300 }, { color: 2, s: 276 }, { color: 0, s: 252 }, { color: 1, s: 228 },
  ];
  const popped = api.resolveMatches(state, 0);
  assert.equal(popped, 0);
  state.balls = [
    { color: 2, s: 300 }, { color: 2, s: 276 }, { color: 2, s: 252 }, { color: 1, s: 228 },
  ];
  assert.equal(api.resolveMatches(state, 1), 3);
  assert.equal(state.balls.length, 1);
  assert.equal(state.score, 30);
  assert.equal(state.combo, 1);
  state.balls = [
    { color: 0, s: 300 }, { color: 0, s: 276 }, { color: 0, s: 252 },
  ];
  assert.equal(api.resolveMatches(state, 0), 3);
  assert.equal(state.score, 30 + 60);
  assert.equal(state.combo, 2);
  api.registerMiss(state);
  assert.equal(state.combo, 0);
});

test('Marble Serpent spawns solvable chains and advances the front over time', () => {
  const api = engine();
  const track = api.buildTrack(480, 640);
  const state = api.createState(1, mulberry(13), track);
  for (let step = 0; step < 40; step++) api.spawnTick(state, 0.25);
  assert.ok(state.balls.length > 5);
  for (let i = 2; i < state.balls.length; i++) {
    const triple = state.balls[i].color === state.balls[i - 1].color
      && state.balls[i].color === state.balls[i - 2].color;
    assert.equal(triple, false);
  }
  const front = state.balls[0].s;
  api.advanceChain(state, 1);
  assert.ok(state.balls[0].s > front);
});

test('Marble Serpent loses a life on breach, ends the run at zero, and wins at the final chamber', () => {
  const api = engine();
  const track = api.buildTrack(480, 640);
  const state = api.createState(1, mulberry(17), track);
  assert.equal(state.lives, 3);
  state.balls = [{ color: 0, s: track.length - 1 }];
  api.checkBreach(state);
  assert.equal(state.lives, 2);
  assert.equal(state.balls.length, 0);
  assert.equal(state.over, null);
  state.lives = 1;
  state.balls = [{ color: 0, s: track.length - 1 }];
  api.checkBreach(state);
  assert.equal(state.over, 'lose');
  const champion = api.createState(5, mulberry(17), track);
  champion.spawned = champion.total;
  champion.balls = [];
  champion.shots = [];
  assert.equal(api.checkChamberClear(champion), true);
  assert.equal(champion.over, 'win');
  const climber = api.createState(2, mulberry(17), track);
  climber.spawned = climber.total;
  climber.balls = [];
  climber.shots = [];
  assert.equal(api.checkChamberClear(climber), true);
  assert.equal(climber.level, 3);
  assert.equal(climber.over, null);
});

test('Marble Serpent exposes level tuning and a mount factory, and rejects bad levels', () => {
  const api = engine();
  const first = api.levelConfig(1);
  const fifth = api.levelConfig(5);
  assert.ok(fifth.total > first.total);
  assert.ok(fifth.speed > first.speed);
  assert.ok(fifth.colors >= first.colors);
  assert.equal(typeof api.mount, 'function');
  assert.throws(() => api.createState(0, Math.random, api.buildTrack(480, 640)));
  assert.throws(() => api.createState(6, Math.random, api.buildTrack(480, 640)));
});
