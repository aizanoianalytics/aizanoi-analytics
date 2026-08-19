import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(path, 'utf8');
const files = [
  'frontend/js/os-state.js','frontend/js/os-platform.js','frontend/js/os-platform-runtime.js','frontend/js/os-distribution-loader.js','frontend/js/os-archive.js','frontend/js/os-workbench.js','frontend/js/os-workbench-archive.js','frontend/js/os-workbench-readers.js','frontend/js/os-workbench-data.js','frontend/js/os-workbench-shell.js','frontend/js/terminal.js','frontend/service-worker.js',
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  assert.equal(result.status, 0, `${file} syntax error: ${result.stderr || result.stdout}`);
}

const state = read('frontend/js/os-state.js');
for (const app of ['archive','notes','data-lab','source-reader','artifact-viewer','monitor']) {
  assert.match(state, new RegExp(`id:'${app.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`), `${app} missing from app registry`);
}
assert.match(state, /acceptedFileTypes|accepts:/, 'app capability/file metadata missing');
assert.doesNotMatch(state, /id:'market'|route:'\/market\/'/i, 'removed Markets product must not return');
assert.match(state, /os-platform\.js/, 'distribution bootstrap bridge missing from state bootstrap');
assert.match(state, /os-archive\.js/, 'archive bootstrap fallback missing');

const platformBootstrap = read('frontend/js/os-platform.js');
assert.match(platformBootstrap, /os-distribution-loader\.js/, 'lazy distribution loader bridge missing');
assert.doesNotMatch(platformBootstrap, /indexedDB\.open|navigator\.serviceWorker\.register/, 'initial platform bootstrap must remain lightweight');

const loader = read('frontend/js/os-distribution-loader.js');
assert.match(loader, /AIZANOI_DISTRIBUTION/, 'distribution loader contract missing');
assert.match(loader, /ensureReady/, 'on-demand workstation readiness contract missing');
assert.match(loader, /os-platform-runtime\.js/, 'lazy platform runtime missing from loader');
assert.match(loader, /WORKBENCH_IDS/, 'workbench app lazy routing missing');

const platform = read('frontend/js/os-platform-runtime.js');
assert.match(platform, /AIZANOI_PLATFORM/, 'platform API missing');
assert.match(platform, /registerCapability/, 'capability registry missing');
assert.match(platform, /registerCommandProvider/, 'context command provider missing');
assert.match(platform, /navigator\.serviceWorker\.register/, 'installable service worker registration missing');
assert.match(platform, /beforeinstallprompt/, 'PWA install handoff missing');

const archive = read('frontend/js/os-archive.js');
const workbenchFiles = ['frontend/js/os-workbench.js','frontend/js/os-workbench-archive.js','frontend/js/os-workbench-readers.js','frontend/js/os-workbench-data.js','frontend/js/os-workbench-shell.js'];
const workbench = workbenchFiles.map(read).join('\n');
assert.match(archive, /indexedDB\.open\(DB_NAME/, 'Field Archive must use IndexedDB');
assert.match(archive, /Notes','Sources','Screenshots','Datasets','Exports','Uploads/, 'archive collections missing');
assert.match(archive, /showDirectoryPicker/, 'local folder import capability missing');
for (const pattern of [/data-archive-drop/,/QUICK LOOK|Quick Look/,/Send to Field Notes/,/DATA LAB|Data Lab/,/SOURCE READER|Source Reader/,/ARTIFACT VIEWER|Artifact Viewer/,/Workspace Monitor/,/LOCAL ONLY|stays in this browser|Never sent to AI/i]) assert.match(workbench,pattern,`workstation contract missing: ${pattern}`);
assert.doesNotMatch(workbench, /data-action="ai"|data-notes-action="ai"|data-source-action="ai"|data-lab-action="ai"/, 'workstation must not expose research-to-AI actions');
assert.match(workbench, /Local files, notes and datasets are not sent to third-party AI services/, 'local research egress guard missing');
assert.doesNotMatch(workbench, /exec\(|spawn\(|child_process|\/bin\/|sudo\s/i, 'browser workbench must not gain arbitrary system execution');

const terminal = read('frontend/js/terminal.js');
assert.match(terminal, /browser-only virtual shell/i, 'terminal must disclose local-only runtime');
assert.match(terminal, /TERM_VFS/, 'terminal virtual filesystem missing');
assert.doesNotMatch(terminal, /fetch\s*\(|\/api\/terminal\/exec|WebSocket|XMLHttpRequest/, 'terminal must not depend on a server');

const css = ['frontend/css/os-distribution.css','frontend/css/os-distribution-panels.css','frontend/css/os-workbench-archive.css','frontend/css/os-workbench-interactions.css','frontend/css/os-workbench-research.css','frontend/css/os-distribution-polish.css'].map(read).join('\n');
for (const selector of ['az-archive-shell','az-lab-shell','az-reader-shell','az-artifact-shell','az-notes-shell','az-monitor-shell','az-quicklook','az-global-drop']) assert.match(css,new RegExp(selector),`${selector} styling missing`);
assert.match(css, /@media\s*\(max-width:\s*700px\)/, 'mobile workstation redesign missing');
assert.match(css, /prefers-reduced-motion/, 'reduced-motion handling missing');

const manifest = JSON.parse(read('frontend/manifest.webmanifest'));
assert.equal(manifest.display, 'standalone');
assert.match(manifest.name, /Aizanoi Field System/);
assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2, 'PWA shortcuts missing');

const sw = read('frontend/service-worker.js');
assert.match(sw, /\/api\//, 'service worker API bypass missing');
assert.match(sw, /request\.mode === 'navigate'/, 'navigation strategy missing');
assert.match(sw, /caches\.open/, 'offline shell cache missing');

console.log('Aizanoi distribution/workstation local-only security contract passed');
