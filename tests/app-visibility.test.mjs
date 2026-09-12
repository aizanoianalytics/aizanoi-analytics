import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = readFileSync(new URL('../frontend/js/v3/registry.js', import.meta.url), 'utf8');

test('canonical catalog marks public products and shell utilities separately', () => {
  assert.match(registry, /visibility:'public'/);
  assert.match(registry, /visibility:'utility'/);
  assert.match(registry, /export function isUtilityApp/);
  for (const id of ['news', 'videos', 'analytics', 'worlds', 'forge']) {
    assert.match(registry, new RegExp(`id:'${id}'[\\s\\S]*?visibility:'public'`));
  }
  for (const id of ['calculator', 'browser', 'winamp', 'recycle-bin']) {
    assert.match(registry, new RegExp(`id:'${id}'[\\s\\S]*?visibility:'utility'`));
  }
});
