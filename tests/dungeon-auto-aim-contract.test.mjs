import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/scenes/GameScene.js', import.meta.url), 'utf8');

test('auto-aim selects nearest active alive enemy with a linear search', () => {
  assert.match(source, /let nearest = null/);
  assert.match(source, /if \(!enemy\.active \|\| enemy\.hp <= 0\) return/);
  assert.match(source, /if \(d2 <= minDistSq\)/);
  assert.match(source, /this\.player\.lastDirection/);
  assert.match(source, /this\.player\.attack\(\)/);
});

test('auto-aim keeps its cooldown and does not attack without a valid target', () => {
  assert.match(source, /this\._nextAutoAim = time \+ 420/);
  assert.match(source, /if \(!nearest\) return/);
  assert.match(source, /this\.player\.isAttacking \|\| this\.player\.isDead/);
});

test('minimap visibility is controlled by persisted settings', () => {
  const ui = readFileSync(new URL('../frontend/js/v3/apps/dungeon/js/scenes/UIScene.js', import.meta.url), 'utf8');
  assert.match(ui, /loadSettings\(\)\.showMinimap !== false/);
  assert.match(ui, /if \(!this\.minimapEnabled\) return/);
});
