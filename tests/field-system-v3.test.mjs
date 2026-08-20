import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const frontend = path.join(root, 'frontend');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const index = read('frontend/index.html');
const manifest = read('frontend/manifest.webmanifest');
const sw = read('frontend/service-worker.js');
const tokens = read('frontend/styles/tokens.css');
const shell = read('frontend/styles/shell.css');
const components = read('frontend/styles/components.css');
const apps = read('frontend/styles/apps.css');
const registrySource = read('frontend/js/v3/registry.js');
const terminalSource = read('frontend/js/v3/apps/terminal.js');
const monitorSource = read('frontend/js/v3/apps/monitor.js');
const worldBridge = read('frontend/ancient-world/engine/city-experience.js');

assert.ok(Buffer.byteLength(index) < 16 * 1024, `root HTML is too large: ${Buffer.byteLength(index)} bytes`);
assert.equal((index.match(/<script\b/gi) || []).length, 1, 'root must load exactly one module script');
assert.match(index, /<script\s+type="module"\s+src="\/js\/v3\/main\.js"><\/script>/, 'root must boot the v3 module entry');
assert.equal((index.match(/<link\s+rel="stylesheet"/gi) || []).length, 4, 'root must load exactly four initial stylesheets');
assert.doesNotMatch(index, /<style\b/i, 'root must not contain inline style blocks');
assert.doesNotMatch(index, /transform="translate\(50%,\s*100%\)"/i, 'invalid legacy SVG transform returned');
assert.match(index, /Aizanoi Field System — Digital Archaeology Workspace/);

for (const [name, source] of Object.entries({ index, manifest, registrySource })) {
  assert.doesNotMatch(source, /Aizanoi AI|HR AI|\/hr-analytics\/|Groq|Gemini|chatbot/i, `${name} still exposes retired AI product strings`);
}

assert.equal(exists('frontend/css'), false, 'legacy global CSS directory must stay retired');
for (const legacy of [
  'frontend/js/chat.js','frontend/js/os-state.js','frontend/js/os-shell.js','frontend/js/os-v2.js',
  'frontend/js/os-platform.js','frontend/js/os-product-polish.js','frontend/js/os-workbench.js','frontend/js/terminal.js',
  'frontend/assets/icons/aizanoi-ai.svg','frontend/pages/projects.json','frontend/pages/changelog.json','frontend/icons'
]) {
  assert.equal(exists(legacy), false, `retired compatibility surface returned: ${legacy}`);
}

assert.match(tokens, /@layer\s+reset,\s*tokens,\s*base,\s*shell,\s*components,\s*apps,\s*utilities/);
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

const registry = await import(pathToFileURL(path.join(frontend, 'js/v3/registry.js')).href + `?t=${Date.now()}`);
assert.equal(registry.APPS.length, 11, 'Field System catalog must contain 11 canonical apps');
assert.deepEqual(registry.WORLDS.map((world) => world.id), ['aizanoi','rome','athens']);
assert.equal(registry.APPS.some((app) => /ai|chatbot/i.test(`${app.id} ${app.label}`)), false, 'retired AI app returned to registry');
assert.equal(new Set(registry.APPS.map((app) => app.id)).size, registry.APPS.length, 'app ids must be unique');

assert.match(manifest, /"name"\s*:\s*"Aizanoi Field System"/);
assert.match(manifest, /"name"\s*:\s*"Historical Worlds"/);
assert.doesNotMatch(manifest, /hr-analytics|Aizanoi AI|HR AI/i);
assert.match(sw, /aizanoi-field-shell-v3\.0\.0/);
assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/, 'service worker must explicitly ignore API routes');
assert.doesNotMatch(sw, /os-(?:platform|unified|product-polish|v2)\.js/);

for (const primitive of ['fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(terminalSource.includes(primitive), false, `Field Terminal contains network primitive ${primitive}`);
}
assert.match(terminalSource, /worlds/);
assert.match(terminalSource, /evidence/);
assert.doesNotMatch(terminalSource, /hostname|process list|Windows XP|C:\\\\Aizanoi/i);
assert.match(monitorSource, /navigator\.storage|storageEstimate/);
assert.doesNotMatch(monitorSource, /fake CPU|system load|server health/i);

assert.match(worldBridge, /aizanoi-field-session-v1/);
assert.match(worldBridge, /aw-field-system-return/);
assert.match(worldBridge, /location\.href='\/\?app=worlds&from=historical-world'/);

assert.equal(exists('frontend/.well-known/security.txt'), true, 'security.txt must be present in the static tree');

console.log(`Field System v3 source contract passed (${importantCount} !important declarations in canonical v3 styles)`);
