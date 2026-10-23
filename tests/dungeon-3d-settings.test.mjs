import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  dailySeed,
  loadSettings,
  parseSettings,
  saveSettings,
} from '../frontend/js/v3/apps/dungeon/src/game/settings.js';

const mem = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
};

test('settings key is versioned and defaults are sane', () => {
  assert.equal(SETTINGS_KEY, 'aizanoi.dungeon.settings.v1');
  assert.equal(DEFAULT_SETTINGS.assistMode, 'assist');
  assert.equal(DEFAULT_SETTINGS.autoFireReserve, 25);
});

test('missing or broken storage falls back to defaults', () => {
  assert.deepEqual(loadSettings(mem()), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  const storage = mem();
  storage.setItem(SETTINGS_KEY, '{broken');
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
});

test('parse rejects out-of-range values but keeps valid ones', () => {
  const parsed = parseSettings({ assistMode: 'turbo', autoFireReserve: 25, shake: 400, quality: 'ultra' });
  assert.equal(parsed.assistMode, 'assist', 'invalid mode falls back');
  assert.equal(parsed.autoFireReserve, 25, 'valid reserve survives');
  assert.equal(parsed.shake, 100, 'shake clamps to 100');
  assert.equal(parsed.quality, 'auto', 'invalid quality falls back');
  assert.equal(parseSettings({ assistMode: 'manual', quality: 'low', trainingDone: true }).assistMode, 'manual');
});

test('settings round-trip through storage', () => {
  const storage = mem();
  assert.equal(saveSettings(storage, { assistMode: 'auto', shake: 0 }).saved, true);
  const loaded = loadSettings(storage);
  assert.equal(loaded.assistMode, 'auto');
  assert.equal(loaded.shake, 0);
  assert.equal(loaded.quality, 'auto', 'unspecified keys keep defaults');
});

test('denied storage reports failure without throwing', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSettings(denied), DEFAULT_SETTINGS);
  assert.equal(saveSettings(denied, {}).saved, false);
});

test('daily seed is deterministic per local date and stable in format', () => {
  const date = new Date(2026, 9, 23);
  assert.equal(dailySeed(date), 'aizo-daily-2026-10-23');
  assert.equal(dailySeed(date), dailySeed(new Date(2026, 9, 23)));
  assert.notEqual(dailySeed(date), dailySeed(new Date(2026, 9, 24)));
});
