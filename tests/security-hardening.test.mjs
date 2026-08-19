import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const chat = read('frontend/js/chat.js');
const terminal = read('frontend/js/terminal.js');
const platform = read('frontend/js/os-platform-runtime.js');
const workbench = read('frontend/js/os-workbench.js');
const archive = read('frontend/js/os-workbench-archive.js');
const readers = read('frontend/js/os-workbench-readers.js');
const data = read('frontend/js/os-workbench-data.js');
const shell = read('frontend/js/os-workbench-shell.js');
const sanitizer = read('frontend/js/os-legacy-sanitizer.js');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');

test('browser chat cannot make external or /api/chat requests', () => {
  assert.doesNotMatch(chat, /fetch\s*\(/);
  assert.doesNotMatch(chat, /CHAT_API_URL/);
  assert.match(chat, /AI is disabled for security/);
});

test('terminal cannot issue network or server commands', () => {
  assert.match(terminal, /browser-only virtual shell/i);
  assert.match(terminal, /TERM_VFS/);
  assert.doesNotMatch(terminal, /fetch\s*\(|XMLHttpRequest|WebSocket|\/api\/terminal\/exec/);
  assert.doesNotMatch(terminal, /child_process|\bexec\s*\(|\bspawn\s*\(/);
});

test('workspace monitor is local-only and does not probe a backend', () => {
  assert.match(shell, /RUNTIME/);
  assert.match(shell, />STATIC</);
  assert.doesNotMatch(shell, /\/api\/health|fetch\s*\(/);
});

test('platform notifications escape dynamic body content before legacy innerHTML', () => {
  assert.match(platform, /body:escapeHtml\(safeBody\)/);
  assert.match(platform, /safeBody = String\(body/);
});

test('workbench has no local research to AI egress actions', () => {
  assert.match(workbench, /function askAI\(\)/);
  assert.match(workbench, /Local files, notes and datasets are not sent/);
  assert.doesNotMatch(archive, /data-action="ai"|data-notes-action="ai"/);
  assert.doesNotMatch(readers, /data-source-action="ai"/);
  assert.doesNotMatch(data, /data-lab-action="ai"/);
});

test('CSV exports neutralize spreadsheet formula prefixes', () => {
  assert.match(data, /function safeSpreadsheetCell/);
  assert.match(data, /\^\[=\+\\-@\]/);
});

test('security UI hides AI entrypoints and documents local archive behavior', () => {
  assert.match(sanitizer, /AIZANOI_AI_DISABLED = true/);
  assert.match(sanitizer, /Local research archive/);
  assert.match(sanitizer, /AI disabled/);
  assert.match(sanitizer, /\[data-app="chatbot"\]/);
});

test('reverse proxy exposes no application backend', () => {
  assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
  assert.doesNotMatch(nginx, /proxy_pass|127\.0\.0\.1:3001/);
});
