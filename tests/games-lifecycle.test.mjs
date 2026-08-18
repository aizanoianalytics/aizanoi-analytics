import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const snake = readFileSync(resolve(root, 'frontend/games/snake.js'), 'utf8');
const brick = readFileSync(resolve(root, 'frontend/games/brick.js'), 'utf8');

test('snake stops its timer when its game container is removed', () => {
  assert.match(snake, /container\.isConnected/);
  assert.match(snake, /clearInterval\(interval\)/);
  assert.match(snake, /interval\s*=\s*null/);
});

test('brick uses requestAnimationFrame and stops when detached', () => {
  assert.match(brick, /requestAnimationFrame\(frame\)/);
  assert.match(brick, /cancelAnimationFrame\(rafId\)/);
  assert.match(brick, /container\.isConnected/);
  assert.match(brick, /FRAME_MS\s*=\s*1000\s*\/\s*60/);
  assert.doesNotMatch(brick, /setInterval\(tick\s*,\s*16\)/);
});
