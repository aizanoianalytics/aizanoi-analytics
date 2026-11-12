import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APPS } from '../frontend/js/v3/registry.js';

const root = new URL('../frontend/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Aizanoi Wars is a distinct Arcade route with external assets under strict CSP', () => {
  const html = read('arcade/aizanoi-wars/index.html');
  const css = read('arcade/aizanoi-wars/game.css');
  const game = read('arcade/aizanoi-wars/game.js');
  assert.match(html, /<title>Aizanoi Wars/);
  assert.match(html, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/arcade\/aizanoi-wars\/">/);
  assert.match(html, /<script src="\.\/game\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/game\.css">/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|<style\b|\son\w+=|\sstyle=/i);
  assert.doesNotMatch(html, /https:\/\/fonts\.googleapis\.com/);
  assert.match(css, /#view/);
  assert.match(css, /#boot\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(game, /window\.__ready/);
  assert.match(game, /window\.__G/);
  assert.match(game, /window\.__THREE__="180"/);
  assert.doesNotMatch(game, /style="|\.style\.cssText/, 'game HUD and benchmark must not inject inline style under production CSP');
  assert.match(read('arcade/index.html'), /href="\/arcade\/aizanoi-wars\/"/);
  assert.ok(existsSync(new URL('arcade/aizanoi-wars/THIRD_PARTY_NOTICES.txt', root)));
});

test('AizanoiOS has its own Wars app and desktop shortcut', () => {
  const wars = APPS.find(app => app.id === 'aizanoi-wars');
  const dungeon = APPS.find(app => app.id === 'dungeon');
  assert.equal(wars?.label, 'Aizanoi Wars');
  assert.equal(wars?.module, '/js/v3/apps/aizanoi-wars/src/index.js');
  assert.ok(dungeon);
  assert.match(read('js/v3/brand-platform.js'), /'games','dungeon','aizanoi-wars'/);
  assert.match(read('js/v3/apps/aizanoi-wars/src/index.js'), /iframe/);
  assert.match(read('js/v3/apps/index.md'), /aizanoi-wars\/index\.md/);
});
