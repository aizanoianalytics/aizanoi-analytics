import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const terminal = read('frontend/js/terminal.js');
const monitor = read('frontend/js/os-workbench-shell.js');
const nginx = read('infra/nginx/aizanoianalytics.com.conf.example');
const architecture = read('ARCHITECTURE.md');

test('Aizanoi production web runtime has no application backend', () => {
  assert.equal(existsSync('backend'), false, 'backend directory must remain removed');
  assert.equal(existsSync('infra/systemd/aizanoi-backend.service.example'), false, 'obsolete backend systemd unit returned');
  assert.doesNotMatch(nginx, /proxy_pass|127\.0\.0\.1:3001/);
  assert.doesNotMatch(architecture, /Node backend|\/api\/terminal\/exec/);
});

test('terminal is a browser-only virtual shell', () => {
  assert.match(terminal, /BROWSER-ONLY VIRTUAL SHELL/);
  assert.match(terminal, /TERM_VFS/);
  assert.match(terminal, /executeVirtualCommand/);
  assert.doesNotMatch(terminal, /fetch\s*\(|XMLHttpRequest|WebSocket|\/api\/terminal\/exec/);
  assert.doesNotMatch(terminal, /child_process|\bexec\s*\(|\bspawn\s*\(/);
});

test('workspace monitor has no backend health dependency', () => {
  assert.match(monitor, /RUNTIME/);
  assert.match(monitor, />STATIC</);
  assert.doesNotMatch(monitor, /\/api\/health|fetch\s*\(/);
});

test('nginx fails closed for historical API paths', () => {
  assert.match(nginx, /location = \/api\/chat[\s\S]*return 410;/);
  assert.match(nginx, /location \^~ \/api\/[\s\S]*return 404;/);
});
