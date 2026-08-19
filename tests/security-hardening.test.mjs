import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const chat = read('frontend/js/chat.js');
const platform = read('frontend/js/os-platform-runtime.js');
const workbench = read('frontend/js/os-workbench.js');
const archive = read('frontend/js/os-workbench-archive.js');
const readers = read('frontend/js/os-workbench-readers.js');
const data = read('frontend/js/os-workbench-data.js');
const sanitizer = read('frontend/js/os-legacy-sanitizer.js');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const systemd = read('infra/systemd/aizanoi-backend.service.example');

test('browser chat cannot make external or /api/chat requests', () => {
  assert.doesNotMatch(chat, /fetch\s*\(/);
  assert.doesNotMatch(chat, /CHAT_API_URL/);
  assert.match(chat, /AI is disabled for security/);
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

test('reverse proxy blocks chat and unknown API paths', () => {
  assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
  assert.match(nginx, /client_max_body_size 128k/);
});

test('systemd example applies a least-privilege sandbox', () => {
  for (const invariant of [
    'NoNewPrivileges=true',
    'ProtectSystem=strict',
    'ProtectHome=true',
    'PrivateDevices=true',
    'CapabilityBoundingSet=',
    'ReadWritePaths=/var/lib/aizanoi'
  ]) assert.match(systemd, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
