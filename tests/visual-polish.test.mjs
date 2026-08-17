import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Aizanoi OS polish layer is linked from the shell', () => {
  const html = read('frontend/index.html');
  assert.match(html, /aizanoi-polish\.css/);
  assert.match(html, /aizanoi-logo-mark\.svg/);
});

test('games expose upgraded visual and touch affordances', () => {
  const mines = read('frontend/games/mines.js');
  const snake = read('frontend/games/snake.js');
  const brick = read('frontend/games/brick.js');
  assert.match(mines, /mines-timer/);
  assert.match(mines, /long-press/i);
  assert.match(snake, /snake-dpad/);
  assert.match(snake, /DRAG|D-pad|pointerdown/i);
  assert.match(brick, /particles/);
  assert.match(brick, /pointermove/);
});

test('Rome includes a mobile move pad and swipe look path', () => {
  const html = read('frontend/ancient-cities/rome-410-476/index.html');
  const app = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(html, /data-move="KeyW"/);
  assert.match(html, /id="lookPad"/);
  assert.match(app, /querySelectorAll\('\[data-move\]'\)/);
  assert.match(app, /lookPad\.addEventListener\('pointermove'/);
});
