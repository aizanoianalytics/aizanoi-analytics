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
const base = read('frontend/styles/base.css');
const shell = read('frontend/styles/shell.css');
const components = read('frontend/styles/components.css');
const apps = read('frontend/styles/apps.css');
const main = read('frontend/js/v3/main.js');
const shellJs = read('frontend/js/v3/shell.js');
const store = read('frontend/js/v3/store.js');
const registrySource = read('frontend/js/v3/registry.js');
const terminalSource = read('frontend/js/v3/apps/terminal.js');
const monitorSource = read('frontend/js/v3/apps/monitor.js');
const manifest = read('frontend/manifest.webmanifest');
const sw = read('frontend/service-worker.js');
const worldBridge = read('frontend/ancient-world/engine/city-experience.js');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');

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
assert.match(index, /Aizanoi Field System/);
assert.match(index, /\/styles\/tokens\.css/);
assert.match(index, /\/styles\/base\.css/);
assert.match(index, /\/styles\/shell\.css/);
assert.match(index, /\/styles\/components\.css/);
assert.doesNotMatch(index, /<style\b|style="|<script(?![^>]*src=)|onclick=|onmousedown=|onmouseup=/i);
assert.doesNotMatch(index, /Aizanoi AI|HR AI|chatbot|Windows XP|Luna/i);
assert.match(index, /type="module" src="\/js\/v3\/main\.js"/);

for (const source of [main,shellJs,store,registrySource]) {
  assert.doesNotMatch(source, /os-(?:platform|unified|product-polish|v2)|os-workbench|chat\.js/i);
}

const v3ModuleFiles = walk(path.join(frontend, 'js/v3')).filter((file) => file.endsWith('.js'));
const inlineMarkupDebt = [];
for (const file of v3ModuleFiles) {
  const source = readFileSync(file, 'utf8');
  if (/style\s*=\s*["']|\son(?:click|mousedown|mouseup|touchstart|touchend)\s*=/i.test(source)) {
    inlineMarkupDebt.push(path.relative(root, file));
  }
}
assert.deepEqual(inlineMarkupDebt, [], `v3 modules reintroduced inline style/event-handler markup:\n${inlineMarkupDebt.join('\n')}`);

for (const css of [tokens, shell, components, apps]) {
  const vars = [...css.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((match) => match[1]);
  assert.equal(vars.filter((name) => !name.startsWith('az-')).length, 0, 'v3 styles introduced a non-canonical CSS token namespace');
}
const importantCount = [tokens, shell, components, apps].reduce((sum, css) => sum + (css.match(/!important/g) || []).length, 0);
assert.ok(importantCount < 30, `v3 CSS important count is ${importantCount}; must stay below 30`);
assert.match(tokens, /--az-paper:\s*#e9e1d1/i);
assert.match(tokens, /--az-brass:\s*#c4a36b/i);
assert.match(tokens, /--az-teal:\s*#73aaa4/i);
assert.match(tokens, /--az-control-touch:\s*44px/i);

for (const [name, css] of Object.entries({shell,components,apps})) {
  const tiny=[...css.matchAll(/font(?:-size)?\s*:\s*([0-9.]+)px/gi)].map((m)=>Number(m[1])).filter((n)=>n>0&&n<11);
  assert.deepEqual(tiny,[],`${name} contains functional typography below 11px: ${tiny.join(', ')}`);
}

const registry = await import(pathToFileURL(path.join(frontend, 'js/v3/registry.js')).href + `?t=${Date.now()}`);
assert.equal(registry.APPS.length, 11, 'Field System catalog must contain 11 canonical apps');
assert.deepEqual(registry.WORLDS.map((world) => world.id), ['aizanoi','rome','athens']);
assert.equal(registry.APPS.some((app) => /\bAI\b|chatbot/i.test(`${app.id} ${app.label}`)), false, 'retired AI app returned to registry');
assert.equal(new Set(registry.APPS.map((app) => app.id)).size, registry.APPS.length, 'app ids must be unique');

assert.match(manifest, /"name"\s*:\s*"Aizanoi Field System"/);
assert.match(manifest, /"name"\s*:\s*"Historical Worlds"/);
assert.doesNotMatch(manifest, /hr-analytics|Aizanoi AI|HR AI/i);
assert.match(sw, /aizanoi-field-shell-v3\.0\.2/);
assert.match(sw, /precacheShell\(\)\.then\(\(\) => self\.skipWaiting\(\)\)/, 'service worker must activate only after a complete precache');
assert.match(sw, /networkFirstStatic/, 'mutable static assets must prefer the revalidated network response');
assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/, 'service worker must explicitly ignore API routes');
assert.doesNotMatch(sw, /os-(?:platform|unified|product-polish|v2)\.js/);

for (const primitive of ['fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(terminalSource.includes(primitive), false, `Field Terminal contains network primitive ${primitive}`);
}
assert.match(terminalSource, /worlds/);
assert.match(terminalSource, /evidence/);
assert.doesNotMatch(terminalSource, /Windows XP|C:\\\\Aizanoi/i);
assert.match(monitorSource, /navigator\.storage|storageEstimate/);
assert.doesNotMatch(monitorSource, /fake CPU|system load|server health/i);

assert.match(worldBridge, /aizanoi-field-session-v1/);
assert.match(worldBridge, /aw-field-system-return/);
assert.match(worldBridge, /location\.href='\/\?app=worlds&from=historical-world'/);
assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
assert.doesNotMatch(nginx, /proxy_pass|127\.0\.0\.1:3001/);

const canonicalFiles = walk(frontend).filter((file) => /\.(?:html|css|js|json|webmanifest|svg|xml|txt)$/i.test(file));
const retired = [
  /Aizanoi AI/i,
  /HR AI/i,
  /Windows XP/i,
  /Luna theme/i,
  /chatbot/i
];
const allowedHistoricalMentions = new Set([
  path.join(frontend,'404.html'),
  path.join(frontend,'500.html'),
  path.join(frontend,'503.html')
]);
const violations=[];
for (const file of canonicalFiles) {
  if (allowedHistoricalMentions.has(file)) continue;
  const source=readFileSync(file,'utf8');
  for (const pattern of retired) {
    if (pattern.test(source)) violations.push(`${path.relative(root,file)} -> ${pattern}`);
  }
}
assert.deepEqual(violations,[],`retired product/source strings remain:\n${violations.join('\n')}`);

test('Field System v3 canonical source contract', () => {
  assert.ok(true);
});
