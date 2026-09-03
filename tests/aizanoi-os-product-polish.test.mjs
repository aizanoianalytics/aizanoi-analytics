import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const news = read('frontend/js/v3/apps/news/src/app.js');
const arcade = read('frontend/js/v3/apps/games/src/app.js');
const gameUtils = read('frontend/js/v3/apps/games/assets/game-utils.js');
const notepad = read('frontend/js/v3/apps/notepad/src/app.js');
const appsCss = read('frontend/styles/apps.css');

test('News presents daily and weekly editions as a browsable library', () => {
  assert.match(news, /az-news-library/);
  assert.match(news, /az-news-volume--daily/);
  assert.match(news, /az-news-volume--weekly/);
  assert.match(news, /az-news-spine/);
  assert.match(news, /The Weekly/);
  assert.match(appsCss, /News is an archive\/library/);
  assert.match(appsCss, /\.az-news-shelf-board/);
});

test('Arcade owns one immersive launcher instead of nested generic app cards', () => {
  assert.match(arcade, /az-arcade-library/);
  assert.match(arcade, /az-arcade-tile/);
  assert.match(arcade, /az-arcade-session/);
  assert.doesNotMatch(arcade, /az-simple-grid|az-simple-card/);
  assert.doesNotMatch(gameUtils, /data\.gameAction\s*=\s*['"]restart['"]/);
  assert.match(appsCss, /Arcade owns the full app interior/);
  assert.match(appsCss, /\[data-bf-close\]/);
});

test('Winamp expands into its OS window rather than floating as a second framed card', () => {
  assert.match(appsCss, /\.az-winamp-shell \.az-winamp/);
  assert.match(appsCss, /max-width:none/);
  assert.match(appsCss, /border:0/);
  assert.match(appsCss, /border-radius:0/);
});

test('Notepad editor keeps pointer focus for real keyboard typing', () => {
  assert.match(notepad, /handleTextPointerDown/);
  assert.match(notepad, /event\.stopPropagation\(\)/);
  assert.match(notepad, /addEventListener\('pointerdown',handleTextPointerDown\)/);
  assert.match(notepad, /removeEventListener\('pointerdown',handleTextPointerDown\)/);
  assert.match(appsCss, /\.az-notepad-text[^}]*pointer-events:auto/);
});
