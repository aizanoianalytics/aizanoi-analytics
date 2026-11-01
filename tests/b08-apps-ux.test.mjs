import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(`frontend/js/v3/apps/${p}`, 'utf8');

test('Arcade games are mount/dispose factories gated by active window and editable targets', () => {
  const utils = read('games/assets/game-utils.js');
  assert.match(utils, /function acceptsKey/);
  assert.match(utils, /is-active/);
  for (const [file, global] of [['snake', 'AizanoiArcadeSnake'], ['mines', 'AizanoiArcadeMines'], ['brick', 'AizanoiArcadeBrick'], ['blockfall', 'AizanoiArcadeBlocks']]) {
    const src = read(`games/assets/${file}.js`);
    assert.match(src, new RegExp(`window\.${global} = \{ mount \}`));
    assert.match(src, /acceptsKey\(container/);
    assert.match(src, /removeEventListener\('(keydown|pointermove|pointerdown)'/);
    assert.doesNotMatch(src, /style\.cssText|style="/);
  }
});

test('Arcade loader clears a failed utility promise and offers retry (A23)', () => {
  const app = read('games/src/app.js');
  assert.match(app, /utilsPromise = null; throw error/);
  assert.match(app, /Try again/);
  assert.match(app, /data-az-arcade-css/);
});

test('Mines supports keyboard flagging, flag mode and 44px coarse cells (A25, A26)', () => {
  const mines = read('games/assets/mines.js');
  const css = read('games/assets/arcade.css');
  assert.match(mines, /key === 'f'/);
  assert.match(mines, /data-mines-mode/);
  assert.match(css, /pointer: coarse[^}]*--ag-cell: 44px/);
});

test('Labs uses pressed buttons and pauses hidden videos (A33, A34)', () => {
  const labs = read('labs/src/app.js');
  assert.doesNotMatch(labs, /aria-selected/);
  assert.match(labs, /aria-pressed/);
  assert.match(labs, /\.pause\(\)/);
});

test('Snake Royale and Trade Arena stylesheets are shared and lifecycle-safe; roster controls start disabled (A35, A36)', () => {
  const sr = read('snake-royale/src/index.js');
  const ta = read('trade-arena/src/index.js');
  assert.match(sr, /data-az-snake-royale-css/);
  assert.match(ta, /data-az-trade-arena-css/);
  assert.match(sr, /name="series" disabled/);
  assert.match(sr, /if \(bots\.length < 2\) return/);
  assert.doesNotMatch(sr, /aria-live/);
});

test('Analytics honours the shell motion preference and restores focus (A15, A37)', () => {
  const a = read('analytics/src/app.js');
  assert.match(a, /az-reduce-motion/);
  assert.match(a, /data-analytics-detail-title/);
  assert.match(a, /lastSetId/);
});
