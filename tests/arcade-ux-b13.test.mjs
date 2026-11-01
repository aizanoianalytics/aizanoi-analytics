import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../frontend/arcade/${p}`, import.meta.url), 'utf8');
test('Trade Arena links back to Aizanoi Arcade', () => {
  assert.match(read('trade-arena/index.html'), /class="back-link" href="\/arcade\/"/);
});
test('hot-seat privacy overlays offer End match and a safe Escape', () => {
  assert.match(read('holdem/index.html'), /id="ph-end"/);
  assert.match(read('holdem/game.js'), /event\.key === 'Escape'[\s\S]{0,120}ph-show/);
  assert.match(read('anatolian-pact/index.html'), /id="ap-pass-end"/);
  assert.match(read('anatolian-pact/game.js'), /'cancel'[\s\S]{0,80}preventDefault/);
});
test('Maze Chase start focuses the arena instead of blurring to body', () => {
  assert.doesNotMatch(read('maze-chase/game.js'), /focused\.blur\(\)/);
  assert.match(read('maze-chase/index.html'), /id="mc-canvas"[^>]*tabindex="-1"/);
});
test('touch pads route to the only seated human', () => {
  assert.match(read('snake-royale/game.js'), /padOwnerId/);
  assert.match(read('football/game.js'), /touchKeys/);
});
