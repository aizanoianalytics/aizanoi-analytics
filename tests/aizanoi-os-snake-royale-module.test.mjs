import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPS } from '../frontend/js/v3/registry.js';

const root = new URL('../frontend/js/v3/apps/snake-royale/', import.meta.url);
const text = path => readFileSync(new URL(path, root), 'utf8');

test('Snake Royale is a first-party desktop module with its own icon', () => {
  const manifest = JSON.parse(text('manifest.json'));
  assert.deepEqual(manifest, { manifestVersion: 1, id: 'snake-royale', type: 'desktop-app', entry: './src/index.js', enabledByDefault: true, requires: [], provides: ['desktop-app'] });
  const app = APPS.find(item => item.id === 'snake-royale');
  assert.equal(app.label, 'AI Snake Royale');
  assert.equal(app.module, '/js/v3/apps/snake-royale/src/index.js');
  assert.equal(app.icon, '/assets/icons/aizanoi-snake-royale.svg');
  assert.match(readFileSync(new URL('../frontend/js/v3/brand-platform.js', import.meta.url), 'utf8'), /'games','dungeon','snake-royale'/);
  assert.match(readFileSync(new URL('../frontend/assets/icons/aizanoi-snake-royale.svg', import.meta.url), 'utf8'), /<svg/);
});

test('in-shell game uses no iframe, inline style or external scripts and owns a cleanup function', () => {
  const src = text('src/index.js');
  assert.doesNotMatch(src, /<iframe|createElement\(['"]iframe|https?:\/\/|style=|\.style\.|cssText/);
  assert.match(src, /return\s+(?:function\s*)?\(?\)?\s*=>|return\s+cleanup/);
  assert.match(src, /\.stop\(\)/);
  assert.match(src, /\.remove\(\)/);
});
