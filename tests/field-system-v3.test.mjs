import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const frontend = path.join(root, 'frontend');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const index = read('frontend/index.html');
const tokens = read('frontend/styles/tokens.css');
const shell = read('frontend/styles/shell.css');
const components = read('frontend/styles/components.css');
const deviceShell = read('frontend/styles/device-shell.css');
const apps = read('frontend/styles/apps.css');
const main = read('frontend/js/v3/main.js');
const release = read('frontend/release.js');
const shellJs = read('frontend/js/v3/shell.js');
const osJs = read('frontend/js/v3/aizanoi-os.js');
const brandJs = read('frontend/js/v3/brand-platform.js');
const store = read('frontend/js/v3/store.js');
const registrySource = read('frontend/js/v3/registry.js');
const manifest = read('frontend/manifest.webmanifest');
const sw = read('frontend/service-worker.js');
const worldBridge = read('frontend/ancient-world/engine/city-experience.js');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const product = read('PRODUCT.md');
const contentPolicy = read('CONTENT_POLICY.md');
const newsBuild = read('scripts/news/build-news.mjs');

const releaseVersion = release.match(/VERSION:\s*'([^']+)'/)?.[1];
const releaseCache = release.match(/CACHE:\s*'([^']+)'/)?.[1];
assert.ok(releaseVersion, 'release VERSION missing');
assert.equal(releaseCache, `aizanoi-os-shell-v${releaseVersion}`, 'release cache namespace must track VERSION');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const legacyPaths = [
  'frontend/css',
  'frontend/icons',
  'frontend/js/chat.js',
  'frontend/js/os-archive.js',
  'frontend/js/os-distribution-loader.js',
  'frontend/js/os-intent.js',
  'frontend/js/os-legacy-sanitizer.js',
  'frontend/js/os-platform-runtime.js',
  'frontend/js/os-platform.js',
  'frontend/js/os-product-polish.js',
  'frontend/js/os-router.js',
  'frontend/js/os-shell.js',
  'frontend/js/os-state.js',
  'frontend/js/os-unified.js',
  'frontend/js/os-v2.js',
  'frontend/js/os-workbench-archive.js',
  'frontend/js/os-workbench-data.js',
  'frontend/js/os-workbench-readers.js',
  'frontend/js/os-workbench-shell.js',
  'frontend/js/os-workbench.js',
  'frontend/js/terminal.js'
];
for (const relative of legacyPaths) assert.equal(existsSync(path.join(root, relative)), false, `${relative} must remain retired`);

assert.ok(statSync(path.join(frontend, 'index.html')).size < 12_000, 'canonical shell HTML regressed into an oversized document');
assert.match(index, /AizanoiOS/);
assert.match(index, /Media, Data, Software & Historical Worlds/);
assert.match(index, /\/styles\/tokens\.css/);
assert.match(index, /\/styles\/base\.css/);
assert.match(index, /\/styles\/shell\.css/);
assert.match(index, /\/styles\/components\.css/);
assert.match(index, /\/styles\/device-shell\.css/);
assert.doesNotMatch(index, /<style\b|style="|<script(?![^>]*type="application\/ld\+json")(?![^>]*src=)|onclick=|onmousedown=|onmouseup=/i);
assert.match(index, /<script type="application\/ld\+json">/);
assert.doesNotMatch(index, /Aizanoi AI|HR AI|chatbot|Windows XP|Luna/i);
assert.match(index, /type="module" src="\/js\/v3\/main\.js"/);

for (const source of [main,shellJs,osJs,brandJs,store,registrySource]) {
  assert.doesNotMatch(source, /os-(?:platform|unified|product-polish|v2)|os-workbench|chat\.js/i);
}
assert.match(main, /installAizanoiOS/);
assert.match(main, /installBrandPlatform/);
assert.match(main, /const RELEASE=globalThis\.AIZANOI_RELEASE/);
assert.match(main, /const \{VERSION,BUILD\}=RELEASE/);
assert.match(main, /window\.AIZANOI_OS/);
assert.match(osJs, /wireDockMagnification/);
assert.match(osJs, /az-launchpad-search/);
assert.match(osJs, /contextmenu/);
assert.match(brandJs, /\['news','videos','analytics','worlds','forge'\]/);
assert.match(brandJs, /az-phone-home/);
assert.match(brandJs, /az-tablet-home/);
assert.match(brandJs, /data-az-product|azProduct/);
assert.match(brandJs, /data-az-device-shell|azDeviceShell/);

// Arcade intentionally preserves five pre-V3 game runtimes byte-for-byte while
// moving their ownership under the games module. They are compatibility assets,
// not V3 application source. Keep this exception exact and locked; adding any
// new file here requires an explicit review plus Arcade architecture/browser QA.
const arcadeCompatibilityAssets = new Set([
  path.join(frontend, 'js/v3/apps/games/assets/blockfall.js'),
  path.join(frontend, 'js/v3/apps/games/assets/brick.js'),
  path.join(frontend, 'js/v3/apps/games/assets/game-utils.js'),
  path.join(frontend, 'js/v3/apps/games/assets/mines.js'),
  path.join(frontend, 'js/v3/apps/games/assets/snake.js')
]);
assert.deepEqual(
  [...arcadeCompatibilityAssets].filter((file) => !existsSync(file)),
  [],
  'declared Arcade compatibility asset is missing'
);

const v3ModuleFiles = walk(path.join(frontend, 'js/v3')).filter((file) => file.endsWith('.js'));
const inlineMarkupDebt = [];
for (const file of v3ModuleFiles) {
  if (arcadeCompatibilityAssets.has(file)) continue;
  const source = readFileSync(file, 'utf8');
  if (/style\s*=\s*["']|\son(?:click|mousedown|mouseup|touchstart|touchend)\s*=/i.test(source)) {
    inlineMarkupDebt.push(path.relative(root, file));
  }
}
assert.deepEqual(inlineMarkupDebt, [], `v3 modules reintroduced inline style/event-handler markup:\n${inlineMarkupDebt.join('\n')}`);

for (const css of [tokens, shell, components, deviceShell, apps]) {
  const vars = [...css.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((match) => match[1]);
  assert.equal(vars.filter((name) => !name.startsWith('az-')).length, 0, 'v3 styles introduced a non-canonical CSS token namespace');
}
const importantCount = [tokens, shell, components,deviceShell,apps].reduce((sum, css) => sum + (css.match(/!important/g) || []).length, 0);
assert.ok(importantCount < 40, `v3 CSS important count is ${importantCount}; must stay below 40`);
assert.match(tokens, /--az-paper:\s*#fffaf0/i);
assert.match(tokens, /--az-brass:\s*#a9783e/i);
assert.match(tokens, /--az-teal:\s*#2d8791/i);
assert.match(tokens, /--az-control-touch:\s*44px/i);
assert.match(deviceShell, /@media \(max-width:599px\)/);
assert.match(deviceShell, /@media \(min-width:600px\) and \(max-width:1199px\)/);
assert.match(deviceShell, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
assert.match(deviceShell, /min-height:44px/);
assert.match(deviceShell, /az-launchpad-overlay/);

for (const [name, css] of Object.entries({shell,components,deviceShell,apps})) {
  const tiny=[...css.matchAll(/font(?:-size)?\s*:\s*([0-9.]+)px/gi)].map((m)=>Number(m[1])).filter((n)=>n>0&&n<11);
  assert.deepEqual(tiny,[],`${name} contains functional typography below 11px: ${tiny.join(', ')}`);
}

const registry = await import(pathToFileURL(path.join(frontend, 'js/v3/registry.js')).href + `?t=${Date.now()}`);
assert.equal(registry.APPS.length, 14, 'public AizanoiOS catalog must contain the eight product families plus the six workspace utilities');
assert.equal(registry.ALL_APPS.length, 14, 'combined public app catalog must match the registry exactly');
assert.equal('WORKBENCH_APPS' in registry, false, 'retired Workbench catalog export returned');
assert.deepEqual(registry.WORLDS.map((world) => world.id), ['aizanoi','rome','athens']);
for (const id of ['news','videos','analytics','worlds','forge','journal','labs','games']) {
  assert.ok(registry.APPS.some((app)=>app.id===id),`missing public Aizanoi platform app ${id}`);
}
for (const id of ['workspace','notepad','calculator','camera','winamp','recycle-bin']) {
  assert.ok(registry.APPS.some((app)=>app.id===id),`missing AizanoiOS workspace app ${id}`);
}
for (const id of ['workbench','archive','notes','data-lab','source-reader','artifact-viewer','projects','terminal','monitor']) {
  assert.equal(registry.appById(id),null,`${id} must remain retired from public routing`);
}
assert.equal(registry.ALL_APPS.some((app) => /Aizanoi AI|HR AI|chatbot/i.test(`${app.id} ${app.label}`)), false, 'retired AI app returned to registry');
assert.equal(new Set(registry.ALL_APPS.map((app) => app.id)).size, registry.ALL_APPS.length, 'public app ids must be unique');

assert.match(product, /independent digital studio/i);
assert.match(product, /Aizanoi News/);
assert.match(product, /Aizanoi Analytics/);
assert.match(product, /Aizanoi Forge/);
assert.match(product, /phone-like home screen/i);
assert.match(product, /tablet/i);
assert.doesNotMatch(product, /Aizanoi Workbench/);
assert.match(contentPolicy, /source links are mandatory/i);
assert.match(newsBuild, /at least one source is required/);
for (const category of ['ai','technology','economy-markets','football']) assert.match(newsBuild,new RegExp(`'${category}'`));
assert.match(registrySource, /AI, Technology, Economy \/ Markets and Football/i);
assert.match(brandJs, /AI, Technology, Economy \/ Markets and Football/i);
assert.doesNotMatch(`${registrySource}\n${brandJs}`, /world, sports and culture/i);
assert.ok(existsSync(path.join(root,'frontend/news/index.json')),'generated News feed baseline missing');

assert.match(manifest, /"name"\s*:\s*"AizanoiOS"/);
assert.match(manifest, /"name"\s*:\s*"Aizanoi News"/);
assert.match(manifest, /"name"\s*:\s*"Historical Worlds"/);
assert.doesNotMatch(manifest, /hr-analytics|Aizanoi AI|HR AI/i);
assert.match(sw, /importScripts\('\/release\.js'\)/);
assert.match(sw, /const CACHE\s*=\s*self\.AIZANOI_RELEASE\.CACHE/);
assert.match(sw, /\/js\/v3\/aizanoi-os\.js/);
assert.match(sw, /\/js\/v3\/brand-platform\.js/);
assert.match(sw, /\/js\/v3\/module-registry\.generated\.js/);
assert.match(sw, /\/styles\/device-shell\.css/);
assert.match(sw, /\/news\/index\.json/);
assert.match(sw, /self\.addEventListener\('install',\s*\(event\)\s*=>\s*event\.waitUntil\(precacheShell\(\)\)\)/, 'service worker install must wait for a complete precache');
assert.doesNotMatch(sw, /skipWaiting/, 'service worker upgrades must not force new code over open AizanoiOS clients');
assert.match(sw, /networkFirstStatic/, 'mutable static assets must prefer the revalidated network response');
assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/, 'service worker must explicitly ignore API routes');
assert.doesNotMatch(sw, /os-(?:platform|unified|product-polish|v2)\.js/);

assert.match(worldBridge, /aizanoi-field-session-v1/);
assert.match(worldBridge, /aw-field-system-return/);
assert.match(worldBridge, /location\.href='\/\?app=worlds&from=historical-world'/);
assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
assert.doesNotMatch(nginx, /proxy_pass|127\.0\.0\.1:3001/);

const canonicalFiles = walk(frontend).filter((file) => /\.(?:html|css|js|json|webmanifest|svg|xml|txt)$/i.test(file));
const retired = [/Aizanoi AI/i,/HR AI/i,/Windows XP/i,/Luna theme/i,/chatbot/i];
const allowedHistoricalMentions = new Set([path.join(frontend,'404.html'),path.join(frontend,'500.html'),path.join(frontend,'503.html')]);
const violations=[];
for (const file of canonicalFiles) {
  if (allowedHistoricalMentions.has(file)) continue;
  const source=readFileSync(file,'utf8');
  for (const pattern of retired) if (pattern.test(source)) violations.push(`${path.relative(root,file)} -> ${pattern}`);
}
assert.deepEqual(violations,[],`retired product/source strings remain:\n${violations.join('\n')}`);

test('AizanoiOS adaptive public-platform source contract', () => {
  assert.ok(true);
});
