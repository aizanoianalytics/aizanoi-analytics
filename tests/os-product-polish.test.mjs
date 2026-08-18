import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const index = readFileSync('frontend/index.html','utf8');
const chat = readFileSync('frontend/js/chat.js','utf8');
const router = readFileSync('frontend/js/os-router.js','utf8');
const terminal = readFileSync('frontend/js/terminal.js','utf8');
const osJs = readFileSync('frontend/js/os-v2.js','utf8');
const osCss = readFileSync('frontend/css/os-v2.css','utf8');
const games = readFileSync('frontend/games/game-utils.js','utf8');
const mines = readFileSync('frontend/games/mines.js','utf8');
const snake = readFileSync('frontend/games/snake.js','utf8');
const brick = readFileSync('frontend/games/brick.js','utf8');

test('Aizanoi OS runtime is split into lightweight framework-free modules', () => {
  assert.match(index, /\/css\/os-core\.css/);
  assert.match(index, /\/css\/os-v2\.css/);
  assert.match(index, /\/js\/chat\.js/);
  assert.match(index, /\/js\/terminal\.js/);
  assert.match(index, /\/js\/os-router\.js/);
  assert.match(index, /\/js\/os-v2\.js/);
  assert.match(index, /\/games\/game-utils\.js/);
  assert.doesNotMatch([chat,router,terminal,osJs].join('\n'), /react|vue|tailwind/i);
});

test('AI responses keep safe markdown plus multiline timeout retry copy and clear UX', () => {
  assert.match(chat, /bubble\.innerHTML = renderMarkdownSafe\(text\)/);
  assert.match(chat, /__AIZANOI_CHAT__/);
  assert.match(chat, /80000/);
  assert.match(chat, /AbortController/);
  assert.match(chat, /!e\.isComposing/);
  assert.match(chat, /!e\.shiftKey/);
  assert.match(osJs, /Retry last/);
  assert.match(osJs, /CHAT_TIMEOUT_MS/);
  assert.match(osJs, /aria-live/);
});

test('core window cleanup and V2 recovery remain covered after extraction', () => {
  assert.match(index, /w\.cleanup = \(\) =>/);
  assert.match(index, /typeof w\.cleanup === 'function'/);
  assert.match(index, /removeEventListener\('mousemove', onMouseMove\)/);
  assert.match(osJs, /taskbarTop/);
  assert.match(osJs, /document\.addEventListener\('mouseup'/);
});

test('mutation observer scopes enhancement work to added nodes', () => {
  assert.match(osJs, /mutation\.addedNodes/);
  assert.match(osJs, /scheduleInteractive/);
  assert.doesNotMatch(osJs, /new MutationObserver\(\(\) => markInteractive\(\)\)/);
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
  const added = [chat,router,terminal,osJs,osCss,games].join('');
  assert.doesNotMatch(added, /multiplayer|leaderboard|sign[ -]?in|user account|comment system|websocket/i);
});

test('modular frontend respects tighter file-size budgets', () => {
  assert.ok(statSync('frontend/index.html').size < 115_000, 'index.html exceeded modular budget');
  assert.ok(statSync('frontend/css/os-core.css').size < 40_000, 'os-core.css too large');
  assert.ok(statSync('frontend/js/chat.js').size < 10_000, 'chat.js too large');
  assert.ok(statSync('frontend/js/terminal.js').size < 12_000, 'terminal.js too large');
  assert.ok(statSync('frontend/js/os-router.js').size < 6_000, 'os-router.js too large');
  assert.ok(statSync('frontend/js/os-v2.js').size < 24_000, 'os-v2.js too large');
  assert.ok(statSync('frontend/css/os-v2.css').size < 18_000, 'os-v2.css too large');
  assert.ok(statSync('frontend/games/game-utils.js').size < 7_000, 'game-utils.js too large');
});
