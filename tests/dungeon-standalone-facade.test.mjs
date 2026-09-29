// Section 24: the standalone /dungeon/ route must remain a first-class
// fullscreen route, and both execution modes must run the same canonical game
// implementation. These assertions guard both halves of that contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CANONICAL = 'frontend/js/v3/apps/dungeon';
const STANDALONE = 'frontend/dungeon';

test('the standalone route is one HTML that loads the canonical bootstrap directly', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const full = `${dir}/${entry}`;
      if (statSync(join(ROOT, full)).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(STANDALONE);

  assert.deepEqual(files, [`${STANDALONE}/index.html`],
    `the standalone route must be exactly one HTML, found: ${files.join(', ')}`);

  const html = read(`${STANDALONE}/index.html`);
  // No local proxy: the module src must point at the canonical implementation.
  const moduleSrc = html.match(/<script type="module" src="([^"]+)"/);
  assert.ok(moduleSrc, 'the standalone route must load a module entry point');
  assert.match(moduleSrc[1], /^\.\.\/js\/v3\/apps\/dungeon\/js\/standalone\.js$/,
    `the standalone route must load the canonical bootstrap, got ${moduleSrc[1]}`);
  // The canonical path legitimately ends in js/standalone.js; what must not
  // exist is a shim *inside* the standalone route, i.e. a relative path that
  // does not climb out to apps/dungeon.
  assert.doesNotMatch(moduleSrc[1], /^\.\//,
    'the standalone route must not route through a local re-export shim');
});

test('the canonical module owns the whole implementation', () => {
  // Everything the game actually needs must live under apps/dungeon, so the
  // standalone route has nothing to duplicate or proxy.
  const canonicalJs = readdirSync(join(ROOT, CANONICAL, 'js')).filter((f) => f.endsWith('.js'));
  assert.ok(canonicalJs.includes('standalone.js'), 'the canonical standalone bootstrap must exist');
  assert.ok(canonicalJs.includes('main.js'), 'the canonical launcher must exist');
  for (const required of ['scenes/GameScene.js', 'systems/CombatSystem.js', 'data/levels.js']) {
    assert.ok(existsSync(join(ROOT, CANONICAL, 'js', required)),
      `canonical implementation must own ${required}`);
  }
});

test('the standalone route stays a first-class fullscreen route', () => {
  const html = read(`${STANDALONE}/index.html`);
  // The route must not depend on the AizanoiOS shell to be playable.
  assert.match(html, /id="game-container"/, 'the route must own its game container');
  assert.match(html, /id="fullscreen-btn"/, 'fullscreen must remain available');
  assert.match(html, /id="orientation-warning"/, 'the orientation guard must remain');
  assert.doesNotMatch(html, /app=dungeon|\?app=/, 'the route must not require the AizanoiOS shell');
  assert.match(html, /<meta name="viewport"/, 'the route must remain mobile-capable');
  assert.match(html, /landscape/, 'the route must keep its landscape-first guidance');
});

test('both execution modes resolve to the same canonical launcher', () => {
  const standaloneBootstrap = read(`${CANONICAL}/js/standalone.js`);
  const aizoMount = read(`${CANONICAL}/src/index.js`);
  // Both modes must go through launchDungeonGame, so the game, scenes and
  // systems cannot diverge between the shell and the standalone page.
  assert.match(standaloneBootstrap, /import \{ launchDungeonGame \} from '\.\/main\.js'/,
    'the standalone bootstrap must import the canonical launcher');
  assert.match(aizoMount, /launchDungeonGame/,
    'the AizanoiOS mount must also use the canonical launcher');
  assert.doesNotMatch(standaloneBootstrap, /new Phaser\.Game/,
    'the standalone bootstrap must not construct its own game instance');
});

test('no test reaches the game through a proxy path', () => {
  // The four suites that used to import frontend/dungeon/js/* were the only
  // reason the proxies existed. They now import the canonical modules, so a
  // deleted proxy cannot silently break a test.
  const PROXY_PATH = ['frontend', 'dungeon', 'js'].join('/') + '/';
  const suites = readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.test.mjs') && f !== 'dungeon-standalone-facade.test.mjs');
  const offenders = [];
  for (const suite of suites) {
    const source = read(`tests/${suite}`);
    if (source.includes(PROXY_PATH)) offenders.push(suite);
  }
  assert.deepEqual(offenders, [],
    `these suites still import through a deleted proxy: ${offenders.join(', ')}`);
});

test('the canonical launcher publishes the game for both modes', () => {
  const main = read(`${CANONICAL}/js/main.js`);
  assert.match(main, /window\.AIZANOI_DUNGEON_GAME\s*=\s*game/,
    'the launcher must publish the instance so both modes are auditable');
  assert.match(main, /export async function launchDungeonGame/,
    'launchDungeonGame must remain the single entry point');
});
