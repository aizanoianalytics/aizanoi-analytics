import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worlds = [
  ['aizanoi-225', 'Aizanoi'],
  ['athens-450-430', 'Athens'],
  ['rome-410-476', 'Rome'],
  ['iga-airport', 'İstanbul Airport'],
];

const sw = readFileSync('frontend/service-worker.js', 'utf8');
const release = readFileSync('frontend/release.js', 'utf8');

test('service worker force-activates new releases so stale shells cannot serve broken builds', () => {
  assert.match(sw, /self\.addEventListener\('install',\s*\(event\)\s*=>\s*event\.waitUntil\(precacheShell\(\)\.then\(\(\)\s*=>\s*self\.skipWaiting\(\)\)\)\)/);
  assert.match(sw, /self\.addEventListener\('activate',[\s\S]*self\.clients\.claim\(\)/);
});

test('release cache version is bumped so force-activation reaches devices on the next visit', () => {
  const version = release.match(/VERSION:\s*'([^']+)'/)?.[1];
  const cache = release.match(/CACHE:\s*'([^']+)'/)?.[1];
  assert.ok(version, 'release VERSION missing');
  assert.equal(cache, `aizanoi-os-shell-v${version}`);
  assert.notEqual(version, '4.5.2', 'cache version must move past 4.5.2 to invalidate stale device shells');
});

for (const [dir, name] of worlds) {
  test(`${name}: entry safety net loads before the world module graph`, () => {
    const html = readFileSync(`frontend/worlds/${dir}/index.html`, 'utf8');
    const netIndex = html.indexOf('<script src="/js/worlds-entry-net.js"></script>');
    const moduleIndex = html.indexOf('type="module"');
    assert.ok(netIndex > -1, `${dir}/index.html must synchronously load /js/worlds-entry-net.js`);
    assert.ok(moduleIndex > -1, `${dir}/index.html must keep its module script`);
    assert.ok(netIndex < moduleIndex, `safety net must load before the module graph in ${dir}`);
  });

  test(`${name}: init() failure calls the safety net and still shows the fatal card`, () => {
    const main = readFileSync(`frontend/worlds/${dir}/js/main.js`, 'utf8');
    assert.match(main, /recordInitCatch\(\s*'([^']+)',\s*err\s*\)/, `${dir} main.js must report init catches to the safety net`);
    assert.match(main, /showFatalInitError\(/, `${dir} main.js must keep showFatalInitError`);
  });
}

test('athens webgl gate refuses to boot without webgl2 (three r174 needs webgl2)', () => {
  const main = readFileSync('frontend/worlds/athens-450-430/js/main.js', 'utf8');
  assert.match(main, /requireWebGL2\(\s*'Athens'\s*\)/);
  assert.doesNotMatch(main, /getContext\('webgl'\)/);
});

test('world entry safety net triggers a cache-bypassed service-worker update on direct visits', () => {
  const net = readFileSync('frontend/js/worlds-entry-net.js', 'utf8');
  assert.match(net, /navigator\.serviceWorker\.register\('\/service-worker\.js',\s*\{\s*scope:\s*'\/',\s*updateViaCache:\s*'none'\s*\}\)/);
});

test('AizanoiOS registration also bypasses the HTTP cache when checking for a new worker', () => {
  const main = readFileSync('frontend/js/v3/main.js', 'utf8');
  assert.match(main, /navigator\.serviceWorker\.register\('\/service-worker\.js',\s*\{\s*scope:\s*'\/',\s*updateViaCache:\s*'none'\s*\}\)/);
});

test('every world page ships the safety net as a served static file', () => {
  const net = readFileSync('frontend/js/worlds-entry-net.js', 'utf8');
  assert.match(net, /__WORLDS_ENTRY_NET__/);
  assert.match(net, /requireWebGL2/);
  assert.match(net, /recordInitCatch/);
});
