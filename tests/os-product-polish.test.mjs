import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const index = readFileSync('frontend/index.html','utf8');
const osJs = readFileSync('frontend/js/os-v2.js','utf8');
const osCss = readFileSync('frontend/css/os-v2.css','utf8');
const games = readFileSync('frontend/games/game-utils.js','utf8');
const mines = readFileSync('frontend/games/mines.js','utf8');
const snake = readFileSync('frontend/games/snake.js','utf8');
const brick = readFileSync('frontend/games/brick.js','utf8');

test('Aizanoi OS V2 stays modular and framework-free', () => {
  assert.match(index, /\/css\/os-v2\.css/);
  assert.match(index, /\/js\/os-v2\.js/);
  assert.match(index, /\/games\/game-utils\.js/);
  assert.doesNotMatch(osJs, /react|vue|tailwind/i);
});

test('AI responses use safe markdown plus local clear/copy UX', () => {
  assert.match(index, /bubble\.innerHTML = renderMarkdownSafe\(text\)/);
  assert.match(index, /__AIZANOI_CHAT__/);
  assert.match(index, /Copy assistant answer/);
  assert.match(osJs, /Copy last answer/);
  assert.match(osJs, /aria-live/);
});

test('all games use local-only best score and pause controls', () => {
  assert.match(games, /aizanoi-games/);
  assert.match(games, /localStorage/);
  for (const source of [mines,snake,brick]) {
    assert.match(source, /AizanoiGames/);
    assert.match(source, /data-game-action/);
    assert.match(source, /paused/);
  }
});

test('single-publisher scope does not add social/account infrastructure', () => {
  const added = [osJs,osCss,games].join('');
  assert.doesNotMatch(added, /multiplayer|leaderboard|sign[ -]?in|user account|comment system|websocket/i);
});

test('frontend polish respects lightweight performance budgets', () => {
  assert.ok(statSync('frontend/index.html').size < 175_000, 'index.html exceeded transitional budget');
  assert.ok(statSync('frontend/js/os-v2.js').size < 18_000, 'os-v2.js too large');
  assert.ok(statSync('frontend/css/os-v2.css').size < 18_000, 'os-v2.css too large');
  assert.ok(statSync('frontend/games/game-utils.js').size < 7_000, 'game-utils.js too large');
});
