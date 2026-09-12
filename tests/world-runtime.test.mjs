import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const worlds = ['aizanoi-225', 'rome-410-476', 'athens-450-430', 'iga-airport'];

test('shared world runtime exists and city mains consume it', () => {
  const runtime = read('frontend/worlds/shared/engine/world-runtime.js');
  assert.match(runtime, /export function bindLoading/);
  assert.match(runtime, /export function bootWhenWebGL2/);
  assert.match(runtime, /export function exposeWorldDebug/);
  for (const slug of worlds) {
    const main = read(`frontend/worlds/${slug}/js/main.js`);
    assert.match(main, /shared\/engine\/world-runtime\.js/);
    assert.match(main, /bootWhenWebGL2\(/);
    assert.match(main, /bindLoading\(/);
    assert.match(main, /__WORLD_DEBUG__/);
    assert.match(main, /\.\.\/\.\.\/shared\/engine\/controls\.js/);
    assert.match(main, /\.\.\/\.\.\/shared\/engine\/collision\.js/);
  }
});
