import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('snake stops its interval when its game container is removed', () => {
  const source = readFileSync(resolve(root, 'frontend/games/snake.js'), 'utf8');
  assert.match(source, /container\.isConnected/);
  assert.match(source, /clearInterval\(interval\)/);
  assert.match(source, /interval\s*=\s*null/);
});

test('brick stops its animation frame when its game container is removed', () => {
  const source = readFileSync(resolve(root, 'frontend/games/brick.js'), 'utf8');
  assert.match(source, /container\.isConnected/);
  assert.match(source, /cancelAnimationFrame\(rafId\)/);
  assert.match(source, /rafId\s*=\s*0/);
});
